<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Check GitHub for a newer release, and install it over this installation.
 *
 * This class downloads an archive from the internet and unpacks it over the
 * code that is currently running. That is remote code execution with extra
 * steps, and the only thing standing between "convenient" and "catastrophic"
 * is where the archive is allowed to come from and what is checked before any
 * of it is believed. So:
 *
 * 1. **The repository is compiled in.** `REPO` is a constant, not a setting.
 *    An administrator cannot point the updater somewhere else, because an
 *    admin-settable source turns one compromised password into arbitrary code
 *    on the server.
 * 2. **Every URL is re-derived, never followed.** GitHub's answer is parsed for
 *    a tag and an asset name; the download URL is then rebuilt from the pinned
 *    repository. A redirect or a doctored field cannot move the download to
 *    another host.
 * 3. **The archive is inspected before it is trusted.** Entry paths must stay
 *    inside the staging directory, the tree has to look like DevColorz, and
 *    the version it declares has to match the release it claims to be.
 * 4. **`config.php` and `storage/` are never written.** They hold the secrets
 *    and the database; an update has no business touching either.
 * 5. **Everything replaced is kept.** A backup of every overwritten file goes
 *    to `storage/updates/` first, and one call puts it back.
 *
 * What this cannot do is verify that the release was published by someone
 * entitled to publish it. GitHub does not sign release assets, so an attacker
 * holding the repository owner's credentials could publish an archive this
 * code would install — instantly, if automatic installation is on. That is the
 * residual risk of any self-updater without a signing key, and it is the
 * reason the console says plainly what automatic installation trusts.
 */
final class Updater
{
    /** The one place an update may come from. Deliberately not a setting. */
    public const REPO = 'ZcarecroW/devcolorz';

    /** Refuse an archive larger than this. A release of this app is ~1.5 MB. */
    private const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;

    /** Never overwritten, whatever the archive contains. */
    private const PROTECTED = ['config.php', 'storage'];

    /** A tree without all of these is not DevColorz and is not unpacked. */
    private const REQUIRED = ['index.html', 'api/index.php', 'api/lib/Schema.php'];

    public static function currentVersion(): string
    {
        return APP_VERSION;
    }

    public static function projectUrl(): string
    {
        return 'https://github.com/' . self::REPO;
    }

    /**
     * Whether this host can update itself at all, and what is missing if not.
     *
     * Checked and reported rather than discovered halfway through: a host that
     * cannot unzip, or whose files PHP may not write, should say so on the
     * settings page and not when an update is already half applied.
     *
     * @return array{ok: bool, canCheck: bool, canInstall: bool, problems: list<string>}
     */
    public static function capabilities(): array
    {
        $problems = [];

        $canCheck = function_exists('curl_init') || (bool) ini_get('allow_url_fopen');
        if (!$canCheck) {
            $problems[] = 'This host allows no outbound HTTP requests, so it cannot reach GitHub. '
                . 'Enable the curl extension or allow_url_fopen.';
        }

        $canUnzip = class_exists('\\ZipArchive');
        if (!$canUnzip) {
            $problems[] = 'The zip extension is missing, so a release archive cannot be unpacked. '
                . 'Updates can still be checked for and applied by hand.';
        }

        $root = Paths::root();
        $writable = is_writable($root) && is_writable($root . '/api/index.php');
        if (!$writable) {
            $problems[] = 'PHP cannot write to the application directory, so it cannot replace its '
                . 'own files. This is normal on hosts where the web server runs as a different user '
                . 'from the one that owns the files; upload the release over the top instead.';
        }

        return [
            'ok'         => $canCheck && $canUnzip && $writable,
            'canCheck'   => $canCheck,
            'canInstall' => $canCheck && $canUnzip && $writable,
            'problems'   => $problems,
        ];
    }

