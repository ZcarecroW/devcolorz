<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * hCaptcha verification.
 *
 * Points worth knowing, each learned from an incident report somewhere:
 *
 * - The siteverify endpoint takes `application/x-www-form-urlencoded`. Post
 *   JSON and it answers `success: false` with no useful error code.
 * - We send `sitekey` as well as `secret` and `response`. Without it, a token
 *   solved against *any* site key registered to the account is accepted, which
 *   turns a public widget elsewhere into a bypass for this one.
 * - Tokens are single-use and live about two minutes. Retrying a token after a
 *   failure always fails, so the UI must reset the widget rather than resend.
 * - We fail **closed** by default. A captcha that waves everyone through when
 *   the verification service is unreachable is not a captcha.
 */
final class Captcha
{
    private const ENDPOINT = 'https://api.hcaptcha.com/siteverify';

    public static function enabled(): bool
    {
        return Settings::bool('captcha.enabled', false)
            && Settings::str('captcha.sitekey') !== ''
            && Settings::str('captcha.secret') !== '';
    }

    public static function requiredFor(string $action): bool
    {
        if (!self::enabled()) {
            return false;
        }
        return match ($action) {
            'register' => Settings::bool('captcha.onRegister', true),
            'login'    => Settings::bool('captcha.onLogin', true),
            'forgot'   => Settings::bool('captcha.onForgot', true),
            default    => false,
        };
    }

    /**
     * @return array{ok: bool, error: string}
     */
    public static function verify(string $token): array
    {
        if (!self::enabled()) {
            return ['ok' => true, 'error' => ''];
        }
        if ($token === '') {
            return ['ok' => false, 'error' => 'missing-input-response'];
        }

        $payload = http_build_query([
            'secret'   => Settings::str('captcha.secret'),
            'response' => $token,
            'remoteip' => Http::ip(),
            'sitekey'  => Settings::str('captcha.sitekey'),
        ]);
        $timeout = max(2, Settings::int('captcha.timeoutSeconds', 5));

        $raw = self::post(self::ENDPOINT, $payload, $timeout);
        if ($raw === null) {
            // Network failure. Fail open only if the administrator has
            // explicitly accepted the risk.
            $failOpen = Settings::bool('captcha.failOpen', false);
            return ['ok' => $failOpen, 'error' => 'verification-unreachable'];
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            return ['ok' => false, 'error' => 'bad-response'];
        }
        if (($data['success'] ?? false) === true) {
            return ['ok' => true, 'error' => ''];
        }
        $codes = $data['error-codes'] ?? [];
        $first = is_array($codes) && isset($codes[0]) ? (string) $codes[0] : 'invalid-input-response';
        return ['ok' => false, 'error' => $first];
    }

    /**
     * Enforce a captcha for an action, ending the request on failure.
     *
     * `force` lets the caller demand one even when the action does not normally
     * require it — which is how a locked-out account starts asking for one.
     */
    public static function enforce(string $action, string $token, bool $force = false): void
    {
        if (!$force && !self::requiredFor($action)) {
            return;
        }
        if (!self::enabled()) {
            return;
        }
        $result = self::verify($token);
        if ($result['ok']) {
            return;
        }

        $retryable = in_array(
            $result['error'],
            ['expired-input-response', 'already-seen-response', 'timeout-or-duplicate'],
            true,
        );
        Http::problem(
            400,
            'Captcha failed',
            $retryable
                ? 'That challenge has already been used or has expired. Please solve a fresh one.'
                : 'The captcha could not be verified. Please try again.',
            ['captcha' => true, 'captchaError' => $result['error'], 'captchaRetryable' => $retryable],
        );
    }

    /** POST with curl, falling back to a stream context. */
    private static function post(string $url, string $body, int $timeout): ?string
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            if ($ch !== false) {
                curl_setopt_array($ch, [
                    CURLOPT_POST           => true,
                    CURLOPT_POSTFIELDS     => $body,
                    CURLOPT_RETURNTRANSFER => true,
                    CURLOPT_TIMEOUT        => $timeout,
                    CURLOPT_CONNECTTIMEOUT => $timeout,
                    CURLOPT_HTTPHEADER     => ['Content-Type: application/x-www-form-urlencoded'],
                    CURLOPT_SSL_VERIFYPEER => true,
                    CURLOPT_SSL_VERIFYHOST => 2,
                ]);
                $response = curl_exec($ch);
                $ok = $response !== false && curl_getinfo($ch, CURLINFO_RESPONSE_CODE) === 200;
                curl_close($ch);
                return $ok ? (string) $response : null;
            }
        }

        $context = stream_context_create([
            'http' => [
                'method'        => 'POST',
                'header'        => "Content-Type: application/x-www-form-urlencoded\r\n",
                'content'       => $body,
                'timeout'       => $timeout,
                'ignore_errors' => true,
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);
        $response = @file_get_contents($url, false, $context);
        return is_string($response) ? $response : null;
    }
}
