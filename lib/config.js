import path from 'node:path'

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

// The cache-busting policy for emitted assets. Off by default, so a site that
// never sets the block emits exactly the files it always did: the manifest
// behind `{{asset}}` is built either way, but nothing is renamed until a
// policy asks for it.
export const DEFAULT_ASSETS = Object.freeze({
  hash: false,
  version: null,
})

export const DEFAULT_CONFIG = Object.freeze({
  dev: false,
  verbose: false,
  cleanBuild: true,
  extensionLess: false,
  sass: { includePaths: [] },
  fetch: DEFAULT_FETCH,
  assets: DEFAULT_ASSETS,
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
function withoutUndefined(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value !== undefined),
  )
}

export function resolveFolders(userFolders = {}) {
  const supplied = withoutUndefined(userFolders)
  const folders = { ...DEFAULT_FOLDERS }
  if (supplied.src) {
    folders.src = supplied.src
    for (const key of DERIVED_FROM_SRC) folders[key] = `${supplied.src}/${key}`
  }
  return Object.fromEntries(
    Object.entries({ ...folders, ...supplied }).map(([key, folder]) => [
      key,
      normaliseFolder(folder),
    ]),
  )
}

export const CLEAN_BUILD_VALUES = Object.freeze([true, false, 'atomic'])

// The build folder is emptied (or, under 'atomic', replaced wholesale), so a
// build folder that contains the site's own source is a config that deletes
// the site. Refused whatever `cleanBuild` says: `false` today is one edit away
// from `true`. It is a floor, not a fix — a build folder holding published
// output that is *not* the source (an archive root) is still the consumer's
// to validate; 'atomic' is what makes a failed build there survivable.
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
  }
  if (!CLEAN_BUILD_VALUES.includes(config.cleanBuild))
    throw new Error(
      `config.cleanBuild must be true, false or 'atomic' (received ${JSON.stringify(config.cleanBuild)})`,
    )
  config.folders = resolveFolders(supplied.folders)
  assertBuildFolderIsSafe(config.folders)
  return config
}

// Every folder Kiss creates on start-up. v1 only created most of these when
// `assets` was set (a copy-paste bug); each folder now stands on its own.
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
