// `kiss-ssg speed`'s decisions, with no Lighthouse and no Chrome: the
// arguments, the target, the KPIs read off a real (trimmed) Lighthouse
// result, the median and spread, the diff's noise rule, the table, and the
// orchestration with Lighthouse and chrome-launcher passed in as fakes.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_RUNS,
  INSTALL_LINE,
  METRICS,
  diffSpeed,
  formatSpeed,
  formatSpeedDiff,
  formatValue,
  isChromeMissing,
  kpisFrom,
  loadLighthouse,
  measure,
  median,
  nodeAtLeast,
  parseSpeedArgs,
  readSpeedFile,
  resolveTarget,
  runSpeed,
  speedExitCode,
  speedRecord,
  summarise,
} from '../../lib/speed.js'

const fixture = path.resolve(
  import.meta.dirname,
  '../fixtures/lighthouse/blog-home.json',
)
const lhr = () => JSON.parse(fs.readFileSync(fixture, 'utf8'))

// One run's values, every metric set, with overrides.
const values = (over = {}) => ({
  score: 90,
  'largest-contentful-paint': 2000,
  'cumulative-layout-shift': 0.1,
  'total-blocking-time': 100,
  'first-contentful-paint': 1000,
  'speed-index': 1500,
  'total-byte-weight': 50000,
  requests: 10,
  ...over,
})

describe('parseSpeedArgs', () => {
  it('takes a target and defaults', () => {
    expect(parseSpeedArgs(['public'])).toEqual({
      target: 'public',
      pages: null,
      runs: DEFAULT_RUNS,
      out: null,
      against: null,
      help: false,
      error: null,
    })
  })

  it('repeats --page and reads every option on either side of the target', () => {
    const args = parseSpeedArgs([
      '--page',
      '/',
      'public',
      '--page',
      '/blog/',
      '--runs',
      '5',
      '--out',
      'a.json',
      '--against',
      'b.json',
    ])
    expect(args.error).toBeNull()
    expect(args.pages).toEqual(['/', '/blog/'])
    expect(args).toMatchObject({ runs: 5, out: 'a.json', against: 'b.json' })
  })

  it('holds --runs to a whole number from 1 to 9', () => {
    for (const bad of ['0', '10', '2.5', 'three'])
      expect(parseSpeedArgs(['public', '--runs', bad]).error).toMatch(/--runs/)
    expect(parseSpeedArgs(['public', '--runs', '1']).runs).toBe(1)
    expect(parseSpeedArgs(['public', '--runs', '9']).runs).toBe(9)
  })

  it('refuses a page that is not a path from the root', () => {
    expect(parseSpeedArgs(['public', '--page', 'blog']).error).toMatch(
      /starting with \//,
    )
  })

  it('refuses a missing value, an unknown option, two targets or none', () => {
    expect(parseSpeedArgs(['public', '--out']).error).toMatch(/--out needs/)
    expect(parseSpeedArgs(['public', '--out', '--runs']).error).toMatch(
      /--out needs/,
    )
    expect(parseSpeedArgs(['public', '--fast']).error).toMatch(
      /unknown option: --fast/,
    )
    expect(parseSpeedArgs(['a', 'b']).error).toMatch(/one target at a time/)
    expect(parseSpeedArgs([]).error).toMatch(/needs a build folder or a URL/)
  })

  it('answers --help', () => {
    expect(parseSpeedArgs(['--help']).help).toBe(true)
  })
})

describe('resolveTarget', () => {
  const fsLike = (dirs = [], files = []) => ({
    cwd: path.resolve('/site'),
    isDirectory: (p) => dirs.map((d) => path.resolve(d)).includes(p),
    isFile: (p) => files.map((f) => path.resolve(f)).includes(p),
  })

  it('measures a URL where it is, its path the default page', () => {
    expect(resolveTarget('https://example.com/blog/?x=1', fsLike())).toEqual({
      kind: 'url',
      base: 'https://example.com',
      page: '/blog/?x=1',
    })
  })

  it('serves a folder, resolved against the cwd', () => {
    expect(resolveTarget('public', fsLike(['/site/public']))).toEqual({
      kind: 'folder',
      folder: path.resolve('/site/public'),
    })
  })

  it('refuses a build script rather than running it', () => {
    const target = resolveTarget('router.js', fsLike([], ['/site/router.js']))
    expect(target.kind).toBe('error')
    expect('error' in target && target.error).toMatch(
      /never runs the build.*kiss-ssg speed public/,
    )
  })

  it('names a target that does not exist', () => {
    const target = resolveTarget('pubic', fsLike())
    expect('error' in target && target.error).toMatch(/pubic does not exist/)
  })
})

