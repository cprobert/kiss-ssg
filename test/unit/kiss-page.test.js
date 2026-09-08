import { describe, it, expect, afterEach } from 'vitest'
import Handlebars from 'handlebars'
import { KissPage, loadMinifier, preloadMinifier } from '../../lib/kiss-page.js'
import { silentLogger } from '../../lib/logger.js'
import fs from 'fs-extra'
import path from 'node:path'
import { makeSite } from '../helpers/site.js'

const make = (view, opts = {}) => {
  const page = new KissPage(view, {
    hbs: Handlebars.create(),
    logger: silentLogger,
  })
  page.buildDir = opts.buildDir || 'out'
  page.pagesDir = opts.pagesDir || 'pages'
  page.path = opts.path
  page.slug = opts.slug
  if (opts.ext) page.ext = opts.ext
  page.extLess = !!opts.extLess
  page.isDev = !!opts.dev
  if (opts.livereloadPort) page.livereloadPort = opts.livereloadPort
  page.options = opts.options || {}
  return page.prepare()
}

describe('url inference', () => {
  it('builds <path>/<slug>.<ext> with a slugified path and slug', () => {
    const p = make('v.hbs', {
      path: '/About Us/',
      slug: 'Our Team',
      ext: '.xml',
    })
    expect(p.pageURL()).toBe('about-us/our-team.xml')
    expect(p.buildTo).toBe('out/about-us/our-team.xml')
  })

  it('sanitizes the extension so it cannot steer the output path', () => {
    const p = make('v.hbs', { slug: 's', ext: '../../x' })
    expect(p.buildTo).toBe('out/s.x')
    expect(make('v.hbs', { slug: 's', ext: '.xml' }).buildTo).toBe('out/s.xml')
  })

  it('defaults to index.html at the root', () => {
    expect(make('v.hbs').pageURL()).toBe('index.html')
  })

  it('extension-less mode nests non-index pages under <slug>/index.html', () => {
    expect(make('v.hbs', { slug: 'about', extLess: true }).pageURL()).toBe(
      'about/index.html',
    )
    expect(make('v.hbs', { slug: 'index', extLess: true }).pageURL()).toBe(
      'index.html',
    )
  })

  it('prepare() fills default title/path/slug/generate without clobbering options', () => {
    const p = make('v.hbs', { slug: 'x', options: { title: 'T' } })
    expect(p.options).toMatchObject({ title: 'T', slug: 'x', generate: true })
  })
})

