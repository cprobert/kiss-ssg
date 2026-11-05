import fs from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

// Encodes the variants `{{image}}` asked for, at the settle, with `sharp`:
// each source is decoded once, turned the right way up (`autoOrient()`), and
// cloned per variant into a resize and an encode. Every variant is kept in
// the encode cache under its full digest, and a hit is a file copy. The cache
// is committed by the site (`assets.images.cache`, `.kiss-cache/images` by
// default), so encoding happens once, on the machine where an image was
// added, and CI and hosts copy.
//
// `sharp` is imported on the first miss and never before: a build whose
// variants are all cached, dev, the header reader and the audit never load
// it. Its output to AVIF, WebP and JPEG drops all EXIF, GPS included, unless
// `keepMetadata()` is called, which it is not (measured, sharp 0.35.5).
//
// The decisions about *when* (the settle, not dev, not a failed build) are
// `lib/build-finish.js`'s; pruning the cache is `kiss-ssg images`'s
// (`lib/images-sweep.js`), never a build's, because a build that pruned could
// delete what another branch's pages use.

/**
 * @typedef {import('./images.js').ImageVariant & { source: string }} RequestedVariant
 */

/**
 * @typedef {Object} EncodeResult
 * @property {number} requested variants asked for
 * @property {string[]} encoded the cache names of the misses, encoded now
 * @property {number} cached hits, copied from the cache
 * @property {string[]} keys the cache name of every requested variant
 * @property {string[]} written absolute paths of every variant written to the build
 * @property {{ source: string, error: Error }[]} failures one per source that
 * could not be encoded
 * @property {boolean} cacheSkipped the cache could not be written, so none
 * of this build's misses were kept
 */

/** The cache's name for one variant: its full digest and its extension. */
export function cacheName(/** @type {{ digest: string, path: string }} */ v) {
  return `${v.digest}${path.extname(v.path)}`
}

// Every name the cache writes: an entry (`cacheName`, a sha256 hex digest and
// a variant's extension), or `writeCacheEntry`'s temp file beside one. The
// sweep removes only names of this shape, so a cache folder configured onto
// the wrong place can never cost the site a file of its own.
const CACHE_FILE =
  /^[0-9a-f]{64}\.(?:avif|webp|jpe?g|png)(?:\.\d+\.[0-9a-f]{8}\.tmp)?$/

/**
 * Whether a file name is one the encode cache writes.
 *
 * @param {string} name a bare file name
 * @returns {boolean}
 */
export function isCacheFileName(name) {
  return CACHE_FILE.test(name)
}

/** @type {Promise<any>|null} */
let sharpLoad = null
const loadSharp = () =>
  (sharpLoad ??= import('sharp').then((mod) => {
    const sharp = mod.default ?? mod
    // libvips' operation cache keeps the source files open, and on Windows
    // an open file cannot be removed: the staging folder's discard or
    // promotion, and a watch replay's sweep, would fail on it. Each source
    // is decoded once per build anyway, so the cache buys nothing here.
    sharp.cache(false)
    return sharp
  }))

/**
 * One variant's encoder call on a decoded, oriented source.
 *
 * @param {any} pipeline a `sharp` instance
 * @param {RequestedVariant} v
 * @returns {Promise<Buffer>}
 */
function encodeOne(pipeline, v) {
  const resized = pipeline.clone().resize({ width: v.width })
  if (v.format === 'avif')
    return resized.avif({ quality: v.quality }).toBuffer()
  if (v.format === 'webp')
    return resized.webp({ quality: v.quality }).toBuffer()
  if (v.format === 'png') return resized.png({ compressionLevel: 9 }).toBuffer()
  return resized.jpeg({ quality: v.quality, mozjpeg: true }).toBuffer()
}

/**
 * Write a cache entry whole or not at all: a temp file, then a rename. A
 * concurrent writer that got there first (`EPERM`/`EEXIST` on Windows) is
 * as good as this one, since the name is the content.
 *
 * @param {string} file
 * @param {Buffer} bytes
 */
function writeCacheEntry(file, bytes) {
  const temp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(temp, bytes)
  try {
    fs.renameSync(temp, file)
  } catch (error) {
    fs.rmSync(temp, { force: true })
    const code = /** @type {any} */ (error).code
    if ((code === 'EPERM' || code === 'EEXIST') && isEntry(file)) return
    throw error
  }
}