describe('nodeAtLeast', () => {
  it('compares major, minor and patch numerically', () => {
    expect(nodeAtLeast('22.19.0')).toBe(true)
    expect(nodeAtLeast('22.18.9')).toBe(false)
    expect(nodeAtLeast('22.12.0')).toBe(false)
    expect(nodeAtLeast('24.0.0')).toBe(true)
    expect(nodeAtLeast('22.100.0')).toBe(true)
    expect(nodeAtLeast('v23.0.0')).toBe(true)
  })
})

describe('kpisFrom', () => {
  it('reads every KPI off a real, trimmed Lighthouse result', () => {
    const kpis = kpisFrom(lhr())
    expect(kpis).toEqual({
      version: '13.6.0',
      values: {
        score: 100,
        'largest-contentful-paint': 753.8289,
        'cumulative-layout-shift': 0,
        'total-blocking-time': 0,
        'first-contentful-paint': 753.8289,
        'speed-index': 753.8289,
        'total-byte-weight': 12642,
        requests: 3,
      },
    })
  })

  it('gives every metric in METRICS a value', () => {
    const kpis = kpisFrom(lhr())
    expect('values' in kpis && Object.keys(kpis.values).sort()).toEqual(
      METRICS.map((m) => m.key).sort(),
    )
  })

  it('rounds the score to Lighthouse’s 0–100', () => {
    const result = lhr()
    result.categories.performance.score = 0.874
    const kpis = kpisFrom(result)
    expect('values' in kpis && kpis.values.score).toBe(87)
  })

  it('reads a page that did not load as a failure, never as a zero', () => {
    const result = lhr()
    result.runtimeError = {
      code: 'ERRORED_DOCUMENT_REQUEST',
      message:
        'Lighthouse was unable to reliably load the page (Status code: 404)',
    }
    result.categories.performance.score = null
    expect(kpisFrom(result)).toEqual({
      error:
        'ERRORED_DOCUMENT_REQUEST: Lighthouse was unable to reliably load the page (Status code: 404)',
    })
  })

  it('fails a result with no score, a missing audit or no request list', () => {
    const noScore = lhr()
    noScore.categories.performance.score = null
    expect(kpisFrom(noScore)).toEqual({
      error: 'Lighthouse gave no performance score',
    })
    const noLcp = lhr()
    delete noLcp.audits['largest-contentful-paint']
    expect(kpisFrom(noLcp)).toEqual({
      error: 'Lighthouse gave no largest-contentful-paint',
    })
    const noRequests = lhr()
    delete noRequests.audits['network-requests'].details
    expect(kpisFrom(noRequests)).toEqual({
      error: 'Lighthouse gave no network-requests',
    })
    expect(kpisFrom(undefined)).toEqual({
      error: 'Lighthouse returned no result',
    })
  })
})

describe('median and summarise', () => {
  it('takes the middle value, or the mean of the two middle values', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([7])).toBe(7)
    expect(() => median([])).toThrow()
  })

  it('gives every metric a median and a min-max spread', () => {
    const summary = summarise([
      values({ score: 80 }),
      values({ score: 95 }),
      values({ score: 90 }),
    ])
    expect(summary.median.score).toBe(90)
    expect(summary.spread.score).toEqual({ min: 80, max: 95 })
    expect(Object.keys(summary.spread).sort()).toEqual(
      METRICS.map((m) => m.key).sort(),
    )
  })
})

const page = (name, runs) => ({ page: name, ...summarise(runs) })

