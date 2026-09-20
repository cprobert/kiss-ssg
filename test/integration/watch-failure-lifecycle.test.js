import { describe, it, expect, afterEach, vi } from 'vitest'

const dev = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock('../../lib/dev-server.js', () => ({
  startDevServer: () => ({
    ready: Promise.resolve(),
    close: async () => {},
    refresh: dev.refresh,
  }),
}))

import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite, waitFor } from '../helpers/site.js'

// Whether this machine can create a directory symlink at all. Windows needs a
// privilege most developer accounts do not have, and the two canonicalisation
// tests below are worthless without one.
//
// Decided HERE, at module scope, so the gate can be `skipIf` — because a
// `return` inside the test body reports the test as PASSED, and a test that
// says "passed" while exercising nothing is the exact shape this branch has
// spent twenty rounds on, moved into the suite. Measured on an unprivileged
// Windows box by the QA session: `2 passed | 13 skipped`, for two tests that
// did not run a line.
const canSymlink = (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-symlink-'))
  try {
    fs.ensureDirSync(path.join(dir, 'target'))
    fs.symlinkSync(path.join(dir, 'target'), path.join(dir, 'link'), 'dir')
    return true
  } catch {
    return false
  } finally {
    fs.removeSync(dir)
  }
})()

let site, kiss
afterEach(async () => {
  if (kiss) await kiss.close()
  if (site) await site.cleanup()
  dev.refresh.mockReset()
})

const views = (k) => k._failures.map((f) => f.view)
const settled = async (k) => {
  while (k._rebuildInFlight) await k._rebuildInFlight
}

