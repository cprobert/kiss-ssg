import path from 'node:path'
import fs from 'node:fs'
import { isInside } from './utils.js'
import { HOST_FORMATS } from './redirects.js'

/**
 * Where the engine reads and writes. Every key is present once `resolveConfig`
 * has run; `null` is a real value — it switches a folder off, so nothing is
 * created, scanned or copied for it.
 *
 * @typedef {Object} KissFolders
 * @property {string|null} src the folder the six derived ones below come from
 * @property {string|null} pages `.hbs` views, the root `options.view` is relative to
 * @property {string|null} build where the site is written
 * @property {string|null} assets copied (and Sass-compiled) into `build`
 * @property {string|null} layouts registered as Handlebars layouts
 * @property {string|null} partials registered as Handlebars partials
 * @property {string|null} models `.json` models `options.model` names
 * @property {string|null} controllers `.js` controllers `options.controller` names
 * @property {string|null} aikb where `kiss-ssg aikb` records the site's knowledge base; source-side and committed, so it is not derived from `src` and is not created on start-up
 * @property {string|null} helpers the site's own Handlebars helpers, auto-registered from its `index.js`; beside the build script rather than derived from `src`, and optional — a site with no helpers simply has no folder
 */

/**
 * A `folders` block as a site writes it: every key optional. Setting `src`
 * re-derives `pages`, `assets`, `layouts`, `partials`, `models` and
 * `controllers` from it, unless the same object also sets them explicitly.
 * `build`, `aikb` and `helpers` are never derived: one is the output, the
 * other two are committed source beside the build script.
 *
 * @typedef {Partial<KissFolders>} KissFoldersInput
 */

/**
 * The fetch policy for `http(s)` models (`config.fetch`). Per instance, not per
 * page, and merged exactly one level deep.
 *
 * @typedef {Object} KissFetch
 * @property {Record<string, string>} headers sent with every URL-model request
 * @property {number} timeout ms before the request is aborted and the page fails
 * @property {number} retries extra attempts after a network error or a 5xx
 * @property {string|false} cache a directory to cache successful bodies in, or `false`
 */

/**
 * The asset block (`config.assets`): the cache-busting policy for the files
 * `.copyAssets()` emits, read by the `{{asset}}` helper — both off = today's
 * build — plus the pipeline of external commands run before the copy.
 *
 * @typedef {Object} KissAssets
 * @property {boolean} hash rename every emitted `.css`/`.js` to carry a content hash
 * @property {string|null} version leave names alone; `{{asset}}` appends `?v=<version>`
 * @property {import('./pipeline.js').PipelineStep[]} pipeline ordered commands run before the asset copy
 */

/**
 * The Markdown block (`config.markdown`): the options handed to this instance's
 * Remarkable, behind both `.md` partials and the `{{markdown}}` helper. Merged
 * exactly one level deep, and passed through as-is — the three keys below are
 * the ones kiss has a default for, not the ones it accepts, so any other
 * Remarkable option (`typographer`, `langPrefix`) reaches the renderer too.
 *
 * @typedef {Object} KissMarkdown
 * @property {boolean} html render raw HTML in the source rather than escaping it
 * @property {boolean} xhtmlOut close single tags XHTML-style (`<br />`)
 * @property {boolean} breaks turn a newline inside a paragraph into a `<br />`
 */

/**
 * The link block (`config.links`): what the broken-internal-link scan does on a
 * settled non-dev build. A block rather than a bare boolean because the second
 * knob a real deploy wants (paths the host generates and the build never sees)
 * would otherwise be a breaking rename. Merged exactly one level deep.
 *
 * @typedef {Object} KissLinks
 * @property {boolean} check scan every written page for internal references that resolve to nothing
 * @property {boolean} canonical make `{{link}}` emit the extension-less canonical path by default
 * @property {boolean} trailingSlash keep a directory index's trailing `/` in every URL kiss emits (`/courses/`, the default) or drop it (`/courses`)
 */

/**
 * The redirect block (`config.redirects`): how page `aliases` are encoded. The
 * host-neutral `redirects.json` is written whatever this says. Merged exactly
 * one level deep.
 *
 * @typedef {Object} KissRedirects
 * @property {RedirectFormat|RedirectFormat[]|null} format the host encodings to emit beside `redirects.json`; `null` (the default) emits none
 */

