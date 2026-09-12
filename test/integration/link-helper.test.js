import { describe, it, expect, afterEach, vi } from 'vitest'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

// The dev-mode degrade is one of the cases below, and binding a real livereload
// port to prove it would be neither necessary nor kind to the test run.
vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: () => {},
  }),
}))
const { default: Kiss } = await import('../helpers/kiss.js')

const SITE_URL = 'https://site.example'

let site
let kiss
let notices
let warnings

// A logger that records the two lines identity can produce — the collision
// notice and the dev-mode warning — and stays silent otherwise.
const recording = () => {
  notices = []
  warnings = []
  return {
    ...silentLogger,
    notice: (...args) => notices.push(args.join(' ')),
    warn: (...args) => warnings.push(args.join(' ')),
  }
}

const config = (extra = {}) => ({
  folders: site.folders,
  siteUrl: SITE_URL,
  logger: recording(),
  ...extra,
})

const idsOf = (report) =>
  Object.fromEntries(report.pages.map((p) => [p.buildTo, p.id]))

afterEach(async () => {
  if (kiss) await kiss.close()
  kiss = null
  if (site) await site.cleanup()
  site = null
})

describe('page identity', () => {
  it('defaults a .page() and a .scan() page to its view route', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '<p>home</p>',
      'src/pages/about.hbs': '<p>about</p>',
      'src/pages/blog/listing.hbs': '<p>listing</p>',
    })
    kiss = new Kiss(config())
      // Registered by name, and the rest found by the scan — both arrive at the
      // same rule, the view's route with its extension removed.
      .page({ view: 'about.hbs' })
      .scan()
      .generate()
    await kiss.complete()

    expect(idsOf(kiss.report())).toEqual({
      [`${site.build}/about.html`]: 'about',
      [`${site.build}/index.html`]: 'index',
      [`${site.build}/blog/listing.html`]: 'blog/listing',
    })
  })

  it('gives an inline template and a generate:false page no id', async () => {
    site = await makeSite({ 'src/pages/hidden.hbs': '<p>hidden</p>' })
    kiss = new Kiss(config())
      .page({ view: '<p>inline</p>', slug: 'snippet' })
      .page({ view: 'hidden.hbs', generate: false })
      .generate()
    await kiss.complete()

    expect(kiss.report().pages.map((p) => p.id)).toEqual([null, null])
  })

  it('defaults a fan-out item to the view route and the normalised slug', async () => {
    site = await makeSite({
      'src/pages/blog/post.hbs': '<p>{{model.title}}</p>',
      'src/models/posts.json': [{ title: 'Hello World' }, { title: 'Second' }],
    })
    kiss = new Kiss(config())
      .pages({
        view: 'blog/post.hbs',
        model: 'posts.json',
        path: 'blog',
        // The slug is only normalised by `KissPage`, which is why the id is
        // computed after `prepare()` — `Hello World` is linked as `hello-world`.
        controller: ({ model }) => ({ slug: model.title }),
      })
      .generate()
    await kiss.complete()

    expect(idsOf(kiss.report())).toEqual({
      [`${site.build}/blog/hello-world.html`]: 'blog/post/hello-world',
      [`${site.build}/blog/second.html`]: 'blog/post/second',
    })
  })

  it('uses a registration id as the prefix, so one view fans out twice without colliding', async () => {
    site = await makeSite({
      'src/pages/blog/post.hbs': '<p>{{model.title}}</p>',
    })
    const records = [{ title: 'One', slug: 'one' }]
    kiss = new Kiss(config())
      .pages({
        view: 'blog/post.hbs',
        model: records,
        path: 'blog',
        controller: ({ model }) => ({ slug: model.slug }),
      })
      // The same view into another folder: the registration's `id` is the
      // items' prefix, never an id an item claims.
      .pages({
        view: 'blog/post.hbs',
        model: records,
        path: 'archive',
        id: 'archive',
        controller: ({ model }) => ({ slug: model.slug }),
      })
      .generate()
    await kiss.complete()

    expect(idsOf(kiss.report())).toEqual({
      [`${site.build}/blog/one.html`]: 'blog/post/one',
      [`${site.build}/archive/one.html`]: 'archive/one',
    })
    expect(notices).toEqual([])
  })

  it("lets a record's own id win over the prefix", async () => {
    site = await makeSite({ 'src/pages/blog/post.hbs': '<p>post</p>' })
    kiss = new Kiss(config())
      .pages({
        view: 'blog/post.hbs',
        path: 'blog',
        model: [
          { slug: 'one', id: 'the-first-post' },
          { slug: 'two' },
          // Not an id: a record whose `id` field is a database integer is data
          // about the record, not a claim on a page's identity.
          { slug: 'three', id: 7 },
        ],
        controller: ({ model }) => ({ slug: model.slug }),
      })
      .generate()
    await kiss.complete()

    expect(idsOf(kiss.report())).toEqual({
      [`${site.build}/blog/one.html`]: 'the-first-post',
      [`${site.build}/blog/two.html`]: 'blog/post/two',
      [`${site.build}/blog/three.html`]: 'blog/post/three',
    })
  })
})

