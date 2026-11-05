import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import {
  findOriginals,
  parseImagesArgs,
  pruneCache,
  readSweepLines,
  rewriteOriginals,
  sweepImages,
  sweepLine,
  sweepRequest,
} from '../../lib/images-sweep.js'
import { readImageHeader } from '../../lib/image-header.js'

sharp.cache(false)

let dir
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-sweep-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const GPS = { IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' } }
const write = (rel, content) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  fs.writeFileSync(path.join(dir, rel), content)
}
const photo = async (rel, width, height, { gps = false, orientation } = {}) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
  let p = sharp({
    create: { width, height, channels: 3, background: '#468' },
  }).jpeg()
  if (orientation) p = p.withMetadata({ orientation })
  if (gps) p = p.withExif(GPS)
  await p.toFile(path.join(dir, rel))
}

describe('parseImagesArgs', () => {
  it('reads flags before the script and passes the rest through', () => {
    expect(
      parseImagesArgs(['--refresh', '--write', 'router.js', '--season', 'x']),
    ).toEqual({
      script: 'router.js',
      args: ['--season', 'x'],
      refresh: true,
      write: true,
      help: false,
      error: null,
    })
    expect(parseImagesArgs(['router.js', '--', '--write']).args).toEqual([
      '--write',
    ])
  })

  // 2026-11-05: `images router.js --write` passed `--write` to the site's
  // script, rewrote nothing and exited 0, while the help and the sweep's own
  // "Run again with --write" put the flag after the script. Like check's
  // `--summary`, the sweep's two flags are ours wherever they are written
  // before a `--`; a site script never wants them.
  it('reads --write and --refresh after the script too, up to a --', () => {
    expect(parseImagesArgs(['router.js', '--write'])).toMatchObject({
      script: 'router.js',
      args: [],
      write: true,
      refresh: false,
    })
    expect(
      parseImagesArgs(['router.js', '--season', 'x', '--refresh']),
    ).toMatchObject({ args: ['--season', 'x'], refresh: true, write: false })
    expect(
      parseImagesArgs(['router.js', '--season', '--', '--write']),
    ).toMatchObject({ args: ['--season', '--write'], write: false })
  })

  it('needs a script, refuses an unknown flag, and answers --help', () => {
    expect(parseImagesArgs([]).error).toMatch(/needs the site's build script/)
    expect(parseImagesArgs(['--nope', 'r.js']).error).toBe(
      'unknown option: --nope',
    )
    expect(parseImagesArgs(['--help'])).toMatchObject({
      help: true,
      error: null,
    })
  })
})

describe('sweepRequest', () => {
  it('is off unless KISS_IMAGES names a file', () => {
    expect(sweepRequest({})).toBeNull()
    expect(sweepRequest({ KISS_IMAGES: '0' })).toBeNull()
    expect(sweepRequest({ KISS_IMAGES: '/tmp/x.jsonl' })).toEqual({
      file: '/tmp/x.jsonl',
      refresh: false,
    })
    expect(
      sweepRequest({ KISS_IMAGES: '/tmp/x', KISS_IMAGES_REFRESH: '1' }).refresh,
    ).toBe(true)
  })
})

// A cache entry's name: a 64-character digest and the variant's extension
// (`lib/image-encode.js` `cacheName`). Only names of that shape are pruned.
const entry = (seed, ext) => `${seed.repeat(64).slice(0, 64)}.${ext}`

describe('pruneCache', () => {
  it('removes what no page asked for, an empty entry and a temp file, and counts', () => {
    write(`c/${entry('a', 'avif')}`, 'kk')
    write(`c/${entry('b', 'webp')}`, 'nnn')
    write(`c/${entry('c', 'jpg')}`, 'oooo')
    write(`c/${entry('d', 'jpg')}`, '')
    write(`c/${entry('a', 'avif')}.123.0a1b2c3d.tmp`, 't')
    const result = pruneCache({
      dir: path.join(dir, 'c'),
      keep: new Set([
        entry('a', 'avif'),
        entry('b', 'webp'),
        entry('d', 'jpg'),
      ]),
      encoded: new Set([entry('b', 'webp')]),
    })
    expect(result).toEqual({
      added: { count: 1, bytes: 3 },
      removed: { count: 3, bytes: 5 },
      kept: { count: 1, bytes: 2 },
    })
    expect(fs.readdirSync(path.join(dir, 'c')).sort()).toEqual([
      entry('a', 'avif'),
      entry('b', 'webp'),
    ])
  })

  it('never touches a file that is not named like a cache entry', () => {
    // A cache folder pointed at the wrong place ('.', 'src/assets') must not
    // cost the site its files: only the cache's own names are its to remove.
    write(`c/${entry('c', 'jpg')}`, 'oooo')
    write('c/package.json', '{}')
    write('c/hero.jpg', 'photo')
    write(`c/${'a'.repeat(63)}.jpg`, 'short digest')
    write(`c/${entry('e', 'txt')}`, 'not an image')
    write('c/notes.tmp', 'tmp')
    const result = pruneCache({
      dir: path.join(dir, 'c'),
      keep: new Set(),
      encoded: new Set(),
    })
    expect(result.removed).toEqual({ count: 1, bytes: 4 })
    expect(fs.readdirSync(path.join(dir, 'c')).sort()).toEqual(
      [
        'package.json',
        'hero.jpg',
        `${'a'.repeat(63)}.jpg`,
        entry('e', 'txt'),
        'notes.tmp',
      ].sort(),
    )
  })

  it('removes nothing on a dry run, and answers zero for a missing folder', () => {
    write(`c/${entry('c', 'jpg')}`, 'o')
    pruneCache({
      dir: path.join(dir, 'c'),
      keep: new Set(),
      encoded: new Set(),
      dryRun: true,
    })
    expect(fs.existsSync(path.join(dir, `c/${entry('c', 'jpg')}`))).toBe(true)
    expect(
      pruneCache({
        dir: path.join(dir, 'none'),
        keep: new Set(),
        encoded: new Set(),
      }).removed.count,
    ).toBe(0)
  })
})

describe('originals', () => {
  it('lists the rasters with GPS or wider than the largest width, by path', async () => {
    await photo('a/wide.jpg', 3000, 100)
    await photo('a/located.jpg', 40, 20, { gps: true })
    await photo('a/fine.jpg', 40, 20)
    write('a/logo.svg', '<svg/>')
    const found = findOriginals({ dir: path.join(dir, 'a'), maxWidth: 1920 })
    expect(found.map((o) => [path.basename(o.file), o.gps, o.wide])).toEqual([
      ['located.jpg', true, false],
      ['wide.jpg', false, true],
    ])
  })

  it('rewrites them upright, stripped and no wider than the largest width', async () => {
    await photo('a/wide.jpg', 3000, 100)
    await photo('a/located.jpg', 400, 200, { gps: true, orientation: 6 })
    const found = findOriginals({ dir: path.join(dir, 'a'), maxWidth: 1920 })
    const results = await rewriteOriginals(found, 1920)
    expect(results.every((r) => r.replaced)).toBe(true)
    expect(readImageHeader(path.join(dir, 'a/wide.jpg'))).toMatchObject({
      width: 1920,
      gps: false,
    })
    // Turned upright: orientation 6 is gone and the stored size is the shown one.
    expect(readImageHeader(path.join(dir, 'a/located.jpg'))).toMatchObject({
      width: 200,
      height: 400,
      orientation: 1,
      gps: false,
    })
  })

  it('keeps a file whose rewrite would be larger and carried no GPS', async () => {
    // A tiny, already-tight JPEG wider than the limit by one pixel.
    await sharp({
      create: { width: 21, height: 2, channels: 3, background: '#000' },
    })
      .jpeg({ quality: 1 })
      .toFile(path.join(dir, 'tight.jpg'))
    const before = fs.readFileSync(path.join(dir, 'tight.jpg'))
    const [result] = await rewriteOriginals(
      [
        {
          file: path.join(dir, 'tight.jpg'),
          format: 'jpeg',
          width: 21,
          gps: false,
          wide: true,
        },
      ],
      20,
    )
    if (!result.replaced)
      expect(fs.readFileSync(path.join(dir, 'tight.jpg'))).toEqual(before)
    expect(result.replaced).toBe(result.after < result.before)
  })
})

describe('sweepImages', () => {
  const line = (over = {}) =>
    sweepLine({
      cache: path.join(dir, 'cache'),
      keys: [entry('a', 'avif')],
      encoded: [],
      assets: path.join(dir, 'assets'),
      maxWidth: 1920,
      ...over,
    })

  it('prunes each cache against every line that names it', async () => {
    write(`cache/${entry('a', 'avif')}`, 'a')
    write(`cache/${entry('b', 'avif')}`, 'bb')
    write(`cache/${entry('c', 'avif')}`, 'ccc')
    const result = await sweepImages({
      lines: [
        line(),
        line({ keys: [entry('b', 'avif')], encoded: [entry('b', 'avif')] }),
      ],
      reports: [{ ok: true }, { ok: true }],
      cwd: dir,
    })
    expect(result.code).toBe(0)
    expect(result.out).toContain(
      'cache: added 1 (0.0 KB), removed 1 (0.0 KB), kept 1 (0.0 KB)',
    )
    expect(fs.readdirSync(path.join(dir, 'cache')).sort()).toEqual([
      entry('a', 'avif'),
      entry('b', 'avif'),
    ])
  })

  it('refuses to prune after a failed build, or one that reported nothing', async () => {
    write(`cache/${entry('c', 'avif')}`, 'x')
    for (const run of [
      { lines: [line()], reports: [{ ok: false }] },
      { lines: [line({ failed: true })], reports: [{ ok: true }] },
      { lines: [], reports: [] },
    ]) {
      const result = await sweepImages({ ...run, cwd: dir })
      expect(result.code).toBe(1)
      expect(result.err).toMatch(/not pruned/)
    }
    expect(fs.existsSync(path.join(dir, `cache/${entry('c', 'avif')}`))).toBe(
      true,
    )
  })

  it('touches nothing when the script itself failed, even after every report it wrote was ok', async () => {
    // A script that settles one instance and then throws before the next has
    // written only passing reports; the next instance's entries would go.
    await photo('assets/img/located.jpg', 40, 20, { gps: true })
    write(`cache/${entry('c', 'avif')}`, 'x')
    for (const script of [
      { status: 1, signal: null, error: null },
      { status: null, signal: 'SIGTERM', error: null },
      { status: null, signal: null, error: new Error('spawn ENOENT') },
    ]) {
      const result = await sweepImages({
        lines: [line()],
        reports: [{ ok: true }],
        script,
        write: true,
        cwd: dir,
      })
      expect(result.code).toBe(1)
      expect(result.out).toBe('')
      expect(result.err).toMatch(/not pruned/)
    }
    expect(fs.existsSync(path.join(dir, `cache/${entry('c', 'avif')}`))).toBe(
      true,
    )
    expect(readImageHeader(path.join(dir, 'assets/img/located.jpg')).gps).toBe(
      true,
    )
  })

  it('lists the originals, and rewrites them only under write', async () => {
    await photo('assets/img/located.jpg', 40, 20, { gps: true })
    const listed = await sweepImages({
      lines: [line()],
      reports: [{ ok: true }],
      cwd: dir,
    })
    expect(listed.out).toContain('Originals: 1 to fix in the source')
    expect(listed.out).toContain('assets/img/located.jpg  GPS location')
    expect(readImageHeader(path.join(dir, 'assets/img/located.jpg')).gps).toBe(
      true,
    )
    const written = await sweepImages({
      lines: [line()],
      reports: [{ ok: true }],
      write: true,
      cwd: dir,
    })
    expect(written.out).toMatch(/rewrote assets\/img\/located\.jpg/)
    expect(readImageHeader(path.join(dir, 'assets/img/located.jpg')).gps).toBe(
      false,
    )
  })

  it('reads the lines a build appended', () => {
    const text = `${JSON.stringify(line())}\n\n${JSON.stringify(line({ keys: [] }))}\n`
    expect(readSweepLines(text)).toHaveLength(2)
  })
})
