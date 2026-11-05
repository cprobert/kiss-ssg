import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import sharp from 'sharp'
import {
  IMAGE_OVERSIZED_BYTES,
  auditBuild,
  extractPageFacts,
} from '../../lib/audit.js'
import { auditLines } from '../../lib/build-report.js'

// The three image checks (`planning/plans/2026-11-04-kiss-performance.md`,
// F7 and D-F3), against a real build folder holding real images.

const doc = (body) =>
  `<!doctype html><html><head><title>t</title></head><body><main>${body}</main></body></html>`

let root
const GPS = { IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1' } }
beforeAll(async () => {
  root = fs
    .mkdtempSync(path.join(os.tmpdir(), 'kiss-audit-images-'))
    .replace(/\\/g, '/')
  fs.mkdirSync(`${root}/img`, { recursive: true })
  const make = (w, h) =>
    sharp({ create: { width: w, height: h, channels: 3, background: '#468' } })
  await make(40, 20).jpeg().toFile(`${root}/img/small.jpg`)
  await make(40, 20).jpeg().withExif(GPS).toFile(`${root}/img/located.jpg`)
  await make(40, 20).png().withExif(GPS).toFile(`${root}/img/located.png`)
  // Noise does not compress: a big PNG well over the threshold.
  const noise = randomBytes(400 * 400 * 3)
  await sharp(noise, { raw: { width: 400, height: 400, channels: 3 } })
    .png()
    .toFile(`${root}/img/big.png`)
  fs.writeFileSync(
    `${root}/img/logo.svg`,
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  )
})
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

const page = (body, name = 'index.html') => ({
  buildTo: `${root}/${name}`,
  facts: extractPageFacts(doc(body), name),
})
const run = (pages, options = {}) =>
  auditBuild({ pages, buildDir: root, ...options }).findings.filter((f) =>
    /^im/.test(f.check),
  )

describe('image facts', () => {
  it('lists every image URL from src and srcset, and the <img> tags fetched at one size', () => {
    const facts = extractPageFacts(
      doc(
        '<img src="/a.jpg" alt="">' +
          '<img src="/b.jpg" srcset="/b-1.jpg 1x, /b-2.jpg 2x" alt="">' +
          '<picture><source srcset="/c.avif 480w"><img src="/c.jpg" alt=""></picture>' +
          '<template><img src="/t.jpg"></template>',
      ),
      'x.html',
    )
    expect(facts.imageRefs).toEqual([
      '/a.jpg',
      '/b-1.jpg',
      '/b-2.jpg',
      '/b.jpg',
      '/c.avif',
      '/c.jpg',
    ])
    expect(facts.imgPlain).toEqual(['/a.jpg'])
  })
})

describe('image-oversized', () => {
  it('names each referenced raster over the threshold, with its size, per page', () => {
    const big = Math.round(fs.statSync(`${root}/img/big.png`).size / 1024)
    expect(fs.statSync(`${root}/img/big.png`).size).toBeGreaterThan(
      IMAGE_OVERSIZED_BYTES,
    )
    const findings = run([
      page('<img src="/img/big.png" alt="" width="1" height="1">'),
      page(
        '<img srcset="img/big.png 2x" src="img/small.jpg" alt="">',
        'about.html',
      ),
    ]).filter((f) => f.check === 'image-oversized')
    expect(findings).toEqual([
      {
        check: 'image-oversized',
        page: `${root}/about.html`,
        detail: `img/big.png (${big} KB)`,
      },
      {
        check: 'image-oversized',
        page: `${root}/index.html`,
        detail: `img/big.png (${big} KB)`,
      },
    ])
  })

  it('ignores a file no page references, a small one, an SVG and an external URL', () => {
    expect(
      run([
        page(
          '<img src="/img/small.jpg" alt=""><img src="/img/logo.svg" alt=""><img src="https://cdn.example/img/big.png" alt="">',
        ),
      ]).filter((f) => f.check === 'image-oversized'),
    ).toEqual([])
  })

  it('reads as one summary line per file', () => {
    const findings = run([page('<img src="/img/big.png" alt="">')])
    const lines = auditLines({ checked: 1, ignored: [], skipped: [], findings })
    expect(lines.find((l) => l.startsWith('audit image-oversized'))).toMatch(
      /^audit image-oversized: "img\/big\.png \(\d+ KB\)" on 1 page/,
    )
  })
})

describe('image-location-metadata', () => {
  it('names every shipped raster carrying a GPS location, referenced or not', () => {
    expect(
      run([page('<p>none</p>')]).filter(
        (f) => f.check === 'image-location-metadata',
      ),
    ).toEqual([
      {
        check: 'image-location-metadata',
        page: `${root}/img/located.jpg`,
        detail: null,
      },
      {
        check: 'image-location-metadata',
        page: `${root}/img/located.png`,
        detail: null,
      },
    ])
  })

  it('is a file check in the summary', () => {
    const findings = run([page('<p>none</p>')])
    const lines = auditLines({ checked: 1, ignored: [], skipped: [], findings })
    expect(lines).toContain(
      `audit image-location-metadata: 2 files (${root}/img/located.jpg, ${root}/img/located.png)`,
    )
  })
})

describe('img-not-responsive', () => {
  it('names an <img> with no srcset outside a <picture> whose src is a raster in the build', () => {
    expect(
      run([
        page(
          '<img src="/img/small.jpg" alt=""><img src="/img/small.jpg" alt="">' +
            '<img src="/img/logo.svg" alt="">' +
            '<img src="/img/missing.jpg" alt="">' +
            '<img src="/img/small.jpg" srcset="/img/small.jpg 1x" alt="">' +
            '<picture><img src="/img/small.jpg" alt=""></picture>',
        ),
      ]).filter((f) => f.check === 'img-not-responsive'),
    ).toEqual([
      {
        check: 'img-not-responsive',
        page: `${root}/index.html`,
        detail: '/img/small.jpg',
      },
    ])
  })
})

describe('the walk image checks under cleanBuild: false', () => {
  it('are skipped, and img-not-responsive still runs', () => {
    const result = auditBuild({
      pages: [page('<img src="/img/big.png" alt="">')],
      buildDir: root,
      ownsFolder: false,
    })
    expect(result.skipped).toContain('image-oversized')
    expect(result.skipped).toContain('image-location-metadata')
    expect(result.findings.map((f) => f.check)).toContain('img-not-responsive')
    expect(result.findings.map((f) => f.check)).not.toContain('image-oversized')
  })
})
