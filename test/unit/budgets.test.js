import { describe, it, expect, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  KEYS,
  anyAnnotations,
  claudeMdBytes,
  compareBudgets,
  coreLines,
  failureBoilerplate,
  llmsTxtChars,
  measure,
  msPerPage,
  privateReach,
  runtimeDeps,
  testPrivateReach,
} from '../../scripts/budgets.mjs'

const script = fileURLToPath(
  new URL('../../scripts/budgets.mjs', import.meta.url),
)

// The patterns the budgets count are written here from parts, so this file
// does not add to the number `testPrivateReach` reads out of test/.
const KISS = 'ki' + 'ss'
const priv = (name, owner = KISS) => `${owner}._${name}`

describe('coreLines', () => {
  it('counts the lines of every file, a final newline not being a line', () => {
    expect(coreLines(['a\nb\n', 'c\n'])).toBe(3)
  })

  it('counts a last line that has no newline, and an empty file as none', () => {
    expect(coreLines(['a\nb', ''])).toBe(2)
  })
})

describe('privateReach', () => {
  it('counts distinct private members, not occurrences', () => {
    const files = [
      { name: 'lib/a.js', text: `${priv('stack')} ${priv('stack')}` },
      { name: 'lib/b.js', text: `${priv('stack')} ${priv('promises')}` },
    ]
    expect(privateReach(files)).toBe(2)
  })

  it('leaves out lib/kiss.js, which owns them', () => {
    const files = [
      { name: 'lib/kiss.js', text: priv('stack') },
      { name: 'lib/a.js', text: priv('other') },
    ]
    expect(privateReach(files)).toBe(1)
  })

  it('does not count a member with no name or a different owner', () => {
    expect(
      privateReach([
        { name: 'lib/a.js', text: `${KISS}._ ${priv('x', 'site')}` },
      ]),
    ).toBe(0)
  })
})

describe('anyAnnotations', () => {
  it('counts every occurrence of the any type annotation', () => {
    expect(
      anyAnnotations(['@type {any}\n@param {any} x {any}', '{string}']),
    ).toBe(3)
  })
})

describe('runtimeDeps', () => {
  it('counts the keys of dependencies only', () => {
    const pkg = JSON.stringify({
      dependencies: { a: '1', b: '2' },
      devDependencies: { c: '3' },
    })
    expect(runtimeDeps(pkg)).toBe(2)
  })

  it('is zero with no dependencies key', () => {
    expect(runtimeDeps('{}')).toBe(0)
  })
})

describe('testPrivateReach', () => {
  it('counts a private member after each of the five owners', () => {
    const text = ['kiss', 'site', 'k', 'instance', 'app']
      .map((o) => priv('x', o))
      .join(' ')
    expect(testPrivateReach([text])).toBe(5)
  })

  it('counts every occurrence, across files', () => {
    expect(testPrivateReach([`${priv('a')} ${priv('a')}`, priv('b')])).toBe(3)
  })

  it('does not count an owner that only ends in one of the five', () => {
    const text = ['mock', 'task', 'webapp', 'my_k']
      .map((o) => priv('x', o))
      .join(' ')
    expect(testPrivateReach([text])).toBe(0)
    expect(testPrivateReach([`(${priv('x')}) ${priv('y', 'k')}`])).toBe(2)
  })

  it('does not count another owner, a bare underscore or a digit', () => {
    expect(
      testPrivateReach([`other._x ${KISS}._ ${KISS}._1 ${KISS}.public`]),
    ).toBe(0)
  })
})

describe('claudeMdBytes and llmsTxtChars', () => {
  it('measure bytes and characters, which differ for a multibyte character', () => {
    expect(claudeMdBytes(Buffer.from('é'))).toBe(2)
    expect(llmsTxtChars('é')).toBe(1)
  })
})

describe('failureBoilerplate', () => {
  it('counts the files that contain the function, not the occurrences', () => {
    const fn = 'function reportBuildFailure'
    expect(
      failureBoilerplate([`${fn} ${fn}`, 'reportBuildFailure()', fn]),
    ).toBe(2)
  })
})

describe('msPerPage', () => {
  const bench = {
    scenarios: {
      'scan@500': { pages: 500, phases: { build: { median: 1165 } } },
      startup: { pages: null, phases: { process: { median: 400 } } },
    },
  }

  it('divides the named scenario and phase median by its page count', () => {
    expect(msPerPage(bench, 'scan@500', 'build')).toBe(2.3)
  })

  it('is null when the scenario, phase or page count is missing', () => {
    expect(msPerPage(bench, 'scan@50', 'build')).toBeNull()
    expect(msPerPage(bench, 'scan@500', 'total')).toBeNull()
    expect(msPerPage(bench, 'startup', 'process')).toBeNull()
    expect(msPerPage(null, 'scan@500', 'build')).toBeNull()
  })
})

