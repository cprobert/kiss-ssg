import fs from 'fs-extra'
import path from 'node:path'
import Handlebars from 'handlebars' // https://handlebarsjs.com/
import layouts from 'handlebars-layouts' // https://www.npmjs.com/package/handlebars-layouts
import { Remarkable } from 'remarkable'
import utils from './utils.js'
import { createLogger } from './logger.js'
import { resolveConfig, foldersToEnsure } from './config.js'
import { registerHandlebarsHelpers } from './handlebars-helpers.js'
import { registerPartials } from './partials.js'
import { DependencyGraph } from './dependency-graph.js'
import { copyAssetFolder } from './asset-copy.js'
import {
  idIndexFor,
  logViewStats,
  lookupPage,
  prepareMultiplePages,
  preparePage,
  registerPage,
  scanPages,
  stackForRecord,
} from './page-registry.js'
import { createPipeline } from './pipeline.js'
import { createAssetManifest } from './asset-manifest.js'
import { OutputRegistry } from './output-registry.js'
import {
  renderFirebaseRedirects,
  renderHtaccessRedirects,
  renderRedirects,
  renderRedirectsJson,
  renderVercelRedirects,
} from './redirects.js'
import { checkModeRequested } from './check.js'
import {
  buildAikb,
  finishBuild,
  findRedirectChanges,
  lastBuildRecord,
  refreshReport,
  reportInputs,
  runAudit,
  runLinkCheck,
  writeAliasRedirects,
} from './build-finish.js'
import {
  builtAssetPath,
  handleChange,
  rebuildEntries,
  reload,
  replaySession,
  requestRebuild,
  requestReplay,
  runRebuildQueue,
  startWatching,
} from './rebuild.js'
import { loadSiteHelpers } from './site-helpers.js'
import { writeSitemap } from './sitemap.js'
import { writeLlms } from './llms.js'
import { feedFileName, writeFeed } from './feed.js'
import { writeRobots } from './robots.js'
import { splitDocument, parseHtml, findTag } from './html-split.js'
import { preloadMinifier } from './kiss-page.js'
import { startDevServer } from './dev-server.js'
import {
  abandonStaging,
  discardStaging,
  promote,
  removeStaging,
  renameForPromote,
  restorePrevious,
  stagedPath,
  stagingSiblings,
  swapIn,
  sweepStaleSiblings,
  toReportedPath,
  writeConfig,
  writeRoot,
} from './staging.js'

// A whole-site replay sweeps `_failures` and rebuilds the list as it re-runs
// the work — which is honest only for the work it actually re-runs. It re-runs
// every page, every controller, every callback and the redirects. It does not
// re-import the helpers entry, it does not restart the dev server, and it
// recompiles the stylesheets only when an `assets.pipeline` step is configured
// (the ordinary site has none). Those three were cleared and never said again,
// so a site whose `site.scss` would not compile went green on the next
// controller save with nothing fixed — `report().ok` true, `ok` in the report
// file, and no CSS in the build. The red line had scrolled past minutes
// earlier. So the replay carries them instead.
//
// Carrying cannot strand one either, because each is cleared by its own
// producer when that producer runs again: `copyAssets` clears the failures of
// the copy it is redoing (by the prefix that names that copy, so a second
// asset root keeps its own), and `_loadHelpers` clears `<site helpers>` before
// it reports the new attempt. The edit that fixes the file is what runs the
// producer. `<dev server>` has no second attempt at all — nothing restarts it
// — which is precisely why dropping it was wrong.
//
// `<pipeline…>` is deliberately NOT carried: it exists only on a site that has
// configured steps, and that is exactly the site whose replay re-runs them.
//
// The decision is recorded on `_carriedFailures` — a WeakSet holding the very
// failure objects their producers marked — rather than taken by matching the
// `view` string. The first version tested `view.startsWith('<sass: ')`, and
// `view` is not an engine sentinel for every failure: for an inline template
// it is the TEMPLATE TEXT (`KissPage`), which the author writes. A page
// registered as `view: '<sass: x> {{custom "y"}}'` whose helper threw once
// recorded a failure no replay would ever drop — permanent, while the page
// rendered perfectly. Contrived as a literal, but the shape is not: a carry
// decision taken by pattern-matching a display string is being taken on user
// data. A WeakSet decides it at the one place that knows (the push), needs no
// pruning, and keeps `_failures` entries exactly the documented
// `{ view, buildTo, error }` shape that `err.failures` hands out.

/** @typedef {import('./build-report.js').BuildReport} BuildReport */
/** @typedef {import('./build-report.js').BuildPage} BuildPage */
/** @typedef {import('./build-report.js').BuildAsset} BuildAsset */
/** @typedef {import('./build-report.js').BuildReportFailure} BuildReportFailure */
/** @typedef {import('./build-report.js').BuildPipelineStep} BuildPipelineStep */
/** @typedef {import('./build-report.js').BuildAikb} BuildAikb */
/** @typedef {import('./build-report.js').BuildLinks} BuildLinks */
/** @typedef {import('./build-report.js').BuildBrokenLink} BuildBrokenLink */
/** @typedef {import('./build-report.js').BuildRedirects} BuildRedirects */
/** @typedef {import('./build-report.js').BuildRobots} BuildRobots */
/** @typedef {import('./aikb.js').SiteMap} SiteMap */
/** @typedef {import('./pipeline.js').PipelineStep} PipelineStep */
/** @typedef {import('./config.js').KissConfig} KissConfig */
/** @typedef {import('./config.js').KissConfigInput} KissConfigInput */
/** @typedef {import('./config.js').KissFolders} KissFolders */

/**
 * The documented options of one page. Only `view` is required. Any key not
 * listed here is allowed too — `PageOptions` adds an index signature for them —
 * and reaches the template as top-level render context.
 *
 * @typedef {Object} PageOptionsKnown
 * @property {string} view a `.hbs` filename relative to `config.folders.pages`, or a template string
 * @property {string} [id] this page's identity, what `{{link "<id>"}}` resolves. Default: the view's route without its extension (`blog/listing.hbs` → `blog/listing`); on a `.pages()` fan-out the registration's `id` is the *prefix* its items' default ids use (`<prefix>/<slug>`) and a *record*'s own `id` wins outright, the way `aliases` belongs to the record. An inline template and a `generate: false` page have no id
 * @property {any} [model] a `.json` filename, a models folder name, an `http(s)://` URL, a plain object or an array — and the resolved data itself by the time a controller sees it
 * @property {string|KissController} [controller] a `.js` filename relative to `config.folders.controllers`, or the function itself
 * @property {string} [title] filled from `model.title` when the model has one and this is unset
 * @property {string} [description]
 * @property {string} [path] output folder, inferred from `view` when omitted
 * @property {string} [slug] output filename, inferred from `view` when omitted
 * @property {string} [ext] output extension, default `html`
 * @property {boolean} [generate] `false` skips building this one page entirely
 * @property {KissConfigInput} [config] per-page config overrides, merged over the site config for this page alone
 * @property {boolean} [ignoreSitemap] keep this page out of `sitemap.xml`
 * @property {string} [sitemapPriority] default `'1.00'`
 * @property {string} [sitemapChangefreq] omitted from the XML unless set
 * @property {string} [sitemapLastmod] default: one timestamp shared by every page
 * @property {boolean} [ignoreLlms] keep this page out of `llms.txt`
 * @property {string} [llmsSection] the `llms.txt` section this page is listed under, overriding its path
 * @property {boolean} [ignoreFeed] keep this page out of the `.feed()` document
 * @property {Date|number|string} [date] the page's date; `.feed()` orders by it and leaves out a page without one (the field name is `.feed()`'s `dateField`)
 * @property {string[]} [aliases] old URL paths this page now answers (`['/old-slug']`); each becomes one `301` line in `<build>/_redirects`. On a `.pages()` fan-out it belongs to the *record*, not to the registration
 */

/**
 * The options `.page()` takes: {@link PageOptionsKnown} plus any extra keys of
 * your own, which the page renders with.
 *
 * @typedef {PageOptionsKnown & Record<string, any>} PageOptions
 */

/**
 * The options `.pages()` takes. Identical to {@link PageOptions}: the fan-out
 * requirement is that the model *resolves* to an array — a `.json` file or
 * models folder holding one, a URL that returns one, or an array passed
 * directly — which is a property of the resolved data, not of the option.
 *
 * @typedef {PageOptions} PagesOptions
 */

