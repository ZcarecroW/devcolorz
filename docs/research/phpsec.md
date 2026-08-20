## 1. SQLite + PDO on shared hosting

**Connect once, pragma order matters.**
```php
$pdo = new PDO('sqlite:'.DB_PATH, null, null, [
  PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,
  PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,
  PDO::ATTR_EMULATE_PREPARES=>false, PDO::ATTR_STRINGIFY_FETCHES=>false,
]);
$pdo->exec('PRAGMA busy_timeout=5000');      // FIRST — the WAL switch itself can hit SQLITE_BUSY
$mode = $pdo->query('PRAGMA journal_mode=WAL')->fetchColumn();
$pdo->exec('PRAGMA foreign_keys=ON');        // per-connection, NOT persisted — set every time
$pdo->exec('PRAGMA synchronous=NORMAL; PRAGMA temp_store=MEMORY; PRAGMA cache_size=-8000');
```
- `journal_mode=WAL` **is persistent on disk**; `foreign_keys` and `busy_timeout` are not. `PDO::ATTR_TIMEOUT` also maps to busy_timeout but only in whole seconds — use the pragma.
- `synchronous=NORMAL` is the correct WAL pairing: survives app/OS crash, **not** power loss; the checkpoint is then the only `fsync()`. Auto-checkpoint default = **1000 pages (~4 MB)**.
- **NFS caveat (hard blocker):** sqlite.org/wal.html — *"WAL does not work over a network filesystem"* because the `-shm` wal-index is mmapped shared memory. Many cPanel clusters NFS-mount `/home`. **Read back the return value of the `journal_mode` pragma**; if `strtolower($mode) !== 'wal'`, fall back to `journal_mode=TRUNCATE` + `synchronous=FULL` and record it. howtocorrupt.html §2.1 names NFS explicitly as a locking-bug source; §2.2: any `close()` in the process cancels *all* POSIX advisory locks (mitigated only in SQLite ≥ 3.51.0, 2025-11-04, and only in WAL) — so never `fopen()`/`copy()` the DB file while a connection is open. §2.6: hard/symlinks → separate journals → corruption.
- ⚑ **BEAT most PHP+SQLite code:** `PDO::beginTransaction()` emits `BEGIN` (DEFERRED). A deferred txn upgrading read→write returns `SQLITE_BUSY` **immediately, ignoring busy_timeout**. Use `$pdo->exec('BEGIN IMMEDIATE')` / `COMMIT` for every writing transaction. This single change removes ~all "database is locked" reports.
- Gate features on `$pdo->getAttribute(PDO::ATTR_SERVER_VERSION)`: `RETURNING` ≥ 3.35, `STRICT` tables ≥ 3.37, `UPSERT` ≥ 3.24. Shutdown hook: `PRAGMA analysis_limit=400; PRAGMA optimize`. Backup = `VACUUM INTO '…'` (safe on a live DB), never `copy()`.

## 2. Placing the .sqlite file

Docroot-only writable. Do all three:
1. Name it `.ht<32 hex>.sqlite` (`bin2hex(random_bytes(16))`, recorded in `config.php`). ⚑ Stock Apache `httpd.conf` ships `<FilesMatch "^\.ht">Require all denied</FilesMatch>` — this survives `AllowOverride None`, unlike your own .htaccess.
2. `data/.htaccess`: `Require all denied` + `Options -Indexes` + `<FilesMatch "\.(php|phtml|sqlite|sqlite-wal|sqlite-shm|ini|log)$">Require all denied</FilesMatch>`. `Require` needs `AllowOverride AuthConfig`.
3. ⚑ **Verification self-test**: loopback-fetch your own `https://host/data/<dbfile>`, `-wal`, `-shm`, `.user.ini`, `config.php` and assert HTTP 403/404. Run it in the installer *and* on a `/api/selftest` endpoint; refuse to complete install on a 200.

⚑ **PHP-FPM trap:** `php_value`/`php_flag` in `.htaccess` is mod_php-only and **500s under FPM**. Use `.user.ini` (INI syntax; `user_ini.filename` default `.user.ini`, `user_ini.cache_ttl` default **300 s**, so edits take 5 min). `.user.ini` is served as plaintext by default — deny it.

## 3. Router / JSON API
`/api/.htaccess`: `RewriteEngine On`, `RewriteCond %{REQUEST_FILENAME} !-f`, `RewriteRule ^ index.php [QSA,L]`. Docroot `.htaccess` SPA fallback excludes `/api/`.
Key routes by `METHOD.' '.parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)`; regex table for params. Input `json_decode(file_get_contents('php://input'), true, 32, JSON_THROW_ON_ERROR)` and require `Content-Type: application/json`. Output `JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES`, errors as RFC 9457 `application/problem+json`. `display_errors=0`, `log_errors=1`, `error_log` inside the denied dir; `set_exception_handler` + `register_shutdown_function` for E_ERROR. PHP 8.5 wins: `Uri\Rfc3986\Uri` instead of `parse_url()` for redirect validation, `array_first()`/`array_last()`, `#[\NoDiscard]` on `verifyCsrf()`, `get_error_handler()`.

