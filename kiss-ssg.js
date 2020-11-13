const fs = require('fs')
const glob = require('glob')
const rimraf = require('rimraf')
const ncp = require('ncp').ncp // https://www.npmjs.com/package/ncp
const pretty = require('pretty')
const minify = require('html-minifier').minify // https://www.npmjs.com/package/html-minifier
const colors = require('colors')
const fetch = require('node-fetch')
const handlebars = require('handlebars') // https://handlebarsjs.com/
const layouts = require('handlebars-layouts') // https://www.npmjs.com/package/handlebars-layouts
handlebars.registerHelper(layouts(handlebars))

const { Remarkable } = require('remarkable')
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

class KissPage {
  _path = ''
  _slug = 'index'
  _ext = 'html'
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

    // options.view, accepts both a file reference and a string thats the template
    if (!view.endsWith('.hbs')) {
      this._slug = 'snippet-' + Math.floor(Math.random() * 1000000000)
      console.log(
        'A string view had been provided without an accompanying slug'.red
      )
      console.log(`generating random slug: ${this._slug}`.grey)
    } else {
      this._slug = this._utils.toSlug(
        view
          .substring(view.lastIndexOf('/') + 1, view.length)
          .replace('.hbs', '')
      )
      this.path = view.substring(0, view.lastIndexOf('/'))
    }

