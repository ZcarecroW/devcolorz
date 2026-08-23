<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * CSRF, password hashing and single-use tokens.
 */
final class Security
{
    /* ------------------------------------------------------------------ *
     * CSRF
     * ------------------------------------------------------------------ */

    /**
     * Verify a state-changing request.
     *
     * Three independent checks, because each one alone has a known hole:
     *
     * 1. **Synchronizer token.** The real defence. Compared with `hash_equals`
     *    so a timing side-channel cannot be used to guess it byte by byte.
     * 2. **`Content-Type: application/json`.** A cross-origin `<form>` post can
     *    only send three content types, none of them JSON, so requiring JSON
     *    forces a CORS preflight the attacker cannot satisfy.
     * 3. **Origin match.** Cheap, and catches misconfiguration.
     *
     * SameSite=Lax on the cookie is a fourth layer, but it is defence in depth
     * rather than the defence: it does not protect against a same-site
     * subdomain, and older browsers ignore it.
     */
    public static function requireCsrf(): void
    {
        $method = Http::method();
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }

        $contentType = strtolower(trim(explode(';', (string) ($_SERVER['CONTENT_TYPE'] ?? ''))[0]));
        if ($contentType !== 'application/json' && $contentType !== '') {
            Http::problem(415, 'Unsupported media type', 'This endpoint accepts application/json only.');
        }

        $origin = Http::origin();
        if ($origin !== '') {
            $expected = [Http::selfOrigin()];
            $configured = Settings::str('site.baseUrl');
            if ($configured !== '') {
                $expected[] = rtrim($configured, '/');
            }
            if (!in_array(rtrim($origin, '/'), $expected, true)) {
                Http::forbidden('This request came from an unexpected origin.');
            }
        }

