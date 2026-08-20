<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * The audit log.
 *
 * Records who did what to whom, for the actions where "who changed this?" is a
 * question somebody will eventually ask at speed: role changes, deletions,
 * settings edits, token rotations, sign-ins.
 *
 * Writing an audit entry must never break the action it is recording, so every
 * failure here is swallowed.
 */
final class Audit
{
    /** @param array<string, mixed> $meta */
    public static function log(string $action, string $target = '', array $meta = []): void
    {
        try {
            $user = Auth::user();
            $actor = $user === null ? 'anonymous' : (string) $user['uuid'];
            Db::run(
                'INSERT INTO audit_log (ts, actor, action, target, meta_json, ip) VALUES (?, ?, ?, ?, ?, ?)',
                [
                    time(),
                    $actor,
                    $action,
                    $target,
                    json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                    Http::ipKey(),
                ],
            );
        } catch (\Throwable) {
            // An audit trail that can take the site down is worse than one with
            // a gap in it.
        }
    }

    /**
     * @return array{items: list<array<string, mixed>>, nextCursor: string|null}
     */
    public static function page(?string $cursor, int $limit = 50): array
    {
        $limit = max(1, min(200, $limit));
        $before = $cursor !== null && ctype_digit($cursor) ? (int) $cursor : PHP_INT_MAX;
        $rows = Db::all(
            'SELECT * FROM audit_log WHERE id < ? ORDER BY id DESC LIMIT ?',
            [$before, $limit + 1],
        );
        $next = null;
        if (count($rows) > $limit) {
            array_pop($rows);
            $next = (string) $rows[count($rows) - 1]['id'];
        }
        $items = array_map(static function (array $row): array {
            $meta = json_decode((string) $row['meta_json'], true);
            return [
                'id'     => (int) $row['id'],
                'ts'     => (int) $row['ts'],
                'actor'  => (string) $row['actor'],
                'action' => (string) $row['action'],
                'target' => (string) $row['target'],
                'ip'     => (string) $row['ip'],
                'meta'   => is_array($meta) ? $meta : [],
            ];
        }, $rows);
        return ['items' => $items, 'nextCursor' => $next];
    }

    public static function prune(int $days = 180): int
    {
        return Db::run('DELETE FROM audit_log WHERE ts < ?', [time() - $days * 86400])->rowCount();
    }
}
