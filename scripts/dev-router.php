<?php

declare(strict_types=1);

/**
 * Router for `php -S`, used only for local testing.
 *
 * The built-in server has no .htaccess support, so this reproduces the two
 * rules that matter in production: /api/* falls back to the API front
 * controller, and everything under storage/ is refused.
 *
 * Usage: php -S 127.0.0.1:8080 -t server scripts/dev-router.php
 */

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$root = __DIR__ . '/../server';

// Mirror the deny rules the real deployment gets from .htaccess.
if (
    preg_match('#^/storage(/|$)#', $path)
    || preg_match('#^/(config\.php|\.user\.ini|\.htaccess)$#', $path)
) {
    http_response_code(403);
    header('Content-Type: text/plain');
    echo "Forbidden\n";
    return true;
}

if (str_starts_with($path, '/api')) {
    require $root . '/api/index.php';
    return true;
}

if ($path === '/cron.php') {
    require $root . '/cron.php';
    return true;
}

$file = $root . $path;
if ($path !== '/' && is_file($file)) {
    return false;
}

// No SPA fallback needed: the app uses hash routing.
if ($path === '/' && is_file($root . '/index.html')) {
    return false;
}

http_response_code(404);
header('Content-Type: text/plain');
echo "Not Found\n";
return true;
