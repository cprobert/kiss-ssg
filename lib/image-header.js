import fs from 'node:fs'

// What a raster image says about itself in its first bytes: its format, its
// size as a browser shows it, its EXIF orientation, whether it carries a GPS
// location, and whether it is animated. Read synchronously, because the one
// caller that needs it at render is a Handlebars helper and helpers cannot
// wait, and without decoding a pixel: `sharp` is never loaded here.
//
// The reader walks the container's own structure (JPEG segments, PNG chunks,
// RIFF chunks, ISOBMFF boxes) with positioned reads, so a JPEG whose size
// sits behind a large ICC profile is still found, and a 20 MB photo costs a
// handful of small reads. It is one parser for both callers: `{{image}}`
// (size, orientation, animation) and the audit (GPS, from the EXIF GPS IFD
// and from XMP).

/**
 * @typedef {'jpeg'|'png'|'webp'|'avif'|'gif'} ImageFormat
 */

/**
 * @typedef {Object} ImageHeader
 * @property {ImageFormat} format
 * @property {number} width as displayed: swapped for EXIF orientations 5–8
 * and for an AVIF rotated by a quarter turn
 * @property {number} height as displayed
 * @property {number} orientation the EXIF orientation, 1–8; 1 when there is
 * none
 * @property {boolean} gps the EXIF GPS IFD names a latitude or longitude, or
 * the XMP packet names one
 * @property {boolean} animated an APNG, an animated WebP, an AVIF image
 * sequence
 */

/**
 * Positioned reads over a file or a buffer.
 *
 * @typedef {Object} ByteReader
 * @property {number} size
 * @property {(offset: number, length: number) => Buffer} read may return
 * fewer bytes than asked for at the end of the data
 */

// No one segment, chunk or box is read beyond this: a header field is never
// that far in, and a corrupt length must not allocate the file.
const MAX_READ = 1024 * 1024
// No container is walked further than this many entries: a corrupt file must
// end the walk, not loop.
const MAX_STEPS = 10000
// All of an AVIF's metadata items together (Exif, XMP) read no more than
// this. A real one is a few kilobytes.
const MAX_ITEM_BYTES = 4 * MAX_READ

/** @param {Buffer} buffer @returns {ByteReader} */
export function bufferReader(buffer) {
  return {
    size: buffer.length,
    read: (offset, length) =>
      buffer.subarray(
        Math.max(0, offset),
        Math.min(buffer.length, offset + Math.min(length, MAX_READ)),
      ),
  }
}

/** @param {number} fd @param {number} size @returns {ByteReader} */
function fileReader(fd, size) {
  return {
    size,
    read: (offset, length) => {
      const want = Math.max(0, Math.min(length, MAX_READ, size - offset))
      const out = Buffer.alloc(want)
      const got = want > 0 ? fs.readSync(fd, out, 0, want, offset) : 0
      return out.subarray(0, got)
    },
  }
}

/**
 * The orientation and GPS presence in a TIFF structure (an EXIF payload,
 * starting at its `II`/`MM` byte-order mark).
 *
 * @param {Buffer} tiff
 * @returns {{ orientation: number, gps: boolean }}
 */
