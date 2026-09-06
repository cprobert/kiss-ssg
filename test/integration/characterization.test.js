// These tests await kiss.complete() rather than polling for the output file to
// exist, because v1's fire-and-forget generate() is gone: v2's complete()
// resolves only after every queued page (and any sitemap()) has finished
// writing, so there's no window where a file exists but its content isn't.
import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import fs from 'fs-extra'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

describe('scan + generate', () => {
  it('builds every .hbs under pages, inferring slug and path from the view path', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '<h1>{{title}}</h1>',
      'src/pages/about/us.hbs': '<p>{{path}}/{{slug}}</p>',
    })
    const kiss = new Kiss({ folders: site.folders }).scan().generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('<h1>Index</h1>')
    expect(await site.read('public/about/us.html')).toBe('<p>about/us</p>')
  })

  it('auto-maps a model file with the same name as the view', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '<h1>{{title}}</h1><p>{{model.name}}</p>',
      'src/models/index.json': { title: 'Home', name: 'kiss' },
    })
    const kiss = new Kiss({ folders: site.folders }).scan().generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe(
      '<h1>Home</h1><p>kiss</p>',
    )
  })
})

describe('page()', () => {
  it('accepts an object model, a function controller, and explicit path/slug', async () => {
    site = await makeSite({
      'src/pages/item.hbs': '<i>{{title}}|{{model.name}}</i>',
    })
    const kiss = new Kiss({ folders: site.folders })
      .page({
        view: 'item.hbs',
        model: { name: 'kiss' },
        path: 'things',
        slug: 'One Thing',
        controller: ({ model }) => ({ title: model.name.toUpperCase() }),
      })
      .generate()
    await kiss.complete()
    expect(await site.read('public/things/one-thing.html')).toBe(
      '<i>KISS|kiss</i>',
    )
  })

  it('renders a string view with an explicit slug', async () => {
    site = await makeSite({})
    const kiss = new Kiss({ folders: site.folders })
      .page({
        view: 'Hello {{model.name}}',
        model: { name: 'world' },
        slug: 'hello-snippet',
      })
      .generate()
    await kiss.complete()
    expect(await site.read('public/hello-snippet.html')).toBe('Hello world')
  })

  it('does not derive an output folder from an inline template body', async () => {
    site = await makeSite({})
    const kiss = new Kiss({ folders: site.folders })
      .page({ view: '<p>no slash here</p>', slug: 'ok' })
      .page({
        view: '<html><body><h1>{{title}}</h1></body></html>',
        slug: 'about',
      })
      .generate()
    await kiss.complete()
    expect(await site.exists('public/ok.html')).toBe(true)
    expect(await site.exists('public/about.html')).toBe(true)
  })

  it('honours a custom extension', async () => {
    site = await makeSite({ 'src/pages/feed.hbs': '<rss>{{model.name}}</rss>' })
    const kiss = new Kiss({ folders: site.folders })
      .page({ view: 'feed.hbs', ext: 'xml', model: { name: 'x' } })
      .generate()
    await kiss.complete()
    expect(await site.read('public/feed.xml')).toBe('<rss>x</rss>')
  })

  it('passes [{ id, data }] to the generate callback with `this` bound to the instance', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'x',
      'src/models/index.json': { title: 'Home' },
    })
    let seen = null
    const kiss = new Kiss({ folders: site.folders })
    kiss
      .page({ view: 'index.hbs', model: 'index.json' })
      .generate(function (data) {
        seen = { self: this, data }
      })
    await kiss.complete()
    expect(seen.self).toBe(kiss)
    const entry = seen.data.find((d) => d.id === 'index.json')
    expect(entry.data).toEqual({ title: 'Home' })
    expect(kiss.getModelByID('index.json', seen.data)).toEqual({
      title: 'Home',
    })
  })
})

