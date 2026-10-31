import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  filesToCheck,
  formatFailureMessage,
} from '../../scripts/check-staged-format.mjs'

describe('filesToCheck', () => {
  const infos = {
    'lib/kiss.js': { ignored: false, inferredParser: 'babel' },
    'docs/index.html': { ignored: true, inferredParser: 'html' },
    'src/pages/index.hbs': { ignored: true, inferredParser: 'glimmer' },
    LICENSE: { ignored: false, inferredParser: null },
  }
  const infoOf = (f) => infos[f]

  it('keeps files prettier can parse and has not been told to skip', () => {
    expect(filesToCheck(Object.keys(infos), infoOf)).toEqual(['lib/kiss.js'])
  })

  it('drops a file with no info rather than throwing on it', () => {
    expect(filesToCheck(['deleted.js'], () => undefined)).toEqual([])
  })

  it('returns nothing for an empty stage', () => {
    expect(filesToCheck([], infoOf)).toEqual([])
  })
})

describe('formatFailureMessage', () => {
  it('names every failing file and quotes them into a runnable fix', () => {
    const msg = formatFailureMessage(['lib/kiss.js', 'test/a b.js'])
    expect(msg).toContain('  lib/kiss.js')
    expect(msg).toContain('npx prettier --write "lib/kiss.js" "test/a b.js"')
    expect(msg).toContain('re-stage')
  })
})

// Round 21: the staged list was read without -z, git quoted a non-ASCII
// name, the quoted name had no parser, and an unformatted café.js passed.
describe('the hook, on a staged file whose name has an accent', () => {
  const script = fileURLToPath(
    new URL('../../scripts/check-staged-format.mjs', import.meta.url),
  )
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-hook-'))
  const emptyConfig = path.join(root, 'empty.gitconfig')
  fs.writeFileSync(emptyConfig, '')
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    ),
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: '1',
  }
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it('checks it, and fails it when it is not formatted', () => {
    const repo = path.join(root, 'repo')
    fs.mkdirSync(repo)
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo, env })
    fs.writeFileSync(path.join(repo, 'café.js'), 'x =   1\n')
    execFileSync('git', ['add', '--', 'café.js'], { cwd: repo, env })
    const result = spawnSync('node', [script], {
      cwd: repo,
      env,
      encoding: 'utf8',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('café.js')
  })
})