/**
 * One host encoding: a built-in name, or a function that writes it.
 *
 * @typedef {'netlify'|'firebase'|'vercel'|'htaccess'|'none'|RedirectWriter} RedirectFormat
 */

/**
 * A custom redirect writer: given the resolved rules, return the files to write
 * into the build folder. A relative `file` is resolved against the build
 * folder; `contents` is written verbatim. Returning nothing writes nothing.
 *
 * @callback RedirectWriter
 * @param {{ from: string, to: string }[]} rules sorted, the same list `report().redirects.rules` carries
 * @param {{ buildDir: string, config: Object }} context
 * @returns {{ file: string, contents: string }[]|{ file: string, contents: string }|void|Promise<{ file: string, contents: string }[]|{ file: string, contents: string }|void>}
 */

/**
 * Every documented config key except `folders`. Both the resolved and the input
 * config are built from this one shape, so the two cannot drift apart.
 *
 * @typedef {Object} KissSettings
 * @property {boolean} dev start a livereload dev server and file watcher; skip minification
 * @property {boolean} verbose log the resolved config, and write `debug.json` from `.viewStats()`
 * @property {boolean|'atomic'} cleanBuild `true` empties `folders.build` in the constructor, `'atomic'` builds into a staging sibling and swaps it in when `complete()` resolves
 * @property {boolean} extensionLess build non-index pages to `<path>/<slug>/index.html`
 * @property {string} [siteUrl] required by `.sitemap()` and the `canonical`/`absUrl` helpers
 * @property {{ includePaths: string[] }} sass load paths handed to Sass (its `loadPaths`)
 * @property {KissFetch} fetch
 * @property {KissAssets} assets
 * @property {KissMarkdown & Record<string, any>} markdown
 * @property {KissLinks} links gates the broken-internal-link scan on a settled non-dev build
 * @property {KissRedirects} redirects how page `aliases` are encoded on a settled build
 * @property {number} port dev server port
 * @property {number} livereloadPort live reload port, also injected into the dev-mode reload script
 * @property {string} devHost interface the dev and live reload servers bind to
 */

/**
 * A fully resolved config: `kiss.config`, and what every view sees as
 * `this.config`. Extra keys are part of the contract rather than an oversight —
 * anything a site passes through (`new Kiss({ season })`) reaches its views as
 * `{{config.season}}` — so an unknown key is `any` instead of an error.
 *
 * @typedef {KissSettings & { folders: KissFolders } & Record<string, any>} KissConfig
 */

/**
 * The config a site passes to `new Kiss(config)`: every key optional, extra keys
 * allowed. An omitted key — or one explicitly `undefined` — takes its default
 * from `DEFAULT_CONFIG`/`DEFAULT_FOLDERS`. `folders`, `sass`, `fetch`, `assets`,
 * `markdown`, `links` and `redirects` are partial here because each is merged exactly one level deep,
 * so a site sets the one key it cares about and keeps the defaults around it.
 *
 * @typedef {Partial<Omit<KissSettings, 'sass'|'fetch'|'assets'|'markdown'|'links'|'redirects'>> & {
 *   sass?: { includePaths?: string[] },
 *   fetch?: Partial<KissFetch>,
 *   assets?: Partial<KissAssets>,
 *   markdown?: Partial<KissMarkdown> & Record<string, any>,
 *   links?: Partial<KissLinks>,
 *   redirects?: Partial<KissRedirects>,
 *   folders?: KissFoldersInput,
 * } & Record<string, any>} KissConfigInput
 */

export const DEFAULT_FOLDERS = Object.freeze({
  src: './src',
  pages: './src/pages',
  build: './public',
  assets: './src/assets',
  layouts: './src/layouts',
  partials: './src/partials',
  models: './src/models',
  controllers: './src/controllers',
  // Deliberately not `./src/aikb` and deliberately not derived from `src`: the
  // knowledge base is written for people, lives at the root of the repository
  // beside `README.md`, and is committed. Nothing creates it until
  // `npx kiss-ssg aikb <script>` has recorded one, which is why it is absent
  // from `foldersToEnsure` below.
  aikb: './AIKB',
  // The site's own helpers, which kiss imports and registers itself. Beside
  // the build script for the same reason `aikb` is: it is code the site
  // author writes, not a folder derived from `src`. Deliberately outside
  // `src` — `src` is what `.watch()` watches for *content*, and a helper
  // module there is none of the six things a src event can be. It has its own
  // watcher instead, so an edit re-imports and re-registers rather than
  // triggering a replay that cannot see it. Absent from `foldersToEnsure`:
  // a site with no custom helpers should not acquire an empty folder.
  //
  // Being a default has a consequence an upgrading site feels: a project that
  // already had a root `helpers/` folder of unrelated utilities now has its
  // `index.js` imported on every build. So `Kiss` records whether the author
  // named this folder, and an entry that exports no registrar is a warning
  // when kiss guessed and a build failure when the author pointed it here
  // (`lib/site-helpers.js`). The convention still applies to everyone; only
  // the cost of kiss being wrong about it is paid by kiss.
  helpers: './helpers',
})