export function readTiff(tiff) {
  const result = { orientation: 1, gps: false }
  if (tiff.length < 8) return result
  const order = tiff.toString('latin1', 0, 2)
  if (order !== 'II' && order !== 'MM') return result
  const le = order === 'II'
  const u16 = (at) =>
    at + 2 <= tiff.length
      ? le
        ? tiff.readUInt16LE(at)
        : tiff.readUInt16BE(at)
      : -1
  const u32 = (at) =>
    at + 4 <= tiff.length
      ? le
        ? tiff.readUInt32LE(at)
        : tiff.readUInt32BE(at)
      : -1
  if (u16(2) !== 42) return result
  const entries = (ifd) => {
    const count = u16(ifd)
    /** @type {{ tag: number, at: number }[]} */
    const list = []
    if (count < 0) return list
    for (let i = 0; i < count && i < 1000; i++) {
      const at = ifd + 2 + i * 12
      if (at + 12 > tiff.length) break
      list.push({ tag: u16(at), at })
    }
    return list
  }
  for (const { tag, at } of entries(u32(4))) {
    if (tag === 0x0112) {
      const value = u16(at + 8)
      if (value >= 1 && value <= 8) result.orientation = value
    }
    if (tag === 0x8825) {
      const gpsIfd = u32(at + 8)
      // GPSLatitude (2) or GPSLongitude (4): a GPS IFD holding only its
      // version, or only a timestamp, places nobody.
      if (gpsIfd > 0)
        result.gps = entries(gpsIfd).some((e) => e.tag === 2 || e.tag === 4)
    }
  }
  return result
}

const XMP_GPS = /GPS(?:Latitude|Longitude)/
const XMP_NS = 'http://ns.adobe.com/xap/1.0/\0'

/** @param {Buffer} bytes */
const xmpHasGps = (bytes) => XMP_GPS.test(bytes.toString('latin1'))

/** @param {Buffer} payload an EXIF payload, with or without `Exif\0\0` */
function exifPayload(payload) {
  return payload.toString('latin1', 0, 6) === 'Exif\0\0'
    ? payload.subarray(6)
    : payload
}

/** @param {ByteReader} r */
function readJpeg(r) {
  let width = 0
  let height = 0
  let orientation = 1
  let gps = false
  let off = 2
  for (let step = 0; step < MAX_STEPS && off + 4 <= r.size; step++) {
    const head = r.read(off, 4)
    if (head.length < 2 || head[0] !== 0xff) break
    const marker = head[1]
    // Fill bytes, and the markers that carry no length.
    if (marker === 0xff) {
      off += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      off += 2
      continue
    }
    // End of image, or the start of the scan: nothing a header reader wants
    // comes after either.
    if (marker === 0xd9 || marker === 0xda || head.length < 4) break
    const length = head.readUInt16BE(2)
    if (length < 2) break
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    if (isFrame && width === 0) {
      const frame = r.read(off + 4, 5)
      if (frame.length === 5) {
        height = frame.readUInt16BE(1)
        width = frame.readUInt16BE(3)
      }
    } else if (marker === 0xe1) {
      const segment = r.read(off + 4, length - 2)
      if (segment.toString('latin1', 0, 6) === 'Exif\0\0') {
        const tiff = readTiff(segment.subarray(6))
        if (tiff.orientation !== 1) orientation = tiff.orientation
        gps ||= tiff.gps
      } else if (segment.toString('latin1', 0, XMP_NS.length) === XMP_NS)
        gps ||= xmpHasGps(segment)
    }
    off += 2 + length
  }
  if (!width || !height) return null
  return { format: 'jpeg', width, height, orientation, gps, animated: false }
}

/** @param {ByteReader} r */
function readPng(r) {
  const ihdr = r.read(8, 25)
  if (ihdr.length < 16 || ihdr.toString('latin1', 4, 8) !== 'IHDR') return null
  const width = ihdr.readUInt32BE(8)
  const height = ihdr.readUInt32BE(12)
  let orientation = 1
  let gps = false
  let animated = false
  let off = 8
  for (let step = 0; step < MAX_STEPS && off + 8 <= r.size; step++) {
    const head = r.read(off, 8)
    if (head.length < 8) break
    const length = head.readUInt32BE(0)
    const type = head.toString('latin1', 4, 8)
    if (type === 'IEND') break
    if (type === 'acTL') animated = true
    else if (type === 'eXIf') {
      const tiff = readTiff(exifPayload(r.read(off + 8, length)))
      orientation = tiff.orientation
      gps ||= tiff.gps
    } else if (type === 'iTXt') {
      const data = r.read(off + 8, length)
      // Keyword, NUL, then the compression flag: a compressed packet is not
      // read, and is a documented false negative.
      const nul = data.indexOf(0)
      if (
        data.toString('latin1', 0, nul) === 'XML:com.adobe.xmp' &&
        data[nul + 1] === 0
      )
        gps ||= xmpHasGps(data)
    }
    off += 12 + length
  }
  if (!width || !height) return null
  return { format: 'png', width, height, orientation, gps, animated }
}