/**
 * What a controller returns: any subset of the page's options, merged over
 * them. Returning nothing leaves the options as they were.
 *
 * @typedef {Partial<PageOptionsKnown> & Record<string, any>} PageOptionsPatch
 */

/**
 * A page's controller, run once its model has resolved and before the page is
 * prepared. Synchronous: the patch is spread over the options as it is
 * returned, so a promise would be spread rather than awaited. A controller that
 * throws fails that page and makes `complete()` reject.
 *
 * @callback KissController
 * @param {PageOptions} options the page's options, with `model` resolved
 * @returns {PageOptionsPatch|void}
 */

/**
 * One entry of the array `.generate()` and `.complete()` hand back: one
 * resolved model, in registration order. The construction-time asset copy is
 * queued first, so entry 0 is that copy rather than your first page — look
 * models up with `.getModelByID()` instead of by position.
 *
 * @typedef {Object} BuildDatum
 * @property {string} [id] the model filename or URL; an object model gets a hash, a page with no model has no id
 * @property {any} data the resolved model, or `null` when it failed to resolve
 * @property {Error} [error] why the model failed to resolve
 */

/** @typedef {BuildDatum[]} BuildData */

/**
 * One thing that failed to build. `buildTo` is `null` when the failure happened
 * before the page had an output path — a controller, a `.pages()` item, a
 * `generate`/`sitemap` callback, or the dev server.
 *
 * @typedef {Object} BuildFailure
 * @property {string} view
 * @property {string|null} buildTo
 * @property {Error} error
 */

/**
 * What `complete()` rejects with when anything failed to build: an
 * `AggregateError` over the underlying errors, carrying the whole list on
 * `failures` and the same build as data on `report`.
 *
 * @typedef {AggregateError & { failures: BuildFailure[], report: BuildReport }} BuildError
 */

/**
 * One `<url>` of the sitemap, as handed to `.sitemap()`'s callback.
 *
 * @typedef {Object} SitemapUrl
 * @property {string} loc
 * @property {string} lastmod
 * @property {string} priority
 * @property {string} [changefreq]
 */

/**
 * @typedef {Object} SitemapOptions
 * @property {boolean} [overwrite] default `true`; `false` leaves an existing `sitemap.xml` alone
 */

/**
 * The options `.llms()` takes. `title` and `summary` are required — without
 * either, kiss logs an error and writes nothing, exactly as it does for a
 * sitemap with no `siteUrl`.
 *
 * @typedef {Object} LlmsOptions
 * @property {string} title the site's name — the file's `# ` heading
 * @property {string} summary what the site is, as a `> ` blockquote: the text itself, or a path (relative to `process.cwd()`) to a `.md`/`.txt` file holding it
 * @property {string} [notes] a trailing `## Notes` section; same text-or-file rule as `summary`
 * @property {Record<string, string>} [sections] top-level path segment → section heading (`{ courses: 'Courses' }`); the key `root` names the section holding pages with no path (default `Pages`). An unmapped segment is title-cased.
 * @property {boolean} [overwrite] default `true`; `false` leaves an existing `llms.txt` alone
 */

/**
 * The options `.feed()` takes. `title` is required — without it, kiss logs an
 * error and writes nothing, exactly as it does for a sitemap with no `siteUrl`.
 *
 * @typedef {Object} FeedOptions
 * @property {string} title the feed's `<title>` — the site's name, or the section's
 * @property {string} [description] the feed's `<description>`
 * @property {string} [section] a top-level `path` segment to include (`'blog'`); omit for every page
 * @property {number} [limit] default `20`; how many items the feed carries, newest first
 * @property {string} [filename] default `feed.xml`, relative to `config.folders.build`
 * @property {string} [dateField] default `'date'`; the page option (or model field) each item's date is read from
 * @property {boolean} [overwrite] default `true`; `false` leaves an existing feed file alone
 */

/**
 * @typedef {Object} WatchOptions
 * @property {string} [entry] the script whose own change triggers a whole-site rebuild; defaults to `process.argv[1]`
 */

/**
 * A site. Everything is driven from one instance: `.page()`/`.pages()`/`.scan()`
 * queue pages, `.generate()` renders them, `.complete()` resolves once the whole
 * build has settled (and rejects if any part of it failed).
 */
class Kiss {
  /** @private */
  _stack = []
  /** @private */
  _promises = []
  /** @private */
  _generating = []
  // Promises returned by generate()/sitemap() callbacks, already given their
  // own catch by _runCallback, so _drain() can await them without rejecting.
  /** @private */
  _callbacks = []
  // How many complete() calls are currently draining. A depth counter rather
  // than a flag: the two calls of the nested pattern can settle in either
  // order, and a saved-and-restored flag left the later one setting it back.
  /** @private */
  _drainDepth = 0
  // Whether the caller has ever asked for a render pass. complete() finishes
  // an unfinished one; it never starts one that was never asked for.
  /** @private */
  _generateRequested = false
  /** @private */
  _registrations = []
  /** @private @type {WeakMap<object, string>} */
  _registrationDirectories = new WeakMap()
  // Registrations scan() created, held by identity rather than by a key on the
  // registration itself: `_registrations` entries are spread into `page()` on
  // replay, so any own key would reach the render context and the dev-mode
  // `.json` sibling.
  /** @private */
  _scanned = new WeakSet()
  /** @private */
  _scanning = false
  /** @private */
  _scanRequested = false
  /** @private */
  _partialNames = []
  /**
   * Which pages rendered which partials, learned from rendering. Read by
   * `_handleChange` to scope a partial edit; cleared by `_replay()`.
   * @type {DependencyGraph} @private
   */
  _graph = new DependencyGraph()
  // Page identity resolved over the *live* `_stack`, memoised: `{ byId,
  // withdrawn }`. Never a snapshot — `_replay()` replaces `_stack` with a new
  // array, and a page registered after another has already rendered changes the
  // answer — so it is invalidated on every `_preparePage` push and reset by
  // `_replay()`. `_idNoticed` keeps a collision notice to one line per id per
  // build, since the index is rebuilt many times as registration proceeds.
  /** @private @type {{ byId: Map<string, any>, withdrawn: Map<string, string[]> }|null} */
  _idIndex = null
  /** @private */
  _idNoticed = new Set()
  // The site's own helpers, imported and registered by kiss. Declared here
  // rather than only assigned in the constructor so `@private` sits in its own
  // JSDoc block: a second comment displaces it and the field lands in the
  // published `types/`, which `test/unit/types.test.js` rejects.
  /** @private @type {Promise<void>} */
  _helpersReady = Promise.resolve()

  /**
   * What the site's own registrar registered on its last load, as
   * `{ name, prior }` pairs, so a reload can undo exactly what that load did
   * — restoring what each registration displaced rather than deleting the
   * name. A kiss built-in the registrar overrode is displaced, not owned, and
   * deleting it silently removed the built-in.
   *
   * @type {import('./site-helpers.js').OwnedHelper[]}
   * @private
   */
  _siteHelpers = []

  /**
   * The helper names kiss itself registered, snapshotted before the site's
   * own registrar can run. Overriding one of these is a legitimate thing for
   * a site to do; re-registering anything else that is already there means
   * the registrar has been run twice.
   *
   * @type {string[]}
   * @private
   */
  _builtinHelperNames = []

  /**
   * Whether the author named `folders.helpers` or kiss defaulted to it. Read
   * from the config as supplied, before `resolveConfig` fills the default in,
   * because by then the two are indistinguishable — and they mean opposite
   * things when the folder turns out not to hold a registrar.
   *
   * @type {boolean}
   * @private
   */
  _helpersExplicit = false
  // The aikb verdict and the redirect findings from the settle that produced
  // them. `_refreshReport()` reuses both: neither an asset re-copy nor a
  // helpers reload can change a map of pages and partials or a set of page
  // aliases, so re-deriving them would be cost with no answer attached.
  /** @private */
  _aikbVerdict = null
  /** @private */
  _finishedAt = null

