<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * The administrative surface.
 *
 * Every handler starts with `Auth::requireAdmin()` rather than relying on a
 * prefix guard: a guard applied by path is one refactor away from being
 * silently bypassed, whereas a missing call here is visible on the line.
 */
function registerAdminRoutes(Router $router): void
{
    /* ---------------- overview ---------------- */

    $router->get('/admin/stats', static function (): void {
        Auth::requireAdmin();

        $userCounts = [];
        foreach (Db::all('SELECT status, COUNT(*) AS n FROM users GROUP BY status') as $row) {
            $userCounts[(string) $row['status']] = (int) $row['n'];
        }
        $lastRun = Db::one('SELECT started_at, ok FROM cron_runs ORDER BY started_at DESC LIMIT 1');
        $jobs = Db::all(
            'SELECT job, MAX(started_at) AS last_run, ok, note FROM cron_runs GROUP BY job ORDER BY job',
        );

        Http::json([
            'users' => [
                'total'     => array_sum($userCounts),
                'active'    => $userCounts['active'] ?? 0,
                'pending'   => $userCounts['pending'] ?? 0,
                'suspended' => $userCounts['suspended'] ?? 0,
            ],
            'palettes' => [
                'total'  => (int) Db::value('SELECT COUNT(*) FROM palettes WHERE deleted_at IS NULL'),
                'public' => (int) Db::value("SELECT COUNT(*) FROM palettes WHERE visibility = 'public' AND deleted_at IS NULL"),
                'trashed' => (int) Db::value('SELECT COUNT(*) FROM palettes WHERE deleted_at IS NOT NULL'),
            ],
            'db' => [
                'bytes'         => Db::sizeBytes(),
                'wal'           => Db::isWal(),
                'sqliteVersion' => Db::version(),
                'pageCount'     => (int) Db::value('PRAGMA page_count'),
            ],
            'cron' => [
                'lastRunAt' => $lastRun === null ? null : (int) $lastRun['started_at'],
                'lastOk'    => $lastRun !== null && (int) ($lastRun['ok'] ?? 0) === 1,
                'jobs'      => array_map(static fn (array $j): array => [
                    'job'       => (string) $j['job'],
                    'lastRunAt' => (int) $j['last_run'],
                    'lastOk'    => (int) ($j['ok'] ?? 0) === 1,
                    'note'      => (string) $j['note'],
                ], $jobs),
            ],
            'outbox' => [
                'queued' => (int) Db::value("SELECT COUNT(*) FROM mail_outbox WHERE status = 'queued'"),
                'failed' => (int) Db::value("SELECT COUNT(*) FROM mail_outbox WHERE status = 'dead'"),
                'sent24h' => (int) Db::value("SELECT COUNT(*) FROM mail_outbox WHERE status = 'sent' AND sent_at > ?", [time() - 86400]),
            ],
            'storageExposed' => SelfTest::exposureStatus()['exposed'],
            'sessions'       => (int) Db::value('SELECT COUNT(*) FROM sessions WHERE user_id IS NOT NULL'),
        ]);
    });

    /* ---------------- settings ---------------- */

    /**
     * Settings, with every secret masked.
     *
     * Used by both the read and the write handler. Building the response in one
     * place is the point: the write path returning the fresh state is the
     * obvious thing to do, and doing it by hand is how `captcha.secret` ends up
     * in a response body.
     *
     * @return array<string, mixed>
     */
    $settingsPayload = static function (): array {
        $values = Settings::all();
        foreach ($values as $key => $value) {
            if (Settings::isSecret((string) $key) && is_string($value)) {
                // The administrator can confirm a secret is set and replace it,
                // but the API never hands the value back out.
                $values[$key] = Settings::mask($value);
            }
        }
        // Tokens live in config.php rather than the settings table, so they are
        // merged in here for display only.
        $values['auth.inviteToken'] = Settings::mask(Config::string('invite_token'));
        $values['cron.token'] = Settings::mask(Config::string('cron_token'));
        $values['cron.url'] = Http::baseUrl() . '/cron.php?k=YOUR-TOKEN';
        return $values;
    };

    $router->get('/admin/settings', static function () use ($settingsPayload): void {
        Auth::requireAdmin();
        Http::json($settingsPayload());
    });

    $router->patch('/admin/settings', static function () use ($settingsPayload): void {
        Auth::requireAdmin();
        $body = Http::body();

        // A masked value coming back unchanged means "leave it alone", not
        // "set the secret to a string of bullets".
        foreach (array_keys($body) as $key) {
            $key = (string) $key;
            if (!Settings::isSecret($key)) {
                continue;
            }
            $value = $body[$key];
            if (is_string($value) && str_contains($value, '•')) {
                unset($body[$key]);
            }
        }
        // Written by the updater, not by hand: letting these be PATCHed would
        // let the console claim a release exists that GitHub never published.
        unset(
            $body['auth.inviteToken'],
            $body['cron.token'],
            $body['cron.url'],
            $body['updates.latest'],
            $body['updates.lastResult'],
            $body['updates.lastCheckedAt'],
        );

        $rejected = Settings::setMany($body);
        if ($rejected !== []) {
            Http::validationFailed($rejected);
        }
        Audit::log('admin.settings', '', ['keys' => array_keys($body)]);
        Http::json($settingsPayload());
    });

    /* ---------------- users ---------------- */

    $router->get('/admin/users', static function (): void {
        Auth::requireAdmin();
        $where = ['1=1'];
        $params = [];
        $q = Http::query('q');
        if ($q !== null && $q !== '') {
            $where[] = "(email LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\')";
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], $q) . '%';
            $params[] = $like;
            $params[] = $like;
        }
        foreach (['status' => 'status', 'role' => 'role'] as $param => $column) {
            $value = Http::query($param);
            if ($value !== null && $value !== '') {
                $where[] = "$column = ?";
                $params[] = $value;
            }
        }
        $cursor = Http::query('cursor');
        $offset = $cursor !== null && ctype_digit($cursor) ? (int) $cursor : 0;
        $limit = 50;
        $params[] = $limit + 1;
        $params[] = $offset;

        $rows = Db::all(
            'SELECT * FROM users WHERE ' . implode(' AND ', $where) . ' ORDER BY created_at DESC LIMIT ? OFFSET ?',
            $params,
        );
        $next = null;
        if (count($rows) > $limit) {
            array_pop($rows);
            $next = (string) ($offset + $limit);
        }

        Http::json([
            'items' => array_map(static function (array $row): array {
                $public = Auth::publicUser($row);
                $public['id'] = (int) $row['id'];
                $public['lastLoginAt'] = $row['last_login_at'] === null ? null : (int) $row['last_login_at'];
                $public['palettes'] = (int) Db::value(
                    'SELECT COUNT(*) FROM palettes WHERE user_id = ? AND deleted_at IS NULL',
                    [(int) $row['id']],
                );
                return $public;
            }, $rows),
            'nextCursor' => $next,
        ]);
    });

    $router->patch('/admin/users/{id}', static function (array $args): void {
        $admin = Auth::requireAdmin();
        $id = (int) $args['id'];
        $target = Db::one('SELECT * FROM users WHERE id = ?', [$id]);
        if ($target === null) {
            Http::notFound('No such user.');
        }

        $body = Http::body();
        $v = Validator::make($body);
        $fields = [];
        $params = [];

        if (array_key_exists('role', $body)) {
            $role = $v->enum('role', 'Role', ['user', 'admin'], (string) $target['role']);
            // An installation with no administrator cannot be recovered through
            // the UI, so the last one cannot demote themselves.
            if ($role !== 'admin' && (string) $target['role'] === 'admin' && Auth::countAdmins() <= 1) {
                $v->add('role', 'This is the only administrator. Promote someone else first.');
            }
            $fields[] = 'role = ?';
            $params[] = $role;
        }
        if (array_key_exists('status', $body)) {
            $status = $v->enum('status', 'Status', ['pending', 'active', 'suspended'], (string) $target['status']);
            if ($status !== 'active' && (int) $target['id'] === (int) $admin['id']) {
                $v->add('status', 'You cannot suspend your own account.');
            }
            $fields[] = 'status = ?';
            $params[] = $status;
        }
        if (array_key_exists('displayName', $body)) {
            $name = $v->string('displayName', 'Display name', 1, 60);
            if ($name !== '' && Auth::displayNameTaken($name, $id)) {
                $v->add('displayName', 'That name is already taken. Pick another one.');
            }
            $fields[] = 'display_name = ?';
            $params[] = trim($name);
            $fields[] = 'display_name_lower = ?';
            $params[] = Auth::displayNameKey($name);
        }
        if (($body['emailVerified'] ?? null) === true) {
            $fields[] = 'email_verified_at = ?';
            $params[] = time();
        }
        $v->stopOnError();

        if ($fields !== []) {
            $fields[] = 'updated_at = ?';
            $params[] = time();
            $params[] = $id;
            Auth::guardingDisplayName(static function () use ($fields, $params): void {
                Db::run('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
            });
        }
        // A change of role or status has to take effect now, not when the
        // target's session happens to expire.
        if (array_key_exists('role', $body) || array_key_exists('status', $body)) {
            Session::revokeAllFor($id);
        }

        Audit::log('admin.user.update', (string) $target['uuid'], ['changes' => array_keys($body)]);
        $fresh = Db::one('SELECT * FROM users WHERE id = ?', [$id]);
        Http::json(Auth::publicUser($fresh ?? $target));
    });

    $router->post('/admin/users/{id}/reset-password', static function (array $args): void {
        Auth::requireAdmin();
        $target = Db::one('SELECT * FROM users WHERE id = ?', [(int) $args['id']]);
        if ($target === null) {
            Http::notFound('No such user.');
        }
        Mail::sendPasswordReset((int) $target['id'], (string) $target['email']);
        Audit::log('admin.user.reset', (string) $target['uuid']);
        Http::noContent();
    });

    $router->post('/admin/users/{id}/revoke-sessions', static function (array $args): void {
        Auth::requireAdmin();
        $count = Session::revokeAllFor((int) $args['id']);
        Audit::log('admin.user.revoke', (string) $args['id'], ['sessions' => $count]);
        Http::json(['revoked' => $count]);
    });

    $router->delete('/admin/users/{id}', static function (array $args): void {
        $admin = Auth::requireAdmin();
        $id = (int) $args['id'];
        if ($id === (int) $admin['id']) {
            Http::forbidden('Delete your own account from the account page, not from here.');
        }
        $target = Db::one('SELECT * FROM users WHERE id = ?', [$id]);
        if ($target === null) {
            Http::notFound('No such user.');
        }
        if ((string) $target['role'] === 'admin' && Auth::countAdmins() <= 1) {
            Http::forbidden('That is the only administrator.');
        }
        /*
         * Palettes go with the account.
         *
         * `palettes.user_id` is ON DELETE SET NULL, so deleting the row left
         * every palette behind — orphaned, and the public ones still listed in
         * Explore under no owner at all. The confirmation dialog says "the
         * account and every palette it owns are removed from the database", and
         * for someone asking to be forgotten that is the promise that matters.
         * Versions and likes cascade from the palettes; projects and sessions
         * already cascaded from the user.
         */
        $removed = Db::transaction(static function () use ($id): int {
            $count = (int) Db::value('SELECT COUNT(*) FROM palettes WHERE user_id = ?', [$id]);
            Db::run('DELETE FROM palettes WHERE user_id = ?', [$id]);
            Db::run('DELETE FROM users WHERE id = ?', [$id]);
            return $count;
        });
        Audit::log('admin.user.delete', (string) $target['uuid'] . ' (+' . $removed . ' palettes)');
        Http::noContent();
    });

    /* ---------------- content ---------------- */

    $router->get('/admin/palettes', static function (): void {
        Auth::requireAdmin();
        $where = ['p.deleted_at IS NULL'];
        $params = [];
        $q = Http::query('q');
        if ($q !== null && $q !== '') {
            $where[] = "(p.title LIKE ? ESCAPE '\\' OR p.hex_index LIKE ? ESCAPE '\\')";
            $like = '%' . str_replace(['%', '_'], ['\\%', '\\_'], strtolower(ltrim($q, '#'))) . '%';
            $params[] = $like;
            $params[] = $like;
        }
        $visibility = Http::query('visibility');
        if ($visibility !== null && $visibility !== '') {
            $where[] = 'p.visibility = ?';
            $params[] = $visibility;
        }
        $cursor = Http::query('cursor');
        $offset = $cursor !== null && ctype_digit($cursor) ? (int) $cursor : 0;
        $limit = 40;
        $params[] = $limit + 1;
        $params[] = $offset;

        $rows = Db::all(
            'SELECT p.*, u.display_name AS owner_name FROM palettes p
             LEFT JOIN users u ON u.id = p.user_id
             WHERE ' . implode(' AND ', $where) . ' ORDER BY p.updated_at DESC LIMIT ? OFFSET ?',
            $params,
        );
        $next = null;
        if (count($rows) > $limit) {
            array_pop($rows);
            $next = (string) ($offset + $limit);
        }
        Http::json([
            'items'      => array_map(static fn (array $r): array => Palettes::summary($r, true), $rows),
            'nextCursor' => $next,
        ]);
    });

    $router->patch('/admin/palettes/{uuid}', static function (array $args): void {
        Auth::requireAdmin();
        $row = Palettes::findByUuid((string) $args['uuid']);
        if ($row === null) {
            Http::notFound('No such palette.');
        }
        $body = Http::body();
        $changes = [];
        if (array_key_exists('visibility', $body) && is_string($body['visibility'])) {
            $changes['visibility'] = in_array($body['visibility'], ['private', 'unlisted', 'public'], true)
                ? $body['visibility']
                : (string) $row['visibility'];
        }
        if (array_key_exists('featured', $body)) {
            $changes['featured'] = $body['featured'] === true;
        }
        if (($body['takedown'] ?? null) === true) {
            $changes['visibility'] = 'private';
            $changes['featured'] = false;
        }
        Palettes::update((int) $row['id'], $changes);
        Audit::log('admin.palette.update', (string) $row['uuid'], $changes);
        Http::json(Palettes::summary(Palettes::findByUuid((string) $row['uuid']) ?? $row, true));
    });

    /* ---------------- mail ---------------- */

    $router->get('/admin/outbox', static function (): void {
        Auth::requireAdmin();
        $status = Http::query('status');
        $rows = $status !== null && $status !== ''
            ? Db::all('SELECT * FROM mail_outbox WHERE status = ? ORDER BY id DESC LIMIT 200', [$status])
            : Db::all('SELECT * FROM mail_outbox ORDER BY id DESC LIMIT 200');
        Http::json([
            'items' => array_map(static fn (array $r): array => [
                'id'        => (int) $r['id'],
                'to'        => (string) $r['to_addr'],
                'subject'   => (string) $r['subject'],
                'status'    => (string) $r['status'],
                'attempts'  => (int) $r['attempts'],
                'lastError' => (string) $r['last_error'],
                'createdAt' => (int) $r['created_at'],
                'sentAt'    => $r['sent_at'] === null ? null : (int) $r['sent_at'],
            ], $rows),
        ]);
    });

    $router->post('/admin/outbox/{id}/retry', static function (array $args): void {
        Auth::requireAdmin();
        Db::run("UPDATE mail_outbox SET status = 'queued', send_after = ?, attempts = 0 WHERE id = ?", [
            time(),
            (int) $args['id'],
        ]);
        $result = Mail::flush(5);
        Audit::log('admin.mail.retry', (string) $args['id'], $result);
        Http::json($result);
    });

    $router->delete('/admin/outbox/{id}', static function (array $args): void {
        Auth::requireAdmin();
        Db::run('DELETE FROM mail_outbox WHERE id = ?', [(int) $args['id']]);
        Http::noContent();
    });

    /**
     * Send a diagnostic message and report what actually happened.
     *
     * Deliberately not queued. Queueing it and calling `Mail::flush(1)` sent
     * whichever message happened to be first in line — so a test could report
     * success having never touched the address under test — and the per-hour
     * cap could swallow it entirely. Sending directly means the return value
     * describes this message and nothing else.
     *
     * The envelope goes back with the result because a `true` from `mail()`
     * only says the local transport accepted it. When a test "succeeds" and
     * nothing arrives, the From domain is almost always the reason, and the
     * administrator cannot check that without being told what it is.
     */
    $router->post('/admin/mail/test', static function (): void {
        $admin = Auth::requireAdmin();
        $to = is_string(Http::input('to')) ? trim((string) Http::input('to')) : '';
        if ($to === '') {
            $to = (string) $admin['email'];
        }
        if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
            Http::validationFailed(['to' => 'That does not look like an email address.']);
        }
        $site = Settings::str('site.name', 'DevColorz');
        $envelope = Mail::envelope();

        if (!$envelope['available']) {
            Http::json([
                'sent'     => false,
                'error'    => 'mail() is disabled on this host, so nothing can be sent.',
                'envelope' => $envelope,
            ]);
        }

        $ok = false;
        $error = '';
        try {
            $ok = Mail::send(
                $to,
                "$site test message",
                "This is a test message from $site.\n\n"
                    . "If it arrived, outgoing mail works on this host.\n\n"
                    . 'Sent from ' . Http::baseUrl() . ' at ' . date('c') . ".\n",
                '',
            );
        } catch (\Throwable $e) {
            $error = $e->getMessage();
        }
        if (!$ok && $error === '') {
            $error = Mail::lastError();
        }

        Audit::log('admin.mail.test', $to, ['ok' => $ok, 'error' => $error]);
        Http::json([
            'sent'     => $ok,
            'error'    => $error,
            'envelope' => $envelope,
        ]);
    });

    /* ---------------- system ---------------- */

    $router->get('/admin/audit', static function (): void {
        Auth::requireAdmin();
        Http::json(Audit::page(Http::query('cursor')));
    });

    /**
     * Run the checks for real.
     *
     * This is the only place the exposure probe runs on demand — the
     * administrator asked for it and is waiting for the answer. Everywhere
     * else reads the verdict this call stores.
     */
    /* ---------------- updates ---------------- */

    /**
     * Everything the console needs to describe the update situation.
     *
     * Deliberately a plain read: it reports what the last check found and does
     * not go to GitHub itself, so opening the System tab never blocks on a
     * network call the way `/meta` once did.
     */
    $updateStatus = static fn (): array => [
        'current'       => Updater::currentVersion(),
        'projectUrl'    => Updater::projectUrl(),
        'repository'    => Updater::REPO,
        'lastCheckedAt' => Settings::int('updates.lastCheckedAt', 0),
        'latest'        => Settings::get('updates.latest') ?: null,
        'available'     => Updater::available(),
        'lastResult'    => Settings::get('updates.lastResult') ?: null,
        'capabilities'  => Updater::capabilities(),
        'backups'       => Updater::backups(),
        'settings'      => [
            'checkEnabled' => Settings::bool('updates.checkEnabled', true),
            'checkHour'    => Settings::int('updates.checkHour', 5),
            'autoInstall'  => Settings::bool('updates.autoInstall', true),
        ],
    ];

    $router->get('/admin/update', static function () use ($updateStatus): void {
        Auth::requireAdmin();
        Http::json($updateStatus());
    });

    $router->post('/admin/update/check', static function () use ($updateStatus): void {
        Auth::requireAdmin();
        $result = Updater::check();
        Audit::log('update.check', $result['ok'] ? (string) ($result['latest']['version'] ?? '') : 'failed');
        Http::json(['result' => $result, 'status' => $updateStatus()]);
    });

    $router->post('/admin/update/install', static function () use ($updateStatus): void {
        Auth::requireAdmin();
        $result = Updater::install();
        // The response is written by the code that is being replaced, so it is
        // built before anything else touches the filesystem again.
        Http::json(['result' => $result, 'status' => $updateStatus()]);
    });

    $router->post('/admin/update/rollback', static function () use ($updateStatus): void {
        Auth::requireAdmin();
        $result = Updater::rollback();
        Http::json(['result' => $result, 'status' => $updateStatus()]);
    });

    $router->get('/admin/selftest', static function (): void {
        Auth::requireAdmin();
        $exposure = SelfTest::exposure();
        SelfTest::refreshExposure($exposure);
        Http::json(['checks' => array_merge(SelfTest::environment(), $exposure)]);
    });

    $router->post('/admin/maintenance', static function (): void {
        Auth::requireAdmin();
        $action = is_string(Http::input('action')) ? (string) Http::input('action') : '';

        $result = match ($action) {
            'checkpoint' => (static function (): array {
                // Report what happened rather than what was asked for: on a
                // build without WAL, or with a reader holding the log open, the
                // checkpoint is a no-op and saying "truncated" was untrue.
                $result = Db::checkpoint();
                return ['ok' => $result['ran'], 'detail' => $result['detail']];
            })(),
            'optimize' => (static function (): array {
                Db::optimize();
                return ['ok' => true, 'detail' => 'Query planner statistics refreshed.'];
            })(),
            'integrity' => (static function (): array {
                $result = Db::integrityCheck();
                return [
                    'ok'     => $result === 'ok',
                    'detail' => $result === 'ok' ? 'The database reports no corruption.' : $result,
                ];
            })(),
            'vacuum' => (static function (): array {
                $target = Paths::backups() . '/backup-' . date('Ymd-His') . '.sqlite';
                Db::backupTo($target);
                return ['ok' => true, 'detail' => 'Backup written to storage/backups/' . basename($target) . '.'];
            })(),
            'prune' => (static function (): array {
                $removed = RateLimit::prune()
                    + Security::pruneTokens()
                    + Session::prune()
                    + Mail::prune()
                    + Palettes::purgeDeleted()
                    + Audit::prune();
                return ['ok' => true, 'detail' => $removed . ' expired rows removed.'];
            })(),
            default => ['ok' => false, 'detail' => 'Unknown maintenance action.'],
        };

        Audit::log('admin.maintenance', $action, $result);
        Http::json($result);
    });

    $router->post('/admin/cron/rotate', static function (): void {
        Auth::requireAdmin();
        $config = Config::all();
        $config['cron_token'] = bin2hex(random_bytes(24));
        Config::write($config);
        Audit::log('admin.cron.rotate');
        // Shown once, in full: the administrator needs it to update the
        // scheduler, and it is never retrievable afterwards.
        Http::json([
            'cronToken' => $config['cron_token'],
            'cronUrl'   => Http::baseUrl() . '/cron.php?k=' . $config['cron_token'],
        ]);
    });

    $router->post('/admin/invite/rotate', static function (): void {
        Auth::requireAdmin();
        $config = Config::all();
        $config['invite_token'] = Config::readableToken();
        Config::write($config);
        Audit::log('admin.invite.rotate');
        Http::json(['inviteToken' => $config['invite_token']]);
    });

    $router->post('/admin/cron/run', static function (): void {
        Auth::requireAdmin();
        require_once __DIR__ . '/../lib/Cron.php';
        $job = is_string(Http::input('job')) ? (string) Http::input('job') : '';
        $result = Cron::run($job !== '' ? [$job] : null, microtime(true) + 15);
        Audit::log('admin.cron.run', $job, $result);
        Http::json(['ok' => true, 'detail' => $result]);
    });
}
