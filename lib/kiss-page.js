import fs from 'fs-extra'
import { minify as htmlMinify } from 'html-minifier-terser' // https://www.npmjs.com/package/html-minifier-terser
import { toSlug, toTitleCase, sanitizePath } from './utils.js'
import { createLogger } from './logger.js'

export class KissPage {
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

  constructor(view, { hbs, logger } = {}) {
    this.view = view
    this.hbs = hbs
    this.logger = logger || createLogger()
    this._title = toTitleCase(this._slug)
  }

  set path(path) {
    if (path) {
      this._path = sanitizePath(path)
    }
  }

  get slug() {
    return this._slug
  }

  set slug(slug) {
    if (slug) {
      this._slug = toSlug(slug)
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
          throw err
        }

        // The dev-mode debug sibling is an artifact, not the build output —
        // a failure to write it is logged but must never fail the page.
        if (this.options && this._dev) {
          try {
            await fs.outputJson(
              // Only the trailing extension — `this._ext` can occur earlier in
              // the path too (e.g. a folder named `html`).
              this.buildTo.replace(/\.[^.]+$/, '.json'),
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
        // Rethrow so Kiss can collect the failure: a build that silently
        // resolves with a missing page is worse than a loud one.
        throw error
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
        // A `.hbs` view is a filename, never an inline template: falling
        // through here would compile the filename itself as the page body.
        throw new Error(`Error reading view: ${viewPath}`, { cause: error })
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
