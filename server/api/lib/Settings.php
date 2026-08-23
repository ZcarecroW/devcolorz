<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Admin-editable settings.
 *
 * Defaults live in code so a fresh install works before anyone opens the admin
 * console, and only values the administrator has actually changed are stored.
 * That keeps the settings table readable and lets a later release improve a
 * default without silently overriding a deliberate choice.
 */
final class Settings
{
    /** @var array<string, mixed>|null */
    private static ?array $cache = null;

    /** @return array<string, mixed> */
    public static function defaults(): array
    {
        return [
            // Site
            'site.name'               => 'DevColorz',
            'site.baseUrl'            => '',
            'site.defaultAppearance'  => 'system',
            'site.maintenance'        => false,
            'site.maintenanceMessage' => 'DevColorz is briefly down for maintenance. Back shortly.',
            'site.allowAnonymous'     => true,
            'site.publicExplore'      => true,

            // Accounts
            'auth.registrationOpen'          => true,
            'auth.inviteRequired'            => true,
            'auth.requireEmailVerification'  => true,
            'auth.minPasswordLength'         => 12,
            'auth.sessionIdleMinutes'        => 43200,
            'auth.sessionAbsoluteHours'      => 720,
            'auth.allowAccountDeletion'      => true,
            'auth.emailDomainAllowlist'      => '',

            // Rate limiting — capacity per window, in seconds
            'ratelimit.login'                => ['capacity' => 8, 'perSeconds' => 300],
            'ratelimit.register'             => ['capacity' => 5, 'perSeconds' => 3600],
            'ratelimit.forgot'               => ['capacity' => 5, 'perSeconds' => 3600],
            'ratelimit.write'                => ['capacity' => 90, 'perSeconds' => 60],
            'ratelimit.read'                 => ['capacity' => 400, 'perSeconds' => 60],
            'ratelimit.lockoutThreshold'     => 5,
            'ratelimit.lockoutBaseSeconds'   => 2,
            'ratelimit.lockoutMaxSeconds'    => 900,
            'ratelimit.captchaThreshold'     => 3,

            // hCaptcha
            'captcha.enabled'        => true,
            'captcha.sitekey'        => '',
            'captcha.secret'         => '',
            'captcha.onRegister'     => true,
            'captcha.onLogin'        => true,
            'captcha.onForgot'       => true,
            'captcha.failOpen'       => false,
            'captcha.timeoutSeconds' => 5,

            // Mail
            'mail.fromName'      => 'DevColorz',
            'mail.fromAddress'   => '',
            'mail.replyTo'       => '',
            'mail.bounceAddress' => '',
            'mail.perHourCap'    => 100,
            'mail.subjectVerify' => 'Confirm your DevColorz account',
            'mail.subjectReset'  => 'Reset your DevColorz password',
            'mail.subjectChange' => 'Confirm your new email address',

            // Content
            'content.maxColors'          => 40,
            'content.maxPalettesPerUser' => 0,
            'content.moderation'         => 'open',

            // Engine defaults handed to new clients
            'engine.defaultFormat'         => 'oklch',
            'engine.defaultGamut'          => 'css4',
            'engine.defaultContrastMetric' => 'apca',
            'engine.defaultDarkStrategy'   => 'oklch-curve',
            'engine.defaultSwatchCount'    => 5,

            // Updates
            'updates.checkEnabled' => true,
            'updates.checkHour'    => 5,
            'updates.autoInstall'  => true,
            /*
             * What the last check found, and how the last install went. State
             * rather than preference, kept here for the same reason as the
             * exposure probe: this is the store that outlives a request.
             */
            'updates.lastCheckedAt' => 0,
            'updates.latest'        => [],
            'updates.lastResult'    => [],

            // Cron
            'cron.enabled' => true,

            /*
             * Result of the last exposure probe, written by SelfTest.
             * Not a preference — it lives here because it is the one store the
             * application already has, and it must outlive a request: probing
             * on demand meant six loopback HTTP calls on every admin page load.
             */
            'selftest.exposure' => ['exposed' => null, 'checkedAt' => 0],
        ];
    }

