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
