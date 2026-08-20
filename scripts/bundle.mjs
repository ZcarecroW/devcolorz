/**
 * Assemble the deployable tree in `deploy/`.
 *
 * The built SPA and the PHP backend live in different places in the repo but
 * have to sit side by side on the server. This puts them together so the
 * deploy step is a plain directory mirror with nothing to reason about.
 *
 * Run: node scripts/bundle.mjs   (after `npm run build`)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

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