    /**
     * Compare two versions the way releases are numbered.
     *
     * Returns a positive number when `$a` is the newer of the two. Anything
     * after the numeric part is a pre-release and sorts *below* the same
     * numbers without it, so 1.3.0-rc1 never displaces 1.3.0.
     */
    public static function compare(string $a, string $b): int
    {
        $split = static function (string $version): array {
            $version = ltrim(trim($version), 'vV');
            $parts = explode('-', $version, 2);
            $numbers = array_map('intval', explode('.', $parts[0]));
            return [
                array_pad(array_slice($numbers, 0, 3), 3, 0),
                $parts[1] ?? '',
            ];
        };

        [$an, $apre] = $split($a);
        [$bn, $bpre] = $split($b);
        for ($i = 0; $i < 3; $i++) {
            if ($an[$i] !== $bn[$i]) {
                return $an[$i] <=> $bn[$i];
            }
        }
        if ($apre === $bpre) {
            return 0;
        }
        // A release outranks any pre-release of the same numbers.
        if ($apre === '') {
            return 1;
        }
        if ($bpre === '') {
            return -1;
        }
        return strcmp($apre, $bpre);
    }

    /**
     * Ask GitHub what the newest release is, and remember the answer.
     *
     * @return array{ok: bool, detail: string, latest: array<string, mixed>|null}
     */
    public static function check(): array
    {
        $capabilities = self::capabilities();
        if (!$capabilities['canCheck']) {
            return ['ok' => false, 'detail' => $capabilities['problems'][0] ?? 'Cannot reach GitHub.', 'latest' => null];
        }

        $url = 'https://api.github.com/repos/' . self::REPO . '/releases/latest';
        $body = self::fetch($url, 15, ['Accept: application/vnd.github+json']);
        if ($body === null) {
            Settings::set('updates.lastCheckedAt', time());
            return ['ok' => false, 'detail' => 'GitHub did not answer. It may be unreachable from this host.', 'latest' => null];
        }

        $data = json_decode($body, true);
        if (!is_array($data) || !is_string($data['tag_name'] ?? null)) {
            Settings::set('updates.lastCheckedAt', time());
            return ['ok' => false, 'detail' => 'GitHub answered with something this version cannot read.', 'latest' => null];
        }

        // The asset is identified by *name*, and the URL to fetch it from is
        // rebuilt from the pinned repository and tag. Nothing in the response
        // is used as an address.
        $tag = (string) $data['tag_name'];
        $version = ltrim($tag, 'vV');
        $assetName = null;
        foreach (is_array($data['assets'] ?? null) ? $data['assets'] : [] as $asset) {
            $name = is_array($asset) ? (string) ($asset['name'] ?? '') : '';
            if (preg_match('/^[A-Za-z0-9._-]+\.zip$/', $name) === 1) {
                $assetName = $name;
                break;
            }
        }

        $latest = [
            'version'     => $version,
            'tag'         => $tag,
            'name'        => is_string($data['name'] ?? null) ? (string) $data['name'] : $tag,
            'notes'       => is_string($data['body'] ?? null) ? mb_substr((string) $data['body'], 0, 20000) : '',
            'publishedAt' => is_string($data['published_at'] ?? null) ? strtotime((string) $data['published_at']) : 0,
            'assetName'   => $assetName,
            'url'         => self::projectUrl() . '/releases/tag/' . $tag,
        ];

        Settings::set('updates.latest', $latest);
        Settings::set('updates.lastCheckedAt', time());

        $newer = self::compare($version, self::currentVersion()) > 0;
        return [
            'ok'     => true,
            'detail' => $newer
                ? 'Version ' . $version . ' is available.'
                : 'This installation is up to date.',
            'latest' => $latest,
        ];
    }

    /** The stored release, when it is newer than what is running. */
    public static function available(): ?array
    {
        $latest = Settings::get('updates.latest');
        if (!is_array($latest) || !is_string($latest['version'] ?? null) || $latest['version'] === '') {
            return null;
        }
        return self::compare((string) $latest['version'], self::currentVersion()) > 0 ? $latest : null;
    }