/** @param {ByteReader} r */
function readWebp(r) {
  let width = 0
  let height = 0
  let orientation = 1
  let gps = false
  let animated = false
  let off = 12
  for (let step = 0; step < MAX_STEPS && off + 8 <= r.size; step++) {
    const head = r.read(off, 8)
    if (head.length < 8) break
    const type = head.toString('latin1', 0, 4)
    const length = head.readUInt32LE(4)
    if (type === 'VP8X') {
      const data = r.read(off + 8, 10)
      if (data.length === 10) {
        if (data[0] & 0x02) animated = true
        width = 1 + data.readUIntLE(4, 3)
        height = 1 + data.readUIntLE(7, 3)
      }
    } else if (type === 'VP8 ' && !width) {
      const data = r.read(off + 8, 10)
      if (data.length === 10 && data[3] === 0x9d && data[4] === 0x01) {
        width = data.readUInt16LE(6) & 0x3fff
        height = data.readUInt16LE(8) & 0x3fff
      }
    } else if (type === 'VP8L' && !width) {
      const data = r.read(off + 8, 5)
      if (data.length === 5 && data[0] === 0x2f) {
        const bits = data.readUInt32LE(1)
        width = (bits & 0x3fff) + 1
        height = ((bits >>> 14) & 0x3fff) + 1
      }
    } else if (type === 'ANIM' || type === 'ANMF') animated = true
    else if (type === 'EXIF') {
      const tiff = readTiff(exifPayload(r.read(off + 8, length)))
      orientation = tiff.orientation
      gps ||= tiff.gps
    } else if (type === 'XMP ') gps ||= xmpHasGps(r.read(off + 8, length))
    off += 8 + length + (length % 2)
  }
  if (!width || !height) return null
  return { format: 'webp', width, height, orientation, gps, animated }
}

/**
 * The boxes directly inside `[start, end)` of an ISOBMFF file.
 *
 * @param {ByteReader} r
 * @param {number} start
 * @param {number} end
 * @returns {{ type: string, start: number, end: number }[]} `start` is the
 * first byte after the box's header
 */
function boxes(r, start, end) {
  const list = []
  let off = start
  for (let step = 0; step < MAX_STEPS && off + 8 <= end; step++) {
    const head = r.read(off, 16)
    if (head.length < 8) break
    let size = head.readUInt32BE(0)
    const type = head.toString('latin1', 4, 8)
    let header = 8
    if (size === 1) {
      if (head.length < 16) break
      size = Number(head.readBigUInt64BE(8))
      header = 16
    } else if (size === 0) size = end - off
    if (size < header) break
    list.push({ type, start: off + header, end: Math.min(end, off + size) })
    off += size
  }
  return list
}

/** @param {Buffer} b @param {number} at @param {number} n */
const uintN = (b, at, n) =>
  n === 0 ? 0 : n === 8 ? Number(b.readBigUInt64BE(at)) : b.readUIntBE(at, n)

/**
 * The bytes of every item of the given types, by `iinf` and `iloc`.
 *
 * @param {ByteReader} r
 * @param {{ type: string, start: number, end: number }[]} meta the meta box's children
 * @param {Set<string>} types
 * @returns {{ type: string, bytes: Buffer }[]}
 */
