import { describe, it, expect } from 'vitest'
import {
  releaseTag,
  planRelease,
  tagRelease,
} from '../../scripts/tag-release.mjs'

describe('releaseTag', () => {
  it('is the version under a v, prerelease included', () => {
    expect(releaseTag('2.2.1')).toBe('v2.2.1')
    expect(releaseTag('2.0.0-alpha.3')).toBe('v2.0.0-alpha.3')
  })

  it('refuses anything that is not a version', () => {
    expect(() => releaseTag('')).toThrow(/version/)
    expect(() => releaseTag('latest')).toThrow(/version/)
  })
})

describe('planRelease', () => {
  it('tags and pushes when the tag does not exist', () => {
    expect(planRelease({ version: '2.2.1', existingTags: ['v2.2.0'] })).toEqual(
      {
        tag: 'v2.2.1',
        skip: null,
        commands: [
          ['tag', '-a', 'v2.2.1', '-m', 'v2.2.1'],
          ['push', 'origin', 'v2.2.1'],
        ],
      },
    )
  })

  // A second publish of the same version cannot happen on npm, but a retried
  // postpublish after a failed push can: the tag is then already there and
  // must not be a failure.
  it('does nothing when the tag already exists', () => {
    expect(planRelease({ version: '2.2.1', existingTags: ['v2.2.1'] })).toEqual(
      { tag: 'v2.2.1', skip: 'v2.2.1 already exists', commands: [] },
    )
  })
})

describe('tagRelease', () => {
  // `run` is the whole of the I/O: it is handed git's arguments and returns
  // git's stdout, so the test sees exactly what would be run and nothing runs.
  const fakeGit = (tags) => {
    const calls = []
    const run = (args) => {
      calls.push(args)
      return args[0] === 'tag' && args[1] === '-l' ? tags.join('\n') : ''
    }
    return { run, calls }
  }

  it('lists the tag, then creates and pushes it', () => {
    const git = fakeGit(['v2.2.0'])
    const result = tagRelease({ version: '2.2.1', run: git.run })
    expect(result).toEqual({ tag: 'v2.2.1', skip: null })
    expect(git.calls).toEqual([
      ['tag', '-l', 'v2.2.1'],
      ['tag', '-a', 'v2.2.1', '-m', 'v2.2.1'],
      ['push', 'origin', 'v2.2.1'],
    ])
  })

  it('only lists when the tag is already there', () => {
    const git = fakeGit(['v2.2.1'])
    const result = tagRelease({ version: '2.2.1', run: git.run })
    expect(result.skip).toBe('v2.2.1 already exists')
    expect(git.calls).toEqual([['tag', '-l', 'v2.2.1']])
  })
})
