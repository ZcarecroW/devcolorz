<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Sessions.
 *
 * PHP's own session machinery is not used at all. On shared hosting
 * `session.save_path` defaults to a world-readable `/tmp`, which means every
 * other customer on the box can read your session files; working around that
 * requires a custom handler anyway, at which point PHP's serialiser, its
 * garbage collector and its id generator are all just extra surface.
 *
 * Design notes:
 *
 * - The cookie carries a raw 256-bit id; the table stores only its SHA-256.
 *   A leaked database backup therefore cannot be replayed as live sessions.
 * - The cookie is named `__Host-dcz`. That prefix is enforced by the browser:
 *   it only accepts the cookie if it is Secure, has no Domain and has
 *   `Path=/`, which makes subdomain injection impossible.
 * - `$_COOKIE` keys are checked byte-for-byte. Browsers and PHP disagree about
 *   whitespace and Unicode in cookie names, and that disagreement has been
 *   used to smuggle a second cookie past a `__Host-` check.
 * - Idle and absolute expiry are both enforced in the row, not left to a
 *   garbage collector that may never run on a low-traffic site.
 */
final class Session
{
    private const COOKIE = '__Host-dcz';

    private static ?string $rawId = null;
    /** @var array<string, mixed>|null */
    private static ?array $row = null;
    private static bool $loaded = false;

    /** Read the session cookie, rejecting anything not byte-identical. */
    private static function cookieValue(): string
    {
        foreach ($_COOKIE as $name => $value) {
            if ($name === self::COOKIE) {
                return is_string($value) ? $value : '';
            }
            // A cookie whose name only *looks* like ours after trimming is an
            // attack, not a typo. Refuse the whole request's session.
            if (is_string($name) && trim($name) === self::COOKIE) {
                return '';
            }
        }
        return '';
    }

    private static function hash(string $raw): string
    {
        return hash('sha256', $raw);
    }

