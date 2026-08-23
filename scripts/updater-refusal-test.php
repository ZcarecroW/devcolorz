<?php
/**
 * Hand the updater archives it should refuse, and check that it does.
 *
 * Each case builds a real zip, runs it through the same extract/verify path an
 * update takes, and asserts the archive is rejected *and* that nothing was
 * written outside the staging directory.
 */
// Run with: php scripts/updater-refusal-test.php (from the repository root)
declare(strict_types=1);
namespace DevColorz;

const APP_VERSION = '1.2.0';
require 'server/api/lib/Updater.php';

$tmp = sys_get_temp_dir() . '/devcolorz-hostile-' . bin2hex(random_bytes(4));
mkdir($tmp, 0775, true);
$canary = $tmp . '/CANARY.txt';
file_put_contents($canary, 'untouched');

$extract = new \ReflectionMethod(Updater::class, 'extract');
$extract->setAccessible(true);
$verify = new \ReflectionMethod(Updater::class, 'verifyTree');
$verify->setAccessible(true);

$pass = 0;
$fail = 0;
$report = static function (string $name, bool $ok, string $note = '') use (&$pass, &$fail): void {
    if ($ok) { $pass++; printf("  ok    %s\n", $name); }
    else { $fail++; printf("  FAIL  %s  %s\n", $name, $note); }
};

/** Build a zip from [path => contents]. */
$makeZip = static function (array $entries, string $path): void {
    $zip = new \ZipArchive();
    $zip->open($path, \ZipArchive::CREATE | \ZipArchive::OVERWRITE);
    foreach ($entries as $name => $body) {
        $zip->addFromString($name, $body);
    }
    $zip->close();
};

$goodTree = static fn (string $version): array => [
    'index.html'          => '<!doctype html>',
    'api/index.php'       => "<?php const APP_VERSION = '$version';",
    'api/lib/Schema.php'  => '<?php // schema',
];

echo "archive rejection\n";

// 1. Directory traversal, forward slashes.
$zipPath = $tmp . '/traversal.zip';
$makeZip($goodTree('1.3.0') + ['../../ESCAPED.txt' => 'pwned'], $zipPath);
$staged = $tmp . '/s1';
$error = $extract->invoke(null, $zipPath, $staged);
$report('an entry climbing out with ../ is refused', is_string($error), var_export($error, true));
$report('  and nothing escaped the staging directory', !is_file($tmp . '/ESCAPED.txt') && !is_file(dirname($tmp) . '/ESCAPED.txt'));

// 2. Directory traversal, backslashes (a zip written on Windows).
$zipPath = $tmp . '/backslash.zip';
$makeZip($goodTree('1.3.0') + ['..\\..\\ESCAPED2.txt' => 'pwned'], $zipPath);
$error = $extract->invoke(null, $zipPath, $tmp . '/s2');
$report('an entry using backslashes is refused', is_string($error), var_export($error, true));

// 3. An absolute path.
$zipPath = $tmp . '/absolute.zip';
$makeZip($goodTree('1.3.0') + ['/etc/passwd' => 'pwned'], $zipPath);
$error = $extract->invoke(null, $zipPath, $tmp . '/s3');
$report('an absolute path is refused', is_string($error), var_export($error, true));

// 4. A clean archive still unpacks.
$zipPath = $tmp . '/clean.zip';
$makeZip($goodTree('1.3.0'), $zipPath);
$cleanStaged = $tmp . '/clean';
$error = $extract->invoke(null, $zipPath, $cleanStaged);
$report('a clean archive unpacks', $error === null, var_export($error, true));

echo "\ntree verification\n";

// 5. Not DevColorz at all.
$notUs = $tmp . '/notus';
mkdir($notUs, 0775, true);
file_put_contents($notUs . '/index.html', 'hello');
$error = $verify->invoke(null, $notUs, '1.3.0');
$report('a tree that is not DevColorz is refused', is_string($error), var_export($error, true));

// 6. The archive's version disagrees with the release it claims to be.
$mismatch = $tmp . '/mismatch';
mkdir($mismatch . '/api/lib', 0775, true);
file_put_contents($mismatch . '/index.html', 'x');
file_put_contents($mismatch . '/api/index.php', "<?php const APP_VERSION = '9.9.9';");
file_put_contents($mismatch . '/api/lib/Schema.php', '<?php');
$error = $verify->invoke(null, $mismatch, '1.3.0');
$report('a mislabelled archive is refused', is_string($error), var_export($error, true));

// 7. A downgrade dressed up as an update.
$older = $tmp . '/older';
mkdir($older . '/api/lib', 0775, true);
file_put_contents($older . '/index.html', 'x');
file_put_contents($older . '/api/index.php', "<?php const APP_VERSION = '1.1.0';");
file_put_contents($older . '/api/lib/Schema.php', '<?php');
$error = $verify->invoke(null, $older, '1.1.0');
$report('an archive older than what is installed is refused', is_string($error), var_export($error, true));

// 8. The genuine article passes.
$error = $verify->invoke(null, $cleanStaged, '1.3.0');
$report('a genuine newer archive passes', $error === null, var_export($error, true));

echo "\nprotected paths\n";

// 9. config.php and storage/ are never written, even when the archive has them.
$src = $tmp . '/withsecrets';
mkdir($src . '/storage', 0775, true);
mkdir($src . '/api/lib', 0775, true);
file_put_contents($src . '/config.php', "<?php return ['db_file' => 'ATTACKER'];");
file_put_contents($src . '/storage/evil.sqlite', 'replaced');
file_put_contents($src . '/index.html', 'new index');
file_put_contents($src . '/api/index.php', '<?php');
file_put_contents($src . '/api/lib/Schema.php', '<?php');

$dest = $tmp . '/live';
mkdir($dest . '/storage', 0775, true);
file_put_contents($dest . '/config.php', "<?php return ['db_file' => 'MINE'];");
file_put_contents($dest . '/storage/real.sqlite', 'my data');
file_put_contents($dest . '/index.html', 'old index');

$copy = new \ReflectionMethod(Updater::class, 'copyTree');
$copy->setAccessible(true);
$written = $copy->invoke(null, $src, $dest, null);

$report('config.php is not overwritten', file_get_contents($dest . '/config.php') === "<?php return ['db_file' => 'MINE'];");
$report('storage/ is not written into', !is_file($dest . '/storage/evil.sqlite'));
$report('the existing database is untouched', file_get_contents($dest . '/storage/real.sqlite') === 'my data');
$report('other files are updated', file_get_contents($dest . '/index.html') === 'new index');
$report('the write count excludes the protected files', $written === 3, "wrote $written");

// Clean up.
$it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($tmp, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
foreach ($it as $entry) { $entry->isDir() ? @rmdir($entry->getPathname()) : @unlink($entry->getPathname()); }
@rmdir($tmp);

printf("\n%d passed, %d failed\n", $pass, $fail);
exit($fail === 0 ? 0 : 1);
