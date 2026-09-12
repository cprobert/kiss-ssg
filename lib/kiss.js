import fs from 'fs-extra'
import path from 'node:path'
import Handlebars from 'handlebars' // https://handlebarsjs.com/
import layouts from 'handlebars-layouts' // https://www.npmjs.com/package/handlebars-layouts
import { Remarkable } from 'remarkable'
import utils from './utils.js'
import { createLogger } from './logger.js'
import { resolveConfig, foldersToEnsure } from './config.js'
import { registerHandlebarsHelpers } from './handlebars-helpers.js'
import { registerPartials, partialNameFor } from './partials.js'
import { DependencyGraph } from './dependency-graph.js'
import { copyAssets } from './assets.js'
import { createPipeline } from './pipeline.js'
import { createAssetManifest, isHashable } from './asset-manifest.js'
import { buildReport } from './build-report.js'
import { checkLinks } from './links.js'
import {
  collectAliases,
  redirectFindings,
  writeRedirects,
} from './redirects.js'
import { readReportsFile } from './check.js'
import { resolveModel } from './model-resolver.js'
import { applyController } from './controller-resolver.js'
import { writeSitemap } from './sitemap.js'
import { writeLlms } from './llms.js'
import { feedFileName, writeFeed } from './feed.js'
import {
  buildSiteMap,
  isRecorded,
  pageOrigin,
  writeAikb,
  writeLastBuild,
} from './aikb.js'
import { KissPage, preloadMinifier } from './kiss-page.js'
import { startDevServer } from './dev-server.js'
import { createWatcher, isInside } from './watcher.js'

/** @typedef {import('./build-report.js').BuildReport} BuildReport */
/** @typedef {import('./build-report.js').BuildPage} BuildPage */
/** @typedef {import('./build-report.js').BuildAsset} BuildAsset */
/** @typedef {import('./build-report.js').BuildReportFailure} BuildReportFailure */
/** @typedef {import('./build-report.js').BuildPipelineStep} BuildPipelineStep */
/** @typedef {import('./build-report.js').BuildAikb} BuildAikb */
/** @typedef {import('./build-report.js').BuildLinks} BuildLinks */
/** @typedef {import('./build-report.js').BuildBrokenLink} BuildBrokenLink */
/** @typedef {import('./build-report.js').BuildRedirects} BuildRedirects */
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

// Anything but these three counts as "on". `=== '1'` would let `KISS_CHECK=true`
// fall silently through to a real build over published output, which is the one
// outcome check mode exists to prevent — so the ambiguity is resolved towards
// the harmless answer.
const CHECK_MODE_OFF = new Set(['', '0', 'false'])

// The one place the engine reads process state. `resolveConfig` stays pure, so
// check mode is applied over the resolved config in the constructor instead.
function checkModeRequested(env = process.env) {
  return !CHECK_MODE_OFF.has(String(env.KISS_CHECK ?? '').toLowerCase())
}

// Whether this build was asked to *record* the site's knowledge base, read by
// the same rule as check mode so the two env vars behave alike. `kiss-ssg aikb`
// is what sets it: recording is a ceremony a person performs at the end of a
// piece of work, never something an ordinary build does behind their back —
// otherwise every run moves the baseline the next diff is measured against.
function aikbRecordRequested(env = process.env) {
  return !CHECK_MODE_OFF.has(String(env.KISS_AIKB ?? '').toLowerCase())
}

// The default identity of a `.page()`/`.scan()` page: the view's route with its
// extension removed. An inline template — a view that is not a `.hbs` filename —
// is not a route, so it has no default id and cannot be linked by one.
function defaultIdForView(view) {
  if (typeof view !== 'string' || !view.endsWith('.hbs')) return null
  return (
    utils
      .posixPath(view)
      .replace(/^\/+/, '')
      .replace(/\.hbs$/, '') || null
  )
}

