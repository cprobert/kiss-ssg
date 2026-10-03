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
  const owners = new Map()
  // Outputs a copy wrote, or failed to remove, without reaching `reconcile`:
  // it stopped partway. They are on disk and in no copy's map, so nothing
  // would ever remove them. The next reconcile treats them as stale unless
  // that run produces them again.
  /** @type {Map<string, Set<string>>} */
  const unrecorded = new Map()
  /** @type {Map<string, Map<string, string>>} */
  const sassFingerprints = new Map()
  let urlRevision = 0
  return {
    /** Compare successful Sass writes with this copy's previous emitted bytes.
     * @param {string} owner
     * @param {Map<string, string>} current
     * @returns {Set<string>}
     */
    reconcileSass(owner, current) {
      const previous = sassFingerprints.get(owner) ?? new Map()
      sassFingerprints.set(owner, current)
      return new Set(
        [...current]
          .filter(([file, hash]) => previous.get(file) !== hash)
          .map(([file]) => file),
      )
    },
    // Hashable URL mappings, including additions and deletions. Content edits
    // to an image/font do not change these URLs and need no page re-render.
    get urlRevision() {
      return urlRevision
    },
    // A copy that wrote anything has a root that existed, even if it never
    // finished: its root disappearing is a deletion, not a typo.
    hasOwner(owner) {
      return owners.has(owner) || unrecorded.has(owner)
    },
    /** Remember outputs a copy wrote but stopped before recording.
     * @param {string} owner
     * @param {Iterable<string>} outputs build-relative, as `reconcile` returns
     */
    unrecorded(owner, outputs) {
      const set = unrecorded.get(owner) ?? new Set()
      for (const output of outputs) set.add(output)
      if (set.size) unrecorded.set(owner, set)
    },
    /** Last-good output from this copy only, never another copy's mapping.
     * @param {string} owner
     * @param {string} name
     * @returns {string|null}
     */
    previous(owner, name) {
      return owners.get(owner)?.get(name) ?? null
    },
    // Reconcile only files this copy previously produced. Other copies may
    // still own the same output; never delete their files or manifest entry.
    reconcile(owner, current) {
      const before = new Map(emitted)
      const previous = owners.get(owner) ?? new Map()
      owners.set(owner, current)
      for (const [name, output] of previous) {
        if (current.has(name) || emitted.get(name) !== output) continue
        const remaining = [...owners.values()].find((files) => files.has(name))
        if (remaining) emitted.set(name, remaining.get(name))
        else emitted.delete(name)
      }
      for (const [name, output] of current) emitted.set(name, output)
      if (
        [...new Set([...before.keys(), ...emitted.keys()])].some(
          (name) => isHashable(name) && before.get(name) !== emitted.get(name),
        )
      )
        urlRevision++
      const live = new Set(
        [...owners.values()].flatMap((files) => [...files.values()]),
      )
      const strays = unrecorded.get(owner) ?? []
      unrecorded.delete(owner)
      return [...new Set([...previous.values(), ...strays])].filter(
        (output) => !live.has(output),
      )
    },
    lookup(urlPath) {
      return emitted.get(urlPath) ?? null
    },
    toObject() {
      return Object.fromEntries(emitted)
    },
  }
}
