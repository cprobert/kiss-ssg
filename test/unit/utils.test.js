import path from 'node:path'
import { isInside, isUrlModel, redactUrl, REDACTED } from '../../lib/utils.js'
import { describe, it, expect, afterEach } from 'vitest'
import utils from '../../lib/utils.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

describe('utils.toSlug', () => {
  it('lower-cases and replaces runs of non-word characters with a dash', () => {
    expect(utils.toSlug('  Hello World! ')).toBe('hello-world')
  })

  it('trims leading and trailing dashes', () => {
    expect(utils.toSlug('  --hello--  ')).toBe('hello')
  })

  it('transliterates accented Latin instead of dropping it', () => {
    expect(utils.toSlug('Über uns')).toBe('uber-uns')
  })

  it('falls back to a stable hash for scripts with no Latin mapping', () => {
    const jp = utils.toSlug('日本語のページ')
    const ko = utils.toSlug('안녕하세요')
    expect(jp).toBeTruthy()
    expect(ko).toBeTruthy()
    expect(jp).not.toBe('-')
    expect(jp).not.toBe(ko)
    expect(jp).toBe(utils.toSlug('日本語のページ'))
  })

  it('keeps an empty input empty rather than hashing it', () => {
    expect(utils.toSlug('')).toBe('')
    expect(utils.toSlug('   ')).toBe('')
  })
})

describe('utils.sanitizePath', () => {
  it('trims surrounding slashes and slugifies each segment', () => {
    expect(utils.sanitizePath('/About Us/Our Team/')).toBe('about-us/our-team')
  })

  it('cannot escape upwards', () => {
    expect(utils.sanitizePath('../../etc')).not.toContain('..')
  })
})

