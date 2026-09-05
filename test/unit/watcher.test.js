import { describe, it, expect, afterEach } from 'vitest'
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
      'src/assets/sub/y.txt': 'y',
      'entry.js': '// entry',
    })
    const calls = { page: [], site: 0, assets: 0 }
    const stack = [{ view: 'index.hbs', buildTo: 'x', page: {}, runCount: 0 }]
    handle = createWatcher({
      config: {
        folders: {
          src: site.src,
          pages: `${site.src}/pages`,
          assets: `${site.src}/assets`,
        },
      },
      getStack: () => stack,
      entry: `${site.root}/entry.js`,
      rebuildSite: () => calls.site++,
      rebuildPage: (e) => calls.page.push(e.view),
      assetsChanged: () => calls.assets++,
      logger: silentLogger,
    })
    await handle.ready

    // Assets first, while calls.site is still provably 0: the src watcher
    // ignores `${assets}/**`, so neither a top-level nor a nested asset write
    // may reach rebuildSite().
    await site.touch('src/assets/x.txt', 'x2')
    await site.touch('src/assets/sub/y.txt', 'y2')
    await waitFor(() => calls.assets >= 2)
    expect(calls.site).toBe(0)

    await site.touch('src/pages/index.hbs', 'b')
    await waitFor(() => calls.page.includes('index.hbs'))
    await site.touch('src/partials/p.hbs', 'q')
    await waitFor(() => calls.site >= 1)
    const before = calls.site
    await site.touch('entry.js', '// changed')
    await waitFor(() => calls.site > before)
  })
})
