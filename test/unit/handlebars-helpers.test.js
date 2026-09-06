import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Handlebars from 'handlebars'
import { Remarkable } from 'remarkable'
import { registerHandlebarsHelpers } from '../../lib/handlebars-helpers.js'
import { createAssetManifest } from '../../lib/asset-manifest.js'
import { KissPage } from '../../lib/kiss-page.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let hbs
let warnings
let errors
const render = (src, ctx = {}) => hbs.compile(src)(ctx)

// A recording logger so the degrade-instead-of-throw paths can assert that the
// template author was told, not just that nothing blew up.
const makeHbs = (config = {}, assets) => {
  const env = Handlebars.create()
  registerHandlebarsHelpers(
    env,
    { dev: false, sass: { includePaths: [] }, ...config },
    {
      assets,
      markdown: new Remarkable({ html: true, xhtmlOut: true, breaks: true }),
      logger: {
        ...silentLogger,
        warn: (...args) => warnings.push(args),
        error: (...args) => errors.push(args),
      },
    },
  )
  return env
}

beforeEach(() => {
  warnings = []
  errors = []
  hbs = makeHbs()
})

describe('markdown', () => {
  it('renders a block and an inline string', () => {
    expect(render('{{#markdown}}# Hi{{/markdown}}')).toContain('<h1>Hi</h1>')
    expect(render('{{markdown text}}', { text: '**b**' })).toContain(
      '<strong>b</strong>',
    )
  })

  it('renders nothing and warns for null, a plain object or an array', () => {
    expect(render('{{markdown intro}}', { intro: null })).toBe('')
    expect(render('{{markdown model}}', { model: { a: 1 } })).toBe('')
    expect(render('{{markdown list}}', { list: ['a'] })).toBe('')
    expect(warnings).toHaveLength(3)
    expect(errors).toHaveLength(3)
  })

  it('renders nothing and warns for an undefined value or another type', () => {
    expect(render('{{markdown missing}}')).toBe('')
    expect(warnings).toHaveLength(1)
    expect(errors).toHaveLength(0)
    expect(render('{{markdown n}}', { n: 42 })).toBe('')
    expect(warnings).toHaveLength(2)
    expect(errors).toHaveLength(1)
  })
})

describe('sass', () => {
  let site
  afterEach(async () => {
    if (site) await site.cleanup()
    site = undefined
  })

  it('compiles an inline block', () => {
    expect(render('{{#sass}}$c: red; a { color: $c }{{/sass}}')).toContain(
      'color: red',
    )
  })

  it('compiles a file given as an absolute path', async () => {
    site = await makeSite({ 'css/main.scss': '$c: red; b { color: $c }' })
    expect(render(`{{#sass "${site.root}/css/main.scss"}}{{/sass}}`)).toContain(
      'color:red',
    )
  })

  it('resolves a relative file against process.cwd(), expanded only in dev', async () => {
    site = await makeSite({ 'css/rel.scss': '$c: blue; i { color: $c }' })
    const relative = path
      .relative(process.cwd(), `${site.root}/css/rel.scss`)
      .replace(/\\/g, '/')
    expect(render(`{{sass "${relative}"}}`)).toContain('color:blue')
    const dev = makeHbs({ dev: true })
    expect(dev.compile(`{{sass "${relative}"}}`)({})).toContain('color: blue')
  })
})

describe('offset and stringify', () => {
  it('offset adds one; stringify pretty-prints', () => {
    expect(render('{{offset i}}', { i: 0 })).toBe('1')
    expect(render('{{{stringify o}}}', { o: { a: 1 } })).toBe(
      JSON.stringify({ a: 1 }, null, 3),
    )
  })
})