## 4. Auth — use PHP sessions, not tokens
OWASP: never put tokens in `localStorage` ("a single XSS discloses every token"); prefer `HttpOnly; Secure; SameSite` cookies or BFF. With SQLite already present, server state is free, and revocation is instant.
`.user.ini`: `session.use_strict_mode=1` (**off by default, OWASP calls it mandatory**), `use_only_cookies=1`, `cookie_httponly=1`, `cookie_secure=1`, `cookie_samesite=Lax`, `use_trans_sid=0`, `cache_limiter=nocache`, `sid_length=48`, `sid_bits_per_character=6`, `session.save_path=` your denied dir (default `/tmp` is world-readable on shared hosts = hijack). `session_name('__Host-sid')` + `session_set_cookie_params(['path'=>'/','domain'=>'','secure'=>true,'httponly'=>true,'samesite'=>'Lax'])`. `session_regenerate_id(true)` at login/privilege change (keep a 60 s grace for in-flight XHR). Enforce idle (30 min) **and** absolute (8 h) timeouts in the payload, not via gc.
⚑ PortSwigger *Cookie Chaos* (2025): `U+2000`/`U+0085`/`U+00A0`-prefixed cookie names bypass `__Host-` where the server trims. Defensively reject any `$_COOKIE` key that `trim()`s to your session name but isn't identical.

## 5. CSRF
SameSite alone is **not** sufficient (OWASP: defence-in-depth only; Lax permits top-level GET, sibling-subdomain cookie injection bypasses it). Stateful app ⇒ **synchronizer token** in `$_SESSION`, compared with `hash_equals()`. Layer on: (a) require `Content-Type: application/json` **and** a custom header `X-CSRF-Token` → forces CORS preflight, unforgeable by simple requests; (b) exact-match `Origin`, falling back to `Referer`. If you ever go stateless, use *signed* double-submit — `hash_hmac('sha256', $sessionId.'|'.$rand.'|'.$exp, $key)` — never naive double-submit.

## 6. Password hashing
PHP 8.4+ `PASSWORD_BCRYPT_DEFAULT_COST = 12`; `PASSWORD_DEFAULT` is still bcrypt. ⚑ **`PASSWORD_ARGON2ID` requires a compile flag** (`--with-password-argon2` or sodium) and is frequently missing on shared hosts — detect with `in_array(PASSWORD_ARGON2ID, password_algos(), true)`, never `defined()`. If present: `['memory_cost'=>19456,'time_cost'=>2,'threads'=>1]` (OWASP m=19 MiB, t=2, p=1; other valid points: 47104/1/1, 12288/3/1, 9216/4/1, 7168/5/1). PHP's own default is 65536 KiB = 64 MiB — that can exceed a cheap FPM `memory_limit`. `threads` is ignored on libsodium builds. Else bcrypt cost 12–13 tuned to ≤350 ms.
bcrypt truncates at **72 bytes** and PHP 8 throws on NUL bytes — so pepper as OWASP writes it: `base64_encode(hash_hmac('sha384',$pw,$pepper,true))`. Cap input at 4096 bytes (Argon2 DoS). Call `password_needs_rehash()` on every successful login; column `TEXT` ≥ 255.

## 7. Verification / reset tokens
`$raw = bin2hex(random_bytes(32))` (256-bit). Store **only** `hash('sha256',$raw,true)` as a UNIQUE BLOB. Row: `id, user_id, purpose, token_hash, created_at, expires_at, used_at, request_ip`. Expiry: reset 30 min, verify 24 h. Atomic single-use — no TOCTOU:
```sql
UPDATE tokens SET used_at=:now WHERE token_hash=:h AND used_at IS NULL AND expires_at>:now
```
require `rowCount()===1`. Look up **by hash** (indexed), then `hash_equals()` as belt-and-braces; never `WHERE token = $raw`. On reset: destroy all that user's sessions, void all outstanding tokens of that purpose, send a "password changed" notice. Identical response + fixed-floor latency (`usleep`) for unknown emails.
⚑ Put the token in the **URL fragment** (`/#/reset?t=…`): it never reaches server logs, proxies, or `Referer`. Plus `Referrer-Policy: no-referrer` on that route.

