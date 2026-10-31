// The branch skills find a branch's session file through this script; see its
// header for the three ways the inline copies of the lookup went wrong.
import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { branchOf, matchingFiles } from '../../scripts/session-file.mjs'

describe('branchOf', () => {
  it.each([
    ['---\nbranch: fix/v2.8\n---\n', 'fix/v2.8'],
    ['---\r\nbranch: fix/v2.8\r\n---\r\n', 'fix/v2.8'],
    ['---\nbranch:   feat/x  \n---\n', 'feat/x'],
    ['---\nbranch: a\n---\nbranch: b\n', 'a'],
    ['---\ntitle: none\n---\n', null],
    // A `branch:` line in the body is a quotation, not this file's branch.
    ['---\ntitle: none\n---\nbranch: feat/x\n', null],
    ['no frontmatter\nbranch: feat/x\n', null],
    // Round 8: what a Windows editor or a YAML habit writes still matches.
    ['\uFEFF---\nbranch: feat/x\n---\n', 'feat/x'],
    ['---  \nbranch: feat/x\n---\t\n', 'feat/x'],
    ['---\nbranch: "feat/x"\n---\n', 'feat/x'],
    ["---\nbranch: 'feat/x'\n---\n", 'feat/x'],
    ['---\nbranch: feat/x # the IA work\n---\n', 'feat/x'],
    // YAML starts a comment only after a space: `#` is part of a name.
    ['---\nbranch: feat/x#2\n---\n', 'feat/x#2'],
  ])('%j has the branch %j', (text, branch) => {
    expect(branchOf(text)).toBe(branch)
  })
})

describe('matchingFiles', () => {
  const files = {
    'a.md': '---\nbranch: fix/v2.8\n---\n',
    'b.md': '---\nbranch: fix/v2x8\n---\n',
    'c.md': '---\nbranch: fix/v2.8-more\n---\nbranch: fix/v2.8\n',
  }
  it('matches the name as text, never as a pattern or a prefix', () => {
    expect(
      matchingFiles(Object.keys(files), (f) => files[f], 'fix/v2.8'),
    ).toEqual(['a.md'])
  })
})

describe('the command line', () => {
  const script = fileURLToPath(
    new URL('../../scripts/session-file.mjs', import.meta.url),
  )
  // As in base-branch.test.js: no global or system git config, no GIT_*.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-session-'))
  const emptyConfig = path.join(root, 'empty.gitconfig')
  fs.writeFileSync(emptyConfig, '')
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    ),
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: '1',
  }
  const repo = path.join(root, 'repo')
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, env, stdio: 'ignore' })
  fs.mkdirSync(path.join(repo, 'planning/sessions'), { recursive: true })
  git('init', '-q', '-b', 'main')
  fs.writeFileSync(
    path.join(repo, 'planning/sessions/a.md'),
    '---\r\nbranch: fix/v2.8\r\nworktree: /tmp/wt\r\n---\r\n',
  )
  fs.writeFileSync(
    path.join(repo, 'planning/sessions/b.md'),
    '---\nbranch: fix/v2x8\n---\n',
  )
  git('add', '.')
  git(
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@example.com',
    'commit',
    '-q',
    '-m',
    's',
  )
  git('branch', 'fix/v2.8')
  fs.mkdirSync(path.join(repo, 'docs'))

  const run = (cwd, ...args) =>
    spawnSync('node', [script, ...args], { cwd, env, encoding: 'utf8' })

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it("finds the current branch's file in this checkout", () => {
    git('checkout', '-q', 'fix/v2.8')
    expect(run(repo).stdout).toBe('planning/sessions/a.md\n')
    git('checkout', '-q', 'main')
  })

  it("reads a named branch's own commits, from anywhere in the repository", () => {
    fs.rmSync(path.join(repo, 'planning'), { recursive: true })
    const result = run(path.join(repo, 'docs'), 'fix/v2.8', '--from-branch')
    expect(result.stdout).toBe('refs/heads/fix/v2.8:planning/sessions/a.md\n')
    git('checkout', '-q', '--', 'planning')
  })

  it('prints nothing for a branch with no session file', () => {
    git('branch', 'other', 'main')
    const result = run(repo, 'other', '--from-branch')
    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
  })

  // 2026-10-31, round 5: a branch opened on another machine, or one already
  // deleted locally, is only on origin; the script crashed with a stack trace.
  it("reads a branch that is only on origin from origin's copy", () => {
    const remote = path.join(root, 'remote.git')
    execFileSync('git', ['init', '-q', '--bare', remote], {
      env,
      stdio: 'ignore',
    })
    git('remote', 'add', 'origin', remote)
    git('push', '-q', 'origin', 'fix/v2.8:refs/heads/elsewhere')
    git('fetch', '-q', 'origin')
    git('branch', '-D', 'fix/v2.8')
    const result = run(repo, 'fix/v2.8', '--from-branch')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('no branch fix/v2.8 here or on origin')
    git(
      'push',
      '-q',
      'origin',
      'refs/remotes/origin/elsewhere:refs/heads/fix/v2.8',
    )
    git('fetch', '-q', 'origin')
    expect(run(repo, 'fix/v2.8', '--from-branch').stdout).toBe(
      'refs/remotes/origin/fix/v2.8:planning/sessions/a.md\n',
    )
  })

  it('says so, rather than printing nothing, on a detached HEAD', () => {
    git('checkout', '-q', '--detach', 'main')
    const result = run(repo)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not on a branch')
    git('checkout', '-q', 'main')
  })

  it('reads a session folder the same way in both modes, subfolders included', () => {
    fs.mkdirSync(path.join(repo, 'planning/sessions/archive'))
    fs.writeFileSync(
      path.join(repo, 'planning/sessions/archive/old.md'),
      '---\nbranch: main\n---\n',
    )
    git('add', '.')
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.com',
      'commit',
      '-q',
      '-m',
      'archive',
    )
    expect(run(repo).stdout).toBe('planning/sessions/archive/old.md\n')
    expect(run(repo, 'main', '--from-branch').stdout).toBe(
      'refs/heads/main:planning/sessions/archive/old.md\n',
    )
  })
})
