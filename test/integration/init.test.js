import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'

// The real bin in a real empty folder, then the real check over what it wrote:
// the only proof that the starter `init` drops actually builds.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')

const dirs = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

function emptySite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-init-'))
  dirs.push(dir)
  // The engine as a consuming site resolves it; a junction needs no admin on Windows.
  fs.mkdirSync(path.join(dir, 'node_modules'))
  fs.symlinkSync(
    repoRoot,
    path.join(dir, 'node_modules', 'kiss-ssg'),
    'junction',
  )
  return dir
}

const run = (cwd, ...args) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })

function snapshot(dir) {
  const out = {}
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), {
      withFileTypes: true,
    })) {
      const p = path.posix.join(rel, e.name)
      if (e.name === 'node_modules' || e.name === 'public') continue
      if (e.isDirectory()) walk(p)
      else
        out[p] = crypto
          .createHash('sha1')
          .update(fs.readFileSync(path.join(dir, p)))
          .digest('hex')
    }
  }
  walk('')
  return out
}

describe('kiss-ssg init', () => {
  it('turns an empty folder into a site that passes check', () => {
    const dir = emptySite()
    const init = run(dir, 'init', '--no-install')
    expect(init.status, init.stderr).toBe(0)
    expect(init.stdout).toMatch(/create\s+router\.js/)
    expect(init.stdout).toContain('Next:')
    for (const f of [
      'package.json',
      'router.js',
      '.gitignore',
      'CLAUDE.md',
      'AGENTS.md',
      '.claude/settings.json',
      '.codex/config.toml',
      'src/pages/index.hbs',
    ])
      expect(fs.existsSync(path.join(dir, f)), f).toBe(true)
    const check = run(dir, 'check', '--summary', 'router.js')
    expect(check.status, check.stderr).toBe(0)
  })

  it('changes nothing when run a second time', () => {
    const dir = emptySite()
    run(dir, 'init', '--no-install')
    const before = snapshot(dir)
    const again = run(dir, 'init', '--no-install')
    expect(again.status).toBe(0)
    expect(again.stdout).not.toMatch(/^\s+(create|merge|append)\b/m)
    expect(snapshot(dir)).toEqual(before)
  })

  // The promise that matters most is about the files that were there first:
  // every byte of them survives, and what init adds comes after it.
  it('keeps every byte of the files a folder already had', () => {
    const dir = emptySite()
    const before = {
      '.gitignore': '.env\r\nsecrets/\r\n',
      'CLAUDE.md': '# Our rules\n\nNever deploy on Friday.\n',
      'AGENTS.md': '## House style\n',
    }
    for (const [f, text] of Object.entries(before))
      fs.writeFileSync(path.join(dir, f), text)
    const init = run(dir, 'init', '--no-install')
    expect(init.status, init.stderr).toBe(0)
    for (const [f, text] of Object.entries(before))
      expect(
        fs.readFileSync(path.join(dir, f), 'utf8').startsWith(text),
        f,
      ).toBe(true)
    expect(fs.readFileSync(path.join(dir, '.gitignore'), 'utf8')).toContain(
      'node_modules/',
    )
    expect(init.stdout).toMatch(/append\s+\.gitignore/)
  })

  // Codex beside Claude Code: the wrapper prints both agents' plugin lines,
  // each followed by its own "Run …" line, and AGENTS.md carries Codex's.
  const CODEX_LINES = [
    'codex plugin marketplace add cprobert/kiss-ssg',
    'codex plugin add kiss-ssg@kiss-ssg',
    'codex plugin add kiss-memory@kiss-ssg',
  ]

  it('prints the Codex plugin lines after the Claude ones, and writes them into AGENTS.md', () => {
    const dir = emptySite()
    const init = run(dir, 'init', '--no-install')
    expect(init.status, init.stderr).toBe(0)
    const out = init.stdout
    const order = [
      'claude plugin install kiss-memory@kiss-ssg --scope project',
      'Run `claude` in this folder.',
      ...CODEX_LINES,
      'Run `codex` in this folder.',
    ].map((line) => {
      const at = out.indexOf(line)
      expect(at, line).toBeGreaterThan(-1)
      return at
    })
    expect(order).toEqual([...order].sort((a, b) => a - b))
    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')
    for (const line of CODEX_LINES) expect(agents).toContain(line)
  })

  // Every site init'd before the Codex section existed has an AGENTS.md that
  // points at llms.txt and says nothing else; re-running init must add it.
  it('adds the Codex section to an AGENTS.md an earlier init wrote, once', () => {
    const dir = emptySite()
    const old =
      '## kiss-ssg\n\nThis is a kiss-ssg static site. Before changing the build script, read `node_modules/kiss-ssg/llms.txt`.\n'
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), old)
    const init = run(dir, 'init', '--no-install')
    expect(init.status, init.stderr).toBe(0)
    expect(init.stdout).toMatch(/append\s+AGENTS\.md/)
    const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')
    expect(agents.startsWith(old)).toBe(true)
    for (const line of CODEX_LINES) expect(agents).toContain(line)
    const before = snapshot(dir)
    const again = run(dir, 'init', '--no-install')
    expect(again.stdout).toMatch(/skip\s+AGENTS\.md/)
    expect(snapshot(dir)).toEqual(before)
  })

  it('appends the missing tables to a .codex/config.toml already there, once', () => {
    const dir = emptySite()
    const own = 'model = "o4"\r\n'
    fs.mkdirSync(path.join(dir, '.codex'))
    fs.writeFileSync(path.join(dir, '.codex/config.toml'), own)
    const init = run(dir, 'init', '--no-install')
    expect(init.status, init.stderr).toBe(0)
    expect(init.stdout).toMatch(/append\s+\.codex\/config\.toml/)
    const toml = fs.readFileSync(path.join(dir, '.codex/config.toml'), 'utf8')
    expect(toml.startsWith(own)).toBe(true)
    expect(toml).toContain('[plugins."kiss-memory@kiss-ssg"]')
    const before = snapshot(dir)
    const again = run(dir, 'init', '--no-install')
    expect(again.stdout).toMatch(/skip\s+\.codex\/config\.toml/)
    expect(snapshot(dir)).toEqual(before)
  })

  // npm init -y's "commonjs" beside a router.js of the site's own: init reads
  // the router with Node's parser, and only a real ES module changes the type.
  const commonjsSite = (router) => {
    const dir = emptySite()
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'x', type: 'commonjs' }),
    )
    fs.writeFileSync(path.join(dir, 'router.js'), router)
    return dir
  }
  const typeOf = (dir) =>
    JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).type

  it('switches "commonjs" to "module" for a router.js written as an ES module, which then runs', () => {
    const dir = commonjsSite(
      "import Kiss from 'kiss-ssg'\nconsole.log(typeof Kiss)\n",
    )
    expect(run(dir, 'init', '--no-install').status).toBe(0)
    expect(typeOf(dir)).toBe('module')
    const router = spawnSync(process.execPath, ['router.js'], {
      cwd: dir,
      encoding: 'utf8',
    })
    expect(router.status, router.stderr).toBe(0)
    expect(router.stdout.trim()).toBe('function')
  })

  // Codex, 2026-10-26: the first detector read CommonJS's first parse error,
  // which for this file is the import's, and changed the folder's type for a
  // router that cannot run either way.
  it('keeps "commonjs" for a router.js that does not parse as a module either', () => {
    const dir = commonjsSite("import Kiss from 'kiss-ssg'\nconst = ;\n")
    expect(run(dir, 'init', '--no-install').status).toBe(0)
    expect(typeOf(dir)).toBe('commonjs')
  })

  // Codex adversarial review, 2026-10-26, reproduced through the bin: a
  // working CommonJS project that builds with server.js keeps its type, and
  // server.js still runs, whatever router.js beside it is written in.
  it.each([
    [
      'whose main and build run another file',
      { main: 'server.js', scripts: { build: 'node server.js' } },
    ],
    // Round two: a start script was enough to get past a main/build check.
    [
      'whose start script runs another file',
      { scripts: { start: 'node server.js' } },
    ],
    // Round three: with no start script at all, `npm start` runs server.js.
    ['whose server.js npm start runs by default', {}],
  ])(
    'keeps "commonjs" for a project %s, which still runs after two inits',
    (_, fields) => {
      const dir = emptySite()
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'x', type: 'commonjs', ...fields }),
      )
      fs.writeFileSync(
        path.join(dir, 'server.js'),
        "module.exports = 1\nconsole.log('server ran')\n",
      )
      fs.writeFileSync(
        path.join(dir, 'router.js'),
        "import Kiss from 'kiss-ssg'\n",
      )
      const init = run(dir, 'init', '--no-install')
      expect(init.status, init.stderr).toBe(0)
      expect(typeOf(dir)).toBe('commonjs')
      expect(init.stdout).toMatch(/router\.mjs/)
      const again = run(dir, 'init', '--no-install')
      expect(again.status, again.stderr).toBe(0)
      expect(typeOf(dir)).toBe('commonjs')
      const server = spawnSync(process.execPath, ['server.js'], {
        cwd: dir,
        encoding: 'utf8',
      })
      expect(server.status, server.stderr).toBe(0)
    },
  )

  // Round four: what Node resolves the package to, and what npm exposes as an
  // executable, beyond the literal fields — each a working CommonJS file that
  // must still load after two inits beside an ES-module router.js.
  const CJS = "module.exports = 1\nconsole.log('ran')\n"
  it.each([
    [
      'whose index.js Node loads by default',
      {},
      'index.js',
      ['-e', "require('./')"],
    ],
    [
      'whose main "lib" resolves to lib/index.js',
      { main: 'lib' },
      'lib/index.js',
      ['-e', "require('./')"],
    ],
    [
      'with a directories.bin executable',
      { directories: { bin: 'cli' } },
      'cli/tool.js',
      ['cli/tool.js'],
    ],
  ])(
    'keeps "commonjs" for a package %s, which still runs after two inits',
    (_, fields, file, args) => {
      const dir = emptySite()
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'x', type: 'commonjs', ...fields }),
      )
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      fs.writeFileSync(path.join(dir, file), CJS)
      fs.writeFileSync(
        path.join(dir, 'router.js'),
        "import Kiss from 'kiss-ssg'\n",
      )
      for (let i = 0; i < 2; i++) {
        const init = run(dir, 'init', '--no-install')
        expect(init.status, init.stderr).toBe(0)
      }
      expect(typeOf(dir)).toBe('commonjs')
      const res = spawnSync(process.execPath, args, {
        cwd: dir,
        encoding: 'utf8',
      })
      expect(res.status, res.stderr).toBe(0)
    },
  )

  // The starter path, round three: no router.js yet, so init writes the
  // starter, but npm start already runs this folder's CommonJS server.js. A
  // package-wide "module" added beside it would break it.
  it('adds no "type" when it writes the starter beside a server.js, which still runs', () => {
    const dir = emptySite()
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'x' }),
    )
    fs.writeFileSync(
      path.join(dir, 'server.js'),
      "module.exports = 1\nconsole.log('server ran')\n",
    )
    const init = run(dir, 'init', '--no-install')
    expect(init.status, init.stderr).toBe(0)
    expect(init.stdout).toMatch(/create\s+router\.js/)
    expect(typeOf(dir)).toBeUndefined()
    const server = spawnSync(process.execPath, ['server.js'], {
      cwd: dir,
      encoding: 'utf8',
    })
    expect(server.status, server.stderr).toBe(0)
  })

  // An engine folder that holds no package is not an installed engine.
  it('does not take an empty node_modules/kiss-ssg for an installed engine', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-init-'))
    dirs.push(dir)
    fs.mkdirSync(path.join(dir, 'node_modules', 'kiss-ssg'), {
      recursive: true,
    })
    const init = run(dir, 'init', '--no-install')
    expect(init.stdout).toMatch(/skip\s+node_modules\/kiss-ssg — --no-install/)
  })

  it('rejects an argument with the help', () => {
    const res = run(emptySite(), 'init', 'router.js')
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('kiss-ssg init [--no-install]')
  })
})