// The URL-model fetch policy. Conservative on purpose: no headers, no
// retries and no cache means a site that never sets `fetch` behaves as it
// always did, apart from the timeout — without one, an upstream that accepts
// the connection and then says nothing hangs the build for ever.
export const DEFAULT_FETCH = Object.freeze({
  headers: {},
  timeout: 10000,
  retries: 0,
  cache: false,
})

// The cache-busting policy for emitted assets, and the pipeline of commands
// run before the copy. All three are off by default, so a site that never sets
// the block emits exactly the files it always did: the manifest behind
// `{{asset}}` is built either way, but nothing is renamed until a policy asks
// for it, and no child process is spawned until a step asks for it.
export const DEFAULT_ASSETS = Object.freeze({
  hash: false,
  version: null,
  pipeline: [],
})

// The Remarkable options behind `.md` partials and the `{{markdown}}` helper.
// `breaks: false` is deliberate and is the published v1 value: with it on, a
// paragraph hard-wrapped in the source renders one `<br />` per source line,
// breaking prose mid-sentence at whatever column the author happened to wrap
// at. `html: true` and `xhtmlOut: true` are v2's, and stay.
//
// It is also a *changed* default, which the migration notes call out: the
// `2.0.0-alpha.5` prerelease hard-coded `breaks: true` in the Remarkable
// constructor, and beta.1 both flipped it and made the block configurable. A
// site pinned to an alpha may still carry a `remarkable.set({ breaks: false })`
// + `registerPartials()` workaround for a default that has not existed since.
export const DEFAULT_MARKDOWN = Object.freeze({
  html: true,
  xhtmlOut: true,
  breaks: false,
})

// What the link scan does, and what `{{link}}` emits. `check` is on by default:
// a site that never sets the block has every internal reference in its own
// output checked, and the finding is advisory — it never touches `ok` or the
// exit code. A block rather than a boolean so the ignore list a real deploy
// eventually wants is a new key here rather than a rename of `config.links`.
//
// `canonical` is off because turning it on changes the URL every bare
// `{{link}}` emits, which is a site's whole internal link graph — that is a
// major-version decision, not a default. It is here because a site that is not
// `extensionLess` and is served by a host that redirects `/about.html` to
// `/about` needs the pretty form on every link or it ships a redirect hop on
// each one, and writing `canonical=true` at every call site is a rule no
// reviewer can enforce: forgetting it once is silent in dev and visible only on
// the deployed site. One key here replaces that discipline.
// `trailingSlash` is the host's URL policy for a directory index, and it is a
// policy rather than a fact: measured on 2026-09-16, Netlify serves
// `/courses/` and 301s the bare `/courses`, while Firebase Hosting with
// `cleanUrls` + `trailingSlash: false` serves `/courses` and 301s `/courses/`.
// They agree on file pages and contradict each other here, so one of them has
// to be the default and the other has to be sayable. `true` is today's
// behaviour and stays: every `<loc>` in a1k9training's live sitemap returns 200
// under it, and moving the default would turn six of them into redirects.
export const DEFAULT_LINKS = Object.freeze({
  check: true,
  canonical: false,
  trailingSlash: true,
})

