const fs = require('fs')
const glob = require('glob')
const rimraf = require('rimraf')
const ncp = require('ncp').ncp // https://www.npmjs.com/package/ncp
const chokidar = require('chokidar')
const path = require('path')
const pretty = require('pretty')
const minify = require('html-minifier').minify // https://www.npmjs.com/package/html-minifier
const colors = require('colors')
const fetch = require('node-fetch')
const handlebars = require('handlebars') // https://handlebarsjs.com/
const layouts = require('handlebars-layouts') // https://www.npmjs.com/package/handlebars-layouts
handlebars.registerHelper(layouts(handlebars))

const { Remarkable } = require('remarkable')
const { createCipher } = require('crypto')
var md = new Remarkable({
  html: true, // Enable HTML tags in source
  xhtmlOut: false, // Use '/' to close single tags (<br />)
  breaks: false, // Convert '\n' in paragraphs into <br>
})
handlebars.registerHelper('markdown', function (obj) {
  let returnVal = ''
  if (typeof obj === 'object') {
    returnVal = obj.fn(this)
  } else if (typeof obj === 'string') {
    returnVal = obj
  } else {
    console.error('Unexpected object in the bagging area!'.red)
  }
  // return new handlebars.SafeString(md.render(returnVal))
  return md.render(returnVal)
})

handlebars.registerHelper('stringify', function (obj) {
  return JSON.stringify(obj, null, 3)
})

const utils = {
  toSlug(slug) {
    return slug
      .toLowerCase()
      .trim()
      .replace(/[\W_]+/g, '-')
  },
  toTitleCase(str) {
    return str
      .toLowerCase()
      .split(' ')
      .map(function (word) {
        return word.charAt(0).toUpperCase() + word.slice(1)
      })
      .join(' ')
  },
  trimPath(path) {
    if (path.startsWith('/')) path = path.substring(1, path.length)
    if (path.endsWith('/')) path = path.substring(0, path.length - 1)
    return path
  },
  sanitizePath(path) {
    if (path) {
      path = this.trimPath(path)

      let pathSegments = path.split('/')
      const cleanedSegments = []
      pathSegments.forEach((segment) => {
        const slugifiedSegment = this.toSlug(segment)
        cleanedSegments.push(slugifiedSegment.trim())
      })
      path = cleanedSegments.join('/')
    }
    return path
  },
}

class KissPage {
  _path = ''
  _slug = 'index'
  _ext = 'html'
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

  get buildTo() {
    if (this._path) {
      return `${this.buildDir}/${this._path}/${this.slug}.${this._ext}`
    }
    return `${this.buildDir}/${this.slug}.${this._ext}`
  }

  set isDev(dev) {
    this._dev = !!dev
  }
  set debug(dev) {
    this._debug = !!dev
  }

  prepare() {
    if (this._path) {
      const filePath = `${this.buildDir}/${this._path}`
      if (!fs.existsSync(filePath)) {
        fs.mkdirSync(filePath, { recursive: true })
      }
    }
    this.options = {
      ...{
        title: this._title,
        path: this._path,
        slug: this._slug,
      },
      ...this.options,
    }
    return this
  }

