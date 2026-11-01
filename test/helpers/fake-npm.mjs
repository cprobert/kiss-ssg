// A stand-in for npm, put first on PATH by test/integration/upgrade.test.js so
// `kiss-ssg upgrade` can be tested end to end with no network. It records
// every call, answers `npm config get registry`, and makes the change a real
// `npm install kiss-ssg@<version>` makes: a real folder (any link removed),
// a lockfile entry resolved from the registry, and the spec in package.json.
// Environment:
//   FAKE_NPM_LOG        a file each call's argv is appended to, one JSON line
//   FAKE_NPM_REGISTRY   what `config get registry` prints
//   FAKE_NPM_KEEP_LINK  leave a link in place, as a plain `npm install` does
//   FAKE_NPM_FAIL       exit 1 from `install`
// @test-exempt: test fixture, exercised by test/integration/upgrade.test.js
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
if (process.env.FAKE_NPM_LOG)
  fs.appendFileSync(process.env.FAKE_NPM_LOG, `${JSON.stringify(args)}\n`)
const registry = process.env.FAKE_NPM_REGISTRY ?? 'https://registry.npmjs.org/'

if (args[0] === 'config' && args[1] === 'get' && args[2] === 'registry') {
  console.log(registry)
  process.exit(0)
}
if (args[0] !== 'install') {
  console.error(`fake npm: no stand-in for: npm ${args.join(' ')}`)
  process.exit(1)
}
if (process.env.FAKE_NPM_FAIL) {
  console.error('fake npm: install failed, as asked')
  process.exit(1)
}

const spec = args.find((a) => a.startsWith('kiss-ssg@'))
const version = spec.slice('kiss-ssg@'.length)
const cwd = process.cwd()
const engine = path.join(cwd, 'node_modules', 'kiss-ssg')
const readJson = (file, fallback) =>
  fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback

let linked = false
try {
  linked = fs.lstatSync(engine).isSymbolicLink()
} catch {
  /* nothing installed yet */
}
if (!(linked && process.env.FAKE_NPM_KEEP_LINK)) {
  // A link is removed as a link, never followed: its target is someone's tree.
  if (linked) fs.unlinkSync(engine)
  else fs.rmSync(engine, { recursive: true, force: true })
  fs.mkdirSync(engine, { recursive: true })
  fs.writeFileSync(
    path.join(engine, 'package.json'),
    JSON.stringify({ name: 'kiss-ssg', version }),
  )
  const lockFile = path.join(cwd, 'package-lock.json')
  const lock = readJson(lockFile, { lockfileVersion: 3, packages: { '': {} } })
  lock.packages['node_modules/kiss-ssg'] = {
    version,
    resolved: `${registry}kiss-ssg/-/kiss-ssg-${version}.tgz`,
  }
  fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2))
}

const pkgFile = path.join(cwd, 'package.json')
const pkg = readJson(pkgFile, {})
const section = args.includes('--save-prod')
  ? 'dependencies'
  : 'devDependencies'
for (const s of ['dependencies', 'devDependencies'])
  if (pkg[s]) delete pkg[s]['kiss-ssg']
pkg[section] = {
  ...pkg[section],
  'kiss-ssg': args.includes('--save-exact') ? version : `^${version}`,
}
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2))