// How page `aliases` are emitted. `format` names the encoding; the rules
// themselves are host-neutral and are written as `redirects.json` regardless,
// so a site whose host is not listed here — or whose redirects live in a file
// it already owns — has the data without kiss pretending to own the file.
//
// **The IR is the default and `format` is opt-in.** `null` emits
// `redirects.json` and no host file: the portable fact, and no guess about
// where the site is deployed. That is a change from v2.3, which always wrote
// `_redirects` — so a build that has aliases and never set `format` gets one
// `notice` naming the fix, because losing a host's redirects in silence is the
// failure this whole block exists to abolish. An explicit `'none'` or `[]`
// says the same thing deliberately and is silent.
//
// It takes a **list**: a site can deploy to more than one host (Netlify
// previews, Firebase production) and choosing one at build time would mean
// building twice. A bare string or function is a list of one.
//
// `'netlify'` is v2.3's behaviour exactly: `_redirects`, the Netlify and
// Cloudflare Pages format. `'firebase'`, `'vercel'` and
// `'htaccess'` emit a **fragment to merge**, never the host's real config file: a site's
// `firebase.json` holds hosting targets, headers and rewrites, and one real
// site maintains 227 redirects in it by hand — rewriting that from a build step
// is not a thing this package should do. `'none'` writes the IR and no host
// file, which is the honest setting for a site that owns the concern itself. A
// function is a custom writer: it receives the resolved rules and returns the
// files to write, so a host kiss has never heard of needs no change here.
export const DEFAULT_REDIRECTS = Object.freeze({
  format: null,
})

// Derived, never repeated: `lib/redirects.js`'s `HOST_FORMATS` is the one
// table that says which formats exist, and `'none'` is the only name here that
// deliberately has no row in it (it writes the IR and no host file). Listing
// the names again in this file would let a format be accepted here and
// dispatch to nothing there — validating cleanly, writing no host file, and
// reporting success. `test/unit/redirects.test.js` asserts every accepted name
// actually writes one, so the derivation is checked rather than assumed.
export const REDIRECT_FORMATS = Object.freeze([
  ...Object.keys(HOST_FORMATS),
  'none',
])

export const DEFAULT_CONFIG = Object.freeze({
  dev: false,
  verbose: false,
  cleanBuild: true,
  extensionLess: false,
  sass: { includePaths: [] },
  fetch: DEFAULT_FETCH,
  assets: DEFAULT_ASSETS,
  markdown: DEFAULT_MARKDOWN,
  links: DEFAULT_LINKS,
  redirects: DEFAULT_REDIRECTS,
  port: 3001,
  livereloadPort: 35729,
  devHost: '127.0.0.1',
})

const DERIVED_FROM_SRC = [
  'assets',
  'layouts',
  'pages',
  'partials',
  'models',
  'controllers',
]

// Every folder string is path arithmetic later on (globbing, slicing a
// relative name back out of a result), so a trailing slash or a Windows
// separator that reaches a consumer breaks it silently. Normalise once, here.
// `./` and `/` are whole paths in themselves and keep their slash.
/**
 * @param {*} folder
 * @returns {*} the folder with `\` as `/`, repeated and trailing slashes gone
 */
function normaliseFolder(folder) {
  if (typeof folder !== 'string') return folder
  const slashes = folder.replace(/\\/g, '/')
  // Keep the UNC prefix: collapsing it would change the filesystem location.
  const posix =
    (/^\/\/[^/]/.test(slashes) ? '/' : '') + slashes.replace(/\/{2,}/g, '/')
  const trimmed = posix.replace(/\/+$/, '')
  return trimmed === '' || trimmed === '.' ? posix : trimmed
}

// A key spread in with the value `undefined` wins over the default and leaves
// the config hole-punched: `new Kiss({ port: process.env.PORT })` with PORT
// unset used to bind a random port. An absent value means "use the default";
// `null` is a real value (it switches a folder off) and survives.
/**
 * @template {Record<string, any>} T
 * @param {T} object
 * @returns {Partial<T>} the same object without its undefined-valued keys
 */
function withoutUndefined(object) {
  // `Object.fromEntries` widens to `{[k: string]: any}`; the cast restores the
  // relationship to T that the signature promises.
  return /** @type {Partial<T>} */ (
    Object.fromEntries(
      Object.entries(object).filter(([, value]) => value !== undefined),
    )
  )
}

/**
 * @param {KissFoldersInput} [userFolders]
 * @returns {KissFolders} every folder key present and path-normalised
 */
