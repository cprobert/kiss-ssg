// The watch session: the file watcher's events, what each one means, and the
// one serial queue every rebuild goes through — a whole-site replay from the
// logged registrations, or a scoped re-render of the pages an edit can reach —
// with one live reload per settled rebuild.
//
// Every function takes the `Kiss` instance and reads its state at call time;
// state stays on the instance, and a call to another of its methods goes
// through `kiss._x()` / `kiss.generate()`, so a test that patches or
// replaces one on the instance (`_replay`, `_rebuild`, `_reload`,
// `_requestReplay`, `_requestRebuild`, `registerPartials`) is seen.
import fs from 'fs-extra'
import path from 'node:path'
import utils, { isInside } from './utils.js'
import { partialNameFor } from './partials.js'
import { createWatcher } from './watcher.js'
import { isActiveHelpersEntry } from './site-helpers.js'
import { assetCopyKey } from './asset-copy.js'
import { markdownCopyPath } from './markdown-copy.js'

// Watch-mode rebuild: re-run every registered page from its original
// options so edited models and controllers take effect (v1 only re-rendered
// templates with stale options). The build dir is never emptied here; stale
// outputs are removed file by file once the rebuild has finished.
export async function replaySession(kiss) {
  // Let any in-flight work finish before the reset below: a page chain (or a
  // single-page rebuild) still running would otherwise land in the *new*
  // stack and make the replay's own page lose the buildTo dedupe, stranding
  // the previous build's output. Replays never overlap each other — the
  // rebuild queue serialises them.
  await Promise.allSettled([...kiss._promises, ...kiss._generating])

  // What the previous build wrote — anything not rebuilt is stale output and
  // gets removed below (the build dir itself is never cleaned on a replay).
  // Plus anything an earlier replay could not sweep because it threw: that
  // list has to be carried, because `_stack` no longer mentions those files.
  // A `generate: false` entry wrote nothing, so it has no stale output to
  // sweep — the same `generate !== false` test the sweep's `current` uses.
  // Without the filter its path is swept on every replay: the `fs.remove` is
  // a no-op, but the "Removed stale output" line it logs is not.
  const previous = [
    ...new Set([
      ...kiss._unswept,
      ...kiss._stack
        .filter((entry) => entry.page.options.generate !== false)
        .map((entry) => entry.page.outputPath),
    ]),
  ]
  kiss._unswept = []
  const restore = new Set()
  const removePrevious = async (file) => {
    if (kiss._outputs.kind(file) !== 'page') return
    const owner = kiss._outputs.owner(file)
    const removed = await fs
      .unlink(file)
      .then(() => true)
      .catch((error) => {
        if (error.code !== 'ENOENT') throw error
        return false
      })
    kiss._outputs.release(file, owner)
    for (const asset of kiss._outputs.assetOwners(file)) restore.add(asset)
    if (removed) kiss.logger.info('Removed stale output:', file)
  }
  kiss._stack = []
  kiss._outputs.beginPages()
  // The stack is gone, so is everything the graph knew about it; every page
  // re-records itself as the replay renders it.
  kiss._graph.clear()
  kiss._promises = []
  kiss._generating = []
  kiss._failures = kiss._failures.filter((failure) =>
    kiss._carriedFailures.has(failure),
  )
  kiss._failuresReported = false
  // The rebuild is its own build: it gets its own report, and `report()`
  // hands out the newest one rather than the one the first build settled.
  // `_startedAt` moves with it, or a watch session's tenth rebuild would
  // report the hours since the process started as its duration.
  kiss._report = null
  // The stack is new, so every id resolved against the old one is gone with
  // it — and the rebuild says its own collisions out loud rather than
  // inheriting the first build's "already said that".
  kiss._idIndex = null
  kiss._idNoticed = new Set()
  kiss._sitemapPath = null
  kiss._llmsPath = null
  // The rebuild's own verdict on the same three keys: a scan, a redirects
  // file and a feed from the last build would otherwise be reported as this
  // one's. `_feedRequest` is *not* reset — like `_sitemapRequest` and
  // `_llmsRequest` it is the standing request a replay re-issues, and that
  // re-issue is `lib/feed.js`'s to add beside the `llms` one below.
  kiss._feedPath = null
  kiss._robotsResult = null
  kiss._links = null
  kiss._audit = null
  kiss._debugWritten = false
  kiss._redirectsPath = null
  kiss._redirectsJsonPath = null
  kiss._redirectsFormats = []
  kiss._redirectsFiles = []
  kiss._redirectsResult = null
  // The write itself is per-build, not per-instance: without this reset the
  // first build's latched promise would stand and the replay would publish a
  // build with no `_redirects` in it at all.
  kiss._redirectsRun = null
  kiss._startedAt = Date.now()
  kiss._callbacks = []
  kiss._assetQueue = Promise.resolve()
  kiss._pipelineResults = []

  // Everything from here to complete() is inside the sweep's try: a throw in
  // the re-registration half used to skip the finally entirely, losing
  // `previous` and stranding every stale output for the life of the process.
  let requeued = false
  try {
    // A step's output is a *source* file (a stylesheet a tool compiles into
    // the assets folder), so a whole-site rebuild has to run the steps again
    // and re-copy what they wrote — a model or controller edit can change
    // what the tool sees. Both are skipped when no step is configured, which
    // leaves the replay of every existing site exactly as it was. Scoped
    // re-renders (a page view, a partial, a layout) never come through here:
    // a tool that must see those edits is what `watch` is for.
    const redone = new Set()
    if (kiss.config.assets.pipeline.length > 0) {
      kiss._queuePipeline()
      redone.add(
        assetCopyKey(
          kiss._defaultAssetCopy.sourceDir,
          kiss._stagedPath(kiss._defaultAssetCopy.targetDir),
        ),
      )
      kiss.copyAssets(
        kiss._defaultAssetCopy.sourceDir,
        kiss._defaultAssetCopy.targetDir,
      )
    }
    // The other half of carrying `<sass: …>` across a replay. Carrying rests
    // on "each is cleared by its own producer when that producer runs
    // again", and that was only ever true of `config.folders.assets`: the
    // replay above and the watcher's `assetsChanged` both re-run THAT copy
    // and no other, so a root the site registered itself with
    // `kiss.copyAssets(other, dest)` was never re-run and its failure could
    // not be cleared by anything. Measured: break a second root's
    // stylesheet, fix it on disk, replay — still failed, for the rest of the
    // session, on a build whose files are all correct. That is the mirror of
    // the bug the carrying fixed, and it is the worse half to leave: an
    // author who fixes a file and watches the build stay red stops believing
    // the verdict, which is the credibility the loud-failure work was spent
    // buying.
    //
    // So a replay re-runs the copies it has something to RE-CHECK: the ones
    // still holding an unresolved failure. A healthy root is not re-copied,
    // because a model or controller edit cannot have changed it and copying
    // every asset root on every keystroke is the cost this guard exists to
    // avoid.
    for (const [key, owned] of kiss._sassFailures) {
      if (redone.has(key)) continue
      if (!kiss._failures.some((failure) => owned.has(failure))) continue
      const copy = kiss._assetCopies.get(key)
      if (copy) kiss.copyAssets(copy.sourceDir, copy.targetDir)
    }
    kiss.registerPartials()

    // A page scan() discovered is only as real as its file: once the view is
    // deleted the registration goes with it, so its output falls to the orphan
    // sweep below instead of every later replay failing on the missing view.
    // A page registered by name stays — the author asked for it, and silently
    // dropping it would hide a typo.
    kiss._registrations = kiss._registrations.filter((registration) => {
      if (!kiss._scanned.has(registration)) return true
      if (fs.existsSync(`${kiss.config.folders.pages}/${registration.view}`))
        return true
      kiss.logger.notice('Removed page:', registration.view)
      return false
    })

    // Snapshot before the re-scan below, which registers *and* queues each
    // new page itself: replaying the post-scan list would queue those a
    // second time and lose them to `_preparePage`'s buildTo dedupe.
    const registered = [...kiss._registrations]

    // A page file created since the last scan belongs to no registration, so
    // only scanning again can find it. `_replaying` is still false here, so
    // `page()` records what it finds as a new (scanned) registration, which
    // every later replay then replays like any other.
    if (kiss._scanRequested) kiss.scan()

    kiss._replaying = true
    try {
      for (const options of registered)
        kiss._page({ ...options }, kiss._registrationDirectories.get(options))
    } finally {
      kiss._replaying = false
    }
    // The whole site is queued from here on, so an empty slot in the new
    // stack means the page is gone rather than that the replay never got
    // to it — which is exactly what the sweep reads it as.
    requeued = true
    kiss.generate()
    if (kiss._sitemapRequest) {
      kiss.sitemap(kiss._sitemapRequest.options, kiss._sitemapRequest.callback)
    }
    if (kiss._llmsRequest) {
      kiss.llms(kiss._llmsRequest.options, kiss._llmsRequest.callback)
    }
    if (kiss._feedRequest) {
      kiss.feed(kiss._feedRequest.options, kiss._feedRequest.callback)
    }
    if (kiss._robotsRequest) {
      kiss.robots(kiss._robotsRequest.options, kiss._robotsRequest.callback)
    }
    await kiss.complete()
  } finally {
    // A replay that threw before re-queuing has an empty stack because it
    // failed, not because the site shrank: sweeping against it would delete
    // the whole build. Hold the paths for the next replay instead.
    if (!requeued) kiss._unswept = previous
    else {
      const current = new Set(
        kiss._stack
          .filter((entry) => entry.page.options.generate !== false)
          .map((entry) => entry.page.outputPath),
      )
      for (const file of previous) {
        if (current.has(file)) continue
        await removePrevious(file)
        // The dev-mode debug sibling, same trailing-extension swap as
        // KissPage. Guarded: a currently registered page can build to that
        // exact path (e.g. an `ext: 'json'` page), and its output must never
        // be deleted.
        const sibling = file.replace(/\.[^.]+$/, '.json')
        if (!current.has(sibling)) await removePrevious(sibling)
      }
      // Markdown copies are swept as a set of their own, not as a sibling of
      // each stale page: two pages can share one copy (`x.html` and `x.htm`
      // are both `x.md`), so the copy of a page that went may be the copy of
      // the page that replaced it; and a page that stays can stop writing
      // one. A copy goes when no page this build writes owns it.
      // `removePrevious` deletes only what the registry says a page wrote,
      // so a page that never had a copy, or a hand-copied asset `x.md`, is
      // left alone.
      const currentCopies = new Set(
        kiss._stack
          .filter((entry) => entry.page.markdownTo)
          .map((entry) => markdownCopyPath(entry.page.outputPath)),
      )
      for (const file of previous) {
        const copy = markdownCopyPath(file)
        if (copy && !currentCopies.has(copy) && !current.has(copy))
          await removePrevious(copy)
      }
      // Restoration is part of the sweep, even when complete() rejected.
      // Each affected copy runs once; healthy unrelated copies stay untouched.
      const before = kiss._assetManifest.urlRevision
      for (const owner of restore) {
        const copy = kiss._restorableAssets.get(owner)
        if (copy) await kiss._copyAssets(copy.sourceDir, copy.targetDir, true)
      }
      if (kiss.config.assets.hash && before !== kiss._assetManifest.urlRevision)
        await kiss._rebuild(kiss._stack)
      // complete() checked while the old outputs still existed. Publish the
      // final verdict only after both orphan removal and asset restoration.
      kiss._links = null
      kiss._checkLinks()
      kiss._audit = null
      kiss._runAudit()
    }
    kiss._refreshReport()
  }
}

