import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { CHECK_MODE_OFF } from './check.js'
import { RASTER_EXTENSION, readImageHeader } from './image-header.js'
import { isCacheFileName } from './image-encode.js'
import { isInside } from './utils.js'

// `kiss-ssg images <script>`, the encode cache's maintenance sweep. The bin
// runs the site's own build staged and discarded, as `check` does, with
// `KISS_IMAGES` naming a JSON Lines file: each instance's settle
// (`lib/build-finish.js` `encodeImages`) encodes its misses into the cache
// and appends one line saying which cache entries its pages asked for. Then
// this module decides, over every line of the run together:
//
// - which cache entries no page asked for, and removes them (never after a
//   failed build, whose pages may not all have asked);
// - which originals under the assets folder carry a GPS location or are
//   wider than the recipe's largest width, and, with `--write`, rewrites
//   them in `src/`, for the person to read in git before committing.
//
// The prune is here and never in a build: a build that pruned could delete
// what another branch's pages use, and a cache shared by several instances
// of one script is only safe to prune against all of them at once.

export const IMAGES_HELP = `kiss-ssg images <script> [--refresh] [--write] [-- args…]

Runs the site's build script staged and then discarded, as check does, so
it knows exactly which image variants the pages ask for. It encodes every
variant missing from the encode cache (assets.images.cache, by default
.kiss-cache/images, committed by the site) and removes cache entries no page
asked for. It prints how many entries were added, removed and kept, and
their bytes. Commit the cache afterwards.

It also lists each original under folders.assets that carries a GPS
location in its metadata, or is wider than the recipe's largest width.

  --refresh   encode every variant again, ignoring the cache
  --write     rewrite those originals in place: turned the right way up,
              metadata stripped, resized down to the largest width. A JPEG
              is re-encoded at quality 90 and a PNG losslessly; a file is
              replaced only when the result is smaller or it had GPS. Read
              the diff in git before committing it.
  --help      this text

Nothing in src/ changes without --write. Exits 1 if any site failed to
build, in which case the cache is not pruned.`

/**
 * What `kiss-ssg images` asked a build to do, from its environment.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {{ file: string, refresh: boolean }|null} `null` for any other build
 */
export function sweepRequest(env = process.env) {
  const file = env.KISS_IMAGES
  if (!file || CHECK_MODE_OFF.has(file.toLowerCase())) return null
  return {
    file,
    refresh: !CHECK_MODE_OFF.has(
      String(env.KISS_IMAGES_REFRESH ?? '').toLowerCase(),
    ),
  }
}

/**
 * One instance's line in the sweep file.
 *
 * @typedef {Object} SweepLine
 * @property {string|null} cache the cache folder, absolute, or `null` for none
 * @property {string[]} keys every cache entry its pages asked for
 * @property {string[]} encoded the entries it encoded now (the misses)
 * @property {string|null} assets its assets folder, absolute: the one folder
 * the sweep looks in for originals to fix
 * @property {string[]} copies every folder it copies into the build
 * (`.copyAssets()` included), absolute: never scanned for rewrites, but a
 * photo in one keeps the width this instance needs
 * @property {number} maxWidth the recipe's largest width
 * @property {boolean} failed some variant could not be encoded
 * @property {boolean} cacheSkipped the cache could not be written, so this
 * instance's misses were not kept: a build warns and carries on, the sweep
 * refuses
 */

/**
 * @param {Object} input
 * @param {string|null} input.cache
 * @param {string[]} input.keys
 * @param {string[]} input.encoded
 * @param {string|null} input.assets
 * @param {string[]} [input.copies]
 * @param {number} input.maxWidth
 * @param {boolean} [input.failed]
 * @param {boolean} [input.cacheSkipped]
 * @returns {SweepLine}
 */
export function sweepLine({
  cache,
  keys,
  encoded,
  assets,
  copies = [],
  maxWidth,
  failed = false,
  cacheSkipped = false,
}) {
  return {
    cache: cache ? path.resolve(cache) : null,
    keys: [...new Set(keys)].sort(),
    encoded: [...new Set(encoded)].sort(),
    assets: assets ? path.resolve(assets) : null,
    copies: [...new Set(copies.map((dir) => path.resolve(dir)))].sort(),
    maxWidth,
    failed,
    cacheSkipped,
  }
}

/**
 * @param {string[]} [argv] everything after `images`
 * @returns {{ script: string|null, args: string[], refresh: boolean, write: boolean, help: boolean, error: string|null }}
 */