describe('utils.hashId', () => {
  it('hashes strings and objects deterministically, and objects by content', () => {
    expect(utils.hashId('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(utils.hashId({ a: 1 })).toBe(utils.hashId({ a: 1 }))
    expect(utils.hashId({ a: 1 })).not.toBe(utils.hashId({ a: 2 }))
  })
})

describe('utils.toAbsoluteUrl', () => {
  it('joins a site URL to a path with exactly one slash between them', () => {
    expect(utils.toAbsoluteUrl('https://e.com', 'about')).toBe(
      'https://e.com/about',
    )
    expect(utils.toAbsoluteUrl('https://e.com/', '/about')).toBe(
      'https://e.com/about',
    )
  })

  // Changed deliberately: a trailing slash is now meaningful, because it is
  // what tells a static host to serve the directory index instead of
  // redirecting. It used to be trimmed.
  it('preserves an explicit trailing slash and leaves a bare path bare', () => {
    expect(utils.toAbsoluteUrl('https://e.com/', '/about/')).toBe(
      'https://e.com/about/',
    )
    expect(utils.toAbsoluteUrl('https://e.com', 'about')).toBe(
      'https://e.com/about',
    )
  })

  it('gives an empty path the site root with one trailing slash', () => {
    expect(utils.toAbsoluteUrl('https://e.com/', '')).toBe('https://e.com/')
  })

  // Changed deliberately: `about/index.html` is served at `/about/`; the bare
  // `/about` this used to emit is a 301 on Netlify, GitHub Pages and nginx, so
  // every canonical and `<loc>` for a section index pointed at a redirect.
  it('turns a trailing index segment into a trailing slash', () => {
    expect(utils.toAbsoluteUrl('https://e.com', 'about/index.html')).toBe(
      'https://e.com/about/',
    )
    expect(utils.toAbsoluteUrl('https://e.com', 'about/index')).toBe(
      'https://e.com/about/',
    )
    expect(utils.toAbsoluteUrl('https://e.com', 'index.html')).toBe(
      'https://e.com/',
    )
  })

  it('keeps a file extension that is not an index page', () => {
    expect(utils.toAbsoluteUrl('https://e.com', 'css/site.css')).toBe(
      'https://e.com/css/site.css',
    )
  })

  it('collapses repeated slashes', () => {
    expect(utils.toAbsoluteUrl('https://e.com//', '//a//b//index.html')).toBe(
      'https://e.com/a/b/',
    )
  })
})

describe('utils.toCanonicalPath', () => {
  it('drops only the last segment file extension', () => {
    expect(utils.toCanonicalPath('about.html')).toBe('about')
    expect(utils.toCanonicalPath('blog/2026/post.html')).toBe('blog/2026/post')
    expect(utils.toCanonicalPath('/courses/index.html')).toBe('/courses/index')
  })

  it('leaves the index segment for toAbsoluteUrl to turn into a slash', () => {
    expect(
      utils.toAbsoluteUrl(
        'https://e.com',
        utils.toCanonicalPath('a/index.html'),
      ),
    ).toBe('https://e.com/a/')
  })

  it('leaves an extensionless path exactly as it came', () => {
    expect(utils.toCanonicalPath('courses/')).toBe('courses/')
    expect(utils.toCanonicalPath('')).toBe('')
  })

  it('ignores a dot in a parent segment', () => {
    expect(utils.toCanonicalPath('v1.2/notes')).toBe('v1.2/notes')
  })
})

describe('utils.relativePathFor', () => {
  it.each([
    ['course/l1/tab-1.html', 'course/l1/tab-2.html', 'tab-2.html'],
    ['course/l1/tab-1.html', 'course/l2/index.html', '../l2/index.html'],
    ['course/l1/tab-1.html', 'index.html', '../../index.html'],
    ['index.html', 'about/index.html', 'about/index.html'],
    ['course/l1/tab-1.html', 'course/l1/tab-1.html', 'tab-1.html'],
    ['/about.html', '/contact.html', 'contact.html'],
  ])('links %s to %s as %s, the file and never a folder', (from, to, rel) => {
    expect(utils.relativePathFor(from, to)).toBe(rel)
  })
})

describe('utils.servedPathFor', () => {
  // The seven page shapes a build can produce, measured off `KissPage.pageURL()`
  // — this is the table the `{{link}}` contract is written against.
  it.each([
    ['index.html', '/'],
    ['about.html', '/about.html'],
    ['about/index.html', '/about/'],
    ['courses/index.html', '/courses/'],
    ['blog/my-post.html', '/blog/my-post.html'],
    ['blog/my-post/index.html', '/blog/my-post/'],
    ['data/index.json', '/data/index.json'],
  ])('serves %s at %s', (pageURL, served) => {
    expect(utils.servedPathFor(pageURL)).toBe(served)
  })

  // The difference from `toAbsoluteUrl`, which strips a trailing `index`
  // segment with *any* extension: an `ext: 'json'` index page is a file, and a
  // link to `/data/` would 404 on a directory with no index.html in it.
  it('collapses only index.html, never another index.<ext>', () => {
    expect(utils.servedPathFor('data/index.json')).toBe('/data/index.json')
    expect(utils.servedPathFor('feed/index.xml')).toBe('/feed/index.xml')
    expect(utils.toAbsoluteUrl('', 'data/index.json')).toBe('/data/')
  })

  it('is root-relative whatever it is given', () => {
    expect(utils.servedPathFor('/about.html')).toBe('/about.html')
    expect(utils.servedPathFor('')).toBe('/')
  })

  // Not the canonical form: a static host serves the file, and the pretty URL
  // only where the site is extension-less (where the two coincide).
  it('is not the canonical path on a site with extensions', () => {
    expect(utils.servedPathFor('about.html')).toBe('/about.html')
    expect(utils.toAbsoluteUrl('', utils.toCanonicalPath('about.html'))).toBe(
      '/about',
    )
    expect(utils.servedPathFor('about/index.html')).toBe('/about/')
    expect(
      utils.toAbsoluteUrl('', utils.toCanonicalPath('about/index.html')),
    ).toBe('/about/')
  })
})

describe('utils.toURLKey', () => {
  // Unchanged by the trailing-slash fix: this is page *identity*, what
  // `isActive` compares — not a URL anyone emits.
  it('reduces every spelling of one page to the same key', () => {
    for (const value of ['/about', 'about/', 'about.html', 'about/index.html'])
      expect(utils.toURLKey(value)).toBe('about')
    expect(utils.toURLKey('index.html')).toBe('')
  })
})

describe('utils.globFiles', () => {
  it('finds files under a directory, sorted and posix', async () => {
    site = await makeSite({ 'v/b.hbs': 'b', 'v/a/c.hbs': 'c' })
    expect(utils.globFiles(`${site.root}/v`, '**/*.hbs')).toEqual([
      `${site.root}/v/a/c.hbs`,
      `${site.root}/v/b.hbs`,
    ])
  })

  it('treats glob metacharacters in the directory as literal characters', async () => {
    site = await makeSite({ 'site[old]/a.hbs': 'a', 'site[old]/b.hbs': 'b' })
    expect(utils.globFiles(`${site.root}/site[old]`, '*.hbs')).toEqual([
      `${site.root}/site[old]/a.hbs`,
      `${site.root}/site[old]/b.hbs`,
    ])
  })
})

// The directory-index policy. Measured live on 2026-09-16: Netlify serves
// `/courses/` and 301s the bare form; Firebase with `cleanUrls` +
// `trailingSlash: false` does the exact reverse. One of them has to be the
// default, and the other has to be sayable.
describe('toAbsoluteUrl / servedPathFor under links.trailingSlash', () => {
  it('collapses a directory index to a trailing slash by default', () => {
    expect(utils.toAbsoluteUrl('https://s', 'courses/index.html')).toBe(
      'https://s/courses/',
    )
    expect(utils.servedPathFor('courses/index.html')).toBe('/courses/')
  })

  it('drops the slash entirely under trailingSlash:false', () => {
    const off = { trailingSlash: false }
    expect(utils.toAbsoluteUrl('https://s', 'courses/index.html', off)).toBe(
      'https://s/courses',
    )
    expect(utils.servedPathFor('courses/index.html', off)).toBe('/courses')
  })

  it('leaves the site root as one trailing slash under either policy', () => {
    // Both replacements empty the path here, so the join returns the origin
    // with a single slash. `https://s` with no path is not a URL any host
    // serves a home page at, and this is the assertion that says so.
    for (const options of [undefined, { trailingSlash: false }]) {
      expect(utils.toAbsoluteUrl('https://s', 'index.html', options)).toBe(
        'https://s/',
      )
      expect(utils.toAbsoluteUrl('https://s', '', options)).toBe('https://s/')
      expect(utils.servedPathFor('index.html', options)).toBe('/')
    }
  })

  it('leaves a file page, an asset and an author-written slash alone', () => {
    const off = { trailingSlash: false }
    // The hosts agree on file pages, so the policy must not touch them.
    expect(utils.toAbsoluteUrl('https://s', 'about', off)).toBe(
      'https://s/about',
    )
    expect(utils.servedPathFor('about.html', off)).toBe('/about.html')
    // An asset URL has to survive both ways round.
    expect(utils.toAbsoluteUrl('https://s', 'css/site.css', off)).toBe(
      'https://s/css/site.css',
    )
    // A slash the caller typed is the caller's, not an index collapse: the
    // policy governs what kiss *derives*, not what a template asked for.
    expect(utils.toAbsoluteUrl('https://s', '/courses/', off)).toBe(
      'https://s/courses/',
    )
    // Only `index.html` collapses in a served path — `data/index.json` is a
    // file, and `/data/` would be a directory with no index in it.
    expect(utils.servedPathFor('data/index.json', off)).toBe('/data/index.json')
  })

  it('does not touch toURLKey, so page identity is host-independent', () => {
    // `isActive` compares these, and a nav highlight must not depend on where
    // the site happens to be deployed. `toURLKey` takes no policy at all —
    // passing one changes nothing, which is the assertion.
    for (const value of ['courses/index.html', '/courses/', 'courses'])
      expect(utils.toURLKey(value, { trailingSlash: false })).toBe('courses')
    expect(utils.toURLKey('index.html', { trailingSlash: false })).toBe('')
  })
})

describe('isInside', () => {
  const inAssets = isInside('./src/assets')

  it('matches the directory itself and everything under it', () => {
    expect(inAssets('src/assets')).toBe(true)
    expect(inAssets('src/assets/css/site.scss')).toBe(true)
  })

  it('does not match a sibling that merely shares the prefix', () => {
    expect(inAssets('src/assets-backup/x.txt')).toBe(false)
    expect(inAssets('src/pages/index.hbs')).toBe(false)
  })

  // The same absolute-versus-relative seam as the helpers entry, third time on
  // this branch. `isInside` normalised separators and resolved nothing, so a
  // site with a relative `src` and an absolute helpers path INSIDE it failed
  // the exclusion and got both dispatches — a whole-site replay racing the
  // reload, over one registry.
  it('matches a relative directory against an absolute path and vice versa', () => {
    const abs = path.resolve('src/assets')
    expect(isInside('./src/assets')(`${abs}/x.txt`)).toBe(true)
    expect(isInside(abs)('src/assets/x.txt')).toBe(true)
    expect(isInside('./src/assets')(path.resolve('src/pages/i.hbs'))).toBe(
      false,
    )
  })

  it('normalises the leading ./', () => {
    expect(inAssets('./src/assets/x.txt')).toBe(true)
  })

  it('uses native separator semantics on both sides', () => {
    const windows = process.platform === 'win32'
    expect(inAssets('src\\assets\\x.txt')).toBe(windows)
    expect(isInside('src\\assets')('src/assets/x.txt')).toBe(windows)
  })
})

describe('redactUrl', () => {
  it.each([
    [
      'https://cdn.example.com/entries?access_token=SECRET&type=course',
      'https://cdn.example.com/entries?access_token=[redacted]&type=[redacted]',
    ],
    // No credentials, no fragment.
    [
      'https://user:pass@cdn.example.com/x?k=v#frag',
      'https://cdn.example.com/x?k=[redacted]',
    ],
    // A parameter with no `=` is itself a value.
    [
      'https://cdn.example.com/x?justavalue',
      'https://cdn.example.com/x?[redacted]',
    ],
    ['https://cdn.example.com/x', 'https://cdn.example.com/x'],
    // Every parameter keeps its place, repeats included.
    [
      'https://cdn.example.com/x?a=1&a=2&b',
      'https://cdn.example.com/x?a=[redacted]&a=[redacted]&[redacted]',
    ],
    // An empty query, and empty pieces between `&`, say nothing.
    ['https://cdn.example.com/x?', 'https://cdn.example.com/x'],
    [
      'https://cdn.example.com/x?a=1&&b=2',
      'https://cdn.example.com/x?a=[redacted]&b=[redacted]',
    ],
    ['https://cdn.example.com/x#only-a-fragment', 'https://cdn.example.com/x'],
    // Port and path kept; the host as the URL parser writes it.
    [
      'http://API.Example.com:8443/v2/events?page=2',
      'http://api.example.com:8443/v2/events?page=[redacted]',
    ],
    // Not a URL the platform parses: cut at the first `?` or `#`.
    ['http://[bad url?token=SECRET', 'http://[bad url?[redacted]'],
    ['http://[bad url#token=SECRET', 'http://[bad url'],
    ['http://user:pass@[bad/x?token=SECRET', 'http://[bad/x?[redacted]'],
  ])('writes %s as %s', (url, shown) => {
    expect(redactUrl(url)).toBe(shown)
  })

  // A string the parser rejects cannot be split into credentials, path and
  // query, so the rule is by the position of its last `@` against its first
  // `?` or `#`: before it, everything from `://` to that `@` goes; after it,
  // nothing past the scheme is shown.
  it.each([
    // A password holding a raw `/`: the credentials end at the last `@`,
    // not at the first `/`.
    [
      'https://user:abc/def==@api.example.com/data?x=1',
      'https://api.example.com/data?[redacted]',
    ],
    // A password holding a raw `?` or `#`: the `@` lies past the cut.
    ['https://user:pa?ss@api.example.com/data', 'https://[redacted]'],
    ['https://user:pa#ss@api.example.com/data', 'https://[redacted]'],
    // A password holding an `@` and a `/`.
    [
      'https://user:p@ss word/x@api.example.com/data?k=v',
      'https://api.example.com/data?[redacted]',
    ],
    // The parser takes `http:`, `http:/` and `http:\\` as the start of an
    // authority too, so the credentials follow whatever slashes there are.
    ['http:user:SECRET-TOKEN-H@[bad/data', 'http:[bad/data'],
    ['https:/user:SECRET-TOKEN-H@[bad/data', 'https:/[bad/data'],
    ['https:\\\\user:SECRET-TOKEN-H@[bad/data', 'https:\\\\[bad/data'],
    ['https:/user:pa?ss@[bad/data', 'https:/[redacted]'],
    // An `@` in the query or the fragment of a string with no credentials.
    ['http://[bad/x?mail=SECRET@example.com', 'http://[redacted]'],
    ['http://[bad/x#SECRET@frag', 'http://[redacted]'],
  ])('writes the unparseable %s as %s', (url, shown) => {
    expect(redactUrl(url)).toBe(shown)
  })

  // The parser reads a scheme that is not http(s) without an authority: the
  // whole of `user:pass@host/x` is its path, credentials and all. Only an
  // http(s) URL is split the way its author meant, so anything else that
  // parses goes by the last `@`, as a string that does not parse does.
  it.each([
    ['httpx:user:SECRET-TOKEN-H@host/x?a=1', 'httpx:host/x?[redacted]'],
    ['http-internal:SECRET-TOKEN-H@host/x', 'http-internal:host/x'],
    ['httpx://user:SECRET-TOKEN-H@host/x?a=1', 'httpx://host/x?[redacted]'],
  ])(
    'writes %s, which parses with a scheme kiss cannot fetch, as %s',
    (url, shown) => {
      expect(redactUrl(url)).toBe(shown)
    },
  )

  it('is not on the public utils object', () => {
    expect(utils).not.toHaveProperty('redactUrl')
  })
})

describe('REDACTED and isUrlModel', () => {
  it('names the one word redacted values become', () => {
    expect(REDACTED).toBe('[redacted]')
    expect(utils).not.toHaveProperty('REDACTED')
  })

  it.each([
    ['https://cdn.example.com/x', true],
    ['http://localhost:3000/x.json', true],
    // The scheme, in any case, after any leading space: what fetch takes.
    ['HTTPS://cdn.example.com/x', true],
    [' https://cdn.example.com/x', true],
    // A name that only begins with the letters is a file or a folder.
    ['httpdata.json', false],
    ['http-archive', false],
    ['httpx://cdn.example.com/x', false],
    ['data/page.json', false],
    ['', false],
    [undefined, false],
    [null, false],
    [{ title: 'inline' }, false],
    [['https://cdn.example.com/x'], false],
  ])('says %j is a URL model: %s', (model, expected) => {
    expect(isUrlModel(model)).toBe(expected)
  })

  it('is not on the public utils object', () => {
    expect(utils).not.toHaveProperty('isUrlModel')
  })
})