    /** @return array<string, mixed> */
    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $values = self::defaults();
        if (Config::installed()) {
            try {
                foreach (Db::all('SELECT key, value_json FROM settings') as $row) {
                    $decoded = json_decode((string) $row['value_json'], true);
                    $values[(string) $row['key']] = $decoded;
                }
            } catch (\Throwable) {
                // Before the first migration the table does not exist yet;
                // defaults are the correct answer in that window.
            }
        }
        self::$cache = $values;
        return $values;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $all = self::all();
        return array_key_exists($key, $all) ? $all[$key] : $default;
    }

    public static function bool(string $key, bool $default = false): bool
    {
        $value = self::get($key, $default);
        return is_bool($value) ? $value : (bool) $value;
    }

    public static function int(string $key, int $default = 0): int
    {
        $value = self::get($key, $default);
        return is_numeric($value) ? (int) $value : $default;
    }

    public static function str(string $key, string $default = ''): string
    {
        $value = self::get($key, $default);
        return is_string($value) ? $value : $default;
    }

    /**
     * A rate-limit bucket definition.
     *
     * @return array{capacity: int, perSeconds: int}
     */
    public static function bucket(string $key): array
    {
        $value = self::get($key);
        if (is_array($value) && isset($value['capacity'], $value['perSeconds'])) {
            return [
                'capacity'   => max(1, (int) $value['capacity']),
                'perSeconds' => max(1, (int) $value['perSeconds']),
            ];
        }
        return ['capacity' => 60, 'perSeconds' => 60];
    }

    public static function set(string $key, mixed $value): void
    {
        Db::run(
            'INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at',
            [$key, json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), time()],
        );
        self::$cache = null;
    }

    /**
     * Numeric settings where zero is a real answer rather than a mistake.
     *
     * Everywhere else zero is the value an emptied input sends, and storing it
     * did real damage: `content.maxColors` at 0 refuses every palette on the
     * instance, and a rate-limit capacity of 0 is not "no limit" but "nothing
     * gets through". Here it means something: no cap on palettes, and midnight
     * for the hour the update check runs at.
     *
     * @var list<string>
     */
    private const ZERO_ALLOWED = ['content.maxPalettesPerUser', 'updates.checkHour', 'updates.lastCheckedAt'];

    /**
     * Write settings, refusing values that do not fit the key.
     *
     * The admin console declares a type and a range for every field; the
     * server enforced neither, so an emptied number box arrived as 0 and was
     * stored as though it had been chosen. Values are coerced to the type of
     * the key's own default and rejected if they cannot be — and the caller is
     * told which, rather than the write half-succeeding in silence.
     *
     * @param  array<string, mixed> $values
     * @return array<string, string> Rejected keys, mapped to the reason.
     */
    public static function setMany(array $values): array
    {
        $known = self::defaults();
        $rejected = [];
        $accepted = [];

        foreach ($values as $key => $value) {
            // Only keys the application knows about: an open-ended settings
            // table is a place for junk to accumulate and for a typo to
            // silently do nothing.
            if (!array_key_exists($key, $known)) {
                continue;
            }
            $default = $known[$key];

            if (is_int($default)) {
                if (is_bool($value) || !is_numeric($value)) {
                    $rejected[$key] = 'Must be a number.';
                    continue;
                }
                $number = (int) $value;
                $floor = in_array($key, self::ZERO_ALLOWED, true) ? 0 : 1;
                if ($number < $floor) {
                    $rejected[$key] = $floor === 0
                        ? 'Must be zero or more.'
                        : 'Must be at least 1. Leave the default if you do not want a limit here.';
                    continue;
                }
                $accepted[$key] = $number;
                continue;
            }
            if (is_bool($default)) {
                $accepted[$key] = (bool) $value;
                continue;
            }
            if (is_string($default)) {
                if (!is_string($value) && !is_numeric($value)) {
                    $rejected[$key] = 'Must be text.';
                    continue;
                }
                $accepted[$key] = (string) $value;
                continue;
            }
            if (is_array($default) && !is_array($value)) {
                $rejected[$key] = 'Must be an object.';
                continue;
            }
            $accepted[$key] = $value;
        }

        if ($accepted !== []) {
            Db::transaction(static function () use ($accepted): void {
                foreach ($accepted as $key => $value) {
                    self::set($key, $value);
                }
            });
        }
        self::$cache = null;
        return $rejected;
    }

    public static function reset(): void
    {
        self::$cache = null;
    }

    /** Keys whose values must never leave the server in full. */
    public static function isSecret(string $key): bool
    {
        return in_array($key, ['captcha.secret'], true);
    }

    /** Mask a secret for display: keep enough to recognise, not enough to use. */
    public static function mask(string $value): string
    {
        $length = strlen($value);
        if ($length === 0) {
            return '';
        }
        if ($length <= 8) {
            return str_repeat('•', $length);
        }
        return substr($value, 0, 4) . str_repeat('•', min(24, $length - 8)) . substr($value, -4);
    }
}
