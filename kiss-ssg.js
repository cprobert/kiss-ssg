import fs from 'fs-extra'
import glob from 'glob'
import chokidar from 'chokidar'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { minify as htmlMinify } from 'html-minifier-terser' // https://www.npmjs.com/package/html-minifier-terser
import Handlebars from 'handlebars' // https://handlebarsjs.com/
import layouts from 'handlebars-layouts' // https://www.npmjs.com/package/handlebars-layouts
import { Remarkable } from 'remarkable'
import utils from './lib/utils.js'
import { createLogger } from './lib/logger.js'
import { resolveConfig, foldersToEnsure } from './lib/config.js'
import { registerHandlebarsHelpers } from './lib/handlebars-helpers.js'
import { registerPartials } from './lib/partials.js'
import { copyAssets } from './lib/assets.js'

class KissPage {
  _path = ''
  _slug = 'index'
  _ext = 'html'
  _extLess = false
  _buildTo = ''
  _title = 'Kiss page'
  _dev = false

  _debug = false
  view = null
  options = {}
  logger = createLogger()
  hbs = null // the owning Kiss instance's Handlebars environment

  // defaults
  buildDir = './public'
  pagesDir = './src/pages'

  constructor(view) {
    this.view = view
    this._title = utils.toTitleCase(this._slug)
  }

  set path(path) {
    if (path) {
      this._path = utils.sanitizePath(path)
    }
  }

  get slug() {
    return this._slug
  }

  set slug(slug) {
    if (slug) {
      this._slug = utils.toSlug(slug)
    }
  }

  set ext(extension) {
    if (extension) {
      this._ext = extension.replace('.', '')
    }
  }

  set extLess(val) {
    this._extLess = !!val
  }

  get buildTo() {
    return `${this.buildDir}/${this.pageURL()}`
  }

  pageURL() {
    // Fake extension less pages
    let pagePath
    if (this._extLess && this.slug !== 'index') {
      pagePath = `${this._path}/${this.slug}/index.${this._ext}`
    } else {
      pagePath = `${this._path}/${this.slug}.${this._ext}`
    }
    if (pagePath.startsWith('/')) pagePath = pagePath.replace(/^\//, '')
    return pagePath
  }

  set isDev(dev) {
    this._dev = !!dev
  }
  set debug(dev) {
    this._debug = !!dev
  }

  prepare() {
    this.options = {
      ...{
        title: this._title,
        path: this._path,
        slug: this._slug,
        generate: true,
      },
      ...this.options,
    }
    return this
  }

  async generate() {
    const template = this._getTemplate(this.view)
    if (template && this.options.generate) {
      try {
        this.options.pageURL = this.pageURL()
        let output = template(this.options)

        if (this._dev) {
          const liveReload = `\n<script src='http://localhost:35729/livereload.js?snipver=1'></script>`
          output = output.replace('</body>', liveReload + '\n</body>')
        }

        var minifiedHtml = await htmlMinify(output, {
          collapseWhitespace: !this._dev,
          conservativeCollapse: false,
          removeComments: true,
          removeEmptyAttributes: true,
          minifyCSS: !this._dev,
          minifyJS: !this._dev,
        })

        try {
          await fs.outputFile(this.buildTo, minifiedHtml)
        } catch (err) {
          this.logger.error(`Error creating ${this.buildTo}`)
          this.logger.error(err)
        }

        if (this.options && this._dev) {
          try {
            await fs.outputJson(
              this.buildTo.replace(this._ext, 'json'),
              this.options,
              { spaces: 2 },
            )
          } catch (err) {
            this.logger.error(`Error creating ${this.buildTo}`)
            this.logger.error(err)
          }
        }
      } catch (error) {
        this.logger.error(`Error processing view ${this.view}`)
        this.logger.error(error.message)
        if (this._debug) this.logger.debug(error)
      }
    } else {
      this.logger.info('Skipping page generation: ', this.view)
    }
    return this.buildTo
  }

  _getTemplate(view) {
    let viewText = view
    if (view.endsWith('.hbs')) {
      let viewPath = `${this.pagesDir}/${view}`
      try {
        viewText = fs.readFileSync(viewPath, 'utf8')
      } catch (error) {
        this.logger.error('Error reading view: ', viewPath)
        this.logger.error(error.message)
      }
    }

    try {
      return this.hbs.compile(viewText)
    } catch (error) {
      this.logger.error('Error rendering view: ')
      this.logger.error(error.message)
    }
    return null
  }
}

class Kiss {
  _stack = []
  _promises = []
  _generating = []

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
      const publicDir = path.resolve(this.config.folders.build)
      import('./kiss-serve.js')
        .then(({ default: kissServe }) =>
          kissServe(publicDir, this.config.port, this.logger),
        )
        .catch((error) => {
          this.logger.error('Error running live reload server')
          this.logger.plain(error.message)
        })
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

