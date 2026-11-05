import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { cacheName, encodeVariants } from '../../lib/image-encode.js'
import { fileDigest, planImage, resolveImages } from '../../lib/images.js'
import { readImageHeader } from '../../lib/image-header.js'

// The test's own `metadata()` reads would otherwise hold files open on
// Windows, as the engine's decodes would (it turns the cache off too).
sharp.cache(false)

let dir, root, cache
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-encode-'))
  root = path.join(dir, 'public')
  cache = path.join(dir, 'cache')
  fs.mkdirSync(path.join(root, 'img'), { recursive: true })
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const GPS = {
  IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' },
}

// A 1200×800 photo stored sideways (orientation 6, so 800×1200 as shown),
// carrying a GPS location, and the variants `{{image}}` would ask for.
async function source() {
  await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#3a6' },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif(GPS)
    .toFile(path.join(root, 'img/hero.jpg'))
  const file = path.join(root, 'img/hero.jpg')
  const plan = planImage({
    emitted: 'img/hero.jpg',
    header: readImageHeader(file),
    digest: fileDigest(file),
    images: resolveImages({ widths: [480, 960] }),
  })
  return [...plan.sources.flatMap((s) => s.variants), ...plan.fallback].map(
    (v) => ({
      ...v,
      source: 'img/hero.jpg',
    }),
  )
}

