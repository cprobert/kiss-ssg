const md5 = require('md5')
const fs = require('fs-extra')
const glob = require('glob')
const sass = require('sass')
const chokidar = require('chokidar')
const path = require('path')
const htmlMinify = require('html-minifier').minify // https://www.npmjs.com/package/html-minifier
const colors = require('colors')
const fetch = require('node-fetch')
const handlebars = require('handlebars') // https://handlebarsjs.com/
const layouts = require('handlebars-layouts') // https://www.npmjs.com/package/handlebars-layouts
handlebars.registerHelper(layouts(handlebars))

const utils = require('./libs/utils.js')
console.log(typeof utils.trimLines)

const { Remarkable } = require('remarkable')
var remarkable = new Remarkable({
  html: true, // Enable HTML tags in source
  xhtmlOut: true, // Use '/' to close single tags (<br />)
  breaks: true, // Convert '\n' in paragraphs into <br>
})

function registerHandlebarsHelpers(config) {
  handlebars.registerHelper('markdown', function (obj) {
    let returnVal = ''
    if (typeof obj === 'object') {
      returnVal = obj.fn(this)
    } else if (typeof obj === 'string') {
      returnVal = obj
    } else if (typeof obj === 'undefined') {
      console.log('Undefined value passed to markdown helper:'.yellow)
    } else {
      console.error('Unexpected object in the bagging area!'.red)
      console.error(
        'Markdown helper has an unexpected object type of:'.yellow,
        typeof obj
      )
    }
    const md = remarkable.render(utils.trimLines(returnVal))
    return new handlebars.SafeString(md)
  })

  handlebars.registerHelper('sass', function (context, options) {
    // console.log('params: ', typeof options, options, context)
    let output = ''
    let outputStyle = 'expanded'
    if (!config.dev) outputStyle = 'compressed'

    if (typeof context === 'string') {
      const sassOutput = sass.renderSync({
        file: path.join(process.cwd(), context),
        includePaths: config.sass.includePaths,
        outputStyle: outputStyle,
      })
      output = `${output} \n${sassOutput.css}`
    }
    if (
      (typeof options === 'object' && options.fn) ||
      (typeof context === 'object' && context.fn)
    ) {
      let input = ''
      if (typeof options === 'undefined') {
        input = context.fn(this)
      } else {
        input = options.fn(this)
      }
      const sassOutput = sass.renderSync({
        data: input,
        includePaths: config.sass.includePaths,
      })
      output = `${output} \n${sassOutput.css}`
    }
    return new handlebars.SafeString(output)
  })

  handlebars.registerHelper('offset', function (index) {
    index++
    return index
  })

  handlebars.registerHelper('stringify', function (obj) {
    return JSON.stringify(obj, null, 3)
  })

  handlebars.registerHelper('isActive', function (pageOptions, options) {
    let context = { href: '', active: 'active', folderMatch: false }
    if (options && options.hash) {
      context = {
        ...context,
        ...options.hash,
      }
    }
    const activeClass = context.active
    context.active = ''
    // Sanitize page URLs, to match index.html to /
    let pageURL = pageOptions.pageURL
    pageURL = pageURL.substring(0, pageURL.lastIndexOf('.')) // Strip the extention
    pageURL = pageURL.replace(/index$/, '') // change /index to /

    context.pageURL = pageURL
    const noSlashHref = context.href.replace(/^\//, '')
    if (context.folderMatch) {
      if (pageURL.includes(noSlashHref)) {
        context.active = activeClass
      }
    } else {
      // console.log({
      //   optionsURL: pageOptions.pageURL,
      //   pageURL: pageURL,
      //   noSlashHref: noSlashHref,
      // })
      if (pageURL == noSlashHref) context.active = activeClass
    }

    return options.fn(context)
  })

  handlebars.registerHelper('env', function (options) {
    if (options.hash.is) {
      const envIs = options.hash.is.toLowerCase()
      if (envIs.includes('dev') && config.dev) {
        return options.fn(this)
      } else if (envIs.includes('prod') && !config.dev) {
        return options.fn(this)
      } else {
        return options.inverse(this)
      }
    } else {
      console.error(
        'Environment helper missing "is" property'.red,
        '{{#env}'.grey
      )
      return ''
    }
  })
}

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
      // console.debug('Set slug: '.gray, this._slug)
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
    let pagePath = ''
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

  generate() {
    const template = this._getTemplate(this.view)
    if (template && this.options.generate) {
      try {
        this.options.pageURL = this.pageURL()
        let output = template(this.options)

        if (this._dev) {
          const liveReload = `\n<script src='http://localhost:35729/livereload.js?snipver=1'></script>`
          output = output.replace('</body>', liveReload + '\n</body>')
        }

        var minifiedHtml = htmlMinify(output, {
          collapseWhitespace: !this._dev,
          conservativeCollapse: false,
          removeComments: true,
          removeEmptyAttributes: true,
          minifyCSS: !this._dev,
          minifyJS: !this._dev,
        })

        fs.outputFile(this.buildTo, minifiedHtml, (err) => {
          if (err) {
            console.error(`Error creating ${this.buildTo}`.red)
            console.error(colors.yellow(err))
          }
        })

        if (this.options && this._dev) {
          fs.outputJson(
            this.buildTo.replace(this._ext, 'json'),
            this.options,
            { spaces: 2 },
            (err) => {
              if (err) {
                console.error(`Error creating ${this.buildTo}`.red)
                console.error(colors.yellow(err))
              }
            }
          )
        }
      } catch (error) {
        console.log(`Error processing view ${this.view}`.red)
        console.error(colors.yellow(error.message))
        if (this._debug) console.debug(colors.grey(error))
      }
    } else {
      console.log('Skipping page generation: '.grey, this.view)
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
        console.log('Error reading view: '.red, viewPath)
        console.error(colors.yellow(error.message))
      }
    }

    try {
      return handlebars.compile(viewText)
    } catch (error) {
      console.log('Error rendering view: '.red)
      // console.debug(view)
      console.error(colors.yellow(error.message))
    }
    return null
  }
}

