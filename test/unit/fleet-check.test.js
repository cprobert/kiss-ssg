// scripts/fleet-check.mjs decides three things a pulse reads from its exit
// code: whether two engines' reports differ, whether two build folders differ
// once the engine's own version string is set aside, and how to run the site.
// Each is tested here on small in-memory fixtures; the git, npm and build
// calls around them are thin and run only from the command line.
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  compareFolders,
  compareHashes,
  compareReports,
  exitCodeFor,
  isInside,
  parseArgs,
  reportLine,
  siteEntry,
  summaryLines,
  zeroDurations,
} from '../../scripts/fleet-check.mjs'

const script = fileURLToPath(
  new URL('../../scripts/fleet-check.mjs', import.meta.url),
)

const report = (pages, extra = {}) => ({
  buildDir: 'docs',
  ok: true,
  pages: pages.map(([buildTo, hash]) => ({ buildTo, hash })),
  failures: [],
  links: { broken: [] },
  audit: { findings: [] },
  assets: [],
  ...extra,
})

const files = (entries) =>
  new Map(entries.map(([name, text]) => [name, Buffer.from(text, 'latin1')]))

describe('parseArgs', () => {
  it('reads the site, the base and the defaults', () => {
    expect(parseArgs(['../site', '--base', 'main'])).toEqual({
      site: '../site',
      base: 'main',
      branch: 'HEAD',
      out: null,
      entry: null,
      help: false,
      error: null,
    })
  })

  it('takes --flag value and --flag=value alike', () => {
    const parsed = parseArgs([
      'site',
      '--base=main',
      '--branch',
      'fix/x',
      '--out=o',
      '--entry',
      'generate staging',
    ])
    expect(parsed).toMatchObject({
      base: 'main',
      branch: 'fix/x',
      out: 'o',
      entry: 'generate staging',
      error: null,
    })
  })

  it('requires --base: there is no comparison without one', () => {
    expect(parseArgs(['site']).error).toMatch(/--base/)
  })

  it('requires a site', () => {
    expect(parseArgs(['--base', 'main']).error).toMatch(/site/)
  })

  it('refuses an unknown option rather than checking the defaults', () => {
    expect(parseArgs(['site', '--base', 'main', '--brnach', 'x']).error).toBe(
      'unknown option: --brnach',
    )
  })

  it('refuses a flag with no value, or another flag as its value', () => {
    expect(parseArgs(['site', '--base']).error).toBe('--base needs a value')
    expect(parseArgs(['site', '--base', '--out', 'o']).error).toBe(
      '--base needs a value',
    )
  })

  it('refuses a second site', () => {
    expect(parseArgs(['a', 'b', '--base', 'main']).error).toMatch(/one site/)
  })

  it('answers --help with nothing else required', () => {
    expect(parseArgs(['--help'])).toMatchObject({ help: true, error: null })
  })
})

describe('siteEntry', () => {
  // a1k9training's build script: no extension, which node resolves.
  it('reads `node router` as the script `router`', () => {
    expect(siteEntry({ scripts: { build: 'node router' } })).toEqual(['router'])
  })

  it('splits an explicit entry into the script and its arguments', () => {
    expect(siteEntry(null, 'generate staging')).toEqual(['generate', 'staging'])
  })

  it('returns null when the build script is not a bare node call', () => {
    expect(
      siteEntry({ scripts: { build: 'npm run a && node b.js' } }),
    ).toBeNull()
    expect(siteEntry(null)).toBeNull()
  })
})

describe('isInside', () => {
  const root = path.resolve('copy', 'site')
  it('accepts the root and a folder in it', () => {
    expect(isInside(root, root)).toBe(true)
    expect(isInside(root, path.join(root, 'docs'))).toBe(true)
  })

  it('refuses a folder beside or above it', () => {
    expect(isInside(root, path.resolve('copy', 'elsewhere'))).toBe(false)
    expect(isInside(root, path.resolve('copy', 'site-2'))).toBe(false)
    expect(isInside(root, path.dirname(root))).toBe(false)
  })
})