describe('isActive', () => {
  const tpl = '{{#isActive page href=href}}[{{active}}]{{/isActive}}'
  it('matches the page URL exactly, treating index as /', () => {
    expect(
      render(tpl, { page: { pageURL: 'about.html' }, href: '/about' }),
    ).toBe('[active]')
    expect(render(tpl, { page: { pageURL: 'index.html' }, href: '/' })).toBe(
      '[active]',
    )
    expect(
      render(tpl, { page: { pageURL: 'about.html' }, href: '/contact' }),
    ).toBe('[]')
  })

  it('matches by folder when folderMatch is set', () => {
    const t =
      '{{#isActive page href="/docs" folderMatch=true}}[{{active}}]{{/isActive}}'
    expect(render(t, { page: { pageURL: 'docs/intro.html' } })).toBe('[active]')
  })

  describe('folderMatch compares path segments, not substrings', () => {
    const t =
      '{{#isActive page href=href folderMatch=true}}[{{active}}]{{/isActive}}'
    const cases = [
      ['blog/post.html', '/blog', '[active]'],
      ['my-blog-post.html', '/blog', '[]'],
      ['abc/index.html', '/a', '[]'],
      ['news/docs-archive.html', '/docs', '[]'],
      ['foo/bar/docs.html', '/docs', '[]'],
      ['products/index.html', '/product', '[]'],
    ]
    it.each(cases)('%s against %s renders %s', (pageURL, href, expected) => {
      expect(render(t, { page: { pageURL }, href })).toBe(expected)
    })

    it('an empty href matches the root page only', () => {
      const empty =
        '{{#isActive page folderMatch=true}}[{{active}}]{{/isActive}}'
      expect(render(empty, { page: { pageURL: 'anything.html' } })).toBe('[]')
      expect(render(empty, { page: { pageURL: 'index.html' } })).toBe(
        '[active]',
      )
    })
  })

  describe('the same href works under either extensionLess setting', () => {
    const pageURLFor = (slug, extLess) => {
      const page = new KissPage('view.hbs', { hbs, logger: silentLogger })
      page.slug = slug
      page.extLess = extLess
      return page.pageURL()
    }
    const table = [
      [false, 'about', '/about', '[active]'],
      [false, 'about', '/about/', '[active]'],
      [false, 'about', '/', '[]'],
      [false, 'index', '/about', '[]'],
      [false, 'index', '/about/', '[]'],
      [false, 'index', '/', '[active]'],
      [true, 'about', '/about', '[active]'],
      [true, 'about', '/about/', '[active]'],
      [true, 'about', '/', '[]'],
      [true, 'index', '/about', '[]'],
      [true, 'index', '/about/', '[]'],
      [true, 'index', '/', '[active]'],
    ]
    it.each(table)(
      'extensionLess=%s, %s page, href=%s renders %s',
      (extLess, slug, href, expected) => {
        const pageURL = pageURLFor(slug, extLess)
        expect(render(tpl, { page: { pageURL }, href })).toBe(expected)
      },
    )
  })

  describe('degrades to inactive instead of throwing', () => {
    it('treats an explicitly undefined href as the home page href', () => {
      expect(render(tpl, { page: { pageURL: 'a.html' } })).toBe('[]')
      expect(warnings).toHaveLength(0)
    })

    it('warns when the page context carries no pageURL', () => {
      expect(
        render('{{#isActive page href="/x"}}[{{active}}]{{/isActive}}', {
          page: {},
        }),
      ).toBe('[]')
      expect(warnings).toHaveLength(1)
    })

    it('warns when the page argument is missing altogether', () => {
      expect(render('{{#isActive href="/x"}}[{{active}}]{{/isActive}}')).toBe(
        '[]',
      )
      expect(warnings).toHaveLength(1)
    })

    it('renders nothing when used as a non-block helper', () => {
      expect(render('{{isActive page href="/x"}}', { page: {} })).toBe('')
      expect(warnings).toHaveLength(1)
    })
  })
})

describe('canonical', () => {
  const pageURLFor = (slug, extLess) => {
    const page = new KissPage('view.hbs', { hbs, logger: silentLogger })
    page.slug = slug
    page.extLess = extLess
    return page.pageURL()
  }

  beforeEach(() => {
    hbs = makeHbs({ siteUrl: 'https://e.com' })
  })

  it('joins siteUrl to the page URL, without the extension', () => {
    expect(render('{{canonical}}', { pageURL: 'about.html' })).toBe(
      'https://e.com/about',
    )
  })

  it('gives the home page the site root with one trailing slash', () => {
    expect(render('{{canonical}}', { pageURL: 'index.html' })).toBe(
      'https://e.com/',
    )
  })

  it('keeps a nested page nested', () => {
    expect(render('{{canonical}}', { pageURL: 'blog/2026/post.html' })).toBe(
      'https://e.com/blog/2026/post',
    )
  })

  const table = [
    [false, 'about', 'https://e.com/about'],
    [true, 'about', 'https://e.com/about'],
    [false, 'index', 'https://e.com/'],
    [true, 'index', 'https://e.com/'],
  ]
  it.each(table)(
    'is the same URL with extensionLess=%s on the %s page',
    (extLess, slug, expected) => {
      const pageURL = pageURLFor(slug, extLess)
      expect(render('{{canonical}}', { pageURL })).toBe(expected)
    },
  )

  it('does not double the slash when siteUrl carries one', () => {
    hbs = makeHbs({ siteUrl: 'https://e.com/' })
    expect(render('{{canonical}}', { pageURL: 'about.html' })).toBe(
      'https://e.com/about',
    )
    expect(render('{{canonical}}', { pageURL: 'index.html' })).toBe(
      'https://e.com/',
    )
  })

  it('follows a siteUrl the page overrides for itself', () => {
    expect(
      render('{{canonical}}', {
        pageURL: 'about.html',
        config: { siteUrl: 'https://de.example' },
      }),
    ).toBe('https://de.example/about')
  })

  it('renders nothing and warns once per page when there is no siteUrl', () => {
    hbs = makeHbs()
    expect(render('{{canonical}}{{canonical}}', { pageURL: 'a.html' })).toBe('')
    expect(warnings).toHaveLength(1)
    render('{{canonical}}', { pageURL: 'b.html' })
    expect(warnings).toHaveLength(2)
  })

  it('finds the page when passed a context, as v1 templates did', () => {
    expect(render('{{canonical this}}', { pageURL: 'about.html' })).toBe(
      'https://e.com/about',
    )
    expect(warnings).toHaveLength(0)
  })

  it('warns rather than guessing when there is no page context', () => {
    expect(render('{{canonical}}')).toBe('')
    expect(warnings).toHaveLength(1)
  })
})

