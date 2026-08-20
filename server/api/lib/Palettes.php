<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Palette storage.
 *
 * The palette document itself is opaque JSON owned by the client — the server
 * validates its shape and its size but never its meaning. That keeps the colour
 * engine in exactly one place; a second implementation in PHP would drift from
 * the first within a release.
 *
 * What the server *does* derive is the search index: a flat hex list and a
 * colour count, so "find my palettes with a teal in them" does not require
 * parsing every stored document.
 */
final class Palettes
{
    /**
     * Pull the hex values out of a palette document.
     *
     * @param array<string, mixed> $doc
     * @return list<string>
     */
    public static function hexes(array $doc): array
    {
        $colors = $doc['colors'] ?? null;
        if (!is_array($colors)) {
            return [];
        }
        $out = [];
        foreach ($colors as $entry) {
            $hex = null;
            if (is_string($entry)) {
                $hex = $entry;
            } elseif (is_array($entry)) {
                $candidate = $entry['hex'] ?? null;
                $hex = is_string($candidate) ? $candidate : null;
            }
            if ($hex === null) {
                continue;
            }
            $hex = ltrim(trim($hex), '#');
            if (preg_match('/^[0-9a-fA-F]{6}$/', $hex)) {
                $out[] = strtolower($hex);
            }
            if (count($out) >= 64) {
                break;
            }
        }
        return $out;
    }