export function parseImagesArgs(argv = []) {
  const parsed = {
    script: /** @type {string|null} */ (null),
    args: /** @type {string[]} */ ([]),
    refresh: false,
    write: false,
    help: false,
    error: /** @type {string|null} */ (null),
  }
  let at = 0
  for (; at < argv.length; at++) {
    const arg = argv[at]
    if (arg === '--') {
      at++
      break
    }
    if (arg === '--help' || arg === '-h') parsed.help = true
    else if (arg === '--refresh') parsed.refresh = true
    else if (arg === '--write') parsed.write = true
    else if (arg.startsWith('-')) {
      parsed.error = `unknown option: ${arg}`
      return parsed
    } else {
      // The script. What follows is the script's own, except the two flags
      // read below.
      parsed.script = arg
      at++
      break
    }
  }
  // After the script, `--write` and `--refresh` are still ours up to a `--`,
  // as check reads `--summary`: a site script never wants them, and passing
  // `--write` through rewrote nothing and exited 0 (2026-11-05). After `--`,
  // everything is the script's.
  const passed = argv.slice(at)
  const separator = passed.indexOf('--')
  const before = separator === -1 ? passed : passed.slice(0, separator)
  if (before.includes('--write')) parsed.write = true
  if (before.includes('--refresh')) parsed.refresh = true
  parsed.args = [
    ...before.filter((arg) => arg !== '--write' && arg !== '--refresh'),
    ...(separator === -1 ? [] : passed.slice(separator + 1)),
  ]
  if (!parsed.help && !parsed.script)
    parsed.error =
      "images needs the site's build script: kiss-ssg images <script>"
  return parsed
}

/**
 * The sweep file's lines.
 *
 * @param {string} text
 * @returns {SweepLine[]}
 */
export function readSweepLines(text = '') {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line))
}

/**
 * @typedef {{ count: number, bytes: number }} Tally
 */

/**
 * Remove every entry of one cache folder that is not kept, and count. A
 * file not named like a cache entry is neither removed nor counted.
 *
 * @param {Object} input
 * @param {string} input.dir
 * @param {Set<string>} input.keep the entries some page asked for
 * @param {Set<string>} input.encoded the entries this run added
 * @param {boolean} [input.dryRun] count, remove nothing
 * @returns {{ added: Tally, removed: Tally, kept: Tally }}
 */
export function pruneCache({ dir, keep, encoded, dryRun = false }) {
  const tally = () => ({ count: 0, bytes: 0 })
  const result = { added: tally(), removed: tally(), kept: tally() }
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return result
  }
  for (const name of names.sort()) {
    // Only the cache's own names are the sweep's to remove or count.
    if (!isCacheFileName(name)) continue
    const file = path.join(dir, name)
    let size
    try {
      const stat = fs.statSync(file)
      if (!stat.isFile()) continue
      size = stat.size
    } catch {
      continue
    }
    // An empty entry is not a hit, and a temp file is a write that never
    // finished: both go whatever was asked for.
    const live = keep.has(name) && size > 0
    const bucket = !live
      ? result.removed
      : encoded.has(name)
        ? result.added
        : result.kept
    bucket.count++
    bucket.bytes += size
    if (!live && !dryRun) fs.rmSync(file, { force: true })
  }
  return result
}

/**
 * @typedef {Object} Original
 * @property {string} file absolute
 * @property {string} format
 * @property {number} width as displayed
 * @property {boolean} gps
 * @property {boolean} wide wider than the recipe's largest width
 */

/**
 * The rasters under `dir` that carry a GPS location or are wider than
 * `maxWidth`, from their headers alone.
 *
 * @param {{ dir: string, maxWidth: number }} input
 * @returns {Original[]} by path
 */
export function findOriginals({ dir, maxWidth }) {
  /** @type {Original[]} */
  const found = []
  let entries
  try {
    entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isFile() || !RASTER_EXTENSION.test(entry.name)) continue
    const file = path.join(entry.parentPath, entry.name)
    const header = readImageHeader(file)
    if (!header || header.animated) continue
    const wide = header.width > maxWidth
    if (header.gps || wide)
      found.push({
        file,
        format: header.format,
        width: header.width,
        gps: header.gps,
        wide,
      })
  }
  return found.sort((a, b) => (a.file < b.file ? -1 : 1))
}

/**
 * Rewrite the originals: `autoOrient()`, metadata stripped (`sharp`'s
 * default), resized down to `maxWidth`, JPEG at quality 90, PNG losslessly,
 * WebP at 90 and AVIF at 75. A file is replaced only when the result is
 * smaller, or when it had GPS.
 *
 * @param {Original[]} originals
 * @param {number} maxWidth
 * @returns {Promise<{ file: string, before: number, after: number, replaced: boolean }[]>}
 */
