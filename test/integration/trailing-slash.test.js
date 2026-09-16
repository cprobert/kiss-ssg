import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

// `config.links.trailingSlash` is a host's URL policy for a directory index,
// and the two mainstream conventions contradict each other. Measured live on
// 2026-09-16:
//
//   Netlify (www.a1k9training.co.uk)   /courses/ 200, /courses 301 -> /courses/
//   Firebase cleanUrls+trailingSlash:false (learna.ac.uk)
//                                      /courses 200, /courses/ 301 -> /courses
//
// They agree on file pages and disagree here, so the engine cannot be right for
// both and the setting says which. The default is Netlify's, unchanged from
// 2.3: all 18 `<loc>` entries in a1k9training's live sitemap return 200 under
// it, and moving the default would turn six of them into redirects.
//
// The thing this file exists to guard is not the flag but the *agreement*. Six
// derivations emit a page's URL — `{{canonical}}`, `{{link}}`, `<loc>`,
// `llms.txt`, the feed, and an alias's target — and a site is only correct when
// all six say the same string. Splitting any one of them off is the defect:
// a site would link `/courses/` while canonicalising `/courses`, taking the
// redirect the setting exists to avoid on every internal click.

let site
/** @type {any[]} */
let instances = []
afterEach(async () => {
  for (const kiss of instances) await kiss.close()
  if (site) await site.cleanup()
  site = null
  instances = []
})

const FILES = {
  // A directory index by virtue of its slug: the shape the whole setting is about.
  'src/pages/courses/index.hbs':
    'courses {{canonical}} | {{link "courses/index"}} | {{link "courses/index" canonical=true}}',
  // A file page, where the two hosts agree — the control.
  'src/pages/about.hbs': 'about {{canonical}} | {{link "about"}}',
  'src/pages/index.hbs': 'home {{canonical}} | {{link "index"}}',
  // Page identity, which must not follow the host: a nav highlight cannot
  // depend on where the site is deployed.
  'src/pages/nav.hbs':
    '{{#isActive this href="/courses"}}on{{/isActive}}{{#isActive this href="/courses/"}}on-slashed{{/isActive}}',
}

const buildSite = async ({ trailingSlash } = {}) => {
  site = await makeSite(FILES)
  const kiss = new Kiss({
    folders: site.folders,
    siteUrl: 'https://e.com',
    logger: silentLogger,
    redirects: { format: 'netlify' },
    ...(trailingSlash === undefined ? {} : { links: { trailingSlash } }),
  })
  instances.push(kiss)
  kiss
    .page({ view: 'index.hbs' })
    .page({ view: 'about.hbs' })
    .page({ view: 'nav.hbs', path: 'courses', slug: 'nav' })
    .page({
      view: 'courses/index.hbs',
      path: 'courses',
      slug: 'index',
      date: '2026-01-01',
      description: 'Every course',
      aliases: ['/old-courses'],
    })
    .sitemap()
    .llms({ title: 'E', summary: 'A site.' })
    .feed({ title: 'E', description: 'A site.' })
    .generate()
  await kiss.complete()
  return kiss
}

describe('links.trailingSlash: the host decides, not the engine', () => {
  it('keeps the slash by default, in all six derivations at once', async () => {
    const kiss = await buildSite()
    const page = await site.read('public/courses/index.html')

    expect(page).toContain('https://e.com/courses/')
    // `{{link}}` — the relative href a reader actually clicks — and the
    // canonical form of the same call.
    expect(page).toContain('| /courses/ |')
    expect(page).toContain('| /courses/')
    expect(await site.read('public/sitemap.xml')).toContain(
      '<loc>https://e.com/courses/</loc>',
    )
    expect(await site.read('public/llms.txt')).toContain(
      'https://e.com/courses/',
    )
    expect(await site.read('public/feed.xml')).toContain(
      'https://e.com/courses/',
    )
    expect(kiss.report().redirects.rules).toEqual([
      { from: '/old-courses', to: '/courses/' },
    ])
  })

  it('drops it under trailingSlash:false, in all six at once', async () => {
    const kiss = await buildSite({ trailingSlash: false })
    const page = await site.read('public/courses/index.html')

    // The canonical, and both `{{link}}` forms, on the page itself.
    expect(page).toBe('courses https://e.com/courses | /courses | /courses')
    expect(await site.read('public/sitemap.xml')).toContain(
      '<loc>https://e.com/courses</loc>',
    )
    expect(await site.read('public/sitemap.xml')).not.toContain('/courses/<')
    expect(await site.read('public/llms.txt')).toContain(
      'https://e.com/courses)',
    )
    expect(await site.read('public/feed.xml')).toContain(
      '<link>https://e.com/courses</link>',
    )
    // The alias target too: a redirect must never point at a URL the sitemap
    // does not list, and under this policy that URL has no trailing slash.
    expect(kiss.report().redirects.rules).toEqual([
      { from: '/old-courses', to: '/courses' },
    ])
    expect(await site.read('public/_redirects')).toBe(
      '/old-courses /courses 301\n',
    )
  })

  it('leaves the site root as `/` under either policy', async () => {
    // The one URL both conventions agree on, and the one an off-by-one here
    // would turn into `https://e.com` — a bare origin with no path, which is
    // not what any host serves the home page at.
    for (const trailingSlash of [true, false]) {
      await buildSite({ trailingSlash })
      const home = await site.read('public/index.html')
      expect(home).toBe('home https://e.com/ | /')
      await site.cleanup()
      site = null
    }
  })

  it('leaves isActive alone: identity is not a host policy', async () => {
    // `toURLKey` reduces `/courses`, `/courses/` and `courses/index.html` to
    // one key and takes no policy at all, so both spellings of the href match
    // under both settings. AIKB/utils.md is explicit that the original
    // trailing-slash fix deliberately left identity alone; this is the test
    // that stops a later "unify the three URL functions" breaking navigation.
    for (const trailingSlash of [true, false]) {
      await buildSite({ trailingSlash })
      expect(await site.read('public/courses/nav.html')).toBe('onon-slashed')
      await site.cleanup()
      site = null
    }
  })

  it('leaves a file page alone under either policy — the hosts agree there', async () => {
    for (const trailingSlash of [true, false]) {
      await buildSite({ trailingSlash })
      expect(await site.read('public/about.html')).toBe(
        'about https://e.com/about | /about.html',
      )
      await site.cleanup()
      site = null
    }
  })
})
