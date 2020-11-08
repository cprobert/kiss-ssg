const KissPage = require('./kiss-page')

const fs = require('fs')
const glob = require('glob')
const rimraf = require('rimraf')
const ncp = require('ncp').ncp // https://www.npmjs.com/package/ncp

const fetch = require('node-fetch')
const colors = require('colors')

class Kiss {
  _folders = {
    src: './src',
    assets: './src/assets',
    layouts: './src/layouts',
    pages: './src/pages',
    components: './src/components',
    models: './src/models',
    controllers: './src/controllers',
    build: './public',
  }

  _state = {
    views: [],
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
          components: `${config.folders.src}/components`,
          models: `${config.folders.src}/models`,
          controllers: `${config.folders.src}/controllers`,
          build: './public',
        }
      }
      this._folders = { ...this._folders, ...config.folders }
    }
    config.folders = this._folders

    console.debug('folders: '.grey, this._folders)
    this._fileSystem.mkDir(this._folders.src)
    this._fileSystem.mkDir(this._folders.assets)
    this._fileSystem.mkDir(this._folders.layouts)
    this._fileSystem.mkDir(this._folders.pages)
    this._fileSystem.mkDir(this._folders.pages)
    this._fileSystem.mkDir(this._folders.components)
    this._fileSystem.mkDir(this._folders.models)
    this._fileSystem.mkDir(this._folders.controllers)

    try {
      rimraf.sync(this._folders.build)
    } catch (err) {
      console.log(colors.red(err.message))
    }
    this._fileSystem.mkDir(this._folders.build)
  }

  constructor(config) {
    const self = this
    console.log('            Starting Kiss            \n'.zebra)
    if (!config) config = { dev: false }
    this.config = config

    this._setupFolders(config)
    ncp(this._folders.assets, this._folders.build, function (err) {
      if (err) console.error('Error: '.red, err)
      const msg = `Copied ${self._folders.assets} to ${self._folders.build}`
      console.log(msg.grey)
    })

    this._registerPartials(this._folders.components)
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

  _registerPartials(folder) {
    console.log(`Registering ${folder.replace(this._folders.src, '')}: `.grey)
    const hbs = glob.sync(`${folder}/**/*.hbs`)
    hbs.forEach((path) => {
      // console.debug('partial: '.grey, path)
      const source = fs.readFileSync(path, 'utf8')
      const reStart = new RegExp(`^${folder}`, 'g')
      const reEnd = new RegExp(`\.hbs$`, 'g')
      let name = path.replace(reStart, '').replace(reEnd, '')
      if (name.startsWith('/')) {
        name = name.substring(1, name.length)
      }
      handlebars.registerPartial(name, source)
      console.log(name.blue)
    })
  }

  _optionMapper(options, optionMapper) {
    if (typeof optionMapper === 'function') {
      try {
        let mappedOptions = optionMapper(options)
        options = {
          ...options,
          ...mappedOptions,
        }
      } catch (err) {
        console.log(`Error in controller for ${options.view}`.red)
        console.error(colors.yellow(err))
      }
    }
    return options
  }

  _kissController(options, optionMapper) {
    if (options.controller) {
      const controllerPath = `${this._folders.controllers}/${options.controller}`
      if (this._fileSystem.exists(controllerPath)) {
        const controller = require.main.require(controllerPath)
        options = this._optionMapper(options, controller)
      }
    }
    if (optionMapper) {
      options = this._optionMapper(options, optionMapper)
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
    kissPage.debug = this.config.dev
    this._state.pages.push(kissPage.generate())
    // console.debug(kissPage)
  }

  _generateMultiple(options, data, optionMapper) {
    let i = 1
    const slug = options.slug
    if (Array.isArray(data)) {
      data.forEach((model) => {
        options.slug = slug + '-' + i
        options.model = model
        options = this._kissController(options, optionMapper)
        this._generate(options)
        i++
      })
    } else {
      console.error('Data in dynamic model must be an array'.red)
    }
  }

  _generateSelector(options, optionMapper, data, controller) {
    if (options.dynamic) {
      this._generateMultiple(options, data, optionMapper)
    } else {
      options.model = data
      options = this._kissController(options, optionMapper)
      this._generate(options)
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
                resolve(data)
              })
              .catch((error) => {
                console.log(`Error getting model from ${model}`.red)
                reject({ message: error.message, error: error })
              })
          } else if (model.endsWith('.json')) {
            const data = this._readModel(model)
            if (data) {
              resolve(data)
            } else {
              reject({ message: `Skipping: ${model}` })
            }
          } else {
            // See if the model is a folder
            const returnModel = this._folderModel(model)
            if (returnModel.length > 0) {
              resolve(returnModel)
            } else {
              reject({ message: `Invalid model ${model}` })
            }
          }
          break
        case 'object':
          // console.debug('Model is object'.grey)
          resolve(model)
          break
        case 'undefined':
          resolve({})
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

  page(options, optionMapper) {
    if (!options.view) {
      console.error('No view specified'.red, options)
      return this
    }
    options.config = this.config

    if (!this._state.views.includes(options.view)) {
      this._state.views.push(options.view)
    }

    let pageToGenerate = `${this._folders.build}/${options.slug}.html`
    if (this._state.pages.includes(pageToGenerate)) {
      console.log('Page already processed'.red, pageToGenerate)
    } else {
      this._processPageModel(options.model)
        .then((data) => {
          this._generateSelector(options, optionMapper, data)
        })
        .catch((error) => {
          console.log(colors.red(error.message))
          if (error.error) {
            console.error(colors.yellow(error.error))
          }
        })
    }

    return this
  }

  pages(options, optionMapper) {
    options.dynamic = true
    this.page(options, optionMapper)
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

        const matchingModel = view.replace(/\.hbs$/, '.json')
        if (
          this._fileSystem.exists(`${this._folders.models}/${matchingModel}`)
        ) {
          console.log('Found matching model: '.grey, matchingModel)
          options.model = matchingModel
        }

        this.page(options, ({ model }) => {
          if (model && model.title) {
            return { title: model.title }
          }
        })
      }
    })
    return this
  }

  viewState() {
    // console.log(JSON.stringify(this._state, null, 1))
    console.log({
      views: this._state.views.length,
      promise: this._state.promises.length,
      pages: this._state.pages.length,
    })
    return this
  }

  complete(callback) {
    return Promise.all(this._state.promises).then(() => {
      callback.call(this)
    })
  }
}

module.exports = Kiss