// Every rebuild — whole-site replay or scoped re-render — goes through one
// serial queue with one in-flight slot and one pending slot, so a burst of
// watcher events (save-all, formatter, branch switch) ends with the newest
// edit on disk instead of a dropped one. Two rebuilds must never overlap:
// `_replay()` resets `_stack`, so a second one interleaved with the first
// lets the first's pending chains land in the new stack and the newer pages
// then lose the `buildTo` dedupe; and scoped work in flight when a replay
// starts renders from a stack the replay is about to discard.
export function requestReplay(kiss) {
  kiss._pendingReplay = true
  // A replay rebuilds everything, so it supersedes every scoped target.
  kiss._pendingTargets.clear()
  return kiss._runRebuildQueue()
}

// Scoped rebuild: re-render just these stack entries. A no-op while a replay
// is pending — that replay already covers them.
export function requestRebuild(kiss, entries) {
  if (!kiss._pendingReplay)
    for (const entry of entries) kiss._pendingTargets.add(entry)
  return kiss._runRebuildQueue()
}

export function runRebuildQueue(kiss) {
  if (kiss._rebuildInFlight) return kiss._rebuildInFlight
  if (kiss._closing) return Promise.resolve()
  const replay = kiss._pendingReplay
  const targets = [...kiss._pendingTargets]
  const assets = [...kiss._pendingAssets]
  if (!replay && targets.length === 0 && assets.length === 0)
    return Promise.resolve()
  kiss._pendingReplay = false
  kiss._pendingTargets.clear()
  kiss._pendingAssets.clear()
  let renderAssets = false
  let refreshPath = '/'
  kiss._rebuildInFlight = (async () => {
    if (assets.length) {
      await Promise.allSettled([...kiss._promises, ...kiss._generating])
      const before = kiss._assetManifest.urlRevision
      const result = await kiss._copyAssets(
        kiss._defaultAssetCopy.sourceDir,
        kiss._defaultAssetCopy.targetDir,
        true,
      )
      renderAssets =
        kiss.config.assets.hash && before !== kiss._assetManifest.urlRevision
      if (
        !replay &&
        !renderAssets &&
        targets.length === 0 &&
        assets.length === 1 &&
        assets[0][1] === 'change'
      ) {
        const changed = assets[0][0]
        if (/\.(scss|sass)$/i.test(changed)) {
          const styles = (result.sass ?? []).filter((item) => item.changed)
          if (
            styles.length === 0 &&
            !result.error &&
            !(result.sass ?? []).some((item) => item.error || item.refused)
          )
            refreshPath = null
          if (styles.length === 1)
            refreshPath = kiss._builtAssetPath(
              path.join(kiss._defaultAssetCopy.sourceDir, styles[0].file),
            )
        } else refreshPath = kiss._builtAssetPath(changed)
      }
    }
    if (replay) {
      await kiss._replay()
    } else if (renderAssets || targets.length)
      await kiss._rebuild(renderAssets ? kiss._stack : targets)
  })()
    .catch((err) => {
      kiss.logger.error('Error rebuilding site', err.message)
      kiss.logger.warn(err)
    })
    .finally(() => {
      kiss._rebuildInFlight = null
      // One reload for the whole rebuild, and only now: a replay's orphan
      // sweep has run, so the browser cannot fetch a page still being
      // written or one about to be removed.
      if (refreshPath !== null) kiss._reload(refreshPath)
      // Deliberately not returned: the follow-up must not be chained into
      // the promise this run's requesters are holding.
      kiss._runRebuildQueue()
    })
  return kiss._rebuildInFlight
}

