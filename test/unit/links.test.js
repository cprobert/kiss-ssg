import { describe, it, expect } from 'vitest'
import {
  extractReferences,
  classifyReference,
  resolveReference,
  checkLinks,
} from '../../lib/links.js'

// A realistic production page: minified (one line, no comments), a layout's
// canonical and stylesheet, a nav, a responsive image, a form, an inline
// script carrying a string that looks exactly like a reference, and a fenced
// `data:` image. The extractor has to find the nine real references and none
// of the decoys.
const PAGE = [
  '<!doctype html><html><head>',
  '<link rel="canonical" href="https://site.example/shelf/">',
  '<link rel="stylesheet" href="../css/site.a1b2c3d4.css">',
  '<script src="/js/app.js?v=1.4.5"></script>',
  '<script>var config = {endpoint: "/api/not-a-reference", img: \'<img src="/decoy.png">\'}</script>',
  '<style>body{background:url(/css/bg.png)}</style>',
  '</head><body>',
  '<a href="/">Home</a><a href="/about">About</a><a href="#top">Top</a>',
  '<a href="mailto:hi@site.example">Mail</a><a href="tel:+441234">Call</a>',
  '<a href="javascript:void(0)">JS</a><a href="">Empty</a>',
  '<img src="/img/hero.jpg" srcset="/img/hero.jpg 640w, /img/hero@2x.jpg 2x" alt="">',
  '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="/lazy.png" alt="">',
  '<iframe src="//cdn.example/embed"></iframe>',
  '<video src="/media/clip.mp4"><source srcset="/media/clip.webm"></video>',
  '<audio src="/media/tune.mp3"></audio>',
  '<form action="/search"></form>',
  '</body></html>',
].join('')

describe('extractReferences', () => {
  it('finds every reference the listed elements carry, and nothing else', () => {
    expect(extractReferences(PAGE)).toEqual([
      '../css/site.a1b2c3d4.css',
      '/',
      '//cdn.example/embed',
      '/about',
      '/img/hero.jpg',
      '/img/hero@2x.jpg',
      '/js/app.js?v=1.4.5',
      '/media/clip.mp4',
      '/media/clip.webm',
      '/media/tune.mp3',
      '/search',
      'https://site.example/shelf/',
    ])
  })

  it('never reads a reference out of an inline script or stylesheet body', () => {
    const refs = extractReferences(PAGE)
    expect(refs).not.toContain('/api/not-a-reference')
    expect(refs).not.toContain('/decoy.png')
    expect(refs).not.toContain('/css/bg.png')
  })

  it('drops the schemes and shapes that can never name a built file', () => {
    const refs = extractReferences(PAGE)
    expect(refs.some((r) => r.startsWith('data:'))).toBe(false)
    expect(refs).not.toContain('mailto:hi@site.example')
    expect(refs).not.toContain('tel:+441234')
    expect(refs).not.toContain('javascript:void(0)')
    expect(refs).not.toContain('#top')
    expect(refs).not.toContain('')
  })

  it('splits srcset on commas and drops the density/width descriptor', () => {
    expect(
      extractReferences(
        '<img srcset="a.jpg 640w,  b.jpg 2x , c.jpg" src="a.jpg">',
      ),
    ).toEqual(['a.jpg', 'b.jpg', 'c.jpg'])
  })

  it('does not mistake data-src for src', () => {
    expect(extractReferences('<img data-src="/lazy.png" alt="">')).toEqual([])
  })

  it('reads unquoted and single-quoted attribute values, and decodes entities', () => {
    expect(
      extractReferences(
        `<a href=/plain.html></a><a href='/single.html'></a><a href="/q?a=1&amp;b=2"></a>`,
      ),
    ).toEqual(['/plain.html', '/q?a=1&b=2', '/single.html'])
  })

  it('is deterministic: sorted, deduplicated, and stable across attribute order', () => {
    const a = extractReferences(
      '<a href="/b"></a><a href="/a"></a><a href="/b"></a>',
    )
    const b = extractReferences('<a href="/a"></a><a href="/b"></a>')
    expect(a).toEqual(['/a', '/b'])
    expect(a).toEqual(b)
  })

  it('returns an empty list for nothing at all', () => {
    expect(extractReferences('')).toEqual([])
    expect(extractReferences(null)).toEqual([])
  })
})

