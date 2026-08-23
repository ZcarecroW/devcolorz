<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Scheduled work.
 *
 * Every job is chunked against a deadline. `max_execution_time` on shared
 * hosting is routinely 30 to 60 seconds, and a job killed mid-write is how a
 * database ends up half-migrated. Finishing early and picking up the rest on
 * the next tick is always the better trade.
 */
final class Cron
{
    /**
     * @param list<string>|null $only Run just these jobs, or all of them.
     * @return array<string, string>
     */
    public static function run(?array $only = null, ?float $deadline = null): array
    {
        $deadline ??= microtime(true) + 20;
        $results = [];

        $jobs = [
            'mail'     => static fn (): string => self::mail($deadline),
            'prune'    => static fn (): string => self::prune(),
            'trending' => static fn (): string => self::trending(),
            'maintain' => static fn (): string => self::maintain(),
            'backup'   => static fn (): string => self::backup(),
            // Cheap on all but one run a day: it returns immediately unless
            // the configured hour has passed without a check happening yet.
            'updates'  => static fn (): string => Updater::scheduled(),
            // Last, and only when the answer is stale. The probe makes six
            // loopback requests and on a host whose loopback is firewalled it
            // spends the whole connect timeout on each — put anywhere earlier
            // it ate the deadline and the nightly backup was recorded as
            // "skipped — out of time" on every single run.
            'exposure' => static fn (): string => self::exposure($deadline),
        ];

        foreach ($jobs as $name => $job) {
            if ($only !== null && !in_array($name, $only, true)) {
                continue;
            }
            if (microtime(true) > $deadline) {
                $results[$name] = 'skipped — out of time';
                continue;
            }
            $started = time();
            Db::run('INSERT INTO cron_runs (job, started_at) VALUES (?, ?)', [$name, $started]);
            $runId = Db::lastId();
            try {
                $note = $job();
                Db::run('UPDATE cron_runs SET finished_at = ?, ok = 1, note = ? WHERE id = ?', [
                    time(),
                    $note,
                    $runId,
                ]);
                $results[$name] = $note;
            } catch (\Throwable $e) {
                $message = $e->getMessage();
                Db::run('UPDATE cron_runs SET finished_at = ?, ok = 0, note = ? WHERE id = ?', [
                    time(),
                    $message,
                    $runId,
                ]);
                $results[$name] = 'failed: ' . $message;
            }
        }

        // Keep the run log readable: a run every five minutes is 105,000 rows a
        // year, and nobody has ever wanted to read the ten-thousandth.
        Db::run('DELETE FROM cron_runs WHERE started_at < ?', [time() - 14 * 86400]);

        return $results;
    }

    private static function mail(float $deadline): string
    {
        if (!function_exists('mail')) {
            return 'mail() is unavailable on this host';
        }
        $result = Mail::flush(25, $deadline - 2);
        return sprintf('%d sent, %d failed, %d deferred', $result['sent'], $result['failed'], $result['skipped']);
    }

    private static function prune(): string
    {
        $attempts = RateLimit::prune(30);
        $tokens = Security::pruneTokens();
        $sessions = Session::prune();
        $mail = Mail::prune(30);
        $palettes = Palettes::purgeDeleted(30);
        // The audit log was the one table nothing ever trimmed, and it takes a
        // row on every sign-in, palette write and admin action — the
        // highest-volume table in the database, growing without bound.
        $audit = Audit::prune(180);
        return sprintf(
            '%d attempts, %d tokens, %d sessions, %d mails, %d palettes, %d audit rows removed',
            $attempts,
            $tokens,
            $sessions,
            $mail,
            $palettes,
            $audit,
        );
    }

    private static function trending(): string
    {
        $rows = Palettes::recomputeTrending();
        return $rows . ' public palettes rescored';
    }

    private static function maintain(): string
    {
        Db::checkpoint();
        Db::optimize();
        return 'checkpointed and optimized';
    }

    /**
     * Re-check whether anything sensitive is web-reachable.
     *
     * Its own job, so a slow probe cannot starve the ones that matter, and
     * hourly rather than every tick: the answer only changes when the server
     * configuration does. A truncated run degrades safely — a target that was
     * never reached leaves no check, and `refreshExposure` reads that as
     * inconclusive rather than as a pass.
     */
    private static function exposure(float $deadline): string
    {
        $status = SelfTest::exposureStatus();
        $age = time() - $status['checkedAt'];
        if ($status['exposed'] !== null && $age < 3600) {
            return sprintf('checked %ds ago, skipped', $age);
        }

        $result = SelfTest::refreshExposure(SelfTest::exposure($deadline - 1));
        return match ($result['exposed']) {
            true    => 'STORAGE IS EXPOSED',
            false   => 'storage not reachable',
            default => 'inconclusive — could not complete the loopback requests',
        };
    }

    /**
     * Nightly backup, keeping a week.
     *
     * `VACUUM INTO` rather than a file copy: closing any descriptor for a
     * SQLite file drops every advisory lock the process holds on it, so copying
     * the live database can corrupt it under a concurrent writer.
     *
     * The daily files live under their own prefix. Sharing `backup-*` with the
     * ones the admin console writes by hand meant the seven-file cap counted
     * both, so the snapshot somebody took before a risky change — the button
     * for which promises it will be kept — was silently deleted within a week.
     * Legacy `backup-YYYYMMDD.sqlite` files are still swept up, so an existing
     * installation does not accumulate them forever; the timestamped manual
     * ones, `backup-YYYYMMDD-HHMMSS.sqlite`, are left alone.
     */
    private static function backup(): string
    {
        $dir = Paths::backups();
        $today = date('Ymd');
        $target = $dir . '/daily-' . $today . '.sqlite';
        if (is_file($target)) {
            return 'already backed up today';
        }

        Db::backupTo($target);

        $daily = array_merge(
            glob($dir . '/daily-*.sqlite') ?: [],
            // Dailies from before the rename. Eight digits and nothing else,
            // so a manual `backup-20260823-142530.sqlite` does not match.
            array_filter(
                glob($dir . '/backup-*.sqlite') ?: [],
                static fn (string $f): bool => (bool) preg_match('/backup-\d{8}\.sqlite$/', $f),
            ),
        );
        rsort($daily);

        $kept = 0;
        foreach ($daily as $index => $file) {
            if ($index >= 7) {
                @unlink($file);
            } else {
                $kept++;
            }
        }
        return 'backup written, ' . $kept . ' daily kept';
    }
}
