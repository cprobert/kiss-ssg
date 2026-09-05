import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import path from 'node:path'

vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({ ready: Promise.resolve(), close: async () => {} }),
}))

import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

// The fixture: three explicitly registered pages, a `.pages()` fan-out over a
// folder model, two partials (one .hbs, one .md), a layout and a controller —
// one of every input a scoped rebuild could get wrong.
const FIXTURE = {
  'src/pages/index.hbs':
    '<html><body>HOME [{{> foo}}] [{{> bar}}]</body></html>',
  'src/pages/about.hbs':
    '{{#extend "base"}}{{#content "c"}}ABOUT {{title}} [{{> foo}}]{{/content}}{{/extend}}',
  'src/pages/contact.hbs': 'CONTACT-1 [{{> bar}}]',
  'src/pages/item.hbs':
    '{{#extend "base"}}{{#content "c"}}ITEM {{model.n}} [{{> foo}}]{{/content}}{{/extend}}',
  'src/layouts/base.hbs': 'LAYOUT-1[{{#block "c"}}{{/block}}]',
  'src/partials/foo.hbs': 'FOO-1',
  'src/partials/bar.md': 'BAR-1',
  'src/models/team/a.json': '{ "n": "a1" }',
  'src/models/team/b.json': '{ "n": "b1" }',
  'src/controllers/about.mjs':
    "export default (options) => ({ ...options, title: 'TITLE-1' })",
}

// Each step edits one kind of input and names a string that must appear in the
// build afterwards, so an equality that holds only because nothing rebuilt
// cannot pass as equivalence.
const STEPS = [
  {
    what: 'hbs partial',
    file: 'src/partials/foo.hbs',
    body: 'FOO-2',
    marker: 'FOO-2',
    scoped: true,
  },
  {
    what: 'md partial',
    file: 'src/partials/bar.md',
    body: 'BAR-2',
    marker: 'BAR-2',
    scoped: true,
  },
  {
    what: 'layout',
    file: 'src/layouts/base.hbs',
    body: 'LAYOUT-2[{{#block "c"}}{{/block}}]',
    marker: 'LAYOUT-2',
    scoped: true,
  },
  {
    what: 'page view',
    file: 'src/pages/contact.hbs',
    body: 'CONTACT-2 [{{> bar}}]',
    marker: 'CONTACT-2',
    scoped: true,
  },
  {
    what: 'model',
    file: 'src/models/team/a.json',
    body: '{ "n": "a2" }',
    marker: 'ITEM a2',
  },
  {
    what: 'controller',
    file: 'src/controllers/about.mjs',
    body: "export default (options) => ({ ...options, title: 'TITLE-2' })",
    marker: 'TITLE-2',
  },
]

const register = (kiss) =>
  kiss
    .page({ view: 'index.hbs' })
    .page({ view: 'about.hbs', controller: 'about.mjs' })
    .page({ view: 'contact.hbs' })
    .pages({ view: 'item.hbs', model: 'team' })
    .generate()

// The build dir as one comparable value: relative posix paths, sorted, with
// each file's text. The site root is normalised out because the two fixtures
// live in different temp dirs and dev mode writes `options` (which carries
// `config.folders`) to the `.json` sibling. Nothing else in a build is
// site-specific — no timestamps are written anywhere, which is why the `.json`
// siblings can be compared at all.
const snapshot = async (site) => {
  const entries = await fs.readdir(site.build, {
    recursive: true,
    withFileTypes: true,
  })
  const files = entries
    .filter((e) => e.isFile())
    .map((e) =>
      path
        .relative(site.build, path.join(e.parentPath ?? e.path, e.name))
        .replace(/\\/g, '/'),
    )
    .sort()
  const out = {}
  for (const rel of files) {
    const text = await fs.readFile(path.join(site.build, rel), 'utf8')
    out[rel] = text.split(site.root).join('<SITE>')
  }
  return out
}

let watched, forced
afterEach(async () => {
  if (watched?.kiss) await watched.kiss.close()
  if (forced?.kiss) await forced.kiss.close()
  if (watched?.site) await watched.site.cleanup()
  if (forced?.site) await forced.site.cleanup()
})

describe('replay equivalence', () => {
  it('a watched edit sequence builds byte-identically to the same edits forced through a full replay', async () => {
    // Dev mode on both sides so the `.json` debug siblings and the live-reload
    // injection are part of what is compared.
    const build = async () => {
      const site = await makeSite(FIXTURE)
      const kiss = new Kiss({
        folders: site.folders,
        dev: true,
        logger: silentLogger,
      })
      // The constructor's own watcher watches the test runner's entry script;
      // drop it so each side gets exactly the watching it is meant to have.
      await kiss._watcher.close()
      kiss._watcher = null
      register(kiss)
      await kiss.complete()
      return { site, kiss }
    }

    watched = await build()
    forced = await build()
    watched.kiss.watch({ entry: null })
    await watched.kiss._watcher.ready

    // Counted so the comparison cannot pass vacuously by both sides replaying:
    // the partial, layout and page edits must take a scoped rebuild.
    let replays = 0
    const replay = watched.kiss._replay.bind(watched.kiss)
    watched.kiss._replay = () => {
      replays++
      return replay()
    }

    expect(await snapshot(watched.site)).toEqual(await snapshot(forced.site))

    for (const step of STEPS) {
      const replaysBefore = replays
      await watched.site.touch(step.file, step.body)
      await forced.site.touch(step.file, step.body)
      await forced.kiss._requestReplay()
      await waitFor(() => !forced.kiss._rebuildInFlight)

      // The watched side catches up on its own schedule; poll until it does,
      // then assert so a failure prints the diff rather than a timeout.
      const equal = async () => {
        const [a, b] = await Promise.all([
          snapshot(watched.site),
          snapshot(forced.site),
        ])
        return JSON.stringify(a) === JSON.stringify(b)
      }
      await waitFor(equal, { timeout: 8000 }).catch(() => {})
      expect(await snapshot(watched.site), `after ${step.what} edit`).toEqual(
        await snapshot(forced.site),
      )

      const built = Object.values(await snapshot(watched.site)).join('\n')
      expect(built, `${step.what} edit did not reach the build`).toContain(
        step.marker,
      )
      if (step.scoped)
        expect(replays - replaysBefore, `${step.what} edit replayed`).toBe(0)
      else
        expect(
          replays - replaysBefore,
          `${step.what} edit did not replay`,
        ).toBeGreaterThanOrEqual(1)
    }
  }, 60000)
})
