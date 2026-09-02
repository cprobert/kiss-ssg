import fs from 'fs-extra'
import glob from 'glob'
import path from 'node:path'
import Handlebars from 'handlebars' // https://handlebarsjs.com/
import layouts from 'handlebars-layouts' // https://www.npmjs.com/package/handlebars-layouts
import { Remarkable } from 'remarkable'
import utils from './lib/utils.js'
import { createLogger } from './lib/logger.js'
import { resolveConfig, foldersToEnsure } from './lib/config.js'
import { registerHandlebarsHelpers } from './lib/handlebars-helpers.js'
import { registerPartials } from './lib/partials.js'
import { copyAssets } from './lib/assets.js'
import { resolveModel } from './lib/model-resolver.js'
import { applyController } from './lib/controller-resolver.js'
import { writeSitemap } from './lib/sitemap.js'
import { KissPage } from './lib/kiss-page.js'
import { startDevServer } from './lib/dev-server.js'
import { createWatcher } from './lib/watcher.js'

class Kiss {
  _stack = []
  _promises = []
  _generating = []
  _watcher = null
  _devServer = null

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
          { logger: this.logger },
        )
        this._devServer.ready.catch((err) => {
          this.logger.error('Error running live reload server')
          this.logger.plain(err.message)
        })
      } catch (error) {
        this.logger.error('Error running live reload server')
        this.logger.plain(error.message)
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

  registerPartials() {
    return registerPartials(this.handlebars, this.config, {
      markdown: this.remarkable,
      logger: this.logger,
    })
  }

  copyAssets(sourceDir, targetDir) {
    this._promises.push(
      copyAssets(sourceDir, targetDir, {
        config: this.config,
        logger: this.logger,
      }),
    )
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
    kissPage.extLess = this.config.extensionLess

    const preparedPage = kissPage.prepare()
    const buildTo = preparedPage.buildTo
    if (this._stack.some((entry) => entry.buildTo === buildTo)) {
      this.logger.error('Page already processed', buildTo)
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

  async _prepareMultiplePages(options, data) {
    let i = 1
    const slug = options.slug ? options.slug : options.view.replace('.hbs', '')
    if (Array.isArray(data)) {
      for (const model of data) {
        options.slug = slug + '-' + i
        options.model = model
        options = await applyController(options, {
          controllersDir: this.config.folders.controllers,
          logger: this.logger,
        })
        this._preparePage(options)
        i++
      }
    } else {
      this.logger.error('Data in dynamic model must be an array')
    }
  }

  page(options, callback) {
    if (!options.view) {
      this.logger.error('No view specified', options)
      return this
    }
    options.config = this.config // Map the global kiss config to the page config

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

    // Detect all the different types of model options and process appropriately.
    // The whole chain (model -> controller -> prepared page) is tracked, and it
    // never rejects: failures resolve to { id, data: null, error }.
    const chain = resolveModel(options.model, {
      modelsDir: this.config.folders.models,
      logger: this.logger,
    })
      .then(async (response) => {
        if (options.dynamic) {
          await this._prepareMultiplePages(options, response.data)
        } else {
          options.model = response.data
          options = await applyController(options, {
            controllersDir: this.config.folders.controllers,
            logger: this.logger,
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
              options.slug = 'snippet-' + Math.floor(Math.random() * 1000000000)
              this.logger.error(
                'A string view had been provided without an accompanying slug',
              )
              this.logger.info(`generating random slug: ${options.slug}`)
            }
          }

          if (!options.path) {
            options.path = options.view.substring(
              0,
              options.view.lastIndexOf('/'),
            )
          }

          this._preparePage(options)
        }
        return response
      })
      .catch((error) => {
        // If there was any issues processing the model let the user know
        this.logger.error(error.message || error)
        if (error.error) this.logger.error(error.error)
        return {
          id: typeof options.model === 'string' ? options.model : undefined,
          data: null,
          error,
        }
      })
    this._promises.push(chain)

    // Facilitate chaining
    return this
  }

  pages(options, callback) {
    options.dynamic = true
    this.page(options, callback)
    return this
  }

  scan() {
    const pages = glob.sync(`${this.config.folders.pages}/**/*.hbs`)
    pages.forEach((pagePath) => {
      const view = pagePath.replace(
        new RegExp(`^${this.config.folders.pages}/`, 'g'),
        '',
      )

      const viewInStack = this._stack.filter((p) => {
        return p.view == view
      })

      if (viewInStack.length === 0) {
        this.logger.info(`Auto added:`, view)
        const options = {
          view: view,
        }
        this.page(options)
      }
    })
    return this
  }

  viewStats() {
    if (this.verbose) {
      fs.outputJson(
        `${this.config.folders.build}/debug.json`,
        this._stack,
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
  // runs) has settled, re-checking because callbacks can queue more work.
  async _drain() {
    let seen = -1
    while (seen !== this._promises.length + this._generating.length) {
      seen = this._promises.length + this._generating.length
      await Promise.all([...this._promises, ...this._generating])
    }
  }

  generate(callback) {
    const run = Promise.all(this._promises)
      .then(async (data) => {
        const pending = []
        this._stack.forEach((entry) => {
          if (entry.runCount === 0) pending.push(entry.page.generate())
          entry.runCount++
        })
        await Promise.all(pending)
        if (callback) callback.call(this, data)
      })
      .catch((err) => {
        this.logger.error('Error generating site')
        this.logger.error(err)
      })
    this._generating.push(run)
    return this
  }

  complete(callback) {
    return this._drain().then(async () => {
      const data = await Promise.all(this._promises)
      if (callback) callback.call(this, data)
      return data
    })
  }

  sitemap(options, callback) {
    const overwrite = !options || options.overwrite !== false
    const run = Promise.all(this._promises)
      .then(async () => {
        const { status, urls } = await writeSitemap(this._stack, {
          config: this.config,
          logger: this.logger,
          overwrite,
        })
        if (status === 'no-site-url') return
        if (callback) callback.call(this, urls)
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

  watch({ entry = process.argv[1] } = {}) {
    if (this._watcher) return this
    const rebuildSite = () => {
      this.logger.notice('Rebuilding site:')
      this.registerPartials()
      this._stack.forEach((stackEntry) => stackEntry.page.generate())
    }
    this._watcher = createWatcher({
      config: this.config,
      getStack: () => this._stack,
      entry,
      rebuildSite,
      rebuildPage: (stackEntry) => stackEntry.page.generate(),
      assetsChanged: () =>
        this.copyAssets(this.config.folders.assets, this.config.folders.build),
      logger: this.logger,
    })
    return this
  }

  async close() {
    if (this._watcher) await this._watcher.close()
    this._watcher = null
    if (this._devServer) await this._devServer.close()
    this._devServer = null
  }
}

export default Kiss
export { Kiss as 'module.exports' }
export { utils }
