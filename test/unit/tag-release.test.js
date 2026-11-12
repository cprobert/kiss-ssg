import { describe, it, expect } from 'vitest'
import {
  releaseTag,
  planRelease,
  tagRelease,
  checkReleaseTag,
  distTag,
} from '../../scripts/tag-release.mjs'

// The publish workflow runs this before it stages anything: a tag that is not
// `v` plus package.json's version must stop the run.
describe('distTag', () => {
  it('stages a release under latest', () => {
    expect(distTag('2.15.0')).toBe('latest')
  })

  // npm refuses to publish a prerelease without an explicit --tag, so the
  // workflow always passes one, and a prerelease must never become latest.
  it('stages a prerelease under next', () => {
    expect(distTag('2.16.0-alpha.0')).toBe('next')
  })

  it('refuses something that is not a version', () => {
    expect(() => distTag('banana')).toThrow(/not a version/)
  })
})

describe('checkReleaseTag', () => {
  it('passes when the pushed tag is v plus the version', () => {
    expect(checkReleaseTag({ ref: 'v2.2.1', version: '2.2.1' })).toBe('v2.2.1')
  })

  it('refuses a tag for a different version', () => {
    expect(() => checkReleaseTag({ ref: 'v2.2.0', version: '2.2.1' })).toThrow(
      /v2\.2\.0.*v2\.2\.1/,
    )
  })

  it('refuses a missing ref and a ref with no v', () => {
    expect(() => checkReleaseTag({ ref: undefined, version: '2.2.1' })).toThrow(
      /tag/,
    )
    expect(() => checkReleaseTag({ ref: '2.2.1', version: '2.2.1' })).toThrow(
      /2\.2\.1/,
    )
  })

  it('refuses a version that is not one', () => {
    expect(() => checkReleaseTag({ ref: 'vx', version: 'x' })).toThrow(
      /version/,
    )
  })
})

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
  const HEAD = 'a'.repeat(40)
  const OTHER = 'b'.repeat(40)

  it('tags and pushes when the tag does not exist', () => {
    expect(
      planRelease({
        version: '2.2.1',
        head: HEAD,
        localTag: null,
        remoteTag: false,
      }),
    ).toEqual({
      tag: 'v2.2.1',
      skip: null,
      commands: [
        ['tag', '-a', 'v2.2.1', '-m', 'v2.2.1'],
        ['push', 'origin', 'v2.2.1'],
      ],
    })
  })

  // The push is what starts publish.yml. A tag made here whose push failed
  // (no network, or auto mode refused it) was called "already exists" and
  // never pushed, so the retry finished nothing.
  it('pushes a tag that is here on HEAD but not on origin', () => {
    expect(
      planRelease({
        version: '2.2.1',
        head: HEAD,
        localTag: HEAD,
        remoteTag: false,
      }),
    ).toEqual({
      tag: 'v2.2.1',
      skip: null,
      commands: [['push', 'origin', 'v2.2.1']],
    })
  })

  it('does nothing when the tag is here on HEAD and on origin', () => {
    expect(
      planRelease({
        version: '2.2.1',
        head: HEAD,
        localTag: HEAD,
        remoteTag: true,
      }),
    ).toEqual({
      tag: 'v2.2.1',
      skip: 'v2.2.1 already exists here and on origin',
      commands: [],
    })
  })

  it('refuses a local tag on another commit', () => {
    expect(() =>
      planRelease({
        version: '2.2.1',
        head: HEAD,
        localTag: OTHER,
        remoteTag: false,
      }),
    ).toThrow(/v2\.2\.1 already points at bbbbbbb here, not HEAD \(aaaaaaa\)/)
  })

  it('refuses a tag on origin that is not here', () => {
    expect(() =>
      planRelease({
        version: '2.2.1',
        head: HEAD,
        localTag: null,
        remoteTag: true,
      }),
    ).toThrow(/on origin but not here/)
  })
})

describe('tagRelease', () => {
  // `run` is the whole of the I/O: it is handed git's arguments and returns
  // git's stdout, so the test sees exactly what would be run and nothing runs.
  const HEAD = 'a'.repeat(40)
  const fakeGit = ({ local = null, remote = false } = {}) => {
    const calls = []
    const run = (args) => {
      calls.push(args)
      const [cmd, arg] = args
      if (cmd === 'rev-parse' && arg === 'HEAD') return `${HEAD}\n`
      if (cmd === 'tag' && arg === '-l') return local ? `${args[2]}\n` : ''
      if (cmd === 'rev-parse') return `${local}\n`
      if (cmd === 'ls-remote')
        return remote ? `${HEAD}\trefs/tags/${args[3]}\n` : ''
      return ''
    }
    return { run, calls }
  }

  it('asks git, then creates and pushes the tag', () => {
    const git = fakeGit()
    const result = tagRelease({ version: '2.2.1', run: git.run })
    expect(result).toEqual({ tag: 'v2.2.1', skip: null })
    expect(git.calls).toEqual([
      ['rev-parse', 'HEAD'],
      ['tag', '-l', 'v2.2.1'],
      ['ls-remote', '--tags', 'origin', 'refs/tags/v2.2.1'],
      ['tag', '-a', 'v2.2.1', '-m', 'v2.2.1'],
      ['push', 'origin', 'v2.2.1'],
    ])
  })

  it('pushes, and does not re-create, a tag whose push failed before', () => {
    const git = fakeGit({ local: HEAD })
    tagRelease({ version: '2.2.1', run: git.run })
    expect(git.calls.slice(-1)).toEqual([['push', 'origin', 'v2.2.1']])
    expect(git.calls).toContainEqual(['rev-parse', 'v2.2.1^{commit}'])
    expect(git.calls).not.toContainEqual([
      'tag',
      '-a',
      'v2.2.1',
      '-m',
      'v2.2.1',
    ])
  })

  it('only asks when the tag is here and on origin', () => {
    const git = fakeGit({ local: HEAD, remote: true })
    const result = tagRelease({ version: '2.2.1', run: git.run })
    expect(result.skip).toBe('v2.2.1 already exists here and on origin')
    expect(git.calls.map((c) => c[0])).toEqual([
      'rev-parse',
      'tag',
      'rev-parse',
      'ls-remote',
    ])
  })
})
