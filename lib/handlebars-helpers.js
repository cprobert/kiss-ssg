import path from 'node:path'
import sass from './sass.js'
import { trimLines } from './utils.js'

// Both sides of an `isActive` comparison reduce to the same key — no leading or
// trailing slash, no file extension, no trailing `index` segment — so `/about`,
// `/about/` and `about/index.html` are one page whether or not `extensionLess`
// is on, and the home page is the empty string.
function toURLKey(value) {
  let key = String(value).replace(/^\/+/, '').replace(/\/+$/, '')
  const lastSegment = key.slice(key.lastIndexOf('/') + 1)
  if (lastSegment.includes('.')) key = key.slice(0, key.lastIndexOf('.'))
  return key.replace(/(^|\/)index$/, '')
}

export function registerHandlebarsHelpers(hbs, config, { markdown, logger }) {
  hbs.registerHelper('markdown', function (obj) {
    let text = ''
    if (obj && typeof obj.fn === 'function') {
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
      const target = path.isAbsolute(context)
        ? context
        : path.join(process.cwd(), context)
      const result = sass.compile(target, { loadPaths, style })
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
    // Called without the page argument, Handlebars passes its own options
    // object as the first parameter, so the block is found by shape.
    const block = options ?? pageOptions
    if (typeof block?.fn !== 'function') {
      logger.warn('isActive is a block helper:', '{{#isActive page href="/"}}')
      return ''
    }
    const hash = block.hash ?? {}
    const activeClass = hash.active ?? 'active'
    // Coalesced, not spread over the default: a data-driven nav passing an
    // absent model key hands the helper an explicit `undefined`.
    const href = hash.href ?? ''
    const context = {
      ...hash,
      href,
      folderMatch: hash.folderMatch ?? false,
      active: '',
      pageURL: '',
    }
    const pageURL = pageOptions?.pageURL
    if (typeof pageURL !== 'string') {
      // A template mistake must degrade to "not active", never take the page
      // out of the build.
      logger.warn('isActive received no page context for href:', href)
      return block.fn(context)
    }
    context.pageURL = toURLKey(pageURL)
    const hrefKey = toURLKey(href)
    const matches = context.folderMatch
      ? context.pageURL === hrefKey || context.pageURL.startsWith(`${hrefKey}/`)
      : context.pageURL === hrefKey
    if (matches) context.active = activeClass
    return block.fn(context)
  })

  hbs.registerHelper('env', function (options) {
    if (typeof options?.hash?.is !== 'string') {
      logger.error('Environment helper needs a string "is" property', '{{#env}')
      return ''
    }
    const envIs = options.hash.is.toLowerCase()
    if (envIs.includes('dev') && config.dev) return options.fn(this)
    if (envIs.includes('prod') && !config.dev) return options.fn(this)
    return options.inverse(this)
  })

  return hbs
}