class Kiss {
  _stack = []
  _promises = []

  handlebars = handlebars
  remarkable = remarkable

  constructor(config) {
    console.log('            Starting Kiss            \n'.zebra)
    // Setup defaults
    let folders = {
      root: './',
      src: './src',
      pages: './src/pages',
      build: './public',
      assets: './src/assets',
      static: './src/static',
      layouts: './src/layouts',
      partials: './src/partials',
      models: './src/models',
      controllers: './src/controllers',
    }

    if (config.folders && config.folders.src) {
      // Set new base folder for all dependent subfolders
      if (this.verbose)
        console.log(`Setting base src folder to: ${config.folders.src}`.grey)

      folders.src = config.folders.src
      folders.assets = `${config.folders.src}/assets`
      folders.static = `${config.folders.src}/static`
      folders.layouts = `${config.folders.src}/layouts`
      folders.pages = `${config.folders.src}/pages`
      folders.partials = `${config.folders.src}/partials`
      folders.models = `${config.folders.src}/models`
      folders.controllers = `${config.folders.src}/controllers`
    }

    folders = { ...folders, ...config.folders }
    this.config = {
      ...{
        dev: false,
        verbose: false,
        cleanBuild: true,
        extensionLess: false,
        sass: {
          includePaths: [],
        },
        port: 3001,
      },
      ...config,
    }
    this.config.folders = folders
    this.verbose = !!this.config.verbose

    if (this.verbose) {
      console.debug('config: '.grey, this.config)
    }

    this._setupFolders(config)

    this.copyAssets(this.config.folders.assets, this.config.folders.build)
    registerHandlebarsHelpers(this.config)
    this.registerPartials()

    if (this.config.dev) {
      const kissServe = require('./kiss-serve')
      var publicDir = path.resolve(this.config.folders.build)
      try {
        kissServe(publicDir, this.config.port)
      } catch (error) {
        console.error('Error running live reload server'.red)
        console.log(error.message)
      }
      this.watch()
    }

    console.log('Generating:'.grey)
  }

