import path from 'node:path'
import { compileFile, compileSource } from './sass.js'
import { createAssetManifest } from './asset-manifest.js'
import {
  servedPathFor,
  toAbsoluteUrl,
  toCanonicalPath,
  toSlug,
  toURLKey,
  trimLines,
} from './utils.js'

/**
 * Registers kiss's built-in helpers on one Handlebars environment: `markdown`,
 * `sass`, `offset`, `stringify`, `lookup`, `canonical`, `absUrl`, `asset`,
 * `link`, `isActive` and `env`. Each is Handlebars runtime — see `AIKB` and
 * llms.txt for what each one renders.
 *
 * @param {typeof import('handlebars')} hbs the environment to register on
 * @param {import('./config.js').KissConfig} config read by `sass`, `env`,
 * `canonical`/`absUrl`/`link` (`siteUrl`) and `asset` (`assets`)
 * @param {Object} deps
 * @param {any} deps.markdown the Remarkable instance behind the `markdown` helper
 * @param {ReturnType<typeof import('./logger.js').createLogger>} deps.logger
 * @param {ReturnType<typeof createAssetManifest>} [deps.assets] what each asset
 * copy emitted, which is what `asset` looks a path up in
 * @param {(id: string) => ({ entry: any }|{ withdrawn: true, views: string[] }|null)} [deps.lookupPage]
 * the page registry behind `link`, resolved against the orchestrator's live
 * stack on every call: `{ entry }` for a page that claims the id, `{ withdrawn,
 * views }` for a default id two pages arrived at, `null` for an id no page
 * claims. A function, never a snapshot — helpers are registered once per
 * instance and a watch replay builds a new stack. The default resolves nothing,
 * so a caller that registers helpers without a registry still gets every other
 * helper.
 * @returns {typeof import('handlebars')} the same environment
 */
