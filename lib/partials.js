import fs from 'fs-extra'
import glob from 'glob'

// glob v7 returns paths prefixed exactly as they were passed in, so the
// partial name is whatever follows the folder we globbed.
export function registerPartialsFrom(hbs, folder, ext, { markdown, logger }) {
  if (!folder) return []
  const files = glob.sync(`${folder}/**/*.${ext}`)
  return files.map((file) => {
    let name = file.slice(folder.length).replace(new RegExp(`\\.${ext}$`), '')
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