  _setupFolders() {
    // console.log('folders: '.grey, this.config.folders)
    fs.ensureDirSync(this.config.folders.src)
    fs.ensureDirSync(this.config.folders.pages)
    fs.ensureDirSync(this.config.folders.build)

    if (this.config.folders.assets) fs.ensureDirSync(this.config.folders.assets)

    if (this.config.folders.assets)
      fs.ensureDirSync(this.config.folders.layouts)

    if (this.config.folders.assets)
      fs.ensureDirSync(this.config.folders.partials)

    if (this.config.folders.assets) fs.ensureDirSync(this.config.folders.models)

    if (this.config.folders.assets)
      fs.ensureDirSync(this.config.folders.controllers)

    //console.debug('cleanBuild: ', this.config.cleanBuild)
    if (this.config.cleanBuild) {
      try {
        // fs.removeSync(this.config.folders.build)
        fs.emptyDirSync(this.config.folders.build)
      } catch (err) {
        console.error(colors.red(err.message))
      }
    }
    fs.ensureDirSync(this.config.folders.build)
  }

  registerPartials() {
    console.log('Registering partials:'.gray)
    // partials
    this._registerPartials(this.config.folders.partials, 'html')
    this._registerPartials(this.config.folders.partials, 'md')
    this._registerPartials(this.config.folders.partials, 'hbs')
    // layouts
    this._registerPartials(this.config.folders.layouts)
  }

  copyAssets(sourceDir, targetDir) {
    const assetID = md5(`${sourceDir} - ${targetDir}`)

    const sassFiles = glob.sync(`${sourceDir}/**/*.+(scss|sass)`)
    sassFiles.forEach((sassFile) => {
      // console.debug('Processing: '.grey, sassFile)

      let cssFile = sassFile.replace(sourceDir, targetDir)
      cssFile = cssFile.substr(0, cssFile.lastIndexOf('.'))

      let outputStyle = 'expanded'
      if (!this.config.dev) {
        outputStyle = 'compressed'
      }

      try {
        const sassOutput = sass.renderSync({
          file: sassFile,
          includePaths: this.config.sass.includePaths,
          outputStyle: outputStyle,
        })

        fs.outputFile(`${cssFile}.css`, sassOutput.css, (err) => {
          if (err) {
            console.error('Error parsing sass file'.red)
            console.error(err)
          } else {
            console.log(`${cssFile}.css`.green)
          }
        })
      } catch (err) {
        console.error('Error parsing sass file: '.red, sassFile)
        console.error(err.message.yellow)
      }
    })

    const filterDynamicAssets = (src, dest) => {
      const ext = src.substring(src.lastIndexOf('.', src.length))
      switch (ext.toLowerCase()) {
        case '.scss':
        case '.sass':
          return false
        default:
          return true
      }
    }

    const p = new Promise((resolve, reject) => {
      if (sourceDir && targetDir) {
        fs.copy(
          sourceDir,
          targetDir,
          { filter: filterDynamicAssets },
          (err) => {
            if (err) {
              console.error(
                `Error copying assets (${sourceDir} => ${targetDir}): `.red
              )
              console.error(err)
            } else {
              const msg = `Copied assets: ${sourceDir} to ${targetDir}`
              console.log(msg.grey)
              resolve({ id: assetID, data: msg })
            }
          }
        )
      } else {
        resolve({ id: assetID, data: null })
      }
    })
    this._promises.push(p)
    return this
  }

  _readModel(file) {
    const model = `${this.config.folders.models}/${file}`
    if (fs.existsSync(model)) {
      return JSON.parse(fs.readFileSync(model, 'utf8'))
    }
    console.error('Can not find model on file system'.red, model)
    return null
  }

