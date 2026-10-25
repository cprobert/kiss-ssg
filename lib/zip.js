import zlib from 'node:zlib'

/**
 * One file of a zip: its path inside the archive and its contents.
 *
 * @typedef {object} ZipEntry
 * @property {string} name forward-slash path inside the archive, relative, no `..` or empty segment
 * @property {string | Uint8Array} bytes the contents; a string is written as UTF-8
 */

// The fixed fields every entry carries, so the same entries always give the same bytes.
const DOS_DATE = 0x0021 // 1980-01-01, the earliest DOS date (0 is not a valid date)
const DOS_TIME = 0
const FLAG_UTF8 = 0x0800 // general-purpose bit 11: names are UTF-8
const METHOD_STORE = 0
const VERSION_NEEDED = 10 // 1.0: stored entries need nothing newer
const VERSION_MADE_BY = 20 // host 0 (MS-DOS) in the high byte, spec 2.0 in the low byte
const LIMIT = 0xffffffff // without Zip64, no size or offset may reach this

/**
 * The bytes of an entry's name, after checking it cannot escape the folder it
 * is extracted into: relative, forward slashes, no drive (`C:`), no empty,
 * `.` or `..` segment, and a file rather than a directory.
 *
 * @param {string} name
 * @returns {Buffer}
 */
function nameBytes(name) {
  const segments = typeof name === 'string' ? name.split('/') : []
  const bad =
    !name ||
    name.includes('\\') ||
    /^[A-Za-z]:/.test(name) ||
    segments.some((s) => s === '' || s === '.' || s === '..')
  if (bad)
    throw new Error(
      `zip: entry name ${JSON.stringify(name)} is not a relative file path`,
    )
  return Buffer.from(name, 'utf8')
}

/**
 * A zip archive of `entries`, every entry stored (no compression), so the
 * bytes depend on nothing but the entries: not on the machine, the Node
 * version or the order the entries were given in. Entries are written in the
 * byte order of their UTF-8 names, every timestamp is 1980-01-01 00:00, and
 * there are no extra fields, comments, data descriptors or directory entries.
 *
 * @param {ZipEntry[]} entries
 * @returns {Buffer}
 */
export function zip(entries) {
  const files = entries.map((e) => {
    const name = nameBytes(e.name)
    const data =
      typeof e.bytes === 'string'
        ? Buffer.from(e.bytes, 'utf8')
        : Buffer.from(e.bytes)
    return { label: e.name, name, data, crc: zlib.crc32(data) }
  })
  files.sort((a, b) => Buffer.compare(a.name, b.name))
  for (let i = 1; i < files.length; i++)
    if (Buffer.compare(files[i - 1].name, files[i].name) === 0)
      throw new Error(
        `zip: entry name ${JSON.stringify(files[i].label)} is given twice`,
      )
  if (files.length > 0xffff)
    throw new Error('zip: more than 65535 entries needs Zip64')

  /** @type {Buffer[]} */
  const parts = []
  /** @type {Buffer[]} */
  const central = []
  let offset = 0
  for (const f of files) {
    if (f.data.length >= LIMIT || offset >= LIMIT)
      throw new Error('zip: an entry or the archive needs Zip64')
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(VERSION_NEEDED, 4)
    local.writeUInt16LE(FLAG_UTF8, 6)
    local.writeUInt16LE(METHOD_STORE, 8)
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(f.crc, 14)
    local.writeUInt32LE(f.data.length, 18)
    local.writeUInt32LE(f.data.length, 22)
    local.writeUInt16LE(f.name.length, 26)
    local.writeUInt16LE(0, 28)
    parts.push(local, f.name, f.data)

    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(VERSION_MADE_BY, 4)
    header.writeUInt16LE(VERSION_NEEDED, 6)
    header.writeUInt16LE(FLAG_UTF8, 8)
    header.writeUInt16LE(METHOD_STORE, 10)
    header.writeUInt16LE(DOS_TIME, 12)
    header.writeUInt16LE(DOS_DATE, 14)
    header.writeUInt32LE(f.crc, 16)
    header.writeUInt32LE(f.data.length, 20)
    header.writeUInt32LE(f.data.length, 24)
    header.writeUInt16LE(f.name.length, 28)
    // extra length, comment length, disk number, internal and external attributes: all 0
    header.writeUInt32LE(offset, 42)
    central.push(header, f.name)

    offset += local.length + f.name.length + f.data.length
  }

  const centralBytes = Buffer.concat(central)
  if (offset + centralBytes.length >= LIMIT)
    throw new Error('zip: the archive needs Zip64')
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, centralBytes, end])
}