describe('generate', () => {
  let site
  afterEach(async () => {
    if (site) await site.cleanup()
  })

  it('renders a string view, minifies, and resolves after the file is written', async () => {
    site = await makeSite({})
    const p = make('<p>  {{model.a}}  </p>', {
      buildDir: site.build,
      slug: 's',
      options: { model: { a: 1 } },
    })
    const out = await p.generate()
    expect(out).toBe(`${site.build}/s.html`)
    expect(await site.read('public/s.html')).toBe('<p>1</p>')
  })

  it('in dev mode injects livereload, keeps whitespace, and writes a debug json', async () => {
    site = await makeSite({})
    const p = make('<body>\n<p>x</p>\n</body>', {
      buildDir: site.build,
      slug: 'd',
      dev: true,
      options: { model: {} },
    })
    await p.generate()
    const html = await site.read('public/d.html')
    expect(html).toContain('livereload.js')
    expect(html).toContain('\n')
    expect(JSON.parse(await site.read('public/d.json')).pageURL).toBe('d.html')
  })

  // Flipped: this used to assert the hardcoded 'http://localhost:<port>' URL.
  // The snippet now resolves the host in the browser, so a page opened from
  // another device reaches the livereload server it was served from.
  it('builds the dev snippet URL from location.hostname and the configured port', async () => {
    site = await makeSite({})
    const p = make('<body>\n<p>x</p>\n</body>', {
      buildDir: site.build,
      slug: 'lr',
      dev: true,
      livereloadPort: 41234,
      options: { model: {} },
    })
    await p.generate()
    const html = await site.read('public/lr.html')
    expect(html).toContain('location.hostname')
    expect(html).toContain(':41234/livereload.js?snipver=1')
    expect(html).not.toContain('http://localhost:')
  })

  it('reads .hbs views from pagesDir', async () => {
    site = await makeSite({ 'pages/a.hbs': 'A={{title}}' })
    const p = make('a.hbs', {
      buildDir: site.build,
      pagesDir: `${site.root}/pages`,
      slug: 'a',
      options: { title: 'T' },
    })
    await p.generate()
    expect(await site.read('public/a.html')).toBe('A=T')
  })

  it('fails the page when a .hbs view cannot be read', async () => {
    site = await makeSite({})
    const p = make('missing.hbs', {
      buildDir: site.build,
      pagesDir: `${site.root}/pages`,
      slug: 'missing',
    })
    await expect(p.generate()).rejects.toThrow(/missing\.hbs/)
    expect(await site.exists('public/missing.html')).toBe(false)
  })

  it('compiles a view without a .hbs extension as an inline template', async () => {
    site = await makeSite({})
    const p = make('<p>{{title}}</p>', {
      buildDir: site.build,
      pagesDir: `${site.root}/pages`,
      slug: 'inline',
      options: { title: 'Inline' },
    })
    await p.generate()
    expect(await site.read('public/inline.html')).toBe('<p>Inline</p>')
  })

  it('refuses to write outside the build folder', async () => {
    site = await makeSite({})
    const p = make('<p>x</p>', { buildDir: site.build, slug: 's' })
    // Bypasses the setters deliberately: the guard is belt-and-braces behind
    // them, so it can only be exercised by crafting the buildTo directly.
    p._path = '../../escaped'
    const escaped = path.resolve(p.buildTo)
    await expect(p.generate()).rejects.toThrow(/build folder/)
    expect(await fs.pathExists(escaped)).toBe(false)
  })

  it('skips when options.generate is false', async () => {
    site = await makeSite({})
    const p = make('x', {
      buildDir: site.build,
      slug: 'n',
      options: { generate: false },
    })
    await p.generate()
    expect(await site.exists('public/n.html')).toBe(false)
  })

  it('names itself to its partials through the data frame, clearing its edges first', async () => {
    site = await makeSite({})
    const hbs = Handlebars.create()
    const seen = []
    hbs.registerPartial('p', (ctx, options) => {
      seen.push(options?.data?.kissPage)
      return 'P'
    })
    const calls = []
    const graph = {
      clearPage: (page) => calls.push(['clear', page]),
      usesOf: () => ['p'],
    }
    const page = new KissPage('<i>{{> p}}</i>', {
      hbs,
      logger: silentLogger,
      graph,
    })
    page.buildDir = site.build
    page.slug = 's'
    page.isDev = true
    page.options = {}
    page.prepare()
    await page.generate()
    expect(seen).toEqual([page.buildTo])
    expect(calls).toEqual([['clear', page.buildTo]])
    const sibling = JSON.parse(await site.read('public/s.json'))
    expect(sibling.partials).toEqual(['p'])
  })

  it('renders identically with no graph injected', async () => {
    site = await makeSite({})
    const p = make('<i>{{title}}</i>', {
      buildDir: site.build,
      slug: 't',
      options: { title: 'T' },
    })
    await p.generate()
    expect(await site.read('public/t.html')).toBe('<i>T</i>')
  })
})

