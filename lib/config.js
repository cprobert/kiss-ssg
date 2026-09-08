import path from 'node:path'

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
 */

/**
 * A `folders` block as a site writes it: every key optional. Setting `src`
 * re-derives `pages`, `assets`, `layouts`, `partials`, `models` and
 * `controllers` from it, unless the same object also sets them explicitly.
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
 * from `DEFAULT_CONFIG`/`DEFAULT_FOLDERS`. `folders`, `sass`, `fetch`, `assets`
 * and `markdown` are partial here because each is merged exactly one level deep,
 * so a site sets the one key it cares about and keeps the defaults around it.
 *
 * @typedef {Partial<Omit<KissSettings, 'sass'|'fetch'|'assets'|'markdown'>> & {
 *   sass?: { includePaths?: string[] },
 *   fetch?: Partial<KissFetch>,
 *   assets?: Partial<KissAssets>,
 *   markdown?: Partial<KissMarkdown> & Record<string, any>,
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
export const DEFAULT_MARKDOWN = Object.freeze({
  html: true,
  xhtmlOut: true,
  breaks: false,
})

export const DEFAULT_CONFIG = Object.freeze({
  dev: false,
  verbose: false,
  cleanBuild: true,
  extensionLess: false,
  sass: { includePaths: [] },
  fetch: DEFAULT_FETCH,
  assets: DEFAULT_ASSETS,
  markdown: DEFAULT_MARKDOWN,
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
  const posix = folder.replace(/\\/g, '/').replace(/\/{2,}/g, '/')
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

// The build folder is emptied (or, under 'atomic', replaced wholesale), so a
// build folder that contains the site's own source is a config that deletes
// the site. Refused whatever `cleanBuild` says: `false` today is one edit away
// from `true`. It is a floor, not a fix — a build folder holding published
// output that is *not* the source (an archive root) is still the consumer's
// to validate; 'atomic' is what makes a failed build there survivable.
/**
 * @param {KissFolders} folders
 * @returns {void}
 */
function assertBuildFolderIsSafe(folders) {
  if (!folders.build || !folders.src) return
  const build = path.resolve(folders.build)
  const src = path.resolve(folders.src)
  const swallowsSource = build === src || src.startsWith(build + path.sep)
  if (swallowsSource || build === path.parse(build).root)
    throw new Error(
      `Refusing to build into ${folders.build}: the build folder is emptied on every build, and this one contains the source folder (${folders.src})`,
    )
}

// Every step is a command this process will spawn, so the shape is checked
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
 * `assets.pipeline` is not an array of `{ run: string }` steps, or if the build
 * folder contains the source folder
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
  }
  if (!CLEAN_BUILD_VALUES.includes(config.cleanBuild))
    throw new Error(
      `config.cleanBuild must be true, false or 'atomic' (received ${JSON.stringify(config.cleanBuild)})`,
    )
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
 * @returns {string[]} the folders `Kiss` creates on start-up, skipping any set to `null`
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
