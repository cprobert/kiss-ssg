import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import Handlebars from 'handlebars'
import { Remarkable } from 'remarkable'
import { registerHandlebarsHelpers } from '../../lib/handlebars-helpers.js'
import { KissPage } from '../../lib/kiss-page.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let hbs
let warnings
let errors
const render = (src, ctx = {}) => hbs.compile(src)(ctx)

// A recording logger so the degrade-instead-of-throw paths can assert that the
// template author was told, not just that nothing blew up.
const makeHbs = (config = {}) => {
  const env = Handlebars.create()
  registerHandlebarsHelpers(
    env,
    { dev: false, sass: { includePaths: [] }, ...config },
    {
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
