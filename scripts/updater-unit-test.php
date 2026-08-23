<?php
// Run with: php scripts/updater-unit-test.php (from the repository root)
declare(strict_types=1);
namespace DevColorz;
const APP_VERSION = '1.3.0';
require 'server/api/lib/Updater.php';

$cases = [
    ['1.3.1', '1.3.0', 1],   ['1.3.0', '1.3.1', -1],  ['1.3.0', '1.3.0', 0],
    ['2.0.0', '1.9.9', 1],   ['1.10.0', '1.9.0', 1],  ['1.9.0', '1.10.0', -1],
    ['v1.4.0', '1.3.0', 1],  ['1.4', '1.3.0', 1],     ['1.3', '1.3.0', 0],
    ['1.4.0-rc1', '1.4.0', -1], ['1.4.0', '1.4.0-rc1', 1],
    ['1.4.0-rc2', '1.4.0-rc1', 1], ['1.4.0-rc1', '1.3.9', 1],
    ['', '1.3.0', -1], ['garbage', '1.3.0', -1],
];
$bad = 0;
foreach ($cases as [$a, $b, $want]) {
    $got = Updater::compare($a, $b);
    $sign = $got <=> 0;
    $ok = $sign === $want;
    if (!$ok) { $bad++; printf("FAIL  compare(%-12s, %-8s) = %-3d want %d\n", "'$a'", "'$b'", $sign, $want); }
}
printf("%d/%d version comparisons correct\n", count($cases) - $bad, count($cases));

// The path guard is the one that stops an archive escaping its directory.
$ref = new \ReflectionMethod(Updater::class, 'safeRelativePath');
$ref->setAccessible(true);
$paths = [
    'api/index.php' => 'api/index.php',
    './api/x.php' => 'api/x.php',
    'a//b' => 'a/b',
    '../evil' => null,
    'a/../../evil' => null,
    '/etc/passwd' => null,
    'C:/Windows/x' => null,
    'a\..\..\evil' => null,
    '..\evil' => null,
    '' => null,
    '.' => null,
];
$bad = 0;
foreach ($paths as $in => $want) {
    $got = $ref->invoke(null, $in);
    if ($got !== $want) { $bad++; printf("FAIL  safeRelativePath(%s) = %s want %s\n", var_export($in, true), var_export($got, true), var_export($want, true)); }
}
printf("%d/%d path checks correct\n", count($paths) - $bad, count($paths));
