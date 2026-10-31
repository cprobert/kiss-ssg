import { describe, it, expect, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  branchName,
  isIntegrationBranch,
  pickBaseBranch,
  resolveBaseBranch,
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

describe('resolveBaseBranch', () => {
  it('returns the bare ref and reports the override provenance out of band', () => {
    vi.stubEnv('KISS_BASE_BRANCH', 'HEAD')
    const warn = vi.fn()
    expect(resolveBaseBranch(process.cwd(), warn)).toBe('HEAD')
    expect(warn).toHaveBeenCalledWith('HEAD (override: KISS_BASE_BRANCH)')
    vi.unstubAllEnvs()
  })
})

// The ref is `origin/<name>` when the base has no local branch (a fresh or
// cloud clone, or an override that resolves that way). That is right for a
// diff and wrong for `git checkout`, `git pull` or `origin/$BASE`, which want
// the branch's own name (2026-10-31, /code-review).
describe('branchName', () => {
  it.each([
    ['origin/main', 'main'],
    ['origin/v2', 'v2'],
    ['main', 'main'],
    ['v2', 'v2'],
  ])('%s is the branch %s', (ref, name) => {
    expect(branchName(ref)).toBe(name)
  })
})

describe('the command line', () => {
  const script = fileURLToPath(
    new URL('../../scripts/base-branch.mjs', import.meta.url),
  )

  // A clone whose base, v2, exists only as origin/v2: no local branch.
  function cloneWithRemoteOnlyBase() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-base-'))
    const git = (cwd, ...args) =>
      execFileSync('git', args, { cwd, stdio: 'ignore' })
    const remote = path.join(root, 'remote.git')
    const seed = path.join(root, 'seed')
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
    git(seed, 'push', '-q', remote, 'HEAD:refs/heads/v2')
    const clone = path.join(root, 'clone')
    git(root, 'clone', '-q', '--no-checkout', remote, clone)
    git(clone, 'checkout', '-q', '-b', 'feat/x', 'origin/v2')
    return { root, clone }
  }

  const run = (cwd, ...args) =>
    execFileSync('node', [script, ...args], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, KISS_BASE_BRANCH: 'v2' },
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

  it('prints the ref by default, and the branch name with --name', () => {
    const { root, clone } = cloneWithRemoteOnlyBase()
    try {
      expect(run(clone)).toBe('origin/v2')
      expect(run(clone, '--name')).toBe('v2')
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })
})
