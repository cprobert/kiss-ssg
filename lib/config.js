export const DEFAULT_FOLDERS = Object.freeze({
  root: './',
  src: './src',
  pages: './src/pages',
  build: './public',
  assets: './src/assets',
  static: './src/static',
  layouts: './src/layouts',
  partials: './src/partials',
  models: './src/models',
  controllers: './src/controllers',
})

export const DEFAULT_CONFIG = Object.freeze({
  dev: false,
  verbose: false,
  cleanBuild: true,
  extensionLess: false,
  sass: { includePaths: [] },
  port: 3001,
})

const DERIVED_FROM_SRC = [
  'assets',
  'static',
  'layouts',
  'pages',
  'partials',
  'models',
  'controllers',
]

export function resolveFolders(userFolders = {}) {
  const folders = { ...DEFAULT_FOLDERS }
  if (userFolders.src) {
    folders.src = userFolders.src
    for (const key of DERIVED_FROM_SRC)
      folders[key] = `${userFolders.src}/${key}`
  }
  return { ...folders, ...userFolders }
}

export function resolveConfig(userConfig = {}) {
  const config = {
    ...DEFAULT_CONFIG,
    ...userConfig,
    sass: { ...DEFAULT_CONFIG.sass, ...(userConfig.sass || {}) },
  }
  config.folders = resolveFolders(userConfig.folders)
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
