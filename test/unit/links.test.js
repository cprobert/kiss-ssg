import { describe, it, expect } from 'vitest'
import {
  extractReferences,
  classifyReference,
  resolveReference,
  resolveTarget,
  checkLinks,
  hostServedMatcher,
} from '../../lib/links.js'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

  // The HTML standard's reading, the one `lib/packages.js` packs by: a URL runs
  // to whitespace, commas and all, so splitting on every comma reported two
  // broken links for one image that is there.
  it('reads a srcset as a browser does: a comma inside a URL is part of it', () => {
    expect(
      extractReferences(
        '<img srcset="images/crop,large.png 2x,small.png 1x, tiny.png,">',
      ),
    ).toEqual(['images/crop,large.png', 'small.png', 'tiny.png'])
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

  // A browser reads a backslash as a slash on an http(s) page, and drops tabs
  // and newlines: `assets\x.png` works, and `\\cdn\x.png` is another host.
  it('reads a reference as a browser does before classifying it', () => {
    expect(of('assets\\x.png')).toEqual({
      kind: 'internal',
      path: 'assets/x.png',
    })
    expect(of('\\\\cdn.example\\x.png')).toEqual({
      kind: 'external',
      path: null,
    })
    expect(of('as\tsets/x\n.png').path).toBe('assets/x.png')
  })

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
    // Same origin, outside the prefix: not this build's address, so not
    // internal. `outside` carries the path, for checkLinks to ask whether it
    // names a page this build wrote at another address.
    expect(of('https://site.example/blog/x', prefixed)).toEqual({
      kind: 'outside',
      path: '/blog/x',
    })
  })

  // A browser requests a root-relative path from the origin's root, whatever
  // `siteUrl` says, so on a prefixed site `/about` is not this build's
  // `about`. It was read against the build folder, and `{{link}}` without
  // `absolute=true`, or the consent banner's policy link, passed the check
  // while every visitor got the origin root's page (2026-11-03).
  it('reads a root-relative path against siteUrl’s prefix, as a browser requests it', () => {
    const prefixed = 'https://site.example/docs/'
    expect(of('/docs/about?x=1', prefixed)).toEqual({
      kind: 'internal',
      path: '/about',
    })
    expect(of('/docs', prefixed)).toEqual({ kind: 'internal', path: '/' })
    expect(of('/docs/', prefixed)).toEqual({ kind: 'internal', path: '/' })
    expect(of('/about', prefixed)).toEqual({ kind: 'outside', path: '/about' })
    // `/docsy` is not under `/docs/`.
    expect(of('/docsy/x', prefixed)).toEqual({
      kind: 'outside',
      path: '/docsy/x',
    })
    // No prefix, no change: root-relative is the build's root.
    expect(of('/about')).toEqual({ kind: 'internal', path: '/about' })
  })

  // Codex round 1 (2026-11-03): the prefix stays percent-encoded in a parsed
  // `siteUrl`, and the reference was decoded before the comparison, so every
  // link under `/my%20site/` read as outside the site. Compared encoded, as
  // the browser requests them, and decoded after the prefix is stripped.
  it('compares an encoded prefix with the reference as the browser requests it', () => {
    const encoded = 'https://example.com/my%20site/'
    expect(of('https://example.com/my%20site/about', encoded)).toEqual({
      kind: 'internal',
      path: '/about',
    })
    expect(of('https://example.com/my%20site/caf%C3%A9', encoded)).toEqual({
      kind: 'internal',
      path: '/café',
    })
    expect(of('/my%20site/about', encoded)).toEqual({
      kind: 'internal',
      path: '/about',
    })
    // A browser encodes the space itself before it requests the path.
    expect(of('/my site/about', encoded)).toEqual({
      kind: 'internal',
      path: '/about',
    })
    expect(of('/my%20site', encoded)).toEqual({ kind: 'internal', path: '/' })
    expect(of('/other/x', encoded)).toEqual({
      kind: 'outside',
      path: '/other/x',
    })
    // A prefix written unencoded in siteUrl is parsed to the same thing.
    expect(
      of('https://example.com/my%20site/about', 'https://example.com/my site/'),
    ).toEqual({ kind: 'internal', path: '/about' })
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

describe('resolveTarget', () => {
  it('names the page a reference lands on, preferring a known page to a folder on disk', () => {
    // On a real disk `about/` is a directory and `existsSync` says yes to it,
    // so a loop that asked the filesystem candidate by candidate would answer
    // `about` for `/about` — never the page, whose ids the audit needs.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-target-'))
    try {
      fs.mkdirSync(path.join(dir, 'about'))
      fs.writeFileSync(path.join(dir, 'about', 'index.html'), '<html></html>')
      fs.writeFileSync(path.join(dir, 'guide.pdf'), '')
      const buildDir = dir.replace(/\\/g, '/')
      const known = new Set(['about/index.html'])
      const target = (ref, extensionLess = false) =>
        resolveTarget(ref, {
          pageBuildTo: `${buildDir}/index.html`,
          buildDir,
          extensionLess,
          known,
        })
      expect(target('/about')).toBe('about/index.html')
      expect(target('/about', true)).toBe('about/index.html')
      expect(target('/about/')).toBe('about/index.html')
      expect(target('about')).toBe('about/index.html')
      // Not known, but on disk: the file itself.
      expect(target('/guide.pdf')).toBe('guide.pdf')
      expect(target('/gone')).toBe(null)
      expect(target('/../x.html')).toBe(null)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it('agrees with resolveReference on every answer', () => {
    const exists = (file) =>
      ['public/a.html', 'public/b/index.html'].includes(file)
    for (const ref of ['/a', '/a.html', '/b', '/b/', '/c', 'a', '../a.html']) {
      const options = {
        pageBuildTo: 'public/index.html',
        buildDir: 'public',
        exists,
      }
      expect(resolveTarget(ref, options) !== null).toBe(
        resolveReference(ref, options),
      )
    }
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
    ).toEqual({ checked: 0, hostServed: 0, broken: [], orphans: [] })
  })

  it('counts a reference the host serves instead of reporting it broken', () => {
    // A form posting to a Cloud Function, a bundle a post-build step writes,
    // and an llms.txt a separate script writes: real on the deployed site,
    // absent from every build folder kiss can see.
    const result = checkLinks({
      pages: [
        {
          buildTo: './public/index.html',
          links: [
            'https://site.example/v1/reg-int',
            '/css-site-1.2.3/site.min.css',
            '/llms.txt',
            '/gone.html',
          ],
        },
        // Relative to a nested page, so it is matched as the root-relative path
        // a browser would request, `/v1/contact`.
        { buildTo: './public/shelf/item.html', links: ['../v1/contact'] },
      ],
      buildDir: './public',
      siteUrl: 'https://site.example',
      hostServed: ['/v1/**', '/css-*/**', '/llms.txt'],
      exists: () => false,
    })
    expect(result.checked).toBe(5)
    expect(result.hostServed).toBe(4)
    expect(result.broken).toEqual([
      { page: './public/index.html', href: '/gone.html' },
    ])
  })

  // A browser resolves dot segments before it requests a root-relative URL,
  // so a pattern is matched against that path, not the string as written
  // (Codex's review, 2026-10-02): `/v1/../gone.html` is a request for
  // `/gone.html`, which no `/v1/**` rule serves.
  it('matches a root-relative reference by the path a browser requests', () => {
    const result = checkLinks({
      pages: [
        {
          buildTo: './public/index.html',
          links: ['/v1/../gone.html', '/other/../v1/contact'],
        },
      ],
      buildDir: './public',
      hostServed: ['/v1/**'],
      exists: () => false,
    })
    expect(result.hostServed).toBe(1)
    expect(result.broken).toEqual([
      { page: './public/index.html', href: '/v1/../gone.html' },
    ])
  })

  // The same rule, all the way (Codex's second review, 2026-10-02): the path
  // is resolved in URL space, as the browser resolves it, not in the build
  // folder. `..` above the site root stops at the origin root, and a site
  // deployed under a path prefix requests paths that carry the prefix.
  it('clamps a relative climb at the origin root, as a browser does', () => {
    const result = checkLinks({
      pages: [{ buildTo: './public/index.html', links: ['../v1/contact'] }],
      buildDir: './public',
      hostServed: ['/v1/**'],
      exists: () => false,
    })
    expect(result.hostServed).toBe(1)
    expect(result.broken).toEqual([])
  })

  it('matches a prefixed deployment by the full request path, written either way', () => {
    const result = checkLinks({
      pages: [
        {
          buildTo: './public/index.html',
          links: ['https://example.com/docs/api/contact', 'api/form'],
        },
      ],
      buildDir: './public',
      siteUrl: 'https://example.com/docs',
      hostServed: ['/docs/api/**'],
      exists: () => false,
    })
    expect(result.hostServed).toBe(2)
    expect(result.broken).toEqual([])
  })

  // The forgotten prefix: a reference that names this build's page at the
  // origin's root rather than under siteUrl's prefix. What the browser gets
  // there is not this page, so it is broken. A same-origin path outside the
  // prefix that names nothing this build wrote (a link back to the main site
  // at `/shop/`) is someone else's, and the build cannot say: not checked.
  it('reports a page linked without siteUrl’s prefix, and leaves the rest of the origin alone', () => {
    const result = checkLinks({
      pages: [
        {
          buildTo: './public/index.html',
          links: [
            '/cookies.html',
            'https://example.com/about.html',
            '/docs/cookies.html',
            '/shop/',
            'https://example.com/shop/basket',
          ],
        },
        { buildTo: './public/cookies.html', links: [] },
        { buildTo: './public/about.html', links: [] },
      ],
      buildDir: './public',
      siteUrl: 'https://example.com/docs/',
      exists: () => false,
    })
    expect(result.broken).toEqual([
      { page: './public/index.html', href: '/cookies.html' },
      { page: './public/index.html', href: 'https://example.com/about.html' },
    ])
    // The two misplaced ones and the one inside the prefix.
    expect(result.checked).toBe(3)
    // `/docs/cookies.html` lands, so cookies is linked; about only from the
    // wrong address, which links nothing.
    expect(result.orphans).toEqual(['./public/about.html'])
  })

  it('checks links under an encoded prefix, and counts the pages they land on as linked', () => {
    const result = checkLinks({
      pages: [
        {
          buildTo: './public/index.html',
          links: [
            'https://example.com/my%20site/about.html',
            'https://example.com/my%20site/gone.html',
          ],
        },
        { buildTo: './public/about.html', links: [] },
      ],
      buildDir: './public',
      siteUrl: 'https://example.com/my%20site/',
      exists: () => false,
    })
    expect(result.checked).toBe(2)
    expect(result.broken).toEqual([
      {
        page: './public/index.html',
        href: 'https://example.com/my%20site/gone.html',
      },
    ])
    expect(result.orphans).toEqual([])
  })

  it('lets hostServed claim a path outside the prefix', () => {
    const result = checkLinks({
      // `/` is the ambiguous one: a prefixed build always has an index, so a
      // link back to the main site at the origin's root reads as the prefix
      // forgotten until the site says otherwise.
      pages: [
        { buildTo: './public/index.html', links: ['/cookies.html', '/'] },
        { buildTo: './public/cookies.html', links: [] },
      ],
      buildDir: './public',
      siteUrl: 'https://example.com/docs/',
      exists: () => false,
    })
    expect(result.broken.map((b) => b.href)).toEqual(['/', '/cookies.html'])
    const claimed = checkLinks({
      pages: [
        { buildTo: './public/index.html', links: ['/cookies.html', '/'] },
        { buildTo: './public/cookies.html', links: [] },
      ],
      buildDir: './public',
      siteUrl: 'https://example.com/docs/',
      hostServed: ['/cookies.html', '/'],
      exists: () => false,
    })
    expect(claimed.hostServed).toBe(2)
    expect(claimed.broken).toEqual([])
  })

  // The information architecture skill needs the pages nothing links to. It
  // shipped a 94-line scraper for sites to copy, which counted links inside
  // comments and scripts and missed image maps, one review at a time
  // (2026-10-31). The scan already resolves every link with a real parser,
  // so it names them.
  describe('orphans', () => {
    const site = (pages) =>
      checkLinks({
        pages,
        buildDir: './public',
        siteUrl: 'https://site.example',
        exists: () => false,
      }).orphans

    it('names an HTML page no other page links to, by any spelling', () => {
      expect(
        site([
          {
            buildTo: './public/index.html',
            links: ['/about/', 'https://site.example/blog/post'],
          },
          { buildTo: './public/about/index.html', links: ['/', 'about'] },
          { buildTo: './public/blog/post.html', links: ['../index.html'] },
          { buildTo: './public/lonely.html', links: ['/'] },
        ]),
      ).toEqual(['./public/lonely.html'])
    })

    it('does not count a page linking to itself', () => {
      expect(
        site([
          { buildTo: './public/index.html', links: [] },
          { buildTo: './public/self.html', links: ['self.html', '#top'] },
        ]),
      ).toEqual(['./public/self.html'])
    })

    it('never names the home page, a 404 page, or a page that is not HTML', () => {
      expect(
        site([
          { buildTo: './public/index.html', links: [] },
          { buildTo: './public/404.html', links: ['/'] },
          { buildTo: './public/data/index.json', links: [] },
        ]),
      ).toEqual([])
    })

    // Measured on example 13: an LMS opens a learning package's pages from
    // its manifest, and a SCORM page does not link to its fellow members, so
    // all three lesson pages read as orphans.
    it('never names a page in a learning package', () => {
      expect(
        site([
          { buildTo: './public/index.html', links: [] },
          { buildTo: './public/lesson.html', links: [], package: 'espresso' },
        ]),
      ).toEqual([])
    })

    it('counts a link a broken page wrote, but not one that resolves nowhere', () => {
      expect(
        site([
          { buildTo: './public/index.html', links: ['/gone.html'] },
          { buildTo: './public/kept.html', links: [] },
        ]),
      ).toEqual(['./public/kept.html'])
    })
  })
})

describe('hostServedMatcher', () => {
  it('matches * inside one segment and ** across segments', () => {
    const served = hostServedMatcher(['/v1/**', '/css-*/site.css', '/feed'])
    expect(served('/v1/reg-int')).toBe(true)
    expect(served('/v1/deep/er')).toBe(true)
    expect(served('/css-site-1.2.3/site.css')).toBe(true)
    // `*` stops at a slash, and a pattern is the whole path, not a prefix.
    expect(served('/css-a/b/site.css')).toBe(false)
    expect(served('/feed')).toBe(true)
    expect(served('/feed/extra')).toBe(false)
    expect(served('/v1')).toBe(false)
  })

  it('takes every other character literally', () => {
    const served = hostServedMatcher(['/a.b+c(d)'])
    expect(served('/a.b+c(d)')).toBe(true)
    expect(served('/aXb+c(d)')).toBe(false)
  })

  it('matches nothing when there are no patterns', () => {
    expect(hostServedMatcher([])('/anything')).toBe(false)
  })
})