// Tracked on `_generating` like a watcher single-page rebuild, so a later
// replay's allSettled waits for it and complete() drains it.
export async function rebuildEntries(kiss, entries) {
  // A helper reload removes the old registrations before it awaits the
  // registrar, so there is a window in which the registry is short. The
  // rebuild queue serialises renders against each other but knew nothing
  // about that window, so a page edit landing inside it rendered against
  // the gap. Awaiting here is the ordering: `_helpersReady` always settles
  // (`_loadHelpers` records a failure rather than rejecting).
  await kiss._helpersReady
  // A target queued before a replay belongs to the stack that replay
  // discarded: re-rendering it would write from options nothing holds any
  // more. Expected, so not logged.
  const live = entries.filter((entry) => kiss._stack.includes(entry))
  // A scoped re-render used to swallow every rejection, so a page that
  // started failing under `.watch()` was loud in the console and absent
  // from BOTH `_failures` and `report()` — the one path that put nothing on
  // the list at all. It records them like any other failure now.
  //
  // This re-render is also the only thing that can re-check these pages, so
  // it drops their previous failure first: the same producer-owns-what-it-
  // re-derives rule the asset copy and the helpers reload follow, and what
  // makes a fixed page clear rather than stay red for the session.
  for (const entry of live) kiss._clearPageFailure(entry)
  const runs = live.map((entry) =>
    entry.page.generate().catch((error) => {
      kiss._recordPageFailure(entry, error)
    }),
  )
  kiss._generating.push(...runs)
  await Promise.all(runs)
  // A scoped rebuild settles no build, so nothing else refreshes the verdict.
  kiss._refreshReport()
}