describe('classifyReference', () => {
  const siteUrl = 'https://site.example'
  const of = (ref, url = siteUrl) => classifyReference(ref, { siteUrl: url })

  // Every shape in this block is one the engine's own helpers emit — the
  // fixture list the amended contract names.
  it('treats an absolute URL on the site origin as internal ({{canonical}})', () => {
    expect(of('https://site.example/shelf/')).toEqual({
      kind: 'internal',
      path: '/shelf/',
    })
  })

  it('strips the query and the fragment before resolving ({{absUrl}}, ?v=)', () => {
    expect(of('https://site.example/about?x=1#top')).toEqual({
      kind: 'internal',
      path: '/about',
    })
    expect(of('css/site.css?v=1.4.5')).toEqual({
      kind: 'internal',
      path: 'css/site.css',
    })
  })

  it('keeps a relative reference exactly as written ({{asset}}, {{root}}{{asset}})', () => {
    expect(of('css/site.css')).toEqual({
      kind: 'internal',
      path: 'css/site.css',
    })
    expect(of('../css/site.css')).toEqual({
      kind: 'internal',
      path: '../css/site.css',
    })
    expect(of('css/site.a1b2c3d4.css')).toEqual({
      kind: 'internal',
      path: 'css/site.a1b2c3d4.css',
    })
  })

  it('calls another origin, another scheme and a protocol-relative URL external', () => {
    expect(of('https://cdn.example/x.css').kind).toBe('external')
    expect(of('//cdn.example/x.css').kind).toBe('external')
    expect(of('mailto:hi@site.example').kind).toBe('external')
    expect(of('tel:+441234').kind).toBe('external')
    expect(of('data:image/gif;base64,AAAA').kind).toBe('external')
  })

  it('has nothing to resolve for a bare fragment, a bare query or an empty value', () => {
    for (const ref of ['#top', '?x=1', '', '   '])
      expect(of(ref)).toEqual({ kind: 'external', path: null })
  })

  it('tolerates a trailing slash on siteUrl', () => {
    expect(of('https://site.example/about', 'https://site.example/')).toEqual({
      kind: 'internal',
      path: '/about',
    })
  })

  it('strips a siteUrl path prefix, and disowns same-origin paths outside it', () => {
    const prefixed = 'https://site.example/docs/'
    expect(of('https://site.example/docs/about', prefixed)).toEqual({
      kind: 'internal',
      path: '/about',
    })
    // The prefix itself is the site's home page.
    expect(of('https://site.example/docs', prefixed)).toEqual({
      kind: 'internal',
      path: '/',
    })
    // Same origin, but served by something this build did not write.
    expect(of('https://site.example/blog/x', prefixed).kind).toBe('external')
  })

  it('calls every absolute URL external when the site has no siteUrl', () => {
    expect(classifyReference('https://site.example/about', {}).kind).toBe(
      'external',
    )
  })
})

describe('resolveReference', () => {
  // A tiny in-memory build folder, so nothing here touches a disk.
  const files = new Set([
    'public/index.html',
    'public/about.html',
    'public/shelf/index.html',
    'public/shelf/item.html',
    'public/css/site.a1b2c3d4.css',
    'public/feed.xml',
  ])
  const exists = (file) => files.has(file)
  const known = new Set(['css/site.a1b2c3d4.css', 'shelf/item.html'])
  const from =
    (pageBuildTo) =>
    (ref, options = {}) =>
      resolveReference(ref, {
        pageBuildTo,
        buildDir: './public',
        exists,
        known,
        ...options,
      })
  const fromIndex = from('./public/index.html')
  const fromNested = from('./public/shelf/item.html')

  it('accepts a root-relative file that exists', () => {
    expect(fromIndex('/about.html')).toBe(true)
  })

  it('accepts a directory reference through its index.html', () => {
    expect(fromIndex('/shelf/')).toBe(true)
    expect(fromIndex('/')).toBe(true)
  })

  it('accepts an extension-less reference through either fallback', () => {
    // `<path>.html`
    expect(fromIndex('/about')).toBe(true)
    // `<path>/index.html`
    expect(fromIndex('/shelf')).toBe(true)
    // Both orderings reach both files; `extensionLess` only says which first.
    expect(fromIndex('/about', { extensionLess: true })).toBe(true)
    expect(fromIndex('/shelf', { extensionLess: true })).toBe(true)
  })

  it('resolves a relative reference against the page own directory', () => {
    expect(fromNested('item.html')).toBe(true)
    expect(fromNested('../about.html')).toBe(true)
    expect(fromNested('../css/site.a1b2c3d4.css')).toBe(true)
  })

  it('accepts an asset target but not the source it was hashed from', () => {
    expect(fromIndex('/css/site.a1b2c3d4.css')).toBe(true)
    // Under `assets.hash` the file on disk is the hashed one: a template that
    // hardcoded the source path is genuinely broken, and this is the finding.
    expect(fromIndex('/css/site.css')).toBe(false)
  })

  it('accepts a page this build queued even before the file is on disk', () => {
    const unwritten = (ref) =>
      resolveReference(ref, {
        pageBuildTo: './public/index.html',
        buildDir: './public',
        exists: () => false,
        known,
      })
    expect(unwritten('/shelf/item.html')).toBe(true)
    expect(unwritten('/about.html')).toBe(false)
  })

  it('calls a reference that escapes the build folder broken', () => {
    expect(fromIndex('../../x.html')).toBe(false)
    expect(fromNested('../../../etc/passwd')).toBe(false)
  })

  it('calls a genuinely missing page broken', () => {
    expect(fromIndex('/news/gone.html')).toBe(false)
    expect(fromIndex('/news/gone')).toBe(false)
    expect(fromNested('sibling.html')).toBe(false)
  })

  it('resolves against an absolute build folder just as well', () => {
    expect(
      resolveReference('/about.html', {
        pageBuildTo: '/tmp/site/public/index.html',
        buildDir: '/tmp/site/public',
        exists: (file) => file === '/tmp/site/public/about.html',
      }),
    ).toBe(true)
  })
})

