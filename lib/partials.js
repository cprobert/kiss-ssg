import fs from 'fs-extra'
import { globFiles, posixPath } from './utils.js'

// `globFiles` returns posix paths with any leading `./` stripped, so the partial
// name is whatever follows the folder — normalised the same way.
export function registerPartialsFrom(
  hbs,
  folder,
  ext,
  { markdown, logger },
  { compiled = false } = {},
) {
  if (!folder) return []
  const root = posixPath(folder)
  const files = globFiles(root, `**/*.${ext}`)
  return files.map((file) => {
    let name = file.slice(root.length).replace(new RegExp(`\\.${ext}$`), '')
    if (name.startsWith('/')) name = name.slice(1)
    let source = fs.readFileSync(file, 'utf8')
    if (ext === 'md') source = markdown.render(source)
    hbs.registerPartial(name, compiled ? hbs.compile(source) : source)
    logger.highlight(name)
    return name
  })
}

// Layouts are registered compiled; every other partial stays a source string.
//
// `handlebars-layouts`' `extend` helper reads `handlebars.partials[name]` and,
// when it finds a string, compiles it — without ever writing the result back.
// So a layout was recompiled from source on *every page render*: 500 compiles
// of one file in a 500-page build. It is the single largest item in the CPU
// profile of a build (1.18ms a compile on the benchmark's small layout, 588ms
// of a 1291ms build; 3.01ms on diploma-msc's 6.4KB layout, ~2s across its 669
// pages). Registering the compiled function makes `typeof template !== function`
// false and the helper uses it as-is.
//
// Only layouts, deliberately. `hbs.partials` is observable — consuming sites
// read it in their own helpers, and at least one of them calls
// `handlebars.compile(partial)` unconditionally, which throws on a function. A
// layout is not reachable that way in any site surveyed (none has a partial
// sharing a layout's name), and regular `{{> partial}}` lookups are already
// compiled once and cached by Handlebars itself, so there is nothing to win by
// converting them and a real compatibility risk in doing so.
//
// `hbs.compile` is lazy — it returns a wrapper that parses on first invocation
// — which carries two useful properties for free. A layout that is never
// rendered costs nothing here; and a layout that will not parse still fails at
// render, against the page that used it, exactly as it did when the helper
// compiled it. So there is no error handling to add: registering eagerly moves
// no failure earlier.

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
    ...registerPartialsFrom(hbs, layouts, 'hbs', deps, { compiled: true }),
  ]
  const current = new Set(names)
  for (const name of previous) {
    if (current.has(name)) continue
    hbs.unregisterPartial(name)
    deps.logger.info('Unregistered partial:', name)
  }
  return names
}