describe('compareBudgets', () => {
  it('says better, same or worse, a lower number being better', () => {
    const rows = compareBudgets(
      { coreLines: 10, runtimeDeps: 5, anyAnnotations: 4 },
      { coreLines: 9, runtimeDeps: 5, anyAnnotations: 6 },
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r.verdict]))
    expect(by.coreLines).toBe('better')
    expect(by.runtimeDeps).toBe('same')
    expect(by.anyAnnotations).toBe('worse')
  })

  it('has one row per key, in order, and says absent when a side has none', () => {
    const rows = compareBudgets(
      { coreLines: 10 },
      { coreLines: 10, msPerPage: null },
    )
    expect(rows.map((r) => r.key)).toEqual(KEYS)
    expect(rows.find((r) => r.key === 'msPerPage').verdict).toBe('absent')
    expect(rows.find((r) => r.key === 'llmsTxtChars').verdict).toBe('absent')
  })
})

describe('measure and the command line, over a small repository', () => {
  let dir
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }))

  function repo() {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-budgets-'))
    const put = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
      fs.writeFileSync(path.join(dir, file), text)
    }
    put('lib/kiss.js', `${priv('stack')}\n`)
    put('lib/a.js', `${priv('stack')}\n/** @type {any} */\n`)
    put('package.json', JSON.stringify({ dependencies: { x: '1' } }))
    put('CLAUDE.md', 'abc')
    put('llms.txt', 'abcd')
    put('test/unit/t.test.js', `${priv('a')}\n`)
    put('examples/1/router.js', 'function reportBuildFailure() {}\n')
    put(
      'examples/1/node_modules/dep/index.js',
      'function reportBuildFailure() {}\n',
    )
    put('examples/1/public/x.js', 'function reportBuildFailure() {}\n')
    put('starter/router.js', 'function reportBuildFailure() {}\n')
    put('planning/note.md', 'function reportBuildFailure')
    return dir
  }

  it('reads each number from the files it names', () => {
    const got = measure(repo())
    expect(got).toEqual({
      coreLines: 3,
      privateReach: 1,
      anyAnnotations: 1,
      runtimeDeps: 1,
      testPrivateReach: 1,
      claudeMdBytes: 3,
      llmsTxtChars: 4,
      msPerPage: null,
      failureBoilerplate: 2,
    })
  })

  const run = (args) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, KISS_BUDGETS_ROOT: dir },
    })

  it('prints a table, writes the baseline on --record, then says same', () => {
    repo()
    const record = run(['--record'])
    expect(record.status).toBe(0)
    const file = path.join(dir, 'planning', 'budgets.json')
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).coreLines).toBe(3)

    const again = run([])
    expect(again.status).toBe(0)
    const rows = again.stdout.split('\n').filter((l) => /^coreLines/.test(l))
    expect(rows[0]).toMatch(/same/)
  })

  it('keeps the recorded msPerPage when --record runs without --bench', () => {
    repo()
    const bench = path.join(dir, 'bench.json')
    fs.writeFileSync(
      bench,
      JSON.stringify({
        scenarios: {
          'scan@4000': { pages: 4000, phases: { build: { median: 8000 } } },
        },
      }),
    )
    run(['--record', '--bench', bench])
    const file = path.join(dir, 'planning', 'budgets.json')
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).msPerPage).toBe(2)
    run(['--record'])
    const kept = JSON.parse(fs.readFileSync(file, 'utf8'))
    expect(kept.msPerPage).toBe(2)
    expect(kept.coreLines).toBe(3)
  })

  it('exits 1 on --check only when a number is worse', () => {
    repo()
    run(['--record'])
    expect(run(['--check']).status).toBe(0)
    fs.writeFileSync(path.join(dir, 'lib', 'a.js'), `${priv('stack')}\n\n\n\n`)
    const worse = run(['--check'])
    expect(worse.status).toBe(1)
    expect(worse.stdout).toMatch(/coreLines\s.*worse/)
    expect(run([]).status).toBe(0)
  })

  it("reads msPerPage from --bench: the roadmap's 4,000-page scan, build phase", () => {
    repo()
    const bench = path.join(dir, 'bench.json')
    fs.writeFileSync(
      bench,
      JSON.stringify({
        scenarios: {
          'scan@500': { pages: 500, phases: { build: { median: 9999 } } },
          'scan@4000': { pages: 4000, phases: { build: { median: 8000 } } },
        },
      }),
    )
    const out = run(['--bench', bench])
    expect(out.status).toBe(0)
    expect(out.stdout).toMatch(/msPerPage\s+-\s+2\s/)
  })
})