describe('checkLinks', () => {
  const files = new Set(['public/index.html', 'public/css/site.css'])
  const exists = (file) => files.has(file)

  const pages = [
    {
      buildTo: './public/index.html',
      links: [
        '/',
        '/gone.html',
        'css/site.css',
        'https://cdn.example/x.js',
        'https://site.example/shelf/item',
      ],
    },
    {
      buildTo: './public/shelf/item.html',
      links: ['../index.html', '../missing.html'],
    },
  ]

  it('counts every internal reference and reports only the broken ones', () => {
    const result = checkLinks({
      pages,
      buildDir: './public',
      siteUrl: 'https://site.example',
      manifestTargets: ['css/site.css'],
      exists,
    })
    // Four internal on the first page (the CDN one is external), two on the
    // second.
    expect(result.checked).toBe(6)
    expect(result.broken).toEqual([
      { page: './public/index.html', href: '/gone.html' },
      { page: './public/shelf/item.html', href: '../missing.html' },
    ])
  })

  it('resolves a same-origin absolute URL against the pages this build wrote', () => {
    // `https://site.example/shelf/item` is `{{canonical}}` of the second page,
    // and it resolves because that page is in the stack — not because anything
    // is on disk.
    const result = checkLinks({
      pages: [pages[0]],
      buildDir: './public',
      siteUrl: 'https://site.example',
      exists: () => false,
    })
    expect(result.broken.map((b) => b.href)).toContain(
      'https://site.example/shelf/item',
    )
    const withPage = checkLinks({
      pages,
      buildDir: './public',
      siteUrl: 'https://site.example',
      exists: () => false,
    })
    expect(withPage.broken.map((b) => b.href)).not.toContain(
      'https://site.example/shelf/item',
    )
  })

  it('records the href exactly as the page wrote it', () => {
    const result = checkLinks({
      pages: [{ buildTo: './public/index.html', links: ['/gone?x=1#frag'] }],
      buildDir: './public',
      exists: () => false,
    })
    expect(result.broken).toEqual([
      { page: './public/index.html', href: '/gone?x=1#frag' },
    ])
  })

  it('is deterministic: broken sorted by page then href, whatever the input order', () => {
    // `/p.html` and `/q.html` are pages this build does not write, so both are
    // broken from both pages — four findings to put in order.
    const jumbled = [
      { buildTo: './public/z.html', links: ['/q.html', '/p.html'] },
      { buildTo: './public/a.html', links: ['/q.html', '/p.html'] },
    ]
    const result = checkLinks({
      pages: jumbled,
      buildDir: './public',
      exists: () => false,
    })
    expect(result.broken).toEqual([
      { page: './public/a.html', href: '/p.html' },
      { page: './public/a.html', href: '/q.html' },
      { page: './public/z.html', href: '/p.html' },
      { page: './public/z.html', href: '/q.html' },
    ])
  })

  it('reports nothing for a build with no pages, and does not throw on an empty manifest', () => {
    expect(
      checkLinks({ pages: [], buildDir: './public', manifestTargets: [] }),
    ).toEqual({ checked: 0, broken: [] })
  })
})