## 8. Rate limiting + real client IP
**IP:** only `$_SERVER['REMOTE_ADDR']` is unspoofable. Trust `HTTP_CF_CONNECTING_IP` **only** when `REMOTE_ADDR` is inside Cloudflare's published ranges (`cloudflare.com/ips-v4`, `ips-v6`, refreshed by cron). Never take the leftmost `X-Forwarded-For`; if you must, take the *rightmost minus (trusted-proxy-count − 1)*. Key IPv6 by `/64`, IPv4 by `/32`.
**Two limiters.** Per-IP/endpoint = lazy-refill **token bucket** (one row, no growth):
```sql
CREATE TABLE rl (bucket TEXT PRIMARY KEY, tokens REAL NOT NULL, updated_at INTEGER NOT NULL) STRICT;
```
`tokens = min(cap, tokens + (now-updated)*rate)`; one `INSERT … ON CONFLICT DO UPDATE … RETURNING tokens` inside `BEGIN IMMEDIATE`. Per-account = **sliding-window log** (you need the audit trail anyway): `login_attempts(id, ts INTEGER, ip TEXT, account_key TEXT, ok INTEGER)`, indexes `(account_key,ts)`, `(ip,ts)`, count `ts > :now-900`.
**Lockout:** `delay = min(900, 1 << max(0,$fails-3))` seconds, store `locked_until`. ⚑ Return an **identical 401 body and status** whether locked or wrong password — no enumeration oracle; `Retry-After` only on the IP-level 429. Above a hard threshold, flip a `captcha_required` flag in the JSON so the SPA renders hCaptcha. Prune + `PRAGMA wal_checkpoint(TRUNCATE)` in cron.

## 9. hCaptcha siteverify
`POST https://api.hcaptcha.com/siteverify`, `application/x-www-form-urlencoded` (JSON body ⇒ `success:false`). Params: `secret`, `response` (required), `remoteip` (recommended), **`sitekey` (pins the token to your widget — use it)**. Response: `success`, `challenge_ts`, `hostname`, `error-codes[]`, plus Enterprise `score`/`score_reason`; `credit` is deprecated. Errors: `missing-input-secret`, `invalid-input-secret`, `missing-input-response`, `invalid-input-response`, `expired-input-response` (**120 s default TTL**), `already-seen-response` (legacy name `invalid-or-already-seen-response`), `bad-request`, `missing-remoteip`, `invalid-remoteip`, `not-using-dummy-passcode`, `sitekey-secret-mismatch`. Tokens are **single-use** — the first call consumes them, so never retry a token. 5 s timeout, **fail closed**, and don't trust `hostname` for auth (can be `not-provided`).

## 10. Mail without composer
`mail($to,$subj,$body,$headersArray,'-f'.$bounce)`. Use the **array** header form (PHP ≥7.2 formats it, blocking injection); `$to`/`$subject` are scrubbed of CR/LF by PHP, `$additional_headers` string form is **not**. On Unix use `\n` only — `\r\n` becomes `\r\r\n` after sendmail and breaks DKIM. Headers: `From:` (must be a mailbox on this host — otherwise SPF fails), `Reply-To`, `Date`, `Message-ID: <`bin2hex(random_bytes(16))`@yourdomain>`, `MIME-Version: 1.0`, `Content-Type: multipart/alternative; boundary="=_…"`, `Content-Transfer-Encoding: quoted-printable` (`quoted_printable_encode()`), `Auto-Submitted: auto-generated`. Subject: `mb_encode_mimeheader($s,'UTF-8','B',"\n")`. `-f` is passed through `escapeshellcmd()` — validate with `FILTER_VALIDATE_EMAIL` + allowlist first; some hosts pin it via `mail.force_extra_parameters`. Set `mail.add_x_header=0` (the `X-PHP-Originating-Script` header is a spam signal) and `mail.log` to a denied path.
Reality: on cPanel/Plesk you get DKIM **only** if the From domain is hosted there and signed at the MTA; hand-rolled DKIM is incompatible with the `\n` requirement. Ensure envelope-domain == From-domain (DMARC alignment), always include a text/plain part.
⚑ **BEAT:** queue into a SQLite `mail_outbox` table and flush from `cron.php` — retries, per-hour throttling (shared hosts cap ~100–300/h), and a real failure log. `mail()` returning `true` means only "accepted for delivery".

