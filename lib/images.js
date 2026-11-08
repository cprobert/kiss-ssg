import fs from 'node:fs'
import { createHash } from 'node:crypto'
import { HASH_LENGTH, hashedName } from './asset-manifest.js'

// Responsive images: the recipe (`assets.images`), the variants one source is
// served as, their names, and the `<picture>` markup `{{image}}` writes. All
// of it is decided at render from what is known then: the copied file's
// header (`lib/image-header.js`), its bytes' digest and the recipe. So the
// markup never waits for an encode, and a variant's name changes exactly
// when its source or its recipe does.
//
// Nothing here encodes (`lib/image-encode.js` does, at the settle). The
// digest deliberately leaves out `sharp`'s version: the encode cache is
// committed, and an upgrade that renamed every variant would re-encode and
// re-commit the whole cache, when a variant from an older `sharp` is still a
// correct image of the same source and recipe (the operator, 2026-11-05).

/**
 * `config.assets.images`, resolved.
 *
 * @typedef {Object} KissImages
 * @property {number[]} widths the variant widths, ascending (default `[480,
 * 768, 960, 1440, 1920]`)
 * @property {('avif'|'webp')[]} formats the `<source>` formats, in the order
 * they are offered (default `['avif', 'webp']`)
 * @property {{ avif: number, webp: number, jpeg: number }} quality 1–100 per
 * format (default AVIF 50, WebP 75, JPEG 80)
 * @property {string|false} cache the encode cache, relative to the folder the
 * build runs from (default `.kiss-cache/images`), committed by the site; a
 * hit is a copy. `false` keeps none, so every build encodes everything
 */

/**
 * One file a `{{image}}` call names.
 *
 * @typedef {Object} ImageVariant
 * @property {string} path build-relative: `img/hero-960.a1b2c3d4.avif`
 * @property {'avif'|'webp'|'jpeg'|'png'} format
 * @property {number} width
 * @property {number} height
 * @property {number|null} quality `null` for PNG, which is lossless
 * @property {string} digest the full digest the name's hash is cut from: the
 * source's bytes plus the recipe
 */

/**
 * What one `{{image}}` call serves.
 *
 * @typedef {Object} ImagePlan
 * @property {{ format: string, type: string, variants: ImageVariant[] }[]} sources
 * one per `<source>`, in `formats` order
 * @property {ImageVariant[]} fallback the `<img>`'s own `srcset`, in the
 * source's format (JPEG for a WebP or AVIF source)
 * @property {ImageVariant} src the fallback's middle width
 * @property {number} width the largest variant's width, the `<img>`'s
 * @property {number} height the largest variant's height
 */

export const DEFAULT_IMAGES = Object.freeze({
  // 768 is for phones: a full-width image on Lighthouse's mobile device (412 px
  // at 1.75x) wants 721 px, and without it the 960 was sent. On a1k9training it
  // cut what a phone downloads by 19.9% for 16% more cached bytes (2026-11-08).
  widths: Object.freeze([480, 768, 960, 1440, 1920]),
  formats: Object.freeze(/** @type {const} */ (['avif', 'webp'])),
  // Checked by eye by the operator (2026-11-05): four fleet images at 960 px
  // (fur, dark fur, black-and-white artwork, a dark PNG), each against a
  // lossless reference and the qualities either side. The widths are still
  // provisional (planning/plans/2026-11-04-kiss-performance.md, F6).
  quality: Object.freeze({ avif: 50, webp: 75, jpeg: 80 }),
  cache: '.kiss-cache/images',
})

const OFFERED = ['avif', 'webp']
const MIME = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
}
const EXTENSION = { avif: 'avif', webp: 'webp', jpeg: 'jpg', png: 'png' }

const isQuality = (q) => Number.isInteger(q) && q >= 1 && q <= 100

/**
 * `assets.images` as given, checked and filled in from the defaults one level
 * deep (`quality` merges per format).
 *
 * @param {*} images
 * @returns {KissImages}
 * @throws on a shape it cannot use, naming the key
 */
