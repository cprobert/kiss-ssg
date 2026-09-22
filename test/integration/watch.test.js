import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'

// One shared refresh spy, so a test can assert how many times the browser was
// told to reload and what it was told to reload.
const dev = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: dev.refresh,
  }),
}))

import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A replay's orphan sweep removes an output and its dev-mode `.json` sibling
// one `await` apart, so a file disappearing is a mid-sweep state, not the end
// of the rebuild: a test that waits on it and then asserts on the sibling is
// racing the sweep's own interleaving. This is the queue's drain (the loop
// `close()` uses) — awaiting it once the sweep has visibly started puts every
// later assertion after the whole replay.
const rebuildSettled = async () => {
  while (kiss._rebuildInFlight) await kiss._rebuildInFlight
}

// A silent logger that records every call made once `afterClose.on` is set, so
// a test can assert an instance went quiet at the moment it claimed to.
const recordingLogger = () => {
  const afterClose = { on: false, calls: [] }
  const logger = { ...silentLogger }
  for (const [name, fn] of Object.entries(silentLogger)) {
    if (typeof fn !== 'function') continue
    logger[name] = (...args) => {
      if (afterClose.on) afterClose.calls.push([name, ...args])
      fn(...args)
    }
  }
  return { logger, afterClose }
}

let site, kiss

describe('watch filesystem reconciliation', () => {
  const start = async (config = {}) => {
    kiss = new Kiss({ folders: site.folders, logger: silentLogger, ...config })
      .scan()
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
  }

  it('copies new assets, removes renamed/deleted outputs and preserves unrelated files', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'PAGE',
      'src/assets/old.txt': 'old',
    })
    await start()
    await site.touch('public/keep.txt', 'keep')
    await site.touch('src/assets/new.txt', 'new')
    await waitFor(async () => await site.exists('public/new.txt'))
    await fs.rename(
      `${site.src}/assets/old.txt`,
      `${site.src}/assets/moved.txt`,
    )
    await waitFor(
      async () =>
        (await site.exists('public/moved.txt')) &&
        !(await site.exists('public/old.txt')),
    )
    await fs.remove(`${site.src}/assets`)
    await waitFor(
      async () =>
        !(await site.exists('public/new.txt')) &&
        !(await site.exists('public/moved.txt')),
    )
    expect(await site.read('public/index.html')).toBe('PAGE')
    expect(await site.read('public/keep.txt')).toBe('keep')
    await site.touch('src/assets/restored.txt', 'restored')
    await waitFor(async () => await site.exists('public/restored.txt'))
    expect(await site.read('public/restored.txt')).toBe('restored')
  })

  it('renders deliberately emptied partials and newly added empty pages', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'a{{> p}}b',
      'src/partials/p.hbs': 'OLD',
    })
    await start()
    await site.touch('src/partials/p.hbs', '')
    await waitFor(async () => (await site.read('public/index.html')) === 'ab')
    await site.touch('src/pages/empty.hbs', '')
    await waitFor(async () => await site.exists('public/empty.html'))
    expect(await site.read('public/empty.html')).toBe('')
  })

  it('watches configured content outside src', async () => {
    site = await makeSite({ 'views/index.hbs': 'one' })
    await start({ folders: { ...site.folders, pages: `${site.root}/views` } })
    await site.touch('views/index.hbs', 'two')
    await waitFor(async () => (await site.read('public/index.html')) === 'two')
  })

  it('removes deleted assets without deleting a page that replaced an asset output', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'PAGE',
      'src/assets/index.html': 'ASSET',
      'src/assets/index.json': 'ASSET MODEL',
      'src/assets/gone.txt': 'gone',
    })
    await start({ dev: true })
    const model = await site.read('public/index.json')
    await fs.remove(`${site.src}/assets/index.html`)
    await fs.remove(`${site.src}/assets/index.json`)
    await fs.remove(`${site.src}/assets/gone.txt`)
    await waitFor(async () => !(await site.exists('public/gone.txt')))
    await rebuildSettled()
    expect(await site.read('public/index.html')).toContain('PAGE')
    expect(await site.read('public/index.json')).toBe(model)
  })

  it('settles rapid asset and page edits together', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'one {{asset "style.css"}}',
      'src/assets/style.css': 'a { color: red }',
    })
    await start({ assets: { hash: true } })
    await Promise.all([
      site.touch('src/assets/style.css', 'a { color: blue }'),
      site.touch('src/pages/index.hbs', 'two {{asset "style.css"}}'),
    ])
    await waitFor(async () => {
      const name = kiss._assetManifest.lookup('style.css')
      return (
        (await site.read('public/index.html')) === `two ${name}` &&
        (await site.read(`public/${name}`)).includes('blue')
      )
    })
    await rebuildSettled()
    expect(
      (await fs.readdir(site.build)).filter((p) => p.endsWith('.css')),
    ).toHaveLength(1)
  })

  it('updates hashed Sass references after a partial edit and forgets deleted stylesheets', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{asset "main.css"}}',
      'src/assets/main.scss': '@use "theme"; body { color: theme.$color; }',
      'src/assets/_theme.scss': '$color: red;',
    })
    await start({ dev: true, assets: { hash: true } })
    const before = await site.read('public/index.html')
    const oldAsset = kiss._assetManifest.lookup('main.css')
    await site.touch('src/assets/_theme.scss', '$color: blue;')
    await waitFor(async () => (await site.read('public/index.html')) !== before)
    expect(await site.exists(`public/${oldAsset}`)).toBe(false)
    await fs.remove(`${site.src}/assets/main.scss`)
    await waitFor(() => kiss._assetManifest.lookup('main.css') === null)
    await rebuildSettled()
    expect(
      (await fs.readdir(site.build)).filter((p) => p.endsWith('.css')),
    ).toEqual([])
    expect(await site.read('public/index.html')).toContain('main.css')
  })
})
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  vi.unstubAllGlobals()
  dev.refresh.mockReset()
})

