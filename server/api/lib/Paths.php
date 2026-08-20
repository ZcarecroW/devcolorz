<?php

declare(strict_types=1);

namespace DevColorz;

/**
 * Filesystem layout.
 *
 * The FTP account for this host is chrooted to the document root, so there is
 * no directory above the web root we can reliably write to or manage. Runtime
 * state therefore lives in `storage/` *inside* the docroot, and is kept
 * unreachable by three independent measures rather than one:
 *
 *   1. `storage/.htaccess` denies everything,
 *   2. the database filename starts with `.ht`, which stock Apache refuses to
 *      serve even when `AllowOverride None` disables the rule above, and
 *   3. the installer performs a loopback fetch of each sensitive path and
 *      refuses to finish if any of them returns 200.
 *
 * Belt, braces, and a check that the trousers are actually on.
 */
final class Paths
{
    /** The document root — the parent of `api/`. */
    public static function root(): string
    {
        return \dirname(__DIR__, 2);
    }

    public static function storage(): string
    {
        return self::root() . '/storage';
    }

    public static function sessions(): string
    {
        return self::storage() . '/sessions';
    }

    public static function locks(): string
    {
        return self::storage() . '/locks';
    }

    public static function backups(): string
    {
        return self::storage() . '/backups';
    }

    public static function configFile(): string
    {
        return self::root() . '/config.php';
    }

    public static function installedMarker(): string
    {
        return self::storage() . '/.installed';
    }

    /** Create the runtime directories and their guards. Idempotent. */
    public static function ensure(): void
    {
        foreach ([self::storage(), self::sessions(), self::locks(), self::backups()] as $dir) {
            if (!is_dir($dir)) {
                @mkdir($dir, 0770, true);
            }
        }

        $htaccess = self::storage() . '/.htaccess';
        if (!is_file($htaccess)) {
            @file_put_contents($htaccess, self::denyRules());
        }

        // A directory index, in case the deny rules are ignored entirely.
        $index = self::storage() . '/index.html';
        if (!is_file($index)) {
            @file_put_contents($index, "<!doctype html><title>Not found</title>\n");
        }
    }

    /**
     * Deny rules that work on both Apache 2.2 and 2.4, because shared hosts
     * are not always on the version their control panel claims.
     */
    public static function denyRules(): string
    {
        return <<<'HTACCESS'
        # Runtime state. Nothing in here is ever meant to be served.
        <IfModule mod_authz_core.c>
            Require all denied
        </IfModule>
        <IfModule !mod_authz_core.c>
            Order allow,deny
            Deny from all
        </IfModule>

        # If the deny rules are ignored, at least refuse to execute anything.
        <IfModule mod_php.c>
            php_flag engine off
        </IfModule>
        Options -Indexes -ExecCGI
        RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .cgi .pl
        AddType text/plain .php .phtml .sqlite .db

        HTACCESS;
    }
}