export async function rewriteOriginals(originals, maxWidth) {
  const mod = await import('sharp')
  const sharp = /** @type {any} */ (mod.default ?? mod)
  // Read from a buffer, with libvips' cache off: on Windows a file libvips
  // still holds open cannot be written back to (measured: `UNKNOWN: unknown
  // error, open` on the rewrite).
  sharp.cache(false)
  const results = []
  for (const original of originals) {
    const input = fs.readFileSync(original.file)
    const before = input.length
    let pipeline = sharp(input, { failOn: 'error' })
      .autoOrient()
      .resize({ width: maxWidth, withoutEnlargement: true })
    if (original.format === 'jpeg')
      pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true })
    else if (original.format === 'png')
      pipeline = pipeline.png({ compressionLevel: 9 })
    else if (original.format === 'webp')
      pipeline = pipeline.webp({ quality: 90 })
    else pipeline = pipeline.avif({ quality: 75 })
    const bytes = await pipeline.toBuffer()
    const replaced = original.gps || bytes.length < before
    if (replaced) replaceWhole(original.file, bytes)
    results.push({ file: original.file, before, after: bytes.length, replaced })
  }
  return results
}

/**
 * Replace a source file whole or not at all. `writeFileSync` on the original
 * truncates it first, so a full disk or a killed process mid-write would
 * leave a broken photo that may not be in git yet. The bytes go to a temp
 * sibling, and only a complete one is renamed over the original; on any
 * failure the temp is removed and the original is untouched.
 *
 * @param {string} file
 * @param {Buffer} bytes
 */
function replaceWhole(file, bytes) {
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    fs.writeFileSync(temp, bytes)
    fs.renameSync(temp, file)
  } catch (error) {
    fs.rmSync(temp, { force: true })
    throw error
  }
}