export function resolveImages(images) {
  if (images === undefined || images === null)
    return {
      widths: [...DEFAULT_IMAGES.widths],
      formats: [...DEFAULT_IMAGES.formats],
      quality: { ...DEFAULT_IMAGES.quality },
      cache: DEFAULT_IMAGES.cache,
    }
  if (typeof images !== 'object' || Array.isArray(images))
    throw new Error(
      `config.assets.images must be { widths, formats, quality, cache } (received ${JSON.stringify(images)})`,
    )
  const {
    widths = DEFAULT_IMAGES.widths,
    formats = DEFAULT_IMAGES.formats,
    quality = {},
    cache = DEFAULT_IMAGES.cache,
    ...rest
  } = images
  const unknown = Object.keys(rest)
  if (unknown.length > 0)
    throw new Error(
      `config.assets.images has no ${unknown.map((k) => `\`${k}\``).join(', ')}: its keys are widths, formats, quality and cache`,
    )
  if (cache !== false && (typeof cache !== 'string' || cache.trim() === ''))
    throw new Error(
      `config.assets.images.cache must be a folder path or false (received ${JSON.stringify(cache)})`,
    )
  if (
    !Array.isArray(widths) ||
    widths.length === 0 ||
    !widths.every((w) => Number.isInteger(w) && w > 0)
  )
    throw new Error(
      `config.assets.images.widths must be a non-empty list of whole pixel widths (received ${JSON.stringify(widths)})`,
    )
  if (
    !Array.isArray(formats) ||
    !formats.every((f) => OFFERED.includes(f)) ||
    new Set(formats).size !== formats.length
  )
    throw new Error(
      `config.assets.images.formats must list 'avif' and/or 'webp', each once (received ${JSON.stringify(formats)})`,
    )
  if (typeof quality !== 'object' || quality === null || Array.isArray(quality))
    throw new Error(
      `config.assets.images.quality must be { avif, webp, jpeg } (received ${JSON.stringify(quality)})`,
    )
  const merged = { ...DEFAULT_IMAGES.quality, ...quality }
  for (const [format, q] of Object.entries(merged)) {
    if (!(format in DEFAULT_IMAGES.quality))
      throw new Error(
        `config.assets.images.quality has no \`${format}\`: its keys are avif, webp and jpeg`,
      )
    if (!isQuality(q))
      throw new Error(
        `config.assets.images.quality.${format} must be a whole number from 1 to 100 (received ${JSON.stringify(q)})`,
      )
  }
  return {
    widths: [...new Set(widths)].sort((a, b) => a - b),
    formats: [...formats],
    quality: merged,
    cache,
  }
}

/**
 * The widths one source is served at: every configured width narrower than
 * it, plus its own width when that falls between steps or below the
 * smallest. Never wider than the source: kiss does not enlarge an image.
 *
 * @param {number} sourceWidth as displayed
 * @param {readonly number[]} widths ascending
 * @returns {number[]} ascending
 */
export function variantWidths(sourceWidth, widths) {
  const out = widths.filter((w) => w < sourceWidth)
  if (sourceWidth <= widths[widths.length - 1]) out.push(sourceWidth)
  return out
}

/** The format the `<img>` falls back to: PNG keeps PNG, the rest JPEG. */
export function fallbackFormat(/** @type {string} */ sourceFormat) {
  return sourceFormat === 'png' ? 'png' : 'jpeg'
}

/**
 * The recipe one variant is made by, as the string its digest is taken over
 * with the source's: format, width and quality, and the version of kiss's
 * own pipeline (orient, resize, strip), which moves only when that changes.
 *
 * @param {{ format: string, width: number, quality: number|null }} recipe
 * @returns {string}
 */
export function recipeString({ format, width, quality }) {
  return `kiss-image/1 ${format} w${width} q${quality ?? '-'}`
}

/**
 * A variant's build-relative name: `img/hero.jpg` at 960 in AVIF is
 * `img/hero-960.<hash>.avif`, the hash where `hashedName` puts it. Content
 * named whatever `assets.hash` and `assets.version` say, since an image's
 * URL is only ever written by `{{image}}`.
 *
 * @param {string} emitted the source's build-relative path
 * @param {number} width
 * @param {string} format
 * @param {string} hash `HASH_LENGTH` hex characters
 * @returns {string}
 */
export function variantName(emitted, width, format, hash) {
  const dot = emitted.lastIndexOf('.')
  const stem =
    dot > emitted.lastIndexOf('/') + 1 ? emitted.slice(0, dot) : emitted
  return hashedName(`${stem}-${width}.${EXTENSION[format]}`, hash)
}