  /** @private */
  _failures = []
  // The `_failures` entries a whole-site replay must carry rather than drop,
  // marked by their producer at the moment it pushes them. See above.
  /** @private */
  _carriedFailures = new WeakSet()
  // The failure each stack entry's last render recorded, so the next render of
  // that entry can drop it. Keyed on the entry rather than on its `view`,
  // which is the template TEXT for an inline page and is not unique.
  /** @private */
  _pageFailures = new WeakMap()
  // The Sass failures each `.copyAssets()` owns, keyed on its resolved
  // (source, target) pair and holding the very objects it pushed onto
  // `_failures`. A copy clears exactly what it recorded last time before
  // recording this time — see `copyAssets()` for why identity cannot be a
  // prefix of the view string.
  /**
   * @type {Map<string, Set<any>>}
   * @private
   */
  _sassFailures = new Map()
  // Every `.copyAssets()` this instance has been asked for, keyed the same
  // way and holding the arguments as the caller gave them — the UNSTAGED
  // target, so a replay re-applies staging rather than baking in a staging
  // path that has since been promoted.
  /**
   * @type {Map<string, { sourceDir: string, targetDir: string }>}
   * @private
   */
  _assetCopies = new Map()
  /** @private @type {Map<string, {sourceDir: string, targetDir: string}>} */
  _restorableAssets = new Map()
  /** @private @type {{sourceDir: string, targetDir: string, directory: string}} */
  _defaultAssetCopy
  // Whether this build's failures have already been reported by a complete()
  // call. Reset with `_failures`.
  /** @private */
  _failuresReported = false
  /** @private */
  _replaying = false
  // Build-dir paths a replay could not sweep because it threw before it had
  // re-queued the site. The next replay adds them back to its own `previous`.
  /** @private */
  _unswept = []
  // The rebuild queue: one in-flight slot, one pending slot. The pending slot
  // is a set of scoped targets plus a "replay" bit that supersedes them.
  /** @private */
  _rebuildInFlight = null
  /** @private */
  _pendingReplay = false
  /** @private */
  _pendingTargets = new Set()
  /** @private */
  _pendingAssets = new Map()
  /** @private @type {OutputRegistry} */
  _outputs
  /** @private */
  _closing = false
  /** @private */
  _sitemapRequest = null
  /** @private */
  _llmsRequest = null
  // The standing `.feed()` request, recorded like the two above so a watch
  // replay can re-issue it. Deliberately not reset by `_replay()`, for the same
  // reason neither of the other two is: it is the request, not the result.
  /** @private */
  _feedRequest = null
  // The standing `.robots()` request, and its result. Like the feed's, the
  // request survives `_replay()` so a watch rebuild re-issues it; unlike the
  // feed's, the result is an object rather than a path, because `Disallow: /`
  // is a fact the report has to carry and a path cannot say.
  /** @private */
  _robotsRequest = null
  /** @private @type {BuildRobots|null} */
  _robotsResult = null
  /** @private */
  _watcher = null
  /** @private */
  _devServer = null
  // The queue only sequences copies; what a copy resolves to is not part of
  // the chain's contract, so the field is typed on that rather than on
  // whatever `copyAssets` happens to return. `@private` shares the block: a
  // second JSDoc comment would displace it and emit the field into types/.
  /** @private @type {Promise<any>} */
  _assetQueue = Promise.resolve()
  // The site's `config.assets.pipeline`, and what its steps did on the last
  // run. The object owns the watch processes too, so it outlives one build and
  // is torn down in close(). `@private` shares each block, or the field lands
  // in the published types/.
  /** @private @type {ReturnType<typeof createPipeline>|null} */
  _pipeline = null
  /** @private @type {import('./pipeline.js').PipelineResult[]} */
  _pipelineResults = []
  // Under `cleanBuild: 'atomic'`: the staging sibling every write goes to
  // until complete() promotes it, the real build folder it is promoted into,
  // and whether this build has already promoted or discarded it. `_stagingDir`
  // is cleared only by a promotion, so close() can still remove a discarded
  // one that a later write recreated.
  /** @private */
  _stagingDir = null

  // The folder this build WRITES into: the staging sibling while one is
  // active, the author's folder otherwise. `config.folders.build` is never
  // repointed at staging — it used to be, which routed every write in one
  // move and also handed the staging path to everything that reads config:
  // a site's `complete()` callback under check (a check never promotes, so
  // nothing pointed it back — measured on student-handbooks, whose callback
  // printed `./handbooks/test.kiss-staging-…`), a template rendering
  // `{{config.folders.build}}` under `'atomic'`, the `KISS_BUILD` a pipeline
  // step sees. The write root is the engine's; config stays the author's.
  /** @private */
  get _writeRoot() {
    return writeRoot(this)
  }

  // `config` as a writer module (sitemap, llms, feed, redirects, robots)
  // should see it: `folders.build` is the write root. The same object as
  // `config` when nothing is staged, so the ordinary build allocates nothing.
  /** @private */
  get _writeConfig() {
    return writeConfig(this)
  }
  /** @private */
  _oldDir = null
  /** @private */
  _buildTarget = null
  /** @private */
  _buildSettled = false
  // The build report's `duration` is measured from construction, not from the
  // first page: a model that takes ten seconds to fetch is part of the build.
  /** @private */
  _startedAt = Date.now()
  // The last settled build's report — assembled once per build, reset with
  // `_failures` on a watch replay, and handed out by `report()`.
  /** @private */
  _report = null
  // Where this build wrote sitemap.xml, if it wrote one.
  /** @private */
  _sitemapPath = null
  // Where this build wrote llms.txt, if it wrote one.
  /** @private */
  _llmsPath = null
  // The last three report keys, and the one path behind `redirects.file`. Each
  // is filled by a module of its own — `lib/links.js`, `lib/redirects.js`,
  // `lib/feed.js` — and is `null` until that module has run, which is not the
  // same as "it ran and found nothing". `_feedPath` and `_redirectsPath` are
  // the files as written, so they carry a staging prefix under `'atomic'` and
  // under check and are mapped into the report exactly like `_sitemapPath` and
  // `_llmsPath` are. `@private` shares each block, or an annotated field lands
  // in the published types/.
  /** @private */
  _feedPath = null
  /** @private @type {BuildLinks|null} */
  _links = null
  // The launch-readiness audit's result, latched and reset exactly as `_links`
  // is and for the same reasons; `null` when none ran (dev, `audit.check:
  // false`, a failed build), which is not "it ran and found nothing".
  /** @private @type {import('./build-report.js').BuildAudit|null} */
  _audit = null
  // Whether `viewStats()` has put `debug.json` — every page's options and
  // models — into this build. State rather than disk, because that write is
  // not awaited and an audit that looked for the file would race it.
  /** @private */
  _debugWritten = false
  // Whether this instance owns its build folder — the author's `cleanBuild`,
  // read before check mode replaces it with `'atomic'`. Under `cleanBuild:
  // false` the folder is shared, so the audit's three folder-walk checks skip.
  /** @private */
  _ownsFolder = true
  /** @private */
  _redirectsPath = null
  // The IR beside it, and the two facts a reader of the report needs to know
  // what was actually emitted: which format ran, and every file it wrote.
  // `format` is `'custom'` for a writer function — naming the function would
  // put a source-code detail in a machine-readable report.
  /** @private */
  _redirectsJsonPath = null
  /** @private @type {string[]} */
  _redirectsFormats = []
  /** @private @type {string[]} */
  _redirectsFiles = []
  /** @private @type {BuildRedirects|null} */
  _redirectsResult = null
  // The one `_redirects` write of this build, held as its promise so the two
  // complete() calls of the nested pattern cannot write the file twice — the
  // second of them would be writing into a staging folder the first has
  // already discarded, recreating it. `_links` and `_report` latch for the
  // same reason.
  /** @private */
  _redirectsRun = null
  // The staging folder a promotion has already swept away. `_stagingDir` is
  // cleared by `_promote()`, but the dependency graph's page keys were recorded
  // while the pages were still being written into staging, so `_finishBuild`
  // needs the old prefix to map them back. Not used by the report, whose paths
  // are already real by then.
  /** @private */
  _promotedFrom = null
  // Whether KISS_CHECK asked for a dry run: build into staging, report, and
  // discard — the real build folder is neither emptied nor written.
  /** @private */
  _checkMode = false

