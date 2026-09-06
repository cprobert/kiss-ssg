import { describe, it, expect, vi } from 'vitest'
import {
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