/** @type {Map<string, { mtimeMs: number, size: number, digest: string }>} */
const digests = new Map()

/**
 * The SHA-256 of a file's bytes, memoised by path, modification time and
 * size: the copied build file, never `src/`, so the name follows what ships.
 *
 * @param {string} file
 * @returns {string} hex
 */
export function fileDigest(file) {
  const stat = fs.statSync(file)
  const known = digests.get(file)
  if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size)
    return known.digest
  const digest = createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex')
  digests.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, digest })
  return digest
}

/**
 * Every variant one source is served as.
 *
 * @param {Object} input
 * @param {string} input.emitted the source's build-relative path
 * @param {{ format: string, width: number, height: number }} input.header
 * @param {string} input.digest `fileDigest` of the copied file
 * @param {KissImages} input.images
 * @returns {ImagePlan}
 */
export function planImage({ emitted, header, digest, images }) {
  const widths = variantWidths(header.width, images.widths)
  const variant = (format, width) => {
    const quality = format === 'png' ? null : images.quality[format]
    const full = createHash('sha256')
      .update(`${digest}\0${recipeString({ format, width, quality })}`)
      .digest('hex')
    return {
      path: variantName(emitted, width, format, full.slice(0, HASH_LENGTH)),
      format,
      width,
      height: Math.max(1, Math.round((header.height * width) / header.width)),
      quality,
      digest: full,
    }
  }
  const fallback = widths.map((w) => variant(fallbackFormat(header.format), w))
  const largest = fallback[fallback.length - 1]
  return {
    sources: images.formats.map((format) => ({
      format,
      type: MIME[format],
      variants: widths.map((w) => variant(format, w)),
    })),
    fallback,
    src: fallback[Math.floor((fallback.length - 1) / 2)],
    width: largest.width,
    height: largest.height,
  }
}

