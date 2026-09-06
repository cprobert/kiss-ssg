import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import {
  DEFAULTS,
  NOISE_FLOOR,
  SCENARIOS,
  buildFixture,
  compare,
  fixturePlan,
  formatRow,
  parseArgs,
  resolveSiteEntry,
  scenariosToRun,
  summariseReports,
  recordTarget,
  stats,
  summarise,
} from '../../scripts/bench.mjs'

describe('parseArgs', () => {
  it('returns the defaults for an empty argv', () => {
    expect(parseArgs([])).toEqual(DEFAULTS)
  })

  it('parses a comma-separated sweep into numbers', () => {
    expect(parseArgs(['--pages=10,100,1000']).pages).toEqual([10, 100, 1000])
  })

  it('parses a scalar number', () => {
    expect(parseArgs(['--runs=9']).runs).toBe(9)
  })

  it('treats a bare flag as true', () => {
    expect(parseArgs(['--loud']).loud).toBe(true)
  })

  it('lets --flag=false switch a flag back off', () => {
    expect(parseArgs(['--loud=false']).loud).toBe(false)
  })

  it('parses a string option', () => {
    expect(parseArgs(['--json=out.json']).json).toBe('out.json')
  })

  it('parses a scenario list', () => {
    expect(parseArgs(['--scenario=scan,watch']).scenario).toEqual([
      'scan',
      'watch',
    ])
  })

  // A typo that silently benchmarks the defaults is worse than a crash: the
  // numbers look plausible and answer a question nobody asked.
  it('rejects an unknown option', () => {
    expect(() => parseArgs(['--pagez=10'])).toThrow(/unknown option/)
  })

  it('rejects an unknown scenario', () => {
    expect(() => parseArgs(['--scenario=scan,nope'])).toThrow(
      /unknown scenario: nope/,
    )
  })

  it('rejects a value-less option that needs one', () => {
    expect(() => parseArgs(['--runs'])).toThrow(/--runs needs a value/)
  })

  it('rejects a non-positive page count', () => {
    expect(() => parseArgs(['--pages=0'])).toThrow(/positive/)
    expect(() => parseArgs(['--pages=abc'])).toThrow(/positive/)
  })

  it('rejects a non-positive run count', () => {
    expect(() => parseArgs(['--runs=0'])).toThrow(
      /--runs must be a positive number/,
    )
  })

  it('every advertised scenario is reachable', () => {
    expect(parseArgs([`--scenario=${SCENARIOS.join(',')}`]).scenario).toEqual(
      SCENARIOS,
    )
  })
})

describe('stats', () => {
  it('reports the median of an odd sample', () => {
    expect(stats([5, 1, 3])).toEqual({ n: 3, min: 1, median: 3, max: 5 })
  })

  it('averages the two middle values of an even sample', () => {
    expect(stats([1, 2, 3, 4]).median).toBe(2.5)
  })

  // The median is the whole reason this is not a mean: one 900ms GC pause in
  // five runs must not invent a regression.
  it('is not dragged by a single outlier', () => {
    expect(stats([10, 10, 10, 10, 900]).median).toBe(10)
  })

  it('drops non-finite samples', () => {
    expect(stats([1, null, 3, undefined, NaN])).toEqual({
      n: 2,
      min: 1,
      median: 2,
      max: 3,
    })
  })

  it('returns null when nothing is measurable', () => {
    expect(stats([])).toBeNull()
    expect(stats([null, null])).toBeNull()
  })
})

describe('compare', () => {
  const at = (median) => ({ median })

  it('calls a big drop faster', () => {
    const d = compare(at(50), at(100))
    expect(d.verdict).toBe('faster')
    expect(d.ratio).toBeCloseTo(-0.5)
  })

  it('calls a big rise slower', () => {
    expect(compare(at(150), at(100)).verdict).toBe('slower')
  })

  // Reporting a 2% move as a win is how a perf branch talks itself into
  // changes that did nothing.
  it('calls a move inside the noise floor the same', () => {
    expect(compare(at(103), at(100)).verdict).toBe('same')
    expect(compare(at(97), at(100)).verdict).toBe('same')
  })

  it('takes the noise floor as an argument', () => {
    expect(compare(at(103), at(100), 0.01).verdict).toBe('slower')
  })

  it('has a noise floor big enough to cover ordinary jitter', () => {
    expect(NOISE_FLOOR).toBeGreaterThanOrEqual(0.02)
  })

  it('returns null without a baseline to compare against', () => {
    expect(compare(at(50), null)).toBeNull()
    expect(compare(at(50), {})).toBeNull()
  })
})

