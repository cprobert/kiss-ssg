import path from 'node:path'

/**
 * @typedef {'asset'|'generated'|'page'} OutputKind
 * @typedef {{owner: string, kind: OutputKind}} OutputClaim
 * @typedef {{file: string, producers: OutputClaim[], winner: OutputClaim|null, refused: string[]}} OutputCollision
 */

// The last successful writer owns a file. Asset copies yield to generated
// outputs on later saves; an old asset inventory is not permission to erase
// something a page or auxiliary writer has since produced.
export class OutputRegistry {
  /** @param {{warn: (message: string) => void}} logger */
  constructor(logger) {
    this.logger = logger
    /** @type {Map<string, OutputClaim>} */
    this.files = new Map()
    /** @type {Map<string, OutputCollision>} */
    this.collisions = new Map()
    /** @type {Set<string>} */
    this.warned = new Set()
  }

  /** @param {string} file */
  key(file) {
    const absolute = path.resolve(file)
    return process.platform === 'win32' ? absolute.toLowerCase() : absolute
  }

  /**
   * @param {string} file
   * @param {OutputClaim|undefined} previous
   * @param {string} owner
   * @param {OutputKind} [kind]
   */
  collision(file, previous, owner, kind = 'generated') {
    if (!previous || previous.owner === owner) return
    const record = this.collisions.get(this.key(file)) ?? {
      file: path.resolve(file).replaceAll('\\', '/'),
      producers: [previous],
      winner: previous,
      refused: [],
    }
    if (!record.producers.some((claim) => claim.owner === owner))
      record.producers.push({ owner, kind })
    this.collisions.set(this.key(file), record)
    const key = JSON.stringify([this.key(file), previous.owner, owner])
    if (this.warned.has(key)) return
    this.warned.add(key)
    const precedence =
      (kind === 'asset') !== (previous.kind === 'asset')
        ? 'Generated output takes precedence over copied assets.'
        : kind === 'asset'
          ? 'The later asset copy wins.'
          : 'The last successful writer wins.'
    this.logger.warn(
      `Output collision at ${file}: ${previous.owner} and ${owner} both produce this file. ${precedence}`,
    )
  }

  /** @param {string} file @param {string} owner */
  canWriteAsset(file, owner) {
    const previous = this.files.get(this.key(file))
    this.collision(file, previous, owner, 'asset')
    const allowed = !previous || previous.kind === 'asset'
    const record = this.collisions.get(this.key(file))
    if (!allowed && record && !record.refused.includes(owner))
      record.refused.push(owner)
    return allowed
  }

  /** @param {string} file @param {string} owner @param {OutputKind} [kind] */
  claim(file, owner, kind = 'generated') {
    const key = this.key(file)
    this.collision(file, this.files.get(key), owner, kind)
    this.files.set(key, { owner, kind })
    const record = this.collisions.get(key)
    if (record) {
      record.winner = { owner, kind }
      record.refused = record.refused.filter((value) => value !== owner)
    }
  }

  /** @param {string} file @param {string} owner */
  owns(file, owner) {
    return this.files.get(this.key(file))?.owner === owner
  }

  /** @param {string} file @returns {string|null} */
  owner(file) {
    return this.files.get(this.key(file))?.owner ?? null
  }

  /** @param {string} file @returns {OutputKind|null} */
  kind(file) {
    return this.files.get(this.key(file))?.kind ?? null
  }

  /** @param {string} from @param {string} to */
  relocate(from, to) {
    const prefix = this.key(from) + path.sep
    for (const [file, claim] of [...this.files]) {
      if (!file.startsWith(prefix)) continue
      this.files.delete(file)
      this.files.set(this.key(path.join(to, file.slice(prefix.length))), claim)
    }
    for (const [file, record] of [...this.collisions]) {
      if (!file.startsWith(prefix)) continue
      this.collisions.delete(file)
      record.file = path
        .resolve(to, path.relative(from, record.file))
        .replaceAll('\\', '/')
      this.collisions.set(this.key(record.file), record)
    }
  }

  /** @param {string} file @param {string} owner */
  release(file, owner) {
    if (!this.owns(file, owner)) return
    this.files.delete(this.key(file))
    const record = this.collisions.get(this.key(file))
    if (record) record.winner = null
  }

  /** Drop live claims after discard; preserve build observations for its report.
   * @param {string} directory
   */
  clearUnder(directory) {
    const prefix = this.key(directory) + path.sep
    for (const file of this.files.keys())
      if (file.startsWith(prefix)) this.files.delete(file)
  }

  /** @returns {OutputCollision[]} detached observations from this instance */
  snapshot() {
    return structuredClone([...this.collisions.values()])
  }
}
