// scripts/red-first.mjs runs a new test against the base and says whether it
// failed there. The decisions are tested here: how the command line reads,
// the one Markdown line a pulse log keeps, which exit code each outcome gets
// and what vitest is asked to run. The worktree, link and vitest calls around
// them are thin and run only from the command line.
import { describe, it, expect } from 'vitest'
import {
  dependencyPlan,
  exitCodeFor,
  outcomeOf,
  parseArgs,
  recordLine,
  vitestArgs,
} from '../../scripts/red-first.mjs'

// The base runs on its own dependencies whenever they differ from this
// checkout's. Linking this checkout's node_modules into a base that still
// imports a package the branch removed made every test fail there on the
// import, not on the behaviour (2026-11-14, remarkable → markdown-it).
describe('dependencyPlan', () => {
  it('links this checkout’s node_modules when the lockfiles match', () => {
    expect(dependencyPlan('{"a":1}\n', '{"a":1}\n')).toBe('link')
  })

  it('installs the base’s own when they differ', () => {
    expect(dependencyPlan('{"a":1}\n', '{"a":2}\n')).toBe('install')
  })

  it('reads line endings as the same lockfile', () => {
    expect(dependencyPlan('{\r\n"a":1\r\n}\r\n', '{\n"a":1\n}\n')).toBe('link')
  })

  it('links when the base has no lockfile to install from', () => {
    expect(dependencyPlan(null, '{"a":1}\n')).toBe('link')
  })
})

describe('parseArgs', () => {
  it('reads a test file and an optional test name', () => {
    expect(parseArgs(['test/unit/x.test.js'])).toMatchObject({
      file: 'test/unit/x.test.js',
      name: null,
      error: null,
    })
    expect(
      parseArgs(['test/unit/x.test.js', '-t', 'keeps a slash']),
    ).toMatchObject({
      file: 'test/unit/x.test.js',
      name: 'keeps a slash',
      error: null,
    })
    expect(parseArgs(['-t=a b', 'x.test.js'])).toMatchObject({
      file: 'x.test.js',
      name: 'a b',
    })
  })

  it('refuses no file, two files, an unknown option and a missing value', () => {
    expect(parseArgs([]).error).toMatch(/test file/)
    expect(parseArgs(['a.test.js', 'b.test.js']).error).toMatch(/one test file/)
    expect(parseArgs(['--nope', 'a.test.js']).error).toMatch(/unknown option/)
    expect(parseArgs(['a.test.js', '-t']).error).toMatch(/needs a value/)
  })

  it('asks for help without needing a file', () => {
    expect(parseArgs(['--help'])).toMatchObject({ help: true, error: null })
  })
})

describe('recordLine', () => {
  it('writes one Markdown line when the test failed at the base', () => {
    expect(
      recordLine({
        file: 'test/unit/x.test.js',
        base: 'main',
        sha: 'abc1234',
        failed: true,
        date: '2026-11-10',
      }),
    ).toBe(
      '- red-first: test/unit/x.test.js failed at main (abc1234), 2026-11-10',
    )
  })

  it('says so when the test passed at the base', () => {
    expect(
      recordLine({
        file: 'test/unit/x.test.js',
        base: 'main',
        sha: 'abc1234',
        failed: false,
        date: '2026-11-10',
      }),
    ).toBe(
      '- red-first: test/unit/x.test.js PASSED at main (abc1234), 2026-11-10, so it proves nothing',
    )
  })

  it('names the test when only one was run', () => {
    expect(
      recordLine({
        file: 'test/unit/x.test.js',
        name: 'keeps a slash',
        base: 'origin/v2',
        sha: 'abc1234',
        failed: true,
        date: '2026-11-10',
      }),
    ).toBe(
      '- red-first: test/unit/x.test.js -t "keeps a slash" failed at origin/v2 (abc1234), 2026-11-10',
    )
  })
})

describe('outcomeOf and exitCodeFor', () => {
  it('reads vitest status 1 as a failing test, 0 as a passing one', () => {
    expect(outcomeOf({ status: 1, error: null }, '1 failed')).toBe('failed')
    expect(outcomeOf({ status: 0, error: null }, '1 passed')).toBe('passed')
  })

  it('reads anything else as a run that could not happen', () => {
    expect(outcomeOf({ status: null, error: new Error('spawn') }, '')).toBe(
      'could-not-run',
    )
    expect(outcomeOf({ status: 2, error: null }, '')).toBe('could-not-run')
  })

  it('reads a file with no test in it as not run, never as red', () => {
    // vitest exits 1 for "No test files found" and for a file that does not
    // exist at the base: neither is a test failing.
    expect(
      outcomeOf({ status: 1, error: null }, 'No test files found, exiting'),
    ).toBe('could-not-run')
    expect(
      outcomeOf({ status: 1, error: null }, 'No test found in suite x'),
    ).toBe('could-not-run')
  })

  it('exits 0 when it failed, 1 when it passed, 2 when it could not run', () => {
    expect(exitCodeFor('failed')).toBe(0)
    expect(exitCodeFor('passed')).toBe(1)
    expect(exitCodeFor('could-not-run')).toBe(2)
  })
})

describe('vitestArgs', () => {
  it('runs the one file, once', () => {
    expect(vitestArgs('test/unit/x.test.js', null)).toEqual([
      'vitest',
      'run',
      'test/unit/x.test.js',
    ])
  })

  it('adds the test name filter', () => {
    expect(vitestArgs('test/unit/x.test.js', 'a b')).toEqual([
      'vitest',
      'run',
      'test/unit/x.test.js',
      '-t',
      'a b',
    ])
  })
})
