// The build's asset copies: one queued `copyAssets` run per registration,
// and the bookkeeping around it — the `<sass: …>` failures each copy owns,
// the registrations a replay re-runs, the copies a released page claim can
// restore.
//
// `copyAssetFolder` takes the `Kiss` instance and reads its state at call
// time; state stays on the instance, and a call to another of its methods goes
// through `kiss._x()` so a test that patches one is seen. `lib/assets.js` is
// the copy itself and knows nothing of the instance.
import fs from 'fs-extra'
import path from 'node:path'
import utils from './utils.js'
import { copyAssets, assetCopyOwner } from './assets.js'

// A copy's identity: the resolved (source, target) pair, which is what a copy
// actually is. `null` when either half is missing — `folders.assets: null`
// switches the copy off and there is nothing to identify.
//
// Canonicalised through `realpath` where the path exists, because `resolve`
// preserves the SPELLING and on a case-insensitive filesystem two spellings
// are one directory: `./src/assets` in one call and `./src/Assets` in another
// are a typo that used to be invisible and became a failure the owning copy
// could not clear. A symlinked alias is the same shape. `realpath` throws on a
// path that is not there yet (a target this copy is about to create), which is
// the ordinary case, so it falls back to `resolve` — two spellings of a folder
// that does not exist are two keys, and by the time either matters the folder
// does exist.
// Canonicalises as much of the path as EXISTS, then re-appends the rest. A
// plain `realpath` with a `resolve` fallback looks equivalent and is not: it
// throws ENOENT for a target this copy is about to create, falls back to the
// spelling, and then succeeds — with the canonical spelling — the next time the
// same copy is keyed, after the folder exists. One copy, two keys, and the
// failure its first run recorded could never be cleared. Reproduced with a
// target inside a SYMLINKED parent (`alias -> real`), and on Windows with a
// case-different one.
//
// Walking to the deepest existing ancestor makes the key stable across the
// folder's creation, which is the property the whole scheme rests on: `alias`
// exists, so `alias/vendor` canonicalises to `real/vendor` before `vendor` is
// there and to the same thing afterwards.
export const canonical = (p) => {
  let current = path.resolve(p)
  const rest = []
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...[...rest].reverse())
    } catch {
      const parent = path.dirname(current)
      // The filesystem root itself does not exist (or cannot be read): nothing
      // to canonicalise, so the resolved spelling is the best answer there is.
      if (parent === current) return path.resolve(p)
      rest.push(path.basename(current))
      current = parent
    }
  }
}

export const assetCopyKey = (sourceDir, targetDir) =>
  sourceDir && targetDir
    ? `${canonical(sourceDir)}\u0000${canonical(targetDir)}`
    : null

/**
 * Queues one copy of `sourceDir` into `targetDir` (`Kiss._copyAssets`), and
 * records what it owns once it has run. Returns the queued run.
 *
 * @param {any} kiss
 * @param {string} sourceDir
 * @param {string} targetDir
 * @param {boolean} [watch] tracked by the rebuild queue instead of registration results
 */