describe('diffSpeed', () => {
  it('marks a change larger than both spreads as changed', () => {
    const before = speedRecord({
      lighthouse: '13.6.0',
      runs: 3,
      pages: [page('/', [values({ score: 70 }), values({ score: 72 })])],
    })
    const after = speedRecord({
      lighthouse: '13.6.0',
      runs: 3,
      pages: [page('/', [values({ score: 90 }), values({ score: 91 })])],
    })
    const diff = diffSpeed(before, after)
    expect(diff.warnings).toEqual([])
    const change = diff.pages[0]
    const score =
      'metrics' in change && change.metrics.find((m) => m.key === 'score')
    expect(score).toMatchObject({
      before: 71,
      after: 90.5,
      delta: 19.5,
      noise: 2,
      changed: true,
    })
  })

  it('reads a change within the larger spread as noise', () => {
    const before = speedRecord({
      lighthouse: '13.6.0',
      runs: 3,
      pages: [page('/', [values({ score: 80 }), values({ score: 82 })])],
    })
    // after's own spread is 10, so a 4-point gain is not a gain
    const after = speedRecord({
      lighthouse: '13.6.0',
      runs: 3,
      pages: [page('/', [values({ score: 80 }), values({ score: 90 })])],
    })
    const change = diffSpeed(before, after).pages[0]
    const score =
      'metrics' in change && change.metrics.find((m) => m.key === 'score')
    expect(score).toMatchObject({ delta: 4, noise: 10, changed: false })
  })

  it('treats a change equal to the spread as noise, and any change with one run as real', () => {
    const one = (score) =>
      speedRecord({
        lighthouse: 'x',
        runs: 1,
        pages: [page('/', [values({ score })])],
      })
    const real = diffSpeed(one(80), one(81)).pages[0]
    expect('metrics' in real && real.metrics[0].changed).toBe(true)
    const same = diffSpeed(one(80), one(80)).pages[0]
    expect('metrics' in same && same.metrics[0].changed).toBe(false)
    const edge = diffSpeed(
      speedRecord({
        lighthouse: 'x',
        runs: 2,
        pages: [page('/', [values({ score: 80 }), values({ score: 82 })])],
      }),
      speedRecord({
        lighthouse: 'x',
        runs: 1,
        pages: [page('/', [values({ score: 83 })])],
      }),
    ).pages[0]
    expect('metrics' in edge && edge.metrics[0]).toMatchObject({
      delta: 2,
      noise: 2,
      changed: false,
    })
  })

  it('names pages on one side only, failed pages, and a Lighthouse version change', () => {
    const before = speedRecord({
      lighthouse: '13.5.0',
      runs: 1,
      pages: [
        page('/old/', [values()]),
        page('/', [values()]),
        { page: '/broken/', error: 'NO_FCP' },
      ],
    })
    const after = speedRecord({
      lighthouse: '13.6.0',
      runs: 1,
      pages: [
        page('/', [values()]),
        page('/new/', [values()]),
        page('/broken/', [values()]),
      ],
    })
    const diff = diffSpeed(before, after)
    expect(diff.warnings[0]).toMatch(/13\.5\.0 before and 13\.6\.0 after/)
    expect(
      diff.pages.map((p) => [p.page, 'only' in p ? p.only : null]),
    ).toEqual([
      ['/', null],
      ['/new/', 'after'],
      ['/broken/', null],
      ['/old/', 'before'],
    ])
    expect(diff.pages[2]).toEqual({
      page: '/broken/',
      error: 'failed before: NO_FCP',
    })
  })
})

describe('formatting', () => {
  it('prints each unit the way Lighthouse does', () => {
    expect(formatValue('ms', 753.8)).toBe('754 ms')
    expect(formatValue('ms', 2450)).toBe('2.5 s')
    expect(formatValue('unitless', 0.1234)).toBe('0.123')
    expect(formatValue('bytes', 12642)).toBe('12.3 KiB')
    expect(formatValue('count', 3)).toBe('3')
    expect(formatValue('score', 87.5)).toBe('88')
  })

  it('prints one row per page, the score with its spread, and failures after', () => {
    const record = speedRecord({
      lighthouse: '13.6.0',
      runs: 3,
      pages: [
        page('/', [values({ score: 88 }), values({ score: 90 }), values()]),
        page('/blog/', [values(), values(), values()]),
        { page: '/gone/', error: 'ERRORED_DOCUMENT_REQUEST' },
      ],
    })
    const lines = formatSpeed(record).split('\n')
    expect(lines[0]).toMatch(
      /^Page\s+Score\s+LCP\s+CLS\s+TBT\s+FCP\s+SI\s+Bytes\s+Requests$/,
    )
    expect(lines[1]).toMatch(
      /^\/\s+90 \(88-90\)\s+2\.0 s\s+0\.100\s+100 ms\s+1\.0 s\s+1\.5 s\s+48\.8 KiB\s+10$/,
    )
    expect(lines[2]).toMatch(/^\/blog\/\s+90\s+2\.0 s/)
    expect(lines[3]).toBe('/gone/  failed: ERRORED_DOCUMENT_REQUEST')
    expect(lines.at(-1)).toMatch(
      /^Median of 3 runs per page, Lighthouse 13\.6\.0, mobile, simulated throttling\. A lab measurement on this machine\.$/,
    )
  })

  it('prints before -> after, the signed change and the verdict', () => {
    const before = speedRecord({
      lighthouse: '13.6.0',
      runs: 1,
      pages: [page('/', [values()])],
    })
    const after = speedRecord({
      lighthouse: '13.6.0',
      runs: 1,
      pages: [
        page('/', [values({ score: 96, 'largest-contentful-paint': 1300 })]),
      ],
    })
    const text = formatSpeedDiff(diffSpeed(before, after))
    expect(text).toMatch(/^\s+Score\s+90 -> 96\s+\+6\s+changed$/m)
    expect(text).toMatch(/^\s+LCP\s+2\.0 s -> 1\.3 s\s+-700 ms\s+changed$/m)
    expect(text).toMatch(/^\s+CLS\s+0\.100 -> 0\.100\s+0\.000\s+within noise$/m)
  })
})