    private static function sendCookie(string $raw, int $expires): void
    {
        // `__Host-` requires Secure, so on a plain-HTTP development host the
        // browser would silently drop it; fall back to a plain name there.
        $secure = Http::isSecure();
        $name = $secure ? self::COOKIE : 'dcz';
        setcookie($name, $raw, [
            'expires'  => $expires,
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private static function clearCookie(): void
    {
        $secure = Http::isSecure();
        setcookie($secure ? self::COOKIE : 'dcz', '', [
            'expires'  => time() - 3600,
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    /** @return array<string, mixed>|null */
    public static function load(): ?array
    {
        if (self::$loaded) {
            return self::$row;
        }
        self::$loaded = true;

        $raw = self::cookieValue();
        if ($raw === '' || !preg_match('/^[a-f0-9]{64}$/', $raw)) {
            // Development hosts fall back to the unprefixed name.
            $raw = is_string($_COOKIE['dcz'] ?? null) ? (string) $_COOKIE['dcz'] : '';
            if ($raw === '' || !preg_match('/^[a-f0-9]{64}$/', $raw)) {
                return null;
            }
        }

        $row = Db::one('SELECT * FROM sessions WHERE sid = ?', [self::hash($raw)]);
        if ($row === null) {
            return null;
        }
        $now = time();
        if (($row['revoked_at'] ?? null) !== null) {
            return null;
        }
        if ((int) $row['absolute_expires_at'] <= $now) {
            self::destroyBySid((string) $row['sid']);
            return null;
        }
        $idle = max(60, Settings::int('auth.sessionIdleMinutes', 43200)) * 60;
        if ((int) $row['last_seen_at'] + $idle <= $now) {
            self::destroyBySid((string) $row['sid']);
            return null;
        }

        self::$rawId = $raw;
        self::$row = $row;

        // Touch at most once a minute: every request writing to the database
        // would turn a read-heavy app into a write-heavy one.
        if ((int) $row['last_seen_at'] < $now - 60) {
            Db::run('UPDATE sessions SET last_seen_at = ? WHERE sid = ?', [$now, $row['sid']]);
        }
        return self::$row;
    }

    public static function userId(): ?int
    {
        $row = self::load();
        $id = $row['user_id'] ?? null;
        return is_int($id) || (is_string($id) && $id !== '') ? (int) $id : null;
    }

    /**
     * Start a session, or re-key an existing one.
     *
     * Always issues a brand-new id: session fixation is prevented by rotating
     * on every privilege change, not by hoping the old id was never leaked.
     */
    public static function start(?int $userId, bool $remember = false): string
    {
        self::destroyCurrent();

        $raw = bin2hex(random_bytes(32));
        $now = time();
        $absolute = $remember
            ? $now + max(1, Settings::int('auth.sessionAbsoluteHours', 720)) * 3600
            : $now + min(24, max(1, Settings::int('auth.sessionAbsoluteHours', 720))) * 3600;

        $csrf = bin2hex(random_bytes(32));
        Db::run(
            'INSERT INTO sessions (sid, user_id, csrf_token, ip, ua_hash, created_at, last_seen_at, absolute_expires_at, payload)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                self::hash($raw),
                $userId,
                $csrf,
                Http::ipKey(),
                hash('sha256', Http::userAgent()),
                $now,
                $now,
                $absolute,
                '{}',
            ],
        );

        self::$rawId = $raw;
        self::$loaded = true;
        self::$row = Db::one('SELECT * FROM sessions WHERE sid = ?', [self::hash($raw)]);
        self::sendCookie($raw, $remember ? $absolute : 0);
        return $csrf;
    }

    /** Ensure a session exists, even for an anonymous visitor — CSRF needs one. */
    public static function ensure(): void
    {
        if (self::load() === null) {
            self::start(null);
        }
    }

    public static function csrfToken(): string
    {
        self::ensure();
        $row = self::$row;
        return is_array($row) ? (string) $row['csrf_token'] : '';
    }

    public static function destroyCurrent(): void
    {
        $row = self::load();
        if (is_array($row)) {
            self::destroyBySid((string) $row['sid']);
        }
        self::$row = null;
        self::$rawId = null;
        self::$loaded = true;
    }

    public static function logout(): void
    {
        self::destroyCurrent();
        self::clearCookie();
    }

    private static function destroyBySid(string $sid): void
    {
        Db::run('DELETE FROM sessions WHERE sid = ?', [$sid]);
    }

    /** Revoke every session belonging to a user — "sign out everywhere". */
    public static function revokeAllFor(int $userId, bool $keepCurrent = false): int
    {
        $current = is_array(self::$row) ? (string) self::$row['sid'] : '';
        if ($keepCurrent && $current !== '') {
            $stmt = Db::run('DELETE FROM sessions WHERE user_id = ? AND sid <> ?', [$userId, $current]);
        } else {
            $stmt = Db::run('DELETE FROM sessions WHERE user_id = ?', [$userId]);
        }
        return $stmt->rowCount();
    }

    /** Store a scrap of state on the session — used for captcha requirements. */
    public static function put(string $key, mixed $value): void
    {
        self::ensure();
        $row = self::$row;
        if (!is_array($row)) {
            return;
        }
        $payload = json_decode((string) $row['payload'], true);
        $payload = is_array($payload) ? $payload : [];
        $payload[$key] = $value;
        $encoded = json_encode($payload, JSON_UNESCAPED_SLASHES);
        Db::run('UPDATE sessions SET payload = ? WHERE sid = ?', [$encoded, $row['sid']]);
        self::$row['payload'] = $encoded;
    }

    public static function pull(string $key, mixed $default = null): mixed
    {
        $row = self::load();
        if (!is_array($row)) {
            return $default;
        }
        $payload = json_decode((string) $row['payload'], true);
        return is_array($payload) && array_key_exists($key, $payload) ? $payload[$key] : $default;
    }

    /** Remove sessions that have expired. Called by cron. */
    public static function prune(): int
    {
        $idle = max(60, Settings::int('auth.sessionIdleMinutes', 43200)) * 60;
        $now = time();
        return Db::run(
            'DELETE FROM sessions WHERE absolute_expires_at <= ? OR last_seen_at + ? <= ?',
            [$now, $idle, $now],
        )->rowCount();
    }
}
