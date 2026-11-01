// `kiss-ssg upgrade`, end to end through the bin, with a fake npm first on
// PATH (test/helpers/fake-npm.mjs) so the gates never touch the network. The
// real npm's behaviour — a plain install keeps a `file:` link, an install
// naming the version replaces it — is measured by the opt-in test at the end,
// which runs only with KISS_NETWORK_TESTS=1.
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')
const fakeNpm = path.join(repoRoot, 'test', 'helpers', 'fake-npm.mjs')
const own = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
).version
const REGISTRY = 'https://registry.npmjs.org/'

let temp = null
afterEach(() => {
  if (temp) fs.rmSync(temp, { recursive: true, force: true })
  temp = null
})

/**
 * A site folder, a folder of npm shims, and a scratch "working tree" to link
 * to — all under one temp folder, so a link removed or followed by mistake
 * can only ever touch the test's own files.
 */
function setUp({
  spec = '^2.6.2',
  installed = '2.6.2',
  link = false,
  gitInit = true,
} = {}) {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-upgrade-'))
  const site = path.join(temp, 'site')
  const shims = path.join(temp, 'shims')
  const tree = path.join(temp, 'tree')
  fs.mkdirSync(site)
  fs.mkdirSync(shims)
  fs.writeFileSync(
    path.join(shims, 'npm'),
    `#!/bin/sh\nexec "${process.execPath}" "${fakeNpm}" "$@"\n`,
    { mode: 0o755 },
  )
  fs.writeFileSync(
    path.join(shims, 'npm.cmd'),
    `@"${process.execPath}" "${fakeNpm}" %*\r\n`,
  )
  fs.writeFileSync(
    path.join(site, 'package.json'),
    JSON.stringify(
      { name: 'site', private: true, devDependencies: { 'kiss-ssg': spec } },
      null,
      2,
    ),
  )
  const engine = path.join(site, 'node_modules', 'kiss-ssg')
  if (link) {
    fs.mkdirSync(tree)
    fs.writeFileSync(
      path.join(tree, 'package.json'),
      JSON.stringify({ name: 'kiss-ssg', version: installed }),
    )
    fs.mkdirSync(path.join(site, 'node_modules'))
    fs.symlinkSync(tree, engine, 'junction')
    fs.writeFileSync(
      path.join(site, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': {},
          'node_modules/kiss-ssg': { resolved: '../tree', link: true },
        },
      }),
    )
  } else if (installed) {
    fs.mkdirSync(engine, { recursive: true })
    fs.writeFileSync(
      path.join(engine, 'package.json'),
      JSON.stringify({ name: 'kiss-ssg', version: installed }),
    )
    fs.writeFileSync(
      path.join(site, 'package-lock.json'),
      JSON.stringify({
        lockfileVersion: 3,
        packages: {
          '': {},
          'node_modules/kiss-ssg': {
            version: installed,
            resolved: `${REGISTRY}kiss-ssg/-/kiss-ssg-${installed}.tgz`,
          },
        },
      }),
    )
  }
  fs.writeFileSync(path.join(site, '.gitignore'), 'node_modules/\n')
  if (gitInit) {
    const g = (...args) =>
      spawnSync('git', args, { cwd: site, encoding: 'utf8' })
    g('init', '-q')
    g('add', '.')
    g(
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-q',
      '-m',
      'site',
    )
  }
  return { site, shims, engine, log: path.join(temp, 'npm.log') }
}

