import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {
  bufferReader,
  parseImageHeader,
  readImageHeader,
  readTiff,
} from '../../lib/image-header.js'

// Fixtures are made by sharp in the test, small, so the reader is judged
// against what a real encoder writes rather than hand-built bytes.
const base = (width = 40, height = 20) =>
  sharp({ create: { width, height, channels: 3, background: '#c33' } })
const GPS = {
  IFD3: {
    GPSLatitudeRef: 'N',
    GPSLatitude: '51/1 30/1 0/1',
    GPSLongitudeRef: 'W',
    GPSLongitude: '0/1 7/1 0/1',
  },
}
const parse = (buffer) => parseImageHeader(bufferReader(buffer))

describe('parseImageHeader — size and format', () => {
  it.each([
    ['jpeg', () => base().jpeg()],
    ['png', () => base().png()],
    ['webp', () => base().webp()],
    ['webp', () => base().webp({ lossless: true })],
    ['avif', () => base().avif()],
    ['gif', () => base().gif()],
  ])('reads a %s', async (format, make) => {
    expect(parse(await make().toBuffer())).toMatchObject({
      format,
      width: 40,
      height: 20,
      orientation: 1,
      gps: false,
      animated: false,
    })
  })

  it('returns null for what it does not know, and for a truncated file', async () => {
    expect(
      parse(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull()
    const jpeg = await base().jpeg().toBuffer()
    expect(parse(jpeg.subarray(0, 20))).toBeNull()
  })

  it('finds a JPEG frame behind a large APP2 segment', async () => {
    // An ICC profile of ~100 KB sits before the frame header: a reader of
    // "the first 64 KB" would miss the size.
    const jpeg = await base().jpeg().toBuffer()
    const pad = Buffer.alloc(65000, 0x20)
    const segment = Buffer.concat([
      Buffer.from([0xff, 0xe2]),
      Buffer.from([(pad.length + 2) >> 8, (pad.length + 2) & 0xff]),
      pad,
    ])
    const padded = Buffer.concat([
      jpeg.subarray(0, 2),
      segment,
      segment,
      segment,
      segment,
      jpeg.subarray(2),
    ])
    // Every frame marker sits more than 192 KB in.
    expect(padded.length - jpeg.length).toBeGreaterThan(192 * 1024)
    expect(parse(padded)).toMatchObject({ width: 40, height: 20 })
  })
})

describe('parseImageHeader — orientation', () => {
  it.each([1, 2, 3, 4])(
    'keeps the stored size for orientation %i',
    async (o) => {
      const buf = await base()
        .jpeg()
        .withMetadata({ orientation: o })
        .toBuffer()
      expect(parse(buf)).toMatchObject({
        orientation: o,
        width: 40,
        height: 20,
      })
    },
  )

  it.each([5, 6, 7, 8])(
    'swaps width and height for orientation %i',
    async (o) => {
      const buf = await base()
        .jpeg()
        .withMetadata({ orientation: o })
        .toBuffer()
      expect(parse(buf)).toMatchObject({
        orientation: o,
        width: 20,
        height: 40,
      })
    },
  )

  it('agrees with sharp after autoOrient()', async () => {
    const buf = await base().webp().withMetadata({ orientation: 8 }).toBuffer()
    const oriented = await sharp(buf)
      .autoOrient()
      .toBuffer({ resolveWithObject: true })
    const header = parse(buf)
    expect([header.width, header.height]).toEqual([
      oriented.info.width,
      oriented.info.height,
    ])
  })

  it('turns an AVIF by its irot alone, not by the EXIF sharp leaves beside it', async () => {
    const buf = await base().avif().withMetadata({ orientation: 6 }).toBuffer()
    const meta = await sharp(buf).metadata()
    expect(parse(buf)).toMatchObject({
      width: meta.width,
      height: meta.height,
      orientation: 1,
    })
    expect([meta.width, meta.height]).toEqual([20, 40])
  })
})

describe('parseImageHeader — GPS', () => {
  it.each([
    ['jpeg', () => base().jpeg()],
    ['png', () => base().png()],
    ['webp', () => base().webp()],
    ['avif', () => base().avif()],
  ])('finds the GPS IFD in a %s', async (_, make) => {
    expect(parse(await make().withExif(GPS).toBuffer()).gps).toBe(true)
    expect(
      parse(
        await make()
          .withExif({ IFD0: { Copyright: 'x' } })
          .toBuffer(),
      ).gps,
    ).toBe(false)
  })

  it('finds GPS in an XMP packet', async () => {
    const xmp = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:exif="http://ns.adobe.com/exif/1.0/" exif:GPSLatitude="51,30.0N"/></rdf:RDF></x:xmpmeta>`
    expect(parse(await base().jpeg().withXmp(xmp).toBuffer()).gps).toBe(true)
    expect(parse(await base().webp().withXmp(xmp).toBuffer()).gps).toBe(true)
  })

  it('does not count a GPS IFD that places nobody', () => {
    // II*\0, IFD0 at 8 with one entry: GPSInfo -> 26; GPS IFD with only GPSVersionID.
    const tiff = Buffer.alloc(64)
    tiff.write('II', 0, 'latin1')
    tiff.writeUInt16LE(42, 2)
    tiff.writeUInt32LE(8, 4)
    tiff.writeUInt16LE(1, 8)
    tiff.writeUInt16LE(0x8825, 10)
    tiff.writeUInt16LE(4, 12)
    tiff.writeUInt32LE(1, 14)
    tiff.writeUInt32LE(26, 18)
    tiff.writeUInt16LE(1, 26)
    tiff.writeUInt16LE(0x0000, 28)
    expect(readTiff(tiff)).toEqual({ orientation: 1, gps: false })
    tiff.writeUInt16LE(0x0002, 28)
    expect(readTiff(tiff)).toEqual({ orientation: 1, gps: true })
  })
})

describe('parseImageHeader — a hostile AVIF', () => {
  // Hand-built, because no encoder writes it: one Exif item whose `iloc`
  // lists 65,535 extents, every one the same 1 MB region. Read naively that
  // is about 64 GB for a 1.5 MB file, in the audit of every copied AVIF.
  const box = (type, payload) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(8 + payload.length, 0)
    head.write(type, 4, 'latin1')
    return Buffer.concat([head, payload])
  }
  const u16 = (n) => {
    const b = Buffer.alloc(2)
    b.writeUInt16BE(n)
    return b
  }
  const u32 = (n) => {
    const b = Buffer.alloc(4)
    b.writeUInt32BE(n)
    return b
  }
  function hostile(extents, region) {
    const infe = box(
      'infe',
      Buffer.concat([u32(0x02000000), u16(1), u16(0), Buffer.from('Exif\0')]),
    )
    const iinf = box('iinf', Buffer.concat([u32(0), u16(1), infe]))
    const ispe = box('ispe', Buffer.concat([u32(0), u32(40), u32(20)]))
    const iprp = box('iprp', box('ipco', ispe))
    const ftyp = box('ftyp', Buffer.from('avifavif'))
    // The data sits after everything else; its offset is known once the
    // iloc's size is, which does not depend on the offset's value.
    const ilocFor = (dataAt) =>
      box(
        'iloc',
        Buffer.concat([
          u32(0), // version 0, flags
          Buffer.from([0x44, 0x00]), // offset 4, length 4, base 0
          u16(1), // one item
          u16(1), // item 1
          u16(0), // data reference
          u16(extents),
          Buffer.concat(
            Array.from({ length: extents }, () =>
              Buffer.concat([u32(dataAt), u32(region)]),
            ),
          ),
        ]),
      )
    const metaFor = (dataAt) =>
      box('meta', Buffer.concat([u32(0), iinf, ilocFor(dataAt), iprp]))
    const dataAt = ftyp.length + metaFor(0).length
    return Buffer.concat([ftyp, metaFor(dataAt), Buffer.alloc(region, 1)])
  }

  it('does bounded work when extent records take no bytes at all', () => {
    // offset, length and index sizes all 0: 10,000 items of 65,535 extents
    // each fit in about 60 KB and cost 655 million loop turns read naively
    // (about 2 s, Codex's measurement). A copied folder of them stalls the
    // audit without sharp ever running.
    const items = 10000
    const infe = box(
      'infe',
      Buffer.concat([u32(0x02000000), u16(1), u16(0), Buffer.from('Exif\0')]),
    )
    const iinf = box('iinf', Buffer.concat([u32(0), u16(1), infe]))
    const ispe = box('ispe', Buffer.concat([u32(0), u32(40), u32(20)]))
    const iprp = box('iprp', box('ipco', ispe))
    const iloc = box(
      'iloc',
      Buffer.concat([
        u32(0),
        Buffer.from([0x00, 0x00]), // offset 0, length 0, base 0
        u16(items),
        Buffer.concat(
          Array.from({ length: items }, (_, i) =>
            Buffer.concat([u16(i + 1), u16(0), u16(65535)]),
          ),
        ),
      ]),
    )
    const file = Buffer.concat([
      box('ftyp', Buffer.from('avifavif')),
      box('meta', Buffer.concat([u32(0), iinf, iloc, iprp])),
    ])
    const started = performance.now()
    const header = parse(file)
    const elapsed = performance.now() - started
    expect(header).toMatchObject({ format: 'avif', width: 40, height: 20 })
    // Milliseconds once bounded; whole seconds unbounded.
    expect(elapsed).toBeLessThan(250)
  })

  it('reads a bounded number of bytes however many extents repeat', () => {
    const file = hostile(65535, 1024 * 1024)
    const inner = bufferReader(file)
    let served = 0
    const header = parseImageHeader({
      size: inner.size,
      read: (offset, length) => {
        const out = inner.read(offset, length)
        served += out.length
        return out
      },
    })
    expect(header).toMatchObject({ format: 'avif', width: 40, height: 20 })
    // The metadata it may read: the boxes once, plus a few MB of item data.
    expect(served).toBeLessThan(8 * 1024 * 1024)
  })
})

describe('parseImageHeader — animation', () => {
  it('flags an animated WebP and a still one apart', async () => {
    // Two different frames: two identical ones are written as a still image.
    const frame = (background) =>
      sharp({ create: { width: 40, height: 20, channels: 3, background } })
        .png()
        .toBuffer()
    const frames = [await frame('#f00'), await frame('#00f')]
    const animated = await sharp(frames, { join: { animated: true } })
      .webp()
      .toBuffer()
    expect(parse(animated)).toMatchObject({
      format: 'webp',
      animated: true,
      width: 40,
      height: 20,
    })
    expect(parse(await base().webp().toBuffer()).animated).toBe(false)
  })
})

describe('readImageHeader', () => {
  let dir
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-header-'))
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('reads a file, and reads it again once it changes', async () => {
    const file = path.join(dir, 'a.png')
    await base(40, 20).png().toFile(file)
    expect(readImageHeader(file)).toMatchObject({ width: 40, height: 20 })
    await base(64, 32).png().toFile(file)
    expect(readImageHeader(file)).toMatchObject({ width: 64, height: 32 })
  })

  it('returns null for a missing file', () => {
    expect(readImageHeader(path.join(dir, 'nope.jpg'))).toBeNull()
  })
})
