import { describe, it, expect } from 'vitest'
import {
  changelogEntries,
  chooseLockfile,
  compareVersions,
  formatUpgrade,
  gitStateFrom,
  ownEngine,
  parseUpgradeArgs,
  parseVersion,
  planUpgrade,
  registryFrom,
  specAllows,
  specFloor,
  upgradeNotes,
  verifyUpgrade,
} from '../../lib/upgrade.js'

// The /code-review of 2026-11-01 (finding 7): the bin made these decisions
// with no unit test, and two of the review's defects lived there. They are
// pure functions now; the bin only gathers what they read.
describe('the facts the bin gathers', () => {
  it('chooseLockfile: npm-shrinkwrap.json wins, then package-lock.json, then pnpm, then yarn', () => {
    const has =
      (...names) =>
      (name) =>
        names.includes(name)
    expect(
      chooseLockfile(has('package-lock.json', 'npm-shrinkwrap.json')),
    ).toBe('npm-shrinkwrap.json')
    expect(chooseLockfile(has('yarn.lock', 'package-lock.json'))).toBe(
      'package-lock.json',
    )
    expect(chooseLockfile(has('yarn.lock', 'pnpm-lock.yaml'))).toBe(
      'pnpm-lock.yaml',
    )
    expect(chooseLockfile(has())).toBeNull()
  })

  // Finding 1: describeEngine walks up, so a parent folder's copy read as
  // the site's own. The site's engine is its own node_modules/kiss-ssg only.
  it("ownEngine keeps the site's own node_modules/kiss-ssg and nothing above it", () => {
    const own = {
      version: '2.6.2',
      dir: 'node_modules/kiss-ssg',
      linked: false,
      target: null,
    }
    expect(ownEngine(own)).toBe(own)
    expect(
      ownEngine({
        ...own,
        dir: '../node_modules/kiss-ssg',
        version: '2.9.0-alpha.1',
      }),
    ).toBeNull()
    expect(ownEngine(null)).toBeNull()
  })

  // Finding 2: with no git installed there is no commit to protect, as in a
  // folder that is not a repository.
  it('gitStateFrom: not a repository, or no git at all, carries on; any other failure blocks', () => {
    expect(gitStateFrom({ error: null, dirty: [] })).toEqual({ state: 'clean' })
    expect(gitStateFrom({ error: null, dirty: ['package-lock.json'] })).toEqual(
      { state: 'dirty', files: ['package-lock.json'] },
    )
    expect(
      gitStateFrom({
        error:
          'fatal: not a git repository (or any of the parent directories): .git',
        dirty: [],
      }),
    ).toEqual({ state: 'not-a-repo' })
    expect(gitStateFrom({ error: 'spawnSync git ENOENT', dirty: [] })).toEqual({
      state: 'not-a-repo',
    })
    expect(
      gitStateFrom({
        error: 'fatal: detected dubious ownership in repository',
        dirty: [],
      }),
    ).toEqual({
      state: 'error',
      said: 'fatal: detected dubious ownership in repository',
    })
  })

  it("registryFrom: an answer, or npm's own error code, never a default", () => {
    expect(
      registryFrom({
        status: 0,
        stdout: 'https://registry.npmjs.org/\n',
        stderr: '',
      }),
    ).toEqual({ registry: 'https://registry.npmjs.org/', registryError: null })
    expect(
      registryFrom({
        status: 1,
        stdout: '',
        stderr:
          'npm error code ENOWORKSPACES\nnpm error This command does not support workspaces.\n',
      }),
    ).toEqual({ registry: null, registryError: 'npm error code ENOWORKSPACES' })
    expect(registryFrom({ status: null, stdout: '', stderr: '' })).toEqual({
      registry: null,
      registryError: 'exit null',
    })
  })
})

