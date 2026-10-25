// Reads the entries of a stored zip (method 0, as `lib/zip.js` writes them)
// from its central directory, so a test can check what a package holds.
// Not a general zip reader: it refuses anything compressed.
export function readZipEntries(buf) {
  const eocd = buf.length - 22
  if (buf.readUInt32LE(eocd) !== 0x06054b50)
    throw new Error('readZipEntries: no end record')
  const count = buf.readUInt16LE(eocd + 10)
  let at = buf.readUInt32LE(eocd + 16)
  /** @type {Map<string, Buffer>} */
  const entries = new Map()
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10)
    if (method !== 0) throw new Error('readZipEntries: a compressed entry')
    const size = buf.readUInt32LE(at + 24)
    const nameLength = buf.readUInt16LE(at + 28)
    const extra = buf.readUInt16LE(at + 30)
    const comment = buf.readUInt16LE(at + 32)
    const offset = buf.readUInt32LE(at + 42)
    const name = buf.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    const localName = buf.readUInt16LE(offset + 26)
    const localExtra = buf.readUInt16LE(offset + 28)
    const start = offset + 30 + localName + localExtra
    entries.set(name, buf.subarray(start, start + size))
    at += 46 + nameLength + extra + comment
  }
  return entries
}