describe('watch()', () => {
  // Every folder test in `_handleChange` resolves both sides but one, which
  // compared two path SPELLINGS. `folders` derives the six from `src` so they
  // normally share a form — but either can be given explicitly, and a site
  // naming `src` relatively and `pages` absolutely made the page test false
  // for every page edit. The consequence was the safe direction and therefore
  // invisible: the view matched no stack entry and the edit fell through to
  // the replay fallback, so a scoped re-render of one page silently became a
  // whole-site rebuild.
  it('scopes a page edit when src and pages are spelt differently', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'v1' })
    const cwd = process.cwd()
    process.chdir(site.root)
    try {
      kiss = new Kiss({
        folders: { src: './src', pages: `${site.root}/src/pages` },
        logger: silentLogger,
      })
        .scan()
        .generate()
      await kiss.complete()

      const calls = []
      kiss._requestRebuild = (entries) => {
        calls.push(['scoped', entries.length])
        return Promise.resolve()
      }
      kiss._requestReplay = () => {
        calls.push(['replay'])
        return Promise.resolve()
      }
      // What the watcher emits for `folders.src`: a path in src's own form.
      kiss._handleChange('change', 'src/pages/index.hbs')
      expect(calls).toEqual([['scoped', 1]])
    } finally {
      process.chdir(cwd)
    }
  })

  it('rebuilds a changed page and can be closed', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'v1' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/pages/index.hbs', 'v2')
    await waitFor(async () => (await site.read('public/index.html')) === 'v2')
  })

  it('re-runs an edited CommonJS controller on rebuild', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/controllers/index.js': "module.exports = () => ({ title: 'one' })",
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('one')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/index.js',
      "module.exports = () => ({ title: 'two' })",
    )
    await waitFor(async () => (await site.read('public/index.html')) === 'two')
  })

  it('re-runs an edited ESM controller on rebuild', async () => {
    site = await makeSite({
      'src/pages/about.hbs': '{{title}}',
      'src/controllers/about.mjs': "export default () => ({ title: 'a1' })",
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'about.hbs', controller: 'about.mjs' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/about.html')).toBe('a1')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/about.mjs',
      "export default () => ({ title: 'a2' })",
    )
    await waitFor(async () => (await site.read('public/about.html')) === 'a2')
  })

  it('re-reads an edited model JSON on rebuild', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/models/index.json': '{ "title": "m1" }',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('m1')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/models/index.json', '{ "title": "m2" }')
    await waitFor(async () => (await site.read('public/index.html')) === 'm2')
  })

  // A replay re-reads every model and re-imports every controller, so those
  // edits take effect. Nothing else the build script imported does: the module
  // is already in the ESM cache and the replay runs from the registrations
  // logged at first import. Without a notice the rebuild presents a change
  // that was never applied as one that was — a helper edit refreshes the
  // browser and serves the old output.
  it('says an edited helper module needs a restart, since a rebuild cannot pick it up', async () => {
    const logger = { ...silentLogger, notice: vi.fn() }
    site = await makeSite({
      'src/pages/index.hbs': 'v1',
      'src/helpers/greet.js': "export const WORD = 'one'",
    })
    kiss = new Kiss({ folders: site.folders, logger }).scan().generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/helpers/greet.js', "export const WORD = 'two'")
    await waitFor(() =>
      logger.notice.mock.calls.some(([m]) => /restart/i.test(String(m))),
    )
  })

  it('does not ask for a restart when the edit will take effect', async () => {
    const logger = { ...silentLogger, notice: vi.fn() }
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/models/index.json': '{ "title": "m1" }',
    })
    kiss = new Kiss({ folders: site.folders, logger }).scan().generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/models/index.json', '{ "title": "m2" }')
    await waitFor(async () => (await site.read('public/index.html')) === 'm2')
    expect(
      logger.notice.mock.calls.filter(([m]) => /restart/i.test(String(m))),
    ).toEqual([])
  })

  // A data file is not a module: nothing imported it, so nothing is holding a
  // cached copy, and a replay re-renders every page against whatever is on
  // disk now. Asking for a restart here would be the same lie in reverse —
  // telling the author their working edit did not land.
  it('does not ask for a restart for a data file a replay does pick up', async () => {
    const logger = { ...silentLogger, notice: vi.fn() }
    site = await makeSite({
      'src/pages/index.hbs': '{{tel}}',
      'src/data/business.json': '{ "tel": "ONE" }',
    })
    kiss = new Kiss({ folders: site.folders, logger })
    kiss.handlebars.registerHelper(
      'tel',
      () => fs.readJsonSync(`${site.root}/src/data/business.json`).tel,
    )
    kiss.scan().generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('ONE')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/data/business.json', '{ "tel": "TWO" }')
    await waitFor(async () => (await site.read('public/index.html')) === 'TWO')
    expect(
      logger.notice.mock.calls.filter(([m]) => /restart/i.test(String(m))),
    ).toEqual([])
  })

  // `AIKB/watcher.md` says the entry script is watched because "the page list
  // itself may have changed". A replay cannot read a changed page list: it
  // replays the registrations logged at start-up. So the watcher must say so.
  it('says an edited build script cannot change the page list without a restart', async () => {
    const logger = { ...silentLogger, notice: vi.fn() }
    site = await makeSite({
      'src/pages/index.hbs': 'v1',
      'router.js': '// the build script',
    })
    kiss = new Kiss({ folders: site.folders, logger }).scan().generate()
    await kiss.complete()
    kiss.watch({ entry: `${site.root}/router.js` })
    await kiss._watcher.ready
    await site.touch('router.js', '// the build script, edited')
    await waitFor(() =>
      logger.notice.mock.calls.some(([m]) => /restart/i.test(String(m))),
    )
  })

  // The whole point of folders.helpers: a helper edit TAKES EFFECT, rather
  // than being honestly reported as impossible. Before auto-registration this
  // was the trap — a full replay ran, live reload fired, and the page still
  // rendered the old helper, because the module was already in the ESM cache
  // and the replay never re-ran the build script.
  it('re-registers an edited helper module and re-renders with it', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{shout "hi"}}',
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'ONE-' + s) }",
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('ONE-hi')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'helpers/index.js',
      "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'TWO-' + s) }",
    )
    await waitFor(
      async () => (await site.read('public/index.html')) === 'TWO-hi',
    )
  })

  // The folder is optional, so it may not exist when the session starts. A
  // first `helpers/index.js` written mid-session has to register and take
  // effect like any other edit — before, it got no watcher at all, and the
  // restart notice that might have covered it is suppressed for this folder.
  it('registers a helpers entry created after the watch started', async () => {
    site = await makeSite({ 'src/pages/index.hbs': '{{#if shout}}x{{/if}}ok' })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()
    expect(kiss.handlebars.helpers.shout).toBeUndefined()
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    await site.touch(
      'helpers/index.js',
      "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'ONE-' + s) }",
    )
    await waitFor(() => typeof kiss.handlebars.helpers.shout === 'function')
  })

  // Deleting the entry is the same statement as removing a registration from
  // it, made one file up: the site has no helpers any more, so neither does
  // the running build.
  it('unregisters the site helpers when the entry is deleted', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'ok',
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'ONE-' + s) }",
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()
    expect(typeof kiss.handlebars.helpers.shout).toBe('function')
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    await fs.remove(`${site.root}/helpers/index.js`)
    await waitFor(() => kiss.handlebars.helpers.shout === undefined)
  })

  // `_failures` is cleared by `_replay()` and by nothing else, and a helpers
  // reload is a scoped rebuild rather than a replay — so a broken save left a
  // `<site helpers>` entry in `report()` for the rest of the session, long
  // after the file was fixed. A stale failure is worse than none: it is the
  // one thing a consumer checks to decide whether the build is good.
  it('clears the site-helpers failure once the file is fixed', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'ok',
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'ONE-' + s) }",
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger: { ...silentLogger, error: vi.fn() },
    })
      .scan()
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    await site.touch('helpers/index.js', "throw new Error('broken save')")
    await waitFor(() => kiss._failures.some((f) => f.view === '<site helpers>'))
    await site.touch(
      'helpers/index.js',
      "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'TWO-' + s) }",
    )
    await waitFor(async () => (await site.read('public/index.html')) === 'ok')
    await waitFor(
      () => !kiss._failures.some((f) => f.view === '<site helpers>'),
    )
  })

  // The other half of an honest reload: a helper the edited entry no longer
  // registers has to leave the running site, or the browser keeps rendering
  // against a registrar that no longer exists on disk.
  it('drops a helper the edited entry stopped registering', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{keep "hi"}}',
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('keep', (s) => 'K-' + s); kiss.handlebars.registerHelper('gone', () => 'G') }",
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()
    expect(typeof kiss.handlebars.helpers.gone).toBe('function')
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    await site.touch(
      'helpers/index.js',
      "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('keep', (s) => 'K2-' + s) }",
    )
    await waitFor(
      async () => (await site.read('public/index.html')) === 'K2-hi',
    )
    expect(kiss.handlebars.helpers.gone).toBeUndefined()
  })

  // A reload removes the old registrations before it awaits the registrar, so
  // there is a window in which the registry is short of helpers. Rendering had
  // no ordering against it: a page edit landing inside that window rendered
  // against the gap. The rebuild queue serialises renders against each other,
  // not against the helper load.
  it('does not render while a helper reload is in flight', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{shout "hi"}}',
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'ONE-' + s) }",
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()

    let release
    kiss._helpersReady = new Promise((r) => {
      release = r
    })
    let rendered = false
    const run = kiss._rebuild([...kiss._stack]).then(() => {
      rendered = true
    })
    await sleep(60)
    expect(rendered).toBe(false)
    release()
    await run
    expect(rendered).toBe(true)
  })

  // A data file beside the helpers is not a stuck module: whatever helper
  // reads it reads it at RENDER time, so re-rendering picks the edit up. The
  // restart notice fired for it anyway — the same lie in reverse that this
  // branch already had to correct once in `_handleChange`, made again one
  // dispatch over.
  it('re-renders for a data file beside the helpers instead of asking for a restart', async () => {
    const notices = []
    const logger = {
      ...silentLogger,
      notice: (...a) => notices.push(a.join(' ')),
    }
    site = await makeSite({
      'src/pages/index.hbs': '{{label}}',
      'helpers/labels.json': JSON.stringify({ label: 'ONE' }),
      'helpers/index.js': [
        "import fs from 'node:fs'",
        "import { fileURLToPath } from 'node:url'",
        // `new URL(...).pathname` is a usable path on POSIX and NOT on
        // Windows, where it comes back as `/C:/...` and fs resolves the
        // leading slash against the current drive root — `C:\C:\...`. The
        // fixture could not read its own data file, so the render threw and
        // the assertion never ran. Second Windows-only failure on this branch
        // from a path idiom that is correct on POSIX; `eslint.config.js` now
        // bans this one outright.
        "const here = fileURLToPath(new URL('.', import.meta.url))",
        'export function registerHelpers(kiss) {',
        "  kiss.handlebars.registerHelper('label', () =>",
        "    JSON.parse(fs.readFileSync(here + 'labels.json', 'utf8')).label)",
        '}',
      ].join('\n'),
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger,
    })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('ONE')
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    await site.touch('helpers/labels.json', JSON.stringify({ label: 'TWO' }))
    await waitFor(async () => (await site.read('public/index.html')) === 'TWO')
    expect(notices.filter((n) => /restart/i.test(n))).toEqual([])
  })

  // The other half of the candidate/selected split. `index.js` is selected and
  // imports from `index.mjs`; only the selected entry's URL is cache-busted,
  // so an edit to `index.mjs` cannot be picked up — it must take the restart
  // notice, not a reload that rebuilds against the stale module and says
  // nothing.
  it('asks for a restart when a non-selected entry candidate changes', async () => {
    const notices = []
    const logger = {
      ...silentLogger,
      notice: (...a) => notices.push(a.join(' ')),
    }
    site = await makeSite({
      'src/pages/index.hbs': '{{shout "hi"}}',
      'helpers/index.mjs': "export const WORD = 'ONE'",
      'helpers/index.js': [
        "import { WORD } from './index.mjs'",
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => WORD + '-' + s) }",
      ].join('\n'),
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger,
    })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('ONE-hi')
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    await site.touch('helpers/index.mjs', "export const WORD = 'TWO'")
    await waitFor(() => notices.some((n) => /restart/i.test(n)))
    expect(await site.read('public/index.html')).toBe('ONE-hi')
  })

  // Deleting the entry when a fallback is present is not a delete at all: it
  // is a change of which file is the entry. Resolving the entry AFTER the
  // deletion made the file that had just vanished look like a sibling, so
  // neither the fallback loaded nor the old helpers went away.
  it('loads the fallback entry when the active one is deleted', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{shout "hi"}}',
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'JS-' + s) }",
      'helpers/index.mjs':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'MJS-' + s) }",
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger: silentLogger,
    })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('JS-hi')
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    await fs.remove(`${site.root}/helpers/index.js`)
    await waitFor(
      async () => (await site.read('public/index.html')) === 'MJS-hi',
    )
  })

  // The generalisation of the bug above, made enforceable. Every other test in
  // this suite configures absolute folders, so the whole watch dispatch was
  // exercised only against a shape no real site has: `folders` defaults are
  // relative (`./src`, `./src/pages`, …) and chokidar then emits relative
  // events. Measured benign — both sides derive from the same config, unlike
  // the helpers entry, which came from `path.resolve` — but "measured benign
  // once" is not coverage. This is the test that makes it stay benign.
  it('dispatches every kind of edit under the relative folder defaults', async () => {
    const cwd = process.cwd()
    // Asserting output alone proves nothing here, and that is a finding in
    // itself: an unmatched path falls through to a whole-site replay, which
    // produces the SAME bytes by the expensive route. Verified by mutation —
    // making the src watcher emit absolute paths, the exact mismatch that made
    // the helpers entry unreachable, left an output-only assertion green. So
    // the dispatch is what gets asserted: `Rebuilding:` is scoped,
    // `Rebuilding site:` is a replay.
    const rebuilds = []
    const logger = {
      ...silentLogger,
      info: (...a) => rebuilds.push(a.join(' ')),
      notice: (...a) => rebuilds.push(a.join(' ')),
    }
    const scoped = () =>
      rebuilds.filter((l) => /^Rebuilding/.test(l)).length > 0 &&
      rebuilds
        .filter((l) => /^Rebuilding/.test(l))
        .every((l) => !/site:/.test(l))
    site = await makeSite({
      'src/pages/index.hbs': '{{> "bit"}}|{{title}}|{{extra}}',
      'src/partials/bit.hbs': 'P1',
      'src/models/index.json': { title: 'M1' },
      'src/controllers/c.js': 'export default (m) => ({ ...m, extra: "C1" })',
      'src/assets/css/site.css': 'a{}',
    })
    process.chdir(site.root)
    try {
      kiss = new Kiss({ logger })
        .page({ view: 'index.hbs', model: 'index.json', controller: 'c.js' })
        .generate()
      await kiss.complete()
      expect(await site.read('public/index.html')).toBe('P1|M1|C1')
      kiss.watch({ entry: null })
      await kiss._watcher.ready

      // A page edit is the scoped path; a partial edit is the graph path; a
      // model and a controller edit each force a replay. All four have to
      // resolve the changed path against a relative folder.
      rebuilds.length = 0
      await site.touch(
        'src/pages/index.hbs',
        '{{> "bit"}}|{{title}}|{{extra}}|v2',
      )
      await waitFor(
        async () => (await site.read('public/index.html')) === 'P1|M1|C1|v2',
      )
      // A page edit must be SCOPED. Under a path mismatch it still produces
      // the right bytes, via a replay — correct, and silently expensive.
      expect(scoped()).toBe(true)

      rebuilds.length = 0
      await site.touch('src/partials/bit.hbs', 'P2')
      await waitFor(
        async () => (await site.read('public/index.html')) === 'P2|M1|C1|v2',
      )
      // A partial edit must re-render the pages the graph recorded rather
      // than falling back to every page.
      expect(scoped()).toBe(true)
      await site.touch('src/models/index.json', JSON.stringify({ title: 'M2' }))
      await waitFor(
        async () => (await site.read('public/index.html')) === 'P2|M2|C1|v2',
      )
      await site.touch(
        'src/controllers/c.js',
        'export default (m) => ({ ...m, extra: "C2" })',
      )
      await waitFor(
        async () => (await site.read('public/index.html')) === 'P2|M2|C2|v2',
      )

      // ...and the assets watcher, whose folder is relative too.
      await site.touch('src/assets/css/site.css', 'a{color:red}')
      await waitFor(
        async () => (await site.read('public/css/site.css')) === 'a{color:red}',
      )
    } finally {
      process.chdir(cwd)
    }
  })

  // EVERY other test in this file names `helpers` with an absolute path, and
  // `grep -rn "'./helpers'" test/` returned nothing across the whole suite.
  // The defaulted configuration — the convention this feature ships, and the
  // one every real site gets — had no watch test at all, so the tested path
  // and the shipped path were different paths.
  //
  // What that hid: `resolveConfig` does not resolve `./helpers` to an
  // absolute path, chokidar watches the relative path and emits relative
  // events, and `helpersEntry` returns an absolute one. Separator
  // normalisation alone never makes those equal, so an edit to the ENTRY was
  // classified as a sibling: restart notice, no reload, no rebuild. On this
  // branch, whose whole purpose is to stop a dev rebuild lying about what it
  // picked up.
  it('reloads an edited entry when folders.helpers is the relative default', async () => {
    const cwd = process.cwd()
    const notices = []
    const logger = {
      ...silentLogger,
      notice: (...a) => notices.push(a.join(' ')),
    }
    site = await makeSite({
      'src/pages/index.hbs': '{{shout "hi"}}',
      'helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'ONE-' + s) }",
    })
    process.chdir(site.root)
    try {
      kiss = new Kiss({ logger }).scan().generate()
      await kiss.complete()
      expect(await site.read('public/index.html')).toBe('ONE-hi')
      kiss.watch({ entry: null })
      await kiss._watcher.ready

      await site.touch(
        'helpers/index.js',
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'TWO-' + s) }",
      )
      await waitFor(
        async () => (await site.read('public/index.html')) === 'TWO-hi',
      )
      expect(notices.filter((n) => /restart/i.test(n))).toEqual([])
    } finally {
      process.chdir(cwd)
    }
  })

  // The reload busts the cache for the ENTRY only. `index.js`'s own
  // `import './format.js'` resolves to the un-busted URL, so the sibling comes
  // back from the ESM cache and the registrar re-registers the OLD helper —
  // while every page re-renders and the browser reloads. That is the dev
  // rebuild trap this whole branch exists to remove, and it shipped inside the
  // feature built to remove it. ESM has no cache-invalidation API, so the fix
  // is not a working reload: it is an honest one.
  it('asks for a restart when a module beside the helpers entry changes, and does not re-render', async () => {
    const logger = { ...silentLogger, notice: vi.fn() }
    site = await makeSite({
      'src/pages/index.hbs': '{{shout "hi"}}',
      'helpers/format.js': "export const PREFIX = 'ONE-'",
      'helpers/index.js':
        "import { PREFIX } from './format.js'\nexport function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => PREFIX + s) }",
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger,
    })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('ONE-hi')
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    await site.touch('helpers/format.js', "export const PREFIX = 'TWO-'")
    await waitFor(() =>
      logger.notice.mock.calls.some(([m]) => /restart/i.test(String(m))),
    )
    // The page is untouched: a rebuild here would have re-rendered with the
    // cached module and presented the old output as the new one.
    expect(await site.read('public/index.html')).toBe('ONE-hi')
  })

  // A site that puts its helpers inside src gets both watchers on one file.
  // The helpers watcher makes the edit take effect, so the restart notice
  // would be exactly the lie it exists to prevent.
  it('does not ask for a restart for a helpers folder inside src', async () => {
    const logger = { ...silentLogger, notice: vi.fn() }
    site = await makeSite({
      'src/pages/index.hbs': '{{shout "hi"}}',
      'src/helpers/index.js':
        "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'ONE-' + s) }",
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/src/helpers` },
      logger,
    })
      .scan()
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/helpers/index.js',
      "export function registerHelpers(kiss) { kiss.handlebars.registerHelper('shout', (s) => 'TWO-' + s) }",
    )
    await waitFor(
      async () => (await site.read('public/index.html')) === 'TWO-hi',
    )
    expect(
      logger.notice.mock.calls.filter(([m]) => /restart/i.test(String(m))),
    ).toEqual([])
  })

  it('coalesces overlapping rebuild requests onto the newest edit', async () => {
    // A slow model keeps the first replay in flight while the second is
    // requested: without coalescing the second resets _stack under the first,
    // whose pending page then wins the buildTo dedupe and strands stale output.
    let payload = { title: 'm1' }
    vi.stubGlobal('fetch', async () => {
      const body = payload // as at request time, like a real server read
      await sleep(150)
      return { ok: true, json: async () => body }
    })
    site = await makeSite({ 'src/pages/index.hbs': '{{title}}' })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, logger })
      .page({ view: 'index.hbs', model: 'http://models.test/index.json' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('m1')

    const a = kiss._requestReplay()
    await sleep(50) // the first replay is now mid-fetch
    payload = { title: 'm2' }
    const b = kiss._requestReplay()
    expect(b).toBe(a) // the second request collapsed onto the in-flight one
    await Promise.all([a, b])
    // The queued follow-up replay is not chained into the returned promise.
    await waitFor(async () => (await site.read('public/index.html')) === 'm2')
    await sleep(50)

    expect(kiss._stack).toHaveLength(1)
    expect(kiss._stack[0].runCount).toBe(1)
    expect(logger.error).not.toHaveBeenCalledWith(
      'Page already processed',
      expect.anything(),
    )
  })

  it('waits for an in-flight build before replaying', async () => {
    // A replay that resets _stack while the first build's page chain is still
    // pending lets that stale chain fill the new stack, so the replay's own
    // page loses the buildTo dedupe and the old model's output survives.
    let version = 'v1'
    vi.stubGlobal('fetch', async () => {
      const body = { title: version } // as at request time, like a real server
      await sleep(150)
      return { ok: true, json: async () => body }
    })
    site = await makeSite({ 'src/pages/index.hbs': '{{title}}' })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, logger })
      .page({ view: 'index.hbs', model: 'http://models.test/index.json' })
      .generate() // deliberately not awaited: the first build is still running

    version = 'v2'
    await kiss._requestReplay()

    await waitFor(
      async () =>
        (await site.exists('public/index.html')) &&
        (await site.read('public/index.html')) === 'v2',
    )
    expect(kiss._stack).toHaveLength(1)
    expect(logger.error).not.toHaveBeenCalledWith(
      'Page already processed',
      expect.anything(),
    )
  })

  it('removes output for pages that are no longer registered', async () => {
    site = await makeSite({
      'src/pages/item.hbs': '{{model.n}}',
      'src/models/team/a.json': '{ "n": "a" }',
      'src/models/team/b.json': '{ "n": "b" }',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .pages({ view: 'item.hbs', model: 'team' })
      .generate()
    await kiss.complete()
    expect(await site.exists('public/item-1.html')).toBe(true)
    expect(await site.exists('public/item-2.html')).toBe(true)

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await fs.remove(`${site.src}/models/team/b.json`)

    await waitFor(async () => !(await site.exists('public/item-2.html')))
    expect(await site.read('public/item-1.html')).toBe('a')
  })

  it('does not delete a live page whose output is the .json sibling of a removed orphan', async () => {
    // Orphan cleanup swaps the trailing extension to `.json` to remove the
    // dev-mode debug sibling too. If a currently registered page happens to
    // build to that exact `.json` path, it must survive the cleanup.
    site = await makeSite({
      'src/pages/item.hbs': '{{model.n}}',
      'src/pages/x.hbs': 'x',
      'src/models/team/a.json': '{ "n": "a" }',
      'src/models/team/b.json': '{ "n": "b" }',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .pages({ view: 'item.hbs', model: 'team' })
      .page({ view: 'x.hbs', slug: 'item-2', ext: 'json' })
      .generate()
    await kiss.complete()
    expect(await site.exists('public/item-1.html')).toBe(true)
    expect(await site.exists('public/item-2.html')).toBe(true)
    expect(await site.exists('public/item-2.json')).toBe(true)

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await fs.remove(`${site.src}/models/team/b.json`)

    await waitFor(async () => !(await site.exists('public/item-2.html')))
    await rebuildSettled()
    expect(await site.read('public/item-1.html')).toBe('a')
    expect(await site.exists('public/item-2.json')).toBe(true)
  })

  it('re-runs the sitemap on rebuild and drops the old slug', async () => {
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
      .sitemap()
    await kiss.complete()
    expect(await site.exists('public/s1.html')).toBe(true)
    expect(await site.read('public/sitemap.xml')).toContain('/s1')

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/about.mjs',
      "export default () => ({ slug: 's2' })",
    )

    // Stale output is removed after the rebuild completes, so wait for both:
    // s2.html can exist for a moment while s1.html is still there.
    await waitFor(
      async () =>
        (await site.exists('public/s2.html')) &&
        !(await site.exists('public/s1.html')),
    )
    const sitemap = await site.read('public/sitemap.xml')
    expect(sitemap).toContain('/s2')
    expect(sitemap).not.toContain('/s1')
  })

  it('dev mode starts the (mocked) server and watcher; close() stops both', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'x' })
    kiss = new Kiss({ folders: site.folders, dev: true, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(kiss._devServer).toBeTruthy()
    expect(kiss._watcher).toBeTruthy()
    await kiss.close()
    expect(kiss._watcher).toBeNull()
    expect(kiss._devServer).toBeNull()
  })

  it('edit of an .hbs partial re-renders pages that use it', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '[{{> foo}}]',
      'src/partials/foo.hbs': 'V1',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('[V1]')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/partials/foo.hbs', 'V2')
    await waitFor(async () => (await site.read('public/index.html')) === '[V2]')
  })

  it('edit of an .md partial re-renders pages that use it', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '[{{> foo}}]',
      'src/partials/foo.md': 'V1',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('[<p>V1</p>]')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/partials/foo.md', 'V2')
    await waitFor(
      async () => (await site.read('public/index.html')) === '[<p>V2</p>]',
    )
  })

  it('edit of a layout re-renders pages that extend it', async () => {
    site = await makeSite({
      'src/pages/index.hbs':
        '{{#extend "base"}}{{#content "c"}}X{{/content}}{{/extend}}',
      'src/layouts/base.hbs': 'L1{{#block "c"}}{{/block}}',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('L1X')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/layouts/base.hbs', 'L2{{#block "c"}}{{/block}}')
    await waitFor(async () => (await site.read('public/index.html')) === 'L2X')
  })

  it('deleting a partial unregisters it and fails the pages that used it', async () => {
    // Flipped by the B1 fix (planning/reviews/2026-09-05-v2-engine-review.md):
    // registerPartials() used to only ever add to the Handlebars env, so a
    // partial deleted from disk kept rendering its last-known content forever.
    // The registered set now mirrors disk, so the page that still references
    // the deleted partial fails loudly on the replay instead of rendering a
    // ghost, and its stale output is left untouched rather than rewritten.
    site = await makeSite({
      'src/pages/index.hbs': 'PAGE[{{> foo}}]',
      'src/partials/foo.hbs': 'FOO-V1',
    })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, logger }).scan().generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('PAGE[FOO-V1]')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await fs.remove(`${site.src}/partials/foo.hbs`)
    await waitFor(() =>
      logger.error.mock.calls.some(
        ([first]) => first === 'Error rebuilding site',
      ),
    )
    expect(Object.keys(kiss.handlebars.partials)).not.toContain('foo')
    expect(await site.read('public/index.html')).toBe('PAGE[FOO-V1]')
  })

  it('adding a partial registers it and a page can then reference it', async () => {
    // Flipped by the B2 fix (planning/reviews/2026-09-05-v2-engine-review.md):
    // the watcher used to ignore every `add` event, so a partial created
    // mid-session was never registered and the next edit to a page referencing
    // it failed to render, leaving that page frozen at its previous content.
    // The `add` now triggers a rebuild, which re-registers the partial.
    site = await makeSite({ 'src/pages/index.hbs': 'home' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/partials/nav.hbs', 'NAV')
    await waitFor(() => Object.keys(kiss.handlebars.partials).includes('nav'))
    await site.touch('src/pages/index.hbs', 'home[{{> nav}}]')
    await waitFor(
      async () => (await site.read('public/index.html')) === 'home[NAV]',
    )
  })

  it('deleting a scanned page view removes its output on the next replay', async () => {
    // scan() discovered the page from the file tree, so the file going away
    // takes the page with it: the registration is dropped, its buildTo is
    // absent from the new stack, and the orphan sweep removes the output and
    // the dev-mode .json sibling. Nothing is reported as a failure.
    site = await makeSite({
      'src/pages/index.hbs': 'home',
      'src/pages/gone.hbs': 'SECRET DRAFT',
    })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, dev: true, logger })
      .scan()
      .generate()
    await kiss.complete()
    expect(await site.exists('public/gone.html')).toBe(true)
    expect(await site.exists('public/gone.json')).toBe(true)
    await kiss._watcher.ready
    await fs.remove(`${site.src}/pages/gone.hbs`)
    await waitFor(async () => !(await site.exists('public/gone.html')))
    await rebuildSettled()
    expect(await site.exists('public/gone.json')).toBe(false)
    expect(await site.read('public/index.html')).toContain('home')
    expect(logger.error).not.toHaveBeenCalledWith(
      'Error rebuilding site',
      expect.anything(),
    )
  })

  it('deleting an explicitly registered page view fails the replay loudly and keeps the stale output', async () => {
    // Flipped by the B3 fix (planning/reviews/2026-09-05-v2-engine-review.md):
    // _getTemplate used to fall through with `viewText` still set to the view
    // filename, so a page whose view was deleted "built successfully" with its
    // own filename as its body. It now throws, the unlink triggers a full
    // replay, and that replay reports the page as a failure. An explicitly
    // registered page is never dropped — the author asked for it by name — so
    // its buildTo stays in the stack and the stale output survives untouched.
    site = await makeSite({
      'src/pages/index.hbs': 'home',
      'src/pages/gone.hbs': 'SECRET DRAFT',
    })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, logger })
      .page({ view: 'index.hbs' })
      .page({ view: 'gone.hbs' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/gone.html')).toBe('SECRET DRAFT')
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await fs.remove(`${site.src}/pages/gone.hbs`)
    await waitFor(() =>
      logger.error.mock.calls.some(
        ([first]) => first === 'Error rebuilding site',
      ),
    )
    expect(await site.read('public/gone.html')).toBe('SECRET DRAFT')
  })

  it('a replay that throws before re-queuing keeps the last good build, and the next one sweeps it', async () => {
    // The orphan sweep reads "in `previous`, absent from the new stack" as
    // stale. That only holds once the pages have been re-queued: a replay that
    // threw before the page loop has an empty stack because it failed, not
    // because the site shrank, so sweeping on it would delete the whole build
    // under a dev server that is still serving it. The paths are carried to
    // the next replay instead — dropping them stranded the deleted page's
    // output on disk for the life of the process, since every later replay
    // snapshots `previous` from a stack that no longer mentions it.
    site = await makeSite({
      'src/pages/index.hbs': 'home',
      'src/pages/gone.hbs': 'SECRET DRAFT',
    })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, dev: true, logger })
      .scan()
      .generate()
    await kiss.complete()
    await kiss._watcher.ready

    vi.spyOn(kiss, 'registerPartials').mockImplementationOnce(() => {
      throw new Error('boom')
    })
    await fs.remove(`${site.src}/pages/gone.hbs`)
    await waitFor(() =>
      logger.error.mock.calls.some(
        ([first]) => first === 'Error rebuilding site',
      ),
    )
    await rebuildSettled()

    expect(await site.exists('public/index.html')).toBe(true)
    expect(await site.exists('public/gone.html')).toBe(true)

    await kiss._requestReplay()
    await rebuildSettled()

    expect(await site.exists('public/gone.html')).toBe(false)
    expect(await site.exists('public/gone.json')).toBe(false)
    expect(await site.read('public/index.html')).toContain('home')
  })

  it('a replay that fails while rendering still sweeps the pages it dropped', async () => {
    // The other side of the gate above: once the pages are re-queued, every
    // one of them has a buildTo in the stack (`_preparePage` runs before the
    // render), so `previous` minus the stack is genuinely stale even though
    // the rebuild went on to fail. Deleting the partial fails index's render;
    // deleting the view drops gone from the registrations entirely.
    site = await makeSite({
      'src/pages/index.hbs': 'PAGE[{{> foo}}]',
      'src/pages/gone.hbs': 'SECRET DRAFT',
      'src/partials/foo.hbs': 'FOO',
    })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, logger }).scan().generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('PAGE[FOO]')
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    await fs.remove(`${site.src}/partials/foo.hbs`)
    await fs.remove(`${site.src}/pages/gone.hbs`)
    await waitFor(async () => !(await site.exists('public/gone.html')))
    await rebuildSettled()

    expect(logger.error).toHaveBeenCalledWith(
      'Error rebuilding site',
      expect.anything(),
    )
    // Never rewritten, so never removed: index kept its buildTo in the stack.
    expect(await site.read('public/index.html')).toBe('PAGE[FOO]')
  })

  it('adding a page view to a scanned site builds it on the next rebuild', async () => {
    // Flipped by W1-2b: a replay used to re-run only `_registrations` — the
    // page list `.scan()` produced when it ran — so a view created while
    // watching was in no registration and never built. `.scan()` is now
    // remembered and re-run at the start of every replay.
    site = await makeSite({ 'src/pages/index.hbs': 'home' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/pages/new.hbs', 'new page')
    // The content, not the existence: `fs.outputFile` creates the file before
    // it writes, so waiting on existence alone can read it back empty.
    await waitFor(
      async () =>
        (await site.exists('public/new.html')) &&
        (await site.read('public/new.html')) === 'new page',
    )
    expect(await site.read('public/new.html')).toBe('new page')
    expect(await site.read('public/index.html')).toBe('home')
  })

  it('does not double-register a view that .page() already took when .scan() follows it', async () => {
    // `.scan()`'s dedupe used to filter against `_stack`, which is still empty
    // during a synchronous `.page(…).scan()` chain (pages are queued, not
    // prepared), so the same view was registered twice and the second one was
    // rejected by `_preparePage`'s buildTo dedupe with an error. It now checks
    // `_registrations`, which is written synchronously by `page()`.
    site = await makeSite({ 'src/pages/index.hbs': 'home' })
    const logger = { ...silentLogger, error: vi.fn() }
    kiss = new Kiss({ folders: site.folders, logger })
      .page({ view: 'index.hbs' })
      .scan()
      .generate()
    await kiss.complete()
    expect(logger.error).not.toHaveBeenCalledWith(
      'Page already processed',
      expect.anything(),
    )
    expect(kiss._stack).toHaveLength(1)
    expect(kiss._registrations).toHaveLength(1)
    expect(await site.read('public/index.html')).toBe('home')
  })

  it('adding a page view to an explicitly registered site does nothing', async () => {
    // Not a bug: a page built via `.page({ view })` is never auto-discovered
    // (no `.scan()` was run), so a new file on disk was never going to be
    // registered regardless of the watcher's `add`-event handling. This
    // documents that half of the behaviour as correct, unlike the previous test.
    site = await makeSite({ 'src/pages/index.hbs': 'home' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'index.hbs' })
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/pages/new.hbs', 'new page')
    await sleep(1200)
    expect(await site.exists('public/new.html')).toBe(false)
  })

  it('an atomic save (unlink then add) of a registered page view re-renders it', async () => {
    // On this filesystem chokidar coalesces a write-tmp-then-rename-over-target
    // save into a single `change` event on the target path (not a separate
    // unlink+add), so it matches the stack entry by `view` and goes through
    // the normal rebuildPage path today — it does not exercise B3's
    // deleted-view fallback. Recorded here so a future change to that
    // coalescing (or to how renames are detected) is caught.
    site = await makeSite({ 'src/pages/index.hbs': 'v1' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'index.hbs' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('v1')
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    const target = `${site.src}/pages/index.hbs`
    const tmp = `${site.src}/pages/.index.hbs.tmp`
    await fs.outputFile(tmp, 'v2')
    await fs.rename(tmp, target)

    await waitFor(async () => (await site.read('public/index.html')) === 'v2')
  })

  it('close() waits for an in-flight rebuild before resolving', async () => {
    // Flipped by the B6 fix (planning/reviews/2026-09-05-v2-engine-review.md):
    // close() used to close the watcher and dev server without ever waiting on
    // the rebuild queue, so a replay requested just before close() kept running
    // — and writing to the build dir — after close() had resolved. close() now
    // quiesces: nothing is written, and nothing is logged, once it returns.
    vi.stubGlobal('fetch', async () => {
      await sleep(300)
      return { ok: true, json: async () => ({ title: 'remote' }) }
    })
    site = await makeSite({ 'src/pages/index.hbs': '{{title}}' })
    const { logger, afterClose } = recordingLogger()
    kiss = new Kiss({ folders: site.folders, logger })
      .page({ view: 'index.hbs', model: 'http://models.test/index.json' })
      .generate()
    await kiss.complete()

    kiss._requestReplay() // fire-and-forget, exactly as rebuildSite does
    await sleep(50) // replay is now mid-fetch
    await kiss.close()

    // Remove the build dir, as a deploy/clean step racing the shutdown might:
    // an orphaned replay would resurrect it once its write landed.
    await fs.remove(site.build)
    afterClose.on = true
    await sleep(800) // longer than the in-flight fetch would have taken
    expect(await site.exists('public')).toBe(false)
    expect(afterClose.calls).toEqual([])
  })
})

describe('rebuild queue', () => {
  // One in-flight slot and one pending slot. A slow remote model keeps the
  // first run in flight long enough to fill the pending slot deliberately.
  const slowModelSite = async () => {
    vi.stubGlobal('fetch', async () => {
      await sleep(150)
      return { ok: true, json: async () => ({ title: 'remote' }) }
    })
    site = await makeSite({ 'src/pages/index.hbs': '{{title}}' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'index.hbs', model: 'http://models.test/index.json' })
      .generate()
    await kiss.complete()
    const entry = kiss._stack[0]
    return { entry, rendered: vi.spyOn(entry.page, 'generate') }
  }
  const drained = () =>
    waitFor(
      () =>
        !kiss._rebuildInFlight &&
        !kiss._pendingReplay &&
        kiss._pendingTargets.size === 0,
    )

  it('a replay supersedes a scoped rebuild waiting in the queue', async () => {
    const { entry, rendered } = await slowModelSite()

    const a = kiss._requestReplay() // occupies the in-flight slot
    await sleep(20)
    kiss._requestRebuild([entry])
    expect(kiss._pendingTargets.size).toBe(1)
    kiss._requestReplay()
    expect(kiss._pendingTargets.size).toBe(0)
    expect(kiss._pendingReplay).toBe(true)

    await a
    await drained()
    expect(rendered).not.toHaveBeenCalled()
    expect(await site.read('public/index.html')).toBe('remote')
  })

  it('coalesces two scoped rebuilds of the same entry into one re-render', async () => {
    // The in-flight slot is filled by a scoped rebuild rather than a replay:
    // a replay would discard the stack this entry belongs to, and `_rebuild`
    // then skips it as a stale target — correct, but it would leave nothing
    // for the coalescing this test is about to be visible in.
    const { entry, rendered } = await slowModelSite()

    const a = kiss._requestRebuild([entry]) // occupies the in-flight slot
    kiss._requestRebuild([entry])
    kiss._requestRebuild([entry])
    expect(kiss._pendingTargets.size).toBe(1)

    await a
    await drained()
    expect(rendered).toHaveBeenCalledTimes(2) // the in-flight run, then one
  })

  it('ignores a scoped rebuild requested while a replay is pending', async () => {
    const { entry, rendered } = await slowModelSite()

    const a = kiss._requestReplay() // occupies the in-flight slot
    await sleep(20)
    const b = kiss._requestReplay() // fills the pending slot
    expect(b).toBe(a)
    kiss._requestRebuild([entry])
    expect(kiss._pendingTargets.size).toBe(0)

    await a
    await drained()
    expect(rendered).not.toHaveBeenCalled()
  })

  it('starts nothing once close() has been called', async () => {
    const { entry, rendered } = await slowModelSite()
    await kiss.close()

    kiss._requestReplay()
    kiss._requestRebuild([entry])
    expect(kiss._rebuildInFlight).toBeNull()
    await sleep(100)
    expect(rendered).not.toHaveBeenCalled()
  })
})

describe('partial and layout fast path', () => {
  const drained = () =>
    waitFor(
      () =>
        !kiss._rebuildInFlight &&
        !kiss._pendingReplay &&
        kiss._pendingTargets.size === 0,
    )

  it('re-renders the whole stack on a partial edit without re-resolving models', async () => {
    // The point of the fast path: a partial cannot change the page set or any
    // page's options, so the models — a network round trip each — are not
    // re-resolved, only the templates re-rendered.
    let fetches = 0
    vi.stubGlobal('fetch', async () => {
      fetches++
      return { ok: true, json: async () => ({ title: 'remote' }) }
    })
    site = await makeSite({
      'src/pages/index.hbs': '[{{> foo}}]{{title}}',
      'src/partials/foo.hbs': 'V1',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'index.hbs', model: 'http://models.test/index.json' })
      .generate()
    await kiss.complete()
    expect(await site.read('public/index.html')).toBe('[V1]remote')
    expect(fetches).toBe(1)

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/partials/foo.hbs', 'V2')
    await waitFor(
      async () => (await site.read('public/index.html')) === '[V2]remote',
    )
    await sleep(300)
    expect(fetches).toBe(1)
  })

  it('upgrades a partial edit that arrives mid-rebuild to a full replay', async () => {
    // Whether the in-flight run had already re-read the edited file is a race
    // nobody can reason about, so the pessimistic answer is the right one.
    let fetches = 0
    vi.stubGlobal('fetch', async () => {
      fetches++
      await sleep(150)
      return { ok: true, json: async () => ({ title: 'remote' }) }
    })
    site = await makeSite({
      'src/pages/index.hbs': '[{{> foo}}]{{title}}',
      'src/partials/foo.hbs': 'V1',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'index.hbs', model: 'http://models.test/index.json' })
      .generate()
    await kiss.complete()
    expect(fetches).toBe(1)

    const a = kiss._requestReplay() // occupies the in-flight slot
    await sleep(20)
    await site.touch('src/partials/foo.hbs', 'V2')
    kiss._handleChange('change', `${site.src}/partials/foo.hbs`)
    expect(kiss._pendingReplay).toBe(true)
    expect(kiss._pendingTargets.size).toBe(0)

    await a
    await drained()
    expect(fetches).toBe(3) // initial build, the in-flight replay, the upgrade
    expect(await site.read('public/index.html')).toBe('[V2]remote')
  })

  it('re-renders only the pages that rendered the edited partial', async () => {
    site = await makeSite({
      'src/pages/uses.hbs': '[{{> foo}}]',
      'src/pages/other.hbs': 'other',
      'src/partials/foo.hbs': 'V1',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    const before = (await fs.stat(`${site.build}/other.html`)).mtimeMs

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/partials/foo.hbs', 'V2')
    await waitFor(async () => (await site.read('public/uses.html')) === '[V2]')
    await drained()
    await sleep(300)
    // Untouched output, not merely unchanged content: the other page was
    // never re-rendered.
    expect((await fs.stat(`${site.build}/other.html`)).mtimeMs).toBe(before)
    expect(await site.read('public/other.html')).toBe('other')
  })

  it('falls back to every page, and says so, for a partial no page has rendered', async () => {
    const notices = []
    const logger = {
      ...silentLogger,
      notice: (...args) => notices.push(args.join(' ')),
    }
    site = await makeSite({
      'src/pages/a.hbs': 'A',
      'src/pages/b.hbs': 'B',
      'src/partials/unused.hbs': 'U1',
    })
    kiss = new Kiss({ folders: site.folders, logger }).scan().generate()
    await kiss.complete()
    const a = (await fs.stat(`${site.build}/a.html`)).mtimeMs
    const b = (await fs.stat(`${site.build}/b.html`)).mtimeMs

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/partials/unused.hbs', 'U2')
    await waitFor(
      async () => (await fs.stat(`${site.build}/b.html`)).mtimeMs > b,
    )
    await drained()
    expect((await fs.stat(`${site.build}/a.html`)).mtimeMs).toBeGreaterThan(a)
    expect(notices.some((n) => n.includes('unused'))).toBe(true)
  })

  it('stops re-rendering a page that stopped using the partial', async () => {
    site = await makeSite({
      'src/pages/p.hbs': '[{{> foo}}]',
      'src/partials/foo.hbs': 'V1',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    kiss.watch({ entry: null })
    await kiss._watcher.ready

    await site.touch('src/pages/p.hbs', 'plain')
    await waitFor(async () => (await site.read('public/p.html')) === 'plain')
    await drained()
    const after = (await fs.stat(`${site.build}/p.html`)).mtimeMs

    await site.touch('src/partials/foo.hbs', 'V2')
    await sleep(500)
    await drained()
    expect((await fs.stat(`${site.build}/p.html`)).mtimeMs).toBe(after)
  })

  it('skips a queued rebuild target the stack no longer holds', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'v1' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .page({ view: 'index.hbs' })
      .generate()
    await kiss.complete()
    const stale = kiss._stack[0]
    const rendered = vi.spyOn(stale.page, 'generate')

    await kiss._requestReplay() // the replay discards the stack `stale` is from
    await drained()
    expect(kiss._stack[0]).not.toBe(stale)

    await kiss._requestRebuild([stale])
    await drained()
    expect(rendered).not.toHaveBeenCalled()
  })
})

describe('live reload', () => {
  // The browser is told once per settled rebuild rather than once per file
  // written (finding F-E4): livereload no longer watches the build folder, so
  // a reload can no longer arrive while the rebuild is still writing pages.

  // Everything below starts from the initial build's own reload, which has to
  // be waited for rather than assumed: it is issued when the first build
  // settles, which is not necessarily before complete() resolves.
  const afterInitialReload = async () => {
    await waitFor(() => dev.refresh.mock.calls.length > 0)
    dev.refresh.mockClear()
  }

  it('reloads once when the first build settles', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'v1' })
    kiss = new Kiss({ folders: site.folders, dev: true, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    await waitFor(() => dev.refresh.mock.calls.length === 1)
    await sleep(150)
    expect(dev.refresh).toHaveBeenCalledTimes(1)
  })

  it('reloads once for a partial edit that re-renders every page, after all of them are written', async () => {
    const views = ['a', 'b', 'c', 'd']
    site = await makeSite({
      ...Object.fromEntries(
        views.map((v) => [`src/pages/${v}.hbs`, '[{{> foo}}]']),
      ),
      'src/partials/foo.hbs': 'V1',
    })
    kiss = new Kiss({ folders: site.folders, dev: true, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    await kiss._watcher.ready
    await afterInitialReload()

    // Read inside the spy: the point of the fix is that no reload is sent
    // before every page carries the new content.
    const seen = []
    dev.refresh.mockImplementation(() => {
      seen.push(
        views.map((v) => fs.readFileSync(`${site.build}/${v}.html`, 'utf8')),
      )
    })

    await site.touch('src/partials/foo.hbs', 'V2')
    await waitFor(async () => (await site.read('public/d.html')) === '[V2]')
    await rebuildSettled()

    expect(dev.refresh).toHaveBeenCalledTimes(1)
    expect(seen).toEqual([views.map(() => '[V2]')])
  })

  it('reloads once for a page-template edit', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'v1' })
    kiss = new Kiss({ folders: site.folders, dev: true, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    await kiss._watcher.ready
    await afterInitialReload()

    await site.touch('src/pages/index.hbs', 'v2')
    await waitFor(async () => (await site.read('public/index.html')) === 'v2')
    await rebuildSettled()
    expect(dev.refresh).toHaveBeenCalledTimes(1)
  })

  it('reloads once for a model edit, which replays the whole site', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/models/index.json': '{ "title": "m1" }',
    })
    kiss = new Kiss({ folders: site.folders, dev: true, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    await kiss._watcher.ready
    await afterInitialReload()

    await site.touch('src/models/index.json', '{ "title": "m2" }')
    await waitFor(async () => (await site.read('public/index.html')) === 'm2')
    await rebuildSettled()
    expect(dev.refresh).toHaveBeenCalledTimes(1)
  })

  it('reloads once for a stylesheet edit, naming the built CSS file', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'v1',
      'src/assets/css/main.css': 'body { color: red }',
    })
    kiss = new Kiss({ folders: site.folders, dev: true, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    await kiss._watcher.ready
    await afterInitialReload()

    await site.touch('src/assets/css/main.css', 'body { color: blue }')
    await waitFor(() => dev.refresh.mock.calls.length > 0)
    await sleep(150)
    expect(dev.refresh).toHaveBeenCalledTimes(1)
    // Named rather than a bare page reload: livereload swaps a stylesheet in
    // place, keeping the page's state.
    expect(dev.refresh.mock.calls[0][0].replace(/\\/g, '/')).toMatch(
      /public\/css\/main\.css$/,
    )
    expect(await site.read('public/css/main.css')).toContain('blue')
  })
})

describe('dependency graph dump', () => {
  it('writes dependency-graph.json in verbose dev mode, partial to pages', async () => {
    site = await makeSite({
      'src/pages/a.hbs': '{{> foo}}',
      'src/pages/b.hbs': '{{> foo}}{{> bar}}',
      'src/partials/foo.hbs': 'F',
      'src/partials/bar.hbs': 'B',
    })
    kiss = new Kiss({
      folders: site.folders,
      logger: silentLogger,
      dev: true,
      verbose: true,
      port: 0,
      livereloadPort: 0,
    })
      .scan()
      .generate()
    await kiss.complete()
    const dump = JSON.parse(await site.read('public/dependency-graph.json'))
    expect(dump).toEqual({
      bar: [`${site.build}/b.html`],
      foo: [`${site.build}/a.html`, `${site.build}/b.html`],
    })
  })
})
