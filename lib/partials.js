import fs from 'fs-extra'
import { globFiles, posixPath } from './utils.js'

// `globFiles` returns posix paths with any leading `./` stripped, so the partial
// name is whatever follows the folder — normalised the same way.
export function registerPartialsFrom(hbs, folder, ext, { markdown, logger }) {
  if (!folder) return []
  const root = posixPath(folder)
  const files = globFiles(`${root}/**/*.${ext}`)
  return files.map((file) => {
    let name = file.slice(root.length).replace(new RegExp(`\\.${ext}$`), '')
    if (name.startsWith('/')) name = name.slice(1)
    let source = fs.readFileSync(file, 'utf8')
    if (ext === 'md') source = markdown.render(source)
    hbs.registerPartial(name, source)
    logger.highlight(name)
    return name
  })
}

// The registered set mirrors disk: `previous` is what the last full pass
// produced, and any name it holds that this pass did not produce has lost its
// file and is unregistered. It has to be all four passes and a name diff, never
// a per-file re-register: `foo.html`, `foo.md`, `foo.hbs` and a layout `foo`
// all derive the name `foo` and the last pass wins, so unregistering by file
// would drop a winner that is still on disk.
export function registerPartials(hbs, config, deps, previous = []) {
  deps.logger.info('Registering partials:')
  const { partials, layouts } = config.folders
  const names = [
    ...registerPartialsFrom(hbs, partials, 'html', deps),
    ...registerPartialsFrom(hbs, partials, 'md', deps),
    ...registerPartialsFrom(hbs, partials, 'hbs', deps),
    ...registerPartialsFrom(hbs, layouts, 'hbs', deps),
  ]
  const current = new Set(names)
  for (const name of previous) {
    if (current.has(name)) continue
    hbs.unregisterPartial(name)
    deps.logger.info('Unregistered partial:', name)
  }
  return names
}