  generate() {
    const template = this._getTemplate(this.view)
    if (template) {
      try {
        const output = template(this.options)
        console.log(this.buildTo.green)
        let formattedOutput = pretty(output)
        if (this._dev) {
          const liveReload = `<script src="http://localhost:35729/livereload.js?snipver=1"></script>`
          formattedOutput = formattedOutput.replace(
            '</body>',
            liveReload + '</body>'
          )
        } else {
          // console.debug('Minifying output')
          formattedOutput = minify(output, {
            collapseWhitespace: true,
            conservativeCollapse: true,
            removeComments: true,
            removeEmptyAttributes: true,
            minifyCSS: true,
            minifyJS: true,
          })
        }

        fs.writeFileSync(this.buildTo, formattedOutput)
        if (this.options && this._debug) {
          fs.writeFileSync(
            this.buildTo.replace(this._ext, '.json'),
            JSON.stringify(this.options, null, 1)
          )
        }
      } catch (error) {
        console.log(`Error processing view ${this.view}`.red)
        console.error(colors.yellow(error.message))
        if (this._debug) console.debug(colors.grey(error))
      }
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

  _state = {
    views: [],
    models: [],
    promises: [],
  }

  _setupFolders() {
    // console.log('folders: '.grey, this.config.folders)
    this._fileSystem.mkDir(this.config.folders.src)
    this._fileSystem.mkDir(this.config.folders.assets)
    this._fileSystem.mkDir(this.config.folders.layouts)
    this._fileSystem.mkDir(this.config.folders.pages)
    this._fileSystem.mkDir(this.config.folders.pages)
    this._fileSystem.mkDir(this.config.folders.partials)
    this._fileSystem.mkDir(this.config.folders.models)
    this._fileSystem.mkDir(this.config.folders.controllers)

    //console.debug('cleanBuild: ', this.config.cleanBuild)
    if (this.config.cleanBuild) {
      try {
        rimraf.sync(this.config.folders.build + '/*')
      } catch (err) {
        console.error(colors.red(err.message))
      }
    }
    this._fileSystem.mkDir(this.config.folders.build)
  }

  constructor(config) {
    console.log('            Starting Kiss            \n'.zebra)
    // Setup defaults
    let folders = {
      src: './src',
      assets: './src/assets',
      layouts: './src/layouts',
      pages: './src/pages',
      partials: './src/partials',
      models: './src/models',
      controllers: './src/controllers',
      build: './public',
    }

    if (config.folders && config.folders.src) {
      // Set new base folder for all dependent subfolders
      if (this.verbose)
        console.log(`Setting base src folder to: ${config.folders.src}`.grey)

      folders = {
        src: config.folders.src,
        assets: `${config.folders.src}/assets`,
        layouts: `${config.folders.src}/layouts`,
        pages: `${config.folders.src}/pages`,
        partials: `${config.folders.src}/partials`,
        models: `${config.folders.src}/models`,
        controllers: `${config.folders.src}/controllers`,
        build: './public',
      }
    }
    folders = { ...folders, ...config.folders }
    this.config = {
      ...{
        dev: false,
        verbose: false,
        cleanBuild: true,
        noExt: false,
      },
      ...config,
    }
    this.config.folders = folders
    this.verbose = !!this.config.verbose

    if (this.verbose) {
      console.debug('config: '.grey, this.config)
    }

    this._setupFolders(config)

    this.copyAssets()
    this.loadPartials()

    console.log('Generating:'.grey)

    if (this.config.dev) {
      const kissServe = require('./kiss-serve')
      var publicDir = path.resolve(this.config.folders.build)
      try {
        kissServe(publicDir)
      } catch (error) {
        console.error('Error running live reload server'.red)
        console.log(error.message)
      }
      this.watch()
    }
  }

  loadPartials() {
    // partials
    this._registerPartials(this.config.folders.partials, 'html')
    this._registerPartials(this.config.folders.partials, 'md')
    this._registerPartials(this.config.folders.partials, 'hbs')
    // layouts
    this._registerPartials(this.config.folders.layouts)
  }

  copyAssets() {
    const self = this
    // Copy assets to build folder
    if (this.config.folders.assets) {
      ncp(this.config.folders.assets, this.config.folders.build, function (
        err
      ) {
        if (err) console.error('Error: '.red, err)
        const msg = `Copied ${self.config.folders.assets} to ${self.config.folders.build}`
        console.log(msg.grey)
      })
    }
  }

  _fileSystem = {
    mkDir(dir) {
      dir = dir.toLowerCase()
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    },
    exists(dir) {
      return fs.existsSync(dir)
    },
  }

  _readModel(file) {
    const model = `${this.config.folders.models}/${file}`
    if (this._fileSystem.exists(model)) {
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
        source = md.render(source)
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
          if (this._fileSystem.exists(controllerPath)) {
            const controller = require.main.require(controllerPath)
            options = this._controllerRun(options, controller)
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
          resolve({ id: this._state.models.length, data: model })
          break
        case 'undefined':
          resolve({ data: {} })
          break
        default:
          reject({ message: `Unexpected model type: ${typeof model}` })
      }
    })
    this._state.promises.push(p)
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
      if (
        this._fileSystem.exists(
          `${this.config.folders.models}/${matchingModel}`
        )
      ) {
        if (this.verbose)
          console.log('Found matching model: '.grey, matchingModel)
        options.model = matchingModel
      }
    }
    if (options.model) this._state.models.push(options.model)

    // See if we can auto map controller if one isn't specified
    if (!options.controller) {
      const matchingController = options.view.replace(/\.hbs$/, '.js')
      if (
        this._fileSystem.exists(
          `${this.config.folders.controllers}/${matchingController}`
        )
      ) {
        if (this.verbose)
          console.log('Found matching controller: '.grey, matchingController)
        options.controller = matchingController
      }
    }

    // Prevent views that have already been processed from being picked up be .scan()
    // Don't add to array if it's text - only add if its a file
    if (
      options.view.endsWith('.hbs') &&
      !this._state.views.includes(options.view)
    ) {
      this._state.views.push(options.view)
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
      if (!this._state.views.some((v) => v === view)) {
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

      fs.writeFileSync(
        `${this.config.folders.build}/debug.json`,
        JSON.stringify(this._stack, null, 1)
      )
    }

    console.log({
      views: this._state.views.length,
      models: this._state.models.length,
      promise: this._state.promises.length,
      stack: this._stack.length,
    })
    return this
  }

  generate(callback) {
    this.scan()

    Promise.all(this._state.promises).then((data) => {
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
    return Promise.all(this._state.promises).then((data) => {
      if (callback) callback.call(this, data)
    })
  }

  getModelByID(id, data) {
    const result = data.find((d) => d.id === id)
    if (result) return result.data
    return { error: 'No data found for: ' + id }
  }

  watch() {
    console.log(
      'Watching for file changes'.cyan,
      colors.grey(this.config.folders.src)
    )
    chokidar.watch(this.config.folders.src).on('all', (event, path) => {
      if (!event.includes('add')) {
        const pagesDir = this.config.folders.pages.replace(/^.\//, '')
        const reStart = new RegExp(`^${pagesDir}\/`, 'g')
        const lookup = path.replace(/\\/g, '/').replace(reStart, '')
        //console.log('lookup ', lookup)
        const results = this._stack.filter((p) => p.view === lookup)
        console.log(`${event}: ${path} - `.grey, results.length)
        if (results.length > 0) {
          results.forEach((result) => {
            // console.log('Rebuilding:'.grey, result.page.slug)
            result.page.generate()
          })
        } else {
          // If we can't identify a specific view rebuild the whole site
          console.log('Rebuilding site:'.cyan)
          this.loadPartials()
          this._stack.forEach((result) => {
            result.page.generate()
          })
        }
      }
    })
  }

  handlebars = handlebars
}

module.exports = Kiss
