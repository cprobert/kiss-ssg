import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'
import { rebuildEntries } from '../../lib/rebuild.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

const build = (config = {}) =>
  new Kiss({ folders: site.folders, logger: silentLogger, ...config })
    .scan()
    .generate()
    .complete()

// What `complete()` rejected with, or null when it resolved.
const failureOf = (config) =>
  build(config).then(
    () => null,
    (err) => err,
  )

describe('.md partials render after Handlebars', () => {
  // Markdown used to run first, at registration: Remarkable escaped `"` to
  // `&quot;` and `>` to `&gt;`, and Handlebars then failed to parse the source.
  it('resolves {{link "id"}} and calls {{> "partial"}} inside a .md partial', async () => {
    site = await makeSite({
      'src/partials/nav.hbs': '<nav class="site-nav">menu</nav>',
      'src/partials/prose.md':
        'See [the about page]({{link "about"}}).\n\n{{> "nav"}}\n',
      'src/pages/index.hbs': '{{> "prose"}}',
      'src/pages/about.hbs': 'about',
    })
    await build()
    const html = await site.read('public/index.html')
    expect(html).toMatch(/<a href="[^"]*about[^"]*">the about page<\/a>/)
    expect(html).toContain('<nav class="site-nav">menu</nav>')
  })

  it('passes hash arguments to a partial a .md partial calls', async () => {
    site = await makeSite({
      'src/partials/callout.hbs': '<aside class="{{tone}}">careful</aside>',
      'src/partials/prose.md': '{{> "callout" tone="warn"}}\n',
      'src/pages/index.hbs': '{{> "prose"}}',
    })
    await build()
    expect(await site.read('public/index.html')).toContain(
      '<aside class="warn">careful</aside>',
    )
  })

  // The documented cost of the order (CHANGELOG 2.16.0, GUIDE): under
  // `markdown.html: false`, HTML that Handlebars inserted is Markdown's input
  // too, and is escaped with the rest.
  it('escapes inserted HTML under markdown.html: false', async () => {
    site = await makeSite({
      'src/partials/nav.hbs': '<nav class="site-nav">menu</nav>',
      'src/partials/prose.md': '{{> "nav"}}\n',
      'src/pages/index.hbs': '{{> "prose"}}',
    })
    await build({ markdown: { html: false } })
    const html = await site.read('public/index.html')
    expect(html).not.toContain('<nav class="site-nav">')
    expect(html).toContain('&lt;nav')
  })
})

describe('partial name collisions', () => {
  it('fails the build, naming both files, when foo.md and foo.hbs both exist', async () => {
    site = await makeSite({
      'src/partials/foo.md': '# Markdown',
      'src/partials/foo.hbs': 'HBS',
      'src/pages/index.hbs': '{{> "foo"}}',
      'src/pages/other.hbs': 'no partial here',
    })
    const err = await failureOf()
    expect(err).not.toBeNull()
    const collision = err.failures.find((f) => f.view === '<partials>')
    expect(collision.error.message).toMatch(/foo\.md/)
    expect(collision.error.message).toMatch(/foo\.hbs/)
    // The page that calls it fails too, rather than rendering either file.
    expect(err.failures.map((f) => f.view)).toContain('index.hbs')
    expect(await site.read('public/other.html')).toContain('no partial here')
  })

  it('fails the build when a partial and a layout share a name', async () => {
    site = await makeSite({
      'src/partials/main.hbs': 'partial',
      'src/layouts/main.hbs': 'layout',
      'src/pages/index.hbs': 'ok',
    })
    const err = await failureOf()
    expect(err).not.toBeNull()
    const collision = err.failures.find((f) => f.view === '<partials>')
    expect(collision.error.message).toMatch(/partials\/main\.hbs/)
    expect(collision.error.message).toMatch(/layouts\/main\.hbs/)
  })
})

describe('config.transforms', () => {
  it('renders a site transform after its async setup, with the call context', async () => {
    site = await makeSite({
      'src/partials/note.adoc': 'Hello {{who}}',
      'src/pages/index.hbs': '{{> "note" who="reader" size=2}}',
    })
    let prefix = null
    const calls = []
    await build({
      transforms: {
        adoc: {
          setup: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            prefix = 'ADOC'
          },
          render: (output, ctx) => {
            calls.push(ctx)
            return `<div class="adoc">${prefix}: ${output}</div>`
          },
        },
      },
    })
    expect(await site.read('public/index.html')).toContain(
      '<div class="adoc">ADOC: Hello reader</div>',
    )
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('note')
    expect(calls[0].file).toMatch(/partials\/note\.adoc$/)
    expect(calls[0].page).toMatch(/index\.html$/)
    expect(calls[0].hash).toEqual({ who: 'reader', size: 2 })
  })

  it('hands render the file as written when compile is false', async () => {
    site = await makeSite({
      'src/partials/raw.snip': 'kept {{as}} written',
      'src/pages/index.hbs': '{{> "raw"}}',
    })
    await build({
      transforms: {
        snip: { compile: false, render: (output) => `<pre>${output}</pre>` },
      },
    })
    expect(await site.read('public/index.html')).toContain(
      '<pre>kept {{as}} written</pre>',
    )
  })

  it('reports a failed setup and fails only the pages that call it', async () => {
    site = await makeSite({
      'src/partials/note.adoc': 'text',
      'src/pages/index.hbs': '{{> "note"}}',
      'src/pages/plain.hbs': 'plain page',
    })
    const err = await failureOf({
      transforms: {
        adoc: {
          setup: async () => {
            throw new Error('converter missing')
          },
          render: (output) => output,
        },
      },
    })
    expect(err).not.toBeNull()
    const views = err.failures.map((f) => f.view)
    expect(views).toContain('<transform .adoc>')
    expect(views).toContain('index.hbs')
    const page = err.failures.find((f) => f.view === 'index.hbs')
    expect(page.error.message).toMatch(/\.adoc transform's setup failed/)
    expect(await site.read('public/plain.html')).toContain('plain page')
  })

  // A scoped watch rebuild is the other path that renders, and it used to
  // await only the helpers: a page edited while a slow setup was pending
  // rendered before its transform could (Codex, slice 1, round 3).
  it('holds a scoped rebuild until every setup has settled', async () => {
    site = await makeSite({
      'src/partials/note.adoc': 'text',
      'src/pages/index.hbs': '{{> "note"}}',
    })
    let open
    const gate = new Promise((resolve) => {
      open = resolve
    })
    let ready = false
    const kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      transforms: {
        adoc: {
          setup: async () => {
            await gate
            ready = true
          },
          render: (output) => {
            if (!ready) throw new Error('rendered before setup')
            return `<adoc>${output}</adoc>`
          },
        },
      },
    }).scan()
    await Promise.all(kiss._promises)
    const rebuilt = rebuildEntries(kiss, kiss._stack)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(await site.exists('public/index.html')).toBe(false)
    open()
    await rebuilt
    expect(kiss._failures).toEqual([])
    expect(await site.read('public/index.html')).toContain('<adoc>text</adoc>')
  })

  it('refuses a transform for .hbs or .html, and a render that is not a function', () => {
    site = null
    expect(
      () =>
        new Kiss({
          logger: silentLogger,
          transforms: { hbs: { render: String } },
        }),
    ).toThrow(/take no transform/)
    expect(
      () => new Kiss({ logger: silentLogger, transforms: { adoc: {} } }),
    ).toThrow(/render must be a function/)
  })
})
