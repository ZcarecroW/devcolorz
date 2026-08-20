# DevColorz

A color-system studio: generate palettes inside constraints you define, judge them
in real interfaces, and export them as production-ready design tokens.

Built as a Vue 3 single-page app with a dependency-free PHP 8 + SQLite backend,
deployable to ordinary shared hosting over FTP.

---

## What makes it different

**Constrained randomness, not slot-machine randomness.** Coolors gives you a
space bar. DevColorz gives you a region of a color space: per-channel ranges
with wrap-around hue, a distribution per channel, a minimum perceptual distance
between results, and a seeded generator so a palette is reproducible from its
link. The preview grid re-rolls as you drag, so you tune a setting instead of
gambling on it. Modelled on the range-based randomisation in Astute Graphics'
Randomino, generalised across eleven color spaces.

**OKLCH throughout.** Every color is stored as OKLCH and only serialised at the
edges. That is what makes "10% lighter" mean the same thing for yellow and for
blue, and it is why the scales, dark-mode derivation and accessible-pair solving
here produce usable results rather than approximately-right ones.

**Previews that are actually assembled.** A palette of N colors is mapped onto
each preview template's semantic slots by a solver — background chosen first,
text chosen for contrast against it, brand color chosen for chroma and
separation, status colors matched by hue neighbourhood — so an arbitrary palette
of 2 or 40 colors renders a legible interface instead of a random one. Colors we
had to invent are flagged as such.

**Accessibility as an input.** WCAG 2.x and APCA side by side, an N×N contrast
matrix, color-vision simulation applied in linear RGB (which is how the Machado
matrices are defined, and which most implementations get wrong), a collision
detector for pairs that collapse under deuteranopia, and a one-click fix that
moves a color's lightness while keeping its hue.

**Export that answers the real questions.** Notation, variable naming, prefix
and suffix, transparent variants (opacity ladder, solved alpha, or neutral
overlay), tonal scales, and light/dark derivation with six inversion strategies
— each explained, including why the naive HSL flip everybody tries first does
not work. Sixteen output formats from CSS custom properties to a shadcn registry
item.

---

## Layout

```
app/                    Vue 3 SPA
  lib/color/            the color engine — no Vue, no DOM, fully unit-tested
  lib/theme/            the 44-token shadcn/tweakcn contract
  lib/export/           token graph and output emitters
  components/           studio, generator, preview, export, a11y, admin UI
  stores/               palette, studio, theme, session
server/                 PHP backend, deployed alongside the built SPA
  api/lib/              framework-free application classes
  api/routes/           endpoint handlers
  cron.php              scheduled work, token-guarded
scripts/                build, bundle, deploy and code-generation
docs/                   research dossier, API digest, conventions
```

The color engine never imports Vue and Vue never imports culori. That boundary
is load-bearing: it is why the engine can be tested as plain functions and why a
hue drag stays at 60fps.

---

## Development

```bash
npm install
npm run dev            # Vite on :5273, proxying /api to the deployed backend
npm run test           # engine unit tests
npm run typecheck
```

To run the backend locally you need PHP 8.2+ — or Docker:

```bash
docker run --rm -d --name dcz -p 8080:8080 \
  -v "$PWD:/w" -w /w php:8.4-cli \
  php -S 0.0.0.0:8080 -t server scripts/dev-router.php

BASE=http://127.0.0.1:8080 STORAGE=server/storage sh scripts/smoke-api.sh
```

`scripts/dev-router.php` reproduces the two `.htaccess` rules that matter:
`/api/*` falls through to the front controller, and `storage/` is refused.

---

## Deploying

```bash
npm run build          # typecheck + Vite build
npm run bundle         # assemble deploy/ from dist/ + server/
npm run deploy         # mirror deploy/ over FTP
# or all three:
npm run ship
```

Credentials come from `DEVCOLORZ_FTP_HOST` / `_USER` / `_PASSWORD`, or from
`scripts/deploy.config.json`, which is gitignored. The deploy never touches the
remote `storage/` directory or `config.php` — those hold the live database and
the installation secrets.

### First run

Visit the site. The SPA detects that no `config.php` exists and routes to the
setup wizard, which:

1. runs environment checks (PHP version, SQLite version, writability, Argon2id,
   `mail()`, HTTPS, outbound HTTP, and a real WAL probe on a scratch database),
2. writes a random code to `storage/setup-code.txt` and asks you to paste it
   back. This proves you are the person who uploaded the files rather than
   someone who found the URL first — the window between upload and first login
   is the most dangerous moment in a self-hosted app's life,
3. creates the first administrator, generates the cron token and the invitation
   code, and shows both once,
4. fetches `config.php`, the database file and `storage/` back over HTTP and
   reports whether the server is actually refusing them.

Then add the cron entry:

```
*/5 * * * *  curl -fsS -H "X-Cron-Key: YOUR-TOKEN" https://your-site/cron.php
```

The token in a header rather than the query string keeps it out of access logs.
It flushes the mail queue, prunes expired rows, rescores the public feed,
checkpoints the write-ahead log and takes a nightly `VACUUM INTO` backup, all
chunked against a 20-second deadline so `max_execution_time` cannot kill a job
mid-write.

### Accounts

Registration requires an invitation code that the administrator sets. New
accounts confirm their address by email before they can sign in. Everything
except saving works without an account at all.

---

## Security notes

Things that are deliberate, and would look like mistakes otherwise:

- **Sessions are ours, not PHP's.** `session.save_path` defaults to a
  world-readable `/tmp` on shared hosting. The cookie carries a raw 256-bit id;
  the table stores only its SHA-256, so a database backup cannot be replayed.
- **`BEGIN IMMEDIATE`, never `PDO::beginTransaction()`.** A deferred transaction
  that upgrades from read to write returns `SQLITE_BUSY` immediately, ignoring
  `busy_timeout`.
- **Parameters are bound by type.** `PDOStatement::execute($array)` binds
  everything as a string, and SQLite ranks every INTEGER below every TEXT, so
  `last_seen_at + ? <= ?` silently matches every row.
- **WAL is verified, not assumed.** It does not work over NFS, and the pragma
  returns the mode in effect rather than the mode requested. The fallback is
  recorded and shown in the admin console.
- **Sign-in reveals nothing.** Wrong password, locked account and unknown
  address all return the same 401, and a missing account still burns a dummy
  password hash so the timing matches.
- **The database filename starts with `.ht`.** Stock Apache refuses to serve it
  even when `AllowOverride` is off and the `storage/.htaccess` is ignored.

---

## Credits

Color names from [color-names](https://github.com/meodai/color-names) by meodai.
Color-vision simulation matrices from Machado, Oliveira & Fernandes (2009).
APCA from the [APCA-W3](https://github.com/Myndex/apca-w3) work by Andrew Somers.
UI components from [shadcn-vue](https://www.shadcn-vue.com/).
