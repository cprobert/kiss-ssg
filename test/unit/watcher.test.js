import { describe, it, afterEach } from 'vitest'
import { createWatcher } from '../../lib/watcher.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

let site, handle
afterEach(async () => {
  if (handle) await handle.close()
  if (site) await site.cleanup()
})

describe('createWatcher', () => {
  it('rebuilds a matched page, the whole site otherwise, and the assets on asset change', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'a',
      'src/partials/p.hbs': 'p',
      'src/assets/x.txt': 'x',
      'entry.js': '// entry',
    })
    const calls = { page: [], site: 0, assets: 0 }
    const stack = [{ view: 'index.hbs', buildTo: 'x', page: {}, runCount: 0 }]
    handle = createWatcher({
      config: { folders: { src: site.src, pages: `${site.src}/pages`, assets: `${site.src}/assets` } },
      getStack: () => stack,
      entry: `${site.root}/entry.js`,
      rebuildSite: () => calls.site++,
      rebuildPage: (e) => calls.page.push(e.view),
      assetsChanged: () => calls.assets++,
      logger: silentLogger,
    })
    await handle.ready
    await site.touch('src/pages/index.hbs', 'b')
    await waitFor(() => calls.page.includes('index.hbs'))
    await site.touch('src/partials/p.hbs', 'q')
    await waitFor(() => calls.site >= 1)
    await site.touch('src/assets/x.txt', 'y')
    await waitFor(() => calls.assets >= 1)
    const before = calls.site
    await site.touch('entry.js', '// changed')
    await waitFor(() => calls.site > before)
  })
})