  _readModel(file) {
    const model = `${this.config.folders.models}/${file}`
    if (fs.existsSync(model)) {
      return JSON.parse(fs.readFileSync(model, 'utf8'))
    }
    this.logger.error('Can not find model on file system', model)
    return null
  }

  _controllerRun(options, controller) {
    if (typeof controller === 'function') {
      try {
        let mappedOptions = controller(options)
        options = {
          ...options,
          ...mappedOptions,
        }
      } catch (err) {
        this.logger.error(`Error in controller for ${options.view}`)
        this.logger.error(err)
      }
    } else {
      this.logger.error('Invalid controller - not a function')
    }
    return options
  }

  async _detectControllerType(options) {
    if (options.controller) {
      switch (typeof options.controller) {
        case 'string': {
          const controllerPath = path.resolve(
            `${this.config.folders.controllers}/${options.controller}`,
          )
          if (fs.existsSync(controllerPath)) {
            const mod = await import(pathToFileURL(controllerPath).href)
            options = this._controllerRun(options, mod.default ?? mod)
          } else {
            this.logger.error(`Failed to find "controller: ${controllerPath}`)
          }
          break
        }
        case 'function':
          options = this._controllerRun(options, options.controller)
          break
        default:
          this.logger.error(
            'Unknown controller type: ',
            options.controller,
            typeof options.controller,
          )
      }
    }
    // if the user didn't specify a title auto map title from model if it exists
    if (!options.title) {
      if (options.model && options.model.title) {
        options.title = options.model.title
      }
    }
    return options
  }

  _preparePage(options) {
    const kissPage = new KissPage(options.view)
    kissPage.options = options
    kissPage.logger = this.logger
    kissPage.hbs = this.handlebars
    kissPage.buildDir = this.config.folders.build
    kissPage.pagesDir = this.config.folders.pages
    kissPage.path = options.path
    kissPage.slug = options.slug
    if (options.ext) kissPage.ext = options.ext
    kissPage.debug = this.config.verbose
    kissPage.isDev = this.config.dev
    kissPage.extLess = this.config.extensionLess

    const preparedPage = kissPage.prepare()
    this._stack.push({
      view: preparedPage.view,
      buildTo: preparedPage.buildTo,
      page: preparedPage,
      runCount: 0,
    })
  }

  async _prepareMultiplePages(options, data) {
    let i = 1
    const slug = options.slug ? options.slug : options.view.replace('.hbs', '')
    if (Array.isArray(data)) {
      for (const model of data) {
        options.slug = slug + '-' + i
        options.model = model
        options = await this._detectControllerType(options)
        this._preparePage(options)
        i++
      }
    } else {
      this.logger.error('Data in dynamic model must be an array')
    }
  }

  _processPageModel(model) {
    const p = new Promise((resolve, reject) => {
      switch (typeof model) {
        case 'string':
          if (model.startsWith('http')) {
            fetch(model)
              .then((response) => response.json())
              .then((data) => {
                resolve({ id: model, data: data })
              })
              .catch((error) => {
                this.logger.error(`Error getting model from ${model}`)
                reject({ message: error.message, error: error })
              })
          } else if (model.endsWith('.json')) {
            const data = this._readModel(model)
            if (data) {
              resolve({ id: model, data: data })
            } else {
              reject({ message: `Skipping: ${model}` })
            }
          } else {
            // See if the model is a folder
            const returnModel = this._prepareModelsFromFolder(model)
            if (returnModel.length > 0) {
              resolve({ id: model, data: returnModel })
            } else {
              reject({ message: `Invalid model ${model}` })
            }
          }
          break
        case 'object':
          resolve({ id: utils.hashId(model), data: model })
          break
        case 'undefined':
          resolve({ data: {} })
          break
        default:
          reject({ message: `Unexpected model type: ${typeof model}` })
      }
    })
    return p
  }