/** @param {unknown} value */
export function escapeAttribute(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

// What a caller may not pass through: kiss writes these, and a second copy
// of any of them would either be ignored or override the measured value.
export const IMAGE_OWN_ATTRIBUTES = Object.freeze([
  'src',
  'srcset',
  'width',
  'height',
  'loading',
  'fetchpriority',
])
const HELPER_KEYS = new Set(['alt', 'sizes', 'eager', 'root'])
const ATTRIBUTE_NAME = /^[A-Za-z_:][-A-Za-z0-9_:.]*$/

/**
 * A `{{image}}` call's hash arguments, checked.
 *
 * @param {Record<string, unknown>} hash
 * @returns {{ alt: string|null, sizes: string|null, eager: boolean, root: string, attrs: [string, unknown][], problems: string[] }}
 * `problems` is empty for a call that can be served; `alt` and `sizes` are
 * `null` when missing
 */
export function imageArguments(hash = {}) {
  const problems = []
  const alt = typeof hash.alt === 'string' ? hash.alt : null
  if (alt === null)
    problems.push(
      'alt= is required — describe the image, or alt="" for one that is only decoration',
    )
  const sizes =
    typeof hash.sizes === 'string' && hash.sizes.trim() !== ''
      ? hash.sizes.trim()
      : null
  if (sizes === null)
    problems.push(
      "sizes= is required — the width the image takes in the layout, e.g. sizes='(min-width: 60rem) 50vw, 100vw'",
    )
  const root = hash.root === undefined ? '/' : hash.root
  if (typeof root !== 'string') problems.push('root= must be a string')
  /** @type {[string, unknown][]} */
  const attrs = []
  for (const [key, value] of Object.entries(hash)) {
    if (HELPER_KEYS.has(key)) continue
    if (IMAGE_OWN_ATTRIBUTES.includes(key.toLowerCase())) {
      problems.push(`${key}= is written by {{image}} and cannot be passed`)
      continue
    }
    if (!ATTRIBUTE_NAME.test(key)) {
      problems.push(`${key} is not an attribute name`)
      continue
    }
    attrs.push([key, value])
  }
  return {
    alt,
    sizes,
    eager: hash.eager === true || hash.eager === 'true',
    root: typeof root === 'string' ? root : '/',
    attrs,
    problems,
  }
}

/** @param {[string, unknown][]} attrs */
function passThrough(attrs) {
  let out = ''
  for (const [key, value] of attrs) {
    if (value === false || value === null || value === undefined) continue
    out += value === true ? ` ${key}` : ` ${key}="${escapeAttribute(value)}"`
  }
  return out
}

/** @param {string} root @param {string} file build-relative */
function urlOf(root, file) {
  const base = root === '' || root.endsWith('/') ? root : `${root}/`
  return `${base}${encodeURI(file)}`
}

/** @param {string} root @param {ImageVariant[]} variants */
const srcsetOf = (root, variants) =>
  variants.map((v) => `${urlOf(root, v.path)} ${v.width}w`).join(', ')

/**
 * The `<picture>` for one plan: a `<source>` per format and the `<img>`,
 * every one carrying the same `sizes` (`auto, …` when lazy). Eager writes
 * `fetchpriority="high"` and no `loading`.
 *
 * @param {ImagePlan} plan
 * @param {{ alt: string, sizes: string, eager: boolean, root: string, attrs: [string, unknown][] }} options
 * @returns {string}
 */
export function pictureHtml(plan, { alt, sizes, eager, root, attrs }) {
  const sized = escapeAttribute(eager ? sizes : `auto, ${sizes}`)
  const sources = plan.sources
    .map(
      (s) =>
        `<source type="${s.type}" srcset="${escapeAttribute(srcsetOf(root, s.variants))}" sizes="${sized}">`,
    )
    .join('')
  const loading = eager ? ' fetchpriority="high"' : ' loading="lazy"'
  const own = attrs.some(([k]) => k.toLowerCase() === 'decoding')
    ? ''
    : ' decoding="async"'
  const img =
    `<img src="${escapeAttribute(urlOf(root, plan.src.path))}"` +
    ` srcset="${escapeAttribute(srcsetOf(root, plan.fallback))}" sizes="${sized}"` +
    ` width="${plan.width}" height="${plan.height}" alt="${escapeAttribute(alt)}"` +
    `${loading}${own}${passThrough(attrs)}>`
  return `<picture>${sources}${img}</picture>`
}

/**
 * The plain `<img>` dev writes: the copied original at its own size, with
 * the loading attributes the build would write, and nothing encoded.
 *
 * @param {{ emitted: string, width: number|null, height: number|null }} source
 * @param {{ alt: string|null, eager: boolean, root: string, attrs: [string, unknown][] }} options
 * @returns {string}
 */
export function plainImgHtml(
  { emitted, width, height },
  { alt, eager, root, attrs },
) {
  const size = width && height ? ` width="${width}" height="${height}"` : ''
  const altText = alt === null ? '' : ` alt="${escapeAttribute(alt)}"`
  const loading = eager ? ' fetchpriority="high"' : ' loading="lazy"'
  const own = attrs.some(([k]) => k.toLowerCase() === 'decoding')
    ? ''
    : ' decoding="async"'
  return `<img src="${escapeAttribute(urlOf(root, emitted))}"${size}${altText}${loading}${own}${passThrough(attrs)}>`
}

/**
 * What this build's `{{image}}` calls asked for: every variant by its path,
 * and the pages that asked for each source. One per instance, reset when a
 * replay starts a new build. Whatever encodes the variants reads it.
 */
export function createImageIndex() {
  /** @type {Map<string, ImageVariant & { source: string }>} */
  const variants = new Map()
  /** @type {Map<string, Set<string>>} */
  const pages = new Map()
  return {
    /**
     * @param {string} source the source's build-relative path
     * @param {string|null} page the asking page's URL
     * @param {ImageVariant[]} list
     */
    record(source, page, list) {
      for (const v of list) variants.set(v.path, { ...v, source })
      if (!pages.has(source)) pages.set(source, new Set())
      if (page) pages.get(source)?.add(page)
    },
    /** @returns {(ImageVariant & { source: string })[]} by path */
    variants() {
      return [...variants.values()].sort((a, b) => (a.path < b.path ? -1 : 1))
    },
    /** @param {string} source @returns {string[]} the pages that asked for it */
    pagesUsing(source) {
      return [...(pages.get(source) ?? [])].sort()
    },
    reset() {
      variants.clear()
      pages.clear()
    },
  }
}
