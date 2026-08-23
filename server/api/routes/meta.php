<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Metadata and the CSRF handshake.
 *
 * `/meta` is the first call the SPA makes. It carries only what the client
 * needs to decide what to render — feature flags, limits, the captcha site key
 * — and adds a health block for administrators.
 */
function registerMetaRoutes(Router $router): void
{
    $router->get('/meta', static function (): void {
        $payload = [
            'installed' => true,
            'appName'   => Settings::str('site.name', 'DevColorz'),
            'version'   => APP_VERSION,
            'features'  => [
                'registration' => Settings::bool('auth.registrationOpen', true),
                'explore'      => Settings::bool('site.publicExplore', true),
                'anonymous'    => Settings::bool('site.allowAnonymous', true),
                'captcha'      => Captcha::enabled(),
                'inviteOnly'   => Settings::bool('auth.inviteRequired', true),
                // The sign-up form promises a confirmation email on success.
                // When verification is off no email is sent and the account is
                // live immediately, so the client has to know which it is.
                'emailVerification' => Settings::bool('auth.requireEmailVerification', true),
            ],
            'captcha' => [
                'provider' => Captcha::enabled() ? 'hcaptcha' : null,
                'sitekey'  => Captcha::enabled() ? Settings::str('captcha.sitekey') : null,
            ],
            'limits' => [
                'maxColors'   => Settings::int('content.maxColors', 40),
                'maxPalettes' => Settings::int('content.maxPalettesPerUser', 0) ?: null,
                // Mirrors Validator::password(), including its floor of 8, so
                // the meter on the form and the check on the server agree.
                'minPasswordLength' => max(8, Settings::int('auth.minPasswordLength', 12)),
            ],
            'defaults' => [
                'appearance'     => Settings::str('site.defaultAppearance', 'system'),
                'format'         => Settings::str('engine.defaultFormat', 'oklch'),
                'gamut'          => Settings::str('engine.defaultGamut', 'css4'),
                'contrastMetric' => Settings::str('engine.defaultContrastMetric', 'apca'),
                'darkStrategy'   => Settings::str('engine.defaultDarkStrategy', 'oklch-curve'),
                'swatchCount'    => Settings::int('engine.defaultSwatchCount', 5),
            ],
        ];

        if (Auth::isAdmin()) {
            $lastCron = Db::value("SELECT MAX(started_at) FROM cron_runs WHERE ok = 1");
            // The stored verdict, not a fresh probe: probing here made six
            // serial loopback requests part of the first call the SPA makes.
            $exposure = SelfTest::exposureStatus();
            $payload['health'] = [
                'wal'                => Db::isWal(),
                'cronLastRun'        => $lastCron === null ? null : (int) $lastCron,
                'outboxQueued'       => (int) Db::value("SELECT COUNT(*) FROM mail_outbox WHERE status = 'queued'"),
                'storageExposed'     => $exposure['exposed'],
                'storageCheckedAt'   => $exposure['checkedAt'] ?: null,
            ];
        }

        Http::json($payload);
    });

    /**
     * Issue a CSRF token.
     *
     * This also creates an anonymous session when there is none, which is what
     * lets a logged-out visitor like a palette or hit a rate-limited endpoint
     * without the server having to trust an unauthenticated request blindly.
     */
    $router->get('/csrf', static function (): void {
        Http::json(['token' => Session::csrfToken()]);
    });
}
