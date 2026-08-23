<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Request parsing and JSON responses.
 *
 * Errors follow RFC 9457 (`application/problem+json`) so a client can branch on
 * a stable shape instead of pattern-matching prose.
 */
final class Http
{
    /** @var array<string, mixed>|null */
    private static ?array $body = null;

    public static function method(): string
    {
        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        return $method === '' ? 'GET' : $method;
    }

    /** The API path with the mount point stripped: `/auth/login`. */
    public static function path(): string
    {
        $raw = (string) ($_SERVER['REQUEST_URI'] ?? '/');
        $path = parse_url($raw, PHP_URL_PATH);
        $path = is_string($path) ? $path : '/';
        $path = rawurldecode($path);

        // The front controller lives at /api/index.php, and depending on
        // whether we arrived via mod_rewrite or FallbackResource the prefix may
        // or may not still be present.
        foreach (['/api/index.php', '/api'] as $prefix) {
            if (str_starts_with($path, $prefix)) {
                $path = substr($path, strlen($prefix));
                break;
            }
        }
        $path = '/' . ltrim($path, '/');
        return rtrim($path, '/') ?: '/';
    }

    /**
     * The decoded JSON body.
     *
     * @return array<string, mixed>
     */
    public static function body(): array
    {
        if (self::$body !== null) {
            return self::$body;
        }
        $raw = file_get_contents('php://input');
        if (!is_string($raw) || $raw === '') {
            self::$body = [];
            return self::$body;
        }
        // A 1 MB ceiling: palettes are small, and an unbounded json_decode is
        // an easy way to exhaust memory_limit.
        if (strlen($raw) > 1048576) {
            self::problem(413, 'Payload too large', 'The request body exceeds 1 MB.');
        }
        $decoded = json_decode($raw, true);
        self::$body = is_array($decoded) ? $decoded : [];
        return self::$body;
    }

    public static function input(string $key, mixed $default = null): mixed
    {
        return self::body()[$key] ?? $default;
    }

    public static function query(string $key, ?string $default = null): ?string
    {
        $value = $_GET[$key] ?? null;
        return is_string($value) ? $value : $default;
    }

    public static function header(string $name): string
    {
        $key = 'HTTP_' . str_replace('-', '_', strtoupper($name));
        $value = $_SERVER[$key] ?? '';
        return is_string($value) ? $value : '';
    }

    /**
     * Whether this request reached the user's browser over TLS.
     *
     * `$_SERVER['HTTPS']` is unset whenever something upstream terminates TLS
     * and forwards plain HTTP — a CDN, a load balancer, a reverse proxy. The
     * consequences all land at once: the session cookie loses `Secure` and its
     * `__Host-` prefix, the installer records an `http://` base URL, and every
     * write then fails CSRF because the browser sends an `https://` Origin
     * that no longer matches.
     *
     * The forwarded header is only believed when `trust_proxy` is switched on
     * in config.php. On a directly-reachable host that header is set by the
     * client, so trusting it by default would let anyone claim TLS — the same
     * reasoning `ip()` gives for refusing X-Forwarded-For.
     */
    public static function isSecure(): bool
    {
        $https = (string) ($_SERVER['HTTPS'] ?? '');
        if ($https !== '' && strtolower($https) !== 'off') {
            return true;
        }
        if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
            return true;
        }
        if (!Config::bool('trust_proxy')) {
            return false;
        }
        if (strtolower(self::header('X-Forwarded-Proto')) === 'https') {
            return true;
        }
        if (strtolower(self::header('X-Forwarded-SSL')) === 'on') {
            return true;
        }
        return strtolower(self::header('Front-End-Https')) === 'on';
    }

    /**
     * The client's IP address.
     *
     * `REMOTE_ADDR` only. `X-Forwarded-For` is set by the client on a direct
     * connection, so trusting it turns per-IP rate limiting into a header the
     * attacker controls. If this app ever sits behind a real proxy, the proxy's
     * ranges have to be pinned here explicitly — not inferred.
     */
    public static function ip(): string
    {
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        return $ip !== '' ? $ip : '0.0.0.0';
    }

    /**
     * The rate-limiting key for an address.
     *
     * IPv6 is keyed by /64: a single customer is routinely handed that much
     * space, so limiting individual addresses would let one host cycle through
     * billions of them.
     */
    public static function ipKey(): string
    {
        $ip = self::ip();
        if (str_contains($ip, ':')) {
            $packed = @inet_pton($ip);
            if ($packed !== false && strlen($packed) === 16) {
                return bin2hex(substr($packed, 0, 8)) . '::/64';
            }
        }
        return $ip;
    }

    public static function userAgent(): string
    {
        $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
        return is_string($ua) ? substr($ua, 0, 512) : '';
    }

    public static function origin(): string
    {
        $origin = self::header('Origin');
        if ($origin !== '') {
            return $origin;
        }
        $referer = self::header('Referer');
        if ($referer === '') {
            return '';
        }
        $parts = parse_url($referer);
        if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
            return '';
        }
        $port = isset($parts['port']) ? ':' . $parts['port'] : '';
        return $parts['scheme'] . '://' . $parts['host'] . $port;
    }

    /** The origin this installation is actually served from. */
    public static function selfOrigin(): string
    {
        $scheme = self::isSecure() ? 'https' : 'http';
        $host = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
        return $scheme . '://' . $host;
    }

    public static function baseUrl(): string
    {
        $configured = Settings::get('site.baseUrl', '');
        if (is_string($configured) && $configured !== '') {
            return rtrim($configured, '/');
        }
        return self::selfOrigin();
    }

    /** Send security headers that apply to every API response. */
    public static function securityHeaders(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        header('X-Frame-Options: DENY');
        header('Cross-Origin-Resource-Policy: same-origin');
        header('Cache-Control: no-store, private');
        header_remove('X-Powered-By');
    }

    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function noContent(): never
    {
        http_response_code(204);
        exit;
    }

    /**
     * An RFC 9457 problem response.
     *
     * @param array<string, mixed> $extra
     */
    public static function problem(
        int $status,
        string $title,
        string $detail = '',
        array $extra = [],
    ): never {
        http_response_code($status);
        header('Content-Type: application/problem+json; charset=utf-8');
        $payload = array_merge([
            'type'   => 'about:blank',
            'title'  => $title,
            'status' => $status,
        ], $detail !== '' ? ['detail' => $detail] : [], $extra);
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    /** @param array<string, string> $errors */
    public static function validationFailed(array $errors): never
    {
        self::problem(422, 'Validation failed', 'Some fields need attention.', ['errors' => $errors]);
    }

    public static function notFound(string $detail = 'No such endpoint.'): never
    {
        self::problem(404, 'Not found', $detail);
    }

    public static function unauthorized(string $detail = 'Sign in to continue.'): never
    {
        self::problem(401, 'Unauthorized', $detail);
    }

    public static function forbidden(string $detail = 'You do not have access to this.'): never
    {
        self::problem(403, 'Forbidden', $detail);
    }

    public static function tooManyRequests(int $retryAfter, string $detail): never
    {
        header('Retry-After: ' . max(1, $retryAfter));
        self::problem(429, 'Too many requests', $detail, ['retryAfter' => $retryAfter]);
    }
}