describe('encodeVariants', () => {
  it('encodes every variant upright, at its width, with no metadata', async () => {
    const variants = await source()
    const result = await encodeVariants({ variants, root, cache })
    expect(result.requested).toBe(6)
    expect(result.encoded).toHaveLength(6)
    expect(result.cached).toBe(0)
    expect(result.failures).toEqual([])
    for (const v of variants) {
      const meta = await sharp(path.join(root, v.path)).metadata()
      // Shown 800×1200: a variant 480 wide is 720 tall, never sideways.
      expect([meta.width, meta.height]).toEqual([v.width, v.height])
      expect(meta.height).toBeGreaterThan(meta.width)
      expect(meta.exif).toBeUndefined()
      expect(meta.format === 'heif' ? 'avif' : meta.format).toBe(v.format)
      expect(readImageHeader(path.join(root, v.path))?.gps).toBe(false)
    }
  })

  it('writes each miss to the cache by its full digest, and copies it on the next run', async () => {
    const variants = await source()
    await encodeVariants({ variants, root, cache })
    expect(fs.readdirSync(cache).sort()).toEqual(variants.map(cacheName).sort())
    expect(cacheName(variants[0])).toMatch(/^[0-9a-f]{64}\.(avif|webp|jpg)$/)
    fs.rmSync(path.join(root, variants[0].path))
    const again = await encodeVariants({ variants, root, cache })
    expect(again.encoded).toEqual([])
    expect(again.cached).toBe(6)
    expect(fs.existsSync(path.join(root, variants[0].path))).toBe(true)
  })

  it.each([
    ['cut short', (whole) => whole.subarray(0, Math.floor(whole.length / 2))],
    ['one byte', () => Buffer.from('x')],
    [
      'a Git LFS pointer',
      () =>
        Buffer.from(
          'version https://git-lfs.github.com/spec/v1\noid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\nsize 12345\n',
        ),
    ],
  ])(
    'treats a cache entry %s as a miss, and replaces it with the whole image',
    async (_, damage) => {
      const variants = await source()
      await encodeVariants({ variants, root, cache })
      const v = variants[0]
      const entry = path.join(cache, cacheName(v))
      const whole = fs.readFileSync(entry)
      fs.writeFileSync(entry, damage(whole))
      fs.rmSync(path.join(root, v.path), { force: true })
      const result = await encodeVariants({ variants, root, cache })
      expect(result.encoded).toEqual([cacheName(v)])
      expect(result.cached).toBe(variants.length - 1)
      expect(readImageHeader(path.join(root, v.path))).toMatchObject({
        format: v.format,
        width: v.width,
      })
      expect(fs.statSync(entry).size).toBe(whole.length)
    },
  )

  it('treats an AVIF entry cut before its picture data as a miss', async () => {
    const variants = await source()
    await encodeVariants({ variants, root, cache })
    const v = variants.find((x) => x.format === 'avif')
    const entry = path.join(cache, cacheName(v))
    const whole = fs.readFileSync(entry)
    let off = 0
    let mdat = -1
    while (off < whole.length) {
      if (whole.toString('latin1', off + 4, off + 8) === 'mdat') mdat = off
      off += whole.readUInt32BE(off)
    }
    fs.writeFileSync(entry, whole.subarray(0, mdat))
    const result = await encodeVariants({ variants, root, cache })
    expect(result.encoded).toEqual([cacheName(v)])
    expect(fs.statSync(entry).size).toBe(whole.length)
  })

  it('treats a whole image of the wrong width as a miss', async () => {
    const variants = await source()
    await encodeVariants({ variants, root, cache })
    const [narrow, wide] = variants.filter((v) => v.format === 'avif')
    fs.copyFileSync(
      path.join(cache, cacheName(wide)),
      path.join(cache, cacheName(narrow)),
    )
    const result = await encodeVariants({ variants, root, cache })
    expect(result.encoded).toEqual([cacheName(narrow)])
    expect(readImageHeader(path.join(root, narrow.path)).width).toBe(
      narrow.width,
    )
  })

  it('rejects an empty cache entry as a hit, and replaces it', async () => {
    const variants = await source()
    fs.mkdirSync(cache, { recursive: true })
    fs.writeFileSync(path.join(cache, cacheName(variants[0])), '')
    const result = await encodeVariants({ variants, root, cache })
    expect(result.encoded).toContain(cacheName(variants[0]))
    expect(
      fs.statSync(path.join(cache, cacheName(variants[0]))).size,
    ).toBeGreaterThan(0)
  })

  it('encodes again under refresh, and needs no cache at all', async () => {
    const variants = await source()
    await encodeVariants({ variants, root, cache })
    const refreshed = await encodeVariants({
      variants,
      root,
      cache,
      refresh: true,
    })
    expect(refreshed.encoded).toHaveLength(6)
    const none = await encodeVariants({ variants, root, cache: null })
    expect(none.encoded).toHaveLength(6)
  })

  it('makes no cache folder when nothing is asked for', async () => {
    const result = await encodeVariants({ variants: [], root, cache })
    expect(result.requested).toBe(0)
    expect(fs.existsSync(cache)).toBe(false)
  })

  it('warns once and carries on when the cache cannot be written', async () => {
    const variants = await source()
    fs.writeFileSync(cache, 'a file where the folder should be')
    const warnings = []
    const result = await encodeVariants({
      variants,
      root,
      cache,
      warn: (m) => warnings.push(m),
    })
    expect(result.cacheSkipped).toBe(true)
    expect(result.written).toHaveLength(6)
    expect(warnings).toHaveLength(1)
  })

  it('reports a source it cannot decode as a failure of that source', async () => {
    const variants = await source()
    fs.writeFileSync(path.join(root, 'img/hero.jpg'), 'not a jpeg')
    const result = await encodeVariants({ variants, root, cache })
    expect(result.failures.map((f) => f.source)).toEqual(['img/hero.jpg'])
    expect(result.written).toEqual([])
  })

  it('reports a cache copy that fails as that source failing, and returns only once every source has settled', async () => {
    // hero.jpg is a cache hit whose copy throws; other.jpg is a miss still
    // encoding when it does. A rejection then would let the build discard
    // its staging folder while other.jpg's worker goes on writing into it.
    const hero = await source()
    await encodeVariants({ variants: hero, root, cache })
    await sharp({
      create: { width: 900, height: 600, channels: 3, background: '#a36' },
    })
      .jpeg()
      .toFile(path.join(root, 'img/other.jpg'))
    const otherFile = path.join(root, 'img/other.jpg')
    const plan = planImage({
      emitted: 'img/other.jpg',
      header: readImageHeader(otherFile),
      digest: fileDigest(otherFile),
      images: resolveImages({ widths: [480, 960] }),
    })
    const other = [
      ...plan.sources.flatMap((s) => s.variants),
      ...plan.fallback,
    ].map((v) => ({ ...v, source: 'img/other.jpg' }))
    for (const v of hero) fs.rmSync(path.join(root, v.path), { force: true })

    const copy = vi.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw Object.assign(new Error('EACCES: permission denied'), {
        code: 'EACCES',
      })
    })
    let result
    try {
      result = await encodeVariants({
        variants: [...hero, ...other],
        root,
        cache,
        concurrency: 2,
      })
    } finally {
      copy.mockRestore()
    }
    expect(result.failures.map((f) => f.source)).toEqual(['img/hero.jpg'])
    expect(result.failures[0].error.message).toMatch(/EACCES/)
    // other.jpg finished before encodeVariants returned.
    for (const v of other)
      expect(fs.existsSync(path.join(root, v.path))).toBe(true)
    expect(result.encoded).toHaveLength(other.length)
  })
})
