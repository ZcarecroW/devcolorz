<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Environment and security self-checks.
 *
 * The important one is `storageReachable()`. Every layer of protection around
 * the database is a configuration file that a host can ignore — `.htaccess`
 * needs `AllowOverride`, the `.ht` filename prefix needs the stock Apache rule,
 * and neither exists on nginx. The only honest way to know whether the database
 * is exposed is to ask the web server for it over the network and look at what
 * comes back. The installer refuses to finish if anything answers 200.
 */
final class SelfTest
{
    /** @var array<string, bool>|null */
    private static ?array $cache = null;

    /**
     * Environment checks.
     *
     * `required` separates "this cannot work" from "this is a bad idea".
     * Blocking installation on everything red sounds prudent and is not: TLS
     * terminated at a reverse proxy leaves `$_SERVER['HTTPS']` unset, so a
     * hard HTTPS gate makes a perfectly ordinary deployment impossible to
     * install. Required checks block; the rest are loud warnings.
     *
     * @return list<array{id: string, label: string, ok: bool, required: bool, detail: string}>
     */
    public static function environment(): array
    {
        $checks = [];

        $phpOk = PHP_VERSION_ID >= 80200;
        $checks[] = [
            'id'     => 'php',
            'label'  => 'PHP 8.2 or newer',
            'required' => true,
            'ok'     => $phpOk,
            'detail' => 'Running PHP ' . PHP_VERSION . '.',
        ];

        $pdo = extension_loaded('pdo_sqlite');
        $checks[] = [
            'id'     => 'pdo_sqlite',
            'label'  => 'SQLite support',
            'required' => true,
            'ok'     => $pdo,
            'detail' => $pdo
                ? 'pdo_sqlite is loaded.'
                : 'The pdo_sqlite extension is missing. DevColorz stores everything in SQLite and cannot run without it.',
        ];

        $sqliteVersion = $pdo && class_exists('SQLite3') ? \SQLite3::version()['versionString'] : '';
        $sqliteOk = $sqliteVersion !== '' && version_compare($sqliteVersion, '3.24.0', '>=');
        $checks[] = [
            'id'     => 'sqlite_version',
            'label'  => 'SQLite 3.24 or newer',
            'required' => true,
            'ok'     => $sqliteOk,
            'detail' => $sqliteVersion !== ''
                ? 'SQLite ' . $sqliteVersion . '. '
                    . (version_compare($sqliteVersion, '3.37.0', '>=')
                        ? 'STRICT tables are available and will be used.'
                        : 'Below 3.37, so tables are created without STRICT typing.')
                : 'Could not determine the SQLite version.',
        ];

        $writable = is_writable(Paths::root());
        $checks[] = [
            'id'     => 'writable',
            'label'  => 'Writable document root',
            'required' => true,
            'ok'     => $writable,
            'detail' => $writable
                ? 'The application can create its storage directory and configuration file.'
                : 'PHP cannot write to ' . Paths::root() . '. Grant write permission and reload.',
        ];

        $argon = Security::hasArgon2id();
        $checks[] = [
            'id'     => 'argon2id',
            'label'  => 'Argon2id password hashing',
            'required' => false,
            'ok'     => true,
            'detail' => $argon
                ? 'Argon2id is available and will be used with a 19 MiB memory cost.'
                : 'Argon2id is unavailable on this build, so bcrypt at cost 12 will be used instead. That is still a sound choice.',
        ];

        $mail = function_exists('mail');
        $disabled = (string) ini_get('disable_functions');
        $checks[] = [
            'id'     => 'mail',
            'label'  => 'Outgoing email',
            'required' => false,
            'ok'     => $mail,
            'detail' => $mail
                ? 'mail() is available. Delivery still depends on this host having a working mail transport agent.'
                : 'mail() is disabled' . ($disabled !== '' ? ' (disable_functions: ' . $disabled . ')' : '')
                    . '. Account confirmation and password resets will not work.',
        ];

        $https = ($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off';
        $checks[] = [
            'id'     => 'https',
            'label'  => 'HTTPS',
            'required' => false,
            'ok'     => $https,
            'detail' => $https
                ? 'The connection is encrypted, so the session cookie can carry the __Host- prefix.'
                : 'This request arrived over plain HTTP. Session cookies cannot use the __Host- prefix and are not marked Secure. Do not run a real installation this way.',
        ];

        $net = function_exists('curl_init') || (bool) ini_get('allow_url_fopen');
        $checks[] = [
            'id'     => 'network',
            'label'  => 'Outbound HTTP',
            'required' => false,
            'ok'     => $net,
            'detail' => $net
                ? 'The server can reach external services, so hCaptcha verification will work.'
                : 'Neither curl nor allow_url_fopen is available, so hCaptcha cannot be verified server-side.',
        ];

        $wal = self::probeWal();
        $checks[] = [
            'id'     => 'wal',
            'label'  => 'SQLite write-ahead logging',
            'required' => false,
            'ok'     => true,
            'detail' => $wal
                ? 'WAL mode works on this filesystem, so reads do not block writes.'
                : 'WAL mode is unavailable here, which usually means the home directory is NFS-mounted. The database will run in TRUNCATE mode with synchronous=FULL: correct, but slower under concurrent writes.',
        ];

        return $checks;
    }

    /**
     * Create a scratch database and see whether WAL actually takes.
     *
     * `PRAGMA journal_mode=WAL` returns the mode in effect, not the mode you
     * asked for, and over NFS it silently stays on `delete`.
     */
    private static function probeWal(): bool
    {
        $file = Paths::storage() . '/.walprobe-' . bin2hex(random_bytes(4)) . '.sqlite';
        try {
            Paths::ensure();
            $pdo = new \PDO('sqlite:' . $file);
            $mode = (string) $pdo->query('PRAGMA journal_mode=WAL')->fetchColumn();
            unset($pdo);
            return strtolower($mode) === 'wal';
        } catch (\Throwable) {
            return false;
        } finally {
            foreach ([$file, $file . '-wal', $file . '-shm'] as $leftover) {
                if (is_file($leftover)) {
                    @unlink($leftover);
                }
            }
        }
    }

    /**
     * Ask the web server for each sensitive path and report what it returns.
     *
     * Every one of these is required: a publicly downloadable database is not
     * a matter of judgement.
     *
     * @return list<array{id: string, label: string, ok: bool, required: bool, detail: string}>
     */
    public static function exposure(): array
    {
        $base = Http::selfOrigin();
        $dbFile = Config::string('db_file');

        $targets = [
            'config'   => ['/config.php', 'Configuration file'],
            'database' => $dbFile !== '' ? ['/storage/' . $dbFile, 'Database file'] : null,
            'wal'      => $dbFile !== '' ? ['/storage/' . $dbFile . '-wal', 'Database write-ahead log'] : null,
            'storage'  => ['/storage/', 'Storage directory listing'],
            'sessions' => ['/storage/sessions/', 'Session directory'],
            'log'      => ['/storage/php-error.log', 'Error log'],
        ];

        $results = [];
        foreach ($targets as $id => $target) {
            if ($target === null) {
                continue;
            }
            [$path, $label] = $target;
            $status = self::probe($base . $path);
            // A 000 means the loopback request itself failed, which we report
            // as inconclusive rather than pretending it passed.
            $ok = $status !== 200;
            $results[] = [
                'id'       => $id,
                'label'    => $label . ' is not web-reachable',
                'required' => true,
                'ok'       => $ok,
                'detail' => $status === 0
                    ? 'Could not complete a loopback request to ' . $path . '. Check this URL manually in a browser — it must not return the file.'
                    : ($ok
                        ? 'Returns HTTP ' . $status . ' as it should.'
                        : 'SERVED WITH HTTP 200. This file is publicly downloadable. Fix the server configuration before using this installation.'),
            ];
        }
        return $results;
    }

    /** True when anything sensitive is reachable — surfaced as an admin alarm. */
    public static function storageReachable(): bool
    {
        if (isset(self::$cache['exposed'])) {
            return self::$cache['exposed'];
        }
        $exposed = false;
        foreach (self::exposure() as $check) {
            if (!$check['ok']) {
                $exposed = true;
                break;
            }
        }
        self::$cache = ['exposed' => $exposed];
        return $exposed;
    }

    /** HTTP status of a URL, or 0 if the request could not be made. */
    private static function probe(string $url): int
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            if ($ch !== false) {
                curl_setopt_array($ch, [
                    CURLOPT_NOBODY         => true,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT        => 4,
                    CURLOPT_CONNECTTIMEOUT => 3,
                    CURLOPT_SSL_VERIFYPEER => false,
                    CURLOPT_SSL_VERIFYHOST => 0,
                    CURLOPT_FOLLOWLOCATION => false,
                ]);
                curl_exec($ch);
                $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
                // No curl_close(): the handle is an object that frees itself,
                // and the function is deprecated as of PHP 8.5.
                return $status;
            }
        }

        if ((bool) ini_get('allow_url_fopen')) {
            $context = stream_context_create([
                'http' => ['method' => 'HEAD', 'timeout' => 4, 'ignore_errors' => true],
                'ssl'  => ['verify_peer' => false, 'verify_peer_name' => false],
            ]);
            $headers = @get_headers($url, false, $context);
            if (is_array($headers) && isset($headers[0])) {
                if (preg_match('/\s(\d{3})\s/', $headers[0], $m)) {
                    return (int) $m[1];
                }
            }
        }
        return 0;
    }
}
