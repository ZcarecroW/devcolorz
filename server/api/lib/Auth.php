<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * The current user, and the guards that protect endpoints.
 */
final class Auth
{
    /** @var array<string, mixed>|null */
    private static ?array $user = null;
    private static bool $resolved = false;

    /** @return array<string, mixed>|null */
    public static function user(): ?array
    {
        if (self::$resolved) {
            return self::$user;
        }
        self::$resolved = true;

        $userId = Session::userId();
        if ($userId === null) {
            return null;
        }
        $row = Db::one('SELECT * FROM users WHERE id = ?', [$userId]);
        if ($row === null || ($row['status'] ?? '') !== 'active') {
            // The account was suspended or deleted while the session lived on.
            Session::logout();
            return null;
        }
        self::$user = $row;
        return self::$user;
    }

    public static function id(): ?int
    {
        $user = self::user();
        return $user === null ? null : (int) $user['id'];
    }

    public static function isAdmin(): bool
    {
        $user = self::user();
        return $user !== null && ($user['role'] ?? '') === 'admin';
    }

    /** @return array<string, mixed> */
    public static function require(): array
    {
        $user = self::user();
        if ($user === null) {
            Http::unauthorized();
        }
        return $user;
    }

    /** @return array<string, mixed> */
    public static function requireAdmin(): array
    {
        $user = self::require();
        if (($user['role'] ?? '') !== 'admin') {
            Http::forbidden('This area is for administrators.');
        }
        return $user;
    }

    /** Forget the cached user — used after a role or status change. */
    public static function forget(): void
    {
        self::$user = null;
        self::$resolved = false;
    }

    /**
     * Shape a user row for the API.
     *
     * Explicit allow-list, never `unset()` on the row: a column added later
     * would otherwise leak by default, and password_hash is exactly the kind of
     * column somebody adds a sibling to.
     *
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    public static function publicUser(array $row): array
    {
        // json_decode('{}', true) yields [], which json_encode then emits as a
        // JSON array — so an empty prefs object reaches the client as `[]` and
        // any `prefs.foo` read in TypeScript is a type lie. Force an object.
        $decoded = json_decode((string) ($row['prefs_json'] ?? '{}'), true);
        $prefs = is_array($decoded) && $decoded !== [] ? $decoded : new \stdClass();
        return [
            'uuid'          => (string) $row['uuid'],
            'email'         => (string) $row['email'],
            'displayName'   => (string) $row['display_name'],
            'role'          => (string) $row['role'],
            'status'        => (string) $row['status'],
            'emailVerified' => ($row['email_verified_at'] ?? null) !== null,
            'createdAt'     => (int) $row['created_at'],
            'prefs'         => $prefs,
        ];
    }

    /**
     * Create a user.
     *
     * @return array{id: int, uuid: string}
     */
    public static function createUser(
        string $email,
        string $password,
        string $displayName,
        string $role = 'user',
        string $status = 'pending',
    ): array {
        $uuid = Security::uuid();
        $now = time();
        Db::run(
            'INSERT INTO users (uuid, email, email_lower, password_hash, display_name, role, status, prefs_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                $uuid,
                $email,
                mb_strtolower($email, 'UTF-8'),
                Security::hashPassword($password),
                $displayName,
                $role,
                $status,
                '{}',
                $now,
                $now,
            ],
        );
        return ['id' => Db::lastId(), 'uuid' => $uuid];
    }

    /** @return array<string, mixed>|null */
    public static function findByEmail(string $email): ?array
    {
        return Db::one('SELECT * FROM users WHERE email_lower = ?', [mb_strtolower(trim($email), 'UTF-8')]);
    }

    public static function countAdmins(): int
    {
        return (int) Db::value("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'");
    }

    /**
     * Burn roughly as long as a real password check would.
     *
     * Without this, a request for an address that does not exist returns
     * measurably faster than one that does, which enumerates the user list
     * regardless of how carefully the response bodies are matched.
     */
    /**
     * Spend what a real password check spends, against nothing.
     *
     * Exactly one KDF pass. Hashing a dummy here and then verifying it cost
     * two, so a sign-in for an address that does not exist took roughly twice
     * as long as one for an address that does — the opposite of the leak this
     * is meant to close, but a leak all the same. The dummy is computed once
     * per installation and kept, so it carries this host's own cost
     * parameters and the timings actually match.
     */
    public static function fakePasswordCheck(): void
    {
        Security::verifyPassword('not-the-password', Security::dummyHash());
    }
}
