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
    /** @return list<array{id: string, sql: list<string>}> */
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
        ];
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
                foreach ($migration['sql'] as $sql) {
                    Db::connect()->exec($sql);
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