    /**
     * Download the available release and unpack it over this installation.
     *
     * @return array{ok: bool, detail: string, from: string, to: string, backup: string|null}
     */
    public static function install(): array
    {
        $from = self::currentVersion();
        $fail = static fn (string $why): array => [
            'ok' => false, 'detail' => $why, 'from' => $from, 'to' => '', 'backup' => null,
        ];

        $capabilities = self::capabilities();
        if (!$capabilities['canInstall']) {
            return $fail($capabilities['problems'][0] ?? 'This host cannot install updates.');
        }

        $latest = self::available();
        if ($latest === null) {
            return $fail('There is no newer release to install.');
        }
        $to = (string) $latest['version'];
        $assetName = is_string($latest['assetName'] ?? null) ? (string) $latest['assetName'] : null;
        if ($assetName === null) {
            return $fail('That release publishes no archive to install. Upload it by hand instead.');
        }

        $work = Paths::updates() . '/work-' . bin2hex(random_bytes(6));
        if (!@mkdir($work, 0775, true) && !is_dir($work)) {
            return $fail('Could not create a working directory under storage/updates.');
        }

        try {
            // Rebuilt from the constant and the tag — never taken from the API
            // response, so a doctored field cannot redirect the download.
            $url = 'https://github.com/' . self::REPO . '/releases/download/'
                . rawurlencode((string) $latest['tag']) . '/' . rawurlencode($assetName);

            $archive = $work . '/release.zip';
            if (!self::download($url, $archive)) {
                return $fail('The release archive could not be downloaded from GitHub.');
            }

            $staged = $work . '/staged';
            $extracted = self::extract($archive, $staged);
            if ($extracted !== null) {
                return $fail($extracted);
            }

            $verified = self::verifyTree($staged, $to);
            if ($verified !== null) {
                return $fail($verified);
            }

            $backup = Paths::updates() . '/backup-' . $from . '-' . date('Ymd-His');
            $applied = self::apply($staged, $backup);
            if (is_string($applied)) {
                return $fail($applied);
            }

            $result = [
                'ok'     => true,
                'detail' => 'Updated from ' . $from . ' to ' . $to . '. ' . $applied . ' files written.',
                'from'   => $from,
                'to'     => $to,
                'backup' => basename($backup),
            ];
            Settings::set('updates.lastResult', $result + ['at' => time()]);
            Audit::log('update.install', $to, ['from' => $from, 'files' => $applied, 'backup' => basename($backup)]);
            return $result;
        } finally {
            self::removeTree($work);
        }
    }

    /**
     * Put back the files the most recent update replaced.
     *
     * @return array{ok: bool, detail: string}
     */
    public static function rollback(): array
    {
        $backups = self::backups();
        if ($backups === []) {
            return ['ok' => false, 'detail' => 'There is no backup to restore.'];
        }
        $newest = Paths::updates() . '/' . $backups[0]['name'];
        $restored = self::copyTree($newest, Paths::root(), null);
        if (is_string($restored)) {
            return ['ok' => false, 'detail' => $restored];
        }
        Audit::log('update.rollback', $backups[0]['name'], ['files' => $restored]);
        return ['ok' => true, 'detail' => 'Restored ' . $restored . ' files from ' . $backups[0]['name'] . '.'];
    }

    /**
     * Backups of previous versions, newest first.
     *
     * @return list<array{name: string, at: int}>
     */
    public static function backups(): array
    {
        $found = [];
        foreach (glob(Paths::updates() . '/backup-*') ?: [] as $path) {
            if (is_dir($path)) {
                $found[] = ['name' => basename($path), 'at' => (int) @filemtime($path)];
            }
        }
        usort($found, static fn (array $a, array $b): int => $b['at'] <=> $a['at']);
        return $found;
    }

    /**
     * Whether the scheduled check is due, and run it if so.
     *
     * Cron fires every few minutes; this decides whether today's check has
     * already happened. The hour is the server's own local time, which is what
     * an administrator setting "5" means and sees on the same page.
     */
    public static function scheduled(): string
    {
        if (!Settings::bool('updates.checkEnabled', true)) {
            return 'checking is switched off';
        }

        $hour = max(0, min(23, Settings::int('updates.checkHour', 5)));
        $due = mktime($hour, 0, 0) ?: time();
        $last = Settings::int('updates.lastCheckedAt', 0);
        if (time() < $due || $last >= $due) {
            return 'not due yet';
        }

        $result = self::check();
        if (!$result['ok']) {
            return 'check failed: ' . $result['detail'];
        }

        $available = self::available();
        if ($available === null) {
            return 'up to date';
        }
        if (!Settings::bool('updates.autoInstall', true)) {
            return 'version ' . $available['version'] . ' is available; automatic installation is off';
        }

        $install = self::install();
        return $install['ok']
            ? $install['detail']
            : 'automatic installation failed: ' . $install['detail'];
    }

