import fs from 'fs-extra'
import { globFiles, posixPath } from './utils.js'

/**
 * A partial transform (`config.transforms[ext]`): what kiss does to a partial
 * of that extension each time a page calls it.
 *
 * @typedef {Object} KissTransform
 * @property {boolean} [compile] whether the file is compiled as Handlebars
 * before `render` sees it; `true` by default, `false` hands `render` the
 * file's own characters
 * @property {(output: string, ctx: KissTransformContext) => string} render
 * called per partial call, after Handlebars, with the rendered string; its
 * return value is inserted into the page raw. Synchronous: anything async
 * belongs in `setup`
 * @property {() => any} [setup] awaited once, before the first page renders;
 * a rejection fails every page that calls a partial of this extension
 */

/**
 * What a transform's `render` is told about the call.
 *
 * @typedef {Object} KissTransformContext
 * @property {string} name the partial's name, as a template calls it
 * @property {string} file the partial's file
 * @property {string|undefined} page the output path of the page rendering it
 * @property {any} context the partial's context, as Handlebars passed it
 * @property {Record<string, any>} hash the call's hash arguments
 * (`{{> callout tone="warn"}}` is `{ tone: 'warn' }`); `{}` when none
 */

// The extensions kiss compiles as Handlebars and inserts as they render: the
// identity transform. They are not in the table, and a site cannot list them.
export const TEMPLATE_EXTENSIONS = Object.freeze(['html', 'hbs'])

/**
 * The built-in transforms, before a site's `config.transforms` is laid over
 * them. `.md` renders per call, AFTER Handlebars — so `{{link "x"}}` is a URL
 * and `{{> "nav"}}` is markup before Markdown reads the line — and `.txt` is
 * the file's own characters, escaped.
 *
 * @param {{ markdown: { render: (src: string) => string }, hbs: any }} deps
 * @returns {Record<string, KissTransform>}
 */
export function builtInTransforms({ markdown, hbs }) {
  return {
    md: { render: (output) => markdown.render(output) },
    txt: {
      compile: false,
      render: (output) => hbs.Utils.escapeExpression(output),
    },
  }
}

/**
 * Runs every transform's `setup` once. Never rejects: a failed setup is
 * returned against its extension, so the caller can report it and the
 * partials of that extension can fail the pages that call them.
 *
 * @param {Record<string, KissTransform>} transforms
 * @returns {Promise<Map<string, Error>>} the extensions whose setup failed
 */
export async function setupTransforms(transforms) {
  const failed = new Map()
  await Promise.all(
    Object.entries(transforms).map(async ([ext, transform]) => {
      if (!transform.setup) return
      try {
        await transform.setup()
      } catch (error) {
        failed.set(
          ext,
          error instanceof Error ? error : new Error(String(error)),
        )
      }
    }),
  )
  return failed
}

// `globFiles` returns posix paths with any leading `./` stripped, so the partial
// name is whatever follows the folder — normalised the same way.
function filesIn(folder, extensions) {
  if (!folder) return []
  const root = posixPath(folder)
  return extensions.flatMap((ext) =>
    globFiles(root, `**/*.${ext}`).map((file) => {
      let name = file.slice(root.length).replace(new RegExp(`\\.${ext}$`), '')
      if (name.startsWith('/')) name = name.slice(1)
      return { file, name, ext }
    }),
  )
}

// `.txt` is the one partial type kiss does NOT compile. The extension is a
// statement about processing — `.hbs` is a template, `.md` is rendered
// Markdown, `.html` is HTML, and all three are compiled, so `{{ }}` inside an
// `.html` partial IS interpolated — and `.txt` completes it: the file's
// own characters reach the page. Escaped exactly as `{{ }}` escapes a value,
// so the rule is one an author can hold in their head ("a `.txt` partial
// behaves as if you had written `{{ }}` around its contents"), and safe in an
// attribute as well as in body text.
//
// Two things follow, and both are the point rather than a limitation.
// `{{name}}` inside a `.txt` file is printed, not interpolated: a snippet can
// show template syntax without being one. And markup is shown rather than
// rendered, so a code sample drops into a `<pre>` with no hand-escaping —
// which is the case that has no good answer today.
//
// It still records itself on the dependency graph, so an edited `.txt` partial
// re-renders exactly the pages that used it, like any other. It is the built-in
// `txt` transform: `compile: false`, and `render` escapes.

