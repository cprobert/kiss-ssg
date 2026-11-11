import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  outOfScope,
  parseScope,
  scopeCheck,
} from '../../scripts/scope-check.mjs'

describe('parseScope', () => {
  it('splits one comma-separated line into trimmed patterns', () => {
    expect(parseScope(' lib/a.js, test/**,  CLAUDE.md ')).toEqual([
      'lib/a.js',
      'test/**',
      'CLAUDE.md',
    ])
  })

  it('is null when the key is absent or empty', () => {
    expect(parseScope(undefined)).toBeNull()
    expect(parseScope('')).toBeNull()
    expect(parseScope(' , ')).toBeNull()
  })
})

describe('outOfScope', () => {
  it('lets an exact path through and returns the rest', () => {
    expect(outOfScope(['lib/a.js', 'lib/b.js'], ['lib/a.js'])).toEqual({
      declared: true,
      files: ['lib/b.js'],
    })
  })

  it('matches dir/** at any depth under dir, and not a sibling', () => {
    const result = outOfScope(
      ['test/a.js', 'test/deep/b.js', 'tests/c.js', 'test'],
      ['test/**'],
    )
    expect(result.files).toEqual(['tests/c.js', 'test'])
  })

  it('reads * as one path segment and takes dots literally', () => {
    const result = outOfScope(
      ['lib/a.js', 'lib/x/a.js', 'lib/aXjs'],
      ['lib/*.js'],
    )
    expect(result.files).toEqual(['lib/x/a.js', 'lib/aXjs'])
  })

  it('says scope is undeclared, and reports nothing, with no patterns', () => {
    expect(outOfScope(['lib/a.js'], null)).toEqual({
      declared: false,
      files: [],
    })
  })

  it('keeps the session file always in scope', () => {
    const session = 'planning/sessions/2026-11-10-x.md'
    expect(outOfScope([session, 'lib/a.js'], ['docs/**'], session)).toEqual({
      declared: true,
      files: ['lib/a.js'],
    })
  })
})

describe('the command, over a branch that deletes a file outside its scope', () => {
  const script = fileURLToPath(
    new URL('../../scripts/scope-check.mjs', import.meta.url),
  )
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-scope-'))
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it('names the deleted file and exits 1', () => {
    const emptyConfig = path.join(root, 'empty.gitconfig')
    fs.writeFileSync(emptyConfig, '')
    const env = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
      ),
      GIT_CONFIG_GLOBAL: emptyConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      KISS_BASE_BRANCH: 'main',
    }
    const repo = path.join(root, 'repo')
    fs.mkdirSync(path.join(repo, 'planning/sessions'), { recursive: true })
    const git = (...args) =>
      execFileSync('git', args, { cwd: repo, env, stdio: 'ignore' })
    const put = (file, text) => {
      fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true })
      fs.writeFileSync(path.join(repo, file), text)
    }
    const commit = (message) =>
      git(
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.com',
        'commit',
        '-q',
        '-m',
        message,
      )
    git('init', '-q', '-b', 'main')
    put('keep.js', 'x\n')
    put('victim.js', 'x\n')
    git('add', '.')
    commit('base')
    git('checkout', '-q', '-b', 'feat')
    put(
      'planning/sessions/2026-11-11-x.md',
      '---\nbranch: feat\nscope: lib/**\n---\n',
    )
    put('lib/a.js', 'x\n')
    git('rm', '-q', 'victim.js')
    git('add', '.')
    commit('work')
    const result = spawnSync(process.execPath, [script], {
      cwd: repo,
      env,
      encoding: 'utf8',
    })
    expect(result.stdout.trim()).toBe('victim.js')
    expect(result.status).toBe(1)
  })
})

describe('scopeCheck', () => {
  const session = (scope) => ({
    file: 'x.md',
    show: 'planning/sessions/x.md',
    fields: scope === undefined ? {} : { scope },
  })

  it('exits 1 and names each file outside the scope', () => {
    const result = scopeCheck({
      sessions: [session('lib/a.js')],
      files: ['lib/a.js', 'lib/b.js'],
    })
    expect(result.code).toBe(1)
    expect(result.out).toBe('lib/b.js')
  })

  it('exits 0 when every changed file is in scope', () => {
    const result = scopeCheck({
      sessions: [session('lib/**')],
      files: ['lib/a.js'],
    })
    expect(result.code).toBe(0)
    expect(result.out).toBe('')
  })

  it('exits 0 and says so when the log declares no scope', () => {
    const result = scopeCheck({
      sessions: [session(undefined)],
      files: ['lib/a.js'],
    })
    expect(result.code).toBe(0)
    expect(result.err).toMatch(/no scope:/)
  })

  it('exits 2 when there is no log, or more than one', () => {
    expect(scopeCheck({ sessions: [], files: [] }).code).toBe(2)
    const two = scopeCheck({
      sessions: [session('a'), session('b')],
      files: [],
    })
    expect(two.code).toBe(2)
    expect(two.err).toMatch(/more than one/)
  })
})
