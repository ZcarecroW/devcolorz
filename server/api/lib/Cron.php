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
        return sprintf(
            '%d attempts, %d tokens, %d sessions, %d mails, %d palettes removed',
            $attempts,
            $tokens,
            $sessions,
            $mail,
            $palettes,
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
     * Nightly backup, keeping a week.
     *
     * `VACUUM INTO` rather than a file copy: closing any descriptor for a
     * SQLite file drops every advisory lock the process holds on it, so copying
     * the live database can corrupt it under a concurrent writer.
     */
    private static function backup(): string
    {
        $dir = Paths::backups();
        $today = date('Ymd');
        $target = $dir . '/backup-' . $today . '.sqlite';
        if (is_file($target)) {
            return 'already backed up today';
        }

        Db::backupTo($target);

        $kept = 0;
        $files = glob($dir . '/backup-*.sqlite') ?: [];
        rsort($files);
        foreach ($files as $index => $file) {
            if ($index >= 7) {
                @unlink($file);
            } else {
                $kept++;
            }
        }
        return 'backup written, ' . $kept . ' kept';
    }
}
