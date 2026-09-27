import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import { silentLogger } from '../../lib/logger.js'
import { exitCodeFor } from '../../lib/check.js'
import { CHECKS } from '../../lib/audit.js'
import { makeSite } from '../helpers/site.js'

// A dev build is one of the cases that must report `audit: null`, and binding a
// real livereload port to prove it would be neither necessary nor kind to the
// test run — the links suite's reasoning, and its mock.
vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: () => {},
  }),
}))
const { default: Kiss } = await import('../helpers/kiss.js')

const SITE_URL = 'https://site.example'

// A finished page: every per-page check has what it asks for, the titles and
// descriptions differ because each page fills the `name` block itself, and
// the favicon and 404 page are in the build folder.
const FINISHED = [
  '<!doctype html><html><head>',
  '<title>{{#block "name"}}{{/block}}</title>',
  '<meta name="description" content="All about {{#block "name"}}{{/block}}.">',
  `<meta property="og:image" content="${SITE_URL}/og.png">`,
  '<link rel="canonical" href="{{canonical}}">',
  '</head><body>',
  '{{#block "body"}}{{/block}}',
  '</body></html>',
].join('')

const page = (body, name = '') =>
  `{{#extend "layout"}}{{#content "name"}}${name}{{/content}}{{#content "body"}}${body}{{/content}}{{/extend}}`

const CLEAN = {
  'src/layouts/layout.hbs': FINISHED,
  'src/assets/favicon.ico': 'icon',
  'src/pages/index.hbs': page('<h1>Home</h1><h2>News</h2>', 'Home'),
  'src/pages/about.hbs': page(
    '<h1>About</h1><img src="/team.png" alt="">',
    'About',
  ),
  'src/pages/404.hbs': page('<h1>Not found</h1>', 'Not found'),
}

// The same site, unfinished in the ways a build can see: no `<head>` at all,
// an image with no alt, two h1s, a source map and a `console.log` shipped from
// the assets folder, and no 404 page.
const UNFINISHED = {
  'src/layouts/layout.hbs':
    '<!doctype html><html><body>{{#block "body"}}{{/block}}</body></html>',
  'src/assets/js/app.js': 'console.log("hi")',
  'src/assets/css/site.css.map': '{}',
  'src/pages/index.hbs': page('<h1>Home</h1><h1>Again</h1>'),
  'src/pages/about.hbs': page('<h1>About</h1><img src="/team.png">'),
}

const siteConfig = (site, extra = {}) => ({
  folders: site.folders,
  siteUrl: SITE_URL,
  logger: silentLogger,
  ...extra,
})

let site
let kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
  site = null
})

const build = async (config) => {
  kiss = new Kiss(config).scan().generate()
  await kiss.complete()
  return kiss.report()
}

// The findings the unfinished site must produce, wherever its pages were
// written — named against the folder the site asked for.
const unfinished = (root) => [
  { check: 'title-missing', page: `${root}/about.html`, detail: null },
  { check: 'img-alt-missing', page: `${root}/about.html`, detail: '/team.png' },
  { check: 'h1-count', page: `${root}/index.html`, detail: '2' },
  { check: 'not-found-missing', page: null, detail: null },
  { check: 'stray-file', page: `${root}/css/site.css.map`, detail: null },
  { check: 'console-log', page: `${root}/js/app.js`, detail: '1' },
]

