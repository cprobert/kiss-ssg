const fs = require('fs')

const handlebars = require('handlebars') // https://handlebarsjs.com/
const markdown = require('helper-markdown') // https://github.com/helpers/helper-markdown
handlebars.registerHelper('markdown', markdown)
handlebars.registerHelper('stringify', function (obj) {
  return JSON.stringify(obj, null, 3)
})
const layouts = require('handlebars-layouts') // https://www.npmjs.com/package/handlebars-layouts
handlebars.registerHelper(layouts(handlebars))

const colors = require('colors')

class KissPage {
  _path = ''
  _slug = 'index'
  _ext = 'html'
  _title = 'Kiss page'

  _debug = false
  view = null
  options = {}

  // defaults
  buildDir = './public'
  pagesDir = './src/pages'

  constructor(view) {
    this.view = view
    this._slug = this._utils.toSlug(
      view.substring(view.lastIndexOf('/') + 1, view.length).replace('.hbs', '')
    )
    this.path = view.substring(0, view.lastIndexOf('/'))
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
        fs.writeFileSync(pageToGenerate, output)
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
    let viewText = ''
    let viewPath = `${this.pagesDir}/${view}`
    try {
      viewText = fs.readFileSync(viewPath, 'utf8')
      return handlebars.compile(viewText)
    } catch (error) {
      console.log('Error reading view: '.red, viewPath)
      console.error(colors.yellow(error.message))
    }
    return null
  }
}

module.exports = KissPage