describe('id collisions', () => {
  it('fails the build when two pages claim one explicit id', async () => {
    site = await makeSite({
      'src/pages/a.hbs': '<p>a</p>',
      'src/pages/b.hbs': '<p>b</p>',
    })
    kiss = new Kiss(config())
      .page({ view: 'a.hbs', id: 'home' })
      .page({ view: 'b.hbs', id: 'home' })
      .generate()

    const error = await kiss.complete().catch((err) => err)
    expect(error.failures.map((f) => f.error.message)).toEqual([
      'Page id already claimed: home',
    ])
    expect(error.report.ok).toBe(false)
  })

  it('withdraws both default ids when two pages arrive at one, with a notice', async () => {
    site = await makeSite({
      'src/pages/blog/listing.hbs': '<p>page {{model.number}}</p>',
      'src/pages/index.hbs': '<a href="{{link "blog/listing"}}">list</a>',
    })
    kiss = new Kiss(config())
      // The shape this rule exists for: one view registered twice, which is how
      // pagination is written.
      .page({ view: 'blog/listing.hbs', path: 'blog', slug: 'index' })
      .page({ view: 'blog/listing.hbs', path: 'blog/page', slug: '2' })
      .page({ view: 'index.hbs' })
      .generate()

    const error = await kiss.complete().catch((err) => err)
    // The build still queues both pages — it is the *id* that is withdrawn, not
    // the page — and only the page that tried to link it failed.
    expect(notices).toEqual([
      'Two pages share the default id "blog/listing" (blog/listing.hbs, blog/listing.hbs): neither can be linked — set an explicit id on each',
    ])
    expect(error.failures.map((f) => f.error.message)).toEqual([
      `link: id "blog/listing" is the default id of more than one page (blog/listing.hbs, blog/listing.hbs), so no page claims it — set an explicit id (asked by index.hbs / ${site.build}/index.html)`,
    ])
    // Withdrawn means withdrawn: neither page carries the id on the record.
    expect(
      error.report.pages
        .filter((p) => p.view === 'blog/listing.hbs')
        .map((p) => p.id),
    ).toEqual([null, null])
  })

  it('lets an explicit id beat a default one, and says which page lost', async () => {
    site = await makeSite({
      'src/pages/blog.hbs': '<p>the listing</p>',
      'src/pages/blog/index.hbs': '<p>the section</p>',
      'src/pages/index.hbs': '<a href="{{link "blog"}}">list</a>',
    })
    kiss = new Kiss(config())
      .page({ view: 'blog.hbs' })
      // Claims the id `blog.hbs` would have defaulted to.
      .page({ view: 'blog/index.hbs', id: 'blog' })
      .page({ view: 'index.hbs' })
      .generate()
    await kiss.complete()

    expect(notices).toEqual([
      'Page id "blog" is claimed by blog/index.hbs, so the default id of blog.hbs is withdrawn: set an explicit id to link to it',
    ])
    // The explicit page is what the link resolves to, and the loser reports no
    // id at all.
    expect(await site.read('public/index.html')).toContain('href="/blog/"')
    expect(idsOf(kiss.report())).toMatchObject({
      [`${site.build}/blog.html`]: null,
      [`${site.build}/blog/index.html`]: 'blog',
    })
  })
})

