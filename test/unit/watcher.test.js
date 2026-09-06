import { describe, it, expect, afterEach } from 'vitest'
import { createWatcher, isInside } from '../../lib/watcher.js'
import { silentLogger } from '../../lib/logger.js'
import fs from 'fs-extra'
import { makeSite, waitFor } from '../helpers/site.js'

let site, handle
afterEach(async () => {
  if (handle) await handle.close()
  if (site) await site.cleanup()
})

describe('createWatcher', () => {
  // The watcher decides nothing about a `src` event any more: it forwards
  // `(event, path)` to `onChange` and Kiss owns the dispatch (see
  // `test/integration/watch.test.js`). What is still the watcher's own job is
  // which tree an event came from, and suppressing chokidar's initial scan.
  const spy = () => {
    const calls = { change: [], site: 0, assets: 0 }
    return {
      calls,
      wiring: {
        rebuildSite: () => calls.site++,
        onChange: (event, p) => calls.change.push([event, p]),
        assetsChanged: () => calls.assets++,
        logger: silentLogger,
      },
    }
  }
  const folders = (site) => ({
    folders: {
      src: site.src,
      pages: `${site.src}/pages`,
      assets: `${site.src}/assets`,
    },
  })

  it('forwards a src change to onChange, an entry change to rebuildSite, and an asset change to assetsChanged', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'a',
      'src/partials/p.hbs': 'p',
      'src/assets/x.txt': 'x',
      'src/assets/sub/y.txt': 'y',
      'entry.js': '// entry',
    })
    const { calls, wiring } = spy()
    handle = createWatcher({
      config: folders(site),
      entry: `${site.root}/entry.js`,
      ...wiring,
    })
    await handle.ready

    // Assets first, while calls.change is still provably empty: the src
    // watcher ignores `${assets}/**`, so neither a top-level nor a nested
    // asset write may reach onChange.
    await site.touch('src/assets/x.txt', 'x2')
    await site.touch('src/assets/sub/y.txt', 'y2')
    await waitFor(() => calls.assets >= 2)
    expect(calls.change).toEqual([])

    await site.touch('src/pages/index.hbs', 'b')
    await waitFor(() =>
      calls.change.some(
        ([event, p]) =>
          event === 'change' && p === `${site.src}/pages/index.hbs`,
      ),
    )
    await site.touch('src/partials/p.hbs', 'q')
    await waitFor(() =>
      calls.change.some(
        ([event, p]) =>
          event === 'change' && p === `${site.src}/partials/p.hbs`,
      ),
    )
    expect(calls.site).toBe(0)

    await site.touch('entry.js', '// changed')
    await waitFor(() => calls.site >= 1)
  })

  it('suppresses the initial scan add burst and forwards adds after ready', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'a',
      'src/partials/p.hbs': 'p',
    })
    const { calls, wiring } = spy()
    handle = createWatcher({ config: folders(site), entry: null, ...wiring })
    await handle.ready
    // chokidar's initial scan emits an `add` for every existing file: none of
    // that burst is an authoring event.
    expect(calls.change).toEqual([])

    await site.touch('src/partials/nav.hbs', 'NAV')
    await waitFor(() => calls.change.some(([event]) => event === 'add'))
    await fs.ensureDir(`${site.src}/pages/blog`)
    await waitFor(() => calls.change.some(([event]) => event === 'addDir'))
  })

  // Guards the `awaitWriteFinish` threshold. It is deliberately short — it is
  // the whole of the dev loop's felt latency — so this pins the property that
  // buys: an editor that writes in more than one syscall (truncate, then
  // write) must never be observed mid-write. The content is captured *inside*
  // the handler, because by the time an assertion runs the file is complete
  // either way, and a test that read it later would pass even with no settle
  // at all.
  it('does not report a file that is still being written', async () => {
    const complete = 'chunk-one/chunk-two'
    site = await makeSite({ 'src/pages/index.hbs': 'seed' })
    const seen = []
    const { wiring } = spy()
    handle = createWatcher({
      config: folders(site),
      entry: null,
      ...wiring,
      onChange: (event, p) => {
        if (p.endsWith('pages/index.hbs')) seen.push(fs.readFileSync(p, 'utf8'))
      },
    })
    await handle.ready

    // Two syscalls, a gap far shorter than the settle threshold: chokidar has
    // to coalesce them, so the half-written 'chunk-one/' is never reported.
    const file = `${site.src}/pages/index.hbs`
    fs.writeFileSync(file, 'chunk-one/')
    await new Promise((r) => setTimeout(r, 2))
    fs.appendFileSync(file, 'chunk-two')

    await waitFor(() => seen.length >= 1)
    expect(seen).not.toContain('chunk-one/')
    expect(seen.every((body) => body === complete)).toBe(true)
  })

  // The torn state a 30ms settle can still expose: a truncate-then-write save
  // whose gap outlasts the threshold arrives as a `change` on an empty file.
  // Rather than widen the threshold back out, the empty event is dropped —
  // the content lands as its own `change` (the size moved again) and that one
  // is forwarded. The gap here is deliberately longer than the threshold, so
  // this is the case the coalescing test above does not cover.
  it('drops a change on an empty file and forwards the one that follows with content', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'seed' })
    const seen = []
    const { wiring } = spy()
    handle = createWatcher({
      config: folders(site),
      entry: null,
      ...wiring,
      onChange: (event, p) => {
        if (p.endsWith('pages/index.hbs')) seen.push(fs.readFileSync(p, 'utf8'))
      },
    })
    await handle.ready

    const file = `${site.src}/pages/index.hbs`
    fs.writeFileSync(file, '')
    await new Promise((r) => setTimeout(r, 120))
    fs.writeFileSync(file, 'whole')

    await waitFor(() => seen.length >= 1)
    // Give a second, spurious forward every chance to arrive before asserting.
    await new Promise((r) => setTimeout(r, 150))
    expect(seen).toEqual(['whole'])
  })

  // A file deliberately created empty is the trade: it is not seen until it
  // gains content. An empty page or partial renders nothing either way.
  it('drops an add on an empty file until it has content', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'a',
      'src/partials/p.hbs': 'p',
    })
    const { calls, wiring } = spy()
    handle = createWatcher({ config: folders(site), entry: null, ...wiring })
    await handle.ready

    fs.writeFileSync(`${site.src}/partials/new.hbs`, '')
    await new Promise((r) => setTimeout(r, 150))
    expect(calls.change.filter(([, p]) => p.endsWith('new.hbs'))).toEqual([])

    fs.writeFileSync(`${site.src}/partials/new.hbs`, 'now')
    await waitFor(() => calls.change.some(([, p]) => p.endsWith('new.hbs')))
  })

  it('forwards an unlink like any other event', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'a',
      'src/pages/gone.hbs': 'g',
    })
    const { calls, wiring } = spy()
    handle = createWatcher({ config: folders(site), entry: null, ...wiring })
    await handle.ready

    await fs.remove(`${site.src}/pages/gone.hbs`)
    await waitFor(() =>
      calls.change.some(
        ([event, p]) =>
          event === 'unlink' && p === `${site.src}/pages/gone.hbs`,
      ),
    )
    expect(calls.site).toBe(0)
  })
})

describe('isInside', () => {
  const inAssets = isInside('./src/assets')

  it('matches the directory itself and everything under it', () => {
    expect(inAssets('src/assets')).toBe(true)
    expect(inAssets('src/assets/css/site.scss')).toBe(true)
  })

  it('does not match a sibling that merely shares the prefix', () => {
    expect(inAssets('src/assets-backup/x.txt')).toBe(false)
    expect(inAssets('src/pages/index.hbs')).toBe(false)
  })

  it('normalises the leading ./ and Windows separators on both sides', () => {
    expect(inAssets('./src/assets/x.txt')).toBe(true)
    expect(inAssets('src\\assets\\x.txt')).toBe(true)
    expect(isInside('src\\assets')('src/assets/x.txt')).toBe(true)
  })
})
