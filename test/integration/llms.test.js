import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import Kiss, { utils } from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

let site
let kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  site = null
  kiss = null
})

const SUMMARY = 'Dog training and behaviour work in South Wales.'

// One small site with every rule in it: a root page, a section index, a page
// inside that section, a page kept out by `ignoreLlms` and one kept out by
// `generate: false`.
const buildSite = async (extensionLess) => {
  site = await makeSite({
    'src/pages/index.hbs': '{{canonical}}',
    'src/pages/about.hbs': '{{canonical}}',
    'src/pages/courses/index.hbs': '{{canonical}}',
    'src/pages/courses/bronze.hbs': '{{canonical}}',
    'src/pages/rota.hbs': '{{canonical}}',
    'src/pages/draft.hbs': '{{canonical}}',
    'notes.md': 'Prices are **per session**.\n',
  })
  kiss = new Kiss({
    folders: site.folders,
    siteUrl: 'https://e.com/',
    extensionLess,
    logger: silentLogger,
  })
    .page({ view: 'index.hbs', title: 'Home', description: 'The front page' })
    .page({ view: 'about.hbs', title: 'About', description: 'Who we are' })
    .page({ view: 'courses/index.hbs', title: 'Courses' })
    .page({
      view: 'courses/bronze.hbs',
      title: 'Bronze obedience',
      description: 'Six weeks, group class',
    })
    .page({ view: 'rota.hbs', title: 'Rota', ignoreLlms: true })
    .page({ view: 'draft.hbs', title: 'Draft', generate: false })
    .generate()
    .sitemap()
    .llms({
      title: 'A1K9 Training',
      summary: SUMMARY,
      notes: `${site.root}/notes.md`,
      sections: { courses: 'Courses' },
    })
  await kiss.complete()
  return kiss
}

const locsOf = (xml) =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
const urlsOf = (text) =>
  [...text.matchAll(/^- \[[^\]]*\]\(([^)]+)\)/gm)].map((m) => m[1])

describe('.llms()', () => {
  it('writes the llmstxt.org index, grouped by path', async () => {
    await buildSite(false)
    expect(await site.read('public/llms.txt')).toBe(
      [
        '# A1K9 Training',
        '',
        `> ${SUMMARY}`,
        '',
        '## Pages',
        '',
        '- [Home](https://e.com/): The front page',
        '- [About](https://e.com/about): Who we are',
        '',
        '## Courses',
        '',
        '- [Courses](https://e.com/courses/)',
        '- [Bronze obedience](https://e.com/courses/bronze): Six weeks, group class',
        '',
        '## Notes',
        '',
        'Prices are **per session**.',
        '',
      ].join('\n'),
    )
  })

  it.each([false, true])(
    'names the same URLs as sitemap.xml and {{canonical}} with extensionLess=%s',
    async (extensionLess) => {
      await buildSite(extensionLess)
      const canonicals = utils
        .globFiles(site.build, '**/*.html')
        .map((file) => fs.readFileSync(file, 'utf8').trim())
      const locs = locsOf(await site.read('public/sitemap.xml'))
      const llms = urlsOf(await site.read('public/llms.txt'))

      // `rota` is in the sitemap but out of llms.txt, so llms.txt is a subset —
      // every URL it does list is the page's own canonical, character for
      // character, which is the whole point of sharing the derivation.
      expect(llms.sort()).toEqual(
        locs.filter((l) => !/\/rota\/?$/.test(l)).sort(),
      )
      expect(new Set(canonicals)).toEqual(new Set(locs))
      expect(llms).not.toContain('https://e.com/draft')
    },
  )

  it('records the file in the build report, after pipeline', async () => {
    await buildSite(false)
    const report = kiss.report()
    expect(report.llms).toBe(`${site.build}/llms.txt`)
    expect(Object.keys(report).at(-1)).toBe('llms')
  })

  it('logs an error and skips without a siteUrl, leaving the build ok', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    const errors = []
    kiss = new Kiss({
      folders: site.folders,
      logger: { ...silentLogger, error: (msg) => errors.push(String(msg)) },
    })
      .scan()
      .generate()
      .llms({ title: 'T', summary: 'S' })
    await kiss.complete()
    expect(await site.exists('public/llms.txt')).toBe(false)
    expect(kiss.report().ok).toBe(true)
    expect(kiss.report().llms).toBeNull()
    expect(errors.join('\n')).toContain('config.siteUrl is not set')
  })

  it('re-runs on a whole-site rebuild and drops the old slug', async () => {
    site = await makeSite({
      'src/pages/about.hbs': '{{title}}',
      'src/controllers/about.mjs': "export default () => ({ slug: 's1' })",
    })
    kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://e.com',
      logger: silentLogger,
    })
      .page({ view: 'about.hbs', controller: 'about.mjs' })
      .generate()
      .llms({ title: 'T', summary: 'S' })
    await kiss.complete()
    expect(await site.read('public/llms.txt')).toContain('/s1')

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/about.mjs',
      "export default () => ({ slug: 's2' })",
    )

    await waitFor(
      async () =>
        (await site.exists('public/s2.html')) &&
        !(await site.exists('public/s1.html')),
    )
    const text = await site.read('public/llms.txt')
    expect(text).toContain('/s2')
    expect(text).not.toContain('/s1')
  })
})