export function registerHandlebarsHelpers(
  hbs,
  config,
  { markdown, logger, assets = createAssetManifest(), lookupPage = () => null },
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
      const css = compileFile(target, { loadPaths, style })
      output = `${output} \n${css}`
    }
    const block =
      options && options.fn ? options : context && context.fn ? context : null
    if (block) {
      const css = compileSource(block.fn(this), { loadPaths })
      output = `${output} \n${css}`
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

  // The host's directory-index policy, read at call time rather than captured:
  // helpers are registered once per Kiss instance, and a watch replay rebuilds
  // the config object the same way it rebuilds the stack.
  const trailingSlashPolicy = () => config.links?.trailingSlash ?? true

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
    // `toCanonicalPath`, not `toURLKey`: the extension goes, the trailing
    // `index` segment stays for `toAbsoluteUrl` to turn into the trailing slash
    // the host serves without a redirect — or to drop it, under
    // `links.trailingSlash: false`, for a host that serves the bare form.
    return toAbsoluteUrl(siteUrl, toCanonicalPath(pageURL), {
      trailingSlash: trailingSlashPolicy(),
    })
  }

  hbs.registerHelper('canonical', function (...args) {
    // The options object is always last, so `{{canonical}}` and the v1-shaped
    // `{{canonical this}}` a consumer is migrating from both find the page.
    const options = args[args.length - 1]
    // A page that names another URL as the real one — a course page whose
    // canonical is the same course on the sister site — renders that URL
    // verbatim, and needs no `siteUrl` to do it: checked before `siteUrlFor`,
    // which would otherwise warn about a missing siteUrl and return '' for a
    // page that had said exactly where its canonical is (found by Codex on
    // review). Validated at registration (`_preparePage`), not here: a page
    // whose canonical is malformed fails whether or not its template ever
    // renders this helper, because the sitemap, llms.txt and the feed read
    // the option too.
    const own = options?.data?.root?.canonical
    if (typeof own === 'string' && own) return own
    const siteUrl = siteUrlFor(options)
    return siteUrl ? canonicalUrl(siteUrl, options) : ''
  })

  // Someone else's domain — a CDN, an external link — is passed through
  // untouched, `siteUrl` or not.
  const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i
  // Anything that is not a path into THIS build: a scheme of any shape
  // (`https://`, but also `data:` and `mailto:`, which carry no `//`), and the
  // protocol-relative `//cdn/x.css`. `ABSOLUTE_URL` above requires the `://`
  // and so let both of those fall through to a manifest lookup they can never
  // satisfy — which was harmless while `asset` warned and became a failed
  // build when it started throwing.
  const NOT_OURS = /^([a-z][a-z0-9+.-]*:|\/\/)/i
  // `path?query#fragment` → `[path, '?query#fragment']`. The fragment is cut
  // first because a fragment may itself contain a `?`. The manifest is keyed
  // by the path a copy emitted, so the suffix has to come off before the
  // lookup and go back on after it: `img/logo.svg#symbol` is an SVG sprite
  // reference to a file that IS in the build, and looking the whole string up
  // failed the build while telling the author the file was missing.
  // `lib/links.js` splits references the same way, for the same reason.
  // Handlebars escapes `=` defensively, for unquoted attributes in browsers
  // nobody targets. It is the one escape that makes a URL unrecognisable to
  // the author who wrote it, and it is not load-bearing: `=` cannot terminate
  // an attribute value. Everything else `escapeExpression` does is kept.
  const unescapeEquals = (value) =>
    hbs.Utils.escapeExpression(value).replace(/&#x3D;/g, '=')
  const splitSuffix = (value) => {
    const cut = value.search(/[?#]/)
    return cut === -1 ? [value, ''] : [value.slice(0, cut), value.slice(cut)]
  }

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
        : toAbsoluteUrl(siteUrl, urlPath, {
            trailingSlash: trailingSlashPolicy(),
          })
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
    if (NOT_OURS.test(urlPath)) return urlPath
    const [asked, suffix] = splitSuffix(urlPath)
    const name = asked.replace(/^\/+/, '')
    const emitted = assets.lookup(name)
    if (!emitted) {
      // A path no copy emitted is a template mistake, and it used to warn and
      // render — so the build passed, `report().ok` stayed true, and the site
      // shipped a 404. That is the same verdict-versus-reality gap the Sass
      // work on this branch closed twice, and kiss's own documented bar tells
      // an agent that ok and exit 0 are the only passing result.
      //
      // It also changed the meaning of what the author wrote: the leading
      // slash was stripped first, so `{{asset "/missing.css"}}` rendered
      // `missing.css`, which on a nested page is a different URL entirely.
      //
      // Same shape as `{{link}}`, deliberately, because they are the two
      // halves of "never hand-write an internal URL" and they were checked to
      // different depths: a warning in dev, where the file you are about to
      // add legitimately is not there yet, and a build failure everywhere
      // else. Dev renders the path AS WRITTEN rather than the stripped form,
      // so the browser's 404 names the thing the template asked for.
      const view =
        typeof options?.data?.root?.view === 'string'
          ? ` (asked by ${options.data.root.view})`
          : ''
      if (config.dev) {
        warnUnknownAsset(name, options)
        return urlPath
      }
      // Named the lookup key alone until an independent review pointed out
      // that the key is a string the author never typed: `/css/nope.css#x`
      // was reported as `'css/nope.css'`, with the slash stripped and the
      // fragment gone. The reference is what a person searches their
      // templates for; the key underneath it is what no copy emitted, and it
      // is worth saying only when the two differ. The dev warning above has
      // always named the reference — these two now agree.
      const emitted = name === urlPath ? 'it' : `'${name}'`
      throw new Error(
        `asset: '${urlPath}' is not in the build${view} — no .copyAssets() emitted ${emitted}. Check the path, or the folder it should have been copied from.`,
      )
    }
    // Site-relative and unprefixed, so the template owns the base: `/{{asset}}`
    // for a root-relative link, `{{root}}{{asset}}` for one that works off the
    // file system, `{{absUrl (asset …)}}` for an absolute URL.
    // The policy is the instance's, not the page's: the file was renamed (or
    // not) once, by the one copy that emitted it, before any page rendered.
    const { hash, version } = config.assets ?? {}
    // The author's own `?query#fragment` rides on the emitted name, whatever
    // the renaming policy did to it. Returned pre-escaped rather than left to
    // Handlebars, for the same reason the `?v=` branch below does it: escaping
    // the whole string turns `?v=1` into `?v&#x3D;1`, which a browser decodes
    // correctly but an author reading their own output does not recognise.
    // Everything else is still escaped — only `=` is put back, and `=` cannot
    // terminate an attribute value, quoted or not.
    if (hash || !version)
      return suffix
        ? new hbs.SafeString(unescapeEquals(`${emitted}${suffix}`))
        : emitted
    // The path is escaped exactly as Handlebars would have escaped it, and the
    // query is appended after: left to Handlebars the whole string is escaped,
    // and the `=` comes out of the template as `&#x3D;`.
    // An author who wrote their own query keeps it and gets no `?v=` — two
    // query strings on one URL is not a thing, and theirs is the explicit one.
    const url = unescapeEquals(`${emitted}${suffix}`)
    if (suffix.startsWith('?')) return new hbs.SafeString(url)
    return new hbs.SafeString(`${url}?v=${encodeURIComponent(version)}`)
  })

  // Who asked, for a message that can be acted on: the view names the template
  // the mistake is in, the output path names which of N fan-out pages hit it.
  // Both ride in Handlebars' data frame that `KissPage.generate()` fills.
  const askedBy = (options) => {
    const root = options?.data?.root
    const view = typeof root?.view === 'string' ? root.view : '<unknown view>'
    // The page's own URL, never `data.kissPage`: under a check or an atomic
    // build that is the staging path, and a message that names a folder which
    // no longer exists by the time anyone reads it is worse than none.
    const where =
      typeof root?.pageURL === 'string'
        ? servedPathFor(root.pageURL, { trailingSlash: trailingSlashPolicy() })
        : '<unwritten>'
    return `${view} / ${where}`
  }

  // `{{link "<id>"}}` — a page's identity turned into its address, so a template
  // never re-derives a URL that `extensionLess`, `path` and `slug` already
  // decide. It renders the **served path**: `/` + the page's own URL with a
  // trailing `index.html` collapsed (`servedPathFor` in utils.js, the one
  // derivation), root-relative so it works from any page in the site. A site
  // served from a path prefix, or a link that has to be absolute (an OG tag, a
  // feed), uses `absolute=true`; a host that serves the pretty form uses
  // `canonical=true`, which is the exact string `{{canonical}}`, the sitemap and
  // the feed emit for that page.
  //
  // Unlike every other helper this one **fails the page** in a real build. A
  // path is a claim about a host the engine cannot see, so a broken one is
  // advisory (`AIKB/links.md`); an id is a claim about *this build's registry*,
  // checkable exactly at render. Under `config.dev` it degrades the way
  // `{{asset}}` does — a warning and a `#` — so the live reload shows both the
  // page and the mistake.
  hbs.registerHelper('link', function (...args) {
    // Argument found by count, not position, as `absUrl` and `asset` do it.
    const options = args[args.length - 1]
    const given = args.length > 1 ? args[0] : undefined
    const hash = options?.hash ?? {}
    const asked = given instanceof hbs.SafeString ? given.toString() : given
    let id = typeof asked === 'string' ? asked : ''
    // `{{link "blog/post" slug=post.slug}}` is sugar for the joined id, and the
    // slug is normalised here because the default id was built from the
    // *normalised* slug — a record titled `Hello World` builds to `hello-world`
    // and is linked by it.
    if (id && hash.slug !== undefined && hash.slug !== null)
      id = `${id}/${toSlug(hash.slug)}`
    const found = id ? lookupPage(id) : null
    // `'entry' in found` rather than a truthiness test on the property: the two
    // shapes are a discriminated union, and this is the test that narrows it.
    if (!found || !('entry' in found)) {
      const message =
        found && 'views' in found
          ? `link: id "${id}" is the default id of more than one page (${found.views.join(
              ', ',
            )}), so no page claims it — set an explicit id (asked by ${askedBy(options)})`
          : `link: no page with id "${id}" (asked by ${askedBy(options)})`
      if (config.dev) {
        logger.warn(message)
        return '#'
      }
      throw new Error(message)
    }
    const pageURL = found.entry.page?.pageURL()
    if (typeof pageURL !== 'string') {
      const message = `link: page "${id}" has no URL yet (asked by ${askedBy(options)})`
      if (config.dev) {
        logger.warn(message)
        return '#'
      }
      throw new Error(message)
    }
    // `canonical` decides the *shape* of the path and `absolute` whether it
    // carries the origin, so the two compose. The pretty form is the same join
    // `{{canonical}}`, `sitemap.xml` and the feed use, so a site on a host that
    // serves it emits one URL per page rather than two.
    //
    // `config.links.canonical` is the default and the per-call hash always
    // wins, `canonical=false` included — a site whose host redirects
    // `/about.html` to `/about` would otherwise need `canonical=true` at every
    // call site, and forgetting it once ships a redirect hop that is silent in
    // dev and visible only on the deployed site.
    const canonical = hash.canonical ?? config.links?.canonical === true
    const path = canonical ? toCanonicalPath(pageURL) : pageURL
    // `toAbsoluteUrl` with an empty base is the root-relative canonical form;
    // `servedPathFor` is the one derivation for the extension-ful form.
    // Both sides take the same policy, and that is the point: `{{link}}`'s
    // href and `{{canonical}}`'s URL are the same page's address. Split them
    // and a Firebase-style site links `/courses/` while canonicalising
    // `/courses`, taking the 301 the setting exists to avoid on every click.
    const trailingSlash = trailingSlashPolicy()
    const served = canonical
      ? toAbsoluteUrl('', path, { trailingSlash })
      : servedPathFor(pageURL, { trailingSlash })
    if (!hash.absolute) return served
    // String-joined to `siteUrl`'s origin and path prefix, never `toAbsoluteUrl`
    // over the page URL: that strips a trailing `index` segment with *any*
    // extension, so an `ext: 'json'` index page would be advertised at `/data/`,
    // a directory with no index in it. The relative and absolute forms of one
    // link must be the same path.
    const siteUrl = siteUrlFor(options)
    // No `siteUrl` is already one warning from `siteUrlFor`; the link degrades
    // to the root-relative form rather than to nothing, because a page that
    // asked for a link still wants one.
    if (!siteUrl) return served
    if (canonical) return toAbsoluteUrl(siteUrl, path, { trailingSlash })
    return `${String(siteUrl).replace(/\/+$/, '')}${served}`
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
    // The surrounding context underneath the hash, which is how every other
    // Handlebars block helper behaves. Without it the block saw the hash and
    // nothing else, so the natural data-driven nav —
    // `{{#each nav}}{{#isActive ../page href=href}}{{label}}{{/isActive}}{{/each}}`
    // — rendered an empty label for every item, on a green build, with no
    // warning possible: the helper cannot tell a key the caller forgot from one
    // it never wanted. Two independent agents hit it on a fresh site.
    //
    // Shallow, and the hash still wins over any key of the same name, so a
    // template that already passed everything it needed is unaffected — this
    // only makes keys visible that were previously absent.
    const parent = this && typeof this === 'object' ? this : {}
    const context = {
      ...parent,
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