// A whole-site replay re-runs the pages, their controllers and the redirects,
// so clearing those failures is right. It re-compiles the stylesheets only
// when an `assets.pipeline` step is configured, and it never re-imports the
// helpers entry — so a failure from either producer is still true after the
// replay, and clearing it was reporting a site as ok with no CSS in it.
describe('a failure the replay cannot re-derive', () => {
  it('survives a whole-site replay: an uncompilable stylesheet', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/controllers/index.js': "module.exports = () => ({ title: 'one' })",
      'src/assets/css/site.scss': 'body { color: ',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger, dev: true })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow()
    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    // A controller edit is a whole-site replay. The stylesheet on disk is
    // untouched and still will not compile.
    await site.touch(
      'src/controllers/index.js',
      "module.exports = () => ({ title: 'two' })",
    )
    await waitFor(async () => (await site.read('public/index.html')) === 'two')
    await settled(kiss)

    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)
  })

  it('survives a whole-site replay: a helpers entry that throws', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/controllers/index.js': "module.exports = () => ({ title: 'one' })",
      'helpers/index.js':
        'export function registerHelpers() { throw new Error("boom") }',
    })
    kiss = new Kiss({
      folders: { ...site.folders, helpers: `${site.root}/helpers` },
      logger: silentLogger,
      dev: true,
    })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow()
    expect(views(kiss)).toContain('<site helpers>')

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/index.js',
      "module.exports = () => ({ title: 'two' })",
    )
    await waitFor(async () => (await site.read('public/index.html')) === 'two')
    await settled(kiss)

    expect(views(kiss)).toContain('<site helpers>')
  })

  // The other half: carrying must not strand a failure that HAS been fixed.
  // Each carried kind is cleared by its own producer — `copyAssets` by the
  // prefix that names the copy, `_loadHelpers` by the `<site helpers>` name —
  // and the edit that fixes the file is what runs that producer again.
  it('clears once the stylesheet compiles again', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'hi',
      'src/assets/css/site.scss': 'body { color: ',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger, dev: true })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow()

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/assets/css/site.scss', 'body { color: red; }')
    await waitFor(
      () => !kiss._failures.some((f) => f.view.startsWith('<sass:')),
    )
    await kiss._assetQueue
    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(0)
  })

  // A copy owns its Sass failures by the resolved (source, target) pair it
  // is, not by a prefix of the view string: `src/assets` is a prefix of
  // `src/assets/nested`, so a parent root's copy used to clear a nested
  // root's unresolved failure — and the parent's own compile of that same
  // file then succeeded to a different target, so nothing raised it again.
  it('a parent asset root does not clear a nested root failure', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'hi',
      'src/assets/nested/theme.scss': 'body { color: red; }',
    })
    // The nested copy cannot WRITE its output — a directory sits where
    // theme.css must go — though the stylesheet itself parses. The parent
    // copy compiles the same source successfully, to a different target.
    await fs.ensureDir(`${site.root}/out-nested/theme.css`)
    kiss = new Kiss({
      folders: { ...site.folders, assets: null },
      logger: silentLogger,
    })
    kiss.copyAssets(`${site.root}/src/assets/nested`, `${site.root}/out-nested`)
    kiss.copyAssets(`${site.root}/src/assets`, `${site.root}/out-parent`)
    kiss.scan().generate()

    await expect(kiss.complete()).rejects.toThrow()
    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)
    expect(kiss.report().ok).toBe(false)
  })

  // Carrying rests on "each is cleared by its own producer when that producer
  // runs again", and that was only true of `config.folders.assets`: the replay
  // and the watcher both re-run that copy and no other. A root the site
  // registered itself was never re-run, so its failure could not be cleared by
  // anything — fixed on disk, full replay, still failed, for the rest of the
  // session.
  it('clears a SECOND asset root failure once its stylesheet is fixed', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/controllers/index.js': "module.exports = () => ({ title: 'one' })",
      'vendor/css/lib.scss': 'body { color: ',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger, dev: true })
    kiss.copyAssets(`${site.root}/vendor`, `${site.root}/public/vendor`)
    kiss.scan().generate()
    await expect(kiss.complete()).rejects.toThrow()
    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    // Still broken: a replay must not erase it (the guarantee above).
    await site.touch(
      'src/controllers/index.js',
      "module.exports = () => ({ title: 'two' })",
    )
    await waitFor(async () => (await site.read('public/index.html')) === 'two')
    await settled(kiss)
    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)

    // Fixed on disk. A non-default asset root is not watched, so the fix
    // itself raises no event — the next whole-site replay is what re-checks
    // it, and that replay has to re-run this copy or the failure is stuck.
    await site.touch('vendor/css/lib.scss', 'body { color: red; }')
    await site.touch(
      'src/controllers/index.js',
      "module.exports = () => ({ title: 'three' })",
    )
    await waitFor(
      async () => (await site.read('public/index.html')) === 'three',
    )
    await settled(kiss)
    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(0)
  })

  // Carriage is recorded on the failure object by the producer that pushed it,
  // never matched on the `view` string — because for an inline template that
  // string is the TEMPLATE TEXT, which the author writes. A page whose view
  // happens to start with the Sass sentinel is still a page.
  it('does not carry a page whose view impersonates a Sass failure', async () => {
    site = await makeSite({ 'src/pages/index.hbs': 'hi' })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger, dev: true })
    kiss.scan()
    kiss.page({ view: '<sass: example> {{custom "x"}}', path: 'imposter' })
    kiss.generate()
    await expect(kiss.complete()).rejects.toThrow()
    expect(views(kiss).some((v) => v.startsWith('<sass: example>'))).toBe(true)

    // The reason it failed is gone: the helper exists now.
    kiss.handlebars.registerHelper('custom', (v) => String(v))
    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch('src/pages/index.hbs', 'hi again')
    await kiss._requestReplay()
    await settled(kiss)

    expect(views(kiss).filter((v) => v.startsWith('<sass: example>'))).toEqual(
      [],
    )
  })

  it('keeps no map entry for a copy that succeeded', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'hi',
      'src/assets/css/site.scss': 'body { color: red; }',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger })
      .scan()
      .generate()
    await kiss.complete()
    // Both maps, pruned together: a replay re-runs a copy only to re-check a
    // failure, so a copy with none needs no registration either. Keeping one
    // and not the other is how a long-lived process copying into a fresh
    // destination each run accumulates an entry per success.
    expect(kiss._sassFailures.size).toBe(0)
    expect(kiss._assetCopies.size).toBe(0)
  })

  // The copy key is canonicalised through `realpath`, not just resolved,
  // because `resolve` preserves the path's SPELLING and two spellings can name
  // one directory. Both tests below are the same assertion — two spellings,
  // one copy, so the second clears the first's failure — written for the two
  // ways a filesystem produces them.
  //
  // This one uses a SYMLINK, which every platform has, so it runs everywhere
  // and fails on any platform if the canonicalisation is dropped. That matters
  // more than it looks: the obvious future edit is replacing
  // `realpathSync.native` with `path.resolve` to drop a sync filesystem call
  // from the copy path, and without this it would pass every gate.
  it.skipIf(!canSymlink)(
    'treats two spellings of one source as one copy (symlink)',
    async () => {
      site = await makeSite({
        'src/pages/index.hbs': 'hi',
        'src/assets/css/site.scss': 'body { color: ',
      })
      await fs.symlink(`${site.root}/src/assets`, `${site.root}/aliased`, 'dir')
      kiss = new Kiss({
        folders: { ...site.folders, assets: null },
        logger: silentLogger,
      })
      kiss.copyAssets(`${site.root}/src/assets`, `${site.root}/out`)
      kiss.scan().generate()
      await expect(kiss.complete()).rejects.toThrow()
      expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)

      // Fixed, and re-copied through the other spelling of the same folder.
      await site.touch('src/assets/css/site.scss', 'body { color: red; }')
      kiss.copyAssets(`${site.root}/aliased`, `${site.root}/out`)
      await kiss._assetQueue
      expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(0)
    },
  )

  // A destination that does not exist AT REGISTRATION but does by the time the
  // copy has run. Both keys used to be computed synchronously, before any
  // queued copy had created anything, so two spellings of one destination that
  // was not there yet — the ordinary case on a fresh build — each kept their
  // own. Keying after the copy fixes it, because by then the target exists and
  // both spellings resolve to it.
  //
  // Windows-gated like the case test below and for the same reason: on a
  // case-sensitive filesystem `out` and `OUT` genuinely ARE two destinations,
  // so the assertion would be false rather than merely unexercised. It runs on
  // CI's `windows-latest` leg.
  it.skipIf(process.platform !== 'win32')(
    'keys two spellings of a not-yet-created destination as one copy',
    async () => {
      site = await makeSite({
        'src/pages/index.hbs': 'hi',
        'vendor/css/lib.scss': 'body { color: ',
      })
      kiss = new Kiss({
        folders: { ...site.folders, assets: null },
        logger: silentLogger,
      })
      // Neither spelling exists yet; the copies create them.
      kiss.copyAssets(`${site.root}/vendor`, `${site.root}/out`)
      kiss.copyAssets(`${site.root}/vendor`, `${site.root}/OUT`)
      kiss.scan().generate()
      await expect(kiss.complete()).rejects.toThrow()
      expect(kiss._sassFailures.size).toBe(1)

      await site.touch('vendor/css/lib.scss', 'body { color: red; }')
      kiss.copyAssets(`${site.root}/vendor`, `${site.root}/out`)
      await kiss._assetQueue
      expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(0)
    },
  )

  // The case half, which only means anything on a case-insensitive
  // filesystem. It is not dead weight in CI: `.github/workflows/ci.yml` runs
  // the gates on `windows-latest` as well as `ubuntu-latest`, precisely
  // because this branch keeps turning on behaviour one platform cannot see.
  it.skipIf(process.platform !== 'win32')(
    'treats two spellings of one source as one copy (case)',
    async () => {
      site = await makeSite({
        'src/pages/index.hbs': 'hi',
        'src/assets/css/site.scss': 'body { color: ',
      })
      kiss = new Kiss({
        folders: { ...site.folders, assets: null },
        logger: silentLogger,
      })
      kiss.copyAssets(`${site.root}/src/assets`, `${site.root}/out`)
      kiss.scan().generate()
      await expect(kiss.complete()).rejects.toThrow()
      expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)

      await site.touch('src/assets/css/site.scss', 'body { color: red; }')
      kiss.copyAssets(`${site.root}/src/ASSETS`, `${site.root}/out`)
      await kiss._assetQueue
      expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(0)
    },
  )

  // A copy's key has to be the same string before and after its target
  // folder exists. `realpath` with a `resolve` fallback is not: it throws
  // ENOENT for a folder about to be created, falls back to the spelling, and
  // then returns the canonical spelling once the folder is there — one copy,
  // two keys, and the failure the first run recorded can never be cleared.
  it.skipIf(!canSymlink)(
    'keys a copy the same before and after its target exists',
    async () => {
      site = await makeSite({
        'src/pages/index.hbs': 'hi',
        'vendor/css/lib.scss': 'body { color: ',
      })
      await fs.ensureDir(`${site.root}/real`)
      await fs.symlink(`${site.root}/real`, `${site.root}/alias`, 'dir')
      kiss = new Kiss({
        folders: { ...site.folders, assets: null },
        logger: silentLogger,
        dev: true,
      })
      // `alias` exists; `alias/out` does not, and this copy creates it.
      kiss.copyAssets(`${site.root}/vendor`, `${site.root}/alias/out`)
      kiss.scan().generate()
      await expect(kiss.complete()).rejects.toThrow()
      expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)

      await site.touch('vendor/css/lib.scss', 'body { color: red; }')
      await kiss._replay().catch(() => {})
      expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(0)
    },
  )

  // The INITIAL copy, not just the replayed one. The queued copy used to
  // re-resolve the caller's raw arguments when the queue drained, so anything
  // that moved the working directory in between copied a different folder,
  // wrote it somewhere else, and recorded the result under the original's key.
  it('runs the initial copy against the directory it was registered in', async () => {
    site = await makeSite({
      'a/src/pages/index.hbs': 'hi',
      'a/vendor/css/lib.scss': 'body { color: red; }',
      'b/vendor/css/lib.scss': 'body { color: ',
    })
    const cwd = process.cwd()
    process.chdir(`${site.root}/a`)
    try {
      kiss = new Kiss({
        folders: { src: `${site.root}/a/src`, build: `${site.root}/a/public` },
        logger: silentLogger,
      })
      kiss.copyAssets('./vendor', './out')
      // Before the queue drains.
      process.chdir(`${site.root}/b`)
      kiss.scan().generate()
      await kiss.complete()

      expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(0)
      expect(await site.exists('a/out/css/lib.css')).toBe(true)
      expect(await site.exists('b/out')).toBe(false)
    } finally {
      process.chdir(cwd)
    }
  })

  // The `<sass: …>` label was derived at execution time from the caller's raw
  // argument against whatever the working directory was by then, so the same
  // copy's same failure came out relative or absolute depending on where the
  // process happened to be when the queue drained. Worse than unstable: a
  // relative label re-read from a different directory resolves to a DIFFERENT
  // file, which may exist and may compile perfectly, so an author following
  // the message opens a stylesheet with nothing wrong with it. It rides on
  // `err.failures`, `report().failures` and the KISS_REPORT line.
  it('names the failing stylesheet the same wherever the process is', async () => {
    site = await makeSite({
      'a/src/pages/index.hbs': 'hi',
      'a/vendor/css/bad.scss': 'body { color: ',
      'b/.keep': '',
    })
    const cwd = process.cwd()
    const labelAfter = async (moveTo) => {
      process.chdir(`${site.root}/a`)
      const k = new Kiss({
        folders: { src: `${site.root}/a/src`, build: `${site.root}/a/public` },
        logger: silentLogger,
      })
      k.copyAssets(`${site.root}/a/vendor`, `${site.root}/a/out`)
      if (moveTo) process.chdir(moveTo)
      k.scan().generate()
      await expect(k.complete()).rejects.toThrow()
      const view = k._failures
        .map((f) => f.view)
        .find((v) => v.startsWith('<sass:'))
      await k.close()
      return view
    }
    try {
      const stayed = await labelAfter(null)
      const moved = await labelAfter(`${site.root}/b`)
      expect(moved).toBe(stayed)
    } finally {
      process.chdir(cwd)
    }
  })

  // A refresh re-derives the report; it must not re-measure the build. The
  // duration is the build's, not the session's — a watch session left open
  // over lunch reported an hour-long build.
  it('keeps the settled duration across a refresh', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'hi',
      'src/assets/css/site.scss': 'body { color: red; }',
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger, dev: true })
      .scan()
      .generate()
    await kiss.complete()
    const settled = kiss.report().duration

    await new Promise((r) => setTimeout(r, 120))
    kiss.copyAssets(`${site.root}/src/assets`, `${site.root}/public`)
    await kiss._assetQueue
    expect(kiss.report().duration).toBe(settled)
  })

  // Two copies under one key, where the FIRST succeeds and the second fails.
  // The registration used to be written synchronously by the caller, so the
  // first copy's success evicted it before the second copy had run — leaving
  // an unresolved failure with no registration for a replay to re-run, and no
  // sequence of edits that could clear it for the rest of the session.
  //
  // I could not build this fixture and said so rather than claiming a fix; the
  // QA session produced it. The trick is chaining the break onto the first
  // copy's own promise, AHEAD of the second copy's, so the interleaving is
  // deterministic instead of raced.
  it('does not strand a failure when an earlier copy under the same key succeeded', async () => {
    site = await makeSite({
      'src/pages/index.hbs': 'hi',
      'vendor/css/lib.scss': 'body { color: red; }',
    })
    kiss = new Kiss({
      folders: { ...site.folders, assets: null },
      logger: silentLogger,
    })
    kiss.copyAssets(`${site.root}/vendor`, `${site.root}/out`) // succeeds
    kiss._assetQueue.then(() =>
      // Synchronous, so it has certainly landed before the second copy reads it.
      fs.writeFileSync(`${site.root}/vendor/css/lib.scss`, 'body { color: '),
    )
    kiss.copyAssets(`${site.root}/vendor`, `${site.root}/out`) // fails, same key
    kiss.scan().generate()

    await expect(kiss.complete()).rejects.toThrow()
    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)
    // The registration the replay needs is still there.
    expect(kiss._assetCopies.size).toBe(1)

    await site.touch('vendor/css/lib.scss', 'body { color: red; }')
    await kiss._replay().catch(() => {})
    await Promise.allSettled(kiss._promises)
    await kiss._assetQueue
    expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(0)
  })

  // `_assetCopies` is what a replay re-runs, and a replay happens later. A
  // relative path recorded as written is re-resolved against whatever the
  // working directory is by then.
  it('replays a relative copy against the directory it was registered in', async () => {
    site = await makeSite({
      'a/src/pages/index.hbs': 'hi',
      'a/vendor/css/lib.scss': 'body { color: ',
      'b/vendor/css/lib.scss': 'body { color: blue; }',
    })
    const cwd = process.cwd()
    process.chdir(`${site.root}/a`)
    try {
      kiss = new Kiss({
        folders: { src: './src', assets: null },
        logger: silentLogger,
        dev: true,
      })
      kiss.copyAssets('./vendor', './out/vendor')
      kiss.scan().generate()
      await expect(kiss.complete()).rejects.toThrow()
      expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(1)

      await fs.outputFile(
        `${site.root}/a/vendor/css/lib.scss`,
        'body { color: red; }',
      )
      process.chdir(`${site.root}/b`)
      await kiss._replay().catch(() => {})
      expect(views(kiss).filter((v) => v.startsWith('<sass:'))).toHaveLength(0)
    } finally {
      process.chdir(cwd)
    }
  })

  // `report()` is the machine verdict. Between settles it was a stale one: a
  // watch save that breaks a stylesheet puts the failure on `_failures` and
  // logs it in red at once, while `report().ok` went on saying true until the
  // next whole-site replay — so an agent reading the report was told the site
  // was fine while the console said otherwise.
  describe('report() between settles', () => {
    it('goes false when a watch save breaks a stylesheet, and back', async () => {
      site = await makeSite({
        'src/pages/index.hbs': 'hi',
        'src/assets/css/site.scss': 'body { color: red; }',
      })
      kiss = new Kiss({
        folders: site.folders,
        logger: silentLogger,
        dev: true,
      })
        .scan()
        .generate()
      await kiss.complete()
      expect(kiss.report().ok).toBe(true)

      kiss.watch({ entry: null })
      await kiss._watcher.ready
      await site.touch('src/assets/css/site.scss', 'body { color: ')
      await waitFor(() =>
        kiss._failures.some((f) => f.view.startsWith('<sass:')),
      )
      await kiss._assetQueue
      expect(kiss.report().ok).toBe(false)
      expect(kiss.report().failures).toHaveLength(1)

      await site.touch('src/assets/css/site.scss', 'body { color: blue; }')
      await waitFor(
        () => !kiss._failures.some((f) => f.view.startsWith('<sass:')),
      )
      await kiss._assetQueue
      expect(kiss.report().ok).toBe(true)
    })

    it('goes false when a helpers reload fails', async () => {
      site = await makeSite({
        'src/pages/index.hbs': 'hi',
        'helpers/index.js':
          'export function registerHelpers(kiss) { kiss.handlebars.registerHelper("x", () => "ok") }',
      })
      kiss = new Kiss({
        folders: { ...site.folders, helpers: `${site.root}/helpers` },
        logger: silentLogger,
        dev: true,
      })
        .scan()
        .generate()
      await kiss.complete()
      expect(kiss.report().ok).toBe(true)

      kiss.watch({ entry: null })
      await kiss._watcher.ready
      await site.touch(
        'helpers/index.js',
        'export function registerHelpers() { throw new Error("boom") }',
      )
      await waitFor(() =>
        kiss._failures.some((f) => f.view === '<site helpers>'),
      )
      await kiss._helpersReady
      expect(kiss.report().ok).toBe(false)
    })

    // The refresh must re-derive the report and NOTHING else. `_finishBuild()`
    // carries once-per-build side effects, and `KISS_REPORT` takes one line
    // per build rather than one per asset save — re-running it here would
    // trade a stale verdict for a corrupted record.
    it('does not write another KISS_REPORT line per asset save', async () => {
      site = await makeSite({
        'src/pages/index.hbs': 'hi',
        'src/assets/css/site.scss': 'body { color: red; }',
      })
      const reportFile = `${site.root}/report.jsonl`
      vi.stubEnv('KISS_REPORT', reportFile)
      try {
        kiss = new Kiss({
          folders: site.folders,
          logger: silentLogger,
          dev: true,
        })
          .scan()
          .generate()
        await kiss.complete()
        const afterBuild = (await site.read('report.jsonl')).trim().split('\n')
        expect(afterBuild).toHaveLength(1)

        kiss.watch({ entry: null })
        await kiss._watcher.ready
        await site.touch('src/assets/css/site.scss', 'body { color: ')
        await waitFor(() =>
          kiss._failures.some((f) => f.view.startsWith('<sass:')),
        )
        await kiss._assetQueue
        expect(kiss.report().ok).toBe(false)
        const afterSave = (await site.read('report.jsonl')).trim().split('\n')
        expect(afterSave).toHaveLength(1)
      } finally {
        vi.unstubAllEnvs()
      }
    })
  })

  it('still clears a failure the replay does re-derive', async () => {
    site = await makeSite({
      'src/pages/index.hbs': '{{title}}',
      'src/controllers/index.js':
        "module.exports = () => { throw new Error('nope') }",
    })
    kiss = new Kiss({ folders: site.folders, logger: silentLogger, dev: true })
      .scan()
      .generate()
    await expect(kiss.complete()).rejects.toThrow()
    expect(views(kiss)).toContain('index.hbs')

    kiss.watch({ entry: null })
    await kiss._watcher.ready
    await site.touch(
      'src/controllers/index.js',
      "module.exports = () => ({ title: 'fixed' })",
    )
    // The first build wrote nothing for this page — the controller threw — so
    // the read has to tolerate a file that is not there yet.
    await waitFor(
      async () =>
        (await site.read('public/index.html').catch(() => null)) === 'fixed',
    )
    await settled(kiss)

    expect(views(kiss)).toHaveLength(0)
  })
})