// The watch dispatch: the watcher forwards every event under `src`, and this
// decides what it means. A whole-site replay is the default and the fallback;
// only two cases are scoped, and both are provably narrower than a replay.
export function handleChange(kiss, event, changedPath) {
  const changed = utils.posixPath(changedPath)
  const pagesDir = utils.posixPath(kiss.config.folders.pages)
  const inside = (dir) => !!dir && isInside(dir)(changed)
  const replay = () => {
    kiss.logger.notice('Rebuilding site:')
    return kiss._requestReplay()
  }

  // A file or folder that did not exist has no stack entry to re-render:
  // only a replay can register it (a new partial or layout) or sweep the
  // site around it.
  if (event === 'add' || event === 'addDir') {
    kiss.logger.info(`${event}: ${changed}: `)
    return replay()
  }
  // Resolved, like every other folder test in this method. It was a raw
  // `changed.startsWith(pagesDir + '/')`, which compares two path SPELLINGS:
  // `folders` derives the six folders from `src` so they normally share a
  // form, but either can be given explicitly, and a site naming `src`
  // relatively and `pages` absolutely made this false for every page edit.
  // The consequence was the safe direction and therefore invisible — the
  // view matched no stack entry, so the edit fell through to the replay
  // fallback — but a scoped re-render of one page silently becoming a
  // whole-site rebuild is the difference this branch spent its benchmark
  // work on. Measured on exactly that config before the fix.
  const inPages = inside(kiss.config.folders.pages)
  // A deleted page view cannot be re-rendered on its own: only a full
  // replay can drop its stack entry and sweep the stale output.
  if (event === 'unlink' && inPages) {
    kiss.logger.info(`${event}: ${changed}: `)
    return replay()
  }
  // An edited partial or layout cannot change the page set, any page's
  // options, its output path or the sitemap — so re-registering and
  // re-rendering the stack is exactly a replay minus its expensive half
  // (every model re-read, every controller re-imported, every URL model
  // re-fetched). An `unlink` here is not in this branch: a vanished partial
  // has to go through a replay to be unregistered and reported.
  if (
    event === 'change' &&
    (inside(kiss.config.folders.partials) ||
      inside(kiss.config.folders.layouts))
  ) {
    // Whether a rebuild already in flight read this file before or after the
    // edit landed is a race nobody can reason about, so it is upgraded to a
    // replay rather than scoped.
    if (kiss._rebuildInFlight) return replay()
    kiss.registerPartials()
    const name = partialNameFor(changed, kiss.config.folders)
    const dependents = name ? kiss._graph.dependentsOf(name) : null
    // Never seen: nothing has rendered it yet — a page that failed before
    // reaching it included. Every page is the safe answer, and the notice is
    // what turns a slow-but-correct rebuild into a fixable gap.
    if (dependents === null) {
      kiss.logger.notice(
        `No page has rendered ${changed} yet: re-rendering every page`,
      )
      kiss.logger.info(`${event}: ${changed}: `, kiss._stack.length)
      return kiss._requestRebuild(kiss._stack)
    }
    const wanted = new Set(dependents)
    const entries = kiss._stack.filter((entry) => wanted.has(entry.buildTo))
    kiss.logger.info(`${event}: ${changed}: `, entries.length)
    entries.forEach((m) => kiss.logger.info('Rebuilding:', m.page.view))
    return kiss._requestRebuild(entries)
  }
  // Relative to the folder rather than sliced by its string length, for the
  // same reason: the two may be spelt differently and still be the same
  // place. `entry.view` is the name the page was registered under, which is
  // this path relative to `folders.pages`.
  const lookup = inPages
    ? utils.posixPath(
        path.relative(path.resolve(pagesDir), path.resolve(changed)),
      )
    : changed
  const matches = kiss._stack.filter((e) => e.view === lookup)
  kiss.logger.info(`${event}: ${changed}: `, matches.length)
  // Anything with no stack entry of its own — a model, a controller, an
  // unknown file — can affect any page, so it takes the replay.
  if (matches.length === 0) {
    // A replay re-reads every model and re-imports every controller (on a
    // cache-busted URL, `lib/controller-resolver.js`), so an edit to either
    // reaches this build. Nothing else the build script imported does: the
    // module is already in the ESM cache, and the replay runs from the
    // registrations logged at first import rather than by re-running the
    // script. Saying only `Rebuilding site:` would then present a change
    // that was never applied as one that was — a helper edit rebuilds the
    // site, reloads the browser and serves the old output.
    // Only a JavaScript module can be stuck: it is what `import` caches.
    // A data file (`.json`, `.md`, `.csv`) under `src` is read at render
    // time — the pattern the docs recommend for helper data — so a replay
    // re-renders every page against whatever is on disk now and the edit
    // does land. Asking for a restart there would be the same lie in
    // reverse: telling the author their working edit had not taken.
    if (
      /\.[cm]?js$/i.test(changed) &&
      !inside(kiss.config.folders.models) &&
      !inside(kiss.config.folders.controllers) &&
      // A site that points `folders.helpers` inside `src` gets both
      // watchers on the same file. The helpers watcher re-imports and
      // re-registers, so the edit *does* take effect and asking for a
      // restart would be the lie this notice exists to prevent.
      !inside(kiss.config.folders.helpers)
    )
      kiss.logger.notice(
        `${changed} is not a page, partial, layout, model or controller: if the build script imports it (a helper module, say), restart to pick the change up — a rebuild cannot`,
      )
    return replay()
  }
  matches.forEach((m) => kiss.logger.info('Rebuilding:', m.page.view))
  return kiss._requestRebuild(matches)
}

