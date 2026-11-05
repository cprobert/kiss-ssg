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
    fs.writeFileSync(
      path.join(site.root, '.kiss-cache/images/stale.avif'),
      'old',
    )
    const r = run('router.js')
    expect(r.status, r.stderr).toBe(0)
    // Two sources at 480 and 600, in AVIF, WebP and JPEG.
    expect(cacheFiles()).toHaveLength(12)
    expect(cacheFiles()).not.toContain('stale.avif')
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