function upgrade({ site, shims, log }, args = [], env = {}) {
  const pathKey =
    Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'
  const run = spawnSync(process.execPath, [bin, 'upgrade', ...args], {
    cwd: site,
    encoding: 'utf8',
    env: {
      ...process.env,
      [pathKey]: `${shims}${path.delimiter}${process.env[pathKey]}`,
      FAKE_NPM_LOG: log,
      FAKE_NPM_REGISTRY: REGISTRY,
      ...env,
    },
  })
  const calls = fs.existsSync(log)
    ? fs
        .readFileSync(log, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : []
  return { ...run, installs: calls.filter((c) => c[0] === 'install') }
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'))

describe('kiss-ssg upgrade', () => {
  it("installs its own version, verifies it, and prints the notes since the site's version", () => {
    const s = setUp()
    const run = upgrade(s)
    expect(run.status, run.stderr).toBe(0)
    expect(run.installs).toEqual([['install', `kiss-ssg@${own}`, '--save-dev']])
    expect(run.stdout).toMatch(
      new RegExp(`^kiss-ssg 2\\.6\\.2 → ${own.replace(/\./g, '\\.')}`),
    )
    expect(run.stdout).toContain(
      `ok: node_modules/kiss-ssg is ${own}, not a link`,
    )
    expect(run.stdout).toContain("## 2.6.4 — Upgrading: the audit's first run")
    expect(run.stdout).not.toContain('## 2.5.0')
    expect(readJson(path.join(s.site, 'package.json')).devDependencies).toEqual(
      {
        'kiss-ssg': `^${own}`,
      },
    )
  })

  // The hazard the command exists for: six of six sites on the 2.5.0 upgrade
  // kept a `file:` link to a working tree after their pin moved.
  it('replaces a file: link to a working tree, and says it did', () => {
    const s = setUp({ spec: 'file:../tree', installed: '2.8.7', link: true })
    const run = upgrade(s)
    expect(run.status, run.stderr).toBe(0)
    expect(fs.lstatSync(s.engine).isSymbolicLink()).toBe(false)
    expect(run.stdout).toMatch(
      /replaces package\.json's kiss-ssg file:\.\.\/tree/,
    )
    expect(run.stdout).toMatch(/kiss-ssg \(unknown\) →/)
    // The tree it pointed at is untouched.
    expect(fs.existsSync(path.join(temp, 'tree', 'package.json'))).toBe(true)
  })

  it('fails, naming the fix, when the link survives the install', () => {
    const s = setUp({ spec: 'file:../tree', installed: '2.8.7', link: true })
    const run = upgrade(s, [], { FAKE_NPM_KEEP_LINK: '1' })
    expect(run.status).toBe(1)
    expect(run.stdout).toMatch(/FAILED: node_modules\/kiss-ssg is still a link/)
    expect(run.stdout).toMatch(/fix: .*npm install kiss-ssg@/)
  })

  it('refuses uncommitted changes to package.json, and runs no install', () => {
    const s = setUp()
    fs.appendFileSync(path.join(s.site, 'package.json'), '\n')
    const run = upgrade(s)
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/uncommitted changes in package\.json/)
    expect(run.installs).toEqual([])
  })

  // Codex (2026-11-01): the recovery after `npm update` broke a build is
  // `--plan --from`, and the lockfile is uncommitted exactly then.
  it('--plan prints the notes past uncommitted changes, and says the install is blocked', () => {
    const s = setUp()
    fs.appendFileSync(path.join(s.site, 'package-lock.json'), '\n')
    const run = upgrade(s, ['--plan', '--from', '2.6.2'])
    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toMatch(/install blocked: uncommitted changes/)
    expect(run.stdout).toContain("## 2.6.4 — Upgrading: the audit's first run")
    expect(run.installs).toEqual([])
  })

  it('refuses a registry release newer than itself', () => {
    const s = setUp({ installed: '99.0.0' })
    const run = upgrade(s)
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/newer than/)
    expect(run.installs).toEqual([])
  })

  it('refuses a folder with no package.json', () => {
    const s = setUp({ gitInit: false })
    fs.rmSync(path.join(s.site, 'package.json'))
    const run = upgrade(s)
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/kiss-ssg init/)
  })

  it('carries on outside a git repository', () => {
    const s = setUp({ gitInit: false })
    const run = upgrade(s)
    expect(run.status, run.stderr).toBe(0)
    expect(run.installs).toHaveLength(1)
  })

  it('--plan prints the notes and installs nothing', () => {
    const s = setUp()
    const run = upgrade(s, ['--plan'])
    expect(run.status, run.stderr).toBe(0)
    expect(run.installs).toEqual([])
    expect(run.stdout).toMatch(/would run: npm install kiss-ssg@/)
  })

  it("--json keeps stdout to the JSON, with npm's output on stderr", () => {
    const s = setUp()
    const run = upgrade(s, ['--json'])
    expect(run.status, run.stderr).toBe(0)
    const report = JSON.parse(run.stdout)
    expect(report.from).toBe('2.6.2')
    expect(report.to).toBe(own)
    expect(report.verified.ok).toBe(true)
    expect(report.notes.length).toBeGreaterThan(0)
  })

  it('--from narrows the notes without changing what installs', () => {
    const s = setUp({ spec: 'file:../tree', installed: '2.8.7', link: true })
    const run = upgrade(s, ['--plan', '--from', '2.8.5'])
    expect(run.stdout).toMatch(/kiss-ssg 2\.8\.5 →/)
    expect(run.stdout).not.toContain('## 2.6.4')
  })

  it('exits 1 when npm fails', () => {
    const s = setUp()
    const run = upgrade(s, [], { FAKE_NPM_FAIL: '1' })
    expect(run.status).toBe(1)
    expect(run.stderr).toMatch(/failed/)
  })
})

