import { describe, it, expect, afterEach } from 'vitest'
import Handlebars from 'handlebars'
import { KissPage } from '../../lib/kiss-page.js'
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
})
