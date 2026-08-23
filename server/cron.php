<?php

declare(strict_types=1);

/**
 * The scheduled entry point.
 *
 * Call it every five minutes:
 *
 *     https://example.com/cron.php?k=YOUR-TOKEN
 *
 * or, preferably, with the token in a header so it never reaches an access log:
 *
 *     curl -fsS -H "X-Cron-Key: YOUR-TOKEN" https://example.com/cron.php
 *
 * Three things matter here and each has bitten somebody before:
 *
 * 1. **A wrong key gets a 404, not a 403.** A 403 confirms the endpoint exists
 *    and is worth attacking; a 404 says nothing at all.
 * 2. **The lock file is never unlinked.** Deleting a file you hold a lock on
 *    races with the next process opening the same path: both end up holding an
 *    exclusive lock on different inodes and both run.
 * 3. **A deadline, not a prayer.** Jobs stop cleanly before
 *    `max_execution_time` can kill them mid-write.
 */

namespace DevColorz;

ini_set('display_errors', '0');
error_reporting(E_ALL);

require __DIR__ . '/api/lib/Version.php';
require __DIR__ . '/api/lib/Paths.php';
require __DIR__ . '/api/lib/Config.php';
require __DIR__ . '/api/lib/Db.php';
require __DIR__ . '/api/lib/Schema.php';
require __DIR__ . '/api/lib/Settings.php';
require __DIR__ . '/api/lib/Http.php';
require __DIR__ . '/api/lib/Session.php';
require __DIR__ . '/api/lib/Security.php';
require __DIR__ . '/api/lib/RateLimit.php';
require __DIR__ . '/api/lib/Captcha.php';
require __DIR__ . '/api/lib/Mail.php';
require __DIR__ . '/api/lib/Auth.php';
require __DIR__ . '/api/lib/Audit.php';
require __DIR__ . '/api/lib/Palettes.php';
require __DIR__ . '/api/lib/SelfTest.php';
require __DIR__ . '/api/lib/Updater.php';
require __DIR__ . '/api/lib/Cron.php';

$notFound = static function (): never {
    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    echo "Not Found\n";
    exit;
};

if (!Config::installed()) {
    $notFound();
}

ini_set('error_log', Paths::storage() . '/php-error.log');

$expected = Config::string('cron_token');
$provided = '';
foreach ([$_SERVER['HTTP_X_CRON_KEY'] ?? null, $_GET['k'] ?? null] as $candidate) {
    if (is_string($candidate) && $candidate !== '') {
        $provided = $candidate;
        break;
    }
}

// hash_equals needs equal-length inputs to be constant-time, so both sides are
// hashed to a fixed width first.
if ($expected === '' || !hash_equals(hash('sha256', $expected), hash('sha256', $provided))) {
    $notFound();
}

if (!Settings::bool('cron.enabled', true)) {
    header('Content-Type: text/plain; charset=utf-8');
    echo "Cron is disabled in the admin settings.\n";
    exit;
}

Paths::ensure();

$lockFile = Paths::locks() . '/cron.lock';
$handle = fopen($lockFile, 'c');
if ($handle === false) {
    http_response_code(500);
    echo "Could not open the lock file.\n";
    exit;
}

if (!flock($handle, LOCK_EX | LOCK_NB)) {
    // Another run is still going. If it has been going for more than fifteen
    // minutes it is almost certainly dead — a killed process releases its lock,
    // so reaching here means the holder is alive but stuck, and we simply skip.
    header('Content-Type: text/plain; charset=utf-8');
    echo "Another run is in progress.\n";
    exit;
}

ftruncate($handle, 0);
fwrite($handle, getmypid() . ' ' . time() . "\n");
fflush($handle);

// Keep working if the caller hangs up: a curl timeout should not abandon a
// half-finished job.
ignore_user_abort(true);
@set_time_limit(0);

$deadline = microtime(true) + 20.0;
$started = microtime(true);

try {
    Db::connect();
    Schema::migrate();
    $results = Cron::run(null, $deadline);
    $ok = true;
} catch (\Throwable $e) {
    error_log('[devcolorz cron] ' . $e->getMessage());
    $results = ['fatal' => $e->getMessage()];
    $ok = false;
}

$elapsed = round((microtime(true) - $started) * 1000);

header('Content-Type: text/plain; charset=utf-8');
http_response_code($ok ? 200 : 500);
echo "DevColorz cron — {$elapsed}ms\n";
foreach ($results as $job => $note) {
    echo str_pad((string) $job, 10) . ' ' . $note . "\n";
}

// The lock is released when the process exits and the handle is closed. It is
// deliberately never unlinked.
flock($handle, LOCK_UN);
fclose($handle);
