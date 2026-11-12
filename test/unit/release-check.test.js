// `/kiss-publish` pushes the release tag only when this preflight passes, and
// the push is the release: it runs publish.yml, which stages the version on
// npm. So each check here is a release that must not start.
import { describe, it, expect } from 'vitest'
import {
  releaseChecks,
  changelogVersion,
  pickPublishRun,
  stagedId,
} from '../../scripts/release-check.mjs'

const HEAD = 'a'.repeat(40)
const ready = {
  version: '2.16.0',
  branch: 'main',
  head: HEAD,
  originHead: HEAD,
  dirty: [],
  ciRuns: [
    {
      status: 'completed',
      conclusion: 'success',
      createdAt: '2026-11-12T10:00:00Z',
    },
  ],
  changelog: '2.16.0',
  localTag: false,
  remoteTag: false,
  npmVersions: ['2.14.0', '2.15.0'],
}
const failing = (facts) =>
  releaseChecks(facts)
    .filter((c) => !c.ok)
    .map((c) => `${c.name}: ${c.detail}`)

describe('releaseChecks', () => {
  it('passes a merged, green, untagged, unpublished version', () => {
    expect(failing(ready)).toEqual([])
    expect(releaseChecks(ready).map((c) => c.name)).toEqual([
      'branch',
      'level with origin',
      'clean',
      'CI',
      'CHANGELOG',
      'tag',
      'npm',
    ])
  })

  it('refuses a feature branch and a detached HEAD', () => {
    expect(failing({ ...ready, branch: 'feat/x' })).toContain(
      'branch: on feat/x, not an integration branch (main, master or vN)',
    )
    expect(failing({ ...ready, branch: '' })).toContain(
      'branch: not on a branch (a detached HEAD)',
    )
  })

  it('refuses HEAD that is not origin’s, or a branch origin lacks', () => {
    expect(failing({ ...ready, originHead: 'b'.repeat(40) })).toEqual([
      'level with origin: HEAD is aaaaaaa, origin/main is bbbbbbb',
    ])
    expect(failing({ ...ready, originHead: null })).toEqual([
      'level with origin: origin has no main',
    ])
  })

  it('refuses uncommitted changes, naming them', () => {
    expect(failing({ ...ready, dirty: ['CHANGELOG.md', 'x.js'] })).toEqual([
      'clean: uncommitted: CHANGELOG.md, x.js',
    ])
  })

  // The newest run is the verdict: a rerun that passed after a red one
  // passes, and a red rerun after a green one does not.
  it('reads CI from the newest ci.yml run on the commit', () => {
    const run = (conclusion, createdAt, status = 'completed') => ({
      status,
      conclusion,
      createdAt,
    })
    expect(
      failing({
        ...ready,
        ciRuns: [
          run('failure', '2026-11-12T09:00:00Z'),
          run('success', '2026-11-12T10:00:00Z'),
        ],
      }),
    ).toEqual([])
    expect(
      failing({
        ...ready,
        ciRuns: [
          run('success', '2026-11-12T09:00:00Z'),
          run('failure', '2026-11-12T10:00:00Z'),
        ],
      }),
    ).toEqual(['CI: ci.yml on aaaaaaa: failure'])
    expect(
      failing({
        ...ready,
        ciRuns: [run('', '2026-11-12T10:00:00Z', 'in_progress')],
      }),
    ).toEqual(['CI: ci.yml on aaaaaaa is in_progress'])
    expect(failing({ ...ready, ciRuns: [] })).toEqual([
      'CI: no ci.yml run on aaaaaaa',
    ])
  })

  it('fails a fact it could not gather, with the reason', () => {
    expect(
      failing({
        ...ready,
        ciRuns: { error: 'gh: not logged in' },
        npmVersions: { error: 'fetch failed' },
      }),
    ).toEqual([
      'CI: could not ask GitHub: gh: not logged in',
      'npm: could not ask the registry: fetch failed',
    ])
  })

  it('refuses a version with no CHANGELOG entry on top', () => {
    expect(failing({ ...ready, changelog: '2.15.0' })).toEqual([
      'CHANGELOG: the first entry is 2.15.0, package.json says 2.16.0',
    ])
  })

  // 2.15.0 on 2026-11-12: tagged on origin and staged, so a second run of
  // the skill must stop at the tag rather than push again.
  it('refuses a tag that exists here or on origin', () => {
    expect(failing({ ...ready, remoteTag: true })).toEqual([
      'tag: v2.16.0 already exists on origin',
    ])
    expect(failing({ ...ready, localTag: true, remoteTag: true })).toEqual([
      'tag: v2.16.0 already exists here and on origin',
    ])
  })

  it('refuses a version already on npm', () => {
    expect(
      failing({ ...ready, npmVersions: [...ready.npmVersions, '2.16.0'] }),
    ).toEqual(['npm: kiss-ssg@2.16.0 is already on npm'])
  })

  it('reports every failure at once', () => {
    expect(
      failing({ ...ready, branch: 'feat/x', dirty: ['a'], remoteTag: true }),
    ).toHaveLength(3)
  })

  it('refuses something that is not a version', () => {
    expect(() => releaseChecks({ ...ready, version: 'latest' })).toThrow(
      /not a version/,
    )
  })
})

describe('changelogVersion', () => {
  it('is the first ## heading’s version', () => {
    expect(
      changelogVersion(
        '# Changelog\n\nintro\n\n## 2.15.0 — 2026-11-11\n\n## 2.14.0',
      ),
    ).toBe('2.15.0')
  })

  it('is null with no entry', () => {
    expect(changelogVersion('# Changelog\n')).toBeNull()
  })
})

describe('pickPublishRun', () => {
  const run = (headBranch, createdAt, event = 'push') => ({
    headBranch,
    createdAt,
    event,
  })

  // v2.15.0 had two runs: the failed one on 938cd7c and the re-tag's.
  it('is the newest push run for the tag', () => {
    const runs = [
      run('v2.15.0', '2026-11-11T21:50:18Z'),
      run('v2.15.0', '2026-11-12T07:18:27Z'),
      run('v2.14.0', '2026-11-12T08:00:00Z'),
    ]
    expect(pickPublishRun(runs, 'v2.15.0')).toBe(runs[1])
  })

  it('is null before GitHub lists one', () => {
    expect(
      pickPublishRun([run('v2.14.0', '2026-11-12T08:00:00Z')], 'v2.15.0'),
    ).toBeNull()
  })
})

describe('stagedId', () => {
  // The line npm printed in run 43174286036's stage job (2026-11-12).
  const log =
    'stage\tStage the version\t2026-11-12T07:21:30Z + kiss-ssg@2.15.0 (staged with id cf0e95ef-f8be-431a-abfb-fe96ef43624c)\n'

  it('is the id npm printed for this version', () => {
    expect(stagedId(log, '2.15.0')).toBe('cf0e95ef-f8be-431a-abfb-fe96ef43624c')
  })

  it('is null for another version or no staging line', () => {
    expect(stagedId(log, '2.15')).toBeNull()
    expect(stagedId('npm error 403', '2.15.0')).toBeNull()
  })
})