function avifItems(r, meta, types) {
  const iinf = meta.find((b) => b.type === 'iinf')
  const iloc = meta.find((b) => b.type === 'iloc')
  if (!iinf || !iloc) return []
  /** @type {Map<number, string>} */
  const wanted = new Map()
  const info = r.read(iinf.start, iinf.end - iinf.start)
  const entriesAt = info[0] === 0 ? 6 : 8
  for (const infe of boxes(r, iinf.start + entriesAt, iinf.end)) {
    if (infe.type !== 'infe') continue
    const e = r.read(infe.start, Math.min(64, infe.end - infe.start))
    const version = e[0]
    if (version < 2) continue
    const idSize = version === 3 ? 4 : 2
    if (e.length < 4 + idSize + 2 + 4) continue
    const id = e.readUIntBE(4, idSize)
    const type = e.toString('latin1', 4 + idSize + 2, 4 + idSize + 6)
    if (types.has(type)) wanted.set(id, type)
  }
  if (wanted.size === 0) return []
  const b = r.read(iloc.start, iloc.end - iloc.start)
  if (b.length < 8) return []
  const version = b[0]
  const offsetSize = b[4] >> 4
  const lengthSize = b[4] & 0xf
  const baseSize = b[5] >> 4
  const indexSize = version === 1 || version === 2 ? b[5] & 0xf : 0
  let at = 6
  const idSize = version === 2 ? 4 : 2
  const count = version === 2 ? b.readUInt32BE(at) : b.readUInt16BE(at)
  at += version === 2 ? 4 : 2
  const found = []
  // What the item payloads may cost, decided before any read: an `iloc` can
  // list 65,535 extents per item, each pointing at the same megabyte, which
  // read whole is 64 GB for a 1.5 MB file (measured with a hand-built one).
  // An item gets at most MAX_READ, all of them MAX_ITEM_BYTES, and only the
  // items asked for are read at all (Codex adversarial review, 2026-11-05).
  let budget = MAX_ITEM_BYTES
  try {
    for (let i = 0; i < count && i < MAX_STEPS; i++) {
      const id = b.readUIntBE(at, idSize)
      at += idSize
      if (version === 1 || version === 2) at += 2
      at += 2
      const base = uintN(b, at, baseSize)
      at += baseSize
      const extents = b.readUInt16BE(at)
      at += 2
      const type = wanted.get(id)
      const parts = []
      let itemBytes = 0
      for (let x = 0; x < extents; x++) {
        at += indexSize
        const offset = uintN(b, at, offsetSize)
        at += offsetSize
        const length = uintN(b, at, lengthSize)
        at += lengthSize
        const allowed = Math.min(length, MAX_READ - itemBytes, budget)
        if (!type || allowed <= 0) continue
        const part = r.read(base + offset, allowed)
        parts.push(part)
        itemBytes += part.length
        budget -= part.length
      }
      if (type) found.push({ type, bytes: Buffer.concat(parts) })
    }
  } catch {
    // A truncated `iloc`: what was found before the break stands.
  }
  return found
}