describe('zeroDurations', () => {
  it('zeroes each pipeline duration without changing the input', () => {
    const input = [report([], { pipeline: [{ run: 'x', duration: 812 }] })]
    const out = zeroDurations(input)
    expect(out[0].pipeline[0]).toEqual({ run: 'x', duration: 0 })
    expect(input[0].pipeline[0].duration).toBe(812)
  })
})

describe('reportLine', () => {
  it('names the counts a person compares', () => {
    expect(reportLine(report([['docs/index.html', 'a']]))).toBe(
      'docs: ok=true pages=1 failures=0 links.broken=0 audit.findings=0',
    )
  })
})

describe('compareHashes', () => {
  it('lists changed, added and removed pages by output path', () => {
    const result = compareHashes(
      [
        report([
          ['docs/a.html', '1'],
          ['docs/b.html', '2'],
          ['docs/gone.html', '3'],
        ]),
      ],
      [
        report([
          ['docs/a.html', '1'],
          ['docs/b.html', '9'],
          ['docs/new.html', '4'],
        ]),
      ],
    )
    expect(result).toEqual({
      before: 3,
      after: 3,
      changed: ['docs/b.html'],
      added: ['docs/new.html'],
      removed: ['docs/gone.html'],
    })
  })

  it('counts a null hash as changed, never the same', () => {
    expect(
      compareHashes(
        [report([['docs/a.html', null]])],
        [report([['docs/a.html', null]])],
      ).changed,
    ).toEqual(['docs/a.html'])
  })
})

describe('compareReports', () => {
  const pages = [
    ['docs/index.html', 'h1'],
    ['docs/about/index.html', 'h2'],
  ]

  it('finds nothing in two equal reports, whatever their pipeline durations', () => {
    const result = compareReports(
      [report(pages, { pipeline: [{ run: 'tw', duration: 100 }] })],
      [report(pages, { pipeline: [{ run: 'tw', duration: 250 }] })],
    )
    expect(result.differs).toBe(false)
    expect(result.formatted).toEqual(['docs\n  = 2 unchanged'])
  })

  it('differs when a page hash moves', () => {
    const result = compareReports(
      [report(pages)],
      [
        report([
          ['docs/index.html', 'h1'],
          ['docs/about/index.html', 'CHANGED'],
        ]),
      ],
    )
    expect(result.differs).toBe(true)
    expect(result.hashes.changed).toEqual(['docs/about/index.html'])
    expect(result.formatted[0]).toContain('~ docs/about/index.html')
  })

  // diffReports never reads the audit: every page the same and one finding
  // more is still a change in what the site is told.
  it('differs when only a summary count moves', () => {
    const result = compareReports(
      [report(pages)],
      [report(pages, { audit: { findings: [{ code: 'x' }] } })],
    )
    expect(result.diffs[0].changed).toEqual([])
    expect(result.linesDiffer).toBe(true)
    expect(result.differs).toBe(true)
  })

  it('differs when an asset moves with every page the same', () => {
    const result = compareReports(
      [report(pages, { assets: [{ source: 'css/a.css', target: 'a.1.css' }] })],
      [report(pages, { assets: [{ source: 'css/a.css', target: 'a.2.css' }] })],
    )
    expect(result.differs).toBe(true)
  })

  // diffReports ignores a base report with no partner; the fleet check must
  // not, or a build folder the branch stopped writing goes unnoticed.
  it('differs when the branch built a folder fewer', () => {
    const result = compareReports(
      [report(pages), report([], { buildDir: 'archive' })],
      [report(pages)],
    )
    expect(result.foldersDiffer).toBe(true)
    expect(result.differs).toBe(true)
  })
})

