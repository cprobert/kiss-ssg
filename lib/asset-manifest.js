import { createHash } from 'node:crypto'

// Long enough that two files in one site colliding is not a practical worry,
// short enough to leave the filename readable.
export const HASH_LENGTH = 8

// Only the files a template links by name are ever renamed. An image, a font
// or robots.txt is asked for by a URL nothing here can rewrite — one inside a
// stylesheet, or one a host or a browser asks for by a fixed name — and kiss
// has no bundler to go and rewrite them.
const HASHABLE = /\.(css|js)$/i

export function isHashable(urlPath) {
  return HASHABLE.test(urlPath)
}

export function contentHash(bytes) {
  return createHash('md5').update(bytes).digest('hex').slice(0, HASH_LENGTH)
}

// `css/site.css` + `a1b2c3d4` → `css/site.a1b2c3d4.css`. The hash goes before
// the extension, never after it: a server reads the content type off the
// extension, and `site.css.a1b2c3d4` is not a stylesheet to it.
export function hashedName(urlPath, hash) {
  const dot = urlPath.lastIndexOf('.')
  // A dot in a folder name is not this file's extension, and a leading dot is
  // the whole name of a dotfile — both take the appended form.
  if (dot <= urlPath.lastIndexOf('/') + 1) return `${urlPath}.${hash}`
  return `${urlPath.slice(0, dot)}.${hash}${urlPath.slice(dot)}`
}

// What the last copy emitted, keyed by the path a template writes. One per
// Kiss instance: two instances in one process must never see each other's
// names.
export function createAssetManifest() {
  const emitted = new Map()
  return {
    // Returns the name this asset had before, when the new one differs — the
    // caller's cue to delete the file it has just replaced — otherwise null.
    record(urlPath, emittedPath) {
      const previous = emitted.get(urlPath) ?? null
      emitted.set(urlPath, emittedPath)
      return previous && previous !== emittedPath ? previous : null
    },
    lookup(urlPath) {
      return emitted.get(urlPath) ?? null
    },
    toObject() {
      return Object.fromEntries(emitted)
    },
  }
}
