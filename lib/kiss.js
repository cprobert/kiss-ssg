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
import { copyAssets } from './assets.js'
import { createAssetManifest, isHashable } from './asset-manifest.js'
import { resolveModel } from './model-resolver.js'
import { applyController } from './controller-resolver.js'
import { writeSitemap } from './sitemap.js'
import { KissPage } from './kiss-page.js'
import { startDevServer } from './dev-server.js'
import { createWatcher, isInside } from './watcher.js'

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
 * `failures`.
 *
 * @typedef {AggregateError & { failures: BuildFailure[] }} BuildError
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
  _watcher = null
  /** @private */
  _devServer = null
  /** @private */
  _assetQueue = Promise.resolve()
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
    this.remarkable = new Remarkable({
      html: true, // Enable HTML tags in source
      xhtmlOut: true, // Use '/' to close single tags (<br />)
      breaks: true, // Convert '\n' in paragraphs into <br>
    })

    this.logger.banner('            Starting Kiss            \n')
    this.logger.debug('config: ', this.config)

    this._setupFolders(config)

    this.copyAssets(this.config.folders.assets, this.config.folders.build)
    registerHandlebarsHelpers(this.handlebars, this.config, {
      markdown: this.remarkable,
      logger: this.logger,
      assets: this._assetManifest,
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
      { markdown: this.remarkable, logger: this.logger },
      this._partialNames,
    )
    return this._partialNames
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
    // still leaves the folder for close() to remove.
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

  /** @private */
  _preparePage(options) {
    const kissPage = new KissPage(options.view, {
      hbs: this.handlebars,
      logger: this.logger,
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
    if (this._stack.some((entry) => entry.buildTo === buildTo)) {
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
    const entry = {
      view: preparedPage.view,
      buildTo,
      page: preparedPage,
      runCount: 0,
    }
    this._stack.push(entry)
    return entry
  }

  /** @private */
  async _prepareMultiplePages(options, data, fresh = false) {
    let i = 1
    const slug = options.slug ? options.slug : options.view.replace('.hbs', '')
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
          const pageOptions = await applyController(
            {
              ...options,
              config: { ...options.config },
              slug: `${slug}-${i}`,
              model,
            },
            {
              controllersDir: this.config.folders.controllers,
              logger: this.logger,
              fresh,
            },
          )
          this._preparePage(pageOptions)
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
            await this._prepareMultiplePages(options, response.data, fresh)
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

            this._preparePage(options)
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
        if (this._failures.length > 0) {
          await this._discardStaging()
          if (!this._failuresReported) {
            this._failuresReported = true
            const failures = this._failures
            const err = new AggregateError(
              failures.map((f) => f.error),
              `${failures.length} page(s) failed to build: ${failures
                .map((f) => this._reportedPath(f.buildTo) ?? f.view)
                .join(', ')}`,
            )
            err.failures = failures
            throw err
          }
        } else {
          await this._promote()
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
    const previous = [
      ...new Set([
        ...this._unswept,
        ...this._stack.map((entry) => entry.buildTo),
      ]),
    ]
    this._unswept = []
    this._stack = []
    this._promises = []
    this._generating = []
    this._failures = []
    this._failuresReported = false
    this._callbacks = []
    this._assetQueue = Promise.resolve()

    // Everything from here to complete() is inside the sweep's try: a throw in
    // the re-registration half used to skip the finally entirely, losing
    // `previous` and stranding every stale output for the life of the process.
    let requeued = false
    try {
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
      await this.complete()
    } finally {
      // A replay that threw before re-queuing has an empty stack because it
      // failed, not because the site shrank: sweeping against it would delete
      // the whole build. Hold the paths for the next replay instead.
      if (!requeued) this._unswept = previous
      else {
        const current = new Set(this._stack.map((entry) => entry.buildTo))
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
      this.logger.info(`${event}: ${changed}: `, this._stack.length)
      // Whether a rebuild already in flight read this file before or after the
      // edit landed is a race nobody can reason about, so it is upgraded to a
      // replay rather than scoped.
      if (this._rebuildInFlight) return replay()
      this.registerPartials()
      return this._requestRebuild(this._stack)
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