/** A cache entry counts only when it is a non-empty file. */
function isEntry(/** @type {string} */ file) {
  try {
    return fs.statSync(file).size > 0
  } catch {
    return false
  }
}

/**
 * Run `task` over `items`, at most `limit` at a time, and return only once
 * every worker has stopped. A worker that throws stops taking items, but the
 * others are waited for before the first error is rethrown: the build
 * discards its staging folder when this settles, and a worker still writing
 * would put files back into it.
 *
 * @template T
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T) => Promise<void>} task
 */
async function bounded(items, limit, task) {
  let next = 0
  const worker = async () => {
    while (next < items.length) await task(items[next++])
  }
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  const failed = settled.find((s) => s.status === 'rejected')
  if (failed) throw /** @type {PromiseRejectedResult} */ (failed).reason
}

/**
 * Encode or copy every requested variant into the build at `root`.
 *
 * @param {Object} input
 * @param {RequestedVariant[]} input.variants
 * @param {string} input.root where the build is being written; each
 * variant's `source` is a path in it
 * @param {string|null} input.cache the cache folder, absolute, or `null` for none
 * @param {boolean} [input.refresh] ignore the cache's hits and encode
 * everything again (`kiss-ssg images --refresh`)
 * @param {number} [input.concurrency] sources decoded at once
 * @param {(message: string) => void} [input.warn]
 * @returns {Promise<EncodeResult>}
 */
export async function encodeVariants({
  variants,
  root,
  cache,
  refresh = false,
  concurrency = 4,
  warn = () => {},
}) {
  /** @type {EncodeResult} */
  const result = {
    requested: variants.length,
    encoded: [],
    cached: 0,
    keys: variants.map(cacheName),
    written: [],
    failures: [],
    cacheSkipped: false,
  }
  // Nothing asked for, nothing made: a site with no `{{image}}` never gets a
  // cache folder.
  if (variants.length === 0) return result
  let cacheDir = cache
  /** @type {Map<string, RequestedVariant[]>} */
  const bySource = new Map()
  for (const v of variants)
    bySource.set(v.source, [...(bySource.get(v.source) ?? []), v])

  await bounded([...bySource], concurrency, async ([source, list]) => {
    // Everything one source does is that source's to fail, the cache copies
    // included: a throw here would end the whole call while other sources
    // are still being written (Codex adversarial review, 2026-11-05).
    try {
      /** @type {RequestedVariant[]} */
      const misses = []
      for (const v of list) {
        const out = path.join(root, v.path)
        const entry = cacheDir ? path.join(cacheDir, cacheName(v)) : null
        if (!refresh && entry && isEntry(entry)) {
          fs.mkdirSync(path.dirname(out), { recursive: true })
          fs.copyFileSync(entry, out)
          result.written.push(out)
          result.cached++
        } else misses.push(v)
      }
      if (misses.length === 0) return
      const sharp = await loadSharp()
      // From a buffer, so no file stays open behind libvips (see loadSharp).
      const input = fs.readFileSync(path.join(root, source))
      const pipeline = sharp(input, { failOn: 'error' }).autoOrient()
      for (const v of misses) {
        const bytes = await encodeOne(pipeline, v)
        const out = path.join(root, v.path)
        fs.mkdirSync(path.dirname(out), { recursive: true })
        fs.writeFileSync(out, bytes)
        result.written.push(out)
        result.encoded.push(cacheName(v))
        if (!cacheDir) continue
        try {
          // Made on the first miss, never before: a build served wholly
          // from the cache, or with no cache, touches nothing outside it.
          fs.mkdirSync(cacheDir, { recursive: true })
          writeCacheEntry(path.join(cacheDir, cacheName(v)), bytes)
        } catch (error) {
          if (!result.cacheSkipped)
            warn(
              `images: the encode cache ${cacheDir} cannot be written (${/** @type {any} */ (error).message}); encoding without it`,
            )
          result.cacheSkipped = true
          cacheDir = null
        }
      }
    } catch (error) {
      result.failures.push({ source, error: /** @type {Error} */ (error) })
    }
  })
  result.written.sort()
  result.encoded.sort()
  return result
}