  /**
   * Resolves the config, sets up this instance's Handlebars environment,
   * Markdown renderer and asset manifest, creates the folders, queues the
   * asset copy, registers helpers and partials — and, in `dev` mode, starts the
   * dev server and the file watcher.
   *
   * @param {KissConfigInput} [config]
   * @throws if the config is invalid — see `resolveConfig`
   */
  constructor(config) {
    this._helpersExplicit = config?.folders?.helpers !== undefined
    /** @type {KissConfig} */
    this.config = resolveConfig(config)
    this._defaultAssetCopy = {
      directory: process.cwd(),
      sourceDir:
        this.config.folders.assets && path.resolve(this.config.folders.assets),
      targetDir: path.resolve(this.config.folders.build),
    }
    this.logger =
      this.config.logger || createLogger({ verbose: this.config.verbose })
    this.verbose = !!this.config.verbose
    this._outputs = new OutputRegistry(this.logger)

    // Each Kiss owns its own Handlebars environment and Markdown renderer, so
    // partials and helpers never leak between instances.
    /**
     * This instance's own Handlebars environment — register your own helpers
     * on it. Helpers registered on the `handlebars` module itself are not seen.
     * @type {typeof Handlebars}
     */
    this.handlebars = Handlebars.create()
    this.handlebars.registerHelper(layouts(this.handlebars))
    // What each asset copy emitted, read back by the `asset` helper. Per
    // instance for the same reason the Handlebars environment is: two sites in
    // one process must never link each other's files.
    /** @private */
    this._assetManifest = createAssetManifest()
    /**
     * This instance's own Markdown renderer, behind `.md` partials and the
     * `markdown` helper. Typed `any` because `remarkable` ships no types.
     * @type {any}
     */
    // `config.markdown` is resolved over `DEFAULT_MARKDOWN` and handed straight
    // to Remarkable, so a site sets the options it wants and kiss stays out of
    // the way. Built here, before `registerPartials()` below: `.md` partials are
    // rendered to HTML *at registration*, so a block applied any later would
    // reach the `{{markdown}}` helper but silently miss every partial.
    this.remarkable = new Remarkable({ ...this.config.markdown })

    // Read once, applied over the resolved config before a single folder is
    // created: staging is what keeps the real build folder untouched, and
    // `dev` cannot survive it — a check has to exit, and a dev server degrades
    // `'atomic'` back to a wipe in place.
    this._checkMode = checkModeRequested()
    // Captured before check mode rewrites `cleanBuild`: whether this instance
    // owns its build folder is the author's statement, and `check` has to
    // audit it the way the real build will, not the way the staging does.
    this._ownsFolder = this.config.cleanBuild !== false
    if (this._checkMode) {
      this.config.cleanBuild = 'atomic'
      this.config.dev = false
    }

    // Every non-dev page is minified, so the minifier's ~155ms import is a
    // fixed cost of the build; started here, unawaited, it overlaps everything
    // between now and the first render instead of sitting on the critical
    // path at that render. Dev never minifies, so dev never loads it.
    if (!this.config.dev) preloadMinifier()

    this.logger.banner('            Starting Kiss            \n')
    this.logger.debug('config: ', this.config)

    this._setupFolders()
    if (this._checkMode)
      this.logger.notice(
        `KISS_CHECK: checking the build — ${this._buildTarget} is not written to, and the staged build is discarded when complete() settles`,
      )

    // The pipeline is created before the first copy is queued and torn down in
    // close(): its `run` steps are what produce the files that copy is about
    // to pick up, and in dev mode it owns the watch processes for the session.
    this._pipeline = createPipeline({
      steps: this.config.assets.pipeline,
      logger: this.logger,
      dev: !!this.config.dev,
    })
    this._queuePipeline()
    this.copyAssets(this.config.folders.assets, this.config.folders.build)
    registerHandlebarsHelpers(this.handlebars, this.config, {
      markdown: this.remarkable,
      logger: this.logger,
      assets: this._assetManifest,
      // A bound function, not the stack and not an index built here: helpers
      // are registered once, in this constructor, and are never re-registered —
      // not even by `_replay()`, which replaces `_stack` outright. Anything
      // captured here would serve the first build's registry for the life of
      // the session.
      lookupPage: (id) => this._lookupPage(id),
    })
    // Captured after the built-ins are registered and before anything the
    // site owns can be: it is what lets `_loadHelpers` tell a deliberate
    // override of a kiss helper from a registrar the build script has already
    // run by hand.
    this._builtinHelperNames = Object.keys(this.handlebars.helpers)
    this.registerPartials()

    // The site's own helpers, imported and registered by kiss rather than by
    // a `registerHelpers(kiss)` line in the build script. Started here and
    // awaited by `generate()` rather than awaited here, because the
    // constructor is synchronous — safe because Handlebars resolves a helper
    // from the registry at render time, so anything registered before the
    // first render counts. A failure is recorded like any other build
    // failure rather than thrown through `new Kiss()`.
    this._helpersReady = this._loadHelpers()

    if (this.config.dev) {
      // Unlike live reload, which is optional, there is nothing useful to do
      // without the HTTP server: the old non-fatal path left the process up,
      // serving nothing, behind a "Serving" line that had already been printed.
      const devServerFailed = async (error) => {
        this.logger.error(error.message)
        this.logger.debug(error.stack)
        this._failures.push(
          this._carry({ view: '<dev server>', buildTo: null, error }),
        )
        // The watcher and the livereload server would otherwise hold the
        // process open long after the consumer has handled the rejection.
        await this.close().catch((err) => this.logger.debug(err.stack))
      }
      try {
        this._devServer = startDevServer(
          path.resolve(this.config.folders.build),
          this.config.port,
          {
            logger: this.logger,
            livereloadPort: this.config.livereloadPort,
            host: this.config.devHost,
          },
        )
        // Tracked as build work so complete() cannot resolve before the bind
        // has settled — a small site otherwise races the 'error' event.
        this._generating.push(this._devServer.ready.catch(devServerFailed))
        this.watch()
        // Nothing watches the build folder any more, so a browser left open
        // across a restart is told once, when this first build has settled.
        this._settle(false)
          .then(() => this._reload())
          .catch((err) => this.logger.debug(err.stack))
      } catch (error) {
        this._generating.push(devServerFailed(error))
      }
    }

    this.logger.info('Generating:')
  }

  /** @private */
  _setupFolders() {
    if (this.config.cleanBuild === 'atomic') {
      if (this.config.dev) {
        this.logger.notice(
          "cleanBuild: 'atomic' promotes a staging folder when complete() resolves, which only applies to one-shot builds — dev mode builds in place, as cleanBuild: true",
        )
      } else {
        this._buildTarget = this.config.folders.build
        this._sweepStaleSiblings()
        const { stagingDir, oldDir } = stagingSiblings(this._buildTarget)
        // `_stagingDir` is what routes *every* write — pages,
        // their debug siblings, the asset copy, sitemap.xml, viewStats' dump
        // — into staging in one move, since each of them reads it (directly,
        // or through the buildDir a page is prepared with) — through `_writeRoot`,
        // never by repointing `config.folders.build`, which stays the folder the
        // author named so that nothing reading config (a complete() callback
        // under check, a template, a pipeline step's KISS_BUILD) sees this path.
        this._stagingDir = stagingDir
        this._oldDir = oldDir
      }
    }

    foldersToEnsure({ ...this.config.folders, build: this._writeRoot }).forEach(
      (f) => fs.ensureDirSync(f),
    )

    if (this.config.cleanBuild) {
      try {
        fs.emptyDirSync(this._writeRoot)
      } catch (err) {
        this.logger.error(err.message)
      }
    }
    fs.ensureDirSync(this._writeRoot)
  }

  // The names the last pass registered, so the next one can unregister whatever
  // has since left disk — Handlebars keeps a registration forever otherwise.
  /**
   * Re-registers every partial and layout from disk, unregistering any name
   * whose file has since gone. Runs at construction and on every watch rebuild.
   *
   * @returns {string[]} the names now registered
   */
  registerPartials() {
    this._partialNames = registerPartials(
      this.handlebars,
      this.config,
      { markdown: this.remarkable, logger: this.logger, graph: this._graph },
      this._partialNames,
    )
    return this._partialNames
  }

