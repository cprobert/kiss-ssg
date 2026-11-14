import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

// A paragraph hard-wrapped at the source's own column, the shape a hand-authored
// `.md` partial usually has. Under `breaks: true` every one of these newlines
// becomes a `<br />` mid-sentence.
const WRAPPED = `A paragraph that the author wrapped
at the source's own column, because that
is how prose is written in a file.`

// `typographer` is the discriminator the `config.markdown` tests below assert
// on. Tag syntax cannot serve: a non-dev build minifies, and the minifier
// rewrites the self-closed `<br />` to `<br>` whatever `xhtmlOut` said. The
// typographer's substitutions are text, so they survive it. It is also an
// option kiss has no opinion about, which is the point — the block is handed to
// markdown-it as-is rather than being a fixed list of keys kiss knows.
const TYPOGRAPHY = '(c) 2026'

const siteWith = (partial) => ({
  'src/partials/prose.md': partial,
  'src/pages/index.hbs': '{{> "prose"}}',
})

describe('markdown rendering defaults', () => {
  it('renders a hard-wrapped .md partial as one paragraph, with no <br />', async () => {
    site = await makeSite(siteWith(WRAPPED))
    await new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
      .complete()
    const html = await site.read('public/index.html')
    expect(html).not.toContain('<br')
    // One paragraph, wrap points joined by plain whitespace.
    expect(html).toMatch(/wrapped\s+at the source's own column/)
  })

  it('leaves typographer off, so punctuation is passed through as written', async () => {
    site = await makeSite(siteWith(TYPOGRAPHY))
    await new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
      .complete()
    expect(await site.read('public/index.html')).toContain('(c) 2026')
  })
})

describe('config.markdown', () => {
  it('reaches .md partials without a manual registerPartials() call', async () => {
    site = await makeSite(siteWith(TYPOGRAPHY))
    await new Kiss({
      folders: site.folders,
      logger: silentLogger,
      markdown: { typographer: true },
    })
      .scan()
      .generate()
      .complete()
    // The block has to be applied before the constructor registers partials —
    // a consumer opting in should not have to re-register them by hand.
    expect(await site.read('public/index.html')).toContain('©')
  })

  it('reaches the {{markdown}} helper too', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{{markdown model.body}}}',
    })
    await new Kiss({
      folders: site.folders,
      logger: silentLogger,
      markdown: { typographer: true },
    })
      .page({ view: 'index.hbs', model: { body: TYPOGRAPHY } })
      .generate()
      .complete()
    expect(await site.read('public/index.html')).toContain('©')
  })

  it('merges one level deep: opting in keeps the html-passthrough default', async () => {
    site = await makeSite(
      siteWith(`<span class="raw">kept</span>\n\n${TYPOGRAPHY}`),
    )
    await new Kiss({
      folders: site.folders,
      logger: silentLogger,
      markdown: { typographer: true },
    })
      .scan()
      .generate()
      .complete()
    const html = await site.read('public/index.html')
    // The supplied key took effect...
    expect(html).toContain('©')
    // ...and `html: true`, which was not supplied, is still at its default:
    // a one-level merge, not a replacement of the whole block.
    expect(html).toContain('<span class="raw">kept</span>')
  })

  it('can turn the html-passthrough default off', async () => {
    site = await makeSite(siteWith('<span class="raw">escaped</span>'))
    await new Kiss({
      folders: site.folders,
      logger: silentLogger,
      markdown: { html: false },
    })
      .scan()
      .generate()
      .complete()
    const html = await site.read('public/index.html')
    expect(html).not.toContain('<span class="raw">')
    expect(html).toContain('&lt;span')
  })
})

// 2.17 replaced Remarkable with markdown-it. Each test here pins one thing a
// site can see change, and each is named in CHANGELOG.md's upgrade note.
describe('the renderer is markdown-it', () => {
  const build = async (files, config = {}, setup = () => {}) => {
    site = await makeSite(files)
    const kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      ...config,
    })
    setup(kiss)
    await kiss.scan().generate().complete()
    return { kiss, html: await site.read('public/index.html') }
  }

  it('is kiss.markdown, and kiss.remarkable is gone', async () => {
    const { kiss } = await build(siteWith('x'))
    expect(typeof kiss.markdown.use).toBe('function')
    expect(typeof kiss.markdown.render).toBe('function')
    expect(kiss.remarkable).toBeUndefined()
  })

  it('takes a plugin with kiss.markdown.use(), in .md partials and the helper', async () => {
    const plugin = (md) => {
      md.renderer.rules.hr = () => '<hr class="from-plugin">'
    }
    const { html } = await build(
      {
        'src/partials/prose.md': '***',
        'src/pages/index.hbs': '{{> "prose"}}{{{markdown "***"}}}',
      },
      {},
      (kiss) => kiss.markdown.use(plugin),
    )
    expect(html.match(/<hr class="?from-plugin"?>/g)).toHaveLength(2)
  })

  it('starts an HTML block with a raw <h1>–<h6>, unwrapped', async () => {
    const { html } = await build(siteWith('<h3 id="a">Heading</h3>\n\nText'))
    expect(html).toContain('<h3 id="a">Heading</h3>')
    // Remarkable wrapped it in a <p>, which the minifier left as an empty
    // `<p></p>` before the heading.
    expect(html).not.toMatch(/<p>\s*(<\/p>)?\s*<h3/)
  })

  // Found by the fleet check on diploma-msc with its CMS data (2026-11-14):
  // Remarkable wrapped a lone <img> line in a <p>, as it did a heading.
  it('starts an HTML block with any complete tag alone on its line', async () => {
    const { html } = await build(
      siteWith(
        'Before.\n\n<img src="/logo.png" alt="Logo" width="150">\n\nAfter.',
      ),
    )
    expect(html).toMatch(/<\/p>\s*<img src="?\/logo\.png"?/)
  })

  // The same fleet run: the CMS text held U+00A0, and Remarkable wrote a
  // plain space in its place.
  it('keeps a non-breaking space as written', async () => {
    const { html } = await build(siteWith('Ophthalmology MSc is designed'))
    expect(html).toContain('MSc is designed')
  })

  // The same fleet run: Remarkable left `&amp;` in a link's destination
  // undecoded and escaped it again, so the published link carried
  // `&amp;amp;` and pointed at the wrong URL.
  it('decodes an entity in a link destination once', async () => {
    const { html } = await build(
      siteWith('[papers](https://scholar.example/c?user=1&amp;hl=en)'),
    )
    expect(html).toContain('href="https://scholar.example/c?user=1&amp;hl=en"')
    expect(html).not.toContain('&amp;amp;')
  })

  it('writes strikethrough as <s>', async () => {
    const { html } = await build(siteWith('~~gone~~'))
    expect(html).toContain('<s>gone</s>')
  })

  it('renders no footnotes without a plugin', async () => {
    const { html } = await build(siteWith('Text[^1].\n\n[^1]: The note.'))
    expect(html).toContain('[^1]: The note.')
    expect(html).not.toContain('footnote')
  })

  it('links a bare URL under linkify: true', async () => {
    const { html } = await build(siteWith('Visit https://example.com today.'), {
      markdown: { linkify: true },
    })
    expect(html).toMatch(/<a href="?https:\/\/example\.com"?>/)
  })
})
