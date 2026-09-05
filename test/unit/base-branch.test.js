import { describe, it, expect } from 'vitest'
import {
  isIntegrationBranch,
  pickBaseBranch,
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

  it('never returns the branch it is called on', () => {
    expect(
      pickBaseBranch('v2', ['main', 'v2'], distances({ main: 40, v2: 0 })),
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
