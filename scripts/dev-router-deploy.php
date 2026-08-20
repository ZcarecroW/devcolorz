<?php
/** Same rules as dev-router.php, but serving the assembled deploy/ tree. */
declare(strict_types=1);
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$root = __DIR__ . '/../deploy';
if (preg_match('#^/storage(/|$)#', $path) || preg_match('#^/(config\.php|\.user\.ini|\.htaccess)$#', $path)) {
    http_response_code(403);
    header('Content-Type: text/plain');
    echo "Forbidden\n";
    return true;
}
if (str_starts_with($path, '/api')) { require $root . '/api/index.php'; return true; }
if ($path === '/cron.php') { require $root . '/cron.php'; return true; }
$file = $root . $path;
if ($path !== '/' && is_file($file)) return false;
if ($path === '/') return false;
http_response_code(404);
header('Content-Type: text/plain');
echo "Not Found\n";
return true;