describe('absUrl', () => {
  beforeEach(() => {
    hbs = makeHbs({ siteUrl: 'https://e.com/' })
  })

  const paths = [
    ['/about', 'https://e.com/about'],
    ['about', 'https://e.com/about'],
    ['about/', 'https://e.com/about'],
    ['css/site.css', 'https://e.com/css/site.css'],
    ['/about/index.html', 'https://e.com/about'],
  ]
  it.each(paths)('resolves %s to %s', (p, expected) => {
    expect(render('{{absUrl p}}', { p })).toBe(expected)
  })

  it('returns an already absolute URL unchanged, siteUrl or not', () => {
    const cdn = 'https://cdn.example/logo.png'
    expect(render('{{absUrl p}}', { p: cdn })).toBe(cdn)
    hbs = makeHbs()
    expect(render('{{absUrl p}}', { p: cdn })).toBe(cdn)
    expect(warnings).toHaveLength(0)
  })

  it('is the page canonical when called with no path', () => {
    expect(render('{{absUrl}}', { pageURL: 'about.html' })).toBe(
      'https://e.com/about',
    )
  })

  it('renders nothing and warns once per page when there is no siteUrl', () => {
    hbs = makeHbs()
    expect(render('{{absUrl "/a"}}{{absUrl "/b"}}', {})).toBe('')
    expect(warnings).toHaveLength(1)
  })

  it('warns when the path it was handed is not a string', () => {
    expect(render('{{absUrl p}}', { p: null })).toBe('')
    expect(warnings).toHaveLength(1)
  })
})

describe('env', () => {
  it('chooses the branch by config.dev', () => {
    expect(render('{{#env is="prod"}}P{{else}}D{{/env}}')).toBe('P')
    const dev = makeHbs({ dev: true })
    expect(dev.compile('{{#env is="dev"}}D{{else}}P{{/env}}')({})).toBe('D')
  })

  it('renders the inverse for an environment name it does not know', () => {
    expect(render('{{#env is="staging"}}X{{else}}Y{{/env}}')).toBe('Y')
  })

  it('renders nothing and logs when "is" is missing or not a string', () => {
    expect(render('{{#env}}X{{else}}Y{{/env}}')).toBe('')
    expect(render('{{#env is=n}}X{{else}}Y{{/env}}', { n: 5 })).toBe('')
    expect(errors).toHaveLength(2)
  })
})

describe('lookup', () => {
  const obj = { present: 'yes' }

  it('returns the value with no warning when the key is present', () => {
    expect(render('{{lookup obj "present"}}', { obj })).toBe('yes')
    expect(warnings).toHaveLength(0)
  })

  it('renders nothing and warns naming the key when it is undefined', () => {
    expect(render('{{lookup obj "missing"}}', { obj })).toBe('')
    expect(warnings).toHaveLength(1)
    expect(warnings[0].join(' ')).toContain("'missing'")
  })

  it('names the page view when the root context carries one', () => {
    render('{{lookup obj "missing"}}', { obj, view: 'handbooks/uob.hbs' })
    expect(warnings[0].join(' ')).toContain('handbooks/uob.hbs')
  })

  it('warns once per page per key, however many times it is called', () => {
    render('{{lookup obj "a"}}{{lookup obj "a"}}{{lookup obj "b"}}', { obj })
    expect(warnings).toHaveLength(2)
    render('{{lookup obj "a"}}', { obj })
    expect(warnings).toHaveLength(3)
  })

  it('refuses prototype access exactly as the built-in does', () => {
    const plain = Handlebars.create()
    for (const key of ['__proto__', 'constructor']) {
      const src = `[{{lookup obj "${key}"}}]`
      expect(render(src, { obj })).toBe(plain.compile(src)({ obj }))
    }
  })

  it('still renders a dynamic partial whose key is present', () => {
    hbs.registerPartial('greeting', 'Hi')
    expect(render('{{> (lookup . "p")}}', { p: 'greeting' })).toBe('Hi')
    expect(warnings).toHaveLength(0)
  })

  it('fails the render as before when a dynamic partial key is missing', () => {
    expect(() => render('{{> (lookup . "p")}}', {})).toThrow(
      'The partial undefined could not be found',
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0].join(' ')).toContain("'p'")
  })
})

