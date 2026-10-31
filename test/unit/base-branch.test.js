import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  branchName,
  isIntegrationBranch,
  pickBaseBranch,
  resolveOverride,
} from '../../scripts/base-branch.mjs'

describe('isIntegrationBranch', () => {
  it.each(['main', 'master', 'v2', 'v10'])('accepts %s', (name) => {
    expect(isIntegrationBranch(name)).toBe(true)
  })

  it.each(['feat/sitemap', 'v2-wip', 'mainline', 'release/v2'])(
    'rejects %s',
    (name) => {
      expect(isIntegrationBranch(name)).toBe(false)
    },
  )
})

describe('pickBaseBranch', () => {
  const distances = (map) => (name) => (name in map ? map[name] : null)

  it('picks the branch HEAD diverged from most recently', () => {
    expect(
      pickBaseBranch('feat/x', ['main', 'v2'], distances({ main: 40, v2: 3 })),
    ).toBe('v2')
  })

  it('breaks ties toward the earlier candidate', () => {
    expect(
      pickBaseBranch('feat/x', ['main', 'v2'], distances({ main: 3, v2: 3 })),
    ).toBe('main')
  })

  it('returns the current branch when it is itself an integration line', () => {
    expect(
      pickBaseBranch('v2', ['main', 'v2'], distances({ main: 40, v2: 0 })),
    ).toBe('v2')
  })

  it('stays on main rather than reaching back to an older major line', () => {
    expect(
      pickBaseBranch('main', ['main', 'v1'], distances({ main: 0, v1: 39 })),
    ).toBe('main')
  })

  it('skips candidates with no shared history', () => {
    expect(pickBaseBranch('feat/x', ['main', 'v2'], distances({ v2: 7 }))).toBe(
      'v2',
    )
  })

  it('returns null when nothing is resolvable', () => {
    expect(pickBaseBranch('feat/x', ['main'], () => null)).toBeNull()
  })
})

describe('resolveOverride', () => {
  it('returns nothing when no override is set', () => {
    expect(resolveOverride('', null, () => 'main')).toBeNull()
  })

  it('uses a git-config override that resolves, naming its source', () => {
    expect(
      resolveOverride('', 'main', (name) => (name === 'main' ? 'main' : null)),
    ).toEqual({
      ref: 'main',
      notice: 'main (override: git config kiss.baseBranch)',
    })
  })

  it('prefers the environment variable and names it', () => {
    expect(resolveOverride('v2', 'main', () => 'origin/v2').notice).toBe(
      'origin/v2 (override: KISS_BASE_BRANCH)',
    )
  })

  it('falls through with a warning when the override names no ref', () => {
    const result = resolveOverride('', 'v2', () => null)
    expect(result.ref).toBeNull()
    expect(result.notice).toContain('v2')
    expect(result.notice).toContain('falling back')
  })
})

// The ref is `origin/<name>` when the base has no local branch (a fresh or
// cloud clone, or an override that resolves that way). That is right for a
// diff and wrong for `git checkout`, `git pull` or `origin/$BASE`, which want
// the branch's own name (2026-10-31, /code-review). The name is read from
// what the ref is, never from its spelling: an override may name another
// remote's branch, or a tag or a commit, which is no branch at all.
describe('branchName', () => {
  const refs = new Set([
    'refs/heads/main',
    'refs/remotes/origin/v2',
    'refs/remotes/upstream/v3',
    'refs/remotes/origin/feat/x',
  ])
  const exists = (ref) => refs.has(ref)

  it.each([
    ['main', 'main'],
    ['origin/v2', 'v2'],
    ['origin/feat/x', 'feat/x'],
    ['refs/heads/main', 'main'],
    ['refs/remotes/origin/v2', 'v2'],
  ])('%s is the branch %s', (ref, name) => {
    expect(branchName(ref, exists)).toBe(name)
  })

  // Every branch skill pairs the name with `origin/`, so a branch on another
  // remote would be compared with origin's branch of the same name
  // (2026-10-31, round 5): no name is safer than that one.
  it.each([
    'v1.0',
    '4a8054f',
    'HEAD',
    'upstream/v3',
    'refs/remotes/upstream/v3',
  ])('%s has no name the branch skills can use', (ref) => {
    expect(branchName(ref, exists)).toBeNull()
  })
})