describe('compareFolders', () => {
  it('finds nothing in two identical folders', () => {
    const a = files([
      ['docs/index.html', '<p>hi</p>'],
      ['docs/a.css', 'p{}'],
    ])
    const result = compareFolders(a, new Map(a), '2.13.0', '2.14.0')
    expect(result).toMatchObject({
      countA: 2,
      countB: 2,
      onlyA: [],
      onlyB: [],
      bytes: [],
      beyondVersion: [],
      differs: false,
    })
  })

  it('sets aside a difference that is only the engine version', () => {
    const result = compareFolders(
      files([['docs/kiss-consent.js', '/* kiss-ssg 2.13.0 */x']]),
      files([['docs/kiss-consent.js', '/* kiss-ssg 2.14.0 */x']]),
      '2.13.0',
      '2.14.0',
    )
    expect(result.bytes).toEqual(['docs/kiss-consent.js'])
    expect(result.beyondVersion).toEqual([])
    expect(result.differs).toBe(false)
  })

  it('reports a difference beyond the version, with where it starts', () => {
    const result = compareFolders(
      files([['docs/index.html', 'v2.13.0 <p>old</p>']]),
      files([['docs/index.html', 'v2.14.0 <p>new</p>']]),
      '2.13.0',
      '2.14.0',
    )
    expect(result.differs).toBe(true)
    expect(result.beyondVersion).toHaveLength(1)
    expect(result.beyondVersion[0]).toMatchObject({
      file: 'docs/index.html',
      at: 'v<version> <p>'.length,
    })
  })

  it('lists files only one build wrote', () => {
    const result = compareFolders(
      files([
        ['docs/a.html', 'a'],
        ['docs/old.html', 'o'],
      ]),
      files([
        ['docs/a.html', 'a'],
        ['docs/new.html', 'n'],
      ]),
      '1',
      '1',
    )
    expect(result.onlyA).toEqual(['docs/old.html'])
    expect(result.onlyB).toEqual(['docs/new.html'])
    expect(result.differs).toBe(true)
  })

  // Two different invalid utf8 sequences both decode to U+FFFD; read as utf8,
  // two different images would compare equal after the substitution.
  it('never calls two different binaries equal', () => {
    const result = compareFolders(
      new Map([['docs/a.png', Buffer.from([0xff, 0x01])]]),
      new Map([['docs/a.png', Buffer.from([0xfe, 0x01])]]),
      '2.13.0',
      '2.14.0',
    )
    expect(result.beyondVersion.map((d) => d.file)).toEqual(['docs/a.png'])
  })
})

describe('exitCodeFor', () => {
  it('is 0 only when neither comparison differs', () => {
    expect(exitCodeFor({ differs: false }, { differs: false })).toBe(0)
    expect(exitCodeFor({ differs: true }, { differs: false })).toBe(1)
    expect(exitCodeFor({ differs: false }, { differs: true })).toBe(1)
  })
})

describe('summaryLines', () => {
  it('says what was compared and what differed, in pasteable lines', () => {
    const pages = [['docs/index.html', 'h']]
    const text = summaryLines({
      site: 'a1k9training',
      base: { ref: 'main', sha: 'abcdef0123', version: '2.13.2' },
      branch: { ref: 'HEAD', sha: '1234567890', version: '2.14.0' },
      reports: compareReports([report(pages)], [report(pages)]),
      folders: compareFolders(
        files([['docs/index.html', '2.13.2']]),
        files([['docs/index.html', '2.14.0']]),
        '2.13.2',
        '2.14.0',
      ),
    })
    expect(text.split('\n')[0]).toBe(
      'Fleet check: a1k9training, main (abcdef0, 2.13.2) against HEAD (1234567, 2.14.0): identical.',
    )
    expect(text).toContain(
      '1 differ as bytes, 0 still differ with the version string taken out',
    )
  })
})

describe('the command line', () => {
  it('loads and answers --help without running anything', () => {
    const r = spawnSync(process.execPath, [script, '--help'], {
      encoding: 'utf8',
    })
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('--base <ref>')
  })

  it('exits 2 on a usage error, never 1, which means "differs"', () => {
    const r = spawnSync(process.execPath, [script, 'site'], {
      encoding: 'utf8',
    })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('--base <ref> is required')
  })
})
