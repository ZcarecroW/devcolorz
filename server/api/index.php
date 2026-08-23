<?php

declare(strict_types=1);

/**
 * The API front controller.
 *
 * Everything under /api arrives here. Deliberately dependency-free: no
 * Composer, no framework, no autoloader magic — the whole request path is
 * readable start to finish, which on a host where you cannot run a debugger is
 * worth more than any convenience a framework would add.
 */

namespace DevColorz;

use Throwable;

// Never render a PHP error into the response. A stack trace in a JSON body
// hands over the filesystem layout, the database path and often a query.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

require __DIR__ . '/lib/Paths.php';
require __DIR__ . '/lib/Config.php';
require __DIR__ . '/lib/Db.php';
require __DIR__ . '/lib/Schema.php';
require __DIR__ . '/lib/Settings.php';
require __DIR__ . '/lib/Http.php';
require __DIR__ . '/lib/Session.php';
require __DIR__ . '/lib/Security.php';
require __DIR__ . '/lib/RateLimit.php';
require __DIR__ . '/lib/Captcha.php';
require __DIR__ . '/lib/Mail.php';
require __DIR__ . '/lib/Auth.php';
require __DIR__ . '/lib/Audit.php';
require __DIR__ . '/lib/Validator.php';
require __DIR__ . '/lib/SelfTest.php';
require __DIR__ . '/lib/Router.php';
require __DIR__ . '/lib/Palettes.php';

ini_set('error_log', Paths::storage() . '/php-error.log');

const APP_VERSION = '1.2.1';

set_exception_handler(static function (Throwable $e): void {
    error_log('[devcolorz] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        Http::problem(500, 'Server error', 'Something went wrong. The details are in the server log.');
    }
});

set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    // Suppressed expressions (`@`) opt out.
    if ((error_reporting() & $severity) === 0) {
        return false;
    }
    // Deprecations are logged, never thrown. A deprecation is a message about
    // a future version of PHP, not a failure of this request, and promoting
    // one to an exception means a point release of the language can take the
    // whole API down. That is not hypothetical: PHP 8.5 deprecated
    // curl_close(), and turning that notice into an exception made the
    // installer return 500 *after* it had already created the account.
    if ($severity === E_DEPRECATED || $severity === E_USER_DEPRECATED) {
        error_log('[devcolorz deprecated] ' . $message . ' @ ' . $file . ':' . $line);
        return true;
    }
    // Everything else does become an exception, so a silently-failing write
    // cannot look like success.
    throw new \ErrorException($message, 0, $severity, $file, $line);
});

Http::securityHeaders();

$method = Http::method();
$path = Http::path();

// CORS is not enabled: the SPA is same-origin. Answering a preflight would only
// widen the attack surface for no benefit.
if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

/* ------------------------------------------------------------------ *
 * Pre-install
 * ------------------------------------------------------------------ */

if (!Config::installed()) {
    require __DIR__ . '/routes/setup.php';
    $router = new Router();
    registerSetupRoutes($router);

    // Everything else answers with a well-formed "not installed" so the SPA can
    // route the visitor to the wizard instead of showing a broken page.
    $router->get('/meta', static function (): void {
        Http::json([
            'installed' => false,
            'appName'   => 'DevColorz',
            'version'   => APP_VERSION,
            'features'  => [
                'registration' => false,
                'explore'      => false,
                'anonymous'    => true,
                'captcha'      => false,
            ],
            'captcha' => ['provider' => null, 'sitekey' => null],
            'limits'  => ['maxColors' => 40, 'maxPalettes' => null],
        ]);
    });
    $router->dispatch($method, $path);
}

/* ------------------------------------------------------------------ *
 * Installed
 * ------------------------------------------------------------------ */

Paths::ensure();
Db::connect();
// An upgrade is "upload it over the top", so the request path has to be able
// to bring the schema forward on its own. Guarded by a marker file, so the
// steady-state cost is one `is_file` per request.
Schema::migrateIfNeeded();

// Maintenance mode still lets an administrator in, otherwise turning it on
// would lock out the only person who can turn it off.
if (Settings::bool('site.maintenance', false) && !Auth::isAdmin()) {
    $allowed = ['/meta', '/csrf', '/auth/login', '/auth/me'];
    if (!in_array($path, $allowed, true)) {
        Http::problem(
            503,
            'Maintenance',
            Settings::str('site.maintenanceMessage', 'DevColorz is briefly unavailable.'),
        );
    }
}

// A coarse per-address budget before anything expensive happens. Endpoint
// handlers apply their own tighter limits on top.
RateLimit::enforce(in_array($method, ['GET', 'HEAD'], true) ? 'read' : 'write');

// Every write is CSRF-checked centrally, so a new endpoint cannot forget to.
Security::requireCsrf();

$router = new Router();

require __DIR__ . '/routes/meta.php';
require __DIR__ . '/routes/auth.php';
require __DIR__ . '/routes/palettes.php';
require __DIR__ . '/routes/admin.php';
require __DIR__ . '/routes/setup.php';

registerMetaRoutes($router);
registerAuthRoutes($router);
registerPaletteRoutes($router);
registerAdminRoutes($router);
registerSetupRoutes($router);

$router->dispatch($method, $path);