  _registerPartials(folder, ext) {
    //console.log(`Registering ${folder.replace(this.config.folders.src, '')}: `.grey)
    if (!ext) ext = 'hbs'
    const hbs = glob.sync(`${folder}/**/*.${ext}`)
    hbs.forEach((path) => {
      // console.debug('partial: '.grey, path)
      const reStart = new RegExp(`^${folder}`, 'g')
      const reEnd = new RegExp(`\.${ext}$`, 'g')
      let name = path.replace(reStart, '').replace(reEnd, '')

      if (name.startsWith('/')) {
        name = name.substring(1, name.length)
      }
      let source = fs.readFileSync(path, 'utf8')
      if (ext === 'md') {
        // console.debug('Rendering Markdown')
        source = remarkable.render(source)
      }

      handlebars.registerPartial(name, source)
      console.log(name.blue)
    })
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
        console.error(`Error in controller for ${options.view}`.red)
        console.error(colors.yellow(err))
      }
    } else {
      console.error('Invalid controller - not a function'.red)
    }
    return options
  }

  _detectControllerType(options) {
    if (options.controller) {
      switch (typeof options.controller) {
        case 'string':
          const controllerPath = `${this.config.folders.controllers}/${options.controller}`
          if (fs.existsSync(controllerPath)) {
            const controller = require.main.require(controllerPath)
            options = this._controllerRun(options, controller)
          } else {
            console.log(`Failed to find "controller: ${controllerPath}`.red)
          }
          break
        case 'function':
          options = this._controllerRun(options, options.controller)
          break
        default:
          console.error(
            'Unknown controller type: '.red,
            options.controller,
            typeof options.controller
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
    // console.debug('options:'.grey, options)

    const kissPage = new KissPage(options.view)
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
    this._stack.push({
      view: preparedPage.view,
      buildTo: preparedPage.buildTo,
      page: preparedPage,
      runCount: 0,
    })
  }

  _prepareMultiplePages(options, data) {
    let i = 1
    const slug = options.slug ? options.slug : options.view.replace('.hbs', '')
    if (Array.isArray(data)) {
      data.forEach((model) => {
        options.slug = slug + '-' + i
        options.model = model
        options = this._detectControllerType(options)
        this._preparePage(options)
        i++
      })
    } else {
      console.error('Data in dynamic model must be an array'.red)
    }
  }

  _processPageModel(model) {
    const p = new Promise((resolve, reject) => {
      switch (typeof model) {
        case 'string':
          // console.debug('Model is string'.grey)
          if (model.startsWith('http')) {
            fetch(model)
              .then((response) => response.json())
              .then((data) => {
                resolve({ id: model, data: data })
              })
              .catch((error) => {
                console.error(`Error getting model from ${model}`.red)
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
          // console.debug('Model is object'.grey)
          resolve({ id: md5(model), data: model })
          break
        case 'undefined':
          resolve({ data: {} })
          break
        default:
          reject({ message: `Unexpected model type: ${typeof model}` })
      }
    })
    this._promises.push(p)
    return p
  }

  _prepareModelsFromFolder(folderModel) {
    const modelArray = []
    if (fs.existsSync(`${this.config.folders.models}/${folderModel}`)) {
      const modelPath = `${this.config.folders.models}/${folderModel}`
      if (fs.lstatSync(modelPath).isDirectory()) {
        const models = glob.sync(`${modelPath}/*.json`)
        models.forEach((model) => {
          // console.debug(model.grey)
          const data = this._readModel(
            model.replace(`${this.config.folders.models}/`, '')
          )
          if (data) modelArray.push(data)
        })
      }
    }
    return modelArray
  }

  page(options, callback) {
    if (!options.view) {
      console.error('No view specified'.red, options)
      return this
    }
    // if (this.verbose) console.log('Processing view: '.grey, options.view)
    options.config = this.config // Map the global kiss config to the page config

    // Auto map model if one isn't specified
    if (!options.model) {
      const matchingModel = options.view.replace(/\.hbs$/, '.json')
      if (fs.existsSync(`${this.config.folders.models}/${matchingModel}`)) {
        if (this.verbose)
          console.log('Found matching model: '.grey, matchingModel)
        options.model = matchingModel
      }
    }

    // See if we can auto map controller if one isn't specified
    if (!options.controller) {
      const matchingController = options.view.replace(/\.hbs$/, '.js')
      if (
        fs.existsSync(
          `${this.config.folders.controllers}/${matchingController}`
        )
      ) {
        if (this.verbose)
          console.log('Found matching controller: '.grey, matchingController)
        options.controller = matchingController
      }
    }

    // Detect all the different types of model options and process appropriately
    this._processPageModel(options.model)
      .then((response) => {
        if (options.dynamic) {
          this._prepareMultiplePages(options, response.data)
        } else {
          options.model = response.data
          options = this._detectControllerType(options)

          if (!options.slug) {
            if (options.view.endsWith('.hbs')) {
              options.slug = utils.toSlug(
                options.view
                  .substring(
                    options.view.lastIndexOf('/') + 1,
                    options.view.length
                  )
                  .replace('.hbs', '')
              )
            } else {
              options.slug = 'snippet-' + Math.floor(Math.random() * 1000000000)
              console.log(
                'A string view had been provided without an accompanying slug'
                  .red
              )
              console.log(`generating random slug: ${options.slug}`.grey)
            }
          }

          if (!options.path) {
            options.path = options.view.substring(
              0,
              options.view.lastIndexOf('/')
            )
          }

          // Check if the page has been already generated
          let pathSlug = options.slug
          if (options.path && options.path !== '/')
            pathSlug = `${options.path}/${options.slug}`
          let pageToGenerate = `${this.config.folders.build}/${pathSlug}.html`
          // console.debug(pageToGenerate.magenta)
          const existingPage = this._stack.find(
            (p) => p.buildTo === pageToGenerate
          )
          if (existingPage) {
            console.log('Page already processed'.red, pageToGenerate)
          } else {
            this._preparePage(options)
          }
        }
      })
      .catch((error) => {
        // If there was any issues processing the model let the user know
        console.error(colors.red(error.message))
        if (error.error) {
          console.error(colors.yellow(error.error))
        }
      })

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
        ''
      )

      const viewInStack = this._stack.filter((p) => {
        return p.view == view
      })

      if (viewInStack.length === 0) {
        console.log(`Auto added:`.grey, view.blue)
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
      // this._stack.forEach((p) => {
      //   console.log(p.buildTo)
      // })

      fs.outputJson(
        `${this.config.folders.build}/debug.json`,
        this._stack,
        { spaces: 2 },
        (err) => {
          if (err) console.log(err)
        }
      )
    }

    console.log({
      promise: this._promises.length,
      stack: this._stack.length,
    })
    return this
  }

  generate(callback) {
    Promise.all(this._promises).then((data) => {
      let stack = this._stack
      stack.forEach(function (p, index) {
        if (p.runCount === 0) p.page.generate()
        stack[index].runCount++
      })
      this._stack = stack
      if (callback) callback.call(this, data)
    })
    return this
  }

  complete(callback) {
    return Promise.all(this._promises).then((data) => {
      if (callback) callback.call(this, data)
    })
  }

  getModelByID(id, data) {
    const result = data.find((d) => d.id === id)
    if (result) return result.data
    return { error: 'No data found for: ' + id }
  }

  watch() {
    const self = this
    console.log(
      'Watching for file changes'.cyan,
      colors.grey(self.config.folders.src)
    )
    function rebuildSite() {
      console.log('Rebuilding site:'.cyan)
      self.registerPartials()
      self._stack.forEach((result) => {
        result.page.generate()
      })
    }
    if (module.parent.filename) {
      // console.log('Caller: '.cyan, module.parent.filename)
      chokidar.watch(module.parent.filename).on('change', (path, stats) => {
        console.log(`Changed: ${path}: `.cyan)
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
          const reStart = new RegExp(`^${pagesDir}\/`, 'g')
          const lookup = path.replace(/\\/g, '/').replace(reStart, '')
          //console.log('lookup ', lookup)
          const results = self._stack.filter((p) => p.view === lookup)
          console.log(`${event}: ${path}: `.grey, results.length)
          if (results.length > 0) {
            results.forEach((result) => {
              console.log('Rebuilding:'.grey, result.page.view)
              result.page.generate()
            })
          } else {
            // If we can't identify a specific view rebuild the whole site
            rebuildSite()
          }
        }
      })

    chokidar.watch(assetsDir).on('change', (path) => {
      console.log('Asset changed: '.grey, path)
      self.copyAssets(self.config.folders.assets, self.config.folders.build)
    })
  }
}

module.exports = Kiss
