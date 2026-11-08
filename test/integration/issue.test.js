// `kiss-ssg issue`, end to end through the bin. The decisions are unit-tested
// in test/unit/issue.test.js; this holds the wrapper: arguments reach
// lib/issue.js, the draft is written, the command is printed, the exit codes
// come through, and gh is never asked to create anything.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
)
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')

let temp
let site
let shims
beforeEach(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-issue-bin-'))
  site = path.join(temp, 'site')
  shims = path.join(temp, 'shims')
  fs.mkdirSync(site)
  fs.mkdirSync(shims)
  fs.writeFileSync(
    path.join(site, 'package.json'),
    JSON.stringify({ name: 'bin-site' }),
  )
})
afterEach(() => fs.rmSync(temp, { recursive: true, force: true }))

const pathKey =
  Object.keys(process.env).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH'

/** @param {string[]} args @param {string} [extraPath] */
const run = (args, extraPath = '') =>
  spawnSync(process.execPath, [bin, 'issue', ...args], {
    cwd: site,
    encoding: 'utf8',
    env: {
      ...process.env,
      [pathKey]: extraPath
        ? `${extraPath}${path.delimiter}${process.env[pathKey]}`
        : // No gh at all: only node's own folder.
          path.dirname(process.execPath),
    },
  })

describe('kiss-ssg issue', () => {
  it('drafts with no gh, says it could not search, and prints the command', () => {
    const result = run([
      'bug',
      '--title',
      'Purge drops classes',
      '--out',
      'draft.md',
    ])
    expect(result.status).toBe(0)
    expect(fs.readFileSync(path.join(site, 'draft.md'), 'utf8')).toMatch(
      /### Site\n\nbin-site/,
    )
    expect(result.stdout).toMatch(/Could not search for duplicates/)
    expect(result.stdout).toMatch(
      /^! gh issue create --repo cprobert\/kiss-ssg --title /m,
    )
  })

  it('refuses a token with exit 1 and writes nothing', () => {
    fs.writeFileSync(
      path.join(site, 'notes.md'),
      `GH_TOKEN=ghp_${'q8'.repeat(15)}`,
    )
    const result = run([
      'bug',
      '--title',
      'x',
      '--notes',
      'notes.md',
      '--out',
      'draft.md',
    ])
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/refused/)
    expect(fs.existsSync(path.join(site, 'draft.md'))).toBe(false)
  })

  it('exits 2 on usage, 0 on --help', () => {
    expect(run(['bug']).status).toBe(2)
    expect(run(['--help']).status).toBe(0)
  })

  // A fake gh first on PATH records every call. POSIX only: Node spawns gh
  // with no shell, and on Windows only a real gh.exe answers that way.
  it.skipIf(process.platform === 'win32')(
    'searches through gh, and never asks it to create anything',
    () => {
      const log = path.join(temp, 'gh-calls.txt')
      fs.writeFileSync(
        path.join(shims, 'gh'),
        `#!/bin/sh\necho "$*" >> "${log}"\necho '[{"number":78,"title":"Purge drops classes","state":"OPEN","url":"u"}]'\n`,
        { mode: 0o755 },
      )
      const result = run(
        ['bug', '--title', 'Purge drops classes', '--out', 'd.md'],
        shims,
      )
      expect(result.status).toBe(0)
      expect(result.stdout).toMatch(/#78 open: Purge drops classes/)
      const calls = fs.readFileSync(log, 'utf8').trim().split('\n')
      expect(calls.some((c) => c.startsWith('issue list'))).toBe(true)
      expect(calls.some((c) => c.startsWith('issue create'))).toBe(false)
    },
  )
})
