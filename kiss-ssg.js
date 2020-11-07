const fs = require('fs')
const glob = require('glob')
const rimraf = require('rimraf')
const ncp = require('ncp').ncp // https://www.npmjs.com/package/ncp

const handlebars = require('handlebars') // https://handlebarsjs.com/
const markdown = require('helper-markdown') // https://github.com/helpers/helper-markdown
handlebars.registerHelper('markdown', markdown)
handlebars.registerHelper('stringify', function (obj) {
  return JSON.stringify(obj, null, 3)
})
const layouts = require('handlebars-layouts') // https://www.npmjs.com/package/handlebars-layouts
handlebars.registerHelper(layouts(handlebars))

const fetch = require('node-fetch')
const colors = require('colors')

class Page {
  _path = ''
  _slug = 'index'
  _title = 'Kiss page'

  debug = false
  view = null
  options = {}

  // defaults
  buildDir = './public'

  constructor(view) {
    this.view = view
    this._slug = this._utils.toSlug(
      view.substring(view.lastIndexOf('/') + 1, view.length).replace('.hbs', '')
    )
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

  generate() {
    let filePath = this.buildDir
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

        const pageToGenerate = `${filePath}/${this._slug}.html`
        console.log(pageToGenerate.green)
        fs.writeFileSync(pageToGenerate, output)
        if (this.options && this.debug) {
          fs.writeFileSync(
            pageToGenerate.replace('.html', '.json'),
            JSON.stringify(this.options, null, 1)
          )
        }
      } catch (error) {
        console.log(`Error processing view ${this.view}`.red)
        console.error(colors.yellow(error.message))
        //console.debug(colors.grey(error))
      }
    }
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
    let viewText = ''
    try {
      viewText = fs.readFileSync(view, 'utf8')
      return handlebars.compile(viewText)
    } catch (error) {
      console.log('Error reading view'.red)
      console.error(colors.yellow(error.message))
    }
    return null
  }
}

class Kiss {
  config = { name: 'Kiss SSG' }
  folders = {
    src: './src',
    assets: './src/assets',
    layouts: './src/layouts',
    pages: './src/pages',
    components: './src/components',
    models: './src/models',
    controllers: './src/controllers',
    build: './public',
  }

  state = {
    views: [],
    promises: [],
  }

  constructor(config) {
    const self = this
    console.log(colors.white('Starting Kiss'))
    if (!config) config = {}
    if (config.folders) {
      if (config.folders.src) {
        this.folders = {
          src: config.folders.src,
          assets: `${config.folders.src}/assets`,
          layouts: `${config.folders.src}/layouts`,
          pages: `${config.folders.src}/pages`,
          components: `${config.folders.src}/components`,
          models: `${config.folders.src}/content`,
          controllers: `${config.folders.src}/controllers`,
          build: './public',
        }
      }
      this.folders = { ...this.folders, ...config.folders }
    }
    config.folders = this.folders
    this.config.dev = false
    if (config.dev) this.config.dev = true
    this.config = config

    console.debug('folders: '.grey, this.folders)
    this.fileSystem.mkDir(this.folders.src)
    this.fileSystem.mkDir(this.folders.assets)
    this.fileSystem.mkDir(this.folders.layouts)
    this.fileSystem.mkDir(this.folders.pages)
    this.fileSystem.mkDir(this.folders.pages)
    this.fileSystem.mkDir(this.folders.components)
    this.fileSystem.mkDir(this.folders.models)
    this.fileSystem.mkDir(this.folders.controllers)

    try {
      rimraf.sync(this.folders.build)
    } catch (err) {
      console.log(colors.red(err.message))
    }
    this.fileSystem.mkDir(this.folders.build)

    ncp(this.folders.assets, this.folders.build, function (err) {
      if (err) {
        console.error('Error: '.red, err)
      }

      console.log(`Copied ${self.folders.assets} to ${self.folders.build}`.grey)
    })

    this.registerPartials(this.folders.components)
    this.registerPartials(this.folders.layouts)

    console.log('Generating:'.grey)
  }