describe('{{link}} in a real site', () => {
  const FILES = {
    'src/layouts/layout.hbs': [
      '<!doctype html><html><body>',
      '<nav>',
      '<a href="{{link "index"}}">Home</a>',
      '<a href="{{link "about"}}">About</a>',
      '<a href="{{link "blog/post" slug="Cascara Experiment"}}">Post</a>',
      '<a href="{{link "data"}}">Data</a>',
      '<a href="{{link "about" absolute=true}}">About, absolutely</a>',
      '<a href="{{link "data" absolute=true}}">Data, absolutely</a>',
      '<a href="{{link "about" canonical=true}}">About, canonically</a>',
      '</nav>',
      '{{#block "body"}}{{/block}}',
      '</body></html>',
    ].join(''),
    'src/pages/index.hbs':
      '{{#extend "layout"}}{{#content "body"}}<p>home</p>{{/content}}{{/extend}}',
    'src/pages/about.hbs': '<p>about</p>',
    'src/pages/data.hbs': '{"ok":true}',
    'src/pages/blog/post.hbs': '<p>{{model.title}}</p>',
  }

  const withLinks = (extra = {}) =>
    new Kiss(config(extra))
      .page({ view: 'index.hbs' })
      .page({ view: 'about.hbs' })
      // An `index.<ext>` page: a file, not a directory index, in both the
      // relative and the absolute form.
      .page({ view: 'data.hbs', path: 'data', slug: 'index', ext: 'json' })
      .pages({
        view: 'blog/post.hbs',
        path: 'blog',
        model: [{ title: 'Cascara Experiment', slug: 'Cascara Experiment' }],
        controller: ({ model }) => ({ slug: model.slug }),
      })
      .generate()

  it('renders the path each page is actually served at, extensions and all', async () => {
    site = await makeSite(FILES)
    kiss = withLinks()
    await kiss.complete()

    const home = await site.read('public/index.html')
    expect(home).toContain('href="/"')
    expect(home).toContain('href="/about.html"')
    expect(home).toContain('href="/blog/cascara-experiment.html"')
    expect(home).toContain('href="/data/index.json"')
    expect(home).toContain(`href="${SITE_URL}/about.html"`)
    // The case `toAbsoluteUrl` would have got wrong: `/data/` is a directory
    // with no index.html in it.
    expect(home).toContain(`href="${SITE_URL}/data/index.json"`)
    expect(home).toContain('href="/about"')
  })

  it('follows the same pages under extensionLess, with no template change', async () => {
    site = await makeSite(FILES)
    kiss = withLinks({ extensionLess: true })
    await kiss.complete()

    const home = await site.read('public/index.html')
    expect(home).toContain('href="/"')
    expect(home).toContain('href="/about/"')
    expect(home).toContain('href="/blog/cascara-experiment/"')
    // `extLess` is ignored for a slug of `index`, so this page does not move.
    expect(home).toContain('href="/data/index.json"')
    expect(home).toContain(`href="${SITE_URL}/about/"`)
    // Where the site is extension-less the served and canonical forms coincide.
    expect(home).toContain('href="/about/"')
  })

  it('reports no broken links for a site linked entirely by id', async () => {
    site = await makeSite(FILES)
    kiss = withLinks()
    await kiss.complete()

    const { links } = kiss.report()
    expect(links.broken).toEqual([])
    // Every `{{link}}` the layout wrote was classified and resolved, the
    // absolute pair included — a count, not a zero, so the assertion cannot
    // pass by the scan having seen nothing.
    expect(links.checked).toBeGreaterThan(0)
  })

  it('reports a link to a page that failed to render as broken', async () => {
    site = await makeSite({
      ...FILES,
      'src/pages/index.hbs':
        '<a href="{{link "about"}}">About</a><a href="{{link "gone"}}">Gone</a>',
      // The page exists in the registry and claims an id, but its view does
      // not, so it writes no bytes — which is exactly what makes the link to it
      // a finding rather than a lie.
      'src/pages/about.hbs': '<p>about</p>',
    })
    kiss = new Kiss(config())
      .page({ view: 'index.hbs' })
      .page({ view: 'about.hbs' })
      .page({ view: 'gone.hbs' })
      .generate()

    const error = await kiss.complete().catch((err) => err)
    expect(error.report.links.broken).toEqual([
      { page: `${site.build}/index.html`, href: '/gone.html' },
    ])
  })
})