describe('readSpeedFile and the exit code', () => {
  it('reads its own --out file back and refuses anything else', () => {
    const record = speedRecord({ lighthouse: '13.6.0', runs: 1, pages: [] })
    expect(readSpeedFile(JSON.stringify(record))).toEqual(record)
    expect(() => readSpeedFile('[]')).toThrow(/not a kiss-ssg speed/)
    expect(() => readSpeedFile('{"version":2,"pages":[]}')).toThrow(
      /not a kiss-ssg speed/,
    )
    expect(() => readSpeedFile('nope')).toThrow()
  })

  it('exits 1 when any page failed, 0 when all were measured', () => {
    const ok = page('/', [values()])
    expect(
      speedExitCode(speedRecord({ lighthouse: 'x', runs: 1, pages: [ok] })),
    ).toBe(0)
    expect(
      speedExitCode(
        speedRecord({
          lighthouse: 'x',
          runs: 1,
          pages: [ok, { page: '/x/', error: 'NO_FCP' }],
        }),
      ),
    ).toBe(1)
  })
})

// Fakes with the shape of the real modules: chrome-launcher's `launch`
// resolving `{ port, kill }`, and Lighthouse's default export resolving
// `{ lhr }`.
function fakes({ lhrs = [], launchError = null } = {}) {
  const calls = { launched: 0, killed: 0, urls: [], flags: [] }
  const queue = [...lhrs]
  return {
    calls,
    chromeLauncher: {
      launch: async () => {
        if (launchError) throw launchError
        calls.launched++
        return { port: 9000 + calls.launched, kill: async () => calls.killed++ }
      },
    },
    lighthouse: async (url, flags) => {
      calls.urls.push(url)
      calls.flags.push(flags)
      const next = queue.shift() ?? lhr()
      if (next instanceof Error) throw next
      return { lhr: next }
    },
  }
}