describe('the launch-readiness audit', () => {
  it('audits every written page of a finished site and finds nothing', async () => {
    site = await makeSite(CLEAN)
    const report = await build(siteConfig(site))

    expect(report.audit).toEqual({
      checked: 3,
      ignored: [],
      skipped: [],
      findings: [],
    })
  })

  it('reports what an unfinished site is missing, without touching ok or the exit code', async () => {
    site = await makeSite(UNFINISHED)
    const report = await build(siteConfig(site))

    for (const finding of unfinished(site.build))
      expect(report.audit.findings).toContainEqual(finding)
    // Advisory: a build with every finding above is still a passing build.
    expect(report.ok).toBe(true)
    expect(report.failures).toEqual([])
    expect(exitCodeFor([JSON.parse(JSON.stringify(report))], 0)).toBe(0)
  })

  it('still finds them under KISS_CHECK, named in the real folder', async () => {
    site = await makeSite(UNFINISHED)
    process.env.KISS_CHECK = '1'
    let report
    try {
      report = await build(siteConfig(site))
    } finally {
      delete process.env.KISS_CHECK
    }

    expect(report.mode).toBe('check')
    // The audit ran before the staging folder was discarded, which is the only
    // place the pages ever were under check.
    for (const finding of unfinished(site.build))
      expect(report.audit.findings).toContainEqual(finding)
    expect(JSON.stringify(report.audit)).not.toContain('kiss-staging')
    expect(await site.exists('public')).toBe(false)
  })

  it("still finds them under cleanBuild: 'atomic', after the promotion", async () => {
    site = await makeSite(UNFINISHED)
    const report = await build(siteConfig(site, { cleanBuild: 'atomic' }))

    for (const finding of unfinished(site.build))
      expect(report.audit.findings).toContainEqual(finding)
    expect(JSON.stringify(report.audit)).not.toContain('kiss-staging')
    expect(
      fs.readdirSync(site.root).filter((name) => name.includes('.kiss-')),
    ).toEqual([])
  })

  it('leaves out the checks config.audit.ignore names, and says which', async () => {
    site = await makeSite(UNFINISHED)
    const report = await build(
      siteConfig(site, { audit: { ignore: ['stray-file', 'h1-count'] } }),
    )

    expect(report.audit.ignored).toEqual(['h1-count', 'stray-file'])
    const fired = report.audit.findings.map((finding) => finding.check)
    expect(fired).not.toContain('stray-file')
    expect(fired).not.toContain('h1-count')
    expect(fired).toContain('console-log')
  })

  it('skips the three folder-walk checks under cleanBuild: false, and says so', async () => {
    site = await makeSite(UNFINISHED)
    const report = await build(siteConfig(site, { cleanBuild: false }))

    // The folder holds whatever earlier builds and sibling instances left, so
    // what a walk found there would not be this build's doing.
    expect(report.audit.skipped).toEqual([
      'not-found-missing',
      'stray-file',
      'console-log',
    ])
    const fired = report.audit.findings.map((finding) => finding.check)
    for (const check of report.audit.skipped) expect(fired).not.toContain(check)
    // Every other check still runs.
    expect(fired).toContain('title-missing')
  })

  it('reports a debug.json viewStats() wrote into the build', async () => {
    site = await makeSite(CLEAN)
    kiss = new Kiss(siteConfig(site, { verbose: true }))
      .scan()
      .generate(function () {
        this.viewStats()
      })
    await kiss.complete()

    expect(kiss.report().audit.findings).toEqual([
      { check: 'debug-dump', page: `${site.build}/debug.json`, detail: null },
    ])
  })

  it('logs the counts and one notice per check, in the summary wording', async () => {
    site = await makeSite(UNFINISHED)
    const info = []
    const notices = []
    await build(
      siteConfig(site, {
        logger: {
          ...silentLogger,
          info: (msg) => info.push(String(msg)),
          notice: (msg) => notices.push(String(msg)),
        },
      }),
    )

    // Each page misses title, description, og:image and canonical (4 + 4),
    // index has two h1s and about an image with no alt (2), and the site has
    // no favicon, no 404 page, a source map and a console.log (4).
    expect(info).toContain('Audit: 2 pages, 14 findings')
    expect(notices).toContain(
      `audit stray-file: 1 file (${site.build}/css/site.css.map)`,
    )
    expect(notices).toContain('audit not-found-missing')
  })

  // Every "reports null" case carries its own control: the same site, built
  // the ordinary way, has findings. Without it the assertion would pass against
  // an engine that never audits anything at all.
  const control = async () => {
    const built = new Kiss(siteConfig(site)).scan().generate()
    await built.complete()
    const findings = built.report().audit.findings
    await built.close()
    return findings
  }

  it('reports null for a dev build', async () => {
    site = await makeSite(UNFINISHED)
    expect((await control()).length).toBeGreaterThan(0)

    kiss = new Kiss(siteConfig(site, { dev: true }))
    kiss.watch({ entry: null })
    kiss.scan().generate()
    await kiss.complete()

    expect(kiss.report().audit).toBeNull()
  })

  it('reports null when config.audit.check is false, and for audit: false', async () => {
    site = await makeSite(UNFINISHED)
    expect((await control()).length).toBeGreaterThan(0)

    expect(
      (await build(siteConfig(site, { audit: { check: false } }))).audit,
    ).toBeNull()
    await kiss.close()
    expect((await build(siteConfig(site, { audit: false }))).audit).toBeNull()
  })

  it('reports null for a failed build, whose missing pages would be false findings', async () => {
    site = await makeSite(UNFINISHED)
    expect((await control()).length).toBeGreaterThan(0)

    kiss = new Kiss(siteConfig(site))
      .scan()
      .page({ view: 'missing.hbs' })
      .generate()
    const err = await kiss.complete().catch((e) => e)

    expect(err.report.ok).toBe(false)
    expect(err.report.audit).toBeNull()
  })

  it('names only ids the config can ignore', async () => {
    site = await makeSite(UNFINISHED)
    const report = await build(siteConfig(site))
    for (const { check } of report.audit.findings)
      expect(CHECKS).toContain(check)
  })
})
