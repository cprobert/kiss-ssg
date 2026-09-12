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
