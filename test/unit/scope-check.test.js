import { describe, it, expect } from 'vitest'
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