/** @param {number} bytes */
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`

/**
 * The whole sweep, once the build has run: prune each cache against every
 * line that names it, list the originals, and rewrite them under `write`.
 *
 * @param {Object} input
 * @param {SweepLine[]} input.lines
 * @param {{ ok?: boolean }[]} input.reports the run's build reports
 * @param {{ status: number|null, signal?: string|null, error?: Error|null }} [input.script]
 * how the site's script itself ended. A script that settled one instance and
 * then threw has written only passing reports, so its exit decides too.
 * @param {boolean} [input.write]
 * @param {string} [input.cwd] what paths are printed relative to
 * @returns {Promise<{ out: string, err: string, code: 0|1, rerun: boolean }>}
 * `rerun` is true when an original was rewritten: its digest changed, so the
 * cache this pass left holds its old variants and lacks its new ones, and the
 * caller runs the build and this sweep once more, without `write`.
 */
export async function sweepImages({
  lines,
  reports,
  script = { status: 0 },
  write = false,
  cwd = process.cwd(),
}) {
  const shown = (file) =>
    path.relative(cwd, file).split(path.sep).join('/') || '.'
  const out = []
  const failed =
    script.status !== 0 ||
    Boolean(script.signal) ||
    Boolean(script.error) ||
    reports.length === 0 ||
    reports.some((report) => report?.ok !== true) ||
    lines.some((line) => line.failed)
  if (failed)
    return {
      out: '',
      err:
        lines.length === 0 && reports.length === 0
          ? 'kiss-ssg images: the build reported nothing, so the cache was not pruned'
          : 'kiss-ssg images: the build failed, so the cache was not pruned — fix the build and run it again',
      code: 1,
      rerun: false,
    }
  // Every settled build appends a line, a site with no {{image}} included, so
  // passing builds with none ran a kiss-ssg that ignores KISS_IMAGES (a newer
  // CLI over an older installed engine). Success here would be a --write that
  // did nothing (Codex adversarial review, 2026-11-05).
  if (lines.length === 0)
    return {
      out: '',
      err: 'kiss-ssg images: the build wrote no image inventory, so the kiss-ssg the script uses is older than this command — upgrade it (npx kiss-ssg@latest upgrade) and run this again',
      code: 1,
      rerun: false,
    }
  // The command's whole job is the cache: one it could not write is a
  // failure here, though a build only warns about it.
  if (lines.some((line) => line.cacheSkipped))
    return {
      out: '',
      err: 'kiss-ssg images: the encode cache could not be written, so nothing was kept or pruned — check that assets.images.cache is a folder this user can write',
      code: 1,
      rerun: false,
    }
  let rerun = false
  // Grouped by the folder on disk, not the spelling: two instances that reach
  // one cache by different paths (a junction, a case difference on Windows)
  // must each keep the other's entries (Codex adversarial review, 2026-11-05).
  /** @type {Map<string, { dir: string, keep: Set<string>, encoded: Set<string> }>} */
  const caches = new Map()
  for (const line of lines) {
    if (!line.cache) continue
    const id = canonical(line.cache)
    const entry = caches.get(id) ?? {
      dir: line.cache,
      keep: new Set(),
      encoded: new Set(),
    }
    for (const key of line.keys) entry.keep.add(key)
    for (const key of line.encoded) entry.encoded.add(key)
    caches.set(id, entry)
  }
  for (const { dir, keep, encoded } of [...caches.values()].sort((a, b) =>
    a.dir < b.dir ? -1 : 1,
  )) {
    const { added, removed, kept } = pruneCache({ dir, keep, encoded })
    out.push(
      `${shown(dir)}: added ${added.count} (${kb(added.bytes)}), removed ${removed.count} (${kb(removed.bytes)}), kept ${kept.count} (${kb(kept.bytes)})`,
    )
  }
  if (caches.size === 0)
    out.push('No encode cache: assets.images.cache is false')

  // An original is judged against the widest recipe of every assets folder
  // that holds it, by folder on disk: a photo in one site's `assets/photos`,
  // which another site reads as part of `assets`, must not be cut to the
  // narrower site's width, since the pixels cannot come back (Codex
  // adversarial review, 2026-11-05).
  // Two maps: the folders scanned for originals (each instance's own assets
  // folder, never a `.copyAssets()` source, which may be node_modules), and
  // the widths every folder an instance reads from needs kept (Codex
  // adversarial review, 2026-11-05).
  /** @type {Map<string, { dir: string, maxWidth: number }>} */
  const roots = new Map()
  /** @type {Map<string, number>} */
  const needs = new Map()
  const need = (/** @type {string} */ dir, /** @type {number} */ width) => {
    const id = canonical(dir)
    needs.set(id, Math.max(needs.get(id) ?? 0, width))
    return id
  }
  for (const line of lines) {
    for (const dir of line.copies ?? []) need(dir, line.maxWidth)
    if (!line.assets) continue
    const id = need(line.assets, line.maxWidth)
    const known = roots.get(id)
    roots.set(id, {
      dir: known?.dir ?? line.assets,
      maxWidth: Math.max(known?.maxWidth ?? 0, line.maxWidth),
    })
  }
  const narrowest = Math.min(...[...roots.values()].map((r) => r.maxWidth))
  /** @type {Map<string, Original & { maxWidth: number }>} */
  const byFile = new Map()
  for (const { dir } of roots.values())
    for (const found of findOriginals({ dir, maxWidth: narrowest })) {
      const id = canonical(found.file)
      if (byFile.has(id)) continue
      const maxWidth = Math.max(
        ...[...needs]
          .filter(([folder]) => isInside(folder)(id))
          .map(([, width]) => width),
      )
      const wide = found.width > maxWidth
      if (found.gps || wide) byFile.set(id, { ...found, wide, maxWidth })
    }
  const originals = [...byFile.values()].sort((a, b) =>
    a.file < b.file ? -1 : 1,
  )
  if (originals.length === 0)
    out.push('Originals: none carries GPS or is wider than the recipe')
  else {
    out.push(`Originals: ${originals.length} to fix in the source`)
    for (const o of originals)
      out.push(
        `  ${shown(o.file)}  ${[o.gps ? 'GPS location' : null, o.wide ? `${o.width}px wide, over ${o.maxWidth}` : null].filter(Boolean).join(', ')}`,
      )
    if (!write)
      out.push(
        'Run again with --write to rewrite them, then read the diff before committing',
      )
    else
      for (const [maxWidth, list] of groupBy(originals, (o) => o.maxWidth))
        for (const r of await rewriteOriginals(list, maxWidth)) {
          if (r.replaced) rerun = true
          out.push(
            r.replaced
              ? `  rewrote ${shown(r.file)}: ${kb(r.before)} -> ${kb(r.after)}`
              : `  kept ${shown(r.file)}: the rewrite (${kb(r.after)}) was not smaller than ${kb(r.before)}`,
          )
        }
  }
  if (rerun)
    out.push(
      'The rewritten originals have new digests: building again to bring the cache up to date',
    )
  return { out: out.join('\n'), err: '', code: 0, rerun }
}

/**
 * The path a folder or file has on disk: its real path, which on Windows also
 * settles the letter case, or the resolved path when it does not exist yet.
 *
 * @param {string} file
 * @returns {string}
 */
function canonical(file) {
  try {
    return fs.realpathSync.native(file)
  } catch {
    return path.resolve(file)
  }
}

/**
 * @template T
 * @param {T[]} list
 * @param {(item: T) => number} key
 * @returns {[number, T[]][]}
 */
function groupBy(list, key) {
  /** @type {Map<number, T[]>} */
  const groups = new Map()
  for (const item of list)
    groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return [...groups]
}