// An id the author wrote, as opposed to one the engine derived. Only a non-empty
// string counts: ids are strings everywhere (the report, the map, `{{link}}`'s
// argument), and a record whose `id` field is a database integer is data about
// the record, not a claim on a page's identity.
function explicitIdOf(options) {
  const id = options?.id
  return typeof id === 'string' && id.trim() ? id : null
}

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
  /** @private */
  _failures = []
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
  /** @private */
  _redirectsPath = null
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
    /** @type {KissConfig} */
    this.config = resolveConfig(config)
    this.logger =
      this.config.logger || createLogger({ verbose: this.config.verbose })
    this.verbose = !!this.config.verbose

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
    this.registerPartials()

    if (this.config.dev) {
      // Unlike live reload, which is optional, there is nothing useful to do
      // without the HTTP server: the old non-fatal path left the process up,
      // serving nothing, behind a "Serving" line that had already been printed.
      const devServerFailed = async (error) => {
        this.logger.error(error.message)
        this.logger.debug(error.stack)
        this._failures.push({ view: '<dev server>', buildTo: null, error })
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
        // One suffix for both siblings of this build, so a leftover pair is
        // recognisably one crashed run rather than two unrelated ones.
        const suffix = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`
        // Redirecting folders.build is what routes *every* write — pages,
        // their debug siblings, the asset copy, sitemap.xml, viewStats' dump
        // — into staging in one move, since each of them reads it (directly,
        // or through the buildDir a page is prepared with).
        this._stagingDir = `${this._buildTarget}.kiss-staging-${suffix}`
        this._oldDir = `${this._buildTarget}.kiss-old-${suffix}`
        this.config.folders.build = this._stagingDir
      }
    }

    foldersToEnsure(this.config.folders).forEach((f) => fs.ensureDirSync(f))

    if (this.config.cleanBuild) {
      try {
        fs.emptyDirSync(this.config.folders.build)
      } catch (err) {
        this.logger.error(err.message)
      }
    }
    fs.ensureDirSync(this.config.folders.build)
  }

  // A staging or renamed-aside sibling of the build folder that outlived the
  // process that made it — a crashed or killed run. Removed here rather than
  // left to accumulate beside published output: the suffix carries the pid, so
  // one belonging to a live build (this process's own concurrent instance) is
  // never a candidate.
  /** @private */
  _sweepStaleSiblings() {
    const target = path.resolve(this._buildTarget)
    const parent = path.dirname(target)
    const prefix = `${path.basename(target)}.kiss-`
    let stale
    try {
      stale = fs
        .readdirSync(parent)
        .filter(
          (name) =>
            (name.startsWith(`${prefix}staging-`) ||
              name.startsWith(`${prefix}old-`)) &&
            !name.startsWith(`${prefix}staging-${process.pid}-`) &&
            !name.startsWith(`${prefix}old-${process.pid}-`),
        )
    } catch {
      return // No parent folder yet, so nothing can be stale in it.
    }
    for (const name of stale) {
      try {
        fs.removeSync(path.join(parent, name))
      } catch (err) {
        this.logger.error(err.message)
      }
    }
    if (stale.length > 0)
      this.logger.notice(
        `Removed leftovers of an interrupted build: ${stale.join(', ')}`,
      )
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

  // What a step's command inherits on top of `process.env`: where this build
  // writes, where its assets are read from, and whether a dev server is up —
  // enough for a tool to aim its own output at the right folder without the
  // site having to repeat the paths in the command. Read per run rather than
  // captured once: a staged build's `folders.build` becomes the real folder
  // the moment complete() promotes it.
  /** @private */
  _pipelineEnv() {
    return {
      KISS_BUILD: this.config.folders.build ?? '',
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
    const target = this._stagedPath(targetDir)
    const run = this._assetQueue.then(() =>
      copyAssets(sourceDir, target, {
        config: this.config,
        logger: this.logger,
        manifest: this._assetManifest,
      }),
    )
    this._assetQueue = run
    this._promises.push(run)
    return this
  }

  // A copy the caller aimed at the real build folder has to follow the build
  // into staging, or the promotion below removes the very files it copied.
  // Anything outside the build folder is left exactly where it was asked for.
  /** @private */
  _stagedPath(target) {
    if (!this._stagingDir || !target) return target
    const resolved = path.resolve(target)
    const root = path.resolve(this._buildTarget)
    if (resolved !== root && !resolved.startsWith(root + path.sep))
      return target
    return path.join(this._stagingDir, path.relative(root, resolved))
  }

  // The staging folder is an implementation detail, so a failure names the
  // page where the operator will look for it: in the build folder they asked
  // for, not in a sibling with a random suffix that is about to be deleted.
  /** @private */
  _reportedPath(target) {
    if (!this._stagingDir || typeof target !== 'string') return target
    return target.startsWith(`${this._stagingDir}/`)
      ? `${this._buildTarget}${target.slice(this._stagingDir.length)}`
      : target
  }

  // Swaps a staged build into place: the whole folder appears at once, and a
  // build that never got here leaves the previous output untouched. Once, on
  // the first complete() that settles without failures — the nested pattern
  // has two calls draining the same build.
  /** @private */
  async _promote() {
    if (!this._stagingDir || this._buildSettled) return
    const staging = this._stagingDir
    const target = this._buildTarget
    const old = this._oldDir
    this._buildSettled = true
    await fs.ensureDir(path.dirname(path.resolve(target)))
    // Rename aside rather than remove: the previous output is absent only
    // between two renames — metadata operations on one filesystem — instead of
    // for the whole of a recursive delete, and it can be put back if the
    // second one fails.
    const hadTarget = await fs.pathExists(target)
    if (hadTarget) await fs.rename(target, old)
    try {
      await fs.rename(staging, target)
    } catch (err) {
      // A staging sibling is normally on the target's own filesystem, but a
      // build folder that is a mount point or a symlink into one is not:
      // rename fails EXDEV there and only a copy-then-remove crosses it.
      this.logger.debug(err.stack)
      try {
        await fs.move(staging, target, { overwrite: true })
        await fs.remove(staging)
      } catch (moveErr) {
        if (hadTarget) {
          // Whatever the failed move managed to write is in the way of the
          // restore, and it is a fragment of a build nothing will publish.
          await fs.remove(target).catch((e) => this.logger.debug(e.stack))
          try {
            await fs.rename(old, target)
            this._oldDir = null
          } catch (restoreErr) {
            // Now the only copy of the previous output. Named loudly, and
            // kept: close() leaves it alone while the target is missing.
            this.logger.error(
              `Could not restore ${target} after a failed promotion (${restoreErr.message}); the previous output is in ${old}`,
            )
          }
        }
        throw moveErr
      }
    }
    if (hadTarget) await fs.remove(old)
    this._oldDir = null
    // Cleared only once the swap has happened, so a promotion that threw
    // still leaves the folder for close() to remove. Kept on `_promotedFrom`
    // for `_finishBuild`: the dependency graph's page keys are the paths the
    // pages were written to, which were staging paths.
    this._promotedFrom = staging
    this._stagingDir = null
    // From here the instance is an ordinary one building into the real folder:
    // a watch rebuild, or a second build on this instance, must not write into
    // a staging folder nothing will ever swap in again.
    this.config.folders.build = target
    for (const entry of this._stack) {
      entry.page.buildDir = target
      entry.buildTo = entry.page.buildTo
    }
    this.logger.success(target)
  }

  // One report per settled build, assembled after the staging folder has been
  // promoted or discarded so every path in it names the folder the site asked
  // for. Latched on `_report`, because the nested-complete() pattern settles
  // one build twice and KISS_REPORT takes one line per build, not per call.
  /** @private */
  async _finishBuild() {
    if (this._report) return this._report
    // Before the report is assembled, because the report carries its verdict —
    // and after the drain, because the dependency graph is filled by rendering
    // and a map built any earlier would list no partials at all.
    const verdict = await this._buildAikb()
    // Before the report, because the report carries it — and before
    // `writeLastBuild` below replaces the very record it reads.
    this._redirectsResult = this._redirectFindings()
    this._report = buildReport({
      stack: this._stackForRecord(),
      failures: this._failures,
      manifest: this._assetManifest,
      buildDir: this._buildTarget ?? this.config.folders.build,
      // `_promotedFrom` matters here too: a promotion rewrites every stack
      // entry's `buildTo` to the real folder but not `_sitemapPath` or
      // `_llmsPath`, which were recorded as the staging paths they were written
      // to. Without the fallback a successful `'atomic'` build reported a
      // `sitemap`/`llms` inside a folder that no longer exists. Mapping a path
      // that is already real is a no-op, so nothing else moves.
      stagingDir: this._stagingDir ?? this._promotedFrom,
      mode: this._checkMode ? 'check' : 'build',
      startedAt: this._startedAt,
      sitemap: this._sitemapPath,
      pipeline: this._pipelineResults,
      llms: this._llmsPath,
      aikb: verdict,
      // The three appended keys, in the order `buildReport` fixes them. All
      // three are `null` on every build until the modules that fill them land:
      // the seam is here so each of those adds a field and a call site rather
      // than reshaping this one.
      links: this._links,
      redirects: this._redirectsResult,
      feed: this._feedPath,
    })
    // The graph as data, for a human to look at: which pages each partial
    // reaches. Dev only — a one-shot build has no watcher to use it — and
    // verbose only, beside debug.json. A failure to write it is logged, never
    // a build failure.
    if (this.config.dev && this.config.verbose)
      await fs
        .outputJson(
          `${this.config.folders.build}/dependency-graph.json`,
          this._graph.toJSON(),
          { spaces: 2 },
        )
        .catch((err) =>
          this.logger.error(
            `Could not write dependency-graph.json: ${err.message}`,
          ),
        )
    const reportFile = process.env.KISS_REPORT
    if (reportFile)
      // JSON Lines, appended: one script may build several sites (an archive of
      // per-season outputs is one Kiss per season), and each instance writes a
      // line of its own. A report that cannot be written is not worth failing a
      // build over — whatever is reading the file reports the silence instead.
      await fs
        .appendFile(reportFile, `${JSON.stringify(this._report)}\n`)
        .catch((err) =>
          this.logger.error(`Could not write KISS_REPORT: ${err.message}`),
        )
    // Last of the four files, because it is this build's report and the report
    // did not exist until a moment ago. A build that wrote no map writes no
    // snapshot of itself either — the two halves of a record are one thing.
    if (verdict?.written)
      await writeLastBuild({
        folder: verdict.folder,
        report: this._report,
        logger: this.logger,
      })
    return this._report
  }

  // Builds the site map, evaluates the note rules and — only when this build
  // was asked to record, and only when it has something worth recording —
  // writes the generated half of the AIKB folder. A failure to write is logged
  // and reported as `written: false`, never a build failure: the same stance as
  // the dependency-graph dump above.
  //
  // Two questions, in order. *Is there a knowledge base here at all?* —
  // `folders.aikb` set, and either this run is the record or the folder already
  // holds a `site-map.json` a previous record wrote. A folder that merely
  // exists is not an answer: this repository's own `AIKB/` is hand-written
  // module notes, and the docs site built inside it must not adopt them. Then:
  // *may this build write?* — only a record, never in dev (where the site is
  // half-built by definition), and never after a failure, because a knowledge
  // base that describes a broken build is worse than none.
  /** @private */
  async _buildAikb() {
    const folder = this.config.folders.aikb
    if (!folder) return null
    const record = aikbRecordRequested()
    if (!record && !isRecorded(folder)) return null
    const map = buildSiteMap({
      stack: this._stackForRecord(),
      graph: this._graph,
      config: this.config,
      pipeline: this.config.assets.pipeline,
      buildDir: this._buildTarget ?? this.config.folders.build,
      // Whichever staging folder this build used, promoted or not: the graph's
      // keys are staging paths in both cases.
      stagingDir: this._stagingDir ?? this._promotedFrom,
    })
    const write = record && !this.config.dev && this._failures.length === 0
    // A refusal is said out loud: the whole point of `kiss-ssg aikb` is that
    // the operator is standing there waiting for the folder to be rewritten,
    // and silence would read as success.
    if (record && !write)
      this.logger.notice(
        this._failures.length > 0
          ? `KISS_AIKB: not recording ${folder} — the build failed (${this._failures.length} ${this._failures.length === 1 ? 'failure' : 'failures'}); the knowledge base only ever describes a build that worked`
          : `KISS_AIKB: not recording ${folder} — a dev build is never recorded`,
      )
    return await writeAikb({ map, folder, logger: this.logger, write })
  }

  // Resolves every internal reference this build's own pages wrote, against the
  // folder they were written into — `lib/links.js` does the work; this only
  // decides whether to run it and hands it the build's own registry.
  //
  // **It runs before the folder moves, not in `_finishBuild()`.** By the time
  // `_finishBuild()` is reached the staging folder has been discarded (check
  // mode, and any failed atomic build) or promoted (an atomic success), so a
  // scan that resolved against `config.folders.build` there would find nothing
  // at all under `kiss-ssg check` — the one command the finding exists to
  // serve — and would report `checked: 0, broken: []` silently. Called from
  // complete()'s settle path instead, the pages are still exactly where they
  // were written, whichever of the three branches is about to run.
  //
  // The references themselves were extracted at write time (`KissPage.links`),
  // so nothing here reads HTML back; what the filesystem is consulted for is
  // the rest of the build folder — assets, `sitemap.xml`, `llms.txt`, a feed,
  // whatever a pipeline step wrote straight into it.
  //
  // Latched on `_links` for the reason `_report` is: the documented
  // "complete() inside a generate callback" pattern settles one build twice,
  // and the second pass would be scanning a folder that is no longer there.
  //
  // Skipped in dev (and therefore on every watch rebuild): a scoped re-render
  // has not rewritten every page, so a scan would be reporting a half-built
  // site. `config.links.check: false` skips it outright. Both leave `_links`
  // `null`, which the report distinguishes from "it ran and found nothing".
  /** @private */
  _checkLinks() {
    if (this._links) return this._links
    if (!this.config.links?.check || this.config.dev) return null
    // `hash !== null` is the promise "these bytes are on disk" (AIKB/kiss-page.md);
    // `generate !== false` is not — a page can also have failed to render.
    const pages = this._stack
      .filter(
        (entry) =>
          entry.page?.hash !== null && Array.isArray(entry.page?.links),
      )
      // `entry.buildTo`, not the real path: under `'atomic'` and under check
      // these are staging paths, which is where the files are right now.
      // `buildReport` maps them back through `reportedPath` for the report.
      .map((entry) => ({ buildTo: entry.buildTo, links: entry.page.links }))
    const result = checkLinks({
      pages,
      buildDir: this.config.folders.build,
      siteUrl: this.config.siteUrl,
      extensionLess: this.config.extensionLess,
      // The manifest's **values**, never its keys: under `assets.hash` the file
      // on disk is `css/site.a1b2c3d4.css`, so a template that hardcoded
      // `/css/site.css` is genuinely broken and accepting the key would hide it.
      manifestTargets: Object.values(this._assetManifest.toObject()),
    })
    this._links = result
    if (result.broken.length === 0)
      this.logger.info(
        `Links: ${result.checked} internal reference${result.checked === 1 ? '' : 's'}, none broken`,
      )
    // One line per finding, in the wording `formatReport` uses, so the build
    // log and `check --summary` say the same thing. Advisory: it moves nothing.
    else
      for (const broken of result.broken)
        this.logger.notice(
          `broken link: ${this._reportedPath(broken.page)} -> ${broken.href}`,
        )
    return result
  }

  // Writes `<build>/_redirects` from every page's `aliases` — `lib/redirects.js`
  // does the work; this only decides when it happens and records where it went.
  //
  // Automatic, with no method of its own: an alias is a property of a page, not
  // a file the author asks for, so there is nothing to call. That leaves the
  // question of *when*, and there are only two honest answers. A
  // `Promise.all(this._promises)` pushed onto `_generating` — the `.sitemap()`
  // shape — needs a call site, and the only one that exists on every build is
  // the constructor, where `_promises` holds the asset copy and not one page:
  // the write would run against an empty stack. So it goes at the top of
  // `complete()`'s settle path instead, where the drain has finished (the
  // sitemap, llms.txt and the feed are already on disk) and the three-way
  // branch below has not yet discarded or promoted anything. Provably before
  // the folder moves, because it is above the branch that moves it; and free
  // on replay, because `_replay()` ends in `complete()`.
  //
  // Dev builds write it too. Nothing serves `_redirects` locally, but it costs
  // one small file and it keeps "what the build folder contains" from
  // depending on the mode — unlike the link scan, which is skipped in dev
  // because a scoped re-render has genuinely not rewritten every page.
  /** @private */
  _writeRedirects() {
    if (this._redirectsRun) return this._redirectsRun
    this._redirectsRun = writeRedirects(this._stack, {
      config: this.config,
      logger: this.logger,
    })
      .then(({ status }) => {
        // `none` wrote nothing and claims nothing: the report's `file` stays
        // `null`, and a `_redirects` the site copied in from its assets folder
        // is still the build's own.
        if (status === 'none') return
        // The path as written — a staging path under `'atomic'` and under
        // check — which `buildReport` maps back to the real folder, exactly as
        // it does for `sitemap`, `llms` and `feed`.
        this._redirectsPath = `${this.config.folders.build}/_redirects`
      })
      .catch((err) => {
        this.logger.error('Error creating _redirects')
        this.logger.warn(err)
      })
    return this._redirectsRun
  }

  // The last recorded build, or `null` — the baseline the `removed` finding is
  // measured against.
  //
  // Gated on the **file**, never on `isRecorded()`: that answers "is there a
  // `site-map.json`", which `_buildAikb()` has just written one line above, so
  // on a site's very first `kiss-ssg aikb` it flips to true within this method
  // while `last-build.json` does not exist yet either way. A record that cannot
  // be read is no baseline rather than a build failure — the finding is
  // advisory, and a corrupt file is not a reason to fail a site that built.
  /** @private */
  _lastBuildRecord() {
    const folder = this.config.folders.aikb
    if (!folder) return null
    const file = `${utils.posixPath(folder)}/last-build.json`
    if (!fs.existsSync(file)) return null
    try {
      // The same reader `kiss-ssg check --against` uses, so the baseline this
      // build judges itself against and the one the bin diffs against are read
      // by one piece of code.
      const [record] = readReportsFile(fs.readFileSync(file, 'utf8'))
      return record ?? null
    } catch (err) {
      this.logger.debug(`Unreadable ${file}: ${err.message}`)
      return null
    }
  }

  // The two rename findings, and the report's `redirects` key. Pure apart from
  // reading the record: the file itself was written back in the settle path,
  // before the folder moved, and this only describes it.
  //
  // `null` when there is nothing to say: no alias anywhere in the site, and no
  // finding. A site that uses neither feature reports `null` — and so does a
  // recorded site with nothing wrong, which is what keeps `last-build.json`
  // byte-identical across two identical records. The alternative, an empty
  // verdict whenever a record happens to exist, makes a site's *first* record
  // differ from its second for no change to the site at all: the first is
  // written before there is a baseline, the second after.
  /** @private */
  _redirectFindings() {
    const buildDir = this.config.folders.build
    // Re-collected rather than carried over from the write: the same pure
    // function over the same stack, so the two cannot disagree, and the count
    // stays right on a build where the write was skipped.
    const rules = collectAliases(this._stack, { buildDir })
    const previous = this._lastBuildRecord()
    const { removed, collisions } = redirectFindings({
      rules,
      currentPages: this._stack
        .filter((entry) => entry.page.options.generate !== false)
        .map((entry) => ({ buildTo: entry.buildTo })),
      previousPages: previous,
      buildDir,
    })
    // `collisions` cannot be non-empty without a rule, so the two halves of
    // "nothing to say" are the rules and the removals.
    if (rules.length === 0 && removed.length === 0) return null
    // One line per finding, in `formatReport`'s wording, so the build log and
    // `check --summary` say the same thing. Advisory: neither moves anything.
    for (const path of removed)
      this.logger.notice(`removed without redirect: ${path}`)
    for (const path of collisions)
      this.logger.notice(`alias collides with a page: ${path}`)
    return {
      file: this._redirectsPath,
      aliases: rules.length,
      removed,
      collisions,
    }
  }

  // A failed build promotes nothing and leaves nothing behind. `_stagingDir`
  // is deliberately kept: a later write would recreate the folder, and
  // close() is what removes it for good.
  /** @private */
  async _discardStaging() {
    if (!this._stagingDir || this._buildSettled) return
    this._buildSettled = true
    await fs.remove(this._stagingDir).catch((err) => {
      this.logger.debug(err.stack)
    })
  }

  /**
   * @private
   * @param {any} options
   * @param {any} [origin]
   * @param {string|null} [idPrefix] given only by `_prepareMultiplePages`: what
   * this fan-out's items prefix their default ids with, in place of the view
   * route. Its presence is also what tells a fan-out item from a `.page()` page.
   */
  _preparePage(options, origin, idPrefix) {
    const kissPage = new KissPage(options.view, {
      hbs: this.handlebars,
      logger: this.logger,
      graph: this._graph,
    })
    kissPage.options = options
    kissPage.buildDir = this.config.folders.build
    kissPage.pagesDir = this.config.folders.pages
    kissPage.path = options.path
    kissPage.slug = options.slug
    if (options.ext) kissPage.ext = options.ext
    kissPage.debug = this.config.verbose
    kissPage.isDev = this.config.dev
    kissPage.livereloadPort = this.config.livereloadPort
    kissPage.extLess = this.config.extensionLess

    const preparedPage = kissPage.prepare()
    const buildTo = preparedPage.buildTo
    // A page that will not be written claims no output path: it neither fails
    // a real page registered after it nor fails itself when one came first.
    const writes = (page) => page.options.generate !== false
    const claimed = this._stack.some(
      (entry) => entry.buildTo === buildTo && writes(entry.page),
    )
    if (claimed && writes(preparedPage)) {
      this.logger.error('Page already processed', buildTo)
      // A build failure, not a skip: two pages claiming one output path means
      // one of them is missing from a build that would otherwise succeed.
      this._failures.push({
        view: preparedPage.view,
        buildTo,
        error: new Error(`Page already processed: ${buildTo}`),
      })
      return null
    }
    // Identity, computed here and nowhere else: this is the one point at which
    // both halves are known — the view route synchronously, and the page's
    // *normalised* slug only now, because `KissPage`'s setter has just run it
    // through `toSlug`. An id built from `options.slug` would not match the
    // `{{link "<view>" slug=…}}` sugar, which slugs its argument the same way.
    // A page that will not be written claims no id at all: it cannot be linked,
    // and it must not take an id off a page that can — the same exemption the
    // duplicate-output-path check above makes for it.
    const explicitId = writes(preparedPage) ? explicitIdOf(options) : null
    let id = explicitId
    if (!id && writes(preparedPage))
      id =
        idPrefix === undefined
          ? defaultIdForView(preparedPage.view)
          : idPrefix
            ? `${idPrefix}/${preparedPage.slug}`
            : null
    if (explicitId) {
      // Two pages claiming one id is two pages claiming one identity: recorded
      // exactly like two pages claiming one output path, because a `{{link}}`
      // to it could only ever mean one of them. Two *default* ids do not fail —
      // see `_idIndexFor()`, which withdraws them instead.
      const owner = this._stack.find(
        (other) => other.explicit && other.id === explicitId,
      )
      if (owner) {
        this.logger.error('Page id already claimed', explicitId)
        this._failures.push({
          view: preparedPage.view,
          buildTo,
          error: new Error(`Page id already claimed: ${explicitId}`),
        })
        return null
      }
    }
    const entry = {
      view: preparedPage.view,
      buildTo,
      page: preparedPage,
      runCount: 0,
      // Identity and whether the author wrote it, on the stack entry rather
      // than on `options`: every own key of the options object reaches the
      // render context and the dev-mode `.json` sibling, and `explicit` is the
      // engine's bookkeeping. The page *option* `id` stays on `options` exactly
      // as it was written.
      id,
      explicit: explicitId !== null,
      // How this page's model and controller were *written*, captured in
      // `page()` before the chain replaced `options.model` with the resolved
      // data. Read only by `_buildAikb`; carried on the stack entry rather than
      // on `options`, because every own key of a registration reaches the render
      // context and the dev-mode `.json` sibling.
      origin,
    }
    this._stack.push(entry)
    // The stack has changed, so every default id resolved against it may have.
    this._idIndex = null
    return entry
  }

  // Identity resolved over the live stack. Explicit ids are unique by
  // construction (a second claim failed the build above); a default id claimed
  // twice is withdrawn from both pages rather than failing, so every site that
  // builds today still builds — and an explicit id beats a default one, which
  // is deterministic and fixable by naming one page.
  /** @private */
  _idIndexFor() {
    if (this._idIndex) return this._idIndex
    /** @type {Map<string, any>} */
    const byId = new Map()
    /** @type {Map<string, any[]>} */
    const defaults = new Map()
    for (const entry of this._stack) {
      if (!entry.id) continue
      if (entry.explicit) byId.set(entry.id, entry)
      else {
        const seen = defaults.get(entry.id)
        if (seen) seen.push(entry)
        else defaults.set(entry.id, [entry])
      }
    }
    /** @type {Map<string, string[]>} */
    const withdrawn = new Map()
    for (const [id, entries] of defaults) {
      const owner = byId.get(id)
      if (!owner && entries.length === 1) {
        byId.set(id, entries[0])
        continue
      }
      const views = [
        ...(owner ? [owner.view] : []),
        ...entries.map((entry) => entry.view),
      ]
      withdrawn.set(id, views)
      // One line per id per build: the index is rebuilt on every registration,
      // and a fan-out would otherwise say the same thing once per item.
      if (!this._idNoticed.has(id)) {
        this._idNoticed.add(id)
        this.logger.notice(
          owner
            ? `Page id "${id}" is claimed by ${owner.view}, so the default id of ${entries
                .map((entry) => entry.view)
                .join(', ')} is withdrawn: set an explicit id to link to it`
            : `Two pages share the default id "${id}" (${views.join(', ')}): neither can be linked — set an explicit id on each`,
        )
      }
    }
    this._idIndex = { byId, withdrawn }
    return this._idIndex
  }

  // What `{{link}}` asks. Not public API: the helper is handed a bound function
  // at registration (`lookupPage`), so nothing captures the stack array and a
  // watch replay's new stack is seen the moment it is filled.
  /**
   * @private
   * @param {string} id
   * @returns {{ entry: any }|{ withdrawn: true, views: string[] }|null}
   */
  _lookupPage(id) {
    if (typeof id !== 'string' || !id) return null
    const { byId, withdrawn } = this._idIndexFor()
    const entry = byId.get(id)
    if (entry) return { entry }
    const views = withdrawn.get(id)
    if (views) return { withdrawn: true, views }
    return null
  }

  // The stack as the record describes it: a default id two pages arrived at is
  // withdrawn, so it is `null` on the report and `none` on the site map. The
  // map is read as the link autocomplete — an id on it that `{{link}}` refuses
  // would be worse than no id at all.
  /** @private */
  _stackForRecord() {
    const { withdrawn } = this._idIndexFor()
    if (withdrawn.size === 0) return this._stack
    return this._stack.map((entry) =>
      entry.id && !entry.explicit && withdrawn.has(entry.id)
        ? { ...entry, id: null }
        : entry,
    )
  }

  /** @private */
  async _prepareMultiplePages(options, data, fresh = false, origin) {
    let i = 1
    const slug = options.slug ? options.slug : options.view.replace('.hbs', '')
    // The registration's `id` is the *prefix* its items' default ids use, in
    // place of the view route — never an id the items claim. That is how two
    // fan-outs of one view into different folders (the same post view under
    // `/blog/` and `/archive/`) end up with distinct ids instead of colliding.
    const idPrefix = explicitIdOf(options) ?? defaultIdForView(options.view)
    if (Array.isArray(data)) {
      for (const model of data) {
        // One bad item fails its own page and nothing else: the throw is caught
        // here rather than left to unwind the loop, which abandoned every later
        // item unregistered, unrendered and unreported — one failure entry
        // standing for the whole tail of the fan-out. Because nothing escapes
        // this loop, `page()`'s own catch never records a second entry for the
        // same item.
        try {
          // Each page gets its OWN options object. Sharing one across the loop
          // leaks anything derived from the first item into every later page —
          // `applyController`'s "title from model, unless already set" mapping is
          // the case that bit: item one set the title, and the guard then skipped
          // every item after it. `_preparePage` also stores this object on the
          // KissPage, so a shared one would alias across the whole fan-out.
          // `config` is copied one level deeper for the same reason.
          const item = {
            ...options,
            config: { ...options.config },
            slug: `${slug}-${i}`,
            model,
          }
          // `aliases` is promoted from the *record*, exactly where `slug` and
          // `model` are — and the registration's own is deleted rather than
          // inherited. An alias is one old URL for one page: broadcast over a
          // fan-out it would emit N rules with the same source and N different
          // targets, which is a redirect whose destination depends on stack
          // order and a `_redirects` file that is not byte-stable. Like every
          // other page option it reaches the render context and the dev-mode
          // `.json` sibling, which is accepted: a template may legitimately
          // want to say "formerly at …".
          delete item.aliases
          const aliases =
            model && typeof model === 'object' ? model.aliases : undefined
          if (aliases !== undefined) item.aliases = aliases
          // `id` is promoted from the record on the same rule, and the
          // registration's own is deleted rather than inherited: broadcast, the
          // first item would claim it and every later one would fail the build
          // as a duplicate claim. A record's own id wins outright over the
          // `<prefix>/<slug>` default. Only a string is an id — a record whose
          // `id` field is a database integer is data, not a claim on identity.
          delete item.id
          const recordId =
            model && typeof model === 'object' ? model.id : undefined
          if (typeof recordId === 'string' && recordId.trim())
            item.id = recordId
          const pageOptions = await applyController(item, {
            controllersDir: this.config.folders.controllers,
            logger: this.logger,
            fresh,
          })
          // One row per fan-out item, all naming the one registration they
          // came from — the same shape the report gives a `.pages()` fan-out.
          this._preparePage(pageOptions, origin, idPrefix)
        } catch (error) {
          // No output path exists yet, so the failure is named by view plus the
          // item's position — and its own slug where the model carries one, the
          // only handle the operator has on which record of N was malformed.
          const itemSlug =
            model && typeof model.slug === 'string' ? `: ${model.slug}` : ''
          const view = `${options.view} [item ${i}${itemSlug}]`
          this.logger.error('Error preparing page', view)
          this._failures.push({ view, buildTo: null, error })
        }
        i++
      }
    } else {
      this.logger.error('Data in dynamic model must be an array')
    }
  }

  /**
   * Queues one page. Nothing is rendered until `.generate()`.
   *
   * @param {PageOptions} options `options.view` is required
   * @returns {this}
   */
  page(options) {
    if (!options.view) {
      this.logger.error('No view specified', options)
      return this
    }
    // Snapshot what the caller passed, before any mutation below, so a watch
    // rebuild can replay this page from its original options. `_replaying` is
    // read synchronously here: the async chain below runs later, by which time
    // the flag has been reset, hence the captured `fresh`.
    if (!this._replaying) {
      const registration = { ...options }
      if (this._scanning) this._scanned.add(registration)
      this._registrations.push(registration)
    }
    const fresh = this._replaying

    // A per-page shallow copy of the global config, with any `config` the
    // caller passed layered on top as an override. Never the live object: a
    // controller mutating `options.config` would otherwise reach pages already
    // prepared, every later page and the sitemap. Nested values (`folders`)
    // are still shared by reference — nothing in the engine mutates them.
    options.config = { ...this.config, ...(options.config ?? {}) }

    // Auto map model if one isn't specified
    if (!options.model) {
      const matchingModel = options.view.replace(/\.hbs$/, '.json')
      if (fs.existsSync(`${this.config.folders.models}/${matchingModel}`)) {
        this.logger.debug('Found matching model: ', matchingModel)
        options.model = matchingModel
      }
    }

    // See if we can auto map controller if one isn't specified
    if (!options.controller) {
      const matchingController = options.view.replace(/\.hbs$/, '.js')
      if (
        fs.existsSync(
          `${this.config.folders.controllers}/${matchingController}`,
        )
      ) {
        this.logger.debug('Found matching controller: ', matchingController)
        options.controller = matchingController
      }
    }

    // How the model and the controller were written, captured here because the
    // chain below replaces `options.model` with the resolved data and resolves
    // `options.controller` to a function — a map built from the stack alone
    // would say `inline` for every page in the site. Read after the two
    // auto-mappings above, so a page that never named a model still records the
    // `<view>.json` the engine found for it.
    const origin = pageOrigin(options)

    // Capture the model's id before the chain runs: options.model is reassigned
    // to the resolved data inside .then, so reading it in .catch would report
    // `undefined` for any failure that happens after the model resolves.
    const modelId =
      typeof options.model === 'string' ? options.model : undefined

    // Detect all the different types of model options and process appropriately.
    // The whole chain (model -> controller -> prepared page) is tracked, and it
    // never rejects: failures resolve to { id, data: null, error }.
    const chain = resolveModel(options.model, {
      modelsDir: this.config.folders.models,
      logger: this.logger,
      fetchConfig: this.config.fetch,
    })
      .then(async (response) => {
        try {
          if (options.dynamic) {
            await this._prepareMultiplePages(
              options,
              response.data,
              fresh,
              origin,
            )
          } else {
            options.model = response.data
            options = await applyController(options, {
              controllersDir: this.config.folders.controllers,
              logger: this.logger,
              fresh,
            })

            if (!options.slug) {
              if (options.view.endsWith('.hbs')) {
                options.slug = utils.toSlug(
                  options.view
                    .substring(
                      options.view.lastIndexOf('/') + 1,
                      options.view.length,
                    )
                    .replace('.hbs', ''),
                )
              } else {
                options.slug =
                  'snippet-' + Math.floor(Math.random() * 1000000000)
                this.logger.error(
                  'A string view had been provided without an accompanying slug',
                )
                this.logger.info(`generating random slug: ${options.slug}`)
              }
            }

            if (!options.path) {
              // Only a `.hbs` view is a filename with a folder in it, same
              // guard as the slug fallback above: an inline template's own
              // markup (any closing tag) would otherwise become the folder.
              options.path = options.view.endsWith('.hbs')
                ? options.view.substring(0, options.view.lastIndexOf('/'))
                : ''
            }

            this._preparePage(options, origin)
          }
        } catch (error) {
          // Everything past the model — the controller above all — is a build
          // failure, not a skip: the page would otherwise ship built from
          // un-controlled options. A model that fails to resolve rejects
          // before this block and keeps its log-and-skip behaviour.
          this._failures.push({ view: options.view, buildTo: null, error })
          throw error
        }
        return response
      })
      .catch((error) => {
        // If there was any issues processing the model let the user know
        this.logger.error(error.message || error)
        if (error.error) this.logger.error(error.error)
        return { id: modelId, data: null, error }
      })
    this._promises.push(chain)

    // Facilitate chaining
    return this
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
    const pagesRoot = utils.posixPath(this.config.folders.pages)
    const pages = utils.globFiles(pagesRoot, '**/*.hbs')
    // Remembered so a watch rebuild can scan again and pick up new page files.
    this._scanRequested = true
    // Read synchronously by page() as it registers, same as `_replaying`.
    this._scanning = true
    try {
      pages.forEach((pagePath) => {
        // A plain slice, not a RegExp: the folder is a path, and an unescaped
        // one built into a pattern matches the wrong thing (`.` in `./src`).
        const view = pagePath.startsWith(`${pagesRoot}/`)
          ? pagePath.slice(pagesRoot.length + 1)
          : pagePath

        // Against the registrations, not the stack: `page()` records a
        // registration synchronously but only queues the page, so `_stack` is
        // still empty during a `.page(…).scan()` chain and at replay time —
        // scanning either of those against it registered the same view twice.
        const alreadyRegistered = this._registrations.some(
          (registration) => registration.view === view,
        )

        if (!alreadyRegistered) {
          this.logger.info(`Auto added:`, view)
          const options = {
            view: view,
          }
          this.page(options)
        }
      })
    } finally {
      this._scanning = false
    }
    return this
  }

  /**
   * Logs the queued-promise and prepared-page counts, and — with
   * `verbose: true` — writes `debug.json` into the build folder.
   *
   * @returns {this}
   */
  viewStats() {
    if (this.verbose) {
      // Serialise a projection: a stack entry's `page` carries the Handlebars
      // environment (which has an internal cycle) and the logger, so dumping
      // `this._stack` directly throws "Converting circular structure to JSON".
      const projection = this._stack.map(
        ({ view, buildTo, runCount, page }) => ({
          view,
          buildTo,
          runCount,
          options: page.options,
        }),
      )
      fs.outputJson(
        `${this.config.folders.build}/debug.json`,
        projection,
        { spaces: 2 },
        (err) => {
          if (err) this.logger.plain(err)
        },
      )
    }

    this.logger.plain({
      promise: this._promises.length,
      stack: this._stack.length,
    })
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
        ? [...this._promises, ...this._generating]
        : [...this._promises, ...this._generating, ...this._callbacks]
    let seen = -1
    while (seen !== queued().length) {
      const waiting = queued()
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
          this._failures.push({
            view: entry.view,
            buildTo: entry.buildTo,
            error,
          })
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
    const run = Promise.all(this._promises)
      .then(async (data) => {
        const pending = []
        this._stack.forEach((entry) => {
          // One page failing must not stop the others: each attempt is caught
          // here and recorded, and `complete()` reports the collected set.
          if (entry.runCount === 0)
            pending.push(
              entry.page.generate().catch((error) => {
                this._failures.push({
                  view: entry.view,
                  buildTo: entry.buildTo,
                  error,
                })
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
        this._checkLinks()
        if (this._failures.length > 0) {
          await this._discardStaging()
          await this._finishBuild()
          if (!this._failuresReported) {
            this._failuresReported = true
            const failures = this._failures
            const err = new AggregateError(
              failures.map((f) => f.error),
              `${failures.length} page(s) failed to build: ${failures
                .map((f) => this._reportedPath(f.buildTo) ?? f.view)
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
          this.logger.notice(
            `Checked ${this._buildTarget}: the build succeeded and nothing was written`,
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
   * The last settled build, as data: what `.complete()` resolved or rejected
   * with, in a JSON-safe shape a script can act on. `null` until the first
   * `.complete()` has settled; a watch rebuild replaces it with its own. The
   * same object is on the rejection as `err.report`.
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
          config: this.config,
          logger: this.logger,
          overwrite,
        })
        if (status === 'no-site-url') return
        // Where the file went, for the build report. A staged build records the
        // staging path and the report maps it back to the real folder, like
        // every other path in it.
        this._sitemapPath = `${this.config.folders.build}/sitemap.xml`
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
          config: this.config,
          logger: this.logger,
          options: options || {},
          overwrite,
        })
        // A missing siteUrl, title or summary wrote nothing and there is
        // nothing to hand a callback; a skip left an existing file in place,
        // which is still the build's llms.txt.
        if (status !== 'written' && status !== 'skipped') return
        // A staged build records the staging path and the report maps it back
        // to the real folder, like every other path in it.
        this._llmsPath = `${this.config.folders.build}/llms.txt`
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
          config: this.config,
          logger: this.logger,
          options: options || {},
          overwrite,
        })
        // A missing siteUrl or title wrote nothing and there is nothing to hand
        // a callback; a skip left an existing file in place, which is still the
        // build's feed.
        if (status !== 'written' && status !== 'skipped') return
        // A staged build records the staging path and the report maps it back
        // to the real folder, like every other path in it.
        this._feedPath = `${this.config.folders.build}/${feedFileName(
          options || {},
        )}`
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

  // Watch-mode rebuild: re-run every registered page from its original
  // options so edited models and controllers take effect (v1 only re-rendered
  // templates with stale options). The build dir is never emptied here; stale
  // outputs are removed file by file once the rebuild has finished.
  /** @private */
  async _replay() {
    // Let any in-flight work finish before the reset below: a page chain (or a
    // single-page rebuild) still running would otherwise land in the *new*
    // stack and make the replay's own page lose the buildTo dedupe, stranding
    // the previous build's output. Replays never overlap each other — the
    // rebuild queue serialises them.
    await Promise.allSettled([...this._promises, ...this._generating])

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
        ...this._unswept,
        ...this._stack
          .filter((entry) => entry.page.options.generate !== false)
          .map((entry) => entry.buildTo),
      ]),
    ]
    this._unswept = []
    this._stack = []
    // The stack is gone, so is everything the graph knew about it; every page
    // re-records itself as the replay renders it.
    this._graph.clear()
    this._promises = []
    this._generating = []
    this._failures = []
    this._failuresReported = false
    // The rebuild is its own build: it gets its own report, and `report()`
    // hands out the newest one rather than the one the first build settled.
    // `_startedAt` moves with it, or a watch session's tenth rebuild would
    // report the hours since the process started as its duration.
    this._report = null
    // The stack is new, so every id resolved against the old one is gone with
    // it — and the rebuild says its own collisions out loud rather than
    // inheriting the first build's "already said that".
    this._idIndex = null
    this._idNoticed = new Set()
    this._sitemapPath = null
    this._llmsPath = null
    // The rebuild's own verdict on the same three keys: a scan, a redirects
    // file and a feed from the last build would otherwise be reported as this
    // one's. `_feedRequest` is *not* reset — like `_sitemapRequest` and
    // `_llmsRequest` it is the standing request a replay re-issues, and that
    // re-issue is `lib/feed.js`'s to add beside the `llms` one below.
    this._feedPath = null
    this._links = null
    this._redirectsPath = null
    this._redirectsResult = null
    // The write itself is per-build, not per-instance: without this reset the
    // first build's latched promise would stand and the replay would publish a
    // build with no `_redirects` in it at all.
    this._redirectsRun = null
    this._startedAt = Date.now()
    this._callbacks = []
    this._assetQueue = Promise.resolve()
    this._pipelineResults = []

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
      if (this.config.assets.pipeline.length > 0) {
        this._queuePipeline()
        this.copyAssets(this.config.folders.assets, this.config.folders.build)
      }
      this.registerPartials()

      // A page scan() discovered is only as real as its file: once the view is
      // deleted the registration goes with it, so its output falls to the orphan
      // sweep below instead of every later replay failing on the missing view.
      // A page registered by name stays — the author asked for it, and silently
      // dropping it would hide a typo.
      this._registrations = this._registrations.filter((registration) => {
        if (!this._scanned.has(registration)) return true
        if (fs.existsSync(`${this.config.folders.pages}/${registration.view}`))
          return true
        this.logger.notice('Removed page:', registration.view)
        return false
      })

      // Snapshot before the re-scan below, which registers *and* queues each
      // new page itself: replaying the post-scan list would queue those a
      // second time and lose them to `_preparePage`'s buildTo dedupe.
      const registered = [...this._registrations]

      // A page file created since the last scan belongs to no registration, so
      // only scanning again can find it. `_replaying` is still false here, so
      // `page()` records what it finds as a new (scanned) registration, which
      // every later replay then replays like any other.
      if (this._scanRequested) this.scan()

      this._replaying = true
      try {
        for (const options of registered) this.page({ ...options })
      } finally {
        this._replaying = false
      }
      // The whole site is queued from here on, so an empty slot in the new
      // stack means the page is gone rather than that the replay never got
      // to it — which is exactly what the sweep reads it as.
      requeued = true
      this.generate()
      if (this._sitemapRequest) {
        this.sitemap(
          this._sitemapRequest.options,
          this._sitemapRequest.callback,
        )
      }
      if (this._llmsRequest) {
        this.llms(this._llmsRequest.options, this._llmsRequest.callback)
      }
      if (this._feedRequest) {
        this.feed(this._feedRequest.options, this._feedRequest.callback)
      }
      await this.complete()
    } finally {
      // A replay that threw before re-queuing has an empty stack because it
      // failed, not because the site shrank: sweeping against it would delete
      // the whole build. Hold the paths for the next replay instead.
      if (!requeued) this._unswept = previous
      else {
        const current = new Set(
          this._stack
            .filter((entry) => entry.page.options.generate !== false)
            .map((entry) => entry.buildTo),
        )
        for (const file of previous) {
          if (current.has(file)) continue
          await fs.remove(file)
          // The dev-mode debug sibling, same trailing-extension swap as
          // KissPage. Guarded: a currently registered page can build to that
          // exact path (e.g. an `ext: 'json'` page), and its output must never
          // be deleted.
          const sibling = file.replace(/\.[^.]+$/, '.json')
          if (!current.has(sibling)) await fs.remove(sibling)
          this.logger.info('Removed stale output:', file)
        }
      }
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
  /** @private */
  _requestReplay() {
    this._pendingReplay = true
    // A replay rebuilds everything, so it supersedes every scoped target.
    this._pendingTargets.clear()
    return this._runRebuildQueue()
  }

  // Scoped rebuild: re-render just these stack entries. A no-op while a replay
  // is pending — that replay already covers them.
  /** @private */
  _requestRebuild(entries) {
    if (!this._pendingReplay)
      for (const entry of entries) this._pendingTargets.add(entry)
    return this._runRebuildQueue()
  }

  /** @private */
  _runRebuildQueue() {
    if (this._rebuildInFlight) return this._rebuildInFlight
    if (this._closing) return Promise.resolve()
    const replay = this._pendingReplay
    const targets = [...this._pendingTargets]
    if (!replay && targets.length === 0) return Promise.resolve()
    this._pendingReplay = false
    this._pendingTargets.clear()
    this._rebuildInFlight = (replay ? this._replay() : this._rebuild(targets))
      .catch((err) => {
        this.logger.error('Error rebuilding site', err.message)
        this.logger.warn(err)
      })
      .finally(() => {
        this._rebuildInFlight = null
        // One reload for the whole rebuild, and only now: a replay's orphan
        // sweep has run, so the browser cannot fetch a page still being
        // written or one about to be removed.
        this._reload()
        // Deliberately not returned: the follow-up must not be chained into
        // the promise this run's requesters are holding.
        this._runRebuildQueue()
      })
    return this._rebuildInFlight
  }

  // Tracked on `_generating` like a watcher single-page rebuild, so a later
  // replay's allSettled waits for it and complete() drains it.
  /** @private */
  async _rebuild(entries) {
    // A target queued before a replay belongs to the stack that replay
    // discarded: re-rendering it would write from options nothing holds any
    // more. Expected, so not logged.
    const live = entries.filter((entry) => this._stack.includes(entry))
    const runs = live.map((entry) => entry.page.generate().catch(() => {}))
    this._generating.push(...runs)
    await Promise.all(runs)
  }

  // The watch dispatch: the watcher forwards every event under `src`, and this
  // decides what it means. A whole-site replay is the default and the fallback;
  // only two cases are scoped, and both are provably narrower than a replay.
  /** @private */
  _handleChange(event, changedPath) {
    const changed = utils.posixPath(changedPath)
    const pagesDir = utils.posixPath(this.config.folders.pages)
    const inside = (dir) => !!dir && isInside(dir)(changed)
    const replay = () => {
      this.logger.notice('Rebuilding site:')
      return this._requestReplay()
    }

    // A file or folder that did not exist has no stack entry to re-render:
    // only a replay can register it (a new partial or layout) or sweep the
    // site around it.
    if (event === 'add' || event === 'addDir') {
      this.logger.info(`${event}: ${changed}: `)
      return replay()
    }
    const inPages = changed.startsWith(`${pagesDir}/`)
    // A deleted page view cannot be re-rendered on its own: only a full
    // replay can drop its stack entry and sweep the stale output.
    if (event === 'unlink' && inPages) {
      this.logger.info(`${event}: ${changed}: `)
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
      (inside(this.config.folders.partials) ||
        inside(this.config.folders.layouts))
    ) {
      // Whether a rebuild already in flight read this file before or after the
      // edit landed is a race nobody can reason about, so it is upgraded to a
      // replay rather than scoped.
      if (this._rebuildInFlight) return replay()
      this.registerPartials()
      const name = partialNameFor(changed, this.config.folders)
      const dependents = name ? this._graph.dependentsOf(name) : null
      // Never seen: nothing has rendered it yet — a page that failed before
      // reaching it included. Every page is the safe answer, and the notice is
      // what turns a slow-but-correct rebuild into a fixable gap.
      if (dependents === null) {
        this.logger.notice(
          `No page has rendered ${changed} yet: re-rendering every page`,
        )
        this.logger.info(`${event}: ${changed}: `, this._stack.length)
        return this._requestRebuild(this._stack)
      }
      const wanted = new Set(dependents)
      const entries = this._stack.filter((entry) => wanted.has(entry.buildTo))
      this.logger.info(`${event}: ${changed}: `, entries.length)
      entries.forEach((m) => this.logger.info('Rebuilding:', m.page.view))
      return this._requestRebuild(entries)
    }
    const lookup = inPages ? changed.slice(pagesDir.length + 1) : changed
    const matches = this._stack.filter((e) => e.view === lookup)
    this.logger.info(`${event}: ${changed}: `, matches.length)
    // Anything with no stack entry of its own — a model, a controller, an
    // unknown file — can affect any page, so it takes the replay.
    if (matches.length === 0) return replay()
    matches.forEach((m) => this.logger.info('Rebuilding:', m.page.view))
    return this._requestRebuild(matches)
  }

  /**
   * Starts the file watcher (once). Only meaningful with `dev: true`, which
   * also starts the dev server. Started for you in dev mode.
   *
   * @param {WatchOptions} [options]
   * @returns {this}
   */
  watch({ entry = process.argv[1] } = {}) {
    if (this._watcher) return this
    this._watcher = createWatcher({
      config: this.config,
      entry,
      rebuildSite: () => {
        this.logger.notice('Rebuilding site:')
        this._requestReplay()
      },
      onChange: (event, p) => this._handleChange(event, p),
      assetsChanged: (changed) => {
        this.copyAssets(this.config.folders.assets, this.config.folders.build)
        // Read after the call above, so it is that copy's own promise.
        // copyAssets always resolves, and neither _reload nor the rebuild
        // queue can throw, so nothing here is left unhandled.
        this._assetQueue.then(() => {
          const built = this._builtAssetPath(changed)
          // A renamed asset lands under a new filename, so every page linking
          // it now points at a file that no longer exists: the pages have to be
          // re-rendered, and the queue reloads the browser once they are. Only
          // the files the policy renames need that — everything else keeps its
          // name, so it keeps the cheaper live-reload swap.
          if (this.config.assets.hash && isHashable(built))
            return this._requestRebuild(this._stack)
          this._reload(built)
        })
      },
      logger: this.logger,
    })
    return this
  }

  // Where an edited asset lands in the build folder. Naming the built file is
  // what lets livereload swap a stylesheet in place instead of reloading the
  // page; sass compiles to .css beside where its source sat.
  /** @private */
  _builtAssetPath(changed) {
    const { assets, build } = this.config.folders
    // With no assets folder nothing was copied, so there is nothing to name.
    if (!assets || !build) return '/'
    const plain = path.resolve(build, path.relative(assets, changed))
    const built = /\.(scss|sass)$/i.test(plain)
      ? plain.replace(/\.[^.]+$/, '.css')
      : plain
    // Under a renaming policy the file on disk carries a content hash, so the
    // plain name would send livereload after a file that is not there.
    const emitted = this._assetManifest.lookup(
      utils.posixPath(path.relative(path.resolve(build), built)),
    )
    return emitted ? path.resolve(build, emitted) : built
  }

  // Live reload is driven from here, once per settled build, because nothing
  // watches the build folder (see AIKB/dev-server.md). A live-reload socket
  // that has gone away must never fail the rebuild that called this.
  /** @private */
  _reload(changed = '/') {
    if (!this._devServer) return
    try {
      this._devServer.refresh(changed)
    } catch (err) {
      this.logger.debug(err.stack)
    }
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
      await fs.remove(this._stagingDir).catch((err) => {
        this.logger.debug(err.stack)
      })
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
