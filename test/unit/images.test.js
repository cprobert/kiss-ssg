import { describe, it, expect } from 'vitest'
import {
  DEFAULT_IMAGES,
  createImageIndex,
  escapeAttribute,
  fallbackFormat,
  imageArguments,
  pictureHtml,
  plainImgHtml,
  planImage,
  recipeString,
  resolveImages,
  variantName,
  variantWidths,
} from '../../lib/images.js'

const RECIPE = resolveImages(undefined)
const DIGEST = 'a'.repeat(64)
const plan = (header, overrides = {}) =>
  planImage({
    emitted: 'img/hero.jpg',
    header: { format: 'jpeg', ...header },
    digest: DIGEST,
    images: RECIPE,
    ...overrides,
  })
const OK = { alt: 'A swan', sizes: '100vw', eager: false, root: '/', attrs: [] }

describe('resolveImages', () => {
  it('fills the provisional defaults', () => {
    expect(resolveImages(undefined)).toEqual({
      // 768: a full-width image on Lighthouse's phone (412 px at 1.75x) wants
      // 721 px and was sent the 960. On a1k9training, 768 cut the image bytes
      // a phone downloads by 19.9% over 20 pages (2026-11-08).
      widths: [480, 768, 960, 1440, 1920],
      formats: ['avif', 'webp'],
      quality: { avif: 50, webp: 75, jpeg: 80 },
      cache: '.kiss-cache/images',
    })
    expect(resolveImages(null)).toEqual(resolveImages(undefined))
    expect(DEFAULT_IMAGES.cache).toBe('.kiss-cache/images')
  })

  it('merges quality per format, sorts and dedupes widths, and takes cache: false', () => {
    expect(
      resolveImages({
        widths: [960, 480, 960],
        quality: { avif: 40 },
        cache: false,
      }),
    ).toEqual({
      widths: [480, 960],
      formats: ['avif', 'webp'],
      quality: { avif: 40, webp: 75, jpeg: 80 },
      cache: false,
    })
    expect(resolveImages({ formats: [] }).formats).toEqual([])
  })

  it.each([
    [[], /must be \{ widths/],
    [{ width: [1] }, /has no `width`/],
    [{ widths: [] }, /widths must be a non-empty list/],
    [{ widths: [10.5] }, /widths must be/],
    [{ formats: ['jpeg'] }, /formats must list 'avif' and\/or 'webp'/],
    [{ formats: ['avif', 'avif'] }, /each once/],
    [
      { quality: { avif: 0 } },
      /quality\.avif must be a whole number from 1 to 100/,
    ],
    [{ quality: { png: 50 } }, /quality has no `png`/],
    [{ cache: '' }, /cache must be a folder path or false/],
    [{ cache: true }, /cache must be a folder path or false/],
  ])('refuses %j', (images, message) => {
    expect(() => resolveImages(images)).toThrow(message)
  })
})

describe('variantWidths', () => {
  const widths = [480, 960, 1440, 1920]
  it('adds the source width when it falls between two steps', () => {
    expect(variantWidths(1200, widths)).toEqual([480, 960, 1200])
  })
  it('never enlarges: one variant at its own width below the smallest', () => {
    expect(variantWidths(300, widths)).toEqual([300])
  })
  it('stops at the largest step for a wider source, and does not repeat an exact step', () => {
    expect(variantWidths(4000, widths)).toEqual(widths)
    expect(variantWidths(960, widths)).toEqual([480, 960])
  })
})

describe('names', () => {
  it('puts the width before the hash and the hash before the extension', () => {
    expect(variantName('img/hero.jpg', 960, 'avif', 'deadbeef')).toBe(
      'img/hero-960.deadbeef.avif',
    )
    expect(variantName('img/hero.jpeg', 960, 'jpeg', 'deadbeef')).toBe(
      'img/hero-960.deadbeef.jpg',
    )
    expect(variantName('a.b/photo', 480, 'webp', '01234567')).toBe(
      'a.b/photo-480.01234567.webp',
    )
  })

  it('is stable for the same bytes and recipe, and moves with either', () => {
    const a = plan({ width: 1200, height: 800 })
    expect(plan({ width: 1200, height: 800 }).src.path).toBe(a.src.path)
    expect(a.src.path).toMatch(/^img\/hero-768\.[0-9a-f]{8}\.jpg$/)
    const otherBytes = plan(
      { width: 1200, height: 800 },
      { digest: 'b'.repeat(64) },
    )
    expect(otherBytes.src.path).not.toBe(a.src.path)
    const otherQuality = plan(
      { width: 1200, height: 800 },
      { images: resolveImages({ quality: { jpeg: 70 } }) },
    )
    expect(otherQuality.src.path).not.toBe(a.src.path)
    // The AVIF variants did not change: their recipe did not.
    expect(otherQuality.sources[0].variants[1].path).toBe(
      a.sources[0].variants[1].path,
    )
  })

  it('hashes the recipe without the encoder version', () => {
    expect(recipeString({ format: 'avif', width: 960, quality: 50 })).toBe(
      'kiss-image/1 avif w960 q50',
    )
    expect(recipeString({ format: 'png', width: 960, quality: null })).toBe(
      'kiss-image/1 png w960 q-',
    )
  })
})

describe('planImage', () => {
  it('serves AVIF and WebP sources, a JPEG fallback, the middle width as src, the largest size', () => {
    const p = plan({ width: 1200, height: 800 })
    expect(
      p.sources.map((s) => [s.type, s.variants.map((v) => v.width)]),
    ).toEqual([
      ['image/avif', [480, 768, 960, 1200]],
      ['image/webp', [480, 768, 960, 1200]],
    ])
    expect(p.fallback.map((v) => v.format)).toEqual([
      'jpeg',
      'jpeg',
      'jpeg',
      'jpeg',
    ])
    // The lower middle of four: a source wider than 1440 still gets 960.
    expect(p.src.width).toBe(768)
    expect(plan({ width: 2400, height: 1600 }).src.width).toBe(960)
    expect([p.width, p.height]).toEqual([1200, 800])
    expect(p.fallback[0].height).toBe(320)
  })

  it('falls back to JPEG for WebP and AVIF sources, PNG for PNG', () => {
    expect(fallbackFormat('webp')).toBe('jpeg')
    expect(fallbackFormat('avif')).toBe('jpeg')
    expect(fallbackFormat('png')).toBe('png')
    const p = plan({ format: 'png', width: 500, height: 100 })
    expect(p.fallback.map((v) => [v.path.slice(-4), v.quality])).toEqual([
      ['.png', null],
      ['.png', null],
    ])
  })
})

describe('imageArguments', () => {
  it('requires alt and sizes, and accepts alt=""', () => {
    expect(imageArguments({}).problems).toEqual([
      expect.stringMatching(/^alt= is required/),
      expect.stringMatching(/^sizes= is required/),
    ])
    expect(imageArguments({ alt: '', sizes: '50vw' }).problems).toEqual([])
    expect(imageArguments({ alt: 'x', sizes: '  ' }).problems).toHaveLength(1)
  })

  it.each([
    'src',
    'srcset',
    'width',
    'height',
    'loading',
    'fetchpriority',
    'SRC',
  ])('refuses %s= as a pass-through', (key) => {
    expect(
      imageArguments({ alt: '', sizes: '1px', [key]: 'x' }).problems,
    ).toEqual([`${key}= is written by {{image}} and cannot be passed`])
  })

  it('passes other attributes through, and defaults root to /', () => {
    const call = imageArguments({
      alt: '',
      sizes: '1px',
      class: 'hero',
      'data-x': 1,
    })
    expect(call.attrs).toEqual([
      ['class', 'hero'],
      ['data-x', 1],
    ])
    expect(call.root).toBe('/')
    expect(imageArguments({ alt: '', sizes: '1px', root: 3 }).problems).toEqual(
      ['root= must be a string'],
    )
  })
})

describe('pictureHtml', () => {
  const p = plan({ width: 1200, height: 800 })

  it('puts the same sizes on every <source> and the <img>, auto when lazy', () => {
    const html = pictureHtml(p, OK)
    expect(html.match(/sizes="[^"]*"/g)).toEqual([
      'sizes="auto, 100vw"',
      'sizes="auto, 100vw"',
      'sizes="auto, 100vw"',
    ])
    expect(html).toContain('loading="lazy"')
    expect(html).not.toContain('fetchpriority')
    expect(html).toContain(`src="/${p.src.path}"`)
    expect(html).toContain('width="1200" height="800"')
    expect(html).toMatch(
      /^<picture><source type="image\/avif" srcset="\/img\/hero-480\.[0-9a-f]{8}\.avif 480w, /,
    )
  })

  it('writes fetchpriority and no loading, and no auto, when eager', () => {
    const html = pictureHtml(p, { ...OK, eager: true })
    expect(html).toContain('fetchpriority="high"')
    expect(html).not.toContain('loading=')
    expect(html).not.toContain('auto,')
  })

  it('escapes alt and pass-through values', () => {
    const html = pictureHtml(p, {
      ...OK,
      alt: 'A "quoted" <b>&',
      attrs: [
        ['title', '"x"'],
        ['hidden', true],
        ['data-off', false],
      ],
    })
    expect(html).toContain('alt="A &quot;quoted&quot; &lt;b&gt;&amp;"')
    expect(html).toContain('title="&quot;x&quot;" hidden>')
    expect(html).not.toContain('data-off')
    expect(escapeAttribute('<&>"')).toBe('&lt;&amp;&gt;&quot;')
  })

  it('writes URLs against root=', () => {
    expect(pictureHtml(p, { ...OK, root: '../' })).toContain(
      `src="../${p.src.path}"`,
    )
    expect(pictureHtml(p, { ...OK, root: '' })).toContain(`src="${p.src.path}"`)
    expect(
      pictureHtml(p, { ...OK, root: 'https://cdn.example/site' }),
    ).toContain(`src="https://cdn.example/site/${p.src.path}"`)
  })
})

describe('plainImgHtml (dev)', () => {
  it('is the original at its own size with the build loading attributes', () => {
    expect(
      plainImgHtml(
        { emitted: 'img/hero.jpg', width: 1200, height: 800 },
        { ...OK, eager: true },
      ),
    ).toBe(
      '<img src="/img/hero.jpg" width="1200" height="800" alt="A swan" fetchpriority="high" decoding="async">',
    )
  })
})

describe('createImageIndex', () => {
  it('collects variants by path and the pages per source, and resets', () => {
    const index = createImageIndex()
    const p = plan({ width: 1200, height: 800 })
    index.record('img/hero.jpg', 'index.html', p.fallback)
    index.record('img/hero.jpg', 'about.html', p.fallback)
    index.record('img/other.jpg', 'about.html', [])
    expect(index.variants().map((v) => v.path)).toEqual(
      p.fallback.map((v) => v.path).sort(),
    )
    expect(index.pagesUsing('img/hero.jpg')).toEqual([
      'about.html',
      'index.html',
    ])
    index.reset()
    expect(index.variants()).toEqual([])
    expect(index.pagesUsing('img/hero.jpg')).toEqual([])
  })
})
