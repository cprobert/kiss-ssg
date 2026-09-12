import { describe, it, expect } from 'vitest'
import { buildReport, formatReport } from '../../lib/build-report.js'

const manifest = (entries) => ({ toObject: () => entries })

// A stack entry, as `Kiss._preparePage` builds it: the `KissPage` it carries is
// where the report reads the output hash from.
const page = (view, buildTo, hash = null) => ({ view, buildTo, page: { hash } })
const failure = (view, buildTo, message) => ({
  view,
  buildTo,
  error: new Error(message),
})

describe('buildReport', () => {
  it('reports a clean build as ok, in a fixed key order', () => {
    const report = buildReport({
      stack: [page('index.hbs', './public/index.html')],
      failures: [],
      manifest: manifest({ 'css/site.css': 'css/site.a1b2c3d4.css' }),
      buildDir: './public',
      mode: 'build',
      startedAt: Date.now(),
      sitemap: './public/sitemap.xml',
    })

    expect(Object.keys(report)).toEqual([
      'ok',
      'mode',
      'buildDir',
      'duration',
      'pages',
      'failures',
      'assets',
      'sitemap',
      'pipeline',
      'llms',
      'aikb',
      'links',
      'redirects',
      'feed',
    ])
    expect(Object.keys(report.pages[0])).toEqual([
      'view',
      'buildTo',
      'ok',
      'hash',
      'id',
    ])
    expect(report.ok).toBe(true)
    expect(report.mode).toBe('build')
    expect(report.buildDir).toBe('./public')
    expect(report.pages).toEqual([
      {
        view: 'index.hbs',
        buildTo: './public/index.html',
        ok: true,
        hash: null,
        id: null,
      },
    ])
    expect(report.failures).toEqual([])
    expect(report.assets).toEqual([
      { source: 'css/site.css', target: 'css/site.a1b2c3d4.css' },
    ])
    expect(report.sitemap).toBe('./public/sitemap.xml')
  })

  it("carries each page's id, and null for a page that claims none", () => {
    const report = buildReport({
      stack: [
        { ...page('about.hbs', './public/about.html', 'h1'), id: 'about' },
        // An inline template, a `generate: false` page, and a default id two
        // pages arrived at all reach this module with no id on the entry.
        page('<p>inline</p>', './public/snippet-1.html'),
      ],
      failures: [],
      buildDir: './public',
      startedAt: Date.now(),
    })

    expect(report.pages.map((p) => p.id)).toEqual(['about', null])
  })

  it('marks the failed page — and only that page — as not ok', () => {
    const report = buildReport({
      stack: [
        page('index.hbs', './public/index.html'),
        page('about.hbs', './public/about.html'),
      ],
      failures: [
        failure('about.hbs', './public/about.html', 'template not found'),
      ],
      buildDir: './public',
      startedAt: Date.now(),
    })

    expect(report.ok).toBe(false)
    expect(report.pages).toEqual([
      {
        view: 'index.hbs',
        buildTo: './public/index.html',
        ok: true,
        hash: null,
        id: null,
      },
      {
        view: 'about.hbs',
        buildTo: './public/about.html',
        ok: false,
        hash: null,
        id: null,
      },
    ])
    expect(report.failures).toEqual([
      {
        view: 'about.hbs',
        buildTo: './public/about.html',
        message: 'template not found',
      },
    ])
  })

  it('names every path against the real build folder, never the staging one', () => {
    const staging = './public.kiss-staging-123-abcdef'
    const report = buildReport({
      stack: [page('index.hbs', `${staging}/index.html`)],
      failures: [
        failure('index.hbs', `${staging}/index.html`, 'could not render'),
      ],
      buildDir: './public',
      stagingDir: staging,
      mode: 'check',
      startedAt: Date.now(),
      sitemap: `${staging}/sitemap.xml`,
      llms: `${staging}/llms.txt`,
      links: {
        checked: 4,
        broken: [{ page: `${staging}/index.html`, href: '/gone' }],
      },
      redirects: {
        file: `${staging}/_redirects`,
        aliases: 1,
        removed: ['./public/old.html'],
        collisions: [],
        moved: [
          { id: 'about', from: '/about.html', to: '/company/about.html' },
        ],
      },
      feed: `${staging}/feed.xml`,
    })

    expect(report.buildDir).toBe('./public')
    expect(report.pages[0].buildTo).toBe('./public/index.html')
    expect(report.pages[0].ok).toBe(false)
    expect(report.failures[0].buildTo).toBe('./public/index.html')
    expect(report.sitemap).toBe('./public/sitemap.xml')
    expect(report.llms).toBe('./public/llms.txt')
    // The three appended keys are mapped by the same rule: the pages were read
    // back out of the staging folder, which under check mode is gone by the
    // time anyone reads the report.
    expect(report.links.broken[0].page).toBe('./public/index.html')
    expect(report.redirects.file).toBe('./public/_redirects')
    // `moved` is build-relative on both sides, so there is no staging prefix on
    // it to map — it survives the assembly exactly as the module derived it.
    expect(report.redirects.moved).toEqual([
      { id: 'about', from: '/about.html', to: '/company/about.html' },
    ])
    expect(report.feed).toBe('./public/feed.xml')
    expect(JSON.stringify(report)).not.toContain('kiss-staging')
  })

  it('leaves a path outside the staging folder alone', () => {
    const report = buildReport({
      stack: [page('index.hbs', './elsewhere/index.html')],
      buildDir: './public',
      stagingDir: './public.kiss-staging-123-abcdef',
      startedAt: Date.now(),
    })
    expect(report.pages[0].buildTo).toBe('./elsewhere/index.html')
  })

  it('carries a .pages() item failure that never got an output path', () => {
    const report = buildReport({
      stack: [page('stockist.hbs', './public/stockists/one.html')],
      failures: [
        failure('stockist.hbs [item 3: harbour]', null, 'missing address'),
      ],
      buildDir: './public',
      startedAt: Date.now(),
    })

    expect(report.ok).toBe(false)
    expect(report.failures).toEqual([
      {
        view: 'stockist.hbs [item 3: harbour]',
        buildTo: null,
        message: 'missing address',
      },
    ])
    // A failure with no output path names no page, so the pages that did build
    // are still ok.
    expect(report.pages[0].ok).toBe(true)
  })

  it('reports an empty build rather than throwing on it', () => {
    const report = buildReport({ buildDir: './public', startedAt: Date.now() })
    expect(report).toEqual({
      ok: true,
      mode: 'build',
      buildDir: './public',
      duration: expect.any(Number),
      pages: [],
      failures: [],
      assets: [],
      sitemap: null,
      pipeline: [],
      llms: null,
      aikb: null,
      links: null,
      redirects: null,
      feed: null,
    })
  })

  it('reports no scan, no redirects and no feed as null, not as empty', () => {
    // `null` is "this build did not do that piece of work" — a dev build, a
    // site with no alias, a site that never called `.feed()`. A scan that ran
    // and found nothing is `{ checked: N, broken: [] }`, which is a different
    // answer to a different question.
    const report = buildReport({
      stack: [page('index.hbs', './public/index.html')],
      buildDir: './public',
      startedAt: Date.now(),
    })
    expect(report.links).toBeNull()
    expect(report.redirects).toBeNull()
    expect(report.feed).toBeNull()
  })

  it('keeps the three appended keys in their fixed order, after aikb', () => {
    // Relative, not `at(-1)`: the next key appended after these three should
    // move one assertion, not break this one.
    const keys = Object.keys(
      buildReport({ buildDir: './public', startedAt: Date.now() }),
    )
    expect(keys.indexOf('links')).toBe(keys.indexOf('aikb') + 1)
    expect(keys.indexOf('redirects')).toBe(keys.indexOf('links') + 1)
    expect(keys.indexOf('feed')).toBe(keys.indexOf('redirects') + 1)
  })

  it('reports every pipeline step, without the error object', () => {
    const report = buildReport({
      buildDir: './public',
      startedAt: Date.now(),
      pipeline: [
        { name: 'tailwind', ok: true, duration: 42 },
        {
          name: 'icons',
          ok: false,
          duration: 7,
          error: new Error('exit code 1'),
        },
      ],
    })

    // The error stays on the failure entry that names the step; the report
    // itself has to survive JSON.stringify.
    expect(report.pipeline).toEqual([
      { name: 'tailwind', ok: true, duration: 42 },
      { name: 'icons', ok: false, duration: 7 },
    ])
    expect(JSON.parse(JSON.stringify(report)).pipeline).toEqual(report.pipeline)
  })

  it('reports no sitemap as null', () => {
    const report = buildReport({
      stack: [page('index.hbs', './public/index.html')],
      buildDir: './public',
      startedAt: Date.now(),
    })
    expect(report.sitemap).toBeNull()
  })

  it('measures the duration from construction, not from the settle', () => {
    const report = buildReport({
      buildDir: './public',
      startedAt: Date.now() - 50,
    })
    expect(report.duration).toBeGreaterThanOrEqual(50)
  })

  it('elides an inline template rather than reporting a page of markup', () => {
    const template = `<!doctype html><html lang="en"><head><title>x</title>\n<body><p>a very long inline template indeed</p></body></html>`
    const report = buildReport({
      stack: [page(template, './public/snippet-1.html')],
      failures: [failure(template, './public/snippet-1.html', 'boom')],
      buildDir: './public',
      startedAt: Date.now(),
    })
    expect(report.pages[0].view).toBe(
      '<!doctype html><html lang="en"><head><title>x</title>…',
    )
    expect(report.failures[0].view).toBe(report.pages[0].view)
  })

  it('leaves a .pages() item label whole', () => {
    const label =
      'stockists/stockist.hbs [item 12: severn-provisions-portishead]'
    const report = buildReport({
      failures: [failure(label, null, 'missing address')],
      buildDir: './public',
      startedAt: Date.now(),
    })
    expect(report.failures[0].view).toBe(label)
  })

  it('survives a JSON round trip with no Error objects in it', () => {
    const report = buildReport({
      stack: [page('index.hbs', './public/index.html')],
      failures: [failure('index.hbs', './public/index.html', 'boom')],
      manifest: manifest({ 'css/site.css': 'css/site.css' }),
      buildDir: './public',
      startedAt: Date.now(),
    })

    const roundTripped = JSON.parse(JSON.stringify(report))
    expect(roundTripped).toEqual(report)
    // An Error serialises to `{}`, so a report carrying one loses the message
    // exactly where it is needed.
    expect(roundTripped.failures[0].message).toBe('boom')
  })

  it('carries each page\u2019s output hash off the KissPage the stack holds', () => {
    const report = buildReport({
      stack: [
        page('index.hbs', './public/index.html', 'a'.repeat(40)),
        page('about.hbs', './public/about.html', 'b'.repeat(40)),
      ],
      buildDir: './public',
      startedAt: Date.now(),
    })

    expect(report.pages.map((p) => p.hash)).toEqual([
      'a'.repeat(40),
      'b'.repeat(40),
    ])
  })

  it('reports no hash for a page that was never generated', () => {
    // `generate: false` and a page that failed both leave `hash` null on the
    // KissPage \u2014 there are no bytes on disk for it to name.
    const report = buildReport({
      stack: [
        page('skipped.hbs', './public/skipped.html'),
        { view: 'legacy.hbs', buildTo: './public/legacy.html' },
      ],
      buildDir: './public',
      startedAt: Date.now(),
    })

    expect(report.pages.map((p) => p.hash)).toEqual([null, null])
  })

  it('accepts a failure whose error is not an Error', () => {
    const report = buildReport({
      failures: [{ view: 'index.hbs', buildTo: null, error: 'just a string' }],
      buildDir: './public',
      startedAt: Date.now(),
    })
    expect(report.failures[0].message).toBe('just a string')
  })
})

