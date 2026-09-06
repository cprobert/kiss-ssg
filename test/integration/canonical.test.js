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

describe('{{canonical}} and sitemap.xml', () => {
  it.each([false, true])(
    'agree on every page with extensionLess=%s',
    async (extensionLess) => {
      const { canonicals, locs } = await buildSite(extensionLess)
      expect(locs).toEqual([
        'https://e.com/',
        'https://e.com/about',
        'https://e.com/blog/2026/post',
      ])
      expect(canonicals).toEqual(locs)
    },
  )
})
