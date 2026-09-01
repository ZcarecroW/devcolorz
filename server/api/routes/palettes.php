<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Palette CRUD, the public feed and public palette pages.
 */
function registerPaletteRoutes(Router $router): void
{
    /** Load a palette the caller is allowed to write to, or end the request. */
    $ownedOrFail = static function (string $uuid): array {
        $user = Auth::require();
        $row = Palettes::findByUuid($uuid);
        if ($row === null) {
            Http::notFound('No such palette.');
        }
        if ((int) ($row['user_id'] ?? 0) !== (int) $user['id'] && !Auth::isAdmin()) {
            // 404 rather than 403: confirming that a palette exists but belongs
            // to somebody else is information the caller has not earned.
            Http::notFound('No such palette.');
        }
        return $row;
    };

    /* ---------------- own library ---------------- */

    $router->get('/palettes', static function (): void {
        $user = Auth::require();
        Http::json(Palettes::listForUser(
            (int) $user['id'],
            Http::query('q'),
            Http::query('sort', 'updated') ?? 'updated',
            Http::query('cursor'),
        ));
    });

    $router->post('/palettes', static function (): void {
        $user = Auth::require();

        $limit = Settings::int('content.maxPalettesPerUser', 0);
        if ($limit > 0) {
            $count = (int) Db::value(
                'SELECT COUNT(*) FROM palettes WHERE user_id = ? AND deleted_at IS NULL',
                [(int) $user['id']],
            );
            if ($count >= $limit) {
                Http::forbidden('You have reached the limit of ' . $limit . ' saved palettes.');
            }
        }

        $v = Validator::make(Http::body());
        $title = $v->string('title', 'Title', 0, 120, false);
        $description = $v->string('description', 'Description', 0, 2000, false);
        $doc = $v->json('doc', 'Palette');
        $visibility = $v->enum('visibility', 'Visibility', ['private', 'unlisted', 'public'], 'private');
        $v->stopOnError();

        $hexes = Palettes::hexes($doc);
        if ($hexes === []) {
            Http::validationFailed(['doc' => 'That palette contains no colors.']);
        }
        $max = Settings::int('content.maxColors', 40);
        if (count($hexes) > $max) {
            Http::validationFailed(['doc' => 'Palettes are limited to ' . $max . ' colors here.']);
        }

        $created = Palettes::create(
            (int) $user['id'],
            $title !== '' ? $title : 'Untitled palette',
            $description,
            $doc,
            $visibility,
        );
        $row = Palettes::findByUuid($created['uuid']);
        Audit::log('palette.create', $created['uuid']);
        Http::json(Palettes::summary($row ?? []), 201);
    });

    $router->get('/palettes/{uuid}', static function (array $args) use ($ownedOrFail): void {
        $uuid = (string) $args['uuid'];
        $row = Palettes::findByUuid($uuid);
        if ($row === null) {
            Http::notFound('No such palette.');
        }
        $isOwner = Auth::id() !== null && (int) ($row['user_id'] ?? 0) === Auth::id();
        if (!$isOwner && (string) $row['visibility'] === 'private') {
            // The same 404 whoever asks. Sending an anonymous caller through
            // the sign-in check answered 401 for a private palette and 404
            // for a missing one — the existence the 404 is there to hide.
            if (Auth::id() === null) {
                Http::notFound('No such palette.');
            }
            $ownedOrFail($uuid);
        }
        Http::json(Palettes::summary($row));
    });

    $router->patch('/palettes/{uuid}', static function (array $args) use ($ownedOrFail): void {
        $row = $ownedOrFail((string) $args['uuid']);
        $body = Http::body();
        $v = Validator::make($body);
        $changes = [];

        if (array_key_exists('title', $body)) {
            $changes['title'] = $v->string('title', 'Title', 0, 120, false);
        }
        if (array_key_exists('description', $body)) {
            $changes['description'] = $v->string('description', 'Description', 0, 2000, false);
        }
        if (array_key_exists('visibility', $body)) {
            $changes['visibility'] = $v->enum(
                'visibility',
                'Visibility',
                ['private', 'unlisted', 'public'],
                (string) $row['visibility'],
            );
        }
        if (array_key_exists('doc', $body)) {
            $doc = $v->json('doc', 'Palette');
            $hexes = Palettes::hexes($doc);
            $max = Settings::int('content.maxColors', 40);
            if ($hexes === []) {
                $v->add('doc', 'That palette contains no colors.');
            } elseif (count($hexes) > $max) {
                $v->add('doc', 'Palettes are limited to ' . $max . ' colors here.');
            }
            $changes['doc'] = $doc;
        }
        $v->stopOnError();

        // Moderation: when review is required, an ordinary user can request
        // publication but only an administrator can grant it.
        if (
            ($changes['visibility'] ?? null) === 'public'
            && Settings::str('content.moderation', 'open') === 'review'
            && !Auth::isAdmin()
        ) {
            $changes['visibility'] = 'unlisted';
        }

        Palettes::update((int) $row['id'], $changes);
        $fresh = Palettes::findByUuid((string) $row['uuid']);
        Audit::log('palette.update', (string) $row['uuid']);
        Http::json(Palettes::summary($fresh ?? $row));
    });

    $router->delete('/palettes/{uuid}', static function (array $args) use ($ownedOrFail): void {
        $row = $ownedOrFail((string) $args['uuid']);
        Palettes::softDelete((int) $row['id']);
        Audit::log('palette.delete', (string) $row['uuid']);
        Http::noContent();
    });

    $router->get('/palettes/{uuid}/versions', static function (array $args) use ($ownedOrFail): void {
        $row = $ownedOrFail((string) $args['uuid']);
        $versions = Db::all(
            'SELECT version, label, created_at FROM palette_versions WHERE palette_id = ? ORDER BY version DESC',
            [(int) $row['id']],
        );
        Http::json([
            'items' => array_map(static fn (array $v): array => [
                'version'   => (int) $v['version'],
                'label'     => (string) $v['label'],
                'createdAt' => (int) $v['created_at'],
            ], $versions),
        ]);
    });

    $router->post('/palettes/{uuid}/restore/{version}', static function (array $args) use ($ownedOrFail): void {
        $row = $ownedOrFail((string) $args['uuid']);
        $version = (int) $args['version'];
        $snapshot = Db::one('SELECT doc_json FROM palette_versions WHERE palette_id = ? AND version = ?', [
            (int) $row['id'],
            $version,
        ]);
        if ($snapshot === null) {
            Http::notFound('No such version.');
        }
        $doc = json_decode((string) $snapshot['doc_json'], true);
        if (!is_array($doc)) {
            Http::problem(500, 'Corrupt version', 'That saved version could not be read.');
        }
        // Restoring is itself an edit, so the current state is snapshotted too
        // and an unwanted restore can be undone.
        Palettes::update((int) $row['id'], ['doc' => $doc]);
        Audit::log('palette.restore', (string) $row['uuid'], ['version' => $version]);
        Http::json(Palettes::summary(Palettes::findByUuid((string) $row['uuid']) ?? $row));
    });

    /* ---------------- explore ---------------- */

    $router->get('/explore', static function (): void {
        if (!Settings::bool('site.publicExplore', true)) {
            Http::forbidden('The public gallery is disabled on this installation.');
        }
        $count = Http::query('count');
        Http::json(Palettes::explore(
            Http::query('sort', 'trending') ?? 'trending',
            Http::query('q'),
            $count !== null && ctype_digit($count) ? (int) $count : null,
            Http::query('cursor'),
        ));
    });

    $router->get('/explore/{slug}', static function (array $args): void {
        $row = Palettes::findBySlug((string) $args['slug']);
        if ($row === null || (string) $row['visibility'] === 'private') {
            Http::notFound('No such palette.');
        }
        // Fire-and-forget view count: it is a vanity metric, and taking a write
        // lock for it on every read would be a poor trade.
        Db::run('UPDATE palettes SET views = views + 1 WHERE id = ?', [(int) $row['id']]);

        $summary = Palettes::summary($row, true);
        $summary['description'] = (string) $row['description'];
        $summary['liked'] = Palettes::hasLiked((int) $row['id']);
        Http::json($summary);
    });

    $router->post('/palettes/{uuid}/like', static function (array $args): void {
        $row = Palettes::findByUuid((string) $args['uuid']);
        if ($row === null || (string) $row['visibility'] === 'private') {
            Http::notFound('No such palette.');
        }
        Http::json(Palettes::toggleLike((int) $row['id']));
    });

    /* ---------------- sync ---------------- */

    $router->post('/palettes/sync', static function (): void {
        $user = Auth::require();
        $items = Http::input('items');
        if (!is_array($items)) {
            Http::validationFailed(['items' => 'Expected a list of palettes.']);
        }
        if (count($items) > 200) {
            Http::validationFailed(['items' => 'Sync at most 200 palettes at a time.']);
        }

        // The same rules as a single create or edit. Sync used to apply none
        // of them, so a document with no colours, forty-one of them, or a
        // megabyte of title went straight into the table, past the instance's
        // own palette quota.
        $maxColors = Settings::int('content.maxColors', 40);
        $quota = Settings::int('content.maxPalettesPerUser', 0);
        $errors = [];
        foreach ($items as $index => $item) {
            if (!is_array($item) || !is_array($item['doc'] ?? null)) {
                continue;
            }
            $hexes = Palettes::hexes($item['doc']);
            if ($hexes === []) {
                $errors["items.$index.doc"] = 'That palette contains no colors.';
            } elseif (count($hexes) > $maxColors) {
                $errors["items.$index.doc"] = 'Palettes are limited to ' . $maxColors . ' colors here.';
            }
            if (isset($item['title']) && (!is_string($item['title']) || mb_strlen($item['title']) > 120)) {
                $errors["items.$index.title"] = 'Title must be 120 characters or fewer.';
            }
        }
        if ($errors !== []) {
            Http::validationFailed($errors);
        }

        $applied = 0;
        Db::transaction(static function () use ($items, $user, $quota, &$applied): void {
            $owned = $quota > 0
                ? (int) Db::value(
                    'SELECT COUNT(*) FROM palettes WHERE user_id = ? AND deleted_at IS NULL',
                    [(int) $user['id']],
                )
                : 0;
            foreach ($items as $item) {
                if (!is_array($item) || !is_array($item['doc'] ?? null)) {
                    continue;
                }
                $uuid = is_string($item['uuid'] ?? null) ? (string) $item['uuid'] : '';
                $updatedAt = is_numeric($item['updatedAt'] ?? null) ? (int) $item['updatedAt'] : time();
                $title = is_string($item['title'] ?? null) && trim($item['title']) !== ''
                    ? trim((string) $item['title'])
                    : 'Untitled palette';

                $existing = $uuid !== '' ? Palettes::findByUuid($uuid) : null;
                if ($existing === null) {
                    if ($quota > 0 && $owned >= $quota) {
                        Http::forbidden('You have reached the limit of ' . $quota . ' saved palettes.');
                    }
                    Palettes::create((int) $user['id'], $title, '', $item['doc'], 'private');
                    $owned++;
                    $applied++;
                    continue;
                }
                if ((int) $existing['user_id'] !== (int) $user['id']) {
                    continue;
                }
                // Last write wins, decided by the client's own timestamp. Two
                // devices editing the same palette is rare enough that a merge
                // UI would cost more than it is worth; the version history is
                // the safety net.
                if ($updatedAt > (int) $existing['updated_at']) {
                    Palettes::update((int) $existing['id'], ['title' => $title, 'doc' => $item['doc']]);
                    $applied++;
                }
            }
        });

        Http::json(['applied' => $applied]);
    });
}