describe('pages()', () => {
  it('fans out one page per array item, appending -N to the slug', async () => {
    site = await makeSite({ 'src/pages/course.hbs': '{{model.name}}' })
    const kiss = new Kiss({ folders: site.folders })
      .pages({ view: 'course.hbs', model: [{ name: 'a' }, { name: 'b' }] })
      .generate()
    await kiss.complete()
    expect(await site.read('public/course-1.html')).toBe('a')
    expect(await site.read('public/course-2.html')).toBe('b')
  })

  it('derives a page option from every item, not just the first', async () => {
    site = await makeSite({
      'src/pages/course.hbs': '{{title}}|{{model.name}}',
    })
    const kiss = new Kiss({ folders: site.folders })
      .pages({
        view: 'course.hbs',
        model: [
          { title: 'One', name: 'a' },
          { title: 'Two', name: 'b' },
        ],
      })
      .generate()
    await kiss.complete()
    expect(await site.read('public/course-1.html')).toBe('One|a')
    expect(await site.read('public/course-2.html')).toBe('Two|b')
  })

  it('lets the controller derive the slug from the model', async () => {
    site = await makeSite({ 'src/pages/course.hbs': '{{model.name}}' })
    const kiss = new Kiss({ folders: site.folders })
      .pages({
        view: 'course.hbs',
        model: [{ name: 'alpha' }, { name: 'beta' }],
        controller: ({ model }) => ({ slug: model.name }),
      })
      .generate()
    await kiss.complete()
    expect(await site.read('public/alpha.html')).toBe('alpha')
  })

  it('gives every item its own file when the titles are non-Latin', async () => {
    site = await makeSite({ 'src/pages/post.hbs': '{{model.title}}' })
    const kiss = new Kiss({ folders: site.folders })
      .pages({
        view: 'post.hbs',
        model: [
          { title: '日本語のページ' },
          { title: '안녕하세요' },
          { title: 'Über uns' },
          { title: 'Notre équipe' },
        ],
        controller: ({ model }) => ({ slug: model.title }),
      })
      .generate()
    await expect(kiss.complete()).resolves.toBeDefined()
    const built = kiss._stack.map((entry) => entry.buildTo)
    expect(new Set(built).size).toBe(4)
    expect(built).toContain(`${site.build}/uber-uns.html`)
    expect(built).toContain(`${site.build}/notre-equipe.html`)
    for (const file of built) expect(await fs.pathExists(file)).toBe(true)
  })

  it('loads every *.json in a models folder as the array', async () => {
    site = await makeSite({
      'src/pages/member.hbs': '{{model.name}}',
      'src/models/team/a.json': { name: 'a' },
      'src/models/team/b.json': { name: 'b' },
    })
    const kiss = new Kiss({ folders: site.folders })
      .pages({ view: 'member.hbs', model: 'team' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/member-1.html')).toBe('a')
  })
})

describe('extensionLess', () => {
  it('writes non-index pages to <path>/<slug>/index.html', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'home',
      'src/pages/about/us.hbs': 'us',
    })
    const kiss = new Kiss({ folders: site.folders, extensionLess: true })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.exists('public/about/us/index.html')).toBe(true)
    expect(await site.exists('public/index.html')).toBe(true)
  })
})

describe('assets', () => {
  it('compiles scss to css and copies everything else, excluding sass sources', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'x',
      'src/assets/css/site.scss': '$c: red; body { color: $c; }',
      'src/assets/robots.txt': 'User-agent: *',
    })
    const kiss = new Kiss({ folders: site.folders }).scan().generate()
    await kiss.complete()
    expect(await site.read('public/css/site.css')).toContain('color:red')
    expect(await site.exists('public/css/site.scss')).toBe(false)
    expect(await site.exists('public/robots.txt')).toBe(true)
  })
})

