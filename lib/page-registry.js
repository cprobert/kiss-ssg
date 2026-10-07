// Pages from registration to the stack: a `.page()` / `.pages()` / `.scan()`
// registration resolved to a model, run through its controller and prepared
// as a `KissPage` on `_stack`; and a page's identity — its id, the index
// `{{link}}` resolves against, and the stack as the record describes it.
//
// Every function takes the `Kiss` instance and reads its state at call time;
// state stays on the instance, and a call to another of its methods goes
// through `kiss._x()` / `kiss.page()`, so a test that patches one is seen.
import fs from 'fs-extra'
import path from 'node:path'
import utils from './utils.js'
import { KissPage } from './kiss-page.js'
import { resolveModel } from './model-resolver.js'
import { applyController } from './controller-resolver.js'
import { pageOrigin } from './aikb.js'
import { resolveMarkdownCopies } from './config.js'

/** @typedef {import('./kiss.js').PageOptions} PageOptions */

// What a page's `canonical` may be: an http(s) URL with a host, so the four
// readers of the option all agree it names somewhere else. Parsed rather than
// pattern-matched: a scheme-and-no-spaces regex let `https://?q=x`,
// `https://#foo` and `https://example.com:bad` through (Codex, on review),
// and each one registered, rendered, and withdrew its page from the sitemap.
const isAbsoluteHttpUrl = (value) => {
  if (typeof value !== 'string') return false
  // The delimiter too: WHATWG parses `https:other.example/x` and
  // `https:/other.example/x` to a host, but the helper renders the string as
  // written, and a browser resolves a same-scheme URL with no `//` against
  // the current page — the wrong site, with a green build (Codex, on the
  // close's review). Parsing alone is not the whole question.
  if (!/^https?:\/\//i.test(value)) return false
  try {
    const url = new URL(value)
    return (
      (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.hostname !== ''
    )
  } catch {
    return false
  }
}

// The default identity of a `.page()`/`.scan()` page: the view's route with its
// extension removed. An inline template — a view that is not a `.hbs` filename —
// is not a route, so it has no default id and cannot be linked by one.
export function defaultIdForView(view) {
  if (typeof view !== 'string' || !view.endsWith('.hbs')) return null
  return (
    utils
      .posixPath(view)
      .replace(/^\/+/, '')
      .replace(/\.hbs$/, '') || null
  )
}

// An id the author wrote, as opposed to one the engine derived. Only a non-empty
// string counts: ids are strings everywhere (the report, the map, `{{link}}`'s
// argument), and a record whose `id` field is a database integer is data about
// the record, not a claim on a page's identity.
export function explicitIdOf(options) {
  const id = options?.id
  return typeof id === 'string' && id.trim() ? id : null
}

/**
 * @param {any} kiss
 * @param {any} options
 * @param {any} [origin]
 * @param {string|null} [idPrefix] given only by `_prepareMultiplePages`: what
 * this fan-out's items prefix their default ids with, in place of the view
 * route. Its presence is also what tells a fan-out item from a `.page()` page.
 */
export function preparePage(
  kiss,
  options,
  origin,
  idPrefix,
  directory = process.cwd(),
) {
  const kissPage = new KissPage(options.view, {
    hbs: kiss.handlebars,
    logger: kiss.logger,
    graph: kiss._graph,
    outputs: kiss._outputs,
    directory,
  })
  kissPage.options = options
  kissPage.buildDir = kiss._writeRoot
  kissPage.pagesDir =
    kiss.config.folders.pages &&
    path.resolve(directory, kiss.config.folders.pages)
  kissPage.path = options.path
  kissPage.slug = options.slug
  if (options.ext) kissPage.ext = options.ext
  kissPage.debug = kiss.config.verbose
  kissPage.isDev = kiss.config.dev
  kissPage.livereloadPort = kiss.config.livereloadPort
  // From the page's own config, not the instance's: `options.config` is the
  // resolved config for this page (the global one with the page's overrides
  // merged over it, above), and the output path is exactly the kind of thing
  // a single page needs to differ on. A site that is extensionLess
  // everywhere still owes its host one literal `404.html` — Netlify and
  // Cloudflare Pages look for that filename and do not fall back to
  // `404/index.html`. Reading the instance's value here accepted such an
  // override and silently ignored it. The `??` keeps every other caller
  // unchanged, including the internal paths that prepare a page without
  // going through `page()`'s merge.
  kissPage.extLess = options.config?.extensionLess ?? kiss.config.extensionLess
  // From the page's own config for the same reason: one page may opt out of
  // its Markdown copy (`config: { markdownCopies: false }`), and that value
  // arrives as the page wrote it, so it is resolved here rather than trusted.
  // A page's block is merged over the site's, not over the defaults: a page
  // saying `{ write: true }` keeps the site's `selector`, the way every
  // per-page key overrides only what it names. `page()`'s own merge is one
  // level deep, so without this the page's object replaced the site's whole.
  const site = kiss.config.markdownCopies
  const own = options.config?.markdownCopies
  const copies = resolveMarkdownCopies(
    own && typeof own === 'object' && !Array.isArray(own) && own !== site
      ? { ...site, ...own }
      : (own ?? site),
  )
  kissPage.markdownCopy = copies.write ? { selector: copies.selector } : null

  const preparedPage = kissPage.prepare()
  const buildTo = preparedPage.buildTo
  // A page that will not be written claims no output path: it neither fails
  // a real page registered after it nor fails itself when one came first.
  const writes = (page) => page.options.generate !== false
  const outputPath = preparedPage.outputPath
  const claimed = kiss._stack.some(
    (entry) => entry.page.outputPath === outputPath && writes(entry.page),
  )
  if (claimed && writes(preparedPage)) {
    kiss.logger.error('Page already processed', buildTo)
    // A build failure, not a skip: two pages claiming one output path means
    // one of them is missing from a build that would otherwise succeed.
    kiss._failures.push({
      view: preparedPage.view,
      buildTo,
      error: new Error(`Page already processed: ${buildTo}`),
    })
    return null
  }
  // A canonical elsewhere is an absolute URL or nothing. Checked here, once,
  // because four readers act on it — the `canonical` helper, the sitemap,
  // llms.txt and the feed — and a relative or empty value would silently
  // withdraw the page from three of them while the fourth rendered junk.
  if (options.canonical != null && !isAbsoluteHttpUrl(options.canonical)) {
    const error = new Error(
      `canonical must be an absolute http(s) URL, got '${options.canonical}' (${preparedPage.view})`,
    )
    kiss.logger.error(error.message)
    kiss._failures.push({ view: preparedPage.view, buildTo, error })
    return null
  }
  // Identity, computed here and nowhere else: this is the one point at which
  // both halves are known — the view route synchronously, and the page's
  // *normalised* slug only now, because `KissPage`'s setter has just run it
  // through `toSlug`. An id built from `options.slug` would not match the
  // `{{link "<view>" slug=…}}` sugar, which slugs its argument the same way.
  // A page that will not be written claims no id at all: it cannot be linked,
  // and it must not take an id off a page that can — the same exemption the
  // duplicate-output-path check above makes for it.
  const explicitId = writes(preparedPage) ? explicitIdOf(options) : null
  let id = explicitId
  if (!id && writes(preparedPage))
    id =
      idPrefix === undefined
        ? defaultIdForView(preparedPage.view)
        : idPrefix
          ? `${idPrefix}/${preparedPage.slug}`
          : null
  if (explicitId) {
    // Two pages claiming one id is two pages claiming one identity: recorded
    // exactly like two pages claiming one output path, because a `{{link}}`
    // to it could only ever mean one of them. Two *default* ids do not fail —
    // see `_idIndexFor()`, which withdraws them instead.
    const owner = kiss._stack.find(
      (other) => other.explicit && other.id === explicitId,
    )
    if (owner) {
      kiss.logger.error('Page id already claimed', explicitId)
      kiss._failures.push({
        view: preparedPage.view,
        buildTo,
        error: new Error(`Page id already claimed: ${explicitId}`),
      })
      return null
    }
  }
  const entry = {
    view: preparedPage.view,
    buildTo,
    page: preparedPage,
    runCount: 0,
    // Identity and whether the author wrote it, on the stack entry rather
    // than on `options`: every own key of the options object reaches the
    // render context and the dev-mode `.json` sibling, and `explicit` is the
    // engine's bookkeeping. The page *option* `id` stays on `options` exactly
    // as it was written.
    id,
    explicit: explicitId !== null,
    // How this page's model and controller were *written*, captured in
    // `page()` before the chain replaced `options.model` with the resolved
    // data. Read only by `_buildAikb`; carried on the stack entry rather than
    // on `options`, because every own key of a registration reaches the render
    // context and the dev-mode `.json` sibling.
    origin,
  }
  kiss._stack.push(entry)
  // The stack has changed, so every default id resolved against it may have.
  kiss._idIndex = null
  return entry
}

// Identity resolved over the live stack. Explicit ids are unique by
// construction (a second claim failed the build above); a default id claimed
// twice is withdrawn from both pages rather than failing, so every site that
// builds today still builds — and an explicit id beats a default one, which
// is deterministic and fixable by naming one page.
export function idIndexFor(kiss) {
  if (kiss._idIndex) return kiss._idIndex
  /** @type {Map<string, any>} */
  const byId = new Map()
  /** @type {Map<string, any[]>} */
  const defaults = new Map()
  for (const entry of kiss._stack) {
    if (!entry.id) continue
    if (entry.explicit) byId.set(entry.id, entry)
    else {
      const seen = defaults.get(entry.id)
      if (seen) seen.push(entry)
      else defaults.set(entry.id, [entry])
    }
  }
  /** @type {Map<string, string[]>} */
  const withdrawn = new Map()
  for (const [id, entries] of defaults) {
    const owner = byId.get(id)
    if (!owner && entries.length === 1) {
      byId.set(id, entries[0])
      continue
    }
    const views = [
      ...(owner ? [owner.view] : []),
      ...entries.map((entry) => entry.view),
    ]
    withdrawn.set(id, views)
    // One line per id per build: the index is rebuilt on every registration,
    // and a fan-out would otherwise say the same thing once per item.
    if (!kiss._idNoticed.has(id)) {
      kiss._idNoticed.add(id)
      kiss.logger.notice(
        owner
          ? `Page id "${id}" is claimed by ${owner.view}, so the default id of ${entries
              .map((entry) => entry.view)
              .join(', ')} is withdrawn: set an explicit id to link to it`
          : `Two pages share the default id "${id}" (${views.join(', ')}): neither can be linked — set an explicit id on each`,
      )
    }
  }
  kiss._idIndex = { byId, withdrawn }
  return kiss._idIndex
}

// What `{{link}}` asks. Not public API: the helper is handed a bound function
// at registration (`lookupPage`), so nothing captures the stack array and a
// watch replay's new stack is seen the moment it is filled.
/**
 * @param {any} kiss
 * @param {string} id
 * @returns {{ entry: any }|{ withdrawn: true, views: string[] }|null}
 */
export function lookupPage(kiss, id) {
  if (typeof id !== 'string' || !id) return null
  const { byId, withdrawn } = kiss._idIndexFor()
  const entry = byId.get(id)
  if (entry) return { entry }
  const views = withdrawn.get(id)
  if (views) return { withdrawn: true, views }
  return null
}

// The stack as the record describes it: a default id two pages arrived at is
// withdrawn, so it is `null` on the report and `none` on the site map. The
// map is read as the link autocomplete — an id on it that `{{link}}` refuses
// would be worse than no id at all.
export function stackForRecord(kiss) {
  const { withdrawn } = kiss._idIndexFor()
  if (withdrawn.size === 0) return kiss._stack
  return kiss._stack.map((entry) =>
    entry.id && !entry.explicit && withdrawn.has(entry.id)
      ? { ...entry, id: null }
      : entry,
  )
}

export async function prepareMultiplePages(
  kiss,
  options,
  data,
  fresh = false,
  origin,
  directory = process.cwd(),
) {
  let i = 1
  const slug = options.slug ? options.slug : options.view.replace('.hbs', '')
  // The registration's `id` is the *prefix* its items' default ids use, in
  // place of the view route — never an id the items claim. That is how two
  // fan-outs of one view into different folders (the same post view under
  // `/blog/` and `/archive/`) end up with distinct ids instead of colliding.
  const idPrefix = explicitIdOf(options) ?? defaultIdForView(options.view)
  if (Array.isArray(data)) {
    for (const model of data) {
      // One bad item fails its own page and nothing else: the throw is caught
      // here rather than left to unwind the loop, which abandoned every later
      // item unregistered, unrendered and unreported — one failure entry
      // standing for the whole tail of the fan-out. Because nothing escapes
      // this loop, `page()`'s own catch never records a second entry for the
      // same item.
      try {
        // Each page gets its OWN options object. Sharing one across the loop
        // leaks anything derived from the first item into every later page —
        // `applyController`'s "title from model, unless already set" mapping is
        // the case that bit: item one set the title, and the guard then skipped
        // every item after it. `_preparePage` also stores this object on the
        // KissPage, so a shared one would alias across the whole fan-out.
        // `config` is copied one level deeper for the same reason.
        const item = {
          ...options,
          config: { ...options.config },
          slug: `${slug}-${i}`,
          model,
        }
        // `aliases` is promoted from the *record*, exactly where `slug` and
        // `model` are — and the registration's own is deleted rather than
        // inherited. An alias is one old URL for one page: broadcast over a
        // fan-out it would emit N rules with the same source and N different
        // targets, which is a redirect whose destination depends on stack
        // order and a `_redirects` file that is not byte-stable. Like every
        // other page option it reaches the render context and the dev-mode
        // `.json` sibling, which is accepted: a template may legitimately
        // want to say "formerly at …".
        delete item.aliases
        const aliases =
          model && typeof model === 'object' ? model.aliases : undefined
        if (aliases !== undefined) item.aliases = aliases
        // `id` is promoted from the record on the same rule, and the
        // registration's own is deleted rather than inherited: broadcast, the
        // first item would claim it and every later one would fail the build
        // as a duplicate claim. A record's own id wins outright over the
        // `<prefix>/<slug>` default. Only a string is an id — a record whose
        // `id` field is a database integer is data, not a claim on identity.
        delete item.id
        const recordId =
          model && typeof model === 'object' ? model.id : undefined
        if (typeof recordId === 'string' && recordId.trim()) item.id = recordId
        const pageOptions = await applyController(item, {
          controllersDir: kiss.config.folders.controllers,
          logger: kiss.logger,
          fresh,
        })
        // One row per fan-out item, all naming the one registration they
        // came from — the same shape the report gives a `.pages()` fan-out.
        kiss._preparePage(pageOptions, origin, idPrefix, directory)
      } catch (error) {
        // No output path exists yet, so the failure is named by view plus the
        // item's position — and its own slug where the model carries one, the
        // only handle the operator has on which record of N was malformed.
        const itemSlug =
          model && typeof model.slug === 'string' ? `: ${model.slug}` : ''
        const view = `${options.view} [item ${i}${itemSlug}]`
        kiss.logger.error('Error preparing page', view)
        kiss._failures.push({ view, buildTo: null, error })
      }
      i++
    }
  } else {
    kiss.logger.error('Data in dynamic model must be an array')
  }
}

/**
 * @param {any} kiss
 * @param {PageOptions} options
 * @param {string} directory
 */
export function registerPage(kiss, options, directory) {
  if (!options.view) {
    kiss.logger.error('No view specified', options)
    return
  }
  // Snapshot what the caller passed, before any mutation below, so a watch
  // rebuild can replay this page from its original options. `_replaying` is
  // read synchronously here: the async chain below runs later, by which time
  // the flag has been reset, hence the captured `fresh`.
  if (!kiss._replaying) {
    const registration = { ...options }
    if (kiss._scanning) kiss._scanned.add(registration)
    kiss._registrations.push(registration)
    kiss._registrationDirectories.set(registration, directory)
  }
  const fresh = kiss._replaying

  // A per-page shallow copy of the global config, with any `config` the
  // caller passed layered on top as an override. Never the live object: a
  // controller mutating `options.config` would otherwise reach pages already
  // prepared, every later page and the sitemap. Nested values (`folders`)
  // are still shared by reference — nothing in the engine mutates them.
  options.config = { ...kiss.config, ...(options.config ?? {}) }

  // Auto map model if one isn't specified
  if (!options.model) {
    const matchingModel = options.view.replace(/\.hbs$/, '.json')
    if (fs.existsSync(`${kiss.config.folders.models}/${matchingModel}`)) {
      kiss.logger.debug('Found matching model: ', matchingModel)
      options.model = matchingModel
    }
  }

  // See if we can auto map controller if one isn't specified
  if (!options.controller) {
    const matchingController = options.view.replace(/\.hbs$/, '.js')
    if (
      fs.existsSync(`${kiss.config.folders.controllers}/${matchingController}`)
    ) {
      kiss.logger.debug('Found matching controller: ', matchingController)
      options.controller = matchingController
    }
  }

  // How the model and the controller were written, captured here because the
  // chain below replaces `options.model` with the resolved data and resolves
  // `options.controller` to a function — a map built from the stack alone
  // would say `inline` for every page in the site. Read after the two
  // auto-mappings above, so a page that never named a model still records the
  // `<view>.json` the engine found for it.
  const origin = pageOrigin(options)

  // Capture the model's id before the chain runs: options.model is reassigned
  // to the resolved data inside .then, so reading it in .catch would report
  // `undefined` for any failure that happens after the model resolves.
  const modelId = typeof options.model === 'string' ? options.model : undefined

  // Detect all the different types of model options and process appropriately.
  // The whole chain (model -> controller -> prepared page) is tracked, and it
  // never rejects: failures resolve to { id, data: null, error }.
  const chain = resolveModel(options.model, {
    modelsDir: kiss.config.folders.models,
    logger: kiss.logger,
    fetchConfig: kiss.config.fetch,
  })
    .then(async (response) => {
      try {
        if (options.dynamic) {
          await kiss._prepareMultiplePages(
            options,
            response.data,
            fresh,
            origin,
            directory,
          )
        } else {
          options.model = response.data
          options = await applyController(options, {
            controllersDir: kiss.config.folders.controllers,
            logger: kiss.logger,
            fresh,
          })

          if (!options.slug) {
            if (options.view.endsWith('.hbs')) {
              options.slug = utils.toSlug(
                options.view
                  .substring(
                    options.view.lastIndexOf('/') + 1,
                    options.view.length,
                  )
                  .replace('.hbs', ''),
              )
            } else {
              options.slug = 'snippet-' + Math.floor(Math.random() * 1000000000)
              kiss.logger.error(
                'A string view had been provided without an accompanying slug',
              )
              kiss.logger.info(`generating random slug: ${options.slug}`)
            }
          }

          if (!options.path) {
            // Only a `.hbs` view is a filename with a folder in it, same
            // guard as the slug fallback above: an inline template's own
            // markup (any closing tag) would otherwise become the folder.
            options.path = options.view.endsWith('.hbs')
              ? options.view.substring(0, options.view.lastIndexOf('/'))
              : ''
          }

          kiss._preparePage(options, origin, undefined, directory)
        }
      } catch (error) {
        // Everything past the model — the controller above all — is a build
        // failure, not a skip: the page would otherwise ship built from
        // un-controlled options. A model that fails to resolve rejects
        // before this block and keeps its log-and-skip behaviour.
        kiss._failures.push({ view: options.view, buildTo: null, error })
        throw error
      }
      return response
    })
    .catch((error) => {
      // If there was any issues processing the model let the user know
      kiss.logger.error(error.message || error)
      if (error.error) kiss.logger.error(error.error)
      return { id: modelId, data: null, error }
    })
  kiss._promises.push(chain)
}

/**
 * @param {any} kiss
 * Queues every `.hbs` under `config.folders.pages` not already registered by
 * `view`, with default options. Repeated on every whole-site watch rebuild,
 * so page files added or deleted mid-session are picked up.
 *
 */
export function scanPages(kiss) {
  const pagesRoot = utils.posixPath(kiss.config.folders.pages)
  const pages = utils.globFiles(pagesRoot, '**/*.hbs')
  // Remembered so a watch rebuild can scan again and pick up new page files.
  kiss._scanRequested = true
  // Read synchronously by page() as it registers, same as `_replaying`.
  kiss._scanning = true
  try {
    pages.forEach((pagePath) => {
      // A plain slice, not a RegExp: the folder is a path, and an unescaped
      // one built into a pattern matches the wrong thing (`.` in `./src`).
      const view = pagePath.startsWith(`${pagesRoot}/`)
        ? pagePath.slice(pagesRoot.length + 1)
        : pagePath

      // Against the registrations, not the stack: `page()` records a
      // registration synchronously but only queues the page, so `_stack` is
      // still empty during a `.page(…).scan()` chain and at replay time —
      // scanning either of those against it registered the same view twice.
      const alreadyRegistered = kiss._registrations.some(
        (registration) => registration.view === view,
      )

      if (!alreadyRegistered) {
        kiss.logger.info(`Auto added:`, view)
        const options = {
          view: view,
        }
        kiss.page(options)
      }
    })
  } finally {
    kiss._scanning = false
  }
}

/**
 * @param {any} kiss
 * Logs the queued-promise and prepared-page counts, and — with
 * `verbose: true` — writes `debug.json` into the build folder.
 *
 */
export function logViewStats(kiss) {
  if (kiss.verbose) {
    // Serialise a projection: a stack entry's `page` carries the Handlebars
    // environment (which has an internal cycle) and the logger, so dumping
    // `kiss._stack` directly throws "Converting circular structure to JSON".
    const projection = kiss._stack.map(({ view, buildTo, runCount, page }) => ({
      view,
      buildTo,
      runCount,
      options: page.options,
    }))
    // Recorded as the write is started, not when it lands: the write is not
    // awaited, and the audit decides `debug-dump` from this flag rather
    // than racing it to the disk.
    kiss._debugWritten = true
    fs.outputJson(
      `${kiss._writeRoot}/debug.json`,
      projection,
      { spaces: 2 },
      (err) => {
        if (err) kiss.logger.plain(err)
        else
          kiss._outputs.claim(
            `${kiss._writeRoot}/debug.json`,
            'debug statistics',
          )
      },
    )
  }

  kiss.logger.plain({
    promise: kiss._promises.length,
    stack: kiss._stack.length,
  })
}
