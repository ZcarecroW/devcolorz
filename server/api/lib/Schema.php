<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Migrations.
 *
 * Forward-only and idempotent: each step records itself in `schema_migrations`
 * and is skipped on the next run. There is no down path, because on a shared
 * host the realistic recovery from a bad migration is restoring the nightly
 * `VACUUM INTO` backup, not running a reverse script nobody has ever tested.
 */
final class Schema
{
    /**
     * A step is a SQL string, or a callable when the work needs real logic.
     *
     * Everything here was one statement after another until display names had
     * to become unique: existing rows have to be read, compared with the same
     * case folding the application uses, and given new names before the index
     * that forbids duplicates can be created at all.
     *
     * @return list<array{id: string, sql: list<string|callable(): void>}>
     */
    private static function migrations(): array
    {
        $strict = Db::supportsStrict() ? ' STRICT' : '';

        return [
            [
                'id' => '001_core',
                'sql' => [
                    "CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY,
                        uuid TEXT NOT NULL UNIQUE,
                        email TEXT NOT NULL,
                        email_lower TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        display_name TEXT NOT NULL DEFAULT '',
                        role TEXT NOT NULL DEFAULT 'user',
                        status TEXT NOT NULL DEFAULT 'pending',
                        email_verified_at INTEGER,
                        prefs_json TEXT NOT NULL DEFAULT '{}',
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL,
                        last_login_at INTEGER
                    )$strict",
                    'CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)',

                    "CREATE TABLE IF NOT EXISTS sessions (
                        sid TEXT PRIMARY KEY,
                        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                        csrf_token TEXT NOT NULL DEFAULT '',
                        ip TEXT NOT NULL DEFAULT '',
                        ua_hash TEXT NOT NULL DEFAULT '',
                        created_at INTEGER NOT NULL,
                        last_seen_at INTEGER NOT NULL,
                        absolute_expires_at INTEGER NOT NULL,
                        revoked_at INTEGER,
                        payload TEXT NOT NULL DEFAULT ''
                    )$strict",
                    'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)',
                    'CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(absolute_expires_at)',

                    "CREATE TABLE IF NOT EXISTS tokens (
                        id INTEGER PRIMARY KEY,
                        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        purpose TEXT NOT NULL,
                        token_hash TEXT NOT NULL UNIQUE,
                        payload_json TEXT NOT NULL DEFAULT '{}',
                        created_at INTEGER NOT NULL,
                        expires_at INTEGER NOT NULL,
                        used_at INTEGER,
                        request_ip TEXT NOT NULL DEFAULT ''
                    )$strict",
                    'CREATE INDEX IF NOT EXISTS idx_tokens_user_purpose ON tokens(user_id, purpose)',
                    'CREATE INDEX IF NOT EXISTS idx_tokens_expiry ON tokens(expires_at)',

                    "CREATE TABLE IF NOT EXISTS settings (
                        key TEXT PRIMARY KEY,
                        value_json TEXT NOT NULL,
                        updated_at INTEGER NOT NULL
                    )$strict",

