import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import Kiss, { utils } from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

// The whole point of the helper: a page's `<link rel="canonical">` and its own
// `<loc>` in sitemap.xml are one URL, whatever the extensionLess setting.
const buildSite = async (extensionLess) => {
  site = await makeSite({
    'src/pages/index.hbs': '{{canonical}}',
    'src/pages/about.hbs': '{{canonical}}',
    'src/pages/post.hbs': '{{canonical}}',
    'src/pages/section.hbs': '{{canonical}}',
  })
  const kiss = new Kiss({
    folders: site.folders,
    siteUrl: 'https://e.com/',
    extensionLess,
    logger: silentLogger,
  })
    .page({ view: 'index.hbs' })
    .page({ view: 'about.hbs' })
    .page({ view: 'post.hbs', path: 'blog/2026' })
    // A section index — `courses/index.html` under either setting.
    .page({ view: 'section.hbs', path: 'courses', slug: 'index' })
    .generate()
    .sitemap()
  await kiss.complete()
  const canonicals = utils
    .globFiles(site.build, '**/*.html')
    .map((file) => fs.readFileSync(file, 'utf8').trim())
  const xml = await site.read('public/sitemap.xml')
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  return { canonicals: canonicals.sort(), locs: locs.sort() }
}

// A directory index canonicalises with the trailing slash, because that is the
// URL a static host serves: it answers the bare path with a 301, and a
// canonical must be the URL that returns 200. Under `extensionLess` every page
// but the home page builds to `<path>/<slug>/index.html`, so every page but the
// home page is a directory index and ends in `/` — which is why the two
// settings no longer emit the same list. What they do still guarantee is that
// the canonical link and the `<loc>` never disagree.
const expected = {
  false: [
    'https://e.com/',
    'https://e.com/about',
    'https://e.com/blog/2026/post',
    'https://e.com/courses/',
  ],
  true: [
    'https://e.com/',
    'https://e.com/about/',
    'https://e.com/blog/2026/post/',
    'https://e.com/courses/',
  ],
}

describe('{{canonical}} and sitemap.xml', () => {
  it.each([false, true])(
    'agree on every page with extensionLess=%s',
    async (extensionLess) => {
      const { canonicals, locs } = await buildSite(extensionLess)
      expect(locs).toEqual(expected[String(extensionLess)])
      expect(canonicals).toEqual(locs)
    },
  )
})