describe('the command line', () => {
  const script = fileURLToPath(
    new URL('../../scripts/base-branch.mjs', import.meta.url),
  )

  // Each test's git runs with none of the developer's own git: no global or
  // system config (a commit.gpgsign or a hook there would fail the commit),
  // and no GIT_* variable inherited from a hook or an editor, which could
  // point these commands at the real repository.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-base-'))
  const emptyConfig = path.join(root, 'empty.gitconfig')
  fs.writeFileSync(emptyConfig, '')
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    ),
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: '1',
  }
  const git = (cwd, ...args) =>
    execFileSync('git', args, { cwd, env, stdio: 'ignore' })

  // A clone whose base, v2, exists only as origin/v2, with a second remote,
  // upstream, that has v3.
  const remote = path.join(root, 'remote.git')
  const seed = path.join(root, 'seed')
  const clone = path.join(root, 'clone')
  git(root, 'init', '-q', '--bare', remote)
  git(root, 'init', '-q', seed)
  git(
    seed,
    '-c',
    'user.name=t',
    '-c',
    'user.email=t@example.com',
    'commit',
    '-q',
    '--allow-empty',
    '-m',
    'base',
  )
  git(seed, 'push', '-q', remote, 'HEAD:refs/heads/v2', 'HEAD:refs/heads/v3')
  git(root, 'clone', '-q', '--no-checkout', remote, clone)
  git(clone, 'remote', 'add', 'upstream', remote)
  git(clone, 'fetch', '-q', 'upstream')
  git(clone, 'checkout', '-q', '-b', 'feat/x', 'origin/v2')
  git(clone, 'tag', 'v1.0')

  const run = (base, ...args) =>
    spawnSync('node', [script, ...args], {
      cwd: clone,
      encoding: 'utf8',
      env: { ...env, KISS_BASE_BRANCH: base },
    })

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it('prints the bare ref on stdout and the override provenance on stderr', () => {
    const result = run('HEAD')
    expect(result.stdout.trim()).toBe('HEAD')
    expect(result.stderr).toContain('HEAD (override: KISS_BASE_BRANCH)')
  })

  it('prints the ref by default, and the branch name with --name', () => {
    expect(run('v2').stdout.trim()).toBe('origin/v2')
    expect(run('v2', '--name').stdout.trim()).toBe('v2')
  })

  it("refuses --name for another remote's branch, which the skills would read as origin's", () => {
    const result = run('upstream/v3', '--name')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not a branch here or on origin')
  })

  it('refuses --name for a base that is no branch, and says why', () => {
    const result = run('v1.0', '--name')
    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('v1.0 is not a branch')
  })

  // `git fetch` never moves a local branch, so a local base is often behind
  // its origin, most of all once branches are opened in worktrees. Diffed
  // against the stale local base, a branch cut from origin/<base> would carry
  // everyone else's newer commits in its diff (2026-10-31, round 4). The ref
  // is the one the branch started from: of the local base and its origin,
  // the one with the fewest commits between it and HEAD.
  it('prints the ref the branch started from, not a stale local base', () => {
    const commit = (cwd, message) =>
      git(
        cwd,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.com',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        message,
      )
    git(clone, 'branch', 'v3', 'origin/v3')
    commit(seed, 'newer on v3')
    git(seed, 'push', '-q', remote, 'HEAD:refs/heads/v3')
    git(clone, 'fetch', '-q', 'origin')
    git(clone, 'checkout', '-q', '-b', 'feat/y', 'origin/v3')
    commit(clone, 'work')
    expect(run('v3').stdout.trim()).toBe('origin/v3')
  })

  it('prints the local base when the branch started from its unpushed commits', () => {
    const commit = (cwd, message) =>
      git(
        cwd,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.com',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        message,
      )
    git(clone, 'checkout', '-q', '-B', 'v3', 'origin/v3')
    commit(clone, 'local only')
    git(clone, 'checkout', '-q', '-b', 'feat/z', 'v3')
    commit(clone, 'work')
    expect(run('v3').stdout.trim()).toBe('v3')
  })

  // A short name resolves a tag before a branch, and this repository has tags
  // `v1` and `v2` named like its integration branches (2026-10-31, round 5).
  it('reads the branch, not a tag that shares its name', () => {
    git(clone, 'tag', 'v3', 'origin/v2')
    const printed = run('v3').stdout.trim()
    expect(printed).toBe('refs/heads/v3')
    expect(run('v3', '--name').stdout.trim()).toBe('v3')
    git(clone, 'tag', '-d', 'v3')
  })

  // The same tag, without an override: the algorithm's candidates were read
  // as short names, which git spells `heads/v2` when a tag shares the name,
  // so a local-only integration branch was never a candidate (round 6).
  it('finds a local integration branch that a tag shares its name with', () => {
    const repo = path.join(root, 'tagged')
    fs.mkdirSync(repo)
    const commit = (message) =>
      git(
        repo,
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@example.com',
        'commit',
        '-q',
        '--allow-empty',
        '-m',
        message,
      )
    git(repo, 'init', '-q', '-b', 'main')
    commit('base')
    git(repo, 'tag', 'v2')
    git(repo, 'checkout', '-q', '-b', 'v2')
    commit('on v2')
    git(repo, 'checkout', '-q', '-b', 'feat')
    commit('work')
    const result = spawnSync('node', [script], {
      cwd: repo,
      encoding: 'utf8',
      env,
    })
    expect(result.stdout.trim()).toBe('refs/heads/v2')
  })
})
