<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * First-run installation.
 *
 * The window between uploading the files and creating the first administrator
 * is the most dangerous moment in the life of a self-hosted app: whoever
 * reaches the installer first owns the installation. This is not theoretical —
 * it is a well-documented attack against WordPress deployments, and FTP uploads
 * make the window minutes rather than seconds.
 *
 * So installation requires proof of filesystem access. The status endpoint
 * writes a random code into `storage/setup-code.txt`, and the install endpoint
 * refuses to proceed without it. Someone who merely reached the URL first
 * cannot read that file; the person who uploaded the app can.
 */
function registerSetupRoutes(Router $router): void
{
    $codeFile = static fn (): string => Paths::storage() . '/setup-code.txt';

    /** Read the challenge code, creating one on first request. */
    $ensureCode = static function () use ($codeFile): string {
        Paths::ensure();
        $file = $codeFile();
        if (is_file($file)) {
            $existing = trim((string) @file_get_contents($file));
            // A code older than an hour is stale: regenerate, so an abandoned
            // half-installation cannot be resumed by someone who saw the file.
            if ($existing !== '' && filemtime($file) > time() - 3600) {
                return $existing;
            }
        }
        $code = Config::readableToken(3, 4);
        @file_put_contents($file, $code . "\n", LOCK_EX);
        @chmod($file, 0640);
        return $code;
    };

    $router->get('/setup/status', static function () use ($ensureCode): void {
        if (Config::installed()) {
            Http::json(['installed' => true, 'checks' => [], 'challengeFile' => null]);
        }

        $checks = SelfTest::environment();
        $code = $ensureCode();

        Http::json([
            'installed'     => false,
            'checks'        => $checks,
            // Only required checks block. The rest are shown, loudly, and
            // left to the operator's judgement.
            'ready'         => !array_filter(
                $checks,
                static fn (array $c): bool => ($c['required'] ?? false) && !$c['ok'],
            ),
            'challengeFile' => 'storage/setup-code.txt',
            'challengeHint' =>
                'Open storage/setup-code.txt over FTP or in your hosting file manager and copy the code it contains. '
                . 'This proves you are the person who uploaded these files, and not somebody who simply found the URL first. '
                . 'It is ' . strlen($code) . ' characters long and expires an hour after it is created.',
        ]);
    });

    $router->post('/setup/install', static function () use ($codeFile): void {
        if (Config::installed()) {
            Http::problem(410, 'Already installed', 'This installation has already been set up.');
        }
        // Deliberately tight: an attacker guessing the challenge code gets a
        // handful of attempts per hour, not thousands.
        //
        // The usual token bucket lives in the database, which does not exist
        // yet at this point in the installation, so the pre-install throttle is
        // a counter file instead. Crude, and entirely adequate for an endpoint
        // that can only ever succeed once.
        $attemptFile = Paths::storage() . '/setup-attempts';
        $attempts = is_file($attemptFile) ? (int) @file_get_contents($attemptFile) : 0;
        $since = is_file($attemptFile) ? (int) @filemtime($attemptFile) : 0;
        if ($since < time() - 3600) {
            $attempts = 0;
        }
        if ($attempts >= 10) {
            Http::tooManyRequests(900, 'Too many installation attempts. Wait an hour and try again.');
        }
        @file_put_contents($attemptFile, (string) ($attempts + 1), LOCK_EX);

        $file = $codeFile();
        $expected = is_file($file) ? trim((string) @file_get_contents($file)) : '';
        $body = Http::body();
        $provided = is_string($body['challengeCode'] ?? null) ? trim((string) $body['challengeCode']) : '';
        $normalise = static fn (string $s): string => strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $s) ?? '');

        if ($expected === '' || !Security::secretEquals($normalise($provided), $normalise($expected))) {
            Http::validationFailed([
                'challengeCode' => 'That code does not match the one in storage/setup-code.txt.',
            ]);
        }

        $v = Validator::make($body);
        $email = $v->email();
        $displayName = $v->string('displayName', 'Display name', 1, 60);
        $siteName = $v->string('siteName', 'Site name', 1, 60, false);

        // The password minimum comes from settings, which do not exist yet, so
        // the floor is applied directly here.
        $password = is_string($body['password'] ?? null) ? (string) $body['password'] : '';
        if (mb_strlen($password, 'UTF-8') < 12) {
            $v->add('password', 'The administrator password must be at least 12 characters.');
        }
        if (strlen($password) > 4096) {
            $v->add('password', 'That password is too long.');
        }
        $v->stopOnError();

        $secrets = Config::freshSecrets();
        Config::write($secrets);
        Config::reset();
        Db::disconnect();

        try {
            Db::connect();
            Schema::migrate();

            Db::transaction(static function () use ($email, $password, $displayName, $siteName): void {
                Auth::createUser($email, $password, $displayName, 'admin', 'active');
                Db::run('UPDATE users SET email_verified_at = ? WHERE email_lower = ?', [
                    time(),
                    mb_strtolower($email, 'UTF-8'),
                ]);
                if ($siteName !== '') {
                    Settings::set('site.name', $siteName);
                }
                Settings::set('site.baseUrl', Http::selfOrigin());
                Settings::set('mail.fromAddress', 'noreply@' . parse_url(Http::selfOrigin(), PHP_URL_HOST));
                Settings::set('mail.fromName', $siteName !== '' ? $siteName : 'DevColorz');
            });
        } catch (\Throwable $e) {
            // A failed install must not leave a config file behind, or the
            // wizard locks itself out of a half-built installation.
            @unlink(Paths::configFile());
            Config::reset();
            Db::disconnect();
            Http::problem(500, 'Installation failed', $e->getMessage());
        }

        @unlink($file);
        @file_put_contents(Paths::installedMarker(), date('c') . "\n");

        // The exposure probe makes live HTTP requests back to this host, so it
        // is the most fragile thing in the whole installer — and it runs after
        // the account already exists. It must never be able to turn a
        // successful install into a failed one.
        try {
            $exposure = SelfTest::exposure();
        } catch (\Throwable $e) {
            error_log('[devcolorz] exposure probe failed: ' . $e->getMessage());
            $exposure = [[
                'id'       => 'probe',
                'label'    => 'Exposure self-test',
                'required' => false,
                'ok'       => false,
                'detail'   => 'The self-test could not complete: ' . $e->getMessage()
                    . ' Check storage/ and config.php manually in a browser — neither should be downloadable.',
            ]];
        }
        Audit::log('setup.install', $email);

        // Sign the new administrator straight in: asking them to re-enter the
        // password they just chose adds nothing.
        $user = Auth::findByEmail($email);
        $csrf = $user !== null ? Session::start((int) $user['id'], false) : '';
        Auth::forget();

        Http::json([
            'ok'           => true,
            'cronToken'    => $secrets['cron_token'],
            'cronUrl'      => Http::selfOrigin() . '/cron.php?k=' . $secrets['cron_token'],
            'inviteToken'  => $secrets['invite_token'],
            'csrf'         => $csrf,
            'user'         => $user !== null ? Auth::publicUser($user) : null,
            'exposure'     => $exposure,
            // Shown once, prominently: neither token is retrievable afterwards,
            // only replaceable.
            'warning'      => 'Copy the cron token and the invitation code now. Neither can be shown again — you can only rotate them.',
        ]);
    });
}