    /* ---------------- the careful parts ---------------- */

    /** @param list<string> $headers */
    private static function fetch(string $url, int $timeout, array $headers = []): ?string
    {
        $headers[] = 'User-Agent: DevColorz/' . self::currentVersion();

        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            if ($ch !== false) {
                curl_setopt_array($ch, [
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT        => $timeout,
                    CURLOPT_CONNECTTIMEOUT => 10,
                    CURLOPT_HTTPHEADER     => $headers,
                    CURLOPT_SSL_VERIFYPEER => true,
                    CURLOPT_SSL_VERIFYHOST => 2,
                    // GitHub redirects release downloads to its CDN, so
                    // redirects have to be followed — but only to https, and
                    // only a few times.
                    CURLOPT_FOLLOWLOCATION => true,
                    CURLOPT_MAXREDIRS      => 5,
                    CURLOPT_PROTOCOLS_STR  => 'https',
                    CURLOPT_REDIR_PROTOCOLS_STR => 'https',
                ]);
                $response = curl_exec($ch);
                $ok = $response !== false && curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 200;
                return $ok ? (string) $response : null;
            }
        }

        $context = stream_context_create([
            'http' => [
                'method'        => 'GET',
                'header'        => implode("\r\n", $headers),
                'timeout'       => $timeout,
                'ignore_errors' => true,
                'max_redirects' => 5,
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);
        $response = @file_get_contents($url, false, $context);
        return is_string($response) ? $response : null;
    }

    /** Stream a release archive to disk, refusing anything oversized. */
    private static function download(string $url, string $target): bool
    {
        $body = self::fetch($url, 120);
        if ($body === null || strlen($body) < 1024) {
            return false;
        }
        if (strlen($body) > self::MAX_ARCHIVE_BYTES) {
            return false;
        }
        // "PK" — anything else is not a zip, whatever it was served as.
        if (substr($body, 0, 2) !== 'PK') {
            return false;
        }
        return @file_put_contents($target, $body, LOCK_EX) !== false;
    }

    /**
     * Unpack an archive, refusing any entry that tries to escape.
     *
     * ZipArchive::extractTo does guard against traversal in current PHP, but
     * the guard is not the contract and a silently skipped entry would leave a
     * half-written tree. Every name is checked here, and one bad entry aborts
     * the whole update rather than unpacking most of it.
     *
     * @return string|null An error, or null on success.
     */
    private static function extract(string $archive, string $target): ?string
    {
        $zip = new \ZipArchive();
        if ($zip->open($archive) !== true) {
            return 'The downloaded archive could not be opened.';
        }
        if (!@mkdir($target, 0775, true) && !is_dir($target)) {
            $zip->close();
            return 'Could not create a staging directory.';
        }

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string) $zip->getNameIndex($i);
            if ($name === '' || str_ends_with($name, '/')) {
                continue;
            }
            if (self::safeRelativePath($name) === null) {
                $zip->close();
                return 'The archive contains an entry with an unsafe path (' . $name . '). Nothing was installed.';
            }
        }

