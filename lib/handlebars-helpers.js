import path from 'node:path'
import sass from './sass.js'
import { createAssetManifest } from './asset-manifest.js'
import { toAbsoluteUrl, toURLKey, trimLines } from './utils.js'

/**
 * Registers kiss's built-in helpers on one Handlebars environment: `markdown`,
 * `sass`, `offset`, `stringify`, `lookup`, `canonical`, `absUrl`, `asset`,
 * `isActive` and `env`. Each is Handlebars runtime — see `AIKB` and llms.txt
 * for what each one renders.
 *
 * @param {typeof import('handlebars')} hbs the environment to register on
 * @param {import('./config.js').KissConfig} config read by `sass`, `env`,
 * `canonical`/`absUrl` (`siteUrl`) and `asset` (`assets`)
 * @param {Object} deps
 * @param {any} deps.markdown the Remarkable instance behind the `markdown` helper
 * @param {ReturnType<typeof import('./logger.js').createLogger>} deps.logger
 * @param {ReturnType<typeof createAssetManifest>} [deps.assets] what each asset
 * copy emitted, which is what `asset` looks a path up in
 * @returns {typeof import('handlebars')} the same environment
 */
export function registerHandlebarsHelpers(
  hbs,
  config,
  { markdown, logger, assets = createAssetManifest() },
) {
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

  // Handlebars' own `lookup`, plus the one diagnostic it lacks: a dynamic
  // partial `{{> (lookup . 'key')}}` whose key is absent fails only as
  // `The partial undefined could not be found`, naming neither the key nor
  // the page it is on (review finding G-2).
  const reportedLookups = new WeakMap()
  hbs.registerHelper('lookup', function (obj, field, options) {
    if (!obj) return obj
    // Delegated, never a raw `obj[field]`: `lookupProperty` is what refuses
    // `__proto__`/`constructor` access, and that guard is Handlebars' to own.
    const value = options.lookupProperty(obj, field)
    if (value === undefined) {
      const root = options.data?.root
      // One line per page per key, not one per call: a partial used twice on
      // a page, or a fan-out of 100 pages, must stay readable. The root
      // context is a fresh object per page, so the Set scopes itself.
      let reported = null
      if (root && typeof root === 'object') {
        reported = reportedLookups.get(root)
        if (!reported) reportedLookups.set(root, (reported = new Set()))
      }
      if (!reported || !reported.has(field)) {
        if (reported) reported.add(field)
        const view = typeof root?.view === 'string' ? ` in ${root.view}` : ''
        logger.warn(`lookup: '${field}' is undefined${view}`)
      }
    }
    return value
  })

  // One warning per page, not per call: a layout rendering `canonical` and a
  // handful of `absUrl` links on a site with no `siteUrl` would otherwise log a
  // line for each. The root context is a fresh object per page, so the set
  // scopes itself, as `lookup`'s does.
  const reportedNoSiteUrl = new WeakSet()
  const siteUrlFor = (options) => {
    const root = options?.data?.root
    // The page's own config, not the instance's: a page may override `siteUrl`
    // for itself (`.page({ config: { siteUrl } })`), and `kiss.page()` has
    // already merged that over the site config by render time.
    const siteUrl = root?.config?.siteUrl ?? config.siteUrl
    if (siteUrl) return siteUrl
    const dedupable = root && typeof root === 'object'
    if (!dedupable || !reportedNoSiteUrl.has(root)) {
      if (dedupable) reportedNoSiteUrl.add(root)
      const view = typeof root?.view === 'string' ? ` in ${root.view}` : ''
      logger.warn(`No config.siteUrl: cannot build an absolute URL${view}`)
    }
    return null
  }

  const canonicalUrl = (siteUrl, options) => {
    const pageURL = options?.data?.root?.pageURL
    if (typeof pageURL !== 'string') {
      // Guessing the site root here would put the same canonical URL on every
      // page, which is worse for a search engine than none at all.
      logger.warn('canonical received no page context')
      return ''
    }
    return toAbsoluteUrl(siteUrl, toURLKey(pageURL))
  }

  hbs.registerHelper('canonical', function (...args) {
    // The options object is always last, so `{{canonical}}` and the v1-shaped
    // `{{canonical this}}` a consumer is migrating from both find the page.
    const options = args[args.length - 1]
    const siteUrl = siteUrlFor(options)
    return siteUrl ? canonicalUrl(siteUrl, options) : ''
  })

  // Someone else's domain — a CDN, an external link — is passed through
  // untouched, `siteUrl` or not.
  const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i

  hbs.registerHelper('absUrl', function (...args) {
    // Called with no path, Handlebars passes only its options object, so the
    // argument is found by count rather than position (as `isActive` finds its
    // block by shape).
    const options = args[args.length - 1]
    const given = args.length > 1 ? args[0] : undefined
    // `{{absUrl (asset 'css/site.css')}}` hands this a SafeString whenever the
    // inner helper had to protect a query string: unwrapped here and re-wrapped
    // below, so composing the two neither warns nor re-escapes the `?v=`.
    const safe = given instanceof hbs.SafeString
    const urlPath = safe ? given.toString() : given
    if (typeof urlPath === 'string' && ABSOLUTE_URL.test(urlPath)) return given
    if (args.length > 1 && typeof urlPath !== 'string') {
      logger.warn('absUrl needs a path string, got:', typeof urlPath)
      return ''
    }
    const siteUrl = siteUrlFor(options)
    if (!siteUrl) return ''
    const url =
      urlPath === undefined
        ? canonicalUrl(siteUrl, options)
        : toAbsoluteUrl(siteUrl, urlPath)
    return safe ? new hbs.SafeString(url) : url
  })

  // One line per page per path, the `lookup` pattern: a layout linking an
  // asset that was never copied would otherwise log once per page per render
  // of that layout.
  const reportedAssets = new WeakMap()
  const warnUnknownAsset = (urlPath, options) => {
    const root = options?.data?.root
    let reported = null
    if (root && typeof root === 'object') {
      reported = reportedAssets.get(root)
      if (!reported) reportedAssets.set(root, (reported = new Set()))
    }
    if (reported?.has(urlPath)) return
    reported?.add(urlPath)
    const view = typeof root?.view === 'string' ? ` in ${root.view}` : ''
    logger.warn(`asset: '${urlPath}' is not in the build${view}`)
  }

  hbs.registerHelper('asset', function (...args) {
    // Argument found by count, not position, as `absUrl` does it.
    const options = args[args.length - 1]
    const urlPath = args.length > 1 ? args[0] : undefined
    if (typeof urlPath !== 'string') {
      logger.warn('asset needs a path string, got:', typeof urlPath)
      return ''
    }
    if (ABSOLUTE_URL.test(urlPath)) return urlPath
    const name = urlPath.replace(/^\/+/, '')
    const emitted = assets.lookup(name)
    if (!emitted) {
      // A template mistake, or an asset another tool put in the build: say so
      // once and link what the author asked for, rather than breaking the page.
      warnUnknownAsset(name, options)
      return name
    }
    // Site-relative and unprefixed, so the template owns the base: `/{{asset}}`
    // for a root-relative link, `{{root}}{{asset}}` for one that works off the
    // file system, `{{absUrl (asset …)}}` for an absolute URL.
    // The policy is the instance's, not the page's: the file was renamed (or
    // not) once, by the one copy that emitted it, before any page rendered.
    const { hash, version } = config.assets ?? {}
    if (hash || !version) return emitted
    // The path is escaped exactly as Handlebars would have escaped it, and the
    // query is appended after: left to Handlebars the whole string is escaped,
    // and the `=` comes out of the template as `&#x3D;`.
    const url = hbs.Utils.escapeExpression(emitted)
    return new hbs.SafeString(`${url}?v=${encodeURIComponent(version)}`)
  })

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