  /**
   * Imports `config.folders.helpers`' entry and registers what it exports.
   * A folder that is not there is the ordinary case and says nothing; a
   * folder that fails to load is a build failure, recorded as
   * `<site helpers>` so `complete()` rejects rather than shipping a site
   * whose templates silently lost their helpers.
   *
   * @param {boolean} [fresh] bust the module caches (a watch reload)
   * @returns {Promise<void>}
   * @private
   */
  async _loadHelpers(fresh = false) {
    // `_failures` is cleared by `_replay()` and by nothing else, and a helpers
    // reload is a scoped rebuild rather than a replay — so a broken save used
    // to leave a `<site helpers>` entry in `report()` for the rest of the
    // session, long after the file was fixed. This load's outcome replaces the
    // last one's: a stale failure is worse than none, because `failures` is
    // the one thing a consumer reads to decide whether the build is good.
    this._failures = this._failures.filter((f) => f.view !== '<site helpers>')
    const { entry, error, registered } = await loadSiteHelpers(
      this.config.folders.helpers,
      {
        kiss: this,
        logger: this.logger,
        fresh,
        previous: this._siteHelpers,
        required: this._helpersExplicit,
        builtins: this._builtinHelperNames,
      },
    )
    // The entry was deleted: the site has no helpers any more, so neither does
    // the running build. Leaving them registered would render pages against a
    // registrar that no longer exists on disk — the same dishonesty as keeping
    // a helper the edited entry dropped.
    //
    // What that produces is worth stating exactly, because "the pages fail
    // loudly" was measured and is only half true. `{{shout "hi"}}` throws
    // `Missing helper: "shout"`, which `KissPage.generate()` logs before
    // rethrowing — loud. `{{copyright}}`, with no arguments, is a missing
    // *property* to Handlebars, not a missing helper: it renders empty and
    // says nothing. And either way `_rebuild` catches the rejection per page,
    // so the previously written file stays on disk: the console is loud, the
    // served bytes are stale.
    if (!entry && this._siteHelpers.length) {
      for (const { name, prior } of this._siteHelpers) {
        if (prior === undefined) this.handlebars.unregisterHelper(name)
        else this.handlebars.registerHelper(name, prior)
      }
      this.logger.notice(
        `The helpers entry is gone: dropped ${this._siteHelpers.map((h) => h.name).join(', ')}`,
      )
      this._siteHelpers = []
    }
    if (registered) this._siteHelpers = registered
    if (error)
      this._failures.push(
        this._carry({
          view: '<site helpers>',
          buildTo: entry,
          error,
        }),
      )
    // Same reason as the asset copy: a helpers reload is a scoped rebuild, so
    // it changes the failure list without settling a build.
    this._refreshReport()
  }

  // What a step's command inherits on top of `process.env`: where this build
  // writes, where its assets are read from, and whether a dev server is up —
  // enough for a tool to aim its own output at the right folder without the
  // site having to repeat the paths in the command. Read per run rather than
  // captured once: a staged build's write root becomes the real folder the
  // moment complete() promotes it. KISS_BUILD names the STAGING folder while
  // one is active, on purpose — a tool's output has to land in the build
  // being staged, or the swap would leave it behind.
  /** @private */
  _pipelineEnv() {
    return {
      KISS_BUILD: this._writeRoot ?? '',
      KISS_ASSETS: this.config.folders.assets ?? '',
      KISS_DEV: this.config.dev ? '1' : '0',
    }
  }

  // The steps run before the asset copy because they write the files it
  // copies, and they are chained onto `_assetQueue` — the one thing that
  // already orders every copy — so "before" needs no second mechanism.
  //
  // Deliberately *not* on `_promises`: those entries are the `data` array
  // generate()/complete() hand back, whose first entry is documented as the
  // construction-time asset copy. `_generating` is drained by _settle() just
  // the same, and the copy that follows on the queue cannot start until the
  // steps have finished either way.
  /** @private */
  _queuePipeline() {
    if (!this._pipeline || this.config.assets.pipeline.length === 0) return
    const run = this._assetQueue
      .then(async () => {
        const results = await this._pipeline.run(this._pipelineEnv())
        this._pipelineResults = results
        // A failed step is a build failure like a failed page: complete()
        // rejects and the report names it. The copy and the pages still run,
        // so one broken tool does not hide everything else that is wrong.
        for (const result of results) {
          if (result.ok) continue
          this._failures.push({
            view: `<pipeline: ${result.name}>`,
            buildTo: null,
            error: result.error,
          })
        }
      })
      // `run()` never rejects, but `_assetQueue` must stay a promise nothing
      // can leave unhandled: every copy chains onto it, and one rejection here
      // would reject each of them in turn.
      .catch((error) => {
        this.logger.error(error.message)
        this._failures.push({ view: '<pipeline>', buildTo: null, error })
      })
    this._assetQueue = run
    this._generating.push(run)
  }

  // Copies run one after another in registration order: a later copy may
  // write into a directory an earlier one is still walking (student-handbooks
  // copies into its own assets folder), which races fs.copy otherwise.
  /**
   * Compiles every `*.scss`/`*.sass` under `sourceDir` to a sibling `.css` and
   * copies everything else straight through. Runs once at construction for
   * `folders.assets` → `folders.build`; call it again for extra asset
   * directories. Calls run one after another, in registration order.
   *
   * @param {string} sourceDir
   * @param {string} targetDir
   * @returns {this}
   */
  copyAssets(sourceDir, targetDir) {
    this._copyAssets(sourceDir, targetDir)
    return this
  }

  // The queued copy and what it owns: `lib/asset-copy.js` (AIKB/asset-copy.md).
  /** @private */
  _copyAssets(sourceDir, targetDir, watch) {
    return copyAssetFolder(this, sourceDir, targetDir, watch)
  }

  /**
   * Records a page's render failure, and remembers which stack entry owns it.
   *
   * The ownership is the point. A page failure is the one kind that a later
   * event can prove wrong — the author fixes the view and it re-renders — so
   * something has to be able to find and drop it, and that something must not
   * be a string match on `view`: an inline template's `view` IS the template
   * text, and two pages can share one. The entry itself is the identity, held
   * in a `WeakMap` so a replay discarding the stack discards these with it.
   *
   * @param {any} entry
   * @param {Error} error
   * @private
   */
  _recordPageFailure(entry, error) {
    const failure = { view: entry.view, buildTo: entry.buildTo, error }
    this._pageFailures.set(entry, failure)
    this._failures.push(failure)
  }

  /**
   * Drops the failure a previous render of this entry recorded, if any —
   * called by whatever is about to re-render it.
   *
   * @param {any} entry
   * @private
   */
  _clearPageFailure(entry) {
    const prior = this._pageFailures.get(entry)
    if (!prior) return
    this._failures = this._failures.filter((failure) => failure !== prior)
    this._pageFailures.delete(entry)
  }

  /**
   * Marks a failure as one a whole-site replay carries rather than drops,
   * and returns it so the caller can push it in one expression.
   *
   * The bar is that the failure must still be TRUE after a replay — which is
   * satisfied either by a producer that re-checks it (`copyAssets`,
   * `_loadHelpers`) or by one whose failure is terminal and can never stop
   * being true (`<dev server>`: startup is constructor-only and nothing
   * retries it). An earlier version of this block said only the first half,
   * which made the one deliberate terminal case read as a mistake.
   *
   * @template {{ view: string }} T
   * @param {T} failure
   * @returns {T}
   * @private
   */
  _carry(failure) {
    this._carriedFailures.add(failure)
    return failure
  }

  // The staging folder of a `cleanBuild: 'atomic'` build: `lib/staging.js`
  // (AIKB/staging.md). Each method is the module function of the same name
  // over this instance; the documentation lives there.
  /** @private */
  _sweepStaleSiblings() {
    sweepStaleSiblings(this)
  }
  /** @private */
  _stagedPath(target) {
    return stagedPath(this, target)
  }
  /** @private */
  _reportedPath(target) {
    return toReportedPath(this, target)
  }
  /** @private */
  _renameForPromote(from, to, folder) {
    return renameForPromote(from, to, folder)
  }
  /** @private */
  _restorePrevious(old, target) {
    return restorePrevious(this, old, target)
  }
  /** @private */
  _promote() {
    return promote(this)
  }
  /** @private */
  _swapIn(staging, target) {
    return swapIn(this, staging, target)
  }
  /** @private */
  _discardStaging() {
    return discardStaging(this)
  }
  /** @private */
  _abandonStaging(staging) {
    return abandonStaging(this, staging)
  }
  /** @private */
  _removeStaging(staging, which) {
    return removeStaging(this, staging, which)
  }

  // What a settled build says about itself — the report, the link scan, the
  // audit, the redirect files and findings, the knowledge-base record:
  // `lib/build-finish.js` (AIKB/build-finish.md). Each method is the module
  // function over this instance; the documentation lives there.
  /** @private */
  _finishBuild() {
    return finishBuild(this)
  }
  /** @private */
  _reportInputs() {
    return reportInputs(this)
  }
  /** @private */
  _refreshReport() {
    return refreshReport(this)
  }
  /** @private */
  _buildAikb() {
    return buildAikb(this)
  }
  /** @private */
  _checkLinks(options) {
    return runLinkCheck(this, options)
  }
  /** @private */
  _runAudit(options) {
    return runAudit(this, options)
  }
  /** @private */
  _writeRedirects() {
    return writeAliasRedirects(this)
  }
  /** @private */
  _lastBuildRecord() {
    return lastBuildRecord(this)
  }
  /** @private */
  _redirectFindings() {
    return findRedirectChanges(this)
  }