/** @param {ByteReader} r */
function readAvif(r) {
  const top = boxes(r, 0, r.size)
  const ftyp = top.find((b) => b.type === 'ftyp')
  if (!ftyp) return null
  const brand = r.read(ftyp.start, 4).toString('latin1')
  const metaBox = top.find((b) => b.type === 'meta')
  if (!metaBox) return null
  // A full box: four bytes of version and flags before its children.
  const meta = boxes(r, metaBox.start + 4, metaBox.end)
  const iprp = meta.find((b) => b.type === 'iprp')
  const ipco =
    iprp && boxes(r, iprp.start, iprp.end).find((b) => b.type === 'ipco')
  let width = 0
  let height = 0
  let quarterTurn = false
  for (const prop of ipco ? boxes(r, ipco.start, ipco.end) : []) {
    // The largest `ispe`: a grid image's tiles each carry their own, and the
    // grid's is the whole picture. Not associated through `ipma`, which is a
    // simplification recorded in AIKB/image-header.md.
    if (prop.type === 'ispe') {
      const e = r.read(prop.start, 12)
      if (e.length < 12) continue
      const w = e.readUInt32BE(4)
      const h = e.readUInt32BE(8)
      if (w * h > width * height) [width, height] = [w, h]
    }
    if (prop.type === 'irot') quarterTurn = (r.read(prop.start, 1)[0] & 1) === 1
  }
  if (!width || !height) return null
  let gps = false
  for (const { type, bytes } of avifItems(r, meta, new Set(['Exif', 'mime']))) {
    if (type === 'mime') gps ||= xmpHasGps(bytes)
    else if (bytes.length > 4) {
      // The payload starts with the offset of the TIFF header after itself.
      gps ||= readTiff(bytes.subarray(4 + bytes.readUInt32BE(0))).gps
    }
  }
  // HEIF carries its rotation in `irot`, and a decoder applies that, not the
  // EXIF orientation, which `sharp` leaves in the Exif item beside an `irot`
  // it wrote (measured, sharp 0.35.5: orientation 6 in, `irot` and EXIF 6
  // out, `metadata()` 20×40 for a 40×20 source). So only `irot` turns it.
  if (quarterTurn) [width, height] = [height, width]
  return {
    format: 'avif',
    width,
    height,
    orientation: 1,
    gps,
    animated: brand === 'avis',
  }
}

/** @param {ByteReader} r */
function readGif(r) {
  const head = r.read(0, 10)
  if (head.length < 10) return null
  return {
    format: 'gif',
    width: head.readUInt16LE(6),
    height: head.readUInt16LE(8),
    orientation: 1,
    gps: false,
    // Not decided: `{{image}}` refuses a GIF whatever it holds.
    animated: false,
  }
}

/**
 * Parse an image's header.
 *
 * @param {ByteReader} reader
 * @returns {ImageHeader|null} `null` for a format it does not know, or a
 * file too damaged to say its size
 */
export function parseImageHeader(reader) {
  const head = reader.read(0, 16)
  if (head.length < 12) return null
  /** @type {any} */
  let found = null
  if (head[0] === 0xff && head[1] === 0xd8) found = readJpeg(reader)
  else if (head.toString('latin1', 1, 4) === 'PNG') found = readPng(reader)
  else if (
    head.toString('latin1', 0, 4) === 'RIFF' &&
    head.toString('latin1', 8, 12) === 'WEBP'
  )
    found = readWebp(reader)
  else if (head.toString('latin1', 4, 8) === 'ftyp') {
    const brand = head.toString('latin1', 8, 12)
    if (brand === 'avif' || brand === 'avis') found = readAvif(reader)
  } else if (head.toString('latin1', 0, 4) === 'GIF8') found = readGif(reader)
  if (!found) return null
  // Orientations 5–8 turn the picture a quarter, so what a browser shows is
  // the stored size transposed.
  if (found.orientation >= 5)
    [found.width, found.height] = [found.height, found.width]
  return found
}

/** @type {Map<string, { mtimeMs: number, size: number, header: ImageHeader|null }>} */
const memo = new Map()

/**
 * Read one file's header, memoised by path, modification time and size, so a
 * layout that asks for one image on every page reads it once.
 *
 * @param {string} file
 * @returns {ImageHeader|null} `null` when the file cannot be read or is not
 * an image this parser knows
 */
export function readImageHeader(file) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return null
  }
  const known = memo.get(file)
  if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size)
    return known.header
  let header
  let fd = null
  try {
    fd = fs.openSync(file, 'r')
    header = parseImageHeader(fileReader(fd, stat.size))
  } catch {
    header = null
  } finally {
    if (fd !== null) fs.closeSync(fd)
  }
  memo.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, header })
  return header
}

/** The extensions `{{image}}` and the audit treat as raster images. */
export const RASTER_EXTENSION = /\.(?:jpe?g|png|webp|avif)$/i
