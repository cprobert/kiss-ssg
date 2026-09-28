import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import { CHECKS, extractPageFacts, auditBuild } from '../../lib/audit.js'
import { reportedPath } from '../../lib/build-report.js'

// A finished page, minified the way KissPage writes it: every fact the audit
// asks for is present, so a test that breaks one thing sees one finding.
const PAGE = [
  '<!doctype html><html lang="en"><head>',
  '<title>  Shelf &amp; Co\n  — Home </title>',
  '<meta name="description" content="Books &amp; more">',
  '<meta property="og:image" content="https://site.example/og.png">',
  '<link rel="canonical" href="https://site.example/">',
  '<link rel="shortcut icon" href="/favicon.png">',
  '</head><body>',
  '<h1>Shelf</h1><h2>New</h2><h3>Fiction</h3><h2>Old</h2>',
  '<img src="/a.jpg" alt=""><img src="/b.jpg"><img alt="c">',
  '<img data-alt="x" src="/d.jpg">',
  '</body></html>',
].join('')

describe('CHECKS', () => {
  it('is the frozen, ordered public vocabulary', () => {
    expect(CHECKS).toEqual([
      'title-missing',
      'title-duplicate',
      'description-missing',
      'description-duplicate',
      'og-image-missing',
      'og-image-relative',
      'canonical-missing',
      'img-alt-missing',
      'h1-count',
      'heading-skip',
      'favicon-missing',
      'not-found-missing',
      'site-url-local',
      'debug-dump',
      'stray-file',
      'console-log',
    ])
    expect(Object.isFrozen(CHECKS)).toBe(true)
  })
})

describe('extractPageFacts', () => {
  it('reads every fact from a finished page', () => {
    expect(extractPageFacts(PAGE, 'public/index.html')).toEqual({
      html: true,
      title: 'Shelf & Co — Home',
      description: 'Books & more',
      ogImage: 'https://site.example/og.png',
      canonical: 'https://site.example/',
      icon: true,
      imgMissingAlt: ['/b.jpg', '/d.jpg'],
      headings: [1, 2, 3, 2],
    })
  })

  it('decides html by extension first, then by the bytes', () => {
    // A .json or .xml output is never audited as a page, whatever it carries.
    expect(extractPageFacts(PAGE, 'public/feed.xml').html).toBe(false)
    expect(extractPageFacts(PAGE, 'public/data.json').html).toBe(false)
    expect(extractPageFacts(PAGE, 'public/old.HTM').html).toBe(true)
    // An .html fragment with no document around it is not a page either.
    expect(extractPageFacts('<p>hi</p>', 'public/frag.html').html).toBe(false)
    expect(extractPageFacts('<body><p>hi</p></body>', 'x.html').html).toBe(true)
  })

  it('reports absent facts as null, false and empty', () => {
    expect(extractPageFacts('<html><body></body></html>', 'a.html')).toEqual({
      html: true,
      title: null,
      description: null,
      ogImage: null,
      canonical: null,
      icon: false,
      imgMissingAlt: [],
      headings: [],
    })
  })

  it("keeps an empty title as '' so it is told apart from a missing one", () => {
    expect(
      extractPageFacts('<html><title> </title></html>', 'a.html').title,
    ).toBe('')
  })

  it('never counts a heading inside a script, template or svg body', () => {
    const facts = extractPageFacts(
      [
        '<html><body><h1>Real</h1>',
        '<script>document.body.innerHTML = "<h1>Not</h1><h4>x</h4>"</script>',
        '<template><h1>Row</h1><h5>cell</h5></template>',
        '<svg viewBox="0 0 1 1"><title>Logo</title></svg>',
        '<style>h1::before{content:"<h1>"}</style>',
        '<!-- <h1>old</h1> -->',
        '<h2>Also real</h2></body></html>',
      ].join(''),
      'a.html',
    )
    expect(facts.headings).toEqual([1, 2])
  })

  it('never takes an svg <title> as the page title', () => {
    const facts = extractPageFacts(
      '<html><body><svg><title>Icon</title></svg></body></html>',
      'a.html',
    )
    expect(facts.title).toBeNull()
  })

  it('counts alt="" and a bare alt as present', () => {
    const facts = extractPageFacts(
      '<html><img src="/a.png" alt=""><img src="/b.png" alt><img src="/c.png" ALT="C"></html>',
      'a.html',
    )
    expect(facts.imgMissingAlt).toEqual([])
  })

  it("records an <img> with no src and no alt as ''", () => {
    expect(
      extractPageFacts('<html><img class="x"></html>', 'a.html').imgMissingAlt,
    ).toEqual([''])
  })

  it('accepts og:image through name= as well as property=', () => {
    expect(
      extractPageFacts(
        '<html><meta content="/og.png" name="og:image"></html>',
        'a.html',
      ).ogImage,
    ).toBe('/og.png')
  })

  it('finds icon as one token of rel, and canonical by its rel token', () => {
    const facts = extractPageFacts(
      '<html><link href="/c" rel="Canonical"><link rel="apple-touch-icon" href="/t.png"></html>',
      'a.html',
    )
    expect(facts.canonical).toBe('/c')
    // apple-touch-icon is a different token, not an icon.
    expect(facts.icon).toBe(false)
  })
})

