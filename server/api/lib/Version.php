<?php

declare(strict_types=1);

namespace DevColorz;

/*
 * The version, in one place.
 *
 * It used to be declared in `api/index.php`, which cron.php does not load —
 * so the scheduled update check died on an undefined constant while the same
 * code worked perfectly from the admin console. Both entry points require this
 * file, and the updater reads it out of an archive to confirm that what is
 * inside matches the release it claims to be.
 */
const APP_VERSION = '1.5.0';
