import path from 'node:path'

// The last successful writer owns a file. Asset copies yield to generated
// outputs on later saves; an old asset inventory is not permission to erase
// something a page or auxiliary writer has since produced.
export class OutputRegistry {
  constructor(logger) {
    this.logger = logger
    this.files = new Map()
    this.warned = new Set()
  }

  key(file) {
    const absolute = path.resolve(file)
    return process.platform === 'win32' ? absolute.toLowerCase() : absolute
  }

  collision(file, previous, owner, kind = 'generated') {
    if (!previous || previous.owner === owner) return
    const key = JSON.stringify([this.key(file), previous.owner, owner])
    if (this.warned.has(key)) return
    this.warned.add(key)
    const precedence =
      kind === 'asset' || previous.kind === 'asset'
        ? 'Generated output takes precedence over copied assets.'
        : 'The last successful writer wins.'
    this.logger.warn(
      `Output collision at ${file}: ${previous.owner} and ${owner} both produce this file. ${precedence}`,
    )
  }

  canWriteAsset(file, owner) {
    const previous = this.files.get(this.key(file))
    this.collision(file, previous, owner, 'asset')
    return !previous || previous.kind === 'asset'
  }

  claim(file, owner, kind = 'generated') {
    const key = this.key(file)
    this.collision(file, this.files.get(key), owner, kind)
    this.files.set(key, { owner, kind })
  }

  owns(file, owner) {
    return this.files.get(this.key(file))?.owner === owner
  }

  owner(file) {
    return this.files.get(this.key(file))?.owner ?? null
  }

  kind(file) {
    return this.files.get(this.key(file))?.kind ?? null
  }

  relocate(from, to) {
    const prefix = this.key(from) + path.sep
    for (const [file, claim] of [...this.files]) {
      if (!file.startsWith(prefix)) continue
      this.files.delete(file)
      this.files.set(this.key(path.join(to, file.slice(prefix.length))), claim)
    }
  }

  release(file, owner) {
    if (this.owns(file, owner)) this.files.delete(this.key(file))
  }
}