    // console.debug('Auto path: ', this._path)
    this._title = this._utils.toTitleCase(this._slug)
  }

  set path(path) {
    if (path) {
      this._path = this._utils.sanitizePath(path)
    }
  }

  get slug() {
    return this._slug
  }
  set slug(slug) {
    if (slug) {
      this._slug = this._utils.toSlug(slug)
      // console.debug('Set slug: '.gray, this._slug)
    }
  }
  set ext(extension) {
    if (extension) {
      this._ext = extension.replace('.', '')
    }
  }

  set isDev(dev) {
    this._dev = !!dev
  }
  set debug(dev) {
    this._debug = !!dev
  }

  generate() {
    let filePath = this.buildDir
    let pageToGenerate = `${filePath}/${this.slug}.${this._ext}`

    if (this._path) {
      filePath = `${this.buildDir}/${this._path}`
      if (!fs.existsSync(filePath)) {
        fs.mkdirSync(filePath, { recursive: true })
      }
    }

    const template = this._getTemplate(this.view)
    if (template) {
      try {
        let options = {
          ...{
            title: this._title,
            path: this._path,
            slug: this._slug,
          },
          ...this.options,
        }
        const output = template(options)

        pageToGenerate = `${filePath}/${options.slug}.${this._ext}`
        console.log(pageToGenerate.green)
        let formattedOutput = pretty(output)
        if (!this._dev) {
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

        fs.writeFileSync(pageToGenerate, formattedOutput)
        if (options && this._debug) {
          fs.writeFileSync(
            pageToGenerate.replace(this._ext, '.json'),
            JSON.stringify(options, null, 1)
          )
        }
      } catch (error) {
        console.log(`Error processing view ${this.view}`.red)
        console.error(colors.yellow(error.message))
        //console.debug(colors.grey(error))
      }
    }

    return pageToGenerate
  }

  _utils = {
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
  _folders = {
    src: './src',
    assets: './src/assets',
    layouts: './src/layouts',
    pages: './src/pages',
    partials: './src/partials',
    models: './src/models',
    controllers: './src/controllers',
    build: './public',
  }

  _state = {
    views: [],
    models: [],
    pages: [],
    promises: [],
  }

  _setupFolders(config) {
    if (config.folders) {
      if (config.folders.src) {
        this._folders = {
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
      this._folders = { ...this._folders, ...config.folders }
    }
    config.folders = this._folders

    console.log('folders: '.grey, this._folders)
    this._fileSystem.mkDir(this._folders.src)
    this._fileSystem.mkDir(this._folders.assets)
    this._fileSystem.mkDir(this._folders.layouts)
    this._fileSystem.mkDir(this._folders.pages)
    this._fileSystem.mkDir(this._folders.pages)
    this._fileSystem.mkDir(this._folders.partials)
    this._fileSystem.mkDir(this._folders.models)
    this._fileSystem.mkDir(this._folders.controllers)

    console.debug('cleanBuild: ', this.config.cleanBuild)
    if (this.config.cleanBuild) {
      try {
        // rimraf.sync(this._folders.build)
        rimraf.sync(this._folders.build + '/*')
      } catch (err) {
        console.error(colors.red(err.message))
      }
    }
    this._fileSystem.mkDir(this._folders.build)
  }

  constructor(config) {
    const self = this
    console.log('            Starting Kiss            \n'.zebra)
    // Setup defaults
    if (!config) config = { dev: false, verbose: false, cleanBuild: true }
    if (typeof config.cleanBuild === 'undefined') config.cleanBuild = true

    this.config = config
    this.verbose = !!this.config.verbose

    if (this.verbose) {
      console.debug('Verbose: ', this.verbose)
      console.debug('config: '.grey, config)
    }

    this._setupFolders(config)
    ncp(this._folders.assets, this._folders.build, function (err) {
      if (err) console.error('Error: '.red, err)
      const msg = `Copied ${self._folders.assets} to ${self._folders.build}`
      console.log(msg.grey)
    })

    this._registerPartials(this._folders.partials, 'html')
    this._registerPartials(this._folders.partials, 'md')
    this._registerPartials(this._folders.partials, 'hbs')

    this._registerPartials(this._folders.layouts)

    console.log('Generating:'.grey)
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
    const model = `${this._folders.models}/${file}`
    if (this._fileSystem.exists(model)) {
      return JSON.parse(fs.readFileSync(model, 'utf8'))
    }
    console.error('Can not find model on file system'.red, model)
    return null
  }

  _registerPartials(folder, ext) {
    console.log(`Registering ${folder.replace(this._folders.src, '')}: `.grey)
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
        console.debug('Rendering Markdown')
        source = md.render(source)
      }

      handlebars.registerPartial(name, source)
      console.log(name.blue)
    })
  }

  _controller(options, controller) {
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

  _kissController(options) {
    if (options.controller) {
      switch (typeof options.controller) {
        case 'string':
          const controllerPath = `${this._folders.controllers}/${options.controller}`
          if (this._fileSystem.exists(controllerPath)) {
            const controller = require.main.require(controllerPath)
            options = this._controller(options, controller)
          }
          break
        case 'function':
          options = this._controller(options, options.controller)
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

  _generate(options) {
    // console.debug('options:'.grey, options)
    const kissPage = new KissPage(options.view)
    kissPage.options = options
    kissPage.buildDir = this._folders.build
    kissPage.pagesDir = this._folders.pages
    kissPage.path = options.path
    kissPage.slug = options.slug
    if (options.ext) kissPage.ext = options.ext
    kissPage.debug = this.config.verbose
    kissPage.isDev = this.config.dev
    this._state.pages.push(kissPage.generate())
    // console.debug(kissPage)
  }

  _generateMultiple(options, data) {
    let i = 1
    const slug = options.slug ? options.slug : options.view.replace('.hbs', '')
    if (Array.isArray(data)) {
      data.forEach((model) => {
        options.slug = slug + '-' + i
        options.model = model
        options = this._kissController(options)
        this._generate(options)
        i++
      })
    } else {
      console.error('Data in dynamic model must be an array'.red)
    }
  }

  // _generateSelector(options, data) {
  //   if (options.dynamic) {
  //     this._generateMultiple(options, data)
  //   } else {
  //     options.model = data
  //     options = this._kissController(options)
  //     this._generate(options)
  //   }
  // }

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
            const returnModel = this._folderModel(model)
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
          // resolve({ data: model })
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

  _folderModel(folderModel) {
    const modelArray = []
    if (fs.existsSync(`${this._folders.models}/${folderModel}`)) {
      const modelPath = `${this._folders.models}/${folderModel}`
      if (fs.lstatSync(modelPath).isDirectory()) {
        const models = glob.sync(`${modelPath}/*.json`)
        models.forEach((model) => {
          // console.debug(model.grey)
          const data = this._readModel(
            model.replace(`${this._folders.models}/`, '')
          )
          if (data) modelArray.push(data)
        })
      }
    }
    return modelArray
  }

  page(options, callbackController) {
    if (!options.view) {
      console.error('No view specified'.red, options)
      return this
    }
    if (this.verbose) console.log('Processing view: '.grey, options.view)
    // Map the global kiss config to the page config
    options.config = this.config

    // Auto map model if one isn't specified
    if (!options.model) {
      const matchingModel = options.view.replace(/\.hbs$/, '.json')
      if (this._fileSystem.exists(`${this._folders.models}/${matchingModel}`)) {
        if (this.verbose)
          console.log('Found matching model: '.grey, matchingModel)
        options.model = matchingModel
      }
    }
    if (options.model) this._state.models.push(options.model)

    // Use the call back as a controller if present
    if (typeof callbackController === 'function') {
      options.controller = callbackController
    }
    // See id we can auto map controller if one isn't specified
    if (!options.controller) {
      const matchingController = options.view.replace(/\.hbs$/, '.js')
      if (
        this._fileSystem.exists(
          `${this._folders.controllers}/${matchingController}`
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
      this._state.views.push(options.view) // [cp] only add if ending with .hbs
    }

    // Check if the page has been already generated
    let pathSlug = options.slug
    if (options.path !== '/') pathSlug = `${options.path}/${options.slug}`
    let pageToGenerate = `${this._folders.build}/${pathSlug}.html`
    // console.debug(this._state.pages)
    // console.debug(pageToGenerate, options.path)
    if (this._state.pages.includes(pageToGenerate)) {
      console.log('Page already processed'.red, pageToGenerate)
      // console.debug(options)
    } else {
      // Detect all the different types of model options and process appropriately
      this._processPageModel(options.model)
        .then((response) => {
          if (options.dynamic) {
            this._generateMultiple(options, response.data)
          } else {
            options.model = response.data
            options = this._kissController(options)
            this._generate(options)
          }
        })
        .catch((error) => {
          // If there was any issues processing the model let the user know
          console.error(colors.red(error.message))
          if (error.error) {
            console.error(colors.yellow(error.error))
          }
        })
    }
    // Facilitate chaining
    return this
  }

  pages(options, callbackController) {
    options.dynamic = true
    this.page(options, callbackController)
    return this
  }

  scan() {
    const pages = glob.sync(`${this._folders.pages}/**/*.hbs`)
    pages.forEach((pagePath) => {
      const view = pagePath.replace(
        new RegExp(`^${this._folders.pages}/`, 'g'),
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
    // if (this.verbose) console.log(JSON.stringify(this._state, null, 1))
    console.log({
      views: this._state.views.length,
      models: this._state.models.length,
      promise: this._state.promises.length,
      pages: this._state.pages.length,
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

  registerHelper(name, functionality) {
    handlebars.registerHelper(name, functionality)
    return this
  }
}

module.exports = Kiss