// A function partial is called by Handlebars as `partial(context, options)`
// (runtime `invokePartial`) and by handlebars-layouts' `extend`/`embed` as
// `template(context, { data })`. Both hand over the data frame, which is where
// `KissPage.generate()` put the page's identity, so the wrapper knows who is
// rendering without any shared state. It must return a plain string — a
// partial's return value is inserted raw — or Handlebars tries to compile the
// function (`undefined`) or splits a SafeString on newlines for an indented
// call. So a transform's `render` returns a string too, and is inserted raw.
//
// `transform` is undefined for `.html`/`.hbs` (the identity). `failed` is the
// shared map `setupTransforms` filled: read at call time, because registration
// is synchronous and the setups settle later, before the first render.
function transformingPartial(hbs, { name, file, ext, source }, deps) {
  const { graph, transform, failed } = deps
  const compiled = transform?.compile === false ? null : hbs.compile(source)
  return (context, options) => {
    const page = options?.data?.kissPage
    if (graph && page) {
      try {
        graph.record(page, name)
      } catch {
        // Tracing must never affect rendering.
      }
    }
    const setupError = failed?.get(ext)
    if (setupError)
      throw new Error(
        `Partial "${name}" (${file}) cannot render: the .${ext} transform's setup failed: ${setupError.message}`,
      )
    const output = compiled ? compiled(context, options) : source
    if (!transform) return output
    return transform.render(output, {
      name,
      file,
      page,
      context,
      hash: options?.hash ?? {},
    })
  }
}

// Two files that derive one name. Handlebars keeps one registration per name,
// and which file won used to be the fixed order of the passes; with a table of
// extensions a site can extend, an order is arbitrary, so the name is
// registered as a partial that fails every page calling it, naming both files.
function collidingPartial(name, files) {
  return () => {
    throw new Error(collisionMessage(name, files))
  }
}

function collisionMessage(name, files) {
  return `Partial "${name}" is defined by more than one file: ${files.join(', ')}. Rename all but one.`
}

/**
 * The name `registerPartials` derives for a file, from its path alone —
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

// Every partial is registered as a recording function — see
// `transformingPartial`. Two things that used to be true still hold: a layout is
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

/**
 * Registers every partial and layout from disk, and unregisters any name the
 * previous pass produced that this one did not.
 *
 * The registered set mirrors disk: `previous` is what the last full pass
 * produced, and a name it holds that this pass did not has lost its file. The
 * extension decides the processing — `.html` and `.hbs` are compiled, every
 * other extension is looked up in the transform table (the built-ins, with
 * `config.transforms` laid over them) and a file whose extension is in neither
 * is not a partial. Layouts are `.hbs` only. Two files that derive one name
 * (`foo.md` and `foo.hbs`, or a partial and a layout) are a collision: the name
 * fails every page that calls it, and the collision is returned for the build
 * to report.
 *
 * @param {any} hbs the Handlebars environment
 * @param {{ folders: { partials?: string|null, layouts?: string|null }, transforms?: Record<string, KissTransform> }} config
 * @param {{ markdown: any, logger: any, graph?: any, failed?: Map<string, Error> }} deps
 * `failed` is the map `setupTransforms` fills, read when a partial renders
 * @param {string[]} [previous] the names the last pass registered
 * @returns {{ names: string[], collisions: { name: string, files: string[], error: Error }[] }}
 */
export function registerPartials(hbs, config, deps, previous = []) {
  deps.logger.info('Registering partials:')
  const { partials, layouts } = config.folders
  const transforms = {
    ...builtInTransforms({ markdown: deps.markdown, hbs }),
    ...(config.transforms || {}),
  }
  const found = [
    ...filesIn(partials, [...TEMPLATE_EXTENSIONS, ...Object.keys(transforms)]),
    ...filesIn(layouts, ['hbs']).map((entry) => ({ ...entry, layout: true })),
  ]
  const byName = new Map()
  for (const entry of found) {
    const entries = byName.get(entry.name) || []
    entries.push(entry)
    byName.set(entry.name, entries)
  }
  const collisions = []
  for (const [name, entries] of byName) {
    if (entries.length > 1) {
      const files = entries.map((entry) => entry.file)
      collisions.push({
        name,
        files,
        error: new Error(collisionMessage(name, files)),
      })
      hbs.registerPartial(name, collidingPartial(name, files))
      deps.logger.error(collisionMessage(name, files))
      continue
    }
    const [entry] = entries
    const transform = entry.layout ? undefined : transforms[entry.ext]
    hbs.registerPartial(
      name,
      transformingPartial(
        hbs,
        { ...entry, source: fs.readFileSync(entry.file, 'utf8') },
        { graph: deps.graph, transform, failed: deps.failed },
      ),
    )
    deps.logger.highlight(name)
  }
  const names = [...byName.keys()]
  const current = new Set(names)
  for (const name of previous) {
    if (current.has(name)) continue
    hbs.unregisterPartial(name)
    deps.logger.info('Unregistered partial:', name)
  }
  return { names, collisions }
}