    /** A short, unambiguous, URL-safe slug. */
    public static function slug(string $title, array $hexes): string
    {
        $base = strtolower(trim($title));
        $base = preg_replace('/[^a-z0-9]+/', '-', $base) ?? '';
        $base = trim($base, '-');
        if ($base === '') {
            $base = implode('-', array_slice($hexes, 0, 3));
        }
        if ($base === '') {
            $base = 'palette';
        }
        $base = substr($base, 0, 48);

        // Suffix rather than a uniqueness loop: a loop that queries and retries
        // is a race, and eight random characters make a collision a non-event.
        return $base . '-' . bin2hex(random_bytes(4));
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    public static function summary(array $row, bool $withOwner = false): array
    {
        $doc = json_decode((string) $row['doc_json'], true);
        $hexes = array_values(array_filter(explode(',', (string) $row['hex_index'])));
        $summary = [
            'uuid'       => (string) $row['uuid'],
            'slug'       => (string) $row['slug'],
            'title'      => (string) $row['title'],
            'colors'     => array_map(static fn (string $h): string => '#' . $h, $hexes),
            'colorCount' => (int) $row['color_count'],
            'visibility' => (string) $row['visibility'],
            'featured'   => (bool) (int) ($row['featured'] ?? 0),
            'likes'      => (int) $row['likes'],
            'views'      => (int) $row['views'],
            'createdAt'  => (int) $row['created_at'],
            'updatedAt'  => (int) $row['updated_at'],
            'doc'        => is_array($doc) ? $doc : null,
        ];
        if ($withOwner && isset($row['owner_name'])) {
            $summary['owner'] = ['displayName' => (string) $row['owner_name']];
        }
        return $summary;
    }

    /**
     * @param array<string, mixed> $doc
     * @return array{uuid: string, slug: string}
     */
    public static function create(
        ?int $userId,
        string $title,
        string $description,
        array $doc,
        string $visibility,
    ): array {
        $hexes = self::hexes($doc);
        $uuid = Security::uuid();
        $slug = self::slug($title, $hexes);
        $now = time();

        Db::run(
            'INSERT INTO palettes (uuid, slug, user_id, title, description, doc_json, hex_index, color_count, visibility, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $uuid,
                $slug,
                $userId,
                $title,
                $description,
                json_encode($doc, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
                implode(',', $hexes),
                count($hexes),
                $visibility,
                $now,
                $now,
            ],
        );
        return ['uuid' => $uuid, 'slug' => $slug];
    }

    /** @return array<string, mixed>|null */
    public static function findByUuid(string $uuid): ?array
    {
        return Db::one('SELECT * FROM palettes WHERE uuid = ? AND deleted_at IS NULL', [$uuid]);
    }

    /** @return array<string, mixed>|null */
    public static function findBySlug(string $slug): ?array
    {
        return Db::one(
            'SELECT p.*, u.display_name AS owner_name
             FROM palettes p LEFT JOIN users u ON u.id = p.user_id
             WHERE p.slug = ? AND p.deleted_at IS NULL',
            [$slug],
        );
    }

    /**
     * Update, snapshotting the previous document as a version first.
     *
     * @param array<string, mixed> $changes
     */
    public static function update(int $id, array $changes): void
    {
        Db::transaction(static function () use ($id, $changes): void {
            $row = Db::one('SELECT * FROM palettes WHERE id = ?', [$id]);
            if ($row === null) {
                return;
            }

            if (isset($changes['doc'])) {
                $version = (int) Db::value(
                    'SELECT COALESCE(MAX(version), 0) + 1 FROM palette_versions WHERE palette_id = ?',
                    [$id],
                );
                Db::run(
                    'INSERT INTO palette_versions (palette_id, version, doc_json, created_at) VALUES (?, ?, ?, ?)',
                    [$id, $version, (string) $row['doc_json'], time()],
                );
                // Fifty is enough to undo a bad afternoon and small enough that
                // a busy account cannot fill the database with history.
                Db::run(
                    'DELETE FROM palette_versions WHERE palette_id = ? AND version <= ?',
                    [$id, $version - 50],
                );
            }

            $fields = [];
            $params = [];
            foreach (['title', 'description', 'visibility'] as $key) {
                if (array_key_exists($key, $changes)) {
                    $fields[] = "$key = ?";
                    $params[] = $changes[$key];
                }
            }
            if (isset($changes['doc']) && is_array($changes['doc'])) {
                $hexes = self::hexes($changes['doc']);
                $fields[] = 'doc_json = ?';
                $params[] = json_encode($changes['doc'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
                $fields[] = 'hex_index = ?';
                $params[] = implode(',', $hexes);
                $fields[] = 'color_count = ?';
                $params[] = count($hexes);
            }
            if (array_key_exists('featured', $changes)) {
                $fields[] = 'featured = ?';
                $params[] = $changes['featured'] ? 1 : 0;
            }
            if ($fields === []) {
                return;
            }
            $fields[] = 'updated_at = ?';
            $params[] = time();
            $params[] = $id;
            Db::run('UPDATE palettes SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
        });
    }

    /** Soft delete, so an accidental delete is recoverable for 30 days. */
    public static function softDelete(int $id): void
    {
        Db::run('UPDATE palettes SET deleted_at = ?, visibility = ? WHERE id = ?', [
            time(),
            'private',
            $id,
        ]);
    }

    /**
     * @return array{items: list<array<string, mixed>>, nextCursor: string|null}
     */
    public static function listForUser(int $userId, ?string $query, string $sort, ?string $cursor, int $limit = 40): array
    {
        $limit = max(1, min(100, $limit));
        $order = match ($sort) {
            'created' => 'created_at DESC',
            'name'    => 'title COLLATE NOCASE ASC',
            default   => 'updated_at DESC',
        };

        $where = ['user_id = ?', 'deleted_at IS NULL'];
        $params = [$userId];
        if ($query !== null && $query !== '') {
            $where[] = '(title LIKE ? OR hex_index LIKE ?)';
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], strtolower(ltrim($query, '#'))) . '%';
            $params[] = $like;
            $params[] = $like;
        }
        // Offset paging is fine here: a personal library is bounded, and a
        // stable cursor across three sort orders would cost more than it saves.
        $offset = $cursor !== null && ctype_digit($cursor) ? (int) $cursor : 0;
        $params[] = $limit + 1;
        $params[] = $offset;

        $rows = Db::all(
            'SELECT * FROM palettes WHERE ' . implode(' AND ', $where) . " ORDER BY $order LIMIT ? OFFSET ?",
            $params,
        );
        $next = null;
        if (count($rows) > $limit) {
            array_pop($rows);
            $next = (string) ($offset + $limit);
        }
        return [
            'items'      => array_map(static fn (array $r): array => self::summary($r), $rows),
            'nextCursor' => $next,
        ];
    }

    /**
     * The public feed.
     *
     * @return array{items: list<array<string, mixed>>, nextCursor: string|null}
     */
    public static function explore(string $sort, ?string $query, ?int $count, ?string $cursor, int $limit = 24): array
    {
        $limit = max(1, min(60, $limit));
        $order = match ($sort) {
            'new'   => 'p.created_at DESC',
            'likes' => 'p.likes DESC, p.created_at DESC',
            default => 'p.featured DESC, p.trend_score DESC, p.created_at DESC',
        };

        $where = ["p.visibility = 'public'", 'p.deleted_at IS NULL'];
        $params = [];
        if ($query !== null && $query !== '') {
            $where[] = '(p.title LIKE ? OR p.hex_index LIKE ?)';
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], strtolower(ltrim($query, '#'))) . '%';
            $params[] = $like;
            $params[] = $like;
        }
        if ($count !== null && $count > 0) {
            $where[] = 'p.color_count = ?';
            $params[] = $count;
        }
        $offset = $cursor !== null && ctype_digit($cursor) ? (int) $cursor : 0;
        $params[] = $limit + 1;
        $params[] = $offset;

        $rows = Db::all(
            'SELECT p.*, u.display_name AS owner_name
             FROM palettes p LEFT JOIN users u ON u.id = p.user_id
             WHERE ' . implode(' AND ', $where) . " ORDER BY $order LIMIT ? OFFSET ?",
            $params,
        );
        $next = null;
        if (count($rows) > $limit) {
            array_pop($rows);
            $next = (string) ($offset + $limit);
        }
        return [
            'items'      => array_map(static fn (array $r): array => self::summary($r, true), $rows),
            'nextCursor' => $next,
        ];
    }

