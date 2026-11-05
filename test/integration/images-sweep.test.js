import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import sharp from 'sharp'
import { makeSite } from '../helpers/site.js'
import { readImageHeader } from '../../lib/image-header.js'

sharp.cache(false)

// `kiss-ssg images <script>` end to end: the bin spawns a real site's build,
// staged and discarded, and prunes the cache against what its pages asked for.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')
const engine = pathToFileURL(path.join(repoRoot, 'lib', 'kiss.js')).href

// Two instances sharing one cache, as one script building two sites does:
// the sweep must keep what either asks for.
const ROUTER = `import Kiss from '${engine}'
for (const name of ['a', 'b']) {
  const kiss = new Kiss({ folders: { src: './src', build: './public/' + name } })
  kiss.page({ view: name + '.hbs' }).generate()
  await kiss.complete().catch((err) => {
    console.error(err.message)
    process.exitCode = 1
  })
}
`
const PAGE = (src) =>
  `<!doctype html><html><head><title>t</title></head><body><main><h1>h</h1>{{image "${src}" alt="" sizes="100vw"}}</main></body></html>`

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

const run = (...args) =>
  spawnSync(process.execPath, [bin, 'images', ...args], {
    cwd: site.root,
    encoding: 'utf8',
  })
const cacheFiles = () =>
  fs.readdirSync(path.join(site.root, '.kiss-cache/images')).sort()

async function makeImageSite(router = ROUTER) {
  site = await makeSite({
    'router.js': router,
    'package.json': '{"type":"module"}',
    'src/pages/a.hbs': PAGE('img/a.jpg'),
    'src/pages/b.hbs': PAGE('img/b.jpg'),
  })
  fs.mkdirSync(path.join(site.root, 'src/assets/img'), { recursive: true })
  for (const [name, colour] of [
    ['a', '#a33'],
    ['b', '#3a3'],
  ])
    await sharp({
      create: { width: 600, height: 400, channels: 3, background: colour },
    })
      .jpeg()
      .toFile(path.join(site.root, `src/assets/img/${name}.jpg`))
}

