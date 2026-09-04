import path from 'node:path'
import * as sassModule from 'sass'
import { trimLines } from './utils.js'

// Older sass releases (e.g. 1.52) expose the modern API only on the default
// export from ESM and newer ones export it by name (and deprecate `default`),
// so prefer the named export and fall back only when it is missing.
const sass =
  typeof sassModule.compile === 'function' ? sassModule : sassModule.default

export function registerHandlebarsHelpers(hbs, config, { markdown, logger }) {
  hbs.registerHelper('markdown', function (obj) {
    let text = ''
    if (typeof obj === 'object') {
      text = obj.fn(this)
    } else if (typeof obj === 'string') {
      text = obj
    } else if (typeof obj === 'undefined') {
      logger.warn('Undefined value passed to markdown helper:')
    } else {
      logger.error('Unexpected object in the bagging area!')
      logger.warn(
        'Markdown helper has an unexpected object type of:',
        typeof obj,
      )
    }
    return new hbs.SafeString(markdown.render(trimLines(text)))
  })

  hbs.registerHelper('sass', function (context, options) {
    const style = config.dev ? 'expanded' : 'compressed'
    const loadPaths = config.sass.includePaths
    let output = ''
    if (typeof context === 'string') {
      const result = sass.compile(path.join(process.cwd(), context), {
        loadPaths,
        style,
      })
      output = `${output} \n${result.css}`
    }
    const block =
      options && options.fn ? options : context && context.fn ? context : null
    if (block) {
      const result = sass.compileString(block.fn(this), { loadPaths })
      output = `${output} \n${result.css}`
    }
    return new hbs.SafeString(output)
  })

  hbs.registerHelper('offset', (index) => index + 1)

  hbs.registerHelper('stringify', (obj) => JSON.stringify(obj, null, 3))

  hbs.registerHelper('isActive', function (pageOptions, options) {
    let context = { href: '', active: 'active', folderMatch: false }
    if (options && options.hash) context = { ...context, ...options.hash }
    const activeClass = context.active
    context.active = ''
    // Sanitize page URLs, to match index.html to /
    let pageURL = pageOptions.pageURL
    pageURL = pageURL.substring(0, pageURL.lastIndexOf('.')) // Strip the extension
    pageURL = pageURL.replace(/index$/, '') // change /index to /
    context.pageURL = pageURL
    const noSlashHref = context.href.replace(/^\//, '')
    if (context.folderMatch) {
      if (pageURL.includes(noSlashHref)) context.active = activeClass
    } else if (pageURL == noSlashHref) {
      context.active = activeClass
    }
    return options.fn(context)
  })

  hbs.registerHelper('env', function (options) {
    if (!options.hash.is) {
      logger.error('Environment helper missing "is" property', '{{#env}')
      return ''
    }
    const envIs = options.hash.is.toLowerCase()
    if (envIs.includes('dev') && config.dev) return options.fn(this)
    if (envIs.includes('prod') && !config.dev) return options.fn(this)
    return options.inverse(this)
  })

  return hbs
}