  // Pages from registration to the stack, and their identity:
  // `lib/page-registry.js` (AIKB/page-registry.md). Each method is the module
  // function over this instance; the documentation lives there.
  /** @private */
  _preparePage(options, origin, idPrefix, directory) {
    return preparePage(this, options, origin, idPrefix, directory)
  }
  /** @private */
  _idIndexFor() {
    return idIndexFor(this)
  }
  /** @private */
  _lookupPage(id) {
    return lookupPage(this, id)
  }
  /** @private */
  _stackForRecord() {
    return stackForRecord(this)
  }
  /** @private */
  _prepareMultiplePages(options, data, fresh, origin, directory) {
    return prepareMultiplePages(this, options, data, fresh, origin, directory)
  }
  /**
   * @private
   * @param {PageOptions} options
   * @param {string} directory
   * @returns {this}
   */
  _page(options, directory) {
    registerPage(this, options, directory)
    return this
  }

  /**
   * Queues one page. Nothing is rendered until `.generate()`.
   *
   * @param {PageOptions} options `options.view` is required
   * @returns {this}
   */
  page(options) {
    return this._page(options, process.cwd())
  }

  /**
   * Queues one page per item of an array model, appending `-N` to the slug
   * unless the controller sets one. A bad item fails only its own page.
   *
   * @param {PagesOptions} options
   * @returns {this}
   */
  pages(options) {
    options.dynamic = true
    this.page(options)
    return this
  }

  /**
   * Queues every `.hbs` under `config.folders.pages` not already registered by
   * `view`, with default options. Repeated on every whole-site watch rebuild,
   * so page files added or deleted mid-session are picked up.
   *
   * @returns {this}
   */
  scan() {
    scanPages(this)
    return this
  }

  /**
   * Logs the queued-promise and prepared-page counts, and — with
   * `verbose: true` — writes `debug.json` into the build folder.
   *
   * @returns {this}
   */
  viewStats() {
    logViewStats(this)
    return this
  }

  // Waits until every queued promise (page chains, assets, generate/sitemap
  // runs, and the promises callbacks themselves returned) has settled,
  // re-checking because callbacks can queue more work. `skipCallbacks` drops
  // the callback list for a complete() called from inside a callback, which
  // would otherwise wait on the very callback it is running in.
  /** @private */
  async _drain(skipCallbacks = false) {
    const queued = () =>
      skipCallbacks
        ? [this._assetQueue, ...this._promises, ...this._generating]
        : [
            this._assetQueue,
            ...this._promises,
            ...this._generating,
            ...this._callbacks,
          ]
    let seen = -1
    let assetQueue
    while (seen !== queued().length || assetQueue !== this._assetQueue) {
      const waiting = queued()
      assetQueue = this._assetQueue
      seen = waiting.length
      await Promise.all(waiting)
    }
  }

  // Renders every stack entry no generate() pass has reached — a page queued
  // after the last one iterated the stack, which would otherwise be silently
  // dropped from a build that reports success. `runCount` is incremented as
  // the entry is picked, so a concurrent pass cannot render it twice. Tracked
  // on `_generating` like a generate() run; returns null when there is
  // nothing pending.
  /** @private */
  _generatePending() {
    const pending = []
    this._stack.forEach((entry) => {
      if (entry.runCount > 0) return
      entry.runCount++
      pending.push(
        entry.page.generate().catch((error) => {
          this._recordPageFailure(entry, error)
        }),
      )
    })
    if (pending.length === 0) return null
    const run = Promise.all(pending)
    this._generating.push(run)
    return run
  }

  // Drains, renders whatever the drain left unrendered, and repeats until the
  // stack is stable — rendering can only follow work that has settled, and
  // settled work can queue more pages.
  /** @private */
  async _settle(skipCallbacks) {
    for (;;) {
      await this._drain(skipCallbacks)
      const run = this._generateRequested ? this._generatePending() : null
      if (!run) return
      await run
    }
  }

  // A generate()/sitemap() callback is the consumer's code: its failure is a
  // build failure of its own, recorded here rather than left to the enclosing
  // catch, which would mislabel it as "Error generating site". A promise the
  // callback returns is never awaited here — that is what keeps the run this
  // callback belongs to from waiting on a complete() called inside it — but it
  // is recorded on `_callbacks`, with its own catch, so complete()'s drain
  // waits for pages the callback queues after an await.
  /** @private */
  _runCallback(label, callback, arg) {
    const record = (error) => {
      this.logger.error(`Error in ${label} callback`)
      this.logger.error(error)
      this._failures.push({ view: `<${label} callback>`, buildTo: null, error })
      // A callback can run after an earlier build has already settled, and
      // then its failure lands on `_failures` with nothing to re-derive the
      // verdict — `complete()` rejecting while `report().ok` stayed true.
      this._refreshReport()
    }
    try {
      const result = callback.call(this, arg)
      if (result && typeof result.then === 'function')
        this._callbacks.push(Promise.resolve(result).catch(record))
    } catch (error) {
      record(error)
    }
  }

  /**
   * Renders and writes every queued page exactly once, then fires `callback`.
   * Page failures do not surface here — they surface from `.complete()`.
   *
   * @param {(data: BuildData) => void|Promise<void>} [callback] fires once every
   * page has been attempted; a throw (or a rejection) in it is a build failure
   * of its own, reported by `.complete()` as `<generate callback>`
   * @returns {this}
   */
  generate(callback) {
    this._generateRequested = true
    // Helper readiness and the current asset slot are awaited but discarded: `data` is the
    // documented array whose entry 0 is the construction-time asset copy, and
    // renumbering it would break every site using `getModelByID`.
    const run = Promise.all([
      this._helpersReady,
      this._assetQueue,
      ...this._promises,
    ])
      .then(async ([, , ...data]) => {
        const pending = []
        this._stack.forEach((entry) => {
          // One page failing must not stop the others: each attempt is caught
          // here and recorded, and `complete()` reports the collected set.
          if (entry.runCount === 0)
            pending.push(
              entry.page.generate().catch((error) => {
                this._recordPageFailure(entry, error)
              }),
            )
          entry.runCount++
        })
        await Promise.all(pending)
        if (callback) this._runCallback('generate', callback, data)
      })
      .catch((err) => {
        this.logger.error('Error generating site')
        this.logger.error(err)
      })
    this._generating.push(run)
    return this
  }

