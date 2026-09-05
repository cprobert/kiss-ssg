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
import { resolveModel } from './model-resolver.js'
import { applyController } from './controller-resolver.js'
import { writeSitemap } from './sitemap.js'
import { KissPage } from './kiss-page.js'
import { startDevServer } from './dev-server.js'
import { createWatcher, isInside } from './watcher.js'

class Kiss {
  _stack = []
  _promises = []
  _generating = []
  // Promises returned by generate()/sitemap() callbacks, already given their
  // own catch by _runCallback, so _drain() can await them without rejecting.
  _callbacks = []
  // How many complete() calls are currently draining. A depth counter rather
  // than a flag: the two calls of the nested pattern can settle in either
  // order, and a saved-and-restored flag left the later one setting it back.
  _drainDepth = 0
  // Whether the caller has ever asked for a render pass. complete() finishes
  // an unfinished one; it never starts one that was never asked for.
  _generateRequested = false
  _registrations = []
  // Registrations scan() created, held by identity rather than by a key on the
  // registration itself: `_registrations` entries are spread into `page()` on
  // replay, so any own key would reach the render context and the dev-mode
  // `.json` sibling.
  _scanned = new WeakSet()
  _scanning = false
  _scanRequested = false
  _partialNames = []
  _failures = []
  // Whether this build's failures have already been reported by a complete()
  // call. Reset with `_failures`.
  _failuresReported = false
  _replaying = false
  // The rebuild queue: one in-flight slot, one pending slot. The pending slot
  // is a set of scoped targets plus a "replay" bit that supersedes them.
  _rebuildInFlight = null
  _pendingReplay = false
  _pendingTargets = new Set()
  _closing = false
  _sitemapRequest = null
  _watcher = null
  _devServer = null
  _assetQueue = Promise.resolve()

  constructor(config) {
    this.config = resolveConfig(config)
    this.logger =
      this.config.logger || createLogger({ verbose: this.config.verbose })
    this.verbose = !!this.config.verbose

    // Each Kiss owns its own Handlebars environment and Markdown renderer, so
    // partials and helpers never leak between instances.
    this.handlebars = Handlebars.create()
    this.handlebars.registerHelper(layouts(this.handlebars))
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
    })
    this.registerPartials()

    if (this.config.dev) {
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
        this._devServer.ready.catch((err) => {
          this.logger.error('Error running live reload server')
          this.logger.plain(err.message)
        })
      } catch (error) {
        this.logger.error('Error running live reload server')
        this.logger.plain(error.message)
        this.logger.debug(error.stack)
      }
      this.watch()
    }

    this.logger.info('Generating:')
  }

  _setupFolders() {
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

  // The names the last pass registered, so the next one can unregister whatever
  // has since left disk — Handlebars keeps a registration forever otherwise.
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
  copyAssets(sourceDir, targetDir) {
    const run = this._assetQueue.then(() =>
      copyAssets(sourceDir, targetDir, {
        config: this.config,
        logger: this.logger,
      }),
    )
    this._assetQueue = run
    this._promises.push(run)
    return this
  }

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

  async _prepareMultiplePages(options, data, fresh = false) {
    let i = 1
    const slug = options.slug ? options.slug : options.view.replace('.hbs', '')
    if (Array.isArray(data)) {
      for (const model of data) {
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
        i++
      }
    } else {
      this.logger.error('Data in dynamic model must be an array')
    }
  }

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

  pages(options) {
    options.dynamic = true
    this.page(options)
    return this
  }

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
        if (this._failures.length > 0 && !this._failuresReported) {
          this._failuresReported = true
          const failures = this._failures
          const err = new AggregateError(
            failures.map((f) => f.error),
            `${failures.length} page(s) failed to build: ${failures
              .map((f) => f.buildTo ?? f.view)
              .join(', ')}`,
          )
          err.failures = failures
          throw err
        }
        const data = await Promise.all(this._promises)
        if (callback && this._failures.length === 0) callback.call(this, data)
        return data
      })
      .finally(() => {
        this._drainDepth--
      })
  }

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

  getModelByID(id, data) {
    const result = data.find((d) => d.id === id)
    if (result) return result.data
    return { error: 'No data found for: ' + id }
  }

  // Watch-mode rebuild: re-run every registered page from its original
  // options so edited models and controllers take effect (v1 only re-rendered
  // templates with stale options). The build dir is never emptied here; stale
  // outputs are removed file by file once the rebuild has finished.
  async _replay() {
    // Let any in-flight work finish before the reset below: a page chain (or a
    // single-page rebuild) still running would otherwise land in the *new*
    // stack and make the replay's own page lose the buildTo dedupe, stranding
    // the previous build's output. Replays never overlap each other — the
    // rebuild queue serialises them.
    await Promise.allSettled([...this._promises, ...this._generating])

    // What the previous build wrote — anything not rebuilt is stale output and
    // gets removed below (the build dir itself is never cleaned on a replay).
    const previous = this._stack.map((entry) => entry.buildTo)
    this._stack = []
    this._promises = []
    this._generating = []
    this._failures = []
    this._failuresReported = false
    this._callbacks = []
    this._assetQueue = Promise.resolve()
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

    // Snapshot before the re-scan below, which registers *and* queues each new
    // page itself: replaying the post-scan list would queue those a second time
    // and lose them to `_preparePage`'s buildTo dedupe.
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
    this.generate()
    if (this._sitemapRequest) {
      this.sitemap(this._sitemapRequest.options, this._sitemapRequest.callback)
    }
    try {
      await this.complete()
    } finally {
      const current = new Set(this._stack.map((entry) => entry.buildTo))
      for (const file of previous) {
        if (current.has(file)) continue
        await fs.remove(file)
        // The dev-mode debug sibling, same trailing-extension swap as KissPage.
        // Guarded: a currently registered page can build to that exact path
        // (e.g. an `ext: 'json'` page), and its output must never be deleted.
        const sibling = file.replace(/\.[^.]+$/, '.json')
        if (!current.has(sibling)) await fs.remove(sibling)
        this.logger.info('Removed stale output:', file)
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
  _requestReplay() {
    this._pendingReplay = true
    // A replay rebuilds everything, so it supersedes every scoped target.
    this._pendingTargets.clear()
    return this._runRebuildQueue()
  }

  // Scoped rebuild: re-render just these stack entries. A no-op while a replay
  // is pending — that replay already covers them.
  _requestRebuild(entries) {
    if (!this._pendingReplay)
      for (const entry of entries) this._pendingTargets.add(entry)
    return this._runRebuildQueue()
  }

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
        // Deliberately not returned: the follow-up must not be chained into
        // the promise this run's requesters are holding.
        this._runRebuildQueue()
      })
    return this._rebuildInFlight
  }

  // Tracked on `_generating` like a watcher single-page rebuild, so a later
  // replay's allSettled waits for it and complete() drains it.
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
      assetsChanged: () =>
        this.copyAssets(this.config.folders.assets, this.config.folders.build),
      logger: this.logger,
    })
    return this
  }

  // Quiesce before tearing down: a caller that awaits close() must be able to
  // clean or deploy the build dir without racing a rebuild that is still
  // writing. Watchers go first so no new requests arrive, then the queue is
  // drained in a loop — the pending slot can start one more run before
  // `_closing` is seen. A closed instance stays closed.
  async close() {
    this._closing = true
    if (this._watcher) await this._watcher.close()
    this._watcher = null
    while (this._rebuildInFlight) await this._rebuildInFlight
    if (this._devServer) await this._devServer.close()
    this._devServer = null
  }
}

export default Kiss
export { Kiss as 'module.exports' }
export { utils }
