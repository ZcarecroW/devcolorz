<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Rate limiting and brute-force protection.
 *
 * Two mechanisms, because they defend against different things:
 *
 * - **Per-IP token bucket.** Cheap, lazily refilled, and applied to every
 *   endpoint. Stops one address hammering the API.
 * - **Per-account lockout with exponential backoff.** Stops a distributed
 *   attack that spreads across many addresses but targets one account, which
 *   an IP limit cannot see at all.
 *
 * The lockout deliberately returns *the same* response as a wrong password.
 * A distinct "account locked" message is an enumeration oracle: it confirms the
 * account exists, and it tells the attacker exactly when to come back.
 */
final class RateLimit
{
    /**
     * Take one token from a bucket.
     *
     * Lazy refill: instead of a scheduled job topping up every bucket, the row
     * records when it was last touched and the refill is computed on read.
     * One row per bucket, one statement, no cron dependency.
     *
     * @return array{allowed: bool, retryAfter: int, remaining: float}
     */
    public static function take(string $name, string $key, ?int $capacity = null, ?int $perSeconds = null): array
    {
        $config = Settings::bucket("ratelimit.$name");
        $capacity = $capacity ?? $config['capacity'];
        $perSeconds = $perSeconds ?? $config['perSeconds'];
        $bucket = $name . '|' . $key;
        $now = time();
        $rate = $capacity / max(1, $perSeconds);

        return Db::transaction(static function () use ($bucket, $capacity, $now, $rate): array {
            $row = Db::one('SELECT tokens, updated_at FROM rate_buckets WHERE bucket = ?', [$bucket]);

            if ($row === null) {
                Db::run('INSERT INTO rate_buckets (bucket, tokens, updated_at) VALUES (?, ?, ?)', [
                    $bucket,
                    $capacity - 1,
                    $now,
                ]);
                return ['allowed' => true, 'retryAfter' => 0, 'remaining' => $capacity - 1];
            }

            $elapsed = max(0, $now - (int) $row['updated_at']);
            $tokens = min($capacity, (float) $row['tokens'] + $elapsed * $rate);

            if ($tokens < 1) {
                $wait = (int) ceil((1 - $tokens) / max($rate, 1e-9));
                Db::run('UPDATE rate_buckets SET tokens = ?, updated_at = ? WHERE bucket = ?', [
                    $tokens,
                    $now,
                    $bucket,
                ]);
                return ['allowed' => false, 'retryAfter' => max(1, $wait), 'remaining' => $tokens];
            }

            $tokens -= 1;
            Db::run('UPDATE rate_buckets SET tokens = ?, updated_at = ? WHERE bucket = ?', [
                $tokens,
                $now,
                $bucket,
            ]);
            return ['allowed' => true, 'retryAfter' => 0, 'remaining' => $tokens];
        });
    }

    /** Take a token or end the request with a 429. */
    public static function enforce(string $name, ?string $key = null): void
    {
        $result = self::take($name, $key ?? Http::ipKey());
        if (!$result['allowed']) {
            Http::tooManyRequests(
                $result['retryAfter'],
                'Too many requests from this address. Try again in ' . $result['retryAfter'] . ' seconds.',
            );
        }
    }

    /* ------------------------------------------------------------------ *
     * Per-account lockout
     * ------------------------------------------------------------------ */

    /** @return array{locked: bool, until: int, captcha: bool, fails: int} */
    public static function loginState(string $accountKey): array
    {
        $row = Db::one('SELECT fails, locked_until, captcha_required FROM lockouts WHERE account_key = ?', [
            $accountKey,
        ]);
        if ($row === null) {
            return ['locked' => false, 'until' => 0, 'captcha' => false, 'fails' => 0];
        }
        $until = (int) $row['locked_until'];
        return [
            'locked'  => $until > time(),
            'until'   => $until,
            'captcha' => (bool) (int) $row['captcha_required'],
            'fails'   => (int) $row['fails'],
        ];
    }

    /**
     * Record a failed sign-in.
     *
     * The delay doubles with each failure past the threshold, capped by the
     * configured maximum. A patient attacker is not stopped by a fixed delay;
     * they are stopped by one that grows faster than they can wait.
     */
    public static function loginFailed(string $accountKey, string $ip): void
    {
        $now = time();
        Db::transaction(static function () use ($accountKey, $ip, $now): void {
            Db::run('INSERT INTO login_attempts (ts, ip, account_key, ok) VALUES (?, ?, ?, 0)', [
                $now,
                $ip,
                $accountKey,
            ]);

            $row = Db::one('SELECT fails FROM lockouts WHERE account_key = ?', [$accountKey]);
            $fails = ($row === null ? 0 : (int) $row['fails']) + 1;

            $threshold = max(1, Settings::int('ratelimit.lockoutThreshold', 5));
            $base = max(1, Settings::int('ratelimit.lockoutBaseSeconds', 2));
            $max = max($base, Settings::int('ratelimit.lockoutMaxSeconds', 900));
            $captchaAt = max(1, Settings::int('ratelimit.captchaThreshold', 3));

            $lockedUntil = 0;
            if ($fails >= $threshold) {
                $exponent = min(20, $fails - $threshold);
                $lockedUntil = $now + (int) min($max, $base * (2 ** $exponent));
            }

            Db::run(
                'INSERT INTO lockouts (account_key, fails, locked_until, captcha_required, updated_at)
                 VALUES (?, ?, ?, ?, ?)
                 ON CONFLICT(account_key) DO UPDATE SET
                    fails = excluded.fails,
                    locked_until = excluded.locked_until,
                    captcha_required = excluded.captcha_required,
                    updated_at = excluded.updated_at',
                [$accountKey, $fails, $lockedUntil, $fails >= $captchaAt ? 1 : 0, $now],
            );
        });
    }

    /**
     * Lift an account's lockout without recording an attempt.
     *
     * A password reset proves ownership through the mailbox, which is
     * stronger evidence than a correct password — yet it left the lockout in
     * place, so someone locked out by a guesser reset their password and
     * still could not sign in until the timer ran out.
     */
    public static function clearLockout(string $accountKey): void
    {
        Db::run('DELETE FROM lockouts WHERE account_key = ?', [$accountKey]);
    }

    public static function loginSucceeded(string $accountKey, string $ip): void
    {
        $now = time();
        Db::transaction(static function () use ($accountKey, $ip, $now): void {
            Db::run('INSERT INTO login_attempts (ts, ip, account_key, ok) VALUES (?, ?, ?, 1)', [
                $now,
                $ip,
                $accountKey,
            ]);
            Db::run('DELETE FROM lockouts WHERE account_key = ?', [$accountKey]);
        });
    }

    /** Recent failures from one address, across all accounts. */
    public static function recentFailuresFromIp(string $ip, int $windowSeconds = 900): int
    {
        return (int) Db::value(
            'SELECT COUNT(*) FROM login_attempts WHERE ip = ? AND ok = 0 AND ts > ?',
            [$ip, time() - $windowSeconds],
        );
    }

    public static function prune(int $olderThanDays = 30): int
    {
        $cutoff = time() - $olderThanDays * 86400;
        $removed = Db::run('DELETE FROM login_attempts WHERE ts < ?', [$cutoff])->rowCount();
        Db::run('DELETE FROM lockouts WHERE locked_until < ? AND updated_at < ?', [time(), $cutoff]);
        Db::run('DELETE FROM rate_buckets WHERE updated_at < ?', [time() - 86400]);
        return $removed;
    }
}