// The template cache is the reason `_getTemplate` no longer reads and compiles
// on every render. These pin the three properties that make it safe rather
// than the fact that it is fast.
describe('template caching', () => {
  let site
  afterEach(async () => {
    if (site) await site.cleanup()
  })

  const pageOn = (hbs, view, opts) => {
    const page = new KissPage(view, { hbs, logger: silentLogger })
    page.buildDir = opts.buildDir
    page.pagesDir = opts.pagesDir
    page.slug = opts.slug
    page.options = opts.options || {}
    return page.prepare()
  }

  it('compiles a repeated view once and renders each page with its own model', async () => {
    site = await makeSite({ 'pages/item.hbs': '<p>{{model.a}}</p>' })
    const hbs = Handlebars.create()
    let compiles = 0
    const realCompile = hbs.compile.bind(hbs)
    hbs.compile = (text) => {
      compiles++
      return realCompile(text)
    }
    const opts = { buildDir: site.build, pagesDir: `${site.root}/pages` }

    for (const a of [1, 2, 3])
      await pageOn(hbs, 'item.hbs', {
        ...opts,
        slug: `s${a}`,
        options: { model: { a } },
      }).generate()

    expect(compiles).toBe(1)
    // The cached template is shared; the output must not be.
    expect(await site.read('public/s1.html')).toBe('<p>1</p>')
    expect(await site.read('public/s2.html')).toBe('<p>2</p>')
    expect(await site.read('public/s3.html')).toBe('<p>3</p>')
  })

  // The reason the cache hangs off a WeakMap on the environment rather than a
  // module-level Map: `hbs.compile` closes over the environment it was called
  // on, so a template compiled against one instance's helpers must never be
  // served to another's. Two environments, same view path, different helper.
  it('does not share a compiled template between Handlebars environments', async () => {
    site = await makeSite({ 'pages/v.hbs': '<p>{{shout}}</p>' })
    const opts = { buildDir: site.build, pagesDir: `${site.root}/pages` }

    const first = Handlebars.create()
    first.registerHelper('shout', () => 'FIRST')
    const second = Handlebars.create()
    second.registerHelper('shout', () => 'SECOND')

    await pageOn(first, 'v.hbs', { ...opts, slug: 'one' }).generate()
    await pageOn(second, 'v.hbs', { ...opts, slug: 'two' }).generate()

    expect(await site.read('public/one.html')).toBe('<p>FIRST</p>')
    expect(await site.read('public/two.html')).toBe('<p>SECOND</p>')
  })

  // The cache is validated by content, not mtime, so this pins the case an
  // mtime check gets wrong: the file changes but its timestamp does not. That
  // is what a coarse-granularity filesystem (exFAT, some network and WSL2
  // mounts) looks like when two saves land inside one tick.
  it('recompiles when the content changes even though the mtime does not', async () => {
    site = await makeSite({ 'pages/e.hbs': '<p>before</p>' })
    const hbs = Handlebars.create()
    const opts = { buildDir: site.build, pagesDir: `${site.root}/pages` }
    const file = path.join(site.root, 'pages/e.hbs')
    const { atime, mtime } = fs.statSync(file)

    await pageOn(hbs, 'e.hbs', { ...opts, slug: 'a' }).generate()
    expect(await site.read('public/a.html')).toBe('<p>before</p>')

    await fs.outputFile(file, '<p>after</p>')
    fs.utimesSync(file, atime, mtime)
    // utimes rounds to whole milliseconds; the point is only that it did not
    // move forward.
    expect(Math.abs(fs.statSync(file).mtimeMs - mtime.getTime())).toBeLessThan(
      1,
    )

    await pageOn(hbs, 'e.hbs', { ...opts, slug: 'b' }).generate()
    expect(await site.read('public/b.html')).toBe('<p>after</p>')
  })

  it('does not recompile when the file is rewritten with the same content', async () => {
    site = await makeSite({ 'pages/same.hbs': '<p>x</p>' })
    const hbs = Handlebars.create()
    let compiles = 0
    const realCompile = hbs.compile.bind(hbs)
    hbs.compile = (text) => {
      compiles++
      return realCompile(text)
    }
    const opts = { buildDir: site.build, pagesDir: `${site.root}/pages` }
    const file = path.join(site.root, 'pages/same.hbs')

    await pageOn(hbs, 'same.hbs', { ...opts, slug: 'a' }).generate()
    // A save that changes nothing (a formatter no-op, a touch) bumps the mtime
    // and used to force a recompile; the content check sees through it.
    await fs.outputFile(file, '<p>x</p>')
    const future = new Date(Date.now() + 2000)
    fs.utimesSync(file, future, future)
    await pageOn(hbs, 'same.hbs', { ...opts, slug: 'b' }).generate()

    expect(compiles).toBe(1)
    expect(await site.read('public/b.html')).toBe('<p>x</p>')
  })
})

describe('minifier loading', () => {
  // Every page's render starts concurrently, so the load must be one shared
  // promise — not a cached result that each early caller finds unset.
  it('hands every caller the same in-flight load', async () => {
    const a = loadMinifier()
    const b = loadMinifier()
    expect(a).toBe(b)
    expect(typeof (await a)).toBe('function')
  })

  it('preload starts the same load without waiting for it', async () => {
    preloadMinifier()
    expect(typeof (await loadMinifier())).toBe('function')
  })
})
