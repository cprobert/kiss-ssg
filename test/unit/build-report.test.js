import { describe, it, expect } from 'vitest'
import { buildReport, formatReport } from '../../lib/build-report.js'

const manifest = (entries) => ({ toObject: () => entries })

const page = (view, buildTo) => ({ view, buildTo })
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
    ])
    expect(report.ok).toBe(true)
    expect(report.mode).toBe('build')
    expect(report.buildDir).toBe('./public')
    expect(report.pages).toEqual([
      { view: 'index.hbs', buildTo: './public/index.html', ok: true },
    ])
    expect(report.failures).toEqual([])
    expect(report.assets).toEqual([
      { source: 'css/site.css', target: 'css/site.a1b2c3d4.css' },
    ])
    expect(report.sitemap).toBe('./public/sitemap.xml')
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
      { view: 'index.hbs', buildTo: './public/index.html', ok: true },
      { view: 'about.hbs', buildTo: './public/about.html', ok: false },
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
    })

    expect(report.buildDir).toBe('./public')
    expect(report.pages[0].buildTo).toBe('./public/index.html')
    expect(report.pages[0].ok).toBe(false)
    expect(report.failures[0].buildTo).toBe('./public/index.html')
    expect(report.sitemap).toBe('./public/sitemap.xml')
    expect(report.llms).toBe('./public/llms.txt')
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
    })
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
})