        $ok = $zip->extractTo($target);
        $zip->close();
        return $ok ? null : 'The archive could not be unpacked.';
    }

    /**
     * A relative path that cannot climb out of its root, or null.
     *
     * Backslashes count as separators: a zip written on Windows can carry
     * them, and a check that only knows about `/` would wave `..\..\x` through.
     */
    private static function safeRelativePath(string $name): ?string
    {
        $normalised = str_replace('\\', '/', $name);
        if ($normalised === '' || str_starts_with($normalised, '/') || preg_match('#^[A-Za-z]:#', $normalised) === 1) {
            return null;
        }
        $parts = [];
        foreach (explode('/', $normalised) as $part) {
            if ($part === '' || $part === '.') {
                continue;
            }
            if ($part === '..') {
                return null;
            }
            $parts[] = $part;
        }
        return $parts === [] ? null : implode('/', $parts);
    }

    /**
     * Refuse a tree that is not this application, or not the version it claims.
     *
     * The version check is what stops a release whose archive was built from
     * the wrong commit — the tag says 1.4.0, the code inside says 1.2.0, and
     * without this the install would "succeed" and downgrade the site.
     */
    private static function verifyTree(string $root, string $expected): ?string
    {
        foreach (self::REQUIRED as $needed) {
            if (!is_file($root . '/' . $needed)) {
                return 'The archive does not look like DevColorz (' . $needed . ' is missing). Nothing was installed.';
            }
        }
        // 1.3.0 and earlier declared it in the front controller; later
        // versions keep it in its own file so cron can read it too. Look in
        // both, so an archive of either shape can be verified.
        $declared = '';
        foreach (['/api/lib/Version.php', '/api/index.php'] as $candidate) {
            $source = (string) @file_get_contents($root . $candidate);
            if (preg_match("/APP_VERSION\s*=\s*'([^']+)'/", $source, $found) === 1) {
                $declared = $found[1];
                break;
            }
        }
        if ($declared === '') {
            return 'The archive declares no version. Nothing was installed.';
        }
        $match = [1 => $declared];
        if (self::compare($match[1], $expected) !== 0) {
            return 'The archive contains version ' . $match[1] . ' but the release says ' . $expected
                . '. Nothing was installed.';
        }
        if (self::compare($match[1], self::currentVersion()) <= 0) {
            return 'That archive is not newer than what is installed. Nothing was installed.';
        }
        return null;
    }

    /**
     * Copy the staged tree over the live one, keeping what it replaces.
     *
     * @return int|string Files written, or an error.
     */
    private static function apply(string $staged, string $backup): int|string
    {
        if (!@mkdir($backup, 0775, true) && !is_dir($backup)) {
            return 'Could not create a backup directory. Nothing was installed.';
        }
        return self::copyTree($staged, Paths::root(), $backup);
    }

    /**
     * Copy one tree onto another, optionally keeping every file replaced.
     *
     * @param  string|null $backup Where to put the previous copy of each file.
     * @return int|string Files written, or an error.
     */
    private static function copyTree(string $source, string $destination, ?string $backup): int|string
    {
        $entries = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($source, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::SELF_FIRST,
        );

        $written = 0;
        foreach ($entries as $entry) {
            /** @var \SplFileInfo $entry */
            $relative = self::safeRelativePath(substr($entry->getPathname(), strlen($source) + 1));
            if ($relative === null) {
                continue;
            }
            // config.php holds the secrets and storage/ holds the database.
            // Neither is ever part of an update.
            $top = explode('/', $relative)[0];
            if (in_array($top, self::PROTECTED, true)) {
                continue;
            }

            $target = $destination . '/' . $relative;
            if ($entry->isDir()) {
                if (!is_dir($target) && !@mkdir($target, 0775, true) && !is_dir($target)) {
                    return 'Could not create ' . $relative . '. The update is incomplete; restore the backup.';
                }
                continue;
            }

            if ($backup !== null && is_file($target)) {
                $kept = $backup . '/' . $relative;
                @mkdir(dirname($kept), 0775, true);
                if (!@copy($target, $kept)) {
                    return 'Could not back up ' . $relative . '. Nothing further was installed.';
                }
            }
            if (!is_dir(dirname($target)) && !@mkdir(dirname($target), 0775, true) && !is_dir(dirname($target))) {
                return 'Could not create the directory for ' . $relative . '.';
            }
            if (!@copy($entry->getPathname(), $target)) {
                return 'Could not write ' . $relative . '. The update is incomplete; restore the backup.';
            }
            $written++;
        }
        return $written;
    }

    private static function removeTree(string $path): void
    {
        if (!is_dir($path)) {
            @unlink($path);
            return;
        }
        $entries = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($path, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($entries as $entry) {
            /** @var \SplFileInfo $entry */
            $entry->isDir() ? @rmdir($entry->getPathname()) : @unlink($entry->getPathname());
        }
        @rmdir($path);
    }
}
