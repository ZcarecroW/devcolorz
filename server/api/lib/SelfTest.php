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

        /*
         * The single most common reason a message that "sent" never arrives.
         *
         * `mail()` returning true means the local transport accepted it. What
         * decides whether it is delivered is whether the receiving server
         * believes this host is allowed to send for the From domain, and that
         * is an SPF record. A subdomain does not inherit its parent's — mail
         * from `noreply@app.example.com` is checked against
         * `app.example.com`, which usually has no record at all, and modern
         * receivers drop unauthenticated mail without a bounce. There is
         * nothing in the application that can detect this after the fact,
         * which is exactly why it belongs in the checks.
         */
        $envelope = Mail::envelope();
        $fromDomain = strtolower(substr(strrchr($envelope['from'], '@') ?: '@', 1));
        $spf = self::hasSpf($fromDomain);
        $checks[] = [
            'id'       => 'mail_spf',
            'label'    => 'Sender domain is authorized to send',
            'required' => false,
            'ok'       => $spf !== false,
            'detail'   => match ($spf) {
                true  => $fromDomain . ' publishes an SPF record, so a receiving server can check that this host is allowed to send for it.',
                false => $fromDomain . ' publishes no SPF record. Mail from this address will be accepted here and quietly dropped by many receivers — this is the usual reason a test "succeeds" and nothing arrives. Either publish SPF for that name, or set the From address in Settings to a mailbox on a domain that already has one.',
                default => 'Could not look up DNS for ' . $fromDomain . ', so this could not be checked. Confirm by hand that the domain publishes an SPF record.',
            },
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
    public static function exposure(?float $deadline = null): array
    {
        // `baseUrl()` rather than the request host: this also runs from cron,
        // and a CLI invocation has no HTTP_HOST at all — it would have probed
        // http://localhost and recorded a meaningless verdict.
        $base = Http::baseUrl();
        $dbFile = Config::string('db_file');

        $targets = [
            'config'   => ['/config.php', 'Configuration file'],
            'database' => $dbFile !== '' ? ['/storage/' . $dbFile, 'Database file'] : null,
            // Not 'wal': `environment()` already uses that id for the journal
            // mode check, and the console renders both lists as one keyed
            // `v-for`, where a repeated key lets Vue reuse the wrong element.
            'wal_file' => $dbFile !== '' ? ['/storage/' . $dbFile . '-wal', 'Database write-ahead log'] : null,
            'storage'  => ['/storage/', 'Storage directory listing'],
            'sessions' => ['/storage/sessions/', 'Session directory'],
            'log'      => ['/storage/php-error.log', 'Error log'],
        ];

        /*
         * Does this server answer 200 for things that do not exist?
         *
         * A single-page app usually ships a catch-all that returns index.html
         * for any unmatched path. Under one of those, asking for the database
         * returns HTTP 200 and a page of HTML — and reading that as "the
         * database is publicly downloadable" raises the loudest alarm in the
         * console for a file nobody can actually get. When the control probe
         * comes back 200 the probes below cannot tell the two apart, so they
         * report inconclusive instead of crying wolf.
         */
        $catchAll = self::probe($base . '/storage/does-not-exist-' . bin2hex(random_bytes(8))) === 200;

        $results = [];
        foreach ($targets as $id => $target) {
            if ($target === null) {
                continue;
            }
            [$path, $label] = $target;
            // Out of time reports the remaining targets as *unchecked* rather
            // than dropping them. Dropping them would leave a shorter list in
            // which nothing failed, and `refreshExposure` would read that as a
            // clean bill of health for probes that never ran.
            $outOfTime = $deadline !== null && microtime(true) > $deadline;
            $status = $outOfTime ? 0 : self::probe($base . $path);
            // A 000 means the loopback request itself failed, and a server that
            // answers 200 for everything tells us nothing either. Both are
            // reported as inconclusive rather than as a pass or an alarm.
            if ($catchAll && $status === 200) {
                $status = 0;
            }
            $ok = $status !== 200;
            $results[] = [
                'id'       => $id,
                'label'    => $label . ' is not web-reachable',
                'required' => true,
                'ok'       => $ok,
                'detail' => $status === 0
                    ? ($catchAll
                        ? 'This server answers HTTP 200 for paths that do not exist, so asking it for '
                            . $path . ' proves nothing either way. Open that URL in a browser: you should see your app, not the file.'
                        : 'Could not complete a loopback request to ' . $path . '. Check this URL manually in a browser — it must not return the file.')
                    : ($ok
                        ? 'Returns HTTP ' . $status . ' as it should.'
                        : 'SERVED WITH HTTP 200. This file is publicly downloadable. Fix the server configuration before using this installation.'),
            ];
        }
        return $results;
    }

    /**
     * Whether anything sensitive is reachable — surfaced as an admin alarm.
     *
     * Answers from the stored result of the last real probe. The probe makes
     * six serial loopback HTTP requests, and this is called from `/meta`, the
     * first thing the SPA asks for: every admin page load paid for six
     * round-trips before anything rendered, and on a host whose loopback is
     * firewalled it paid the full connect timeout on each of them — six times
     * three seconds, on every reload.
     *
     * Tri-state on purpose. A failed probe is not a passed one, and reporting
     * "not exposed" for an installation that was never actually checked is the
     * more dangerous of the two wrong answers.
     *
     * @return array{exposed: bool|null, checkedAt: int}
     */
    public static function exposureStatus(): array
    {
        $stored = Settings::get('selftest.exposure');
        if (is_array($stored) && array_key_exists('exposed', $stored)) {
            return [
                'exposed'   => is_bool($stored['exposed']) ? $stored['exposed'] : null,
                'checkedAt' => (int) ($stored['checkedAt'] ?? 0),
            ];
        }
        return ['exposed' => null, 'checkedAt' => 0];
    }

    /**
     * Store the verdict from a set of exposure checks.
     *
     * Takes the checks rather than running them, so a caller that already has
     * them does not pay for a second round of loopback requests.
     *
     * @param list<array{id: string, label: string, ok: bool, required: bool, detail: string}>|null $checks
     * @return array{exposed: bool|null, checkedAt: int}
     */
    public static function refreshExposure(?array $checks = null): array
    {
        $exposed = false;
        $conclusive = true;
        foreach ($checks ?? self::exposure() as $check) {
            if (str_contains($check['detail'], 'Could not complete a loopback request')) {
                $conclusive = false;
                continue;
            }
            if (!$check['ok']) {
                $exposed = true;
            }
        }
        $status = [
            'exposed'   => $conclusive ? $exposed : ($exposed ? true : null),
            'checkedAt' => time(),
        ];
        Settings::set('selftest.exposure', $status);
        return $status;
    }

    /** True when anything sensitive is known to be reachable. */
    public static function storageReachable(): bool
    {
        return self::exposureStatus()['exposed'] === true;
    }

    /**
     * Does this domain publish an SPF record?
     *
     * Null when DNS could not be consulted at all, which is a different answer
     * from "no" and is reported as such.
     */
    private static function hasSpf(string $domain): ?bool
    {
        if ($domain === '' || !function_exists('dns_get_record')) {
            return null;
        }
        $records = @dns_get_record($domain, DNS_TXT);
        if (!is_array($records)) {
            return null;
        }
        foreach ($records as $record) {
            $txt = (string) ($record['txt'] ?? '');
            if (stripos($txt, 'v=spf1') === 0) {
                return true;
            }
        }
        return false;
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