describe('formatRow', () => {
  const s = { n: 3, min: 10, median: 12, max: 20 }

  it('renders the three figures without a delta column', () => {
    const row = formatRow('build', s)
    expect(row).toContain('build')
    expect(row).toContain('12.0ms')
    expect(row).not.toMatch(/[↓↑=]/)
  })

  it('marks an improvement with a down arrow and a percentage', () => {
    const row = formatRow('build', s, { ratio: -0.25, verdict: 'faster' })
    expect(row).toContain('↓')
    expect(row).toContain('-25.0%')
  })

  it('signs a regression positively', () => {
    expect(formatRow('build', s, { ratio: 0.25, verdict: 'slower' })).toContain(
      '↑ +25.0%',
    )
  })

  it('drops the decimal on figures at or above 100ms', () => {
    expect(formatRow('build', { ...s, median: 250 })).toContain('250ms')
  })
})

describe('fixturePlan', () => {
  it('produces exactly the requested number of pages', () => {
    expect(fixturePlan(37)).toHaveLength(37)
  })

  it('gives every page a distinct view path', () => {
    const views = fixturePlan(200).map((p) => p.view)
    expect(new Set(views).size).toBe(200)
  })

  // A flat pages/ folder never exercises the `root` climb or the path
  // derivation, so a fixture that produced one would measure the easy case.
  it('spreads pages across nested sections', () => {
    const sections = new Set(fixturePlan(100).map((p) => p.section))
    expect(sections.size).toBeGreaterThan(1)
    expect([...sections].every((s) => s.startsWith('section-'))).toBe(true)
  })

  it('is deterministic for a given page count', () => {
    expect(fixturePlan(50)).toEqual(fixturePlan(50))
  })

  it('handles a single page without dividing by zero', () => {
    expect(fixturePlan(1)).toEqual([
      expect.objectContaining({ section: 'section-0', name: 'page-0' }),
    ])
  })
})

describe('buildFixture', () => {
  let dir
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }))

  const make = (pages) => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-bench-'))
    buildFixture(dir, pages)
    return dir
  }

  it('writes a view and two models per page, plus the shared chrome', () => {
    const d = make(4)
    for (const page of fixturePlan(4)) {
      expect(fs.existsSync(path.join(d, 'src/pages', page.view))).toBe(true)
      expect(fs.existsSync(path.join(d, `src/models/${page.name}.json`))).toBe(
        true,
      )
      expect(
        fs.existsSync(path.join(d, `src/models/items/${page.name}.json`)),
      ).toBe(true)
    }
    expect(fs.existsSync(path.join(d, 'src/layouts/layout.hbs'))).toBe(true)
    expect(fs.existsSync(path.join(d, 'src/partials/note.md'))).toBe(true)
  })

  // The fan-out view must sit outside pages/, or .scan() would pick it up and
  // the two scenarios would stop measuring different things.
  it('keeps the fan-out view out of the scanned pages folder', () => {
    const d = make(3)
    expect(fs.existsSync(path.join(d, 'src/views/item.hbs'))).toBe(true)
    expect(fs.existsSync(path.join(d, 'src/pages/item.hbs'))).toBe(false)
  })

  it('emits valid JSON models', () => {
    const d = make(2)
    const model = JSON.parse(
      fs.readFileSync(path.join(d, 'src/models/page-1.json'), 'utf8'),
    )
    expect(model).toMatchObject({ title: 'Page 1', meta: { index: 1 } })
    expect(model.items).toHaveLength(6)
  })

  it('is a no-op when the fixture on disk already matches', () => {
    const d = make(3)
    const view = path.join(d, 'src/pages', fixturePlan(3)[0].view)
    const before = fs.statSync(view).mtimeMs
    buildFixture(d, 3)
    expect(fs.statSync(view).mtimeMs).toBe(before)
  })

  it('regenerates from scratch when the page count changes', () => {
    const d = make(12)
    buildFixture(d, 3)
    expect(fs.existsSync(path.join(d, 'src/pages/section-9/page-11.hbs'))).toBe(
      false,
    )
    expect(fs.readdirSync(path.join(d, 'src/models')).length).toBe(4)
  })
})

describe('summarise', () => {
  it('summarises each phase present in the samples', () => {
    const summary = summarise([
      { build: 10, total: 20 },
      { build: 30, total: 40 },
    ])
    expect(summary.build).toMatchObject({ n: 2, median: 20 })
    expect(summary.total).toMatchObject({ n: 2, median: 30 })
  })

  it('omits a phase no sample measured', () => {
    expect(summarise([{ build: 10 }])).not.toHaveProperty('rerender')
  })

  // The table reads top-down as the build actually happens; an object with the
  // phases in sample order would shuffle between scenarios.
  it('orders phases by the pipeline, not by sample key order', () => {
    const summary = summarise([{ total: 3, import: 2, process: 1 }])
    expect(Object.keys(summary)).toEqual(['process', 'import', 'total'])
  })
})

