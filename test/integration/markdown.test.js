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
// Remarkable as-is rather than being a fixed list of keys kiss knows.
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