  fileSystem = {
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

  registerPartials(folder) {
    console.log(`Registering ${folder.replace(this.folders.src, '')}: `.grey)
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

  readModel(file) {
    const model = `${this.folders.models}/${file}`
    if (this.fileSystem.exists(model)) {
      return JSON.parse(fs.readFileSync(model, 'utf8'))
    }
    console.error('Can not find model on file system'.red, model)
    return null
  }

  configOptionMapper(options, optionMapper) {
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

  generate(options, optionMapper) {
    if (options.controller) {
      const controllerPath = `${this.folders.controllers}/${options.controller}`
      if (this.fileSystem.exists(controllerPath)) {
        const controller = require.main.require(controllerPath)
        options = this.configOptionMapper(options, controller)
      }
    }
    if (optionMapper) {
      options = this.configOptionMapper(options, optionMapper)
    }
    // if the user didn't specify a title auto map title from model if it exists
    if (!options.title) {
      if (options.model && options.model.title) {
        options.title = options.model.title
      }
    }

    // console.debug('options:'.grey, options)
    const kissPage = new Page(`${this.folders.pages}/${options.view}`)
    kissPage.options = options
    kissPage.buildDir = this.folders.build
    kissPage.path = options.path
    kissPage.slug = options.slug
    kissPage.debug = this.config.dev
    kissPage.generate()
    // console.debug(kissPage)
  }

  generateDynamic(options, data, optionMapper) {
    let i = 1
    const slug = options.slug
    if (Array.isArray(data)) {
      data.forEach((model) => {
        options.slug = slug + '-' + i
        options.model = model
        this.generate(options, optionMapper)
        i++
      })
    } else {
      console.error('Data in dynamic model must be an array'.red)
    }
  }

  generator(options, optionMapper, data, controller) {
    if (options.dynamic) {
      this.generateDynamic(options, data, optionMapper)
    } else {
      options.model = data
      this.generate(options, optionMapper)
    }
  }

  page(options, optionMapper) {
    if (!options.view) {
      console.error('No view specified'.red, options)
      return this
    }
    options.config = this.config

    if (typeof options.model === 'string') {
      if (options.model.startsWith('http')) {
        const url = options.model
        fetch(url)
          .then((response) => response.json())
          .then((data) => {
            this.generator(options, optionMapper, data)
          })
          .catch((error) => {
            console.log(`Error getting model from ${url}`.red)
            console.error(colors.yellow(error))
          })
      } else if (options.model.endsWith('.json')) {
        const data = this.readModel(options.model)
        if (data) {
          this.generator(options, optionMapper, data)
        } else {
          console.log('Skipping: ', options.view)
        }
      } else if (fs.existsSync(`${this.folders.models}/${options.model}`)) {
        const modelPath = `${this.folders.models}/${options.model}`
        if (fs.lstatSync(modelPath).isDirectory()) {
          const models = glob.sync(`${modelPath}/*.json`)
          const modelArray = []
          models.forEach((model) => {
            // console.debug(model.grey)
            const data = this.readModel(
              model.replace(`${this.folders.models}/`, '')
            )
            if (data) modelArray.push(data)
          })
          this.generator(options, optionMapper, modelArray)
        } else {
          console.error('Model is not a .json file'.red, options.model)
        }
      } else {
        console.error('Invalid model'.red, options.model)
      }
    } else {
      this.generate(options, optionMapper)
    }

    this.state.views.push(options.view)
    return this
  }

  pages(options, optionMapper) {
    options.dynamic = true
    this.page(options, optionMapper)
    this.state.views.push(options.view)
    return this
  }

  scan() {
    const pages = glob.sync(`${this.folders.pages}/**/*.hbs`)
    pages.forEach((pagePath) => {
      const view = pagePath.replace(
        new RegExp(`^${this.folders.pages}/`, 'g'),
        ''
      )
      if (!this.state.views.some((v) => v === view)) {
        console.log(`Auto added:`.grey, view.blue)
        const options = {
          view: view,
        }

        const matchingModel = view.replace(/\.hbs$/, '.json')
        if (this.fileSystem.exists(`${this.folders.models}/${matchingModel}`)) {
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
    // console.log(JSON.stringify(this.state, null, 1))
    console.log(this.state)
    return this
  }
}

module.exports = Kiss