describe('what can be linked', () => {
  const LATE = {
    'src/pages/index.hbs': '<a href="{{link "late"}}">Late</a>',
    'src/pages/late.hbs': '<p>late</p>',
  }

  it('resolves a page registered after .generate() when its model settles in time', async () => {
    site = await makeSite(LATE)
    kiss = new Kiss(config())
    kiss.page({ view: 'index.hbs' }).generate()
    // Synchronously after the call: the model chain settles in microtasks,
    // before generate's own `.then` iterates the stack.
    kiss.page({ view: 'late.hbs' })
    await kiss.complete()

    expect(await site.read('public/index.html')).toContain('href="/late.html"')
  })

  it('fails the linking page when the late registration is deferred', async () => {
    site = await makeSite(LATE)
    kiss = new Kiss(config())
    kiss.page({ view: 'index.hbs' }).generate()
    // Registered after that render pass has finished, rather than in the
    // microtasks before it: order-dependent and unsupported, and it fails
    // loudly rather than shipping a bad href. (A wall-clock delay would race
    // the asset copy the render pass waits on, which is the race itself.)
    await Promise.allSettled(kiss._generating)
    kiss.page({ view: 'late.hbs' })

    const error = await kiss.complete().catch((err) => err)
    expect(error.failures[0].error.message).toContain(
      'link: no page with id "late"',
    )
  })

  it('sees the new registry after a whole-site replay', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '<a href="{{link "about"}}">About</a>',
      'src/pages/about.hbs': '<p>about</p>',
    })
    kiss = new Kiss(config()).scan().generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toContain('href="/about.html"')

    // A replay throws the whole stack away and rebuilds it; a lookup that had
    // captured the array (or an index built at helper registration) would serve
    // the first build's registry forever.
    await site.touch('src/pages/contact.hbs', '<p>contact</p>')
    await site.touch(
      'src/pages/index.hbs',
      '<a href="{{link "contact"}}">Contact</a>',
    )
    await kiss._requestReplay()

    expect(await site.read('public/index.html')).toContain(
      'href="/contact.html"',
    )
  })
})

describe('the record', () => {
  it('carries each page id on the report, the site map and last-build.json', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '<p>home</p>',
      'src/pages/about.hbs': '<p>about</p>',
      'src/pages/blog/listing.hbs': '<p>listing</p>',
    })
    // `KISS_AIKB` is read from `process.env` as the build settles, exactly as
    // `kiss-ssg aikb` sets it — the only thing that writes the folder.
    vi.stubEnv('KISS_AIKB', '1')
    kiss = new Kiss(
      config({ folders: { ...site.folders, aikb: `${site.root}/AIKB` } }),
    )
      .page({ view: 'index.hbs' })
      .page({ view: 'about.hbs', id: 'about-us' })
      // Two registrations of one view: the withdrawn default id is `none` on
      // the map rather than an id `{{link}}` would refuse.
      .page({ view: 'blog/listing.hbs', path: 'blog', slug: 'index' })
      .page({ view: 'blog/listing.hbs', path: 'blog/page', slug: '2' })
      .generate()
    await kiss.complete()

    expect(idsOf(kiss.report())).toEqual({
      [`${site.build}/index.html`]: 'index',
      [`${site.build}/about.html`]: 'about-us',
      [`${site.build}/blog/index.html`]: null,
      [`${site.build}/blog/page/2.html`]: null,
    })

    // The map is the same identity one file over, and it is read as the link
    // autocomplete — so the id sits right after the output path, in the JSON
    // rows and as the `Id` column of the markdown table.
    const map = JSON.parse(await site.read('AIKB/site-map.json'))
    expect(map.pages.map((page) => [page.buildTo, page.id])).toEqual([
      [`${site.build}/about.html`, 'about-us'],
      [`${site.build}/blog/index.html`, null],
      [`${site.build}/blog/page/2.html`, null],
      [`${site.build}/index.html`, 'index'],
    ])
    expect(Object.keys(map.pages[0])).toEqual([
      'buildTo',
      'id',
      'view',
      'model',
      'controller',
      'partials',
    ])
    const mapMd = await site.read('AIKB/site-map.md')
    // The column, right after Output. `table()` pads to the widest cell, so the
    // header is matched by shape rather than by its exact spacing.
    expect(mapMd).toMatch(
      /\| Output +\| Id +\| View +\| Model +\| Controller +\| Partials & layouts +\|/,
    )
    expect(mapMd).toContain('`about-us`')
    // `none`, the same word the Model and Controller columns use for nothing.
    expect(mapMd).toMatch(/blog\/page\/2\.html` +\| none +\|/)

    const last = JSON.parse(await site.read('AIKB/last-build.json'))
    expect(last.pages.map((page) => page.id)).toEqual(
      kiss.report().pages.map((page) => page.id),
    )
  })
})

describe('dev mode', () => {
  it('warns and renders # instead of failing the page', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '<a href="{{link "nope"}}">Nope</a>',
    })
    kiss = new Kiss(config({ dev: true, port: 0, livereloadPort: 0 }))
      .page({ view: 'index.hbs' })
      .generate()
    await kiss.complete()

    expect(await site.read('public/index.html')).toContain('href="#"')
    expect(
      warnings.some((w) => w.includes('link: no page with id "nope"')),
    ).toBe(true)
  })
})
