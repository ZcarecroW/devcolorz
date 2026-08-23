/**
 * Mirror `deploy/` to the FTP host.
 *
 * Credentials come from the environment or `scripts/deploy.config.json`, which
 * is gitignored. They are never read from anywhere that could be committed.
 *
 *   DEVCOLORZ_FTP_HOST, DEVCOLORZ_FTP_USER, DEVCOLORZ_FTP_PASSWORD
 *   DEVCOLORZ_FTP_ROOT      (default "/")
 *   DEVCOLORZ_FTP_SECURE    ("true" | "false" | "implicit", default true)
 *   DEVCOLORZ_FTP_INSECURE_TLS  ("true" to skip certificate verification)
 *
 * Run: node scripts/deploy.mjs [--dry] [--only=api]
 *
 * The remote `storage/` directory and `config.php` are never touched: they hold
 * the live database and the installation secrets. Deleting them would wipe
 * every account on the site, which is not something a deploy script should be
 * able to do by accident.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, posix } from 'node:path'
import { Client } from 'basic-ftp'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const local = join(root, 'deploy')

const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const only = args.find((a) => a.startsWith('--only='))?.slice(7) ?? null

function loadConfig() {
  const file = join(here, 'deploy.config.json')
  const fromFile = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  const config = {
    host: process.env.DEVCOLORZ_FTP_HOST ?? fromFile.host,
    user: process.env.DEVCOLORZ_FTP_USER ?? fromFile.user,
    password: process.env.DEVCOLORZ_FTP_PASSWORD ?? fromFile.password,
    root: process.env.DEVCOLORZ_FTP_ROOT ?? fromFile.root ?? '/',
    secure: process.env.DEVCOLORZ_FTP_SECURE ?? fromFile.secure ?? true,
    // Opt-out for a host with a self-signed or mismatched certificate. Off by
    // default: this connection carries the account password in the clear
    // inside the TLS session, so an unverified peer is the whole risk.
    insecureTls:
      (process.env.DEVCOLORZ_FTP_INSECURE_TLS ?? String(fromFile.insecureTls ?? '')) === 'true',
  }
  if (!config.host || !config.user || !config.password) {
    console.error(
      'Missing FTP credentials.\n' +
        'Set DEVCOLORZ_FTP_HOST / _USER / _PASSWORD, or create scripts/deploy.config.json.',
    )
    process.exit(1)
  }
  if (config.secure === 'true') config.secure = true
  if (config.secure === 'false') config.secure = false
  return config
}

/** Paths that exist on the server and must survive a deploy. */
const PROTECTED = new Set(['storage', 'config.php'])

function localTree(dir, prefix = '') {
  const entries = []
  for (const name of readdirSync(dir)) {
    const rel = prefix ? posix.join(prefix, name) : name
    if (PROTECTED.has(rel)) continue
    const full = join(dir, name)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      entries.push({ type: 'dir', rel, full })
      entries.push(...localTree(full, rel))
    } else {
      entries.push({ type: 'file', rel, full, size: stat.size })
    }
  }
  return entries
}

async function main() {
  if (!existsSync(local)) {
    console.error('deploy/ is missing. Run `npm run build && npm run bundle` first.')
    process.exit(1)
  }

  const config = loadConfig()
  let tree = localTree(local)
  if (only) {
    tree = tree.filter((entry) => entry.rel === only || entry.rel.startsWith(`${only}/`))
  }

  const files = tree.filter((e) => e.type === 'file')
  const bytes = files.reduce((sum, f) => sum + f.size, 0)
  console.log(
    `${files.length} files (${(bytes / 1024 / 1024).toFixed(2)} MB) → ${config.host}${config.root}`,
  )

  if (dryRun) {
    for (const entry of tree) console.log(`  ${entry.type === 'dir' ? 'D' : ' '} ${entry.rel}`)
    console.log('\nDry run — nothing uploaded.')
    return
  }

  const client = new Client(30_000)
  client.ftp.verbose = false

  try {
    /*
     * The certificate is verified.
     *
     * `rejectUnauthorized: false` used to sit here, which meant the FTPS
     * session that carries the account password in plaintext AUTH TLS would
     * accept any certificate at all — the one thing TLS is for. Hosts with a
     * self-signed or mismatched certificate can opt out per deployment with
     * `"insecureTls": true` in deploy.config.json, and it says so out loud.
     */
    if (config.insecureTls) {
      console.warn('WARNING: TLS certificate verification is disabled for this connection.')
    }
    await client.access({
      host: config.host,
      user: config.user,
      password: config.password,
      secure: config.secure,
      secureOptions: { rejectUnauthorized: config.insecureTls !== true },
    })

    // Directories first, so an upload never races its own parent.
    for (const entry of tree.filter((e) => e.type === 'dir')) {
      const remote = posix.join(config.root, entry.rel)
      await client.ensureDir(remote)
      await client.cd(config.root)
    }

    let done = 0
    for (const file of files) {
      const remote = posix.join(config.root, file.rel)
      await client.uploadFrom(file.full, remote)
      done++
      const pct = Math.round((done / files.length) * 100)
      process.stdout.write(`\r  uploading ${done}/${files.length} (${pct}%) ${file.rel.slice(0, 48)}          `)
    }
    process.stdout.write('\n')
    console.log('Deploy complete.')
  } finally {
    client.close()
  }
}

main().catch((error) => {
  console.error('\nDeploy failed:', error.message)
  process.exit(1)
})