        $expectedToken = Session::csrfToken();
        $provided = Http::header('X-CSRF-Token');
        if ($expectedToken === '' || $provided === '' || !hash_equals($expectedToken, $provided)) {
            // 419 rather than 403: the client knows to refresh the token and
            // retry once, which is what a rotated session looks like.
            Http::problem(419, 'Session expired', 'Your security token was stale. Please try again.');
        }
    }

    /* ------------------------------------------------------------------ *
     * Passwords
     * ------------------------------------------------------------------ */

    /**
     * Is Argon2id genuinely available?
     *
     * `defined(PASSWORD_ARGON2ID)` is true on builds where the constant exists
     * but libargon2 was not linked, and `password_hash` then throws. Asking
     * `password_algos()` is the only reliable test.
     */
    public static function hasArgon2id(): bool
    {
        return in_array(PASSWORD_ARGON2ID, password_algos(), true);
    }

    /**
     * Pre-hash the password with the installation pepper.
     *
     * Two reasons this is HMAC rather than concatenation: bcrypt silently
     * truncates at 72 bytes, so a long password plus a pepper would lose the
     * pepper; and PHP 8 throws on a NUL byte in the input, which raw binary
     * output would eventually produce. base64 of an HMAC is fixed-length and
     * NUL-free.
     */
    private static function pepper(string $password): string
    {
        $pepper = Config::string('pepper');
        if ($pepper === '') {
            return $password;
        }
        return base64_encode(hash_hmac('sha384', $password, $pepper, true));
    }

    /** @return array{0: string, 1: array<string, int>} */
    private static function algorithm(): array
    {
        if (self::hasArgon2id()) {
            // PHP's default memory_cost is 64 MiB, which exceeds the
            // memory_limit on plenty of shared hosts and makes login fail with
            // a fatal error instead of a wrong-password message. 19 MiB is the
            // OWASP-recommended floor and fits everywhere.
            return [PASSWORD_ARGON2ID, ['memory_cost' => 19456, 'time_cost' => 2, 'threads' => 1]];
        }
        return [PASSWORD_BCRYPT, ['cost' => 12]];
    }

    public static function hashPassword(string $password): string
    {
        [$algo, $options] = self::algorithm();
        $hash = password_hash(self::pepper($password), $algo, $options);
        if (!is_string($hash) || $hash === '') {
            throw new \RuntimeException('Password hashing failed.');
        }
        return $hash;
    }

    /**
     * A hash to verify against when there is no real one.
     *
     * Written to disk on first use so the cost is paid once for the lifetime
     * of the installation rather than on every request that needs to look
     * busy. It is not a secret — nothing is ever hashed *to* it — but it has
     * to use this host's cost parameters, which is why it cannot be a literal.
     */
    public static function dummyHash(): string
    {
        static $cached = null;
        if (is_string($cached)) {
            return $cached;
        }
        $file = Paths::storage() . '/.ht-timing-hash';
        $stored = is_file($file) ? (string) @file_get_contents($file) : '';
        if ($stored !== '' && password_get_info($stored)['algo'] !== null) {
            return $cached = $stored;
        }
        $fresh = self::hashPassword('devcolorz-timing-equalizer');
        @file_put_contents($file, $fresh, LOCK_EX);
        return $cached = $fresh;
    }

    public static function verifyPassword(string $password, string $hash): bool
    {
        return password_verify(self::pepper($password), $hash);
    }

    public static function needsRehash(string $hash): bool
    {
        [$algo, $options] = self::algorithm();
        return password_needs_rehash($hash, $algo, $options);
    }

    /* ------------------------------------------------------------------ *
     * Single-use tokens
     * ------------------------------------------------------------------ */

    /**
     * Issue a token for email verification, password reset and friends.
     *
     * Only the hash is stored. A database leak therefore cannot be turned into
     * password resets for every pending user.
     *
     * @param array<string, mixed> $payload
     * @return string The raw token, which is only ever seen here and in the email.
     */
    public static function issueToken(int $userId, string $purpose, int $ttlSeconds, array $payload = []): string
    {
        $raw = bin2hex(random_bytes(32));
        Db::run(
            'INSERT INTO tokens (user_id, purpose, token_hash, payload_json, created_at, expires_at, request_ip)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                $userId,
                $purpose,
                hash('sha256', $raw),
                json_encode($payload, JSON_UNESCAPED_SLASHES),
                time(),
                time() + $ttlSeconds,
                Http::ipKey(),
            ],
        );
        return $raw;
    }

    /**
     * Consume a token, atomically.
     *
     * The UPDATE both checks and marks in one statement, so two requests racing
     * with the same token cannot both succeed — `rowCount() === 1` is the proof
     * that this caller is the one that claimed it.
     *
     * @return array{user_id: int, payload: array<string, mixed>}|null
     */
    public static function consumeToken(string $raw, string $purpose): ?array
    {
        if (!preg_match('/^[a-f0-9]{64}$/', $raw)) {
            return null;
        }
        $hash = hash('sha256', $raw);
        $now = time();

        return Db::transaction(static function () use ($hash, $purpose, $now): ?array {
            $stmt = Db::run(
                'UPDATE tokens SET used_at = ?
                 WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > ?',
                [$now, $hash, $purpose, $now],
            );
            if ($stmt->rowCount() !== 1) {
                return null;
            }
            $row = Db::one('SELECT user_id, payload_json FROM tokens WHERE token_hash = ?', [$hash]);
            if ($row === null) {
                return null;
            }
            $payload = json_decode((string) $row['payload_json'], true);
            return [
                'user_id' => (int) $row['user_id'],
                'payload' => is_array($payload) ? $payload : [],
            ];
        });
    }

    /** Invalidate every outstanding token of a purpose for one user. */
    public static function revokeTokens(int $userId, string $purpose): void
    {
        Db::run('DELETE FROM tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [
            $userId,
            $purpose,
        ]);
    }

    public static function pruneTokens(): int
    {
        return Db::run('DELETE FROM tokens WHERE expires_at < ? OR used_at IS NOT NULL AND used_at < ?', [
            time(),
            time() - 86400 * 7,
        ])->rowCount();
    }

    /** A URL-safe, sortable-enough identifier. */
    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        $hex = bin2hex($bytes);
        return sprintf(
            '%s-%s-%s-%s-%s',
            substr($hex, 0, 8),
            substr($hex, 8, 4),
            substr($hex, 12, 4),
            substr($hex, 16, 4),
            substr($hex, 20, 12),
        );
    }

    /**
     * Compare two strings without leaking their difference through timing.
     * `hash_equals` needs equal-length inputs to be meaningful, so hash first.
     */
    public static function secretEquals(string $a, string $b): bool
    {
        return hash_equals(hash('sha256', $a), hash('sha256', $b));
    }
}
