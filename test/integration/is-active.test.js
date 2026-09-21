import { describe, it, expect, afterEach, vi } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

// `test/unit/handlebars-helpers.test.js` exercises `isActive` against a
// FABRICATED context — `{ page: { pageURL } }` — which is the shape the docs
// described rather than the shape a page render actually has. So the unit
// tests were green while every documented snippet was broken, which is the
// same failure as the relative-default watcher gap: the tested shape was not
// the shipped shape.
//
// These render through a real build. A page's context keys are exactly
// `title path slug generate view config model pageURL` — measured — so there
// is no `page` key, and the positional argument has to be `this` (or `..`
// inside an `{{#each}}`).
describe('isActive, as a page actually renders it', () => {
  const build = async (body, logger = silentLogger) => {
    site = await makeSite({
      'src/pages/about.hbs': body,
      'src/pages/other.hbs': body,
    })
    const kiss = new Kiss({ folders: site.folders, logger }).scan().generate()
    await kiss.complete()
    return kiss
  }

  it('marks only the page whose href matches', async () => {
    await build(
      '<a class="{{#isActive this href="/about"}}{{active}}{{/isActive}}">About</a>',
    )
    expect(await site.read('public/about.html')).toContain('class="active"')
    expect(await site.read('public/other.html')).not.toContain('active')
  })

  it('works data-driven with a bare .. inside each', async () => {
    site = await makeSite({
      'src/pages/about.hbs':
        '{{#each config.nav}}<a class="{{#isActive .. href=href}}{{active}}{{/isActive}}">{{label}}</a>{{/each}}',
    })
    const kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      nav: [
        { href: '/about', label: 'About' },
        { href: '/other', label: 'Other' },
      ],
    })
      .scan()
      .generate()
    await kiss.complete()
    const html = await site.read('public/about.html')
    expect(html).toContain('class="active">About')
    // The non-matching item renders an EMPTY class, which the minifier then
    // drops entirely — so the assertion is that `Other` is not marked.
    expect(html).toContain('<a>Other</a>')
  })

  // The documented snippet put a LITERAL string inside the block. The block
  // always runs — the match is exposed as `{{active}}` inside it, never as
  // an `{{else}}` — so `{{#isActive …}}class="active"{{/isActive}}` printed
  // class="active" on every page in the site.
  it('runs its block on every page, which is why the match must be read from {{active}}', async () => {
    await build(
      '[{{#isActive this href="/about"}}RAN{{else}}ELSE{{/isActive}}]',
    )
    expect(await site.read('public/about.html')).toContain('[RAN]')
    expect(await site.read('public/other.html')).toContain('[RAN]')
  })

  // And the shape the docs told people to write warns, once per call, on
  // every page — because `page` is not a key any page context has.
  it('warns when handed a context key that does not exist', async () => {
    const logger = { ...silentLogger, warn: vi.fn() }
    await build(
      '<a class="{{#isActive page href="/about"}}{{active}}{{/isActive}}">About</a>',
      logger,
    )
    expect(
      logger.warn.mock.calls.filter(([m]) => /no page context/.test(String(m)))
        .length,
    ).toBeGreaterThan(0)
  })
})
