/**
 * Assemble the deployable tree in `deploy/`.
 *
 * The built SPA and the PHP backend live in different places in the repo but
 * have to sit side by side on the server. This puts them together so the
 * deploy step is a plain directory mirror with nothing to reason about.
 *
 * Run: node scripts/bundle.mjs   (after `npm run build`)
 */
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const RELEASE_README_BODY = "A colour-system studio you can host yourself.\nhttps://github.com/ZcarecroW/devcolorz\n\n\nINSTALLING\n----------\n\n1. Upload the CONTENTS of this folder (not the folder itself) into the\n   document root of a domain or subdomain. That is usually the directory\n   your host calls public_html, httpdocs or www.\n\n   index.html must end up directly in the document root. If you open your\n   site and see a directory listing or a 404, the files are one level\n   too deep.\n\n   The document root is a requirement, not a preference: the built assets,\n   the API route and the storage deny rules are absolute paths. Installing\n   into a subfolder needs the four edits listed in docs/INSTALL.md.\n\n2. Open your site in a browser. The setup wizard takes over from there.\n\n   It checks your server first and tells you plainly if anything is\n   missing. Then it asks for a setup code, which it has written to\n   storage/setup-code.txt -- open that file over FTP or in your host's\n   file manager and paste what is inside.\n\n   That step is not busywork. It proves you are the person who uploaded\n   these files, rather than whoever happened to find the URL first.\n\n3. Copy the cron token and invitation code the wizard shows you. They are\n   displayed once and cannot be retrieved afterwards, only replaced.\n\n4. Add a cron job, every five minutes:\n\n      curl -fsS -H \"X-Cron-Key: YOUR-TOKEN\" https://example.com/cron.php\n\n   Without it the app still works; you lose outgoing email, nightly\n   backups and the pruning of old rows.\n\n\nREQUIREMENTS\n------------\n\n  PHP         8.2 or newer, with pdo_sqlite\n  SQLite      3.24 or newer (3.37+ preferred)\n  Web server  Apache with .htaccess, or nginx -- see the install guide\n  HTTPS       strongly recommended\n  Email       optional, but account confirmation needs mail()\n\nNo Composer, no Node, no database server, no build step.\n\n\nUPGRADING\n---------\n\nUpload a newer release over the top, but do NOT overwrite:\n\n  config.php    your installation's secrets\n  storage/      your database, sessions and backups\n\nSchema migrations run on the first request afterwards.\n\n\nBEHIND A PROXY OR CDN\n---------------------\n\nIf something in front of this server terminates TLS and forwards plain\nHTTP to PHP, add this line to config.php, or sign-in will fail and the\nsession cookie will lose its Secure flag:\n\n  'trust_proxy' => true,\n\nOnly do this when you control what sits in front of the server. On a\ndirectly reachable host, that header is set by whoever is calling.\n\n\nFULL DOCUMENTATION\n------------------\n\n  Install guide   https://github.com/ZcarecroW/devcolorz/blob/main/docs/INSTALL.md\n  User guide      https://github.com/ZcarecroW/devcolorz/blob/main/docs/GUIDE.md\n\n\nLICENCE\n-------\n\nMIT -- free for any use, including commercial. See LICENSE.\nThird-party components are credited in THIRD-PARTY.md.\n"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const dist = join(root, 'dist')
const server = join(root, 'server')
const out = join(root, 'deploy')

