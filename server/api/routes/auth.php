<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Registration, sign-in and account management.
 *
 * The recurring theme: never let a response reveal whether an account exists.
 * Registration, sign-in and password reset all answer identically for a known
 * and an unknown address, and the sign-in path burns a dummy password hash when
 * the account is missing so the timing matches too.
 */
function registerAuthRoutes(Router $router): void
{
    /* ---------------- register ---------------- */

    $router->post('/auth/register', static function (): void {
        RateLimit::enforce('register');

        if (!Settings::bool('auth.registrationOpen', true)) {
            Http::forbidden('Registration is closed on this installation.');
        }

        $body = Http::body();
        $v = Validator::make($body);
        $email = $v->email();
        $password = $v->password();
        $displayName = $v->string('displayName', 'Display name', 1, 60);

        // The invitation code is the whole access-control model here: anyone
        // may hold the link, but only someone the administrator told can use it.
        if (Settings::bool('auth.inviteRequired', true)) {
            $provided = is_string($body['inviteToken'] ?? null) ? trim((string) $body['inviteToken']) : '';
            $expected = Config::string('invite_token');
            $normalise = static fn (string $s): string => strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $s) ?? '');
            if ($expected === '' || !Security::secretEquals($normalise($provided), $normalise($expected))) {
                $v->add('inviteToken', 'That invitation code is not valid.');
            }
        }
        $v->stopOnError();

        Captcha::enforce('register', is_string($body['captchaToken'] ?? null) ? (string) $body['captchaToken'] : '');

        $existing = Auth::findByEmail($email);
        if ($existing !== null) {
            // Same response as a successful registration. If the address really
            // is registered, the owner gets an email telling them so — which is
            // both more useful and less leaky than a form error.
            //
            // Both halves of that had to be made true. The mail was described
            // here and never sent, and this branch returned in a couple of
            // milliseconds while the real one spent an Argon2id hash and two
            // inserts — a difference an attacker can measure over a handful of
            // samples, which turns "we never say whether an address exists"
            // into exactly that.
            Auth::fakePasswordCheck();
            Mail::sendRegistrationAttempt($email, (string) $existing['display_name']);
            Audit::log('auth.register.duplicate', $email);
            Http::noContent();
        }

        $verificationRequired = Settings::bool('auth.requireEmailVerification', true);

        Db::transaction(static function () use ($email, $password, $displayName, $verificationRequired): void {
            $created = Auth::createUser(
                $email,
                $password,
                $displayName,
                'user',
                $verificationRequired ? 'pending' : 'active',
            );
            if ($verificationRequired) {
                Mail::sendVerification($created['id'], $email, $displayName);
            } else {
                Db::run('UPDATE users SET email_verified_at = ? WHERE id = ?', [time(), $created['id']]);
            }
        });

        Audit::log('auth.register', $email);
        Http::noContent();
    });

    /* ---------------- verify ---------------- */

    $router->post('/auth/verify', static function (): void {
        RateLimit::enforce('login');
        $token = is_string(Http::input('token')) ? (string) Http::input('token') : '';

        // One endpoint, two purposes: a new account confirming its address, and
        // an existing account confirming a change of address.
        $claim = Security::consumeToken($token, 'verify');
        $purpose = 'verify';
        if ($claim === null) {
            $claim = Security::consumeToken($token, 'email_change');
            $purpose = 'email_change';
        }
        if ($claim === null) {
            Http::problem(410, 'Link expired', 'That confirmation link has already been used or has expired.');
        }

        $userId = $claim['user_id'];
        $now = time();

        if ($purpose === 'email_change') {
            $newEmail = is_string($claim['payload']['email'] ?? null) ? (string) $claim['payload']['email'] : '';
            if ($newEmail === '' || !filter_var($newEmail, FILTER_VALIDATE_EMAIL)) {
                Http::problem(400, 'Invalid link', 'That confirmation link is malformed.');
            }
            $taken = Auth::findByEmail($newEmail);
            if ($taken !== null && (int) $taken['id'] !== $userId) {
                Http::problem(409, 'Address in use', 'That address now belongs to another account.');
            }
            Db::run(
                'UPDATE users SET email = ?, email_lower = ?, email_verified_at = ?, updated_at = ? WHERE id = ?',
                [$newEmail, mb_strtolower($newEmail, 'UTF-8'), $now, $now, $userId],
            );
            Audit::log('auth.email.changed', (string) $userId);
        } else {
            Db::run(
                "UPDATE users SET status = CASE WHEN status = 'pending' THEN 'active' ELSE status END,
                 email_verified_at = ?, updated_at = ? WHERE id = ?",
                [$now, $now, $userId],
            );
            Audit::log('auth.verified', (string) $userId);
        }

        $user = Db::one('SELECT * FROM users WHERE id = ?', [$userId]);
        if ($user === null) {
            Http::problem(410, 'Link expired', 'That account no longer exists.');
        }
        Http::json(['user' => Auth::publicUser($user)]);
    });

    /* ---------------- login ---------------- */

    $router->post('/auth/login', static function (): void {
        RateLimit::enforce('login');

        $body = Http::body();
        $email = is_string($body['email'] ?? null) ? trim((string) $body['email']) : '';
        $password = is_string($body['password'] ?? null) ? (string) $body['password'] : '';
        $remember = ($body['remember'] ?? false) === true;
        $captchaToken = is_string($body['captchaToken'] ?? null) ? (string) $body['captchaToken'] : '';

        if ($email === '' || $password === '') {
            Http::validationFailed([
                'email'    => $email === '' ? 'Enter your email address.' : '',
                'password' => $password === '' ? 'Enter your password.' : '',
            ]);
        }

        $accountKey = 'email:' . hash('sha256', mb_strtolower($email, 'UTF-8'));
        $state = RateLimit::loginState($accountKey);

        // Once an account has seen a few failures, a captcha is required even if
        // the administrator has not switched it on for every sign-in.
        if ($state['captcha'] || Captcha::requiredFor('login')) {
            if (Captcha::enabled() && $captchaToken === '') {
                Http::problem(401, 'Verification needed', 'Please complete the challenge to continue.', [
                    'captcha' => true,
                ]);
            }
            Captcha::enforce('login', $captchaToken, true);
        }

        $genericFailure = static function () use ($accountKey): never {
            RateLimit::loginFailed($accountKey, Http::ipKey());
            $state = RateLimit::loginState($accountKey);
            // Identical body whether the password was wrong, the account is
            // locked, or the account does not exist. The only thing that varies
            // is whether the client should now show a captcha.
            Http::problem(401, 'Sign-in failed', 'That email address and password do not match.', [
                'captcha' => $state['captcha'] && Captcha::enabled(),
            ]);
        };

        if ($state['locked']) {
            $genericFailure();
        }

        $user = Auth::findByEmail($email);
        if ($user === null) {
            // Spend the same time a real check would, so response latency does
            // not enumerate the user table.
            Auth::fakePasswordCheck();
            $genericFailure();
        }

        if (!Security::verifyPassword($password, (string) $user['password_hash'])) {
            $genericFailure();
        }

        $status = (string) $user['status'];
        if ($status === 'suspended') {
            Audit::log('auth.login.suspended', (string) $user['uuid']);
            Http::problem(403, 'Account suspended', 'This account has been suspended. Contact the administrator.');
        }
        if ($status === 'pending') {
            Http::problem(403, 'Not confirmed yet', 'Confirm your email address first. Check your inbox for the link.', [
                'pending' => true,
            ]);
        }

        // The password was right, so re-hash it if the cost parameters have
        // moved on since it was set.
        if (Security::needsRehash((string) $user['password_hash'])) {
            Db::run('UPDATE users SET password_hash = ? WHERE id = ?', [
                Security::hashPassword($password),
                (int) $user['id'],
            ]);
        }

        RateLimit::loginSucceeded($accountKey, Http::ipKey());
        $csrf = Session::start((int) $user['id'], $remember);
        Db::run('UPDATE users SET last_login_at = ? WHERE id = ?', [time(), (int) $user['id']]);
        Auth::forget();
        Audit::log('auth.login', (string) $user['uuid']);

        Http::json(['user' => Auth::publicUser($user), 'csrf' => $csrf]);
    });

    /* ---------------- session ---------------- */

    $router->post('/auth/logout', static function (): void {
        $user = Auth::user();
        Session::logout();
        if ($user !== null) {
            Audit::log('auth.logout', (string) $user['uuid']);
        }
        Http::noContent();
    });

    $router->post('/auth/logout-all', static function (): void {
        $user = Auth::require();
        Session::revokeAllFor((int) $user['id']);
        Audit::log('auth.logout_all', (string) $user['uuid']);
        Http::noContent();
    });

    $router->get('/auth/me', static function (): void {
        $user = Auth::require();
        Http::json(Auth::publicUser($user));
    });

    $router->patch('/auth/me', static function (): void {
        $user = Auth::require();
        $body = Http::body();
        $v = Validator::make($body);
        $fields = [];
        $params = [];

        if (array_key_exists('displayName', $body)) {
            $name = $v->string('displayName', 'Display name', 1, 60);
            $fields[] = 'display_name = ?';
            $params[] = $name;
        }
        if (array_key_exists('prefs', $body)) {
            $prefs = $v->json('prefs', 'Preferences', 16384);
            $fields[] = 'prefs_json = ?';
            $params[] = json_encode($prefs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        $v->stopOnError();

        if ($fields !== []) {
            $fields[] = 'updated_at = ?';
            $params[] = time();
            $params[] = (int) $user['id'];
            Db::run('UPDATE users SET ' . implode(', ', $fields) . ' WHERE id = ?', $params);
        }

        $fresh = Db::one('SELECT * FROM users WHERE id = ?', [(int) $user['id']]);
        Http::json(Auth::publicUser($fresh ?? $user));
    });

    /* ---------------- password ---------------- */

    $router->post('/auth/forgot', static function (): void {
        RateLimit::enforce('forgot');
        $body = Http::body();
        $email = is_string($body['email'] ?? null) ? trim((string) $body['email']) : '';
        Captcha::enforce('forgot', is_string($body['captchaToken'] ?? null) ? (string) $body['captchaToken'] : '');

        if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $user = Auth::findByEmail($email);
            if ($user !== null && (string) $user['status'] !== 'suspended') {
                Mail::sendPasswordReset((int) $user['id'], (string) $user['email']);
            }
        }
        // Always 204, always at roughly the same speed: whether an address is
        // registered is not information this endpoint gives away.
        Audit::log('auth.forgot', $email === '' ? '(blank)' : hash('sha256', $email));
        Http::noContent();
    });

    $router->post('/auth/reset', static function (): void {
        RateLimit::enforce('login');
        $body = Http::body();
        $token = is_string($body['token'] ?? null) ? (string) $body['token'] : '';
        $v = Validator::make($body);
        $password = $v->password('password', 'New password');
        $v->stopOnError();

        $claim = Security::consumeToken($token, 'reset');
        if ($claim === null) {
            Http::problem(410, 'Link expired', 'That reset link has already been used or has expired.');
        }

        $userId = $claim['user_id'];
        Db::transaction(static function () use ($userId, $password): void {
            Db::run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
                Security::hashPassword($password),
                time(),
                $userId,
            ]);
            // Resetting a password is what you do when you think someone else
            // has it. Ending every session is the whole point.
            Session::revokeAllFor($userId);
            Security::revokeTokens($userId, 'reset');
        });

        $user = Db::one('SELECT email FROM users WHERE id = ?', [$userId]);
        if ($user !== null) {
            Mail::sendPasswordChangedNotice((string) $user['email']);
        }
        Audit::log('auth.reset', (string) $userId);
        Http::noContent();
    });

    $router->post('/auth/change-password', static function (): void {
        $user = Auth::require();
        $body = Http::body();
        $current = is_string($body['currentPassword'] ?? null) ? (string) $body['currentPassword'] : '';
        $v = Validator::make(['password' => $body['newPassword'] ?? null]);
        $next = $v->password('password', 'New password');
        $v->stopOnError();

        if (!Security::verifyPassword($current, (string) $user['password_hash'])) {
            Http::validationFailed(['currentPassword' => 'That is not your current password.']);
        }

        Db::transaction(static function () use ($user, $next): void {
            Db::run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
                Security::hashPassword($next),
                time(),
                (int) $user['id'],
            ]);
            Session::revokeAllFor((int) $user['id'], true);
        });

        Mail::sendPasswordChangedNotice((string) $user['email']);
        Audit::log('auth.password.changed', (string) $user['uuid']);
        Http::noContent();
    });

    $router->post('/auth/change-email', static function (): void {
        $user = Auth::require();
        $body = Http::body();
        $v = Validator::make($body);
        $email = $v->email();
        $password = is_string($body['password'] ?? null) ? (string) $body['password'] : '';
        $v->stopOnError();

        if (!Security::verifyPassword($password, (string) $user['password_hash'])) {
            Http::validationFailed(['password' => 'That is not your current password.']);
        }
        if (mb_strtolower($email, 'UTF-8') === (string) $user['email_lower']) {
            Http::validationFailed(['email' => 'That is already your address.']);
        }

        // Deliberately does not reveal whether the new address is taken: the
        // confirmation link simply never arrives, and the check happens when it
        // is redeemed.
        $taken = Auth::findByEmail($email);
        if ($taken === null) {
            Mail::sendEmailChange((int) $user['id'], $email);
        }
        Audit::log('auth.email.requested', (string) $user['uuid']);
        Http::noContent();
    });

    /* ---------------- account ---------------- */

    $router->delete('/auth/account', static function (): void {
        $user = Auth::require();
        if (!Settings::bool('auth.allowAccountDeletion', true)) {
            Http::forbidden('Self-service account deletion is disabled on this installation.');
        }
        $password = is_string(Http::input('password')) ? (string) Http::input('password') : '';
        if (!Security::verifyPassword($password, (string) $user['password_hash'])) {
            Http::validationFailed(['password' => 'That is not your password.']);
        }
        if ((string) $user['role'] === 'admin' && Auth::countAdmins() <= 1) {
            Http::forbidden('You are the only administrator. Promote someone else before deleting your account.');
        }

        $uuid = (string) $user['uuid'];
        Db::transaction(static function () use ($user): void {
            // Public palettes survive their author, orphaned rather than
            // deleted, so shared links do not break. Everything private goes.
            Db::run("DELETE FROM palettes WHERE user_id = ? AND visibility <> 'public'", [(int) $user['id']]);
            Db::run('DELETE FROM users WHERE id = ?', [(int) $user['id']]);
        });
        Session::logout();
        Audit::log('auth.account.deleted', $uuid);
        Http::noContent();
    });

    $router->get('/account/export', static function (): void {
        $user = Auth::require();
        $palettes = Db::all('SELECT * FROM palettes WHERE user_id = ? AND deleted_at IS NULL', [
            (int) $user['id'],
        ]);
        Http::json([
            'exportedAt' => date('c'),
            'user'       => Auth::publicUser($user),
            'palettes'   => array_map(static fn (array $r): array => Palettes::summary($r), $palettes),
        ]);
    });
}