describe('partials, layouts and helpers', () => {
  it('renders hbs/html/md partials inside a layout', async () => {
    site = await makeSite({
      'src/layouts/layout.hbs': '<main>{{#block "body"}}{{/block}}</main>',
      'src/partials/nav.hbs': '<nav>{{title}}</nav>',
      'src/partials/note.md': '# Note',
      'src/partials/foot.html': '<footer>f</footer>',
      'src/pages/index.hbs':
        '{{#extend "layout"}}{{#content "body"}}{{> nav}}{{> note}}{{> foot}}{{/content}}{{/extend}}',
    })
    const kiss = new Kiss({ folders: site.folders }).scan().generate()
    await kiss.complete()
    const html = await site.read('public/index.html')
    expect(html).toContain('<nav>Index</nav>')
    expect(html).toContain('<h1>Note</h1>')
    expect(html).toContain('<footer>f</footer>')
  })

  it('exposes markdown, stringify, env and isActive helpers', async () => {
    site = await makeSite({
      'src/pages/about.hbs': [
        '{{#markdown}}# Hi{{/markdown}}',
        '{{{stringify model}}}',
        '{{#env is="prod"}}PROD{{else}}DEV{{/env}}',
        '{{#isActive this href="/about"}}<a class="{{active}}">A</a>{{/isActive}}',
      ].join(''),
    })
    const kiss = new Kiss({ folders: site.folders })
      .page({ view: 'about.hbs', model: { a: 1 } })
      .generate()
    await kiss.complete()
    const html = await site.read('public/about.html')
    expect(html).toContain('<h1>Hi</h1>')
    expect(html).toContain('"a": 1')
    expect(html).toContain('PROD')
    expect(html).toContain('<a class="active">A</a>')
  })
})

describe('sitemap()', () => {
  it('writes sitemap.xml from registered pages with per-page overrides', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'x',
      'src/pages/about.hbs': 'x',
      'src/pages/hidden.hbs': 'x',
    })
    const kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://example.com/',
    })
      .page({ view: 'index.hbs' })
      .page({
        view: 'about.hbs',
        sitemapPriority: '0.5',
        sitemapChangefreq: 'weekly',
      })
      .page({ view: 'hidden.hbs', ignoreSitemap: true })
      .generate()
      .sitemap()
    await kiss.complete()
    const xml = await site.read('public/sitemap.xml')
    expect(xml).toContain('<loc>https://example.com/</loc>')
    expect(xml).toContain('<loc>https://example.com/about</loc>')
    expect(xml).not.toContain('hidden')
    expect(xml).toContain('<priority>0.5</priority>')
    expect(xml).toContain('<changefreq>weekly</changefreq>')
  })
})

describe('per-page config', () => {
  it('keeps a controller mutating options.config out of every other page, the instance config and the sitemap', async () => {
    site = await makeSite({
      'src/pages/one.hbs': '<a>{{config.siteUrl}}</a>',
      'src/pages/two.hbs': '<b>{{config.siteUrl}}</b>',
    })
    const kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://good.example',
    })
      .page({
        view: 'one.hbs',
        controller: (options) => {
          options.config.siteUrl = 'https://evil.example'
          return {}
        },
      })
      .page({ view: 'two.hbs' })
      .generate()
      .sitemap()
    await kiss.complete()
    expect(await site.read('public/one.html')).toBe(
      '<a>https://evil.example</a>',
    )
    expect(await site.read('public/two.html')).toBe(
      '<b>https://good.example</b>',
    )
    expect(kiss.config.siteUrl).toBe('https://good.example')
    const xml = await site.read('public/sitemap.xml')
    expect(xml).toContain('<loc>https://good.example/one</loc>')
    expect(xml).not.toContain('evil.example')
  })

  it('honours a caller-supplied options.config as a per-page override', async () => {
    site = await makeSite({
      'src/pages/one.hbs': '<a>{{config.siteUrl}}</a>',
      'src/pages/two.hbs': '<b>{{config.siteUrl}}</b>',
    })
    const kiss = new Kiss({ folders: site.folders, siteUrl: 'https://global' })
      .page({ view: 'one.hbs', config: { siteUrl: 'https://per-page' } })
      .page({ view: 'two.hbs' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/one.html')).toBe('<a>https://per-page</a>')
    expect(await site.read('public/two.html')).toBe('<b>https://global</b>')
    expect(kiss.config.siteUrl).toBe('https://global')
  })

  it('gives each fanned-out page its own config copy', async () => {
    site = await makeSite({ 'src/pages/course.hbs': '{{config.siteUrl}}' })
    const kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://good.example',
    })
      .pages({
        view: 'course.hbs',
        model: [{ name: 'a' }, { name: 'b' }],
        controller: (options) => {
          if (options.model.name === 'a')
            options.config.siteUrl = 'https://evil.example'
          return {}
        },
      })
      .generate()
    await kiss.complete()
    expect(await site.read('public/course-1.html')).toBe('https://evil.example')
    expect(await site.read('public/course-2.html')).toBe('https://good.example')
  })
})