                    "CREATE TABLE IF NOT EXISTS audit_log (
                        id INTEGER PRIMARY KEY,
                        ts INTEGER NOT NULL,
                        actor TEXT NOT NULL DEFAULT '',
                        action TEXT NOT NULL,
                        target TEXT NOT NULL DEFAULT '',
                        meta_json TEXT NOT NULL DEFAULT '{}',
                        ip TEXT NOT NULL DEFAULT ''
                    )$strict",
                    'CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC)',
                ],
            ],
            [
                'id' => '002_palettes',
                'sql' => [
                    "CREATE TABLE IF NOT EXISTS projects (
                        id INTEGER PRIMARY KEY,
                        uuid TEXT NOT NULL UNIQUE,
                        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                        name TEXT NOT NULL,
                        sort INTEGER NOT NULL DEFAULT 0,
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL
                    )$strict",

                    "CREATE TABLE IF NOT EXISTS palettes (
                        id INTEGER PRIMARY KEY,
                        uuid TEXT NOT NULL UNIQUE,
                        slug TEXT NOT NULL UNIQUE,
                        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
                        title TEXT NOT NULL DEFAULT '',
                        description TEXT NOT NULL DEFAULT '',
                        doc_json TEXT NOT NULL,
                        hex_index TEXT NOT NULL DEFAULT '',
                        color_count INTEGER NOT NULL DEFAULT 0,
                        visibility TEXT NOT NULL DEFAULT 'private',
                        featured INTEGER NOT NULL DEFAULT 0,
                        likes INTEGER NOT NULL DEFAULT 0,
                        views INTEGER NOT NULL DEFAULT 0,
                        trend_score REAL NOT NULL DEFAULT 0,
                        created_at INTEGER NOT NULL,
                        updated_at INTEGER NOT NULL,
                        deleted_at INTEGER
                    )$strict",
                    'CREATE INDEX IF NOT EXISTS idx_pal_user ON palettes(user_id, updated_at DESC)',
                    'CREATE INDEX IF NOT EXISTS idx_pal_public ON palettes(visibility, trend_score DESC)',
                    'CREATE INDEX IF NOT EXISTS idx_pal_count ON palettes(color_count)',

                    "CREATE TABLE IF NOT EXISTS palette_versions (
                        id INTEGER PRIMARY KEY,
                        palette_id INTEGER NOT NULL REFERENCES palettes(id) ON DELETE CASCADE,
                        version INTEGER NOT NULL,
                        doc_json TEXT NOT NULL,
                        label TEXT NOT NULL DEFAULT '',
                        created_at INTEGER NOT NULL,
                        UNIQUE(palette_id, version)
                    )$strict",

                    "CREATE TABLE IF NOT EXISTS likes (
                        palette_id INTEGER NOT NULL REFERENCES palettes(id) ON DELETE CASCADE,
                        actor_key TEXT NOT NULL,
                        created_at INTEGER NOT NULL,
                        PRIMARY KEY (palette_id, actor_key)
                    )$strict",
                ],
            ],
            [
                'id' => '003_infrastructure',
                'sql' => [
                    "CREATE TABLE IF NOT EXISTS rate_buckets (
                        bucket TEXT PRIMARY KEY,
                        tokens REAL NOT NULL,
                        updated_at INTEGER NOT NULL
                    )$strict",

                    "CREATE TABLE IF NOT EXISTS login_attempts (
                        id INTEGER PRIMARY KEY,
                        ts INTEGER NOT NULL,
                        ip TEXT NOT NULL,
                        account_key TEXT NOT NULL,
                        ok INTEGER NOT NULL
                    )$strict",
                    'CREATE INDEX IF NOT EXISTS idx_la_acct ON login_attempts(account_key, ts)',
                    'CREATE INDEX IF NOT EXISTS idx_la_ip ON login_attempts(ip, ts)',

                    "CREATE TABLE IF NOT EXISTS lockouts (
                        account_key TEXT PRIMARY KEY,
                        fails INTEGER NOT NULL DEFAULT 0,
                        locked_until INTEGER NOT NULL DEFAULT 0,
                        captcha_required INTEGER NOT NULL DEFAULT 0,
                        updated_at INTEGER NOT NULL
                    )$strict",

                    "CREATE TABLE IF NOT EXISTS mail_outbox (
                        id INTEGER PRIMARY KEY,
                        to_addr TEXT NOT NULL,
                        subject TEXT NOT NULL,
                        body_text TEXT NOT NULL,
                        body_html TEXT NOT NULL DEFAULT '',
                        headers_json TEXT NOT NULL DEFAULT '{}',
                        status TEXT NOT NULL DEFAULT 'queued',
                        attempts INTEGER NOT NULL DEFAULT 0,
                        last_error TEXT NOT NULL DEFAULT '',
                        created_at INTEGER NOT NULL,
                        send_after INTEGER NOT NULL,
                        sent_at INTEGER
                    )$strict",
                    'CREATE INDEX IF NOT EXISTS idx_outbox_due ON mail_outbox(status, send_after)',

                    "CREATE TABLE IF NOT EXISTS cron_runs (
                        id INTEGER PRIMARY KEY,
                        job TEXT NOT NULL,
                        started_at INTEGER NOT NULL,
                        finished_at INTEGER,
                        ok INTEGER,
                        note TEXT NOT NULL DEFAULT ''
                    )$strict",
                    'CREATE INDEX IF NOT EXISTS idx_cron_job ON cron_runs(job, started_at DESC)',
                ],
            ],
            [
                'id' => '004_unique_display_names',
                'sql' => [
                    // Mirrors `email_lower`: SQLite's own lower() folds ASCII
                    // only, so the comparison key is written by PHP, which
                    // folds the way the rest of the application does.
                    "ALTER TABLE users ADD COLUMN display_name_lower TEXT NOT NULL DEFAULT ''",
                    static fn (): int => self::backfillDisplayNameKeys(),
                    /*
                     * Partial, so the blank name several legacy rows may share
                     * is not treated as a collision. Every path that writes a
                     * name requires at least one character, so a blank one can
                     * only be historical.
                     */
                    "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_display_name
                        ON users(display_name_lower) WHERE display_name_lower != ''",
                ],
            ],
        ];
    }

    /**
     * Give every existing account a comparison key, and a name it can keep.
     *
     * Names were free to collide until now, so an installation upgrading into
     * the unique index may well hold duplicates — and the index cannot be
     * created while it does. Rather than fail the upgrade, the earliest
     * account of each set keeps the name it has and the others are numbered
     * after it: two accounts called Alex become "Alex" and "Alex 2". Numbering
     * skips anything already taken, so it cannot manufacture a fresh clash.
     *
     * @return int How many accounts had to be renamed.
     */
    private static function backfillDisplayNameKeys(): int
    {
        $rows = Db::all('SELECT id, display_name FROM users ORDER BY id ASC');
        $taken = [];
        $renamed = 0;

        foreach ($rows as $row) {
            $name = trim((string) $row['display_name']);
            $key = mb_strtolower($name, 'UTF-8');

            if ($key !== '' && isset($taken[$key])) {
                $suffix = 2;
                do {
                    $candidate = $name . ' ' . $suffix;
                    $candidateKey = mb_strtolower($candidate, 'UTF-8');
                    $suffix++;
                } while (isset($taken[$candidateKey]));
                $name = $candidate;
                $key = $candidateKey;
                $renamed++;
            }
            if ($key !== '') {
                $taken[$key] = true;
            }
            Db::run('UPDATE users SET display_name = ?, display_name_lower = ? WHERE id = ?', [
                $name,
                $key,
                (int) $row['id'],
            ]);
        }
        return $renamed;
    }

    /**
     * Run any pending migrations, once, cheaply enough for every request.
     *
     * Upgrading is documented as "upload it over the top", and nothing on the
     * request path ran migrations — so after a release that added one, every
     * endpoint touching the new column returned 500 until the scheduler
     * happened to fire. An operator who never wired up cron, or who had turned
     * it off in Settings, never got them at all.
     *
     * The marker is named after the last migration in the shipped list, so a
     * new release invalidates it automatically and an unchanged one costs a
     * single `is_file`. The lock is what stops a burst of concurrent requests
     * after an upgrade all deciding to migrate at the same time; whoever loses
     * the race simply proceeds, because the winner is finished by then.
     */
    public static function migrateIfNeeded(): void
    {
        $migrations = self::migrations();
        $last = (string) ($migrations[count($migrations) - 1]['id'] ?? 'none');
        $marker = Paths::storage() . '/schema-' . $last . '.ok';
        if (is_file($marker)) {
            return;
        }

        $lock = @fopen(Paths::locks() . '/schema.lock', 'c');
        if ($lock === false) {
            // No lock file is not a reason to serve a stale schema.
            self::migrate();
            @touch($marker);
            return;
        }
        if (flock($lock, LOCK_EX)) {
            if (!is_file($marker)) {
                self::migrate();
                @touch($marker);
            }
            flock($lock, LOCK_UN);
        }
        fclose($lock);
    }

    public static function migrate(): int
    {
        $pdo = Db::connect();
        $pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)');

        $applied = [];
        foreach (Db::all('SELECT id FROM schema_migrations') as $row) {
            $applied[(string) $row['id']] = true;
        }

        $count = 0;
        foreach (self::migrations() as $migration) {
            if (isset($applied[$migration['id']])) {
                continue;
            }
            // Each migration is one transaction: a half-applied schema is far
            // worse than a failed deploy.
            Db::transaction(static function () use ($migration): void {
                foreach ($migration['sql'] as $step) {
                    if (is_callable($step)) {
                        $step();
                        continue;
                    }
                    Db::connect()->exec($step);
                }
                Db::run('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)', [
                    $migration['id'],
                    time(),
                ]);
            });
            $count++;
        }
        return $count;
    }
}
