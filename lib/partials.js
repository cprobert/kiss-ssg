import fs from 'fs-extra'
import { globFiles, posixPath } from './utils.js'

// `globFiles` returns posix paths with any leading `./` stripped, so the partial
// name is whatever follows the folder — normalised the same way.
export function registerPartialsFrom(
  hbs,
  folder,
  ext,
  { markdown, logger, graph },
) {
  if (!folder) return []
  const root = posixPath(folder)
  const files = globFiles(root, `**/*.${ext}`)
  return files.map((file) => {
    let name = file.slice(root.length).replace(new RegExp(`\\.${ext}$`), '')
    if (name.startsWith('/')) name = name.slice(1)
    let source = fs.readFileSync(file, 'utf8')
    if (ext === 'md') source = markdown.render(source)
    hbs.registerPartial(name, tracingPartial(hbs, name, source, graph))
    logger.highlight(name)
    return name
  })
}

// A function partial is called by Handlebars as `partial(context, options)`
// (runtime `invokePartial`) and by handlebars-layouts' `extend`/`embed` as
// `template(context, { data })`. Both hand over the data frame, which is where
// `KissPage.generate()` put the page's identity, so the wrapper knows who is
// rendering without any shared state. It must return exactly what the compiled
// template returns — a string — or Handlebars tries to compile the function
// (`undefined`) or splits a SafeString on newlines for an indented call.
function tracingPartial(hbs, name, source, graph) {
  const compiled = hbs.compile(source)
  return (context, options) => {
    const page = options?.data?.kissPage
    if (graph && page) {
      try {
        graph.record(page, name)
      } catch {
        // Tracing must never affect rendering.
      }
    }
    return compiled(context, options)
  }
}

/**
 * The name `registerPartialsFrom` derives for a file, from its path alone —
 * so a watcher event can be mapped to the partial it names. `null` when the
 * file is under neither folder.
 *
 * @param {string} file a path as chokidar reports it (native or posix)
 * @param {{ partials?: string | null, layouts?: string | null }} folders
 * @returns {string | null}
 */
export function partialNameFor(file, folders) {
  const target = posixPath(file)
  for (const folder of [folders.partials, folders.layouts]) {
    if (!folder) continue
    const root = posixPath(folder).replace(/\/+$/, '')
    if (!target.startsWith(`${root}/`)) continue
    return target.slice(root.length + 1).replace(/\.[^./]+$/, '')
  }
  return null
}

// Every partial is registered as a compiled, recording function — see
// `tracingPartial`. Two things that used to be true still hold: a layout is
// compiled once rather than on every `{{#extend}}` (handlebars-layouts
// compiles a string partial per render and never writes the result back), and
// `hbs.compile` is lazy, so a partial that will not parse still fails at
// render, against the page that used it, not at registration.
//
// `hbs.partials[name]` is therefore always a function. It was a string only
// until the first render anyway — Handlebars compiles a string partial on first
// use and writes the function back into the same object — so a consumer helper
// that reads an entry has always had to accept both shapes; the migration notes
// (llms.txt, README) give the one-line form.

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