describe('parseVersion', () => {
  it('reads a release and a prerelease', () => {
    expect(parseVersion('2.8.7')).toEqual({
      major: 2,
      minor: 8,
      patch: 7,
      pre: [],
    })
    expect(parseVersion('2.0.0-alpha.3')).toEqual({
      major: 2,
      minor: 0,
      patch: 0,
      pre: ['alpha', '3'],
    })
  })

  it('returns null for anything that is not a version', () => {
    for (const text of ['unknown', '^2.6.2', 'v2.8.0', '2.8', '', null])
      expect(parseVersion(text)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders by major, minor, patch', () => {
    expect(compareVersions('2.8.7', '2.9.0')).toBeLessThan(0)
    expect(compareVersions('2.10.0', '2.9.0')).toBeGreaterThan(0)
    expect(compareVersions('2.8.0', '2.8.0')).toBe(0)
  })

  it('puts a prerelease before its release, and orders prereleases by semver', () => {
    const sorted = [
      '2.0.0',
      '2.0.0-beta.0',
      '2.0.0-alpha.10',
      '2.0.0-alpha.2',
      '2.0.0-beta',
      '1.4.4',
    ].sort(compareVersions)
    expect(sorted).toEqual([
      '1.4.4',
      '2.0.0-alpha.2',
      '2.0.0-alpha.10',
      '2.0.0-beta',
      '2.0.0-beta.0',
      '2.0.0',
    ])
  })

  it('refuses a string that is not a version rather than guessing', () => {
    expect(() => compareVersions('unknown', '2.8.0')).toThrow(/not a version/)
  })
})

const CHANGELOG = [
  '# Changelog',
  '',
  'Newest first.',
  '',
  '## 2.9.0 — 2026-11-02',
  '',
  'A feature.',
  '',
  '### Upgrading',
  '',
  'Run the command.',
  '',
  '#### A detail inside the note',
  '',
  'Still the note.',
  '',
  '### Something else',
  '',
  'Not the note.',
  '',
  '## 2.8.7 — 2026-11-01',
  '',
  'Skills only.',
  '',
  '### Nothing for a site to change',
  '',
  '## 2.8.6 — 2026-11-01',
  '',
  '### Upgrading: the sitemap',
  '',
  'Dates.',
  '',
  '```md',
  '## 9.9.9 — not a heading, it is in a fence',
  '### Upgrading: also not a heading',
  '```',
  '',
  '### Upgrading: robots.txt',
  '',
  'Agents.',
  '',
  '## 2.8.5 — 2026-10-31',
  '',
  'A fix.',
  '',
  '## 2.0.0-alpha.1 — 2026-09-05',
  '',
  'The start.',
].join('\n')

describe('changelogEntries', () => {
  const entries = changelogEntries(CHANGELOG)

  it('reads every version heading, newest first as written, and no heading in a fence', () => {
    expect(entries.map((e) => e.version)).toEqual([
      '2.9.0',
      '2.8.7',
      '2.8.6',
      '2.8.5',
      '2.0.0-alpha.1',
    ])
    expect(entries[0].date).toBe('2026-11-02')
  })

  it('takes a note to the next ### or ##, keeping #### inside it', () => {
    expect(entries[0].notes).toEqual([
      {
        heading: 'Upgrading',
        text: 'Run the command.\n\n#### A detail inside the note\n\nStill the note.',
      },
    ])
  })

  it('reads more than one note, with its topic, and keeps a fence inside a note whole', () => {
    expect(entries[2].notes.map((n) => n.heading)).toEqual([
      'Upgrading: the sitemap',
      'Upgrading: robots.txt',
    ])
    expect(entries[2].notes[0].text).toContain(
      '### Upgrading: also not a heading',
    )
  })

  it('says when an entry declares nothing for a site to change', () => {
    expect(entries[1].nothingToChange).toBe(true)
    expect(entries[1].notes).toEqual([])
    expect(entries[3].nothingToChange).toBe(false)
  })

  // /code-review finding 10: a non-version `##` heading kept the previous
  // version open, so its notes were filed under that version.
  it('ends an entry at a `##` heading that is not a version', () => {
    const text = [
      '## 2.0.0 — 2026-09-09',
      '',
      '### Upgrading',
      '',
      'The real note.',
      '',
      '## Older releases',
      '',
      '### Upgrading',
      '',
      "Not 2.0.0's.",
    ].join('\n')
    const [entry] = changelogEntries(text)
    expect(entry.notes).toEqual([
      { heading: 'Upgrading', text: 'The real note.' },
    ])
  })

  it('tolerates CRLF line endings', () => {
    const crlf = changelogEntries(CHANGELOG.replace(/\n/g, '\r\n'))
    expect(crlf.map((e) => e.version)).toEqual(entries.map((e) => e.version))
    expect(crlf[0].notes[0].text).toBe(entries[0].notes[0].text)
  })
})

describe('upgradeNotes', () => {
  it('returns the notes after `from` up to and including `to`, oldest first', () => {
    const result = upgradeNotes(CHANGELOG, '2.8.5', '2.9.0')
    expect(result.notes.map((n) => [n.version, n.heading])).toEqual([
      ['2.8.6', 'Upgrading: the sitemap'],
      ['2.8.6', 'Upgrading: robots.txt'],
      ['2.9.0', 'Upgrading'],
    ])
    // 2.8.7 is in range and has no note.
    expect(result.quiet).toEqual(['2.8.7'])
  })

  it('leaves out the version it starts from', () => {
    const result = upgradeNotes(CHANGELOG, '2.8.6', '2.9.0')
    expect(result.notes.map((n) => n.version)).toEqual(['2.9.0'])
  })

  it('is empty when from and to are the same', () => {
    expect(upgradeNotes(CHANGELOG, '2.9.0', '2.9.0')).toEqual({
      notes: [],
      quiet: [],
    })
  })

  it('takes every note up to `to` when the starting version is unknown', () => {
    const result = upgradeNotes(CHANGELOG, null, '2.8.6')
    expect(result.notes.map((n) => n.version)).toEqual(['2.8.6', '2.8.6'])
    expect(result.quiet).toEqual(['2.0.0-alpha.1', '2.8.5'])
  })

  it('works from a version the changelog never mentions', () => {
    const result = upgradeNotes(CHANGELOG, '2.8.5-alpha.0', '2.8.6')
    expect(result.quiet).toEqual(['2.8.5'])
    expect(result.notes).toHaveLength(2)
  })
})

describe('specAllows', () => {
  it('reads a caret, a tilde, an exact pin and a floor the way npm does', () => {
    expect(specAllows('^2.6.2', '2.9.0')).toBe(true)
    expect(specAllows('^2.6.2', '3.0.0')).toBe(false)
    expect(specAllows('~2.9.0', '2.9.4')).toBe(true)
    expect(specAllows('~2.8.0', '2.9.0')).toBe(false)
    expect(specAllows('2.9.0', '2.9.0')).toBe(true)
    expect(specAllows('2.6.2', '2.9.0')).toBe(false)
    expect(specAllows('>=2.5.0', '2.9.0')).toBe(true)
    expect(specAllows('^2.9.0', '2.8.7')).toBe(false)
  })

  it('allows nothing it cannot read as a registry range', () => {
    for (const spec of ['file:../tree', 'latest', '2.x', null])
      expect(specAllows(spec, '2.9.0')).toBe(false)
  })
})

// /code-review finding 3: npm's semver keeps prereleases out of a range that
// names none, and `^0.0.x` pins the patch.
describe('specAllows, the prerelease and 0.x rules', () => {
  it('allows a prerelease only from a range that names one on the same version', () => {
    expect(specAllows('^2.6.2', '2.9.0-alpha.1')).toBe(false)
    expect(specAllows('~2.9.0', '2.9.0-alpha.1')).toBe(false)
    expect(specAllows('>=2.5.0', '2.9.0-alpha.1')).toBe(false)
    expect(specAllows('2.9.0-alpha.1', '2.9.0-alpha.1')).toBe(true)
    expect(specAllows('^2.9.0-alpha.0', '2.9.0-alpha.1')).toBe(true)
    expect(specAllows('^2.9.0-alpha.0', '2.9.1-alpha.0')).toBe(false)
    expect(specAllows('^2.9.0-alpha.0', '2.9.0')).toBe(true)
  })

  it('reads ^0.0.x as that patch only, and ^0.x as that minor', () => {
    expect(specAllows('^0.0.3', '0.0.3')).toBe(true)
    expect(specAllows('^0.0.3', '0.0.4')).toBe(false)
    expect(specAllows('^0.2.0', '0.2.5')).toBe(true)
    expect(specAllows('^0.2.0', '0.3.0')).toBe(false)
  })
})

describe('specFloor', () => {
  it('reads the lowest version a plain range allows', () => {
    expect(specFloor('^2.6.2')).toBe('2.6.2')
    expect(specFloor('~2.7.0')).toBe('2.7.0')
    expect(specFloor('2.8.0')).toBe('2.8.0')
    expect(specFloor('>=2.5.0')).toBe('2.5.0')
  })

  it('reads nothing from a link, a URL, a tag or a compound range', () => {
    for (const spec of [
      'file:../kiss-ssg',
      'https://github.com/cprobert/kiss-ssg/archive/refs/heads/main.tar.gz',
      'latest',
      '>=2.5.0 <3',
      '2.x',
      undefined,
    ])
      expect(specFloor(spec)).toBeNull()
  })
})

describe('parseUpgradeArgs', () => {
  it('reads --plan, --json and --from', () => {
    expect(parseUpgradeArgs(['--plan', '--json', '--from', '2.6.2'])).toEqual({
      plan: true,
      json: true,
      from: '2.6.2',
      help: false,
      error: null,
    })
  })

  it('refuses an unknown option, a --from that is not a version, and a stray word', () => {
    expect(parseUpgradeArgs(['--force']).error).toMatch(/unknown option/)
    expect(parseUpgradeArgs(['--from']).error).toMatch(/--from needs/)
    expect(parseUpgradeArgs(['--from', '^2.6.2']).error).toMatch(/--from needs/)
    expect(parseUpgradeArgs(['router.js']).error).toMatch(/takes no/)
  })

  it('reads --help', () => {
    expect(parseUpgradeArgs(['--help']).help).toBe(true)
  })
})

// A site on 2.6.2 from the registry, in a clean git repository.
const REGISTRY = 'https://registry.npmjs.org/'
const facts = (over = {}) => ({
  own: { version: '2.9.0', changelog: CHANGELOG },
  args: { plan: false, json: false, from: null, help: false, error: null },
  pkg: { found: true, section: 'devDependencies', spec: '^2.6.2' },
  engine: {
    version: '2.6.2',
    dir: 'node_modules/kiss-ssg',
    linked: false,
    target: null,
  },
  lock: {
    path: 'package-lock.json',
    entry: {
      version: '2.6.2',
      resolved: `${REGISTRY}kiss-ssg/-/kiss-ssg-2.6.2.tgz`,
    },
  },
  committedLockVersion: '2.6.2',
  otherLockfile: null,
  git: { state: 'clean' },
  registry: REGISTRY,
  ...over,
})
const LINKED = {
  version: '2.8.7',
  dir: 'node_modules/kiss-ssg',
  linked: true,
  target: 'C:/Code/kiss-ssg',
}

describe('planUpgrade', () => {
  it('installs its own exact version into the section package.json uses', () => {
    const plan = planUpgrade(facts())
    expect(plan.refuse).toBeNull()
    expect(plan.from).toBe('2.6.2')
    expect(plan.to).toBe('2.9.0')
    expect(plan.install).toEqual({
      args: ['install', 'kiss-ssg@2.9.0', '--save-dev'],
    })
  })

  it('keeps a dependency in dependencies, and pins a prerelease exactly', () => {
    const plan = planUpgrade(
      facts({
        own: { version: '2.9.0-alpha.1', changelog: CHANGELOG },
        pkg: { found: true, section: 'dependencies', spec: '^2.6.2' },
      }),
    )
    expect(plan.install).toEqual({
      args: [
        'install',
        'kiss-ssg@2.9.0-alpha.1',
        '--save-prod',
        '--save-exact',
      ],
    })
  })

  it('prints the notes between the two versions', () => {
    const plan = planUpgrade(
      facts({ engine: { ...facts().engine, version: '2.8.5' } }),
    )
    expect(plan.notes.map((n) => n.version)).toEqual([
      '2.8.6',
      '2.8.6',
      '2.9.0',
    ])
    expect(plan.quiet).toEqual(['2.8.7'])
  })

  // The critique's blocker (2026-11-01): npm's latest is behind the working
  // tree, so a site linked to the tree reads as ahead of what it is upgrading
  // to. A linked tree's version is not a release.
  it('never refuses a working-tree link on its version, and says it cannot tell where it started', () => {
    const plan = planUpgrade(
      facts({
        engine: LINKED,
        pkg: {
          found: true,
          section: 'devDependencies',
          spec: 'file:../kiss-ssg',
        },
        lock: {
          path: 'package-lock.json',
          entry: { resolved: '../kiss-ssg', link: true },
        },
        committedLockVersion: null,
      }),
    )
    expect(plan.refuse).toBeNull()
    expect(plan.from).toBeNull()
    expect(plan.install).not.toBeNull()
    expect(plan.warnings.join('\n')).toMatch(/replaces .*file:\.\.\/kiss-ssg/)
    expect(plan.warnings.join('\n')).toMatch(/--from/)
  })

  // The 2026-11-01 clean room: the agent's first guess was the version the
  // linked tree reports, which the command had read and not said.
  it("names the linked tree's version as the --from to consider", () => {
    const plan = planUpgrade(
      facts({
        engine: LINKED,
        pkg: {
          found: true,
          section: 'devDependencies',
          spec: 'file:../kiss-ssg',
        },
        lock: null,
        committedLockVersion: null,
      }),
    )
    expect(plan.from).toBeNull()
    expect(plan.warnings.join('\n')).toMatch(
      /the tree it links to says 2\.8\.7.*--from 2\.8\.7/i,
    )
  })

  it('takes the declared floor when nothing is installed', () => {
    const plan = planUpgrade(facts({ engine: null, lock: null }))
    expect(plan.from).toBe('2.6.2')
  })

  it('takes --from over everything it could read', () => {
    const plan = planUpgrade(
      facts({ args: { ...facts().args, from: '2.5.0' } }),
    )
    expect(plan.from).toBe('2.5.0')
  })

  // A site whose build broke after `npm update`: the working tree is already
  // on the new version, and the committed lockfile still says where it was.
  it('takes the committed lockfile when the installed copy is already the new version', () => {
    const plan = planUpgrade(
      facts({
        engine: { ...facts().engine, version: '2.9.0' },
        lock: {
          path: 'package-lock.json',
          entry: {
            version: '2.9.0',
            resolved: `${REGISTRY}kiss-ssg/-/kiss-ssg-2.9.0.tgz`,
          },
        },
        committedLockVersion: '2.8.5',
      }),
    )
    expect(plan.from).toBe('2.8.5')
    expect(plan.install).toBeNull()
    expect(plan.notes.map((n) => n.version)).toContain('2.8.6')
  })

  it('installs nothing when the site is already on this version from the registry', () => {
    const plan = planUpgrade(
      facts({
        engine: { ...facts().engine, version: '2.9.0' },
        lock: {
          path: 'package-lock.json',
          entry: {
            version: '2.9.0',
            resolved: `${REGISTRY}kiss-ssg/-/kiss-ssg-2.9.0.tgz`,
          },
        },
        committedLockVersion: '2.9.0',
      }),
    )
    expect(plan.install).toBeNull()
    expect(plan.refuse).toBeNull()
  })

  it('reports an installed copy and a lockfile that disagree', () => {
    const plan = planUpgrade(
      facts({ engine: { ...facts().engine, version: '2.5.0' } }),
    )
    expect(plan.from).toBe('2.5.0')
    expect(plan.warnings.join('\n')).toMatch(/2\.5\.0.*2\.6\.2/)
  })

  it('points a v1 site at the migration guide instead of every v2 note', () => {
    const plan = planUpgrade(
      facts({ engine: { ...facts().engine, version: '1.4.4' }, lock: null }),
    )
    expect(plan.notes).toEqual([])
    expect(plan.warnings.join('\n')).toMatch(/Migrating from v1/)
  })

  it.each([
    [
      'no package.json',
      { pkg: { found: false, section: null, spec: null } },
      /kiss-ssg init/,
    ],
    [
      'a real downgrade',
      { engine: { ...facts().engine, version: '3.0.0' } },
      /newer than/,
    ],
    [
      'uncommitted changes',
      { git: { state: 'dirty', files: ['package-lock.json'] } },
      /uncommitted.*package-lock\.json/,
    ],
    [
      'a git that failed',
      { git: { state: 'error', said: 'fatal: detected dubious ownership' } },
      /dubious ownership/,
    ],
    [
      'a pnpm lockfile',
      { lock: null, otherLockfile: 'pnpm-lock.yaml' },
      /pnpm-lock\.yaml/,
    ],
  ])('refuses %s', (_, over, message) => {
    const plan = planUpgrade(facts(over))
    expect(plan.refuse).toMatch(message)
    expect(plan.install).toBeNull()
  })

  it('carries on outside a git repository', () => {
    expect(
      planUpgrade(facts({ git: { state: 'not-a-repo' } })).refuse,
    ).toBeNull()
  })

  // /code-review finding 4: every printed fix said --save-dev, which moves a
  // `dependencies` entry into devDependencies.
  it('names the section package.json uses in every command it prints', () => {
    const plan = planUpgrade(
      facts({
        pkg: { found: true, section: 'dependencies', spec: '^2.6.2' },
        registry: null,
        registryError: 'npm error code EPERM',
      }),
    )
    expect(plan.refuse).toMatch(/--save-prod/)
    expect(plan.refuse).not.toMatch(/--save-dev/)
  })

  // /code-review finding 5: with no lockfile, "current" was unreachable, so
  // every run reinstalled.
  it('installs nothing for a lockfile-less site already on this version', () => {
    const plan = planUpgrade(
      facts({
        engine: { ...facts().engine, version: '2.9.0' },
        lock: null,
        committedLockVersion: null,
      }),
    )
    expect(plan.install).toBeNull()
  })

  // /code-review finding 6: v1 was detected by "v1" anywhere in the warnings.
  it('flags a v1 site on the plan, not by searching the warnings', () => {
    expect(
      planUpgrade(
        facts({ engine: { ...facts().engine, version: '1.4.4' }, lock: null }),
      ).v1,
    ).toBe(true)
    const linked = planUpgrade(
      facts({
        engine: { ...LINKED, target: 'C:/Code/kiss-ssg-v1' },
        pkg: {
          found: true,
          section: 'devDependencies',
          spec: 'file:../kiss-ssg-v1',
        },
        lock: null,
        committedLockVersion: null,
        own: { version: '2.0.0-alpha.1', changelog: '# Changelog\n' },
      }),
    )
    expect(linked.v1).toBe(false)
    expect(formatUpgrade(linked, null)).toContain(
      'No releases between the two versions.',
    )
  })

  // Codex, adversarial review (2026-11-01): node_modules restored to the new
  // version while the lockfile still pins the old one. The next `npm ci`
  // puts the old version back, so "already on this version" was wrong.
  it('installs when the copy is current but the lockfile pins an older version', () => {
    const plan = planUpgrade(
      facts({
        engine: { ...facts().engine, version: '2.9.0' },
        committedLockVersion: '2.6.2',
      }),
    )
    expect(plan.install).not.toBeNull()
  })

  // Codex, the same review: a refusal that protects what the install writes
  // also blocked reading the notes, so the recovery the docs give after
  // `npm update` broke a build (`--plan --from`) refused exactly then. And
  // the pnpm refusal told the reader to run that very `--plan`.
  it.each([
    [
      'uncommitted changes',
      { git: { state: 'dirty', files: ['package-lock.json'] } },
      /uncommitted/,
    ],
    [
      'a git that failed',
      { git: { state: 'error', said: 'fatal: dubious ownership' } },
      /dubious ownership/,
    ],
    [
      'a pnpm lockfile',
      { lock: null, otherLockfile: 'pnpm-lock.yaml' },
      /pnpm-lock\.yaml/,
    ],
  ])(
    '--plan still prints the notes past %s, and says the install is blocked',
    (_, over, reason) => {
      const plan = planUpgrade(
        facts({ ...over, args: { ...facts().args, plan: true } }),
      )
      expect(plan.refuse).toBeNull()
      expect(plan.install).toBeNull()
      expect(plan.blocked).toMatch(reason)
      expect(plan.notes.length).toBeGreaterThan(0)
    },
  )

  // Codex, second pass (2026-11-01): "current" was judged from node_modules
  // and the lockfile, two of the three places a version lives. A
  // package.json still pinning the old release, or a file: link, makes the
  // next npm ci fail or npm install put the old one back.
  it.each([
    ['an older exact pin', '2.6.2'],
    ['a file: link', 'file:../tree'],
  ])(
    'installs when node_modules and the lockfile are current but package.json has %s',
    (_, spec) => {
      const plan = planUpgrade(
        facts({
          pkg: { found: true, section: 'devDependencies', spec },
          engine: { ...facts().engine, version: '2.9.0' },
          lock: {
            path: 'package-lock.json',
            entry: {
              version: '2.9.0',
              resolved: `${REGISTRY}kiss-ssg/-/kiss-ssg-2.9.0.tgz`,
            },
          },
          committedLockVersion: '2.9.0',
        }),
      )
      expect(plan.install).not.toBeNull()
    },
  )

  // Codex, second pass: npm installs from npm-shrinkwrap.json in preference
  // to package-lock.json, and upgrade neither guards nor verifies it.
  it('blocks the install on an npm-shrinkwrap.json, naming it, and --plan still reads', () => {
    const over = { lock: null, otherLockfile: 'npm-shrinkwrap.json' }
    expect(planUpgrade(facts(over)).refuse).toMatch(
      /npm-shrinkwrap\.json.*in preference to package-lock\.json/,
    )
    const plan = planUpgrade(
      facts({ ...over, args: { ...facts().args, plan: true } }),
    )
    expect(plan.blocked).toMatch(/npm-shrinkwrap\.json/)
    expect(plan.notes.length).toBeGreaterThan(0)
  })

  // Codex review (2026-11-01): a registry npm could not name was replaced
  // with npmjs, so a private registry's correct lockfile then failed the
  // check. Unknown is a reason not to install, never a default.
  it('blocks the install when npm could not say which registry it uses', () => {
    const over = {
      registry: null,
      registryError: 'npm error code EPERM',
    }
    expect(planUpgrade(facts(over)).refuse).toMatch(
      /could not say which registry.*EPERM/,
    )
    const plan = planUpgrade(
      facts({ ...over, args: { ...facts().args, plan: true } }),
    )
    expect(plan.blocked).toMatch(/registry/)
    expect(plan.notes.length).toBeGreaterThan(0)
  })

  it('names a workspace member as one, and says to install from the root', () => {
    const plan = planUpgrade(
      facts({
        registry: null,
        registryError: 'npm error code ENOWORKSPACES',
      }),
    )
    expect(plan.refuse).toMatch(
      /workspace member.*npm install kiss-ssg@2\.9\.0 -w .*workspace's root/,
    )
  })

  it('reads the committed lockfile with --plan after npm update moved it', () => {
    const plan = planUpgrade(
      facts({
        args: { ...facts().args, plan: true },
        engine: { ...facts().engine, version: '2.9.0' },
        lock: {
          path: 'package-lock.json',
          entry: {
            version: '2.9.0',
            resolved: `${REGISTRY}kiss-ssg/-/kiss-ssg-2.9.0.tgz`,
          },
        },
        committedLockVersion: '2.8.5',
        git: { state: 'dirty', files: ['package-lock.json'] },
      }),
    )
    expect(plan.from).toBe('2.8.5')
    expect(plan.notes.map((n) => n.version)).toContain('2.8.6')
  })
})

describe('verifyUpgrade', () => {
  const after = (over = {}) => ({
    engine: { ...facts().engine, version: '2.9.0' },
    lock: {
      path: 'package-lock.json',
      entry: {
        version: '2.9.0',
        resolved: `${REGISTRY}kiss-ssg/-/kiss-ssg-2.9.0.tgz`,
      },
    },
    registry: REGISTRY,
    savedSpec: '^2.9.0',
    ...over,
  })

  it('passes a registry install of the new version', () => {
    const result = verifyUpgrade(after(), '2.9.0')
    expect(result.ok).toBe(true)
    expect(result.checks.every((c) => c.ok)).toBe(true)
  })

  it('fails a link that survived the install, and says how to fix it', () => {
    const result = verifyUpgrade(
      after({
        engine: LINKED,
        lock: {
          path: 'package-lock.json',
          entry: { resolved: '../kiss-ssg', link: true },
        },
      }),
      '2.9.0',
    )
    expect(result.ok).toBe(false)
    const failed = result.checks.filter((c) => !c.ok)
    expect(failed.map((c) => c.what).join('\n')).toMatch(/link/)
    expect(failed.map((c) => c.fix).join('\n')).toMatch(/npm install/)
  })

  it('fails the wrong version', () => {
    const result = verifyUpgrade(
      after({ engine: { ...facts().engine, version: '2.8.0' } }),
      '2.9.0',
    )
    expect(result.ok).toBe(false)
  })

  // The critique, measured on the fleet: a GitHub tarball resolves to an
  // https: URL too, so "https:" is not "the registry".
  it('fails a tarball from somewhere other than the configured registry', () => {
    const result = verifyUpgrade(
      after({
        lock: {
          path: 'package-lock.json',
          entry: {
            version: '2.9.0',
            resolved:
              'https://github.com/cprobert/kiss-ssg/archive/refs/heads/main.tar.gz',
          },
        },
      }),
      '2.9.0',
    )
    expect(result.ok).toBe(false)
  })

  // Codex (2026-11-01): the origin was checked, the version was not.
  it('fails a lockfile that pins an older version from the registry', () => {
    const result = verifyUpgrade(
      after({
        lock: {
          path: 'package-lock.json',
          entry: {
            version: '2.6.2',
            resolved: `${REGISTRY}kiss-ssg/-/kiss-ssg-2.6.2.tgz`,
          },
        },
      }),
      '2.9.0',
    )
    expect(result.ok).toBe(false)
    expect(result.checks.find((c) => c.ok === false)?.what).toMatch(
      /2\.6\.2.*not 2\.9\.0/,
    )
  })

  it('fails a package.json that does not allow the version installed', () => {
    const result = verifyUpgrade(after({ savedSpec: '2.6.2' }), '2.9.0')
    expect(result.ok).toBe(false)
    expect(result.checks.find((c) => c.ok === false)?.what).toMatch(
      /package\.json asks for 2\.6\.2/,
    )
  })

  it('passes a private registry the site is configured for', () => {
    const result = verifyUpgrade(
      after({
        registry: 'http://localhost:4873/',
        lock: {
          path: 'package-lock.json',
          entry: {
            version: '2.9.0',
            resolved: 'http://localhost:4873/kiss-ssg/-/kiss-ssg-2.9.0.tgz',
          },
        },
      }),
      '2.9.0',
    )
    expect(result.ok).toBe(true)
  })

  it('prints fixes with the section package.json uses', () => {
    const result = verifyUpgrade(
      after({ engine: { ...facts().engine, version: '2.8.0' } }),
      '2.9.0',
      '--save-prod',
    )
    const fixes = result.checks.map((c) => c.fix ?? '').join('\n')
    expect(fixes).toMatch(/--save-prod/)
    expect(fixes).not.toMatch(/--save-dev/)
  })

  it('says a missing lockfile was not checked, rather than passing it', () => {
    const result = verifyUpgrade(after({ lock: null }), '2.9.0')
    expect(result.ok).toBe(true)
    expect(result.checks.find((c) => c.ok === null)?.what).toMatch(
      /no package-lock\.json/,
    )
  })
})

describe('formatUpgrade', () => {
  it('prints the move, the notes and the next step', () => {
    const plan = planUpgrade(
      facts({ engine: { ...facts().engine, version: '2.8.5' } }),
    )
    const text = formatUpgrade(plan, null)
    expect(text).toMatch(/^kiss-ssg 2\.8\.5 → 2\.9\.0/)
    expect(text).toContain('## 2.8.6 — Upgrading: the sitemap')
    expect(text).toContain('1 other release with nothing to change: 2.8.7')
    expect(text).toMatch(/Next: run `npx kiss-ssg check/)
  })

  it('says when the starting version is unknown', () => {
    const plan = planUpgrade(
      facts({
        engine: LINKED,
        pkg: {
          found: true,
          section: 'devDependencies',
          spec: 'file:../kiss-ssg',
        },
        lock: null,
        committedLockVersion: null,
      }),
    )
    expect(formatUpgrade(plan, null)).toMatch(/^kiss-ssg \(unknown\) → 2\.9\.0/)
  })

  // The 2026-11-01 arms: an agent piped the output through
  // `grep -v '^## \|^- \|^ '` to skip the notes, and the indented ok: lines
  // went with them. The check lines are the verdict, so they come last,
  // beside the next step, and start in column one.
  it('prints the checks after the notes, unindented, beside the next step', () => {
    const plan = planUpgrade(
      facts({ engine: { ...facts().engine, version: '2.8.5' } }),
    )
    const verified = verifyUpgrade(
      {
        engine: { ...facts().engine, version: '2.9.0' },
        lock: {
          path: 'package-lock.json',
          entry: {
            version: '2.9.0',
            resolved: `${REGISTRY}kiss-ssg/-/kiss-ssg-2.9.0.tgz`,
          },
        },
        registry: REGISTRY,
        savedSpec: '^2.9.0',
      },
      '2.9.0',
    )
    const lines = formatUpgrade(plan, {
      ran: 'npm install kiss-ssg@2.9.0 --save-dev',
      verified,
    }).split('\n')
    const check = lines.indexOf(
      'ok: node_modules/kiss-ssg is 2.9.0, not a link',
    )
    const lastNote = lines.findLastIndex((l) => l.startsWith('## '))
    expect(check).toBeGreaterThan(lastNote)
    expect(lines.slice(check).some((l) => l.startsWith('Next:'))).toBe(true)
    // What the arm's filter kept still holds the verdict.
    const kept = lines.filter((l) => !/^## |^- |^ /.test(l))
    expect(kept).toContain('ok: package.json asks for ^2.9.0')
  })
})