  /**
   * Awaits the whole build — every queued page, anything a callback queued, any
   * `.sitemap()` — rendering whatever no `.generate()` pass reached. Under
   * `cleanBuild: 'atomic'` this is the moment the staged build is promoted.
   *
   * @param {(data: BuildData) => void} [callback] never fired for a failed build
   * @returns {Promise<BuildData>} one entry per queued model, in registration order
   * @throws {BuildError} rejects — once per build — if any page, controller or
   * callback failed; `err.failures` is the whole list
   */
  complete(callback) {
    // Read synchronously, before anything awaits: a complete() started from
    // inside a callback while another one is draining must not wait on the
    // callback list — its own entry is in it, and waiting on it would deadlock.
    const nested = this._drainDepth > 0
    this._drainDepth++
    return this._settle(nested)
      .then(async () => {
        // Page, controller and callback failures are collected as they happen
        // rather than thrown where they occur, so the whole site still builds;
        // they surface here as an AggregateError. Once per build: a second
        // complete() in the same build resolves instead, because the documented
        // "complete() inside a generate callback" pattern has two calls racing
        // one failure and the loser's rejection has nothing attached to it.
        // The callback fires for neither call — a failed build never runs it.
        // Read `_failures`, not the report-once latch: a second complete()
        // after a failed build resolves, and must still never promote.
        //
        // The link scan goes first, above the branch rather than inside each of
        // its three arms: every one of them either discards the staging folder
        // or promotes it, and the scan needs the written pages where they were
        // written. One call site dominating all three is also what keeps a
        // fourth branch from quietly forgetting it.
        //
        // `_redirects` goes first, for the same reason and one more: it is a
        // file this build publishes, so it has to be inside the staging folder
        // before the swap — written after it, the site would be live for a
        // moment with none of its redirects. It is also on disk before the
        // scan, so a page that links to it resolves.
        await this._writeRedirects()
        this._checkLinks({ quiet: Boolean(this._rebuildInFlight) })
        // Directly after the scan, for the scan's reason: above the three-way
        // branch, while the written pages are still where they were written.
        this._runAudit({ quiet: Boolean(this._rebuildInFlight) })
        if (this._failures.length > 0) {
          await this._discardStaging()
          await this._finishBuild()
          if (!this._failuresReported) {
            this._failuresReported = true
            const failures = this._failures
            const err = new AggregateError(
              failures.map((f) => f.error),
              // "page(s)" was a lie for every pseudo-view on `_failures` —
              // `<site helpers>`, `<pipeline>`, `<redirects>`, `<dev server>`
              // — and a helpers module reported as a failing PAGE sends the
              // author to look at their pages. A pseudo-view names itself
              // here even when it has a `buildTo`, because the label is the
              // useful half and the path is already in the logged error.
              `${failures.length} build failure${failures.length === 1 ? '' : 's'}: ${failures
                .map((f) =>
                  f.view?.startsWith('<')
                    ? f.view
                    : (this._reportedPath(f.buildTo) ?? f.view),
                )
                .join(', ')}`,
            )
            // `failures` and `report` are kiss's own additions to the error —
            // documented on the rejection, absent from the built-in type.
            const annotated = /** @type {any} */ (err)
            annotated.failures = failures
            annotated.report = this._report
            throw err
          }
        } else if (this._checkMode) {
          // A check builds exactly as an atomic build does and then throws the
          // staging folder away: the answer is the report, not the output.
          await this._discardStaging()
          await this._finishBuild()
          // Said in terms of the BUILD folder, and naming the knowledge base
          // when one was recorded: under `kiss-ssg aikb` this line used to say
          // "nothing was written" straight after AIKB/ had been, and a
          // clean-room run read it as the recording having failed.
          const aikb = this._report?.aikb
          this.logger.notice(
            aikb?.written
              ? `Recorded the knowledge base in ${aikb.folder}. The build itself was checked and thrown away: nothing was written to ${this._buildTarget}`
              : `Checked ${this._buildTarget}: the build succeeded and nothing was written to it`,
          )
        } else {
          await this._promote()
          await this._finishBuild()
        }
        const data = await Promise.all(this._promises)
        if (callback && this._failures.length === 0) callback.call(this, data)
        return data
      })
      .finally(() => {
        this._drainDepth--
      })
  }

  /**
   * The last **settled** build, as data: what `.complete()` resolved or
   * rejected with, in a JSON-safe shape a script can act on. `null` until the
   * first `.complete()` has settled. The same object is on the rejection as
   * `err.report`.
   *
   * A whole-site replay replaces it with its own. Anything else that puts a
   * failure on the list without settling a build — a watch asset re-copy, a
   * helpers reload, a callback that runs after an earlier settle — refreshes
   * it in place (`_refreshReport()`), so the verdict never trails the
   * failures: a stylesheet broken by a save is on `failures` and `ok` is
   * `false` as soon as the copy that found it finishes.
   *
   * That now includes a scoped page re-render, which used to catch each
   * page's rejection and record nothing — the one path that put nothing on
   * the list at all, so a page that started failing under `.watch()` was loud
   * in the console and absent from both. It records them like any other
   * failure, and drops a page's previous failure before re-rendering it, so a
   * page the author fixes goes green rather than staying red for the session.
   * The cost is accepted deliberately: a transient mid-edit render error does
   * move `ok` to `false` until the next save.
   *
   * What a refresh does not move is the metadata of the build it describes:
   * `duration` and `startedAt` still name the settle that produced it. It is
   * the last settled build with a current verdict, not a new build.
   *
   * @returns {BuildReport|null}
   */
  report() {
    return this._report
  }

  /**
   * Writes `sitemap.xml` into the build folder, one `<url>` per registered page.
   * Requires `config.siteUrl` — without it this logs an error and skips.
   *
   * @param {SitemapOptions|null} [options]
   * @param {(urls: SitemapUrl[]) => void|Promise<void>} [callback] not fired
   * when the sitemap was skipped for want of a `siteUrl`
   * @returns {this}
   */
  sitemap(options, callback) {
    // Remembered so a watch rebuild can re-run it against the new stack;
    // idempotent, since the replay's own call re-records the same request.
    this._sitemapRequest = { options, callback }
    const overwrite = !options || options.overwrite !== false
    const run = Promise.all(this._promises)
      .then(async () => {
        const { status, urls } = await writeSitemap(this._stack, {
          config: this._writeConfig,
          logger: this.logger,
          outputs: this._outputs,
          overwrite,
        })
        if (status === 'no-site-url') return
        // Where the file went, for the build report. A staged build records the
        // staging path and the report maps it back to the real folder, like
        // every other path in it.
        this._sitemapPath = `${this._writeRoot}/sitemap.xml`
        if (callback) this._runCallback('sitemap', callback, urls)
      })
      .catch((err) => {
        this.logger.error('Error creating sitemap.xml')
        this.logger.warn(err)
      })
    this._generating.push(run)
    return this
  }

  /**
   * Writes `llms.txt` into the build folder — the llmstxt.org index an answer
   * engine reads first — from the same registry, titles and URLs the sitemap is
   * built from, so the two can never disagree. Requires `config.siteUrl`, and
   * `options.title`/`options.summary`; without any of them this logs an error
   * and skips. Like `.sitemap()`, it can be called before or after
   * `.generate()`, and it is re-run by a whole-site watch rebuild.
   *
   * @param {LlmsOptions} options
   * @param {(text: string) => void|Promise<void>} [callback] receives the
   * rendered file; not fired when llms.txt was skipped for want of an option
   * @returns {this}
   */
  llms(options, callback) {
    // Remembered so a watch rebuild can re-run it against the new stack, the
    // same way `_sitemapRequest` is — the replay's own call re-records it.
    this._llmsRequest = { options, callback }
    const overwrite = !options || options.overwrite !== false
    const run = Promise.all(this._promises)
      .then(async () => {
        const { status, text } = await writeLlms(this._stack, {
          config: this._writeConfig,
          logger: this.logger,
          outputs: this._outputs,
          options: options || {},
          overwrite,
        })
        // A missing siteUrl, title or summary wrote nothing and there is
        // nothing to hand a callback; a skip left an existing file in place,
        // which is still the build's llms.txt.
        if (status !== 'written' && status !== 'skipped') return
        // A staged build records the staging path and the report maps it back
        // to the real folder, like every other path in it.
        this._llmsPath = `${this._writeRoot}/llms.txt`
        if (callback) this._runCallback('llms', callback, text)
      })
      .catch((err) => {
        this.logger.error('Error creating llms.txt')
        this.logger.warn(err)
      })
    this._generating.push(run)
    return this
  }

  /**
   * Writes `robots.txt` into the build folder. The `Sitemap:` line is the
   * point: it is built by the same `toAbsoluteUrl` join as every `<loc>`, so
   * the sitemap a crawler is pointed at is character-for-character the one
   * `.sitemap()` wrote — and it is emitted **only** when this build actually
   * writes a sitemap, because advertising one that does not exist is a fetch
   * error in every crawler that reads the line.
   *
   * Called with no options it writes the file the hand-written ones usually
   * say — one `*` block allowing everything — plus that line. Unlike
   * `_redirects` there is a method to call, because a crawl policy is a
   * statement about the whole site rather than a property of a page: nothing
   * in the stack could imply it. A `robots.txt` a site keeps in `src/assets/`
   * is therefore untouched unless it asks for this, and `overwrite: false`
   * leaves the copied file alone even then.
   *
   * **`Disallow: '/'` removes the site from search.** It is logged as a
   * `notice` on every build that emits it and carried on `report().robots`,
   * so a staging policy promoted to production is visible in a `kiss-ssg
   * check` diff rather than in Search Console a month later. It is never
   * inferred: `ignoreSitemap` deliberately does **not** imply a `Disallow`,
   * because blocking a crawler stops it fetching the page and so stops it
   * seeing a `noindex`, which leaves the URL indexed with no snippet.
   *
   * Like `.sitemap()`, `.llms()` and `.feed()` it can be called before or
   * after `.generate()`, in any order relative to `.sitemap()`, and it is
   * re-run by a whole-site watch rebuild. A write failure is logged, not
   * fatal — this is discovery, like the sitemap, not the redirects case where
   * a missing file 404s traffic a reader already has a link to.
   *
   * @param {import('./robots.js').RobotsOptions} [options]
   * @param {(text: string) => void|Promise<void>} [callback] receives the
   * rendered file; not fired when an existing file was left in place
   * @returns {this}
   */
  robots(options, callback) {
    // Remembered so a watch rebuild re-issues it, the same way the other three
    // requests are — the replay's own call re-records it.
    this._robotsRequest = { options, callback }
    const overwrite = !options || options.overwrite !== false
    const run = Promise.all(this._promises)
      .then(async () => {
        const result = await writeRobots({
          config: this._writeConfig,
          logger: this.logger,
          outputs: this._outputs,
          options: options || {},
          // Read here rather than at call time so `.robots().sitemap()` and
          // `.sitemap().robots()` agree: both are recorded synchronously on
          // the chain, and this runs after the queue has drained.
          hasSitemap: this._sitemapRequest !== null,
          overwrite,
        })
        const { status, text, agents, disallowAll, sitemaps } = result
        // A staged build records the staging path; the report maps it back to
        // the real folder, like every other path in it.
        this._robotsResult = {
          file: `${this._writeRoot}/robots.txt`,
          agents,
          disallowAll,
          sitemaps,
        }
        if (disallowAll)
          this.logger.notice(
            'robots.txt disallows the whole site (Disallow: /) — no crawler will index it',
          )
        if (status !== 'written') return
        if (callback) this._runCallback('robots', callback, text)
      })
      .catch((err) => {
        this.logger.error('Error creating robots.txt')
        this.logger.warn(err)
      })
    this._generating.push(run)
    return this
  }