// The body of `watch()`, which keeps its documentation and its default
// `entry` (`process.argv[1]`) on `Kiss`. Starts the watcher once.
export function startWatching(kiss, entry) {
  if (kiss._watcher) return
  kiss._watcher = createWatcher({
    config: kiss.config,
    entry,
    rebuildSite: () => {
      // The entry script is watched because the page list itself may have
      // changed — but a replay cannot read a changed page list: the script
      // is already in the ESM cache and the replay runs from the
      // registrations logged at start-up. A template or model edit in the
      // same save does take effect, so the rebuild is still worth doing;
      // announcing it alone is what made an added page look built.
      kiss.logger.notice(
        'The build script changed: a rebuild replays the pages registered at start-up, so an added, removed or renamed page needs a restart',
      )
      kiss.logger.notice('Rebuilding site:')
      kiss._requestReplay()
    },
    onChange: (event, p) => kiss._handleChange(event, p),
    // An edited helper ENTRY re-imports on a cache-busted URL and
    // re-registers — Handlebars replaces a helper of the same name, and a
    // name the new source dropped is unregistered (`lib/site-helpers.js`).
    // Then every page is re-rendered: helpers only affect rendering, so
    // this is a replay minus its expensive half (no model re-read, no
    // controller re-import, no URL model re-fetch).
    //
    // A module the entry *imports* is a different matter. The bust applies
    // to the entry's URL only, so `import './format.js'` still resolves to
    // the un-busted URL and comes back from the ESM cache: the registrar
    // would re-register the OLD helper while every page re-rendered and the
    // browser reloaded — the dev rebuild trap, inside the feature built to
    // remove it. ESM has no cache-invalidation API, so there is no honest
    // reload to offer; say so and change nothing, which is the same answer
    // `_handleChange` gives for any other module the build script imports.
    //
    // A supported mechanism DOES exist and is declined rather than absent —
    // `module.register()` with a resolve hook that propagates the parent's
    // query to relative children evicts siblings, measured. It is
    // process-global, and kiss is a library in somebody else's process.
    // `AIKB/upstream.md` carries the measurement and the reasoning, and is
    // where to look if Node ever offers a scoped invalidation.
    helpersChanged: (changed) => {
      // Three outcomes, and getting the first one wrong made the whole
      // feature inert: `isHelpersEntry` resolves both sides, because the
      // default `./helpers` is relative and the watcher's events are too,
      // while `helpersEntry` is absolute.
      if (isActiveHelpersEntry(kiss.config.folders.helpers, changed)) {
        kiss._helpersReady = kiss._helpersReady.then(() =>
          kiss._loadHelpers(true),
        )
        kiss._helpersReady.then(() => kiss._requestRebuild(kiss._stack))
        return
      }
      // Only a JavaScript module can be stuck, because it is what `import`
      // caches. A data file beside the helpers (`labels.json`) is read at
      // render time by whatever helper reads it, so re-rendering the stack
      // does pick the edit up — asking for a restart there would be the
      // same lie in reverse, and it is the lie this branch already had to
      // correct once in `_handleChange`.
      if (!/\.[cm]?js$/i.test(changed)) return kiss._requestRebuild(kiss._stack)

      kiss.logger.notice(
        `${changed} is imported by the helpers entry rather than being it: kiss can re-import only the entry itself, so restart to pick this change up — a rebuild would re-register the helper this file used to define`,
      )
    },
    assetsChanged: (changed, event) => {
      kiss._pendingAssets.set(changed, event)
      kiss._runRebuildQueue()
    },
    logger: kiss.logger,
  })
  return
}

