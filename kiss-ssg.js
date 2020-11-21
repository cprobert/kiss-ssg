const md5 = require('md5')
const fs = require('fs-extra')
const glob = require('glob')
const sass = require('sass')
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
var remarkable = new Remarkable({
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
  // return new handlebars.SafeString(remarkable.render(returnVal))
  return remarkable.render(returnVal)
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
    let buildPath = this.buildDir
    if (this._path) {
      buildPath = `${this.buildDir}/${this._path}`
    }
    // Fake extension less pages
    if (this._extLess && this.slug !== 'index') {
      return `${buildPath}/${this.slug}/index.${this._ext}`
    }

    return `${buildPath}/${this.slug}.${this._ext}`
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

        // fs.writeFileSync(this.buildTo, formattedOutput)
        fs.outputFile(this.buildTo, formattedOutput, (err) => {
          if (err) {
            console.error(`Error creating ${this.buildTo}`.red)
            console.error(colors.yellow(err))
          }
        })

        if (this.options && this._debug) {
          fs.outputJson(
            this.buildTo.replace(this._ext, '.json'),
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
    promises: [],
  }

  handlebars = handlebars
  remarkable = remarkable

  constructor(config) {
    console.log('            Starting Kiss            \n'.zebra)
    // Setup defaults
    let folders = {
      src: './src',
      pages: './src/pages',
      build: './public',
      assets: './src/assets',
      layouts: './src/layouts',
      partials: './src/partials',
      models: './src/models',
      controllers: './src/controllers',
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
        extensionLess: false,
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
    this.registerPartials()

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

      const sassOutput = sass.renderSync({ file: sassFile })
      fs.outputFile(`${cssFile}.css`, sassOutput.css, (err) => {
        if (err) {
          console.error('Error parsing sass file'.red)
          console.error(err)
        } else {
          console.log(`${cssFile}.css`.green)
        }
      })
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
    this._state.promises.push(p)
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
      promise: this._state.promises.length,
      stack: this._stack.length,
    })
    return this
  }

  generate(callback) {
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
          this.registerPartials()
          this._stack.forEach((result) => {
            result.page.generate()
          })
        }
      }
    })
  }
}

module.exports = Kiss
