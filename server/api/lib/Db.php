<?php

declare(strict_types=1);

namespace DevColorz;

use PDO;
use PDOStatement;

/**
 * The SQLite connection.
 *
 * Two details here are the difference between "works" and "database is locked"
 * in production:
 *
 * 1. **`BEGIN IMMEDIATE`, never `PDO::beginTransaction()`.** PDO opens a
 *    DEFERRED transaction. A deferred transaction that starts by reading and
 *    then tries to write returns SQLITE_BUSY *immediately*, ignoring
 *    `busy_timeout` entirely, because SQLite will not let it wait without
 *    risking deadlock. Taking the write lock up front makes `busy_timeout` do
 *    its job. Every write in this codebase goes through `transaction()`.
 *
 * 2. **WAL is requested, not assumed.** Shared hosts often NFS-mount home
 *    directories, and WAL does not work over NFS. `PRAGMA journal_mode=WAL`
 *    returns the mode actually in effect, so we read the answer back and fall
 *    back to TRUNCATE with `synchronous=FULL` when it did not take. The result
 *    is recorded and surfaced in the admin console, because a silent fallback
 *    to a slower, more fragile mode is exactly the kind of thing that bites
 *    six months later.
 */
final class Db
{
    private static ?PDO $pdo = null;
    private static bool $wal = false;
    private static int $depth = 0;

    public static function connect(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }
        $path = Config::dbPath();
        if ($path === '') {
            throw new \RuntimeException('DevColorz is not installed.');
        }
        Paths::ensure();

        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::ATTR_STRINGIFY_FETCHES  => false,
        ]);

        // Before anything else: how long a blocked writer is willing to wait.
        $pdo->exec('PRAGMA busy_timeout=5000');

        $mode = (string) $pdo->query('PRAGMA journal_mode=WAL')->fetchColumn();
        self::$wal = strtolower($mode) === 'wal';
        if (self::$wal) {
            $pdo->exec('PRAGMA synchronous=NORMAL');
        } else {
            $pdo->exec('PRAGMA journal_mode=TRUNCATE');
            $pdo->exec('PRAGMA synchronous=FULL');
        }

        // Foreign keys are per-connection in SQLite and default to off. Every
        // ON DELETE CASCADE in the schema is inert without this line.
        $pdo->exec('PRAGMA foreign_keys=ON');
        $pdo->exec('PRAGMA temp_store=MEMORY');
        $pdo->exec('PRAGMA cache_size=-8000');

        self::$pdo = $pdo;
        return $pdo;
    }

    public static function isWal(): bool
    {
        self::connect();
        return self::$wal;
    }

    /** SQLite's own version, which gates STRICT tables and RETURNING. */
    public static function version(): string
    {
        return (string) self::connect()->query('SELECT sqlite_version()')->fetchColumn();
    }

    public static function supportsStrict(): bool
    {
        return version_compare(self::version(), '3.37.0', '>=');
    }

    /**
     * Prepare, bind and execute.
     *
     * Parameters are bound **by type**, not handed to `execute()` as an array.
     * `PDOStatement::execute($params)` binds every value as a string, and in
     * SQLite that silently changes what a query means: type affinity fixes up a
     * plain `column <= ?` comparison, but the moment the parameter appears in
     * an expression — `last_seen_at + ? <= ?` — there is no column to take
     * affinity from, and SQLite ranks every INTEGER below every TEXT value. The
     * comparison then returns true for every row. That is how a session-pruning
     * query quietly deletes the entire table.
     *
     * @param array<string|int, mixed> $params
     */
    public static function run(string $sql, array $params = []): PDOStatement
    {
        $stmt = self::connect()->prepare($sql);
        foreach ($params as $key => $value) {
            $name = is_int($key) ? $key + 1 : $key;
            if ($value === null) {
                $stmt->bindValue($name, null, PDO::PARAM_NULL);
            } elseif (is_bool($value)) {
                $stmt->bindValue($name, $value ? 1 : 0, PDO::PARAM_INT);
            } elseif (is_int($value)) {
                $stmt->bindValue($name, $value, PDO::PARAM_INT);
            } elseif (is_float($value)) {
                // PDO has no float type. SQLite applies REAL affinity when the
                // value lands in a REAL column, which is every float we bind.
                $stmt->bindValue($name, $value, PDO::PARAM_STR);
            } else {
                $stmt->bindValue($name, (string) $value, PDO::PARAM_STR);
            }
        }
        $stmt->execute();
        return $stmt;
    }

    /**
     * @param array<string|int, mixed> $params
     * @return array<string, mixed>|null
     */
    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return is_array($row) ? $row : null;
    }

    /**
     * @param array<string|int, mixed> $params
     * @return list<array<string, mixed>>
     */
    public static function all(string $sql, array $params = []): array
    {
        /** @var list<array<string, mixed>> $rows */
        $rows = self::run($sql, $params)->fetchAll();
        return $rows;
    }

    /** @param array<string|int, mixed> $params */
    public static function value(string $sql, array $params = []): mixed
    {
        return self::run($sql, $params)->fetchColumn();
    }

    public static function lastId(): int
    {
        return (int) self::connect()->lastInsertId();
    }

    /**
     * Run a closure inside an IMMEDIATE transaction.
     *
     * Nested calls join the outer transaction rather than opening a second one,
     * because SQLite has no real nested transactions and savepoints would only
     * hide the fact that the caller has lost track of its own boundaries.
     *
     * @template T
     * @param callable(PDO): T $fn
     * @return T
     */
    public static function transaction(callable $fn): mixed
    {
        $pdo = self::connect();
        if (self::$depth > 0) {
            self::$depth++;
            try {
                return $fn($pdo);
            } finally {
                self::$depth--;
            }
        }

        $pdo->exec('BEGIN IMMEDIATE');
        self::$depth = 1;
        try {
            $result = $fn($pdo);
            $pdo->exec('COMMIT');
            return $result;
        } catch (\Throwable $e) {
            try {
                $pdo->exec('ROLLBACK');
            } catch (\Throwable) {
                // A rollback that fails means the transaction is already gone;
                // the original exception is the one worth reporting.
            }
            throw $e;
        } finally {
            self::$depth = 0;
        }
    }

    /** Size of the database on disk, including any WAL. */
    public static function sizeBytes(): int
    {
        $path = Config::dbPath();
        $total = 0;
        foreach ([$path, $path . '-wal', $path . '-shm'] as $file) {
            if (is_file($file)) {
                $total += (int) filesize($file);
            }
        }
        return $total;
    }

    /**
     * Back up by asking SQLite to write a fresh copy.
     *
     * Never copy the file with `copy()` or read it with `fopen()`: on POSIX,
     * closing *any* descriptor for a file cancels every advisory lock the
     * process holds on it, so a naive backup can corrupt the live database out
     * from under a concurrent writer. `VACUUM INTO` is the supported route.
     */
    public static function backupTo(string $target): void
    {
        self::run('VACUUM INTO ?', [$target]);
    }

    public static function checkpoint(): void
    {
        if (self::$wal) {
            self::connect()->exec('PRAGMA wal_checkpoint(TRUNCATE)');
        }
    }

    public static function optimize(): void
    {
        $pdo = self::connect();
        $pdo->exec('PRAGMA analysis_limit=400');
        $pdo->exec('PRAGMA optimize');
    }

    public static function integrityCheck(): string
    {
        return (string) self::value('PRAGMA integrity_check');
    }

    /** Reset for tests and for the installer, which connects twice. */
    public static function disconnect(): void
    {
        self::$pdo = null;
        self::$depth = 0;
    }
}