  _prepareModelsFromFolder(folderModel) {
    const modelArray = []
    if (fs.existsSync(`${this.config.folders.models}/${folderModel}`)) {
      const modelPath = `${this.config.folders.models}/${folderModel}`
      if (fs.lstatSync(modelPath).isDirectory()) {
        const models = glob.sync(`${modelPath}/*.json`)
        models.forEach((model) => {
          const data = this._readModel(
            model.replace(`${this.config.folders.models}/`, ''),
          )
          if (data) modelArray.push(data)
        })
      }
    }
    return modelArray
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
    const chain = this._processPageModel(options.model)
      .then(async (response) => {
        if (options.dynamic) {
          await this._prepareMultiplePages(options, response.data)
        } else {
          options.model = response.data
          options = await this._detectControllerType(options)

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

          // Check if the page has been already generated
          let pathSlug = options.slug
          if (options.path && options.path !== '/')
            pathSlug = `${options.path}/${options.slug}`
          let pageToGenerate = `${this.config.folders.build}/${pathSlug}.html`
          const existingPage = this._stack.find(
            (p) => p.buildTo === pageToGenerate,
          )
          if (existingPage) {
            this.logger.error('Page already processed', pageToGenerate)
          } else {
            this._preparePage(options)
          }
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
    options = options || {}
    const overwrite = options.overwrite !== false

    const run = Promise.all(this._promises)
      .then(async () => {
        if (!this.config.siteUrl) {
          this.logger.error(
            'Cannot generate sitemap.xml: config.siteUrl is not set',
          )
          return
        }

        const buildDir = this.config.folders.build
        const sitemapPath = `${buildDir}/sitemap.xml`

        if (!overwrite && fs.existsSync(sitemapPath)) {
          this.logger.info('Skipping sitemap.xml: already exists')
          if (callback) callback.call(this, null)
          return
        }

        const baseUrl = this.config.siteUrl.replace(/\/$/, '')
        const now = new Date().toISOString()

        const urls = this._stack
          .filter((entry) => !entry.page.options.ignoreSitemap)
          .map((entry) => {
            const pageOptions = entry.page.options
            let urlPath = entry.buildTo.slice(buildDir.length)
            urlPath = urlPath.replace(/\.[^./]+$/, '')
            urlPath = urlPath.replace(/\/index$/, '') || '/'

            return {
              loc: `${baseUrl}${urlPath}`,
              lastmod: pageOptions.sitemapLastmod || now,
              priority: pageOptions.sitemapPriority || '1.00',
              changefreq: pageOptions.sitemapChangefreq,
            }
          })

        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        urls.forEach((url) => {
          xml += '  <url>\n'
          xml += `    <loc>${url.loc}</loc>\n`
          xml += `    <lastmod>${url.lastmod}</lastmod>\n`
          if (url.changefreq)
            xml += `    <changefreq>${url.changefreq}</changefreq>\n`
          xml += `    <priority>${url.priority}</priority>\n`
          xml += '  </url>\n'
        })
        xml += '</urlset>'

        await fs.outputFile(sitemapPath, xml)
        this.logger.success(sitemapPath)

        if (callback) callback.call(this, urls)
      })
      .catch((err) => {
        this.logger.error('Error creating sitemap.xml')
        this.logger.error(err)
      })
    this._generating.push(run)
    return this
  }

  getModelByID(id, data) {
    const result = data.find((d) => d.id === id)
    if (result) return result.data
    return { error: 'No data found for: ' + id }
  }

  watch() {
    const self = this
    self.logger.notice('Watching for file changes', self.config.folders.src)
    function rebuildSite() {
      self.logger.notice('Rebuilding site:')
      self.registerPartials()
      self._stack.forEach((result) => {
        result.page.generate()
      })
    }
    const entry = process.argv[1]
    if (entry) {
      chokidar.watch(entry).on('change', (path, stats) => {
        self.logger.notice(`Changed: ${path}: `)
        rebuildSite()
      })
    }

    let assetsDir = self.config.folders.assets
    if (!assetsDir) assetsDir = './src/assets'

    chokidar
      .watch(self.config.folders.src, {
        ignored: `${assetsDir}/*`,
      })
      .on('all', (event, path) => {
        if (!event.includes('add')) {
          const pagesDir = self.config.folders.pages.replace(/^.\//, '')
          const reStart = new RegExp(`^${pagesDir}\\/`, 'g')
          const lookup = path.replace(/\\/g, '/').replace(reStart, '')
          const results = self._stack.filter((p) => p.view === lookup)
          self.logger.info(`${event}: ${path}: `, results.length)
          if (results.length > 0) {
            results.forEach((result) => {
              self.logger.info('Rebuilding:', result.page.view)
              result.page.generate()
            })
          } else {
            // If we can't identify a specific view rebuild the whole site
            rebuildSite()
          }
        }
      })

    chokidar.watch(assetsDir).on('change', (path) => {
      self.logger.info('Asset changed: ', path)
      self.copyAssets(self.config.folders.assets, self.config.folders.build)
    })
  }
}

export default Kiss
export { Kiss as 'module.exports' }
export { utils }