describe('recordTarget', () => {
  const missing = () => false
  const present = () => true

  it('writes wherever --json points, baseline or not', () => {
    expect(recordTarget({ json: 'a.json', baseline: 'b.json' }, present)).toBe(
      'a.json',
    )
  })

  it('bootstraps a baseline that does not exist yet', () => {
    expect(recordTarget({ json: null, baseline: 'b.json' }, missing)).toBe(
      'b.json',
    )
  })

  // The one rule that matters: a comparison run must never quietly rewrite the
  // number it is being judged against.
  it('never overwrites an existing baseline', () => {
    expect(recordTarget({ json: null, baseline: 'b.json' }, present)).toBeNull()
  })

  it('writes nothing when neither option is given', () => {
    expect(recordTarget({ json: null, baseline: null }, missing)).toBeNull()
  })
})

describe('resolveSiteEntry', () => {
  it('prefers an explicitly named entry over the package script', () => {
    expect(
      resolveSiteEntry({ scripts: { build: 'node site.js' } }, 'other.js'),
    ).toBe('other.js')
  })

  it('reads a bare `node <script>` build script', () => {
    expect(resolveSiteEntry({ scripts: { build: 'node build.js' } })).toBe(
      'build.js',
    )
  })

  it('tolerates surrounding whitespace', () => {
    expect(resolveSiteEntry({ scripts: { build: '  node build.js  ' } })).toBe(
      'build.js',
    )
  })

  // Half-parsing a compound command would silently benchmark the wrong thing.
  // Better to stop and make the operator name the script.
  it.each([
    'node build.js && node other.js',
    'NODE_ENV=production node build.js',
    'node build.js | tee log',
    'npm run something',
  ])('refuses to guess at %s', (build) => {
    expect(resolveSiteEntry({ scripts: { build } })).toBeNull()
  })

  it('returns null when there is no package.json at all', () => {
    expect(resolveSiteEntry(null)).toBeNull()
    expect(resolveSiteEntry({})).toBeNull()
  })
})

describe('summariseReports', () => {
  const report = (over = {}) => ({
    ok: true,
    duration: 100,
    pages: [{}, {}],
    assets: [{}],
    failures: [],
    ...over,
  })
  const lines = (...rs) => rs.map((r) => JSON.stringify(r))

  it('sums a single build report', () => {
    expect(summariseReports(lines(report()))).toEqual({
      builds: 1,
      engine: 100,
      pages: 2,
      assets: 1,
      failures: 0,
      ok: true,
    })
  })

  // A site that builds several Kiss instances (per-version outputs) must be
  // summed, not reported as whichever build finished last.
  it('sums across every instance a site built', () => {
    const s = summariseReports(lines(report(), report({ duration: 50 })))
    expect(s).toMatchObject({ builds: 2, engine: 150, pages: 4 })
  })

  it('is not ok when any instance failed', () => {
    const s = summariseReports(
      lines(report(), report({ ok: false, failures: [{}, {}] })),
    )
    expect(s.ok).toBe(false)
    expect(s.failures).toBe(2)
  })

  it('skips blank and unparseable lines', () => {
    expect(
      summariseReports(['', '  ', 'not json', ...lines(report())]),
    ).toMatchObject({ builds: 1 })
  })

  it('returns null when the run produced no report at all', () => {
    expect(summariseReports([])).toBeNull()
    expect(summariseReports(['', 'garbage'])).toBeNull()
  })

  it('tolerates a report missing its optional arrays', () => {
    expect(summariseReports(lines({ ok: true, duration: 7 }))).toMatchObject({
      builds: 1,
      engine: 7,
      pages: 0,
      assets: 0,
    })
  })
})

describe('scenariosToRun', () => {
  const opts = { site: [], scenario: ['scan', 'watch'] }

  it('runs the fixture sweep when no site is named', () => {
    expect(scenariosToRun(opts, false)).toEqual(['scan', 'watch'])
  })

  // Naming real sites means you want those, not a fixture sweep alongside them.
  it('skips the fixture sweep when sites are named', () => {
    expect(scenariosToRun({ ...opts, site: ['../a-site'] }, false)).toEqual([])
  })

  it('runs both when scenarios were asked for explicitly too', () => {
    expect(scenariosToRun({ ...opts, site: ['../a-site'] }, true)).toEqual([
      'scan',
      'watch',
    ])
  })
})