describe('asset', () => {
  const manifestOf = (entries) => {
    const manifest = createAssetManifest()
    for (const [key, value] of Object.entries(entries))
      manifest.record(key, value)
    return manifest
  }
  const plain = { 'css/site.css': 'css/site.css' }
  const hashed = { 'css/site.css': 'css/site.a1b2c3d4.css' }

  it('is the plain site-relative path when no policy is on', () => {
    hbs = makeHbs({ assets: { hash: false, version: null } }, manifestOf(plain))
    expect(render('{{asset "css/site.css"}}')).toBe('css/site.css')
  })

  it('is the hashed name the copy emitted when hashing is on', () => {
    hbs = makeHbs({ assets: { hash: true, version: null } }, manifestOf(hashed))
    expect(render('{{asset "css/site.css"}}')).toBe('css/site.a1b2c3d4.css')
  })

  it('leaves the base to the template', () => {
    hbs = makeHbs({ assets: { hash: true, version: null } }, manifestOf(hashed))
    // Root-relative, and the relative climb the layouts use, from one helper.
    expect(render('/{{asset "css/site.css"}}')).toBe('/css/site.a1b2c3d4.css')
    expect(render('{{root}}{{asset "css/site.css"}}', { root: '../' })).toBe(
      '../css/site.a1b2c3d4.css',
    )
  })

  it('appends the version query when a version is set', () => {
    hbs = makeHbs(
      { assets: { hash: false, version: '1.2.3' } },
      manifestOf(plain),
    )
    expect(render('{{asset "css/site.css"}}')).toBe('css/site.css?v=1.2.3')
    expect(render('/{{asset "css/site.css"}}')).toBe('/css/site.css?v=1.2.3')
  })

  it('ignores the version when hashing is on — the name already carries it', () => {
    hbs = makeHbs(
      { assets: { hash: true, version: '1.2.3' } },
      manifestOf(hashed),
    )
    expect(render('{{asset "css/site.css"}}')).toBe('css/site.a1b2c3d4.css')
  })

  it('takes a leading slash or none', () => {
    hbs = makeHbs({ assets: { hash: true, version: null } }, manifestOf(hashed))
    expect(render('{{asset "/css/site.css"}}')).toBe('css/site.a1b2c3d4.css')
  })

  it('composes with absUrl, keeping the hashed extension', () => {
    hbs = makeHbs(
      { siteUrl: 'https://e.com', assets: { hash: true, version: null } },
      manifestOf(hashed),
    )
    expect(render('{{absUrl (asset "css/site.css")}}')).toBe(
      'https://e.com/css/site.a1b2c3d4.css',
    )
    expect(warnings).toHaveLength(0)
  })

  it('composes with absUrl, keeping the version query unescaped', () => {
    hbs = makeHbs(
      { siteUrl: 'https://e.com/', assets: { hash: false, version: '1.2.3' } },
      manifestOf(plain),
    )
    expect(render('{{absUrl (asset "css/site.css")}}')).toBe(
      'https://e.com/css/site.css?v=1.2.3',
    )
    expect(warnings).toHaveLength(0)
  })

  it('passes a URL on another domain through untouched', () => {
    hbs = makeHbs({ assets: { hash: true, version: null } }, manifestOf(hashed))
    const cdn = 'https://cdn.example/site.css'
    expect(render('{{asset p}}', { p: cdn })).toBe(cdn)
    expect(render('{{absUrl (asset p)}}', { p: cdn })).toBe(cdn)
    expect(warnings).toHaveLength(0)
  })

  it('degrades to the path it was given, warning once per page per path', () => {
    hbs = makeHbs({ assets: { hash: true, version: null } }, manifestOf(hashed))
    const page = { view: 'index.hbs' }
    expect(
      hbs.compile('{{asset "css/nope.css"}}{{asset "css/nope.css"}}')(page),
    ).toBe('css/nope.csscss/nope.css')
    expect(warnings).toHaveLength(1)
    expect(String(warnings[0][0])).toContain('index.hbs')
    hbs.compile('{{asset "css/nope.css"}}')({ view: 'about.hbs' })
    expect(warnings).toHaveLength(2)
  })

  it('degrades with no manifest at all', () => {
    hbs = makeHbs()
    expect(render('{{asset "css/site.css"}}')).toBe('css/site.css')
    expect(warnings).toHaveLength(1)
  })

  it('warns when the path it was handed is not a string', () => {
    hbs = makeHbs({}, manifestOf(plain))
    expect(render('{{asset p}}', { p: null })).toBe('')
    expect(render('{{asset}}')).toBe('')
    expect(warnings).toHaveLength(2)
  })
})