describe('kiss-ssg images', () => {
  it('encodes the misses into the cache, prunes the rest, and publishes nothing', async () => {
    await makeImageSite()
    fs.mkdirSync(path.join(site.root, '.kiss-cache/images'), {
      recursive: true,
    })
    // An entry no page asks for any more (a cache-shaped name), and a file of
    // the site's own that is not the cache's to remove.
    const stale = `${'f'.repeat(64)}.avif`
    fs.writeFileSync(path.join(site.root, '.kiss-cache/images', stale), 'old')
    fs.writeFileSync(
      path.join(site.root, '.kiss-cache/images/README.md'),
      'kept',
    )
    const r = run('router.js')
    expect(r.status, r.stderr).toBe(0)
    // Two sources at 480 and 600, in AVIF, WebP and JPEG, and the README.
    expect(cacheFiles()).toHaveLength(13)
    expect(cacheFiles()).not.toContain(stale)
    expect(cacheFiles()).toContain('README.md')
    expect(r.stdout).toMatch(
      /^\.kiss-cache\/images: added 12 \([\d.]+ KB\), removed 1 \(0\.0 KB\), kept 0 \(0\.0 KB\)$/m,
    )
    expect(r.stdout).toContain(
      'Originals: none carries GPS or is wider than the recipe',
    )
    expect(fs.existsSync(path.join(site.root, 'public/a'))).toBe(false)
    expect(fs.existsSync(path.join(site.root, 'public/b'))).toBe(false)

    const again = run('router.js')
    expect(again.status).toBe(0)
    expect(again.stdout).toMatch(
      /added 0 \(0\.0 KB\), removed 0 \(0\.0 KB\), kept 12/,
    )
  }, 60000)

  it('drops what a page stops asking for, and keeps what another instance uses', async () => {
    await makeImageSite()
    expect(run('router.js').status).toBe(0)
    fs.writeFileSync(path.join(site.root, 'src/pages/b.hbs'), PAGE('img/a.jpg'))
    const r = run('router.js')
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(
      /added 0 \(0\.0 KB\), removed 6 \([\d.]+ KB\), kept 6/,
    )
  }, 60000)

  it('refuses to prune after a failed build, and exits 1', async () => {
    await makeImageSite()
    expect(run('router.js').status).toBe(0)
    fs.writeFileSync(
      path.join(site.root, 'src/pages/b.hbs'),
      '{{link "nowhere"}}',
    )
    const r = run('router.js')
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/the build failed, so the cache was not pruned/)
    expect(cacheFiles()).toHaveLength(12)
  }, 60000)

  it('touches nothing when the script throws after one site has settled', async () => {
    // Site a settles and reports ok; the script throws before site b runs, so
    // every report written is a pass and b's entries would be pruned.
    await makeImageSite()
    expect(run('router.js').status).toBe(0)
    fs.writeFileSync(
      path.join(site.root, 'router.js'),
      ROUTER.replace(
        "for (const name of ['a', 'b']) {",
        "for (const name of ['a', 'b']) {\n  if (name === 'b') throw new Error('stopped before b')",
      ),
    )
    await sharp({
      create: { width: 600, height: 400, channels: 3, background: '#33a' },
    })
      .withExif({
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' },
      })
      .jpeg()
      .toFile(path.join(site.root, 'src/assets/img/located.jpg'))
    const r = run('router.js', '--write')
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/the build failed, so the cache was not pruned/)
    expect(cacheFiles()).toHaveLength(12)
    expect(
      readImageHeader(path.join(site.root, 'src/assets/img/located.jpg')).gps,
    ).toBe(true)
  }, 60000)

  it('records the folders a build copies with .copyAssets() in its sweep line', async () => {
    await makeImageSite(
      ROUTER.replace(
        "kiss.page({ view: name + '.hbs' }).generate()",
        "kiss.copyAssets('./extra', './public/' + name + '/extra')\n  kiss.page({ view: name + '.hbs' }).generate()",
      ),
    )
    fs.mkdirSync(path.join(site.root, 'extra'), { recursive: true })
    fs.writeFileSync(path.join(site.root, 'extra/note.txt'), 'x')
    const sweepFile = path.join(site.root, 'sweep.jsonl')
    const r = spawnSync(process.execPath, ['router.js'], {
      cwd: site.root,
      encoding: 'utf8',
      env: { ...process.env, KISS_CHECK: '1', KISS_IMAGES: sweepFile },
    })
    expect(r.status, r.stderr).toBe(0)
    const lines = fs
      .readFileSync(sweepFile, 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    expect(lines).toHaveLength(2)
    for (const line of lines)
      expect(line.copies.map((d) => path.basename(d))).toContain('extra')
  }, 60000)

  it('sweeps the cache the instance was made with when the script changes directory', async () => {
    // Made in the site folder, completed after a chdir into another site.
    // Its pages ask for no image, so the build passes; the cache it reports
    // must be the one it was checked against at construction, or the sweep
    // empties the other site's committed cache against this site's pages.
    await makeImageSite(`import fs from 'node:fs'
import Kiss from '${engine}'
const kiss = new Kiss({ folders: { src: './src', build: './public/plain' } })
kiss.page({ view: 'plain.hbs' }).generate()
process.chdir('other')
await kiss.complete()
`)
    fs.writeFileSync(
      path.join(site.root, 'src/pages/plain.hbs'),
      '<!doctype html><html><head><title>t</title></head><body><main><h1>h</h1></main></body></html>',
    )
    const theirs = path.join(site.root, 'other/.kiss-cache/images')
    const entry = `${'e'.repeat(64)}.avif`
    fs.mkdirSync(theirs, { recursive: true })
    fs.writeFileSync(path.join(theirs, entry), 'committed')
    const r = run('router.js')
    expect(r.status, r.stderr).toBe(0)
    expect(fs.existsSync(path.join(theirs, entry))).toBe(true)
  }, 60000)

  it('exits 1 when the cache cannot be written, and prunes nothing', async () => {
    // A file where the cache folder should be: an ordinary build warns and
    // carries on, but the command whose whole job is the cache must fail.
    await makeImageSite()
    fs.mkdirSync(path.join(site.root, '.kiss-cache'), { recursive: true })
    fs.writeFileSync(path.join(site.root, '.kiss-cache/images'), 'not a folder')
    const r = run('router.js')
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/the encode cache could not be written/)
    expect(
      fs.readFileSync(path.join(site.root, '.kiss-cache/images'), 'utf8'),
    ).toBe('not a folder')
  }, 60000)

  it('exits 1 when the refresh after --write fails', async () => {
    // The first pass rewrites a.jpg and asks for a second; on that second run
    // the script leaves a sweep file that cannot be read, so the refresh
    // throws. A 0 there would let automation commit a stale cache.
    await makeImageSite(
      ROUTER +
        `import fs from 'node:fs'
if (fs.existsSync('.second-run')) fs.writeFileSync(process.env.KISS_IMAGES, '{not json')
else fs.writeFileSync('.second-run', '')
`,
    )
    await sharp({
      create: { width: 600, height: 400, channels: 3, background: '#33a' },
    })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' } })
      .toFile(path.join(site.root, 'src/assets/img/a.jpg'))
    const r = run('router.js', '--write')
    expect(r.stdout).toMatch(/rewrote src\/assets\/img\/a\.jpg/)
    expect(r.stderr).toMatch(/kiss-ssg images: /)
    expect(r.status).toBe(1)
  }, 60000)

  it('lists an original with GPS, and rewrites it only under --write', async () => {
    await makeImageSite()
    await sharp({
      create: { width: 600, height: 400, channels: 3, background: '#33a' },
    })
      .jpeg()
      .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' } })
      .toFile(path.join(site.root, 'src/assets/img/a.jpg'))
    const listed = run('router.js')
    expect(listed.stdout).toContain('src/assets/img/a.jpg  GPS location')
    expect(
      readImageHeader(path.join(site.root, 'src/assets/img/a.jpg')).gps,
    ).toBe(true)
    const written = run('--write', 'router.js')
    expect(written.status, written.stderr).toBe(0)
    expect(written.stdout).toMatch(/rewrote src\/assets\/img\/a\.jpg/)
    expect(
      readImageHeader(path.join(site.root, 'src/assets/img/a.jpg')).gps,
    ).toBe(false)
    // The rewrite changed a.jpg's digest, so the cache the sweep leaves must
    // already hold the new variants and none of the old: the next run, the
    // one a deploy makes, encodes nothing and prunes nothing.
    const after = run('router.js')
    expect(after.status, after.stderr).toBe(0)
    expect(after.stdout).toMatch(
      /added 0 \(0\.0 KB\), removed 0 \(0\.0 KB\), kept 12/,
    )
  }, 60000)

  it('prints its help, and a usage error without a script', async () => {
    await makeImageSite()
    const help = run('--help')
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('kiss-ssg images <script>')
    const bare = run()
    expect(bare.status).toBe(1)
    expect(bare.stderr).toMatch(/images needs the site's build script/)
  })
})