// Builds the facts of a finished page and lets a test break one thing.
function facts(overrides = {}) {
  return {
    html: true,
    title: 'Title',
    description: 'Description',
    ogImage: 'https://site.example/og.png',
    canonical: 'https://site.example/',
    icon: true,
    imgMissingAlt: [],
    headings: [1, 2],
    ...overrides,
  }
}

let n = 0
function page(overrides = {}, extra = {}) {
  n++
  return {
    buildTo: `public/p${n}.html`,
    facts: facts({
      title: `Title ${n}`,
      description: `Description ${n}`,
      ...overrides,
    }),
    canonicalElsewhere: false,
    siteUrl: null,
    ...extra,
  }
}

/** @type {string[]} */
const temps = []
afterEach(() => {
  for (const dir of temps.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})

// A real build folder on disk, returned with forward slashes the way the
// engine hands `_writeRoot` over.
function buildFolder(files = { '404.html': '<html></html>' }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-audit-'))
  temps.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const target = path.join(dir, ...rel.split('/'))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  return dir.replace(/\\/g, '/')
}

function audit(options = {}) {
  return auditBuild({
    pages: [],
    buildDir: buildFolder(),
    siteUrl: null,
    ignore: [],
    ownsFolder: true,
    debugWritten: false,
    ...options,
  })
}

const only = (result, check) => result.findings.filter((f) => f.check === check)

describe('auditBuild — a finished site', () => {
  it('finds nothing on a finished site', () => {
    const result = audit({ pages: [page(), page()] })
    expect(result).toEqual({
      checked: 2,
      ignored: [],
      skipped: [],
      findings: [],
    })
  })

  it('counts only html pages as checked, and audits nothing else', () => {
    const feed = page({ html: false, title: null, headings: [] })
    const result = audit({ pages: [page(), feed] })
    expect(result.checked).toBe(1)
    expect(result.findings).toEqual([])
  })
})

describe('auditBuild — per-page checks', () => {
  it('title-missing fires on null and empty, not on a title', () => {
    const a = page({ title: null })
    const b = page({ title: '' })
    const result = audit({ pages: [a, b, page()] })
    expect(only(result, 'title-missing')).toEqual([
      { check: 'title-missing', page: a.buildTo, detail: null },
      { check: 'title-missing', page: b.buildTo, detail: null },
    ])
  })

  it('title-duplicate fires once per page that shares a title', () => {
    const a = page({ title: 'Same' })
    const b = page({ title: 'Same' })
    const result = audit({ pages: [a, b, page()] })
    expect(only(result, 'title-duplicate')).toEqual([
      { check: 'title-duplicate', page: a.buildTo, detail: 'Same' },
      { check: 'title-duplicate', page: b.buildTo, detail: 'Same' },
    ])
  })

  it('title-duplicate never pairs two empty titles', () => {
    const result = audit({ pages: [page({ title: '' }), page({ title: '' })] })
    expect(only(result, 'title-duplicate')).toEqual([])
  })

  it('description-missing and description-duplicate', () => {
    const a = page({ description: null })
    const b = page({ description: 'Dup' })
    const c = page({ description: 'Dup' })
    const result = audit({ pages: [a, b, c, page()] })
    expect(only(result, 'description-missing')).toEqual([
      { check: 'description-missing', page: a.buildTo, detail: null },
    ])
    expect(only(result, 'description-duplicate')).toEqual([
      { check: 'description-duplicate', page: b.buildTo, detail: 'Dup' },
      { check: 'description-duplicate', page: c.buildTo, detail: 'Dup' },
    ])
  })

  it('excludes a canonicalElsewhere page from the duplicate checks only', () => {
    const a = page({ title: 'Same', description: 'Dup' })
    const b = page(
      { title: 'Same', description: 'Dup', headings: [2] },
      { canonicalElsewhere: true },
    )
    const result = audit({ pages: [a, b] })
    expect(only(result, 'title-duplicate')).toEqual([])
    expect(only(result, 'description-duplicate')).toEqual([])
    // Every other check still runs on it.
    expect(only(result, 'h1-count')).toEqual([
      { check: 'h1-count', page: b.buildTo, detail: '0' },
    ])
  })

  it('og-image-missing and og-image-relative', () => {
    const a = page({ ogImage: null })
    const b = page({ ogImage: '' })
    const c = page({ ogImage: '/og.png' })
    const d = page({ ogImage: '//cdn.example/og.png' })
    const e = page({ ogImage: 'http://site.example/og.png' })
    const result = audit({ pages: [a, b, c, d, e] })
    expect(only(result, 'og-image-missing').map((f) => f.page)).toEqual([
      a.buildTo,
      b.buildTo,
    ])
    expect(only(result, 'og-image-relative')).toEqual([
      { check: 'og-image-relative', page: c.buildTo, detail: '/og.png' },
      {
        check: 'og-image-relative',
        page: d.buildTo,
        detail: '//cdn.example/og.png',
      },
    ])
  })

  it('canonical-missing fires only when the page has a siteUrl', () => {
    const withUrl = page(
      { canonical: null },
      { siteUrl: 'https://site.example' },
    )
    const without = page({ canonical: null })
    const result = audit({ pages: [withUrl, without] })
    expect(only(result, 'canonical-missing')).toEqual([
      { check: 'canonical-missing', page: withUrl.buildTo, detail: null },
    ])
  })

  it('img-alt-missing fires once per image, detail the src', () => {
    const a = page({ imgMissingAlt: ['/x.png', '/y.png'] })
    const result = audit({ pages: [a, page()] })
    expect(only(result, 'img-alt-missing')).toEqual([
      { check: 'img-alt-missing', page: a.buildTo, detail: '/x.png' },
      { check: 'img-alt-missing', page: a.buildTo, detail: '/y.png' },
    ])
  })

  it('h1-count fires on none and on two, detail the count', () => {
    const none = page({ headings: [2] })
    const two = page({ headings: [1, 2, 1] })
    const result = audit({ pages: [none, two, page()] })
    expect(only(result, 'h1-count')).toEqual([
      { check: 'h1-count', page: none.buildTo, detail: '0' },
      { check: 'h1-count', page: two.buildTo, detail: '2' },
    ])
  })

  it('heading-skip reports the first skip only, and not a first heading', () => {
    const skip = page({ headings: [1, 2, 4, 6] })
    const firstDeep = page({ headings: [3, 1, 2] })
    const backUp = page({ headings: [1, 2, 3, 4, 2, 3] })
    const result = audit({ pages: [skip, firstDeep, backUp] })
    expect(only(result, 'heading-skip')).toEqual([
      { check: 'heading-skip', page: skip.buildTo, detail: 'h2 -> h4' },
    ])
  })
})

describe('auditBuild — site-level checks', () => {
  it('favicon-missing fires with no icon link and no favicon.ico', () => {
    const result = audit({ pages: [page({ icon: false })] })
    expect(only(result, 'favicon-missing')).toEqual([
      { check: 'favicon-missing', page: null, detail: null },
    ])
  })

  it('favicon-missing is satisfied by one page with an icon', () => {
    const result = audit({ pages: [page({ icon: false }), page()] })
    expect(only(result, 'favicon-missing')).toEqual([])
  })

  it('favicon-missing is satisfied by favicon.ico at the build root', () => {
    const buildDir = buildFolder({ '404.html': 'x', 'favicon.ico': 'x' })
    const result = audit({ pages: [page({ icon: false })], buildDir })
    expect(only(result, 'favicon-missing')).toEqual([])
  })

  it('not-found-missing fires without 404.html', () => {
    const result = audit({ pages: [page()], buildDir: buildFolder({}) })
    expect(only(result, 'not-found-missing')).toEqual([
      { check: 'not-found-missing', page: null, detail: null },
    ])
  })

  it('not-found-missing says so when the 404 view went to 404/index.html', () => {
    const buildDir = buildFolder({ '404/index.html': '<html></html>' })
    const result = audit({ pages: [page()], buildDir })
    expect(only(result, 'not-found-missing')).toEqual([
      {
        check: 'not-found-missing',
        page: null,
        detail: '404/index.html exists — hosts serve /404.html',
      },
    ])
  })

  it('checked === 0 suppresses favicon-missing and not-found-missing', () => {
    const feed = page({ html: false, icon: false })
    const result = audit({ pages: [feed], buildDir: buildFolder({}) })
    expect(result.checked).toBe(0)
    expect(result.findings).toEqual([])
  })

  it.each([
    'http://localhost:8080',
    'http://127.0.0.1:3000/',
    'http://0.0.0.0',
    'http://[::1]:8080',
    'https://shop.localhost',
    'https://mysite.local',
    'https://mysite.test',
    'https://mysite.invalid',
    'https://deploy-preview-42--mysite.netlify.app',
    'https://mysite-git-feature-me.vercel.app',
  ])('site-url-local fires on %s', (siteUrl) => {
    const result = audit({ pages: [page()], siteUrl })
    expect(only(result, 'site-url-local')).toEqual([
      { check: 'site-url-local', page: null, detail: siteUrl },
    ])
  })

  it.each([
    'https://site.example',
    'https://docs.example.com/guide/',
    'https://mysite.netlify.app',
    'https://mysite.vercel.app',
    'https://localhost.example.com',
    'https://site.contest',
  ])('site-url-local does not fire on %s', (siteUrl) => {
    const result = audit({ pages: [page()], siteUrl })
    expect(only(result, 'site-url-local')).toEqual([])
  })

  it('site-url-local does not fire with no siteUrl', () => {
    expect(only(audit({ pages: [page()] }), 'site-url-local')).toEqual([])
  })

  it('site-url-local reports a per-page override with that page', () => {
    const local = page({}, { siteUrl: 'http://localhost:4000' })
    const inherited = page({}, { siteUrl: 'https://site.example' })
    const result = audit({
      pages: [local, inherited],
      siteUrl: 'https://site.example',
    })
    expect(only(result, 'site-url-local')).toEqual([
      {
        check: 'site-url-local',
        page: local.buildTo,
        detail: 'http://localhost:4000',
      },
    ])
  })

  it('site-url-local reports the instance once, not once per page', () => {
    const result = audit({
      pages: [
        page({}, { siteUrl: 'http://localhost' }),
        page({}, { siteUrl: 'http://localhost' }),
      ],
      siteUrl: 'http://localhost',
    })
    expect(only(result, 'site-url-local')).toEqual([
      { check: 'site-url-local', page: null, detail: 'http://localhost' },
    ])
  })

  it('debug-dump fires from state, naming debug.json in the build folder', () => {
    const buildDir = buildFolder()
    const result = audit({ pages: [page()], buildDir, debugWritten: true })
    expect(only(result, 'debug-dump')).toEqual([
      { check: 'debug-dump', page: `${buildDir}/debug.json`, detail: null },
    ])
    expect(only(audit({ pages: [page()] }), 'debug-dump')).toEqual([])
  })

  it('stray-file finds the leftovers a host would serve', () => {
    const buildDir = buildFolder({
      '404.html': 'x',
      'css/site.css': 'x',
      'css/site.css.map': 'x',
      '.DS_Store': 'x',
      'deep/nested/Thumbs.db': 'x',
      '.env.production': 'x',
      'build.log': 'x',
      'index.html.bak': 'x',
      '.index.html.swp': 'x',
      'notes.txt~': 'x',
      'img/.hidden': 'x',
    })
    const result = audit({ pages: [page()], buildDir })
    expect(only(result, 'stray-file').map((f) => f.page)).toEqual(
      [
        '.DS_Store',
        '.env.production',
        '.index.html.swp',
        'build.log',
        'css/site.css.map',
        'deep/nested/Thumbs.db',
        'img/.hidden',
        'index.html.bak',
        'notes.txt~',
      ].map((rel) => `${buildDir}/${rel}`),
    )
    expect(only(result, 'stray-file').every((f) => f.detail === null)).toBe(
      true,
    )
  })

  it('stray-file exempts .well-known/, .nojekyll and .htaccess', () => {
    const buildDir = buildFolder({
      '404.html': 'x',
      '.well-known/.security': 'x',
      '.well-known/security.txt': 'x',
      '.nojekyll': '',
      '.htaccess': 'x',
      'sub/.htaccess': 'x',
    })
    const result = audit({ pages: [page()], buildDir })
    expect(only(result, 'stray-file')).toEqual([])
  })

  it('console-log counts occurrences in shipped scripts', () => {
    const buildDir = buildFolder({
      '404.html': 'x',
      'js/app.js': 'console.log(1);f();console.log(2)',
      'js/clean.js': 'console.error(1)',
    })
    const result = audit({ pages: [page()], buildDir })
    expect(only(result, 'console-log')).toEqual([
      { check: 'console-log', page: `${buildDir}/js/app.js`, detail: '2' },
    ])
  })

  it('console-log leaves minified, vendored and node_modules scripts alone', () => {
    const buildDir = buildFolder({
      '404.html': 'x',
      'js/lib.min.js': 'console.log(1)',
      // `assets.hash` renames it before the audit runs (Codex review, 2026-09-28).
      'js/lib.min.a1b2c3d4.js': 'console.log(1)',
      'js/vendor/lib.js': 'console.log(1)',
      'vendor/lib.js': 'console.log(1)',
      'node_modules/x/index.js': 'console.log(1)',
      'js/app.json': 'console.log(1)',
    })
    const result = audit({ pages: [page()], buildDir })
    expect(only(result, 'console-log')).toEqual([])
  })

  it('reports walk paths with forward slashes, never a backslash', () => {
    const buildDir = buildFolder({
      '404.html': 'x',
      'a/b/c/site.css.map': 'x',
      'a/b/app.js': 'console.log(1)',
    })
    const result = audit({ pages: [page()], buildDir })
    const walked = result.findings.filter((f) =>
      ['stray-file', 'console-log'].includes(f.check),
    )
    expect(walked.map((f) => f.page)).toEqual([
      `${buildDir}/a/b/c/site.css.map`,
      `${buildDir}/a/b/app.js`,
    ])
    for (const f of walked) expect(f.page).not.toContain('\\')
  })

  // `_writeRoot` is the author's `folders.build` (plus a staging suffix), in
  // whatever separators they wrote, and `reportedPath` strips the staging
  // prefix only when it matches that string exactly and is followed by `/`.
  // Rewriting the root's separators would break the match and leak the
  // staging folder's name into the report. Platform-independent: the folder
  // does not exist, and `debug-dump` is decided from state.
  it('keeps the build folder exactly as given, so the report can map it out of staging', () => {
    const real = 'C:\\site\\public'
    const staging = `${real}.kiss-staging-1`
    const result = audit({ buildDir: staging, debugWritten: true })
    const [finding] = only(result, 'debug-dump')
    expect(finding.page).toBe(`${staging}/debug.json`)
    expect(reportedPath(finding.page, real, staging)).toBe(`${real}/debug.json`)
  })
})

describe('auditBuild — ownership, ignore and order', () => {
  it('ownsFolder: false skips the three walk checks and says so', () => {
    const buildDir = buildFolder({
      'x.map': 'x',
      'app.js': 'console.log(1)',
    })
    const result = audit({
      pages: [page({ icon: false })],
      buildDir,
      ownsFolder: false,
    })
    expect(result.skipped).toEqual([
      'not-found-missing',
      'stray-file',
      'console-log',
    ])
    // The rest still run: the favicon check reads one fixed path, not the walk.
    expect(result.findings).toEqual([
      { check: 'favicon-missing', page: null, detail: null },
    ])
  })

  it('ignore removes a check and is reported back sorted', () => {
    const result = audit({
      pages: [page({ title: null, description: null })],
      buildDir: buildFolder({}),
      ignore: ['title-missing', 'not-found-missing'],
    })
    expect(result.ignored).toEqual(['not-found-missing', 'title-missing'])
    expect(result.findings.map((f) => f.check)).toEqual(['description-missing'])
  })

  it('an ignored walk check is listed as ignored, not skipped', () => {
    const result = audit({
      pages: [page()],
      ownsFolder: false,
      ignore: ['stray-file'],
    })
    expect(result.ignored).toEqual(['stray-file'])
    expect(result.skipped).toEqual(['not-found-missing', 'console-log'])
  })

  it('sorts by check in CHECKS order, then page, then detail', () => {
    const b = {
      ...page({ title: null, headings: [] }),
      buildTo: 'public/b.html',
    }
    const a = {
      ...page({ title: null, imgMissingAlt: ['/z.png', '/a.png'] }),
      buildTo: 'public/a.html',
    }
    const result = audit({
      pages: [b, a],
      siteUrl: 'http://localhost',
      debugWritten: true,
      buildDir: buildFolder({}),
    })
    expect(result.findings.map((f) => [f.check, f.page, f.detail])).toEqual([
      ['title-missing', 'public/a.html', null],
      ['title-missing', 'public/b.html', null],
      ['img-alt-missing', 'public/a.html', '/a.png'],
      ['img-alt-missing', 'public/a.html', '/z.png'],
      ['h1-count', 'public/b.html', '0'],
      ['not-found-missing', null, null],
      ['site-url-local', null, 'http://localhost'],
      ['debug-dump', expect.stringMatching(/\/debug\.json$/), null],
    ])
  })

  it('treats a missing build folder as an empty one', () => {
    const buildDir = `${buildFolder({})}/not-there`
    const result = audit({ pages: [page()], buildDir })
    expect(result.findings.map((f) => f.check)).toEqual(['not-found-missing'])
  })
})