// The claim the command rests on, against the real npm and the real registry:
// after `file:` is edited to a range, a plain `npm install` keeps the link,
// and `npm install kiss-ssg@<version>` replaces it. Opt-in, so the gates stay
// offline; its red and green runs are recorded in the session's Pulse log.
describe.skipIf(!process.env.KISS_NETWORK_TESTS)(
  'npm itself (KISS_NETWORK_TESTS=1)',
  () => {
    const realNpm = (args, cwd) =>
      process.platform === 'win32'
        ? spawnSync(`npm ${args.join(' ')}`, {
            cwd,
            shell: true,
            encoding: 'utf8',
          })
        : spawnSync('npm', args, { cwd, encoding: 'utf8' })

    const linkedSite = () => {
      temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-npm-'))
      const tree = path.join(temp, 'tree')
      const site = path.join(temp, 'site')
      fs.mkdirSync(tree)
      fs.mkdirSync(site)
      fs.writeFileSync(
        path.join(tree, 'package.json'),
        JSON.stringify({ name: 'kiss-ssg', version: '2.8.7' }),
      )
      fs.writeFileSync(
        path.join(site, 'package.json'),
        JSON.stringify({
          name: 'site',
          private: true,
          devDependencies: { 'kiss-ssg': 'file:../tree' },
        }),
      )
      const linked = realNpm(['install', '--no-audit', '--no-fund'], site)
      expect(linked.status, linked.stderr).toBe(0)
      return site
    }
    const isLink = (site) =>
      fs.lstatSync(path.join(site, 'node_modules', 'kiss-ssg')).isSymbolicLink()

    it('a plain npm install after the spec changes keeps the link', () => {
      const site = linkedSite()
      const pkg = readJson(path.join(site, 'package.json'))
      pkg.devDependencies['kiss-ssg'] = '^2.8.0'
      fs.writeFileSync(path.join(site, 'package.json'), JSON.stringify(pkg))
      realNpm(['install', '--no-audit', '--no-fund'], site)
      expect(isLink(site)).toBe(true)
    }, 120_000)

    it('npm install kiss-ssg@<version>, as upgrade runs it, replaces the link', () => {
      const site = linkedSite()
      const run = realNpm(
        ['install', 'kiss-ssg@2.8.0', '--save-dev', '--no-audit', '--no-fund'],
        site,
      )
      expect(run.status, run.stderr).toBe(0)
      expect(isLink(site)).toBe(false)
      const entry = readJson(path.join(site, 'package-lock.json')).packages[
        'node_modules/kiss-ssg'
      ]
      expect(entry.link).toBeUndefined()
      expect(entry.resolved).toBe(
        'https://registry.npmjs.org/kiss-ssg/-/kiss-ssg-2.8.0.tgz',
      )
    }, 120_000)
  },
)