  /**
   * Writes an RSS 2.0 feed into the build folder — the third file derived from
   * the same registry as `sitemap.xml` and `llms.txt`, so an item can never
   * name a URL the site does not serve. One `<item>` per page that carries a
   * date, newest first. Requires `config.siteUrl` and `options.title`; without
   * either this logs an error and skips. Like `.sitemap()` and `.llms()`, it
   * can be called before or after `.generate()`, and it is re-run by a
   * whole-site watch rebuild.
   *
   * @param {FeedOptions} options
   * @param {(text: string) => void|Promise<void>} [callback] receives the
   * rendered document; not fired when the feed was skipped for want of an option
   * @returns {this}
   */
  feed(options, callback) {
    // Remembered so a watch rebuild can re-run it against the new stack, the
    // same way `_sitemapRequest` and `_llmsRequest` are — the replay's own
    // call re-records it.
    this._feedRequest = { options, callback }
    const overwrite = !options || options.overwrite !== false
    const run = Promise.all(this._promises)
      .then(async () => {
        const { status, text } = await writeFeed(this._stack, {
          config: this._writeConfig,
          logger: this.logger,
          outputs: this._outputs,
          options: options || {},
          overwrite,
        })
        // A missing siteUrl or title wrote nothing and there is nothing to hand
        // a callback; a skip left an existing file in place, which is still the
        // build's feed.
        if (status !== 'written' && status !== 'skipped') return
        // A staged build records the staging path and the report maps it back
        // to the real folder, like every other path in it.
        this._feedPath = `${this._writeRoot}/${feedFileName(options || {})}`
        if (callback) this._runCallback('feed', callback, text)
      })
      .catch((err) => {
        this.logger.error('Error creating the feed')
        this.logger.warn(err)
      })
    this._generating.push(run)
    return this
  }

  /**
   * Pulls one resolved model out of the array `.generate()`/`.complete()` hand
   * back — the way to read a model without relying on its position.
   *
   * @param {string} id the model filename or URL you passed
   * @param {BuildData} data
   * @returns {any} the resolved model, or `{ error }` if there is no such id
   */
  getModelByID(id, data) {
    const result = data.find((d) => d.id === id)
    if (result) return result.data
    return { error: 'No data found for: ' + id }
  }

  // The watch session — the watcher's events, the one serial rebuild queue,
  // a whole-site replay or a scoped re-render, one live reload per settled
  // rebuild: `lib/rebuild.js` (AIKB/rebuild.md). Each method is the module
  // function over this instance; the documentation lives there.
  /** @private */
  _replay() {
    return replaySession(this)
  }
  /** @private */
  _requestReplay() {
    return requestReplay(this)
  }
  /** @private */
  _requestRebuild(entries) {
    return requestRebuild(this, entries)
  }
  /** @private */
  _runRebuildQueue() {
    return runRebuildQueue(this)
  }
  /** @private */
  _rebuild(entries) {
    return rebuildEntries(this, entries)
  }
  /** @private */
  _handleChange(event, changedPath) {
    return handleChange(this, event, changedPath)
  }
  /** @private */
  _builtAssetPath(changed) {
    return builtAssetPath(this, changed)
  }
  /** @private */
  _reload(changed) {
    return reload(this, changed)
  }

  /**
   * Starts the file watcher (once). Only meaningful with `dev: true`, which
   * also starts the dev server. Started for you in dev mode.
   *
   * @param {WatchOptions} [options]
   * @returns {this}
   */
  watch({ entry = process.argv[1] } = {}) {
    startWatching(this, entry)
    return this
  }

  // Quiesce before tearing down: a caller that awaits close() must be able to
  // clean or deploy the build dir without racing a rebuild that is still
  // writing. Watchers go first so no new requests arrive, then the queue is
  // drained in a loop — the pending slot can start one more run before
  // `_closing` is seen. A closed instance stays closed.
  /**
   * Stops the watcher and dev server, and removes an un-promoted staging
   * folder. Resolves once any in-flight rebuild has finished, so nothing is
   * written after it. A closed instance stays closed.
   *
   * @returns {Promise<void>}
   */
  async close() {
    this._closing = true
    if (this._watcher) await this._watcher.close()
    this._watcher = null
    while (this._rebuildInFlight) await this._rebuildInFlight
    if (this._devServer) await this._devServer.close()
    this._devServer = null
    // Last, and unconditional: a dev-mode watch process (a `--watch` compiler)
    // is a child of this process and would keep running — and keep the event
    // loop alive — long after the site stopped being served.
    if (this._pipeline) await this._pipeline.close()
    // A staged build nothing promoted — no complete(), or a failed one — is
    // this instance's litter, and the last moment to clear it is here.
    if (this._stagingDir) {
      await this._removeStaging(this._stagingDir, 'unpromoted')
      this._stagingDir = null
    }
    // Only while the build folder is back in place: a renamed-aside folder the
    // restore could not put back is the sole copy of the previous output.
    if (this._oldDir && (await fs.pathExists(this._buildTarget))) {
      await fs.remove(this._oldDir).catch((err) => {
        this.logger.debug(err.stack)
      })
      this._oldDir = null
    }
  }
}

export default Kiss
export { Kiss as 'module.exports' }
export { utils }

// The redirect renderers, re-exported because `config.redirects.format`'s
// writer function is an extension point and an extension point you cannot
// build on is a wall with a door painted on it. Before this, a site that
// needed a host kiss does not encode had to reimplement an encoding kiss
// already had — and could not even copy it, because the `exports` map makes
// `kiss-ssg/lib/redirects.js` an `ERR_PACKAGE_PATH_NOT_EXPORTED`. That was a
// straight violation of this package's own stated rule, in llms.txt: one
// entry in the map, and everything public reachable from `'kiss-ssg'` itself.
//
// Flat rather than a `redirects` namespace object (the shape `utils` uses)
// for one reason: a site reads `config.redirects` in the same file, and
// `redirects.renderRedirects(...)` inside `redirects: { format: ... }` is a
// sentence nobody should have to parse. The names are already unambiguous on
// their own, and they are the same functions `AIKB/redirects.md` documents —
// one vocabulary, not a second set of aliases for the same code.
export {
  renderRedirects,
  renderRedirectsJson,
  renderFirebaseRedirects,
  renderVercelRedirects,
  renderHtaccessRedirects,
}

// The markup decomposition: the mechanical half of converting a single-file
// site, exported for the same reason and under the same rule — the agent doing
// that conversion runs in the *consuming* project, where
// `kiss-ssg/lib/html-split.js` is an ERR_PACKAGE_PATH_NOT_EXPORTED, and a tool
// nothing can import is a tool nobody uses. The page's stylesheet stays whole,
// inline in the layout where the page had it; a stylesheet splitter shipped
// on this branch and was removed before release (2026-10-02), because SCSS
// reads plain CSS differently in more places than a translation could keep up
// with, and the operator judged the split not worth it. `findTag` rides along with `parseHtml` because a caller that parses a
// document almost always wants one element out of it — the `<body>`, to
// compare a conversion's output against its input. Added when
// `examples/12-from-a-single-file/tools/compare.mjs` reached for it and found
// the export list one function short of useful: the alternative was every
// caller hand-rolling the same breadth-first walk.
export { splitDocument, parseHtml, findTag }
