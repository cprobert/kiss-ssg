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

export function registerPartials(hbs, config, deps) {
  deps.logger.info('Registering partials:')
  const { partials, layouts } = config.folders
  return [
    ...registerPartialsFrom(hbs, partials, 'html', deps),
    ...registerPartialsFrom(hbs, partials, 'md', deps),
    ...registerPartialsFrom(hbs, partials, 'hbs', deps),
    ...registerPartialsFrom(hbs, layouts, 'hbs', deps),
  ]
}