export function copyAssetFolder(kiss, sourceDir, targetDir, watch = false) {
  // Resolved HERE, in the caller's working directory, at the moment they
  // asked — and it is these that the copy runs against. The queued copy used
  // to re-resolve the caller's raw arguments when the queue drained, so
  // anything that moved the working directory in between (a multi-site build
  // script, a tool that chdir's) copied a DIFFERENT `./vendor` than the one
  // registered, wrote it somewhere else, and recorded the result under the
  // original's key. Measured: the copy ran against the new directory and
  // neither directory got the output.
  const source = sourceDir ? path.resolve(sourceDir) : sourceDir
  const requested = targetDir ? path.resolve(targetDir) : targetDir
  const target = kiss._stagedPath(requested)
  const owner = source && requested ? assetCopyOwner(source, requested) : null
  // And the label with them. It names the source in a `<sass: …>` view, and
  // it was derived at EXECUTION time from the caller's raw argument against
  // whatever the working directory was by then — so the same copy's same
  // failure came out `<sass: vendor/css/bad.scss>` or
  // `<sass: /abs/path/A/vendor/css/bad.scss>` depending on where the process
  // happened to be when the queue drained. Measured, both from one fixture.
  // Worse than unstable: a relative label re-read from a different directory
  // resolves to a DIFFERENT file, which may exist and may compile perfectly,
  // so an author following the message opens a stylesheet with nothing wrong
  // with it. It rides on `err.failures`, `report().failures` and the
  // KISS_REPORT line, so it outlives the process that made it.
  //
  // Relative to the project when it stays inside it — `src/assets/css/x.scss`
  // is what the author sees in their editor — and absolute when it does not,
  // rather than a `../../..` chain that names nothing recognisable.
  const label = (() => {
    if (!source) return source
    const relative = utils.posixPath(path.relative(process.cwd(), source))
    // `path.relative(cwd, cwd)` is the empty string, and `${label}/${file}`
    // then reads as `/bad.scss` — a file at the filesystem root, which is
    // not where it is. `.copyAssets('.', target)` is an ordinary call.
    if (relative === '') return '.'
    return relative.startsWith('..') ? utils.posixPath(source) : relative
  })()
  const run = kiss._assetQueue.then(async () => {
    const result = await copyAssets(source, target, {
      config: {
        ...kiss.config,
        folders: {
          ...kiss.config.folders,
          build: kiss._stagedPath(kiss._defaultAssetCopy.targetDir),
        },
      },
      logger: kiss.logger,
      manifest: kiss._assetManifest,
      outputs: kiss._outputs,
      owner,
      // The paths the author wrote, for the id and the log line. Resolving
      // for correctness must not turn every build's asset line into an
      // absolute path the reader did not type.
      display: { source: sourceDir, target: targetDir },
    })
    // A stylesheet that will not compile is a build failure, in the same
    // shape as a pipeline step. It used to be logged in red and dropped:
    // `complete()` resolved, `report().ok` stayed true, `kiss-ssg check`
    // said ok, and the site shipped with no CSS — while `kiss-build-check`
    // tells an agent that ok and exit 0 are the only passing result. Found
    // by a clean-room conversion that published exactly that site.
    //
    // `folders.assets: null` switches the copy off entirely and `copyAssets`
    // returns before it compiles anything — so there is nothing to record,
    // and no source folder to name it after.
    if (!source || !result.sass) return result
    // Identity is scoped to the COPY, not to the file's name within it.
    // Two asset roots can hold `css/theme.scss`, and identifying a failure
    // by the source-relative name alone meant a second `.copyAssets()` whose
    // own copy compiled CLEARED the first root's failure — a green verdict
    // with the primary stylesheet missing.
    //
    // That scoping was first written as a prefix match on the view string,
    // and the string was the wrong place to put it. A view is `<sass:
    // src/assets/theme.scss>`, so a copy of `src/assets` cleared every
    // failure of a copy of `src/assets/nested` — a DESCENDANT root, whose
    // file the parent then compiled successfully to a different target, so
    // nothing ever raised it again. Measured: a nested stylesheet that
    // could not be written at all, on a build reporting `ok: true`. The
    // label is also cwd-relative, so two different roots take the same one
    // if the process chdir'd between the copies.
    //
    // So the copy owns its failures by object identity, keyed on the
    // RESOLVED (source, target) pair — what a copy actually is. Two copies
    // of one source into two targets are two independent obligations and
    // only one of them may have failed. Nothing is parsed out of a display
    // string, and nothing depends on the working directory.
    // Keyed HERE rather than at registration, because canonicalising a path
    // requires it to exist. Both keys used to be computed synchronously,
    // before any queued copy had created anything, so two spellings of one
    // destination that did not exist yet — the ordinary case on a fresh
    // build — could not canonicalise and each kept its own. Measured: two
    // keys for one destination, and a failure stranded under the one nothing
    // would ever reach again. By the time the copy has run the target is
    // there, and both spellings resolve to it.
    //
    // Registering here too means the registration is written in queue order,
    // by the run that owns it, rather than synchronously by a caller whose
    // copy has not happened yet — which is what let a copy that SUCCEEDED
    // evict a registration a later queued copy still needed.
    const key = /** @type {string} */ (assetCopyKey(source, target))
    // Cleared as a set rather than per returned file, so a stylesheet that
    // has since been DELETED or renamed loses its entry too: it is absent
    // from the new results, so a per-file clear could never reach it, and
    // `_failures` is otherwise swept only by `_replay()` — which carries
    // `<sass: …>` precisely because an asset re-copy is the only thing that
    // can re-check one.
    const owned = kiss._sassFailures.get(key)
    if (owned) kiss._failures = kiss._failures.filter((f) => !owned.has(f))
    const recorded = new Set()
    for (const { file, error } of result.sass ?? []) {
      if (!error) continue
      const failure = kiss._carry({
        view: `<sass: ${label}/${file}>`,
        // The source, not an output: it is the file the author opens, and a
        // stylesheet that did not compile has no output to name.
        buildTo: null,
        error,
      })
      recorded.add(failure)
      kiss._failures.push(failure)
    }
    // `report()` is the machine verdict and it was stale between settles:
    // this copy has just changed `_failures`, and an asset re-copy settles
    // no build, so nothing else will say so.
    kiss._refreshReport()
    if (owner && kiss._outputs.hasProducer(owner))
      kiss._restorableAssets.set(owner, {
        sourceDir: source,
        targetDir: requested,
      })
    else if (owner) kiss._restorableAssets.delete(owner)
    // An empty set is not worth keeping: a caller that copies into a new
    // destination on every run (a per-cohort export, say) would otherwise
    // add one permanent map entry per successful copy for ever.
    if (recorded.size) {
      kiss._sassFailures.set(key, recorded)
      // The registration exists exactly while a failure does, which is the
      // invariant the replay reads: it re-runs a copy only to re-check one.
      kiss._assetCopies.set(key, { sourceDir: source, targetDir: requested })
    } else {
      kiss._sassFailures.delete(key)
      // And the registration with it: a replay re-runs a copy only to
      // re-check a failure, so a copy with none is one it never needs. Both
      // maps are keyed the same way and pruned together, which is what keeps
      // a long-lived process copying into a fresh destination each run (a
      // per-cohort export) from accumulating one permanent entry per
      // success in either of them.
      kiss._assetCopies.delete(key)
    }
    return result
  })
  kiss._assetQueue = run
  if (!watch) kiss._promises.push(run)
  return run
}