if (!existsSync(dist)) {
  console.error('dist/ is missing. Run `npm run build` first.')
  process.exit(1)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

// The SPA first, then the backend on top: if a filename ever collides, the
// server-side file is the one that must win.
cpSync(dist, out, { recursive: true })
cpSync(server, out, {
  recursive: true,
  filter: (src) => {
    const name = src.slice(server.length + 1).replace(/\\/g, '/')
    // Never ship local runtime state or a local installation's secrets.
    if (name.startsWith('storage')) return false
    if (name === 'config.php') return false
    return true
  },
})

// storage/ is created by the app at runtime, but shipping the deny rules with
// the release means the directory is protected from the very first request
// rather than from whenever PHP first happens to write there.
const storage = join(out, 'storage')
mkdirSync(storage, { recursive: true })
writeFileSync(
  join(storage, '.htaccess'),
  [
    '# Runtime state. Nothing in here is ever meant to be served.',
    '<IfModule mod_authz_core.c>',
    '    Require all denied',
    '</IfModule>',
    '<IfModule !mod_authz_core.c>',
    '    Order allow,deny',
    '    Deny from all',
    '</IfModule>',
    '',
    '<IfModule mod_php.c>',
    '    php_flag engine off',
    '</IfModule>',
    'Options -Indexes -ExecCGI',
    'RemoveHandler .php .phtml .php3 .php4 .php5 .php7 .php8 .cgi .pl',
    'AddType text/plain .php .phtml .sqlite .db',
    '',
  ].join('\n'),
)
writeFileSync(join(storage, 'index.html'), '<!doctype html><title>Not found</title>\n')


/*
 * Give the CSP the hash of the one inline script we ship.
 *
 * index.html sets the dark class before first paint so a dark-mode visitor
 * does not get a white flash. `script-src 'self'` blocks it — silently,
 * since a blocked script is not an error the page can see — so every
 * dark-mode load flashed white and then corrected itself. Hashing it here
 * keeps the policy strict: no 'unsafe-inline', and the hash moves with the
 * script.
 */
const indexPath = join(out, 'index.html')
const html = readFileSync(indexPath, 'utf8')
const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
  (match) =>
    `'sha256-${createHash('sha256').update(match[1], 'utf8').digest('base64')}'`,
)

const htaccessPath = join(out, '.htaccess')
if (hashes.length && existsSync(htaccessPath)) {
  const before = readFileSync(htaccessPath, 'utf8')
  const after = before.replace(
    /script-src 'self'/,
    (match) => `${match} ${hashes.join(' ')}`,
  )
  if (after === before) {
    console.warn('warning: no script-src found in .htaccess; inline scripts will be blocked')
  } else {
    writeFileSync(htaccessPath, after)
    console.log(`CSP: hashed ${hashes.length} inline script(s)`)
  }
}

/*
 * The files a release is expected to carry.
 *
 * `deploy/` is wiped and rebuilt on every run, so anything not written here
 * does not exist in the next ZIP. README.txt, LICENSE and THIRD-PARTY.md
 * were added to the tree by hand once and quietly disappeared the next time
 * anyone ran this script.
 */
for (const name of ['LICENSE', 'THIRD-PARTY.md']) {
  const source = join(root, name)
  if (existsSync(source)) copyFileSync(source, join(out, name))
  else console.warn(`warning: ${name} is missing from the repository root`)
}

/*
 * The version the running application reports, not package.json's.
 *
 * APP_VERSION is what /meta returns and what the admin console displays, so
 * it is the number a release is actually identified by. Reading it here
 * means the ZIP's README cannot disagree with the app inside it.
 */
const versionSource = readFileSync(join(server, 'api', 'lib', 'Version.php'), 'utf8')
const versionMatch = /APP_VERSION\s*=\s*'([^']+)'/.exec(versionSource)
if (!versionMatch) {
  console.error('could not read APP_VERSION from server/api/lib/Version.php')
  process.exit(1)
}
const version = versionMatch[1]
writeFileSync(join(out, 'README.txt'), releaseReadme(version))


/**
 * The plain-text README that ships inside the release ZIP.
 *
 * Generated rather than kept in the tree, because `deploy/` is deleted and
 * rebuilt on every run — a file placed there by hand survives exactly until
 * the next bundle.
 */
function releaseReadme(version) {
  const title = `DevColorz ${version}`
  return title + '\n' + '='.repeat(title.length) + '\n\n' + RELEASE_README_BODY
}

function walk(dir, base = '') {
  let files = 0
  let bytes = 0
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      const nested = walk(full, `${base}${entry}/`)
      files += nested.files
      bytes += nested.bytes
    } else {
      files++
      bytes += stat.size
    }
  }
  return { files, bytes }
}

const { files, bytes } = walk(out)
console.log(`deploy/ assembled — ${files} files, ${(bytes / 1024 / 1024).toFixed(2)} MB`)
