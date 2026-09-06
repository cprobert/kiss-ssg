import fs from 'fs-extra'
import path from 'node:path'
// Imported on the first page render, not at module load. html-minifier-terser
// costs ~155ms to load (it pulls in terser and a CSS parser), and `lib/kiss.js`
// imports this module eagerly for the `KissPage` class — so the cost landed on
// every process that touched Kiss, including ones that render nothing.
// Minification is not optional, so for a build that renders pages this defers
// the cost rather than removing it; what it buys is that the cost now belongs
// to rendering, and overlaps the awaits around it.
// https://www.npmjs.com/package/html-minifier-terser
let htmlMinify = null
const loadMinifier = async () => {
  if (!htmlMinify)
    ({ minify: htmlMinify } = await import('html-minifier-terser'))
  return htmlMinify
}
import { toSlug, toTitleCase, sanitizePath } from './utils.js'
import { createLogger } from './logger.js'
import { DEFAULT_CONFIG } from './config.js'

// Compiled templates, keyed per Handlebars environment.
//
// `_getTemplate` runs on every render, and used to read and compile the view
// each time. A one-shot `scan` build hides that — one page, one view, one
// compile — but a fan-out does not: `.pages({ view: 'item.hbs', model: 'items' })`
// renders N pages from ONE template and was compiling it N times. On a real
// site (diploma-msc) 111 course pages share four `catalogs/*.hbs` views, so
// each was compiled ~28 times. Handlebars compilation is 44% of a 500-page
// build in the CPU profile, and it is the compiler, not the renderer.
//
// A WeakMap on the environment, not a plain module-level Map, because
// `hbs.compile` closes over the environment it was called on: its helpers and
// partials are resolved against that instance. Two Kiss instances in one
// process have two environments, and a template compiled on one must never be
// handed to the other. Keying on the env also lets the cache die with it.
const templateCache = new WeakMap()

const mtimeOf = (file) => {
  try {
    return fs.statSync(file).mtimeMs
  } catch {
    // Never equal to a recorded value (NaN !== NaN), so an unreadable view is
    // always treated as a miss and the read below reports the real error.
    return NaN
  }
}

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
  // Annotated, or the frozen default narrows the field to the literal 35729
  // and any real port assigned from config fails to typecheck.
  /** @type {number} */
  livereloadPort = DEFAULT_CONFIG.livereloadPort

  /**
   * @param {string} view a `.hbs` filename under `pagesDir`, or inline template
   *   source
   * @param {{ hbs?: any, logger?: any }} [deps]
   */
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
      // Slugified like `path` and `slug`: an unsanitised extension carries
      // `/` and `..` straight into `buildTo` and writes outside the build dir.
      this._ext = toSlug(extension.replace(/^\./, ''))
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
          // The host is resolved in the browser, not baked in here: with
          // devHost '0.0.0.0' the page is opened from another device, whose
          // localhost is not the machine running the livereload server.
          const liveReload = `\n<script>(function () { var s = document.createElement('script'); s.src = 'http://' + (location.hostname || 'localhost') + ':${this.livereloadPort}/livereload.js?snipver=1'; document.body.appendChild(s) })()</script>`
          output = output.replace('</body>', liveReload + '\n</body>')
        }

        // Dev skips minification entirely rather than running it with every
        // option turned off. It used to do the latter, which still paid for
        // the parse — ~1.3ms a page, ~2.7ms with an inlined stylesheet — and,
        // since the minifier is now imported at first render, still paid the
        // ~155ms to load it. A dev build never ships, so the only thing the
        // pass was still doing (dropping comments) is worth less than the time
        // it costs; keeping them is arguably better for reading dev output.
        var minifiedHtml = this._dev
          ? output
          : await (
              await loadMinifier()
            )(output, {
              collapseWhitespace: true,
              conservativeCollapse: false,
              removeComments: true,
              removeEmptyAttributes: true,
              minifyCSS: true,
              minifyJS: true,
            })

        // Belt-and-braces behind the sanitised path/slug/ext setters: whatever
        // composed this URL, a page must never write outside the build folder.
        const resolvedBuildDir = path.resolve(this.buildDir)
        const resolvedTarget = path.resolve(this.buildTo)
        if (
          resolvedTarget !== resolvedBuildDir &&
          !resolvedTarget.startsWith(resolvedBuildDir + path.sep)
        ) {
          throw new Error(
            `Refusing to write outside the build folder: ${this.buildTo}`,
          )
        }

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
    const isFile = view.endsWith('.hbs')
    const viewPath = isFile ? `${this.pagesDir}/${view}` : null
    // An inline template is its own key; a file is keyed on its path and
    // validated by mtime, so an edit under `watch` recompiles.
    const key = isFile ? viewPath : view

    let cached = templateCache.get(this.hbs)
    if (!cached) templateCache.set(this.hbs, (cached = new Map()))
    const hit = cached.get(key)
    if (hit && (!isFile || hit.mtimeMs === mtimeOf(viewPath)))
      return hit.template

    // Read before the compile, and stat before the read: a file that changes
    // between the two would otherwise be cached under the newer mtime while
    // holding the older text, and stay stale until it changed again.
    const mtimeMs = isFile ? mtimeOf(viewPath) : null
    let viewText = view
    if (isFile) {
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
      const template = this.hbs.compile(viewText)
      // Only a compile that succeeded is worth keeping: caching a null would
      // hide the error log from every later render of the same broken view.
      cached.set(key, { template, mtimeMs })
      return template
    } catch (error) {
      this.logger.error('Error rendering view: ')
      this.logger.error(error.message)
    }
    return null
  }
}