    /**
     * Toggle a like.
     *
     * Anonymous visitors are keyed by a salted hash of their address, so the
     * count means something without the server keeping a list of who liked
     * what. The salt is the installation's HMAC key, so the hashes are not
     * comparable across installations either.
     *
     * @return array{likes: int, liked: bool}
     */
    public static function toggleLike(int $paletteId): array
    {
        $userId = Auth::id();
        $actor = $userId !== null
            ? 'user:' . $userId
            : 'ip:' . substr(hash_hmac('sha256', Http::ipKey(), Config::string('hmac_key')), 0, 32);

        return Db::transaction(static function () use ($paletteId, $actor): array {
            $existing = Db::one('SELECT 1 FROM likes WHERE palette_id = ? AND actor_key = ?', [
                $paletteId,
                $actor,
            ]);
            if ($existing !== null) {
                Db::run('DELETE FROM likes WHERE palette_id = ? AND actor_key = ?', [$paletteId, $actor]);
                $liked = false;
            } else {
                Db::run('INSERT INTO likes (palette_id, actor_key, created_at) VALUES (?, ?, ?)', [
                    $paletteId,
                    $actor,
                    time(),
                ]);
                $liked = true;
            }
            $likes = (int) Db::value('SELECT COUNT(*) FROM likes WHERE palette_id = ?', [$paletteId]);
            Db::run('UPDATE palettes SET likes = ? WHERE id = ?', [$likes, $paletteId]);
            return ['likes' => $likes, 'liked' => $liked];
        });
    }

    public static function hasLiked(int $paletteId): bool
    {
        $userId = Auth::id();
        $actor = $userId !== null
            ? 'user:' . $userId
            : 'ip:' . substr(hash_hmac('sha256', Http::ipKey(), Config::string('hmac_key')), 0, 32);
        return Db::one('SELECT 1 FROM likes WHERE palette_id = ? AND actor_key = ?', [$paletteId, $actor]) !== null;
    }

    /**
     * Recompute the trending score.
     *
     * Gravity ranking: likes decay with age so a palette from last year cannot
     * hold the top of the feed forever on accumulated votes.
     */
    public static function recomputeTrending(): int
    {
        $now = time();
        return Db::run(
            'UPDATE palettes
             SET trend_score = (likes + views / 20.0) / POWER((? - created_at) / 3600.0 + 2.0, 1.5)
             WHERE deleted_at IS NULL AND visibility = ?',
            [$now, 'public'],
        )->rowCount();
    }

    public static function purgeDeleted(int $days = 30): int
    {
        return Db::run('DELETE FROM palettes WHERE deleted_at IS NOT NULL AND deleted_at < ?', [
            time() - $days * 86400,
        ])->rowCount();
    }
}