export function resolveFolders(userFolders = {}) {
  const supplied = withoutUndefined(userFolders)
  // Annotated, or spreading the frozen defaults narrows every value to its
  // literal (`src` becomes the type `'./src'`) and no real path can be assigned.
  /** @type {KissFolders} */
  const folders = { ...DEFAULT_FOLDERS }
  if (supplied.src) {
    folders.src = supplied.src
    for (const key of DERIVED_FROM_SRC) folders[key] = `${supplied.src}/${key}`
  }
  return /** @type {KissFolders} */ (
    Object.fromEntries(
      Object.entries({ ...folders, ...supplied }).map(([key, folder]) => [
        key,
        normaliseFolder(folder),
      ]),
    )
  )
}

export const CLEAN_BUILD_VALUES = Object.freeze([true, false, 'atomic'])

// Realpath the nearest existing ancestor, then append missing descendants.
// Resolving only a complete path misses aliases whenever output is not yet
// created. Inspection errors and dangling links must fail closed: guessing a
// lexical path here would turn an unreadable source into permission to erase it.
/** @param {string} folder @returns {string} */
function realFolder(folder) {
  let current = path.resolve(folder)
  const missing = []
  for (;;) {
    try {
      return path.join(fs.realpathSync.native(current), ...missing)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      // lstat sees a dangling link even though realpath cannot resolve it.
      if (fs.lstatSync(current, { throwIfNoEntry: false })) throw error
      const parent = path.dirname(current)
      if (parent === current) throw error
      missing.unshift(path.basename(current))
      current = parent
    }
  }
}

/** @param {string} folder @param {string} key @returns {string[]} */
function folderLocations(folder, key) {
  try {
    return [...new Set([path.resolve(folder), realFolder(folder)])]
  } catch (cause) {
    throw new Error(
      `Cannot safely resolve ${key === 'cwd' ? 'working directory' : `folders.${key}`} (${folder}): ${cause.message}`,
      {
        cause,
      },
    )
  }
}

// Validation is read-only and runs before Kiss's constructor touches the tree.
// src is a container: src/public is legal, but output inside any actual content
// folder is not. Both spellings matter — deleting a source link is destructive
// even when its target happens to live outside the build folder.
/**
 * @param {KissFolders} folders
 * @returns {void}
 */
function assertBuildFolderIsSafe(folders) {
  const project = folderLocations(process.cwd(), 'cwd')
  const isRoot = (location) =>
    project.some((root) => path.relative(root, location) === '') ||
    path.relative(path.parse(location).root, location) === ''
  const src = folders.src == null ? [] : folderLocations(folders.src, 'src')
  if (src.some(isRoot))
    throw new Error(
      `folders.src (${folders.src}) must not be the project root or a filesystem root; use a dedicated source folder such as ./src`,
    )
  if (folders.build == null) return
  const build = folderLocations(folders.build, 'build')
  if (build.some(isRoot))
    throw new Error(
      `Refusing to build into ${folders.build}: the build folder must not be the project root or a filesystem root`,
    )

  for (const key of ['src', ...DERIVED_FROM_SRC, 'helpers', 'aikb']) {
    if (folders[key] == null) continue
    const source = key === 'src' ? src : folderLocations(folders[key], key)
    if (build.some((output) => source.some((input) => isInside(output)(input))))
      throw new Error(
        `Refusing to build into ${folders.build}: the build folder equals or contains folders.${key} (${folders[key]})`,
      )
    if (
      key !== 'src' &&
      build.some((output) => source.some((input) => isInside(input)(output)))
    )
      throw new Error(
        `Refusing to build into ${folders.build}: the build folder is inside folders.${key} (${folders[key]})`,
      )
  }
}

// Every step is a command this process will spawn, so the shape is checked
// A misspelled format is the exact failure this key exists to end: `'firbase'`
// would write no host file at all, report success, and leave every old URL
// 404ing — silently, which is what `aliases` on an unsupported host already
// does today. Refused here with the offending value in the message, the way
// `cleanBuild` is, rather than discovered on the deployed site. Every entry of
// a list is checked, so one typo in an array of four is named rather than
// quietly dropped.
//
// `null` and `undefined` are legal: they mean "no host format", the default,
// which writes the IR alone.
/**
 * @param {*} format the merged `redirects.format`
 * @returns {void}
 * @throws if any entry is neither a known format name nor a writer function
 */