describe('formatReport', () => {
  it('summarises a clean build in one line', () => {
    const report = buildReport({
      stack: [page('index.hbs', './public/index.html')],
      manifest: manifest({ 'css/site.css': 'css/site.css' }),
      buildDir: './public',
      mode: 'check',
      startedAt: Date.now(),
    })
    expect(formatReport(report)).toMatch(
      /^ok \.\/public \(check\) — 1 pages, 0 failed, 1 assets, \d+ms$/,
    )
  })

  it('names each failure under the summary line', () => {
    const report = buildReport({
      stack: [page('index.hbs', './public/index.html')],
      failures: [
        failure('index.hbs', './public/index.html', 'boom'),
        failure('one.hbs [item 2: x]', null, 'missing address'),
      ],
      buildDir: './public',
      startedAt: Date.now(),
    })
    const lines = formatReport(report).split('\n')
    expect(lines[0]).toContain('FAIL ./public')
    expect(lines[0]).toContain('2 failed')
    expect(lines[1]).toBe('  ./public/index.html: boom')
    expect(lines[2]).toBe('  one.hbs [item 2: x]: missing address')
  })

  it('names each broken link, removal and collision under the note lines', () => {
    const report = buildReport({
      stack: [page('index.hbs', './public/index.html')],
      buildDir: './public',
      startedAt: Date.now(),
      aikb: {
        folder: 'AIKB',
        written: false,
        notes: {
          missing: ['AIKB/notes/controllers/stockist.md'],
          dead: [],
          stale: [],
          dangling: [],
        },
        subjects: [],
      },
      links: {
        checked: 12,
        broken: [
          { page: './public/index.html', href: '/news/gone' },
          { page: './public/about.html', href: 'team.html' },
        ],
      },
      redirects: {
        file: './public/_redirects',
        aliases: 2,
        removed: ['./public/news/autumn-2025.html'],
        collisions: ['/about'],
        moved: [
          { id: 'about', from: '/about.html', to: '/company/about.html' },
        ],
      },
    })
    const lines = formatReport(report).split('\n')
    // Under the note findings, which are the advisory lines that came first.
    expect(lines[1]).toBe('  note missing: AIKB/notes/controllers/stockist.md')
    expect(lines.slice(2)).toEqual([
      '  broken link: ./public/index.html -> /news/gone',
      '  broken link: ./public/about.html -> team.html',
      '  removed without redirect: ./public/news/autumn-2025.html',
      // Beside the removal rather than in report-key order: the two are one
      // question — what a rename left behind — and are read together.
      '  moved without redirect: /about.html -> /company/about.html (about)',
      '  alias collides with a page: /about',
    ])
  })

  it('prints nothing extra for a build that ran none of the three', () => {
    const report = buildReport({
      stack: [page('index.hbs', './public/index.html')],
      buildDir: './public',
      startedAt: Date.now(),
    })
    expect(formatReport(report).split('\n')).toHaveLength(1)
  })
})
