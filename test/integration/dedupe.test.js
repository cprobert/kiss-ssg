import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})

describe('duplicate pages', () => {
  it('are stacked once and fail the build, including in extension-less mode and for non-html ext', async () => {
    site = await makeSite({
      'src/pages/about.hbs': 'x',
      'src/pages/feed.hbs': 'y',
    })
    const kiss = new Kiss({
      folders: site.folders,
      extensionLess: true,
      logger: silentLogger,
    })
      .page({ view: 'about.hbs' })
      .page({ view: 'about.hbs' })
      .page({ view: 'feed.hbs', ext: 'xml' })
      .page({ view: 'feed.hbs', ext: 'xml' })
    await expect(kiss.complete()).rejects.toThrow(
      new RegExp(`${site.build}/about/index.html`),
    )
    expect(kiss._stack).toHaveLength(2)
  })

  it('reports the collision when two titles slugify to the same file', async () => {
    site = await makeSite({ 'src/pages/post.hbs': '{{model.title}}' })
    const kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .pages({
        view: 'post.hbs',
        model: [{ title: 'Über uns' }, { title: 'Uber uns' }],
        controller: ({ model }) => ({ slug: model.title }),
      })
      .generate()
    await expect(kiss.complete()).rejects.toThrow(
      new RegExp(`${site.build}/uber-uns.html`),
    )
  })
})