function assertRedirectFormatIsValid(format) {
  if (format === undefined || format === null) return
  for (const entry of Array.isArray(format) ? format : [format]) {
    if (typeof entry === 'function') continue
    if (REDIRECT_FORMATS.includes(entry)) continue
    throw new Error(
      `config.redirects.format must be one of ${REDIRECT_FORMATS.map((name) => `'${name}'`).join(', ')}, a writer function, or an array of those (received ${JSON.stringify(entry)})`,
    )
  }
}

// once, here, rather than discovered as a `spawn` of `undefined` in the middle
// of a build. Validated the way `cleanBuild` is: refused with the offending
// value in the message, never coerced.
/**
 * @param {*} pipeline the merged `assets.pipeline`
 * @returns {void}
 * @throws if it is not an array of `{ run: string }` objects
 */
function assertPipelineIsValid(pipeline) {
  if (!Array.isArray(pipeline))
    throw new Error(
      `config.assets.pipeline must be an array of steps (received ${JSON.stringify(pipeline)})`,
    )
  pipeline.forEach((step, index) => {
    const at = `config.assets.pipeline[${index}]`
    if (!step || typeof step !== 'object' || Array.isArray(step))
      throw new Error(
        `${at} must be an object with a string \`run\` (received ${JSON.stringify(step)})`,
      )
    if (typeof step.run !== 'string' || step.run.trim() === '')
      throw new Error(
        `${at}.run must be a non-empty string — the command to run (received ${JSON.stringify(step.run)})`,
      )
    for (const key of ['name', 'watch', 'cwd']) {
      if (step[key] !== undefined && typeof step[key] !== 'string')
        throw new Error(
          `${at}.${key} must be a string (received ${JSON.stringify(step[key])})`,
        )
    }
  })
}

/**
 * @param {KissConfigInput} [userConfig]
 * @returns {KissConfig} the defaults with `userConfig` merged over them
 * @throws if `cleanBuild` is not `true`, `false` or `'atomic'`, if
 * `assets.pipeline` is not an array of `{ run: string }` steps, or if source
 * and output folders violate the root/overlap safety rules
 */
export function resolveConfig(userConfig = {}) {
  const supplied = withoutUndefined(userConfig)
  const config = {
    ...DEFAULT_CONFIG,
    ...supplied,
    sass: {
      ...DEFAULT_CONFIG.sass,
      ...withoutUndefined(supplied.sass || {}),
    },
    fetch: {
      ...DEFAULT_FETCH,
      ...withoutUndefined(supplied.fetch || {}),
    },
    assets: {
      ...DEFAULT_ASSETS,
      ...withoutUndefined(supplied.assets || {}),
    },
    markdown: {
      ...DEFAULT_MARKDOWN,
      ...withoutUndefined(supplied.markdown || {}),
    },
    links: {
      ...DEFAULT_LINKS,
      ...withoutUndefined(supplied.links || {}),
    },
    redirects: {
      ...DEFAULT_REDIRECTS,
      ...withoutUndefined(supplied.redirects || {}),
    },
  }
  if (!CLEAN_BUILD_VALUES.includes(config.cleanBuild))
    throw new Error(
      `config.cleanBuild must be true, false or 'atomic' (received ${JSON.stringify(config.cleanBuild)})`,
    )
  assertRedirectFormatIsValid(config.redirects.format)
  assertPipelineIsValid(config.assets.pipeline)
  // Held in a local so the assertion sees the resolved (complete) shape:
  // reading it back off `config` widens it to the partial the input type allows.
  const folders = resolveFolders(supplied.folders)
  config.folders = folders
  assertBuildFolderIsSafe(folders)
  // `config` is assembled key by key above, so its inferred shape is the union
  // of those steps rather than the contract this function promises.
  return /** @type {KissConfig} */ (config)
}

// Every folder Kiss creates on start-up. v1 only created most of these when
// `assets` was set (a copy-paste bug); each folder now stands on its own.
/**
 * @param {KissFolders} folders
 * @returns {string[]} the folders `Kiss` creates on start-up, skipping any set
 * to `null`. `aikb` is not among them: an empty `AIKB/` in every site that has
 * never recorded one would be a promise the build does not keep.
 */
export function foldersToEnsure(folders) {
  return [
    'src',
    'pages',
    'build',
    'assets',
    'layouts',
    'partials',
    'models',
    'controllers',
  ]
    .map((key) => folders[key])
    .filter(Boolean)
}