// Where an edited asset lands in the build folder. Naming the built file is
// what lets livereload swap a stylesheet in place instead of reloading the
// page; sass compiles to .css beside where its source sat.
export function builtAssetPath(kiss, changed) {
  const {
    sourceDir: assets,
    targetDir: build,
    directory,
  } = kiss._defaultAssetCopy
  // With no assets folder nothing was copied, so there is nothing to name.
  if (!assets || !build) return '/'
  const plain = path.resolve(
    build,
    path.relative(assets, path.resolve(directory, changed)),
  )
  const built = /\.(scss|sass)$/i.test(plain)
    ? plain.replace(/\.[^.]+$/, '.css')
    : plain
  // Under a renaming policy the file on disk carries a content hash, so the
  // plain name would send livereload after a file that is not there.
  const emitted = kiss._assetManifest.lookup(
    utils.posixPath(path.relative(path.resolve(build), built)),
  )
  return emitted ? path.resolve(build, emitted) : built
}

// Live reload is driven from here, once per settled build, because nothing
// watches the build folder (see AIKB/dev-server.md). A live-reload socket
// that has gone away must never fail the rebuild that called kiss.
export function reload(kiss, changed = '/') {
  if (!kiss._devServer) return
  try {
    kiss._devServer.refresh(changed)
  } catch (err) {
    kiss.logger.debug(err.stack)
  }
}