describe('measure', () => {
  it('runs each page in a fresh Chrome, performance only, and summarises', async () => {
    const f = fakes()
    const result = await measure({
      base: 'http://127.0.0.1:4000',
      pages: ['/', '/blog/'],
      runs: 3,
      lighthouse: f.lighthouse,
      chromeLauncher: f.chromeLauncher,
    })
    expect(f.calls.launched).toBe(6)
    expect(f.calls.killed).toBe(6)
    expect(f.calls.urls).toEqual([
      ...Array(3).fill('http://127.0.0.1:4000/'),
      ...Array(3).fill('http://127.0.0.1:4000/blog/'),
    ])
    expect(f.calls.flags[0]).toMatchObject({
      port: 9001,
      onlyCategories: ['performance'],
    })
    // Lighthouse's default config is the mobile preset with simulated
    // throttling; speed passes no other config.
    expect(f.calls.flags[0]).not.toHaveProperty('formFactor')
    expect(f.calls.flags[0]).not.toHaveProperty('throttlingMethod')
    expect(result.fatal).toBeNull()
    expect(result.lighthouse).toBe('13.6.0')
    expect(result.pages.map((p) => p.page)).toEqual(['/', '/blog/'])
    expect('median' in result.pages[0] && result.pages[0].median.score).toBe(
      100,
    )
  })

  it('fails a page at its first failed run and moves on, killing Chrome', async () => {
    const broken = lhr()
    broken.runtimeError = { code: 'NO_FCP', message: 'no paint' }
    const f = fakes({ lhrs: [broken, new Error('protocol timeout')] })
    const result = await measure({
      base: 'http://127.0.0.1:4000',
      pages: ['/a/', '/b/', '/c/'],
      runs: 2,
      lighthouse: f.lighthouse,
      chromeLauncher: f.chromeLauncher,
    })
    expect(result.pages).toEqual([
      { page: '/a/', error: 'NO_FCP: no paint' },
      { page: '/b/', error: 'Lighthouse failed (protocol timeout)' },
      expect.objectContaining({ page: '/c/' }),
    ])
    expect(f.calls.killed).toBe(f.calls.launched)
    expect(f.calls.launched).toBe(4)
  })

  it('gives a page that failed on a later run no median of the runs before', async () => {
    const broken = lhr()
    broken.runtimeError = { code: 'NO_FCP', message: 'no paint' }
    const f = fakes({ lhrs: [lhr(), broken] })
    const result = await measure({
      base: 'http://127.0.0.1:4000',
      pages: ['/'],
      runs: 3,
      lighthouse: f.lighthouse,
      chromeLauncher: f.chromeLauncher,
    })
    expect(result.pages).toEqual([{ page: '/', error: 'NO_FCP: no paint' }])
    expect(f.calls.launched).toBe(2)
  })

  it('ends the whole measurement when there is no Chrome', async () => {
    const err = Object.assign(new Error('No Chrome installations found.'), {
      code: 'ERR_LAUNCHER_NOT_INSTALLED',
    })
    expect(isChromeMissing(err)).toBe(true)
    const f = fakes({ launchError: err })
    const result = await measure({
      base: 'http://127.0.0.1:4000',
      pages: ['/'],
      runs: 3,
      lighthouse: f.lighthouse,
      chromeLauncher: f.chromeLauncher,
    })
    expect(result.fatal).toMatch(/CHROME_PATH/)
    expect(f.calls.urls).toEqual([])
  })

  it('fails the page, not the command, when Chrome dies for another reason', async () => {
    const f = fakes({ launchError: new Error('spawn EACCES') })
    const result = await measure({
      base: 'http://127.0.0.1:4000',
      pages: ['/'],
      runs: 1,
      lighthouse: f.lighthouse,
      chromeLauncher: f.chromeLauncher,
    })
    expect(result.fatal).toBeNull()
    expect(result.pages).toEqual([
      { page: '/', error: 'Chrome did not start (spawn EACCES)' },
    ])
  })
})

describe('loadLighthouse', () => {
  it('says how to install Lighthouse when the site has none', async () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-speed-'))
    try {
      const loaded = await loadLighthouse(empty)
      expect('error' in loaded && loaded.error).toContain(INSTALL_LINE)
    } finally {
      fs.rmSync(empty, { recursive: true, force: true })
    }
  })

  it('says which Node Lighthouse needs, after finding it installed', async () => {
    const site = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-speed-'))
    try {
      const pkg = path.join(site, 'node_modules', 'lighthouse')
      fs.mkdirSync(pkg, { recursive: true })
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({
          name: 'lighthouse',
          type: 'module',
          main: 'index.js',
        }),
      )
      fs.writeFileSync(path.join(pkg, 'index.js'), 'export default () => {}\n')
      const loaded = await loadLighthouse(site, { nodeVersion: '22.12.0' })
      expect('error' in loaded && loaded.error).toBe(
        'Lighthouse 13 needs Node 22.19 or newer, and this is Node 22.12.0',
      )
    } finally {
      fs.rmSync(site, { recursive: true, force: true })
    }
  })
})

describe('runSpeed', () => {
  const loaded = (f) => async () => ({
    lighthouse: f.lighthouse,
    chromeLauncher: f.chromeLauncher,
  })
  const serve = async () => ({
    url: 'http://127.0.0.1:4000',
    close: async () => {},
  })

  it('exits 2 on a usage error and 0 on --help', async () => {
    expect((await runSpeed(['--runs', '0', 'x'])).code).toBe(2)
    expect((await runSpeed(['--help'])).code).toBe(0)
  })

  it('measures a URL at its own path, with no server', async () => {
    const f = fakes()
    const result = await runSpeed(
      ['https://example.com/blog/', '--runs', '1'],
      {
        load: loaded(f),
        serve: async () => {
          throw new Error('served')
        },
      },
    )
    expect(result.code).toBe(0)
    expect(f.calls.urls).toEqual(['https://example.com/blog/'])
  })

  it('exits 2 with the message when a prerequisite is missing', async () => {
    const result = await runSpeed(['https://example.com/'], {
      load: async () => ({
        error: `Lighthouse is not installed\n  ${INSTALL_LINE}`,
      }),
      serve,
    })
    expect(result).toMatchObject({ code: 2 })
    expect(result.err).toContain(INSTALL_LINE)
  })
})