## 11. Headers + CSP for a Vite SPA
`.htaccess` `<IfModule mod_headers.c> Header always set …`: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), camera=(), microphone=(), interest-cohort=()`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `X-XSS-Protection: 0`, `Header unset X-Powered-By` + `expose_php=Off`. Drop `Expect-CT`/HPKP.
A Vite production build emits **no inline scripts** — only `<script type="module" crossorigin src>`, `<link rel="stylesheet">`, `modulepreload` — so `'self'` suffices without nonces. Only if you use `html.cspNonce` does Vite inject `<meta property="csp-nonce" nonce="PLACEHOLDER">`, and you **must** substitute a fresh value per request.
```
default-src 'none'; script-src 'self' https://js.hcaptcha.com https://*.hcaptcha.com;
style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://*.hcaptcha.com;
frame-src https://*.hcaptcha.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none';
object-src 'none'; upgrade-insecure-requests
```
(`'unsafe-inline'` in `style-src` is forced by the hCaptcha widget; drop it if you self-host no captcha. Never `script-src data:` — if `build.assetsInlineLimit` inlines assets, keep `data:` on `img-src` only.) `index.html` → `Cache-Control: no-store`; hashed assets → `max-age=31536000, immutable`.

## 12. cron.php
```php
if (!hash_equals(CRON_KEY, (string)($_SERVER['HTTP_X_CRON_KEY'] ?? $_GET['k'] ?? ''))) {
    http_response_code(404); exit; }              // identical 404 body — no existence leak
$fh = fopen(LOCK, 'c');
if (!flock($fh, LOCK_EX|LOCK_NB)) { exit; }       // never unlink the lock (unlink/flock race)
ftruncate($fh,0); fwrite($fh, getmypid().' '.time()); ignore_user_abort(true);
```
Hold `$fh` in a static/global until shutdown. Add a stale-steal rule (a run older than N minutes may take the lock). Work in chunks against a `microtime(true)+20` deadline — shared hosts cap `max_execution_time`. Jitter-sleep + rate-limit failed key attempts.

## 13. Install wizard that self-locks
`install.php`: **line 1** = `if (file_exists(CONFIG) || file_exists(DATA.'/.installed')) { http_response_code(410); exit; }`. Preflight: PHP ≥ 8.5, `pdo_sqlite`, SQLite version, `password_algos()`, `function_exists('mail')` (check `disable_functions`), `open_basedir`, curl/`allow_url_fopen`, mod_rewrite + mod_headers via loopback probes, dir writability. Then generate `config.php` **as a PHP file returning an array** (unreadable even if the deny rule fails) holding: random DB filename, `APP_KEY`, CSRF/HMAC key, pepper, `CRON_KEY`, hCaptcha keys.
⚑ **Anti-install-race** (the WordPress `wp-admin/install.php` class of attack, real on FTP deploys): on first hit, `install.php` writes `data/setup-<rand>.txt` and refuses to proceed until the operator pastes its contents back — proving filesystem access. On success: write `data/.installed`, run the §2 loopback self-test, `chmod($self,0000)` and `rename()` to `install.php.<rand>.disabled` (chmod is unreliable over FTP, so the file-existence guard is the real lock).

**Sources:** [sqlite.org/wal.html](https://www.sqlite.org/wal.html) · [sqlite.org/howtocorrupt.html](https://www.sqlite.org/howtocorrupt.html) · [SQLite forum: BEGIN IMMEDIATE / busy_timeout](https://sqlite.org/forum/info/c3cb9524bef62b67) · [berthub.eu on SQLITE_BUSY](https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/) · [php.net ref.pdo-sqlite](https://www.php.net/manual/en/ref.pdo-sqlite.php) · [php.net PDO::connect](https://www.php.net/manual/en/pdo.connect.php) · [php.net .user.ini](https://www.php.net/manual/en/configuration.file.per-user.php) · [php.net session security ini](https://www.php.net/manual/en/session.security.ini.php) · [php.net password_hash](https://www.php.net/manual/en/function.password-hash.php) · [php.net password constants](https://www.php.net/manual/en/password.constants.php) · [php.watch bcrypt cost 12](https://php.watch/versions/8.4/password_hash-bcrypt-cost-increase) · [php.net mail()](https://www.php.net/manual/en/function.mail.php) · [php.net 8.5 release](https://www.php.net/releases/8.5/en.php) · [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) · [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) · [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) · [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html) · [OWASP HTTP Headers](https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html) · [hCaptcha docs](https://docs.hcaptcha.com/) · [nonecap siteverify](https://nonecap.com/learn/hcaptcha-siteverify/) · [Apache 2.4 htaccess](https://httpd.apache.org/docs/2.4/howto/htaccess.html) · [MDN X-Forwarded-For](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For) · [Cloudflare HTTP headers](https://developers.cloudflare.com/fundamentals/reference/http-headers/) · [PortSwigger Cookie Chaos](https://portswigger.net/research/cookie-chaos-how-to-bypass-host-and-secure-cookie-prefixes) · [Vite features/CSP](https://vite.dev/guide/features.html) · [Arcjet rate-limiting algorithms](https://blog.arcjet.com/rate-limiting-algorithms-token-bucket-vs-sliding-window-vs-fixed-window/)