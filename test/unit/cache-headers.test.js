import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {
  BLOCK_END,
  BLOCK_START,
  IMMUTABLE,
  cacheHeaderRules,
  firebaseLookalikes,
  hashedFiles,
  mergeHeadersFile,
  renderCacheHeadersJson,
  renderFirebaseCacheHeaders,
  renderHeadersBlock,
  resolveCacheHeaderFormats,
  writeCacheHeaders,
} from '../../lib/cache-headers.js'
import { resolveConfig } from '../../lib/config.js'

let root
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-cache-headers-'))
})
afterEach(async () => {
  await fs.remove(root)
})

const touch = (rel, contents = '') =>
  fs.outputFile(path.join(root, rel), contents)

describe('hashedFiles', () => {
  it('takes the renamed .css and .js entries that are in the build folder', async () => {
    await touch('css/site.a1b2c3d4.css')
    await touch('js/app.0f0f0f0f.js')
    await touch('img/logo.png')
    const files = hashedFiles({
      manifest: {
        'css/site.css': 'css/site.a1b2c3d4.css',
        'js/app.js': 'js/app.0f0f0f0f.js',
        'img/logo.png': 'img/logo.png',
        'js/plain.js': 'js/plain.js',
      },
      root,
    })
    expect(files).toEqual(['/css/site.a1b2c3d4.css', '/js/app.0f0f0f0f.js'])
  })

  it('adds the consent client, and leaves out an entry that is not on disk', async () => {
    await touch('kiss-consent.0123456789.js')
    const files = hashedFiles({
      manifest: { 'css/site.css': 'css/site.a1b2c3d4.css' },
      consentClient: 'kiss-consent.0123456789.js',
      root,
    })
    expect(files).toEqual(['/kiss-consent.0123456789.js'])
  })

  it('drops a path with whitespace in it, which would write two lines', async () => {
    await touch('css/my site.a1b2c3d4.css')
    expect(
      hashedFiles({
        manifest: { 'css/my site.css': 'css/my site.a1b2c3d4.css' },
        root,
      }),
    ).toEqual([])
  })
})

describe('the _headers block', () => {
  const rules = cacheHeaderRules(['/css/site.a1b2c3d4.css'])

  it('is one path per hashed file, its header indented below it, between the markers', () => {
    expect(renderHeadersBlock(rules)).toBe(
      `${BLOCK_START}\n/css/site.a1b2c3d4.css\n  Cache-Control: ${IMMUTABLE}\n${BLOCK_END}\n`,
    )
  })

  it('is the whole file when the site keeps none', () => {
    expect(mergeHeadersFile(null, renderHeadersBlock(rules))).toBe(
      renderHeadersBlock(rules),
    )
  })

  it("keeps every line of the site's own file and appends after it", () => {
    const site = '/*\n  Content-Security-Policy: default-src self\n'
    const merged = mergeHeadersFile(site, renderHeadersBlock(rules))
    expect(merged.startsWith(site)).toBe(true)
    expect(merged.endsWith(renderHeadersBlock(rules))).toBe(true)
  })

  it('replaces a block an earlier build left, rather than repeating it', () => {
    const site = '/*\n  X-Frame-Options: DENY\n'
    const once = mergeHeadersFile(site, renderHeadersBlock(rules))
    const newer = renderHeadersBlock(
      cacheHeaderRules(['/css/site.ffffffff.css']),
    )
    const twice = mergeHeadersFile(once, newer)
    expect(twice.split(BLOCK_START)).toHaveLength(2)
    expect(twice).toContain('/css/site.ffffffff.css')
    expect(twice).not.toContain('/css/site.a1b2c3d4.css')
    expect(twice.startsWith(site)).toBe(true)
  })
})

describe('the Firebase fragment', () => {
  it('is patterns, never paths, with the consent client only when there is one', () => {
    const without = JSON.parse(renderFirebaseCacheHeaders({ consent: false }))
    const withConsent = JSON.parse(
      renderFirebaseCacheHeaders({ consent: true }),
    )
    expect(without.headers).toHaveLength(1)
    expect(withConsent.headers).toHaveLength(2)
    for (const rule of withConsent.headers) {
      expect(rule.regex).toBeTypeOf('string')
      expect(rule.source).toBeUndefined()
      expect(rule.headers).toEqual([{ key: 'Cache-Control', value: IMMUTABLE }])
    }
  })

  it("matches kiss's hash shape and not a near miss", () => {
    const pattern = new RegExp(
      JSON.parse(renderFirebaseCacheHeaders({ consent: false })).headers[0]
        .regex,
    )
    expect(pattern.test('/css/site.a1b2c3d4.css')).toBe(true)
    expect(pattern.test('/site.a1b2c3d4.js')).toBe(true)
    expect(pattern.test('/css/site.css')).toBe(false)
    expect(pattern.test('/css/site.a1b2c3d.css')).toBe(false)
    // `{{image}}`'s variants are hashed by the same shape, in four formats.
    expect(pattern.test('/img/hero-960.a1b2c3d4.avif')).toBe(true)
    expect(pattern.test('/img/hero-960.a1b2c3d4.webp')).toBe(true)
    expect(pattern.test('/img/hero-960.a1b2c3d4.jpg')).toBe(true)
    expect(pattern.test('/img/hero-960.a1b2c3d4.png')).toBe(true)
    expect(pattern.test('/img/photo.a1b2c3d4.gif')).toBe(false)
    expect(pattern.test('/img/hero-960.avif')).toBe(false)
  })

  it('names an unhashed file the pattern would also match', () => {
    expect(
      firebaseLookalikes(
        ['/css/site.a1b2c3d4.css', '/vendor/lib.deadbeef.js', '/index.html'],
        ['/css/site.a1b2c3d4.css'],
      ),
    ).toEqual(['/vendor/lib.deadbeef.js'])
  })
})

describe('resolveCacheHeaderFormats', () => {
  it("drops 'none' and writes _headers once for netlify and cloudflare together", () => {
    expect(resolveCacheHeaderFormats(null)).toEqual([])
    expect(resolveCacheHeaderFormats('none')).toEqual([])
    expect(resolveCacheHeaderFormats(['netlify', 'cloudflare'])).toEqual([
      'netlify',
    ])
    expect(resolveCacheHeaderFormats(['firebase', 'netlify'])).toEqual([
      'firebase',
      'netlify',
    ])
  })
})

describe('writeCacheHeaders', () => {
  const manifest = { 'css/site.css': 'css/site.a1b2c3d4.css' }

  it('writes nothing when no file was hashed', async () => {
    const result = await writeCacheHeaders({
      config: resolveConfig({ host: 'netlify' }),
      root,
      manifest: { 'css/site.css': 'css/site.css' },
    })
    expect(result.status).toBe('none')
    expect(await fs.pathExists(path.join(root, 'cache-headers.json'))).toBe(
      false,
    )
  })

  it('with nothing hashed, deletes nothing and names what an earlier build left', async () => {
    const site = '/*\n  X-Frame-Options: SAMEORIGIN\n'
    await fs.outputFile(
      path.join(root, '_headers'),
      mergeHeadersFile(
        site,
        renderHeadersBlock([
          { path: '/a.1234abcd.css', headers: { 'Cache-Control': IMMUTABLE } },
        ]),
      ),
    )
    await fs.outputFile(path.join(root, 'cache-headers.json'), '{}')
    await fs.outputFile(path.join(root, 'cache-headers.firebase.json'), '{}')
    const before = await fs.readFile(path.join(root, '_headers'), 'utf8')
    const result = await writeCacheHeaders({
      config: resolveConfig({ host: 'netlify' }),
      root,
      manifest: {},
    })
    expect(result.stale).toEqual([
      '_headers',
      'cache-headers.json',
      'cache-headers.firebase.json',
    ])
    expect(await fs.readFile(path.join(root, '_headers'), 'utf8')).toBe(before)
    expect((await fs.readdir(root)).length).toBe(3)
  })

  it("host: 'netlify' writes the list and _headers", async () => {
    await touch('css/site.a1b2c3d4.css')
    const result = await writeCacheHeaders({
      config: resolveConfig({ host: 'netlify' }),
      root,
      manifest,
    })
    expect(result.formats).toEqual(['netlify'])
    expect(result.unset).toBe(false)
    expect(
      JSON.parse(
        await fs.readFile(path.join(root, 'cache-headers.json'), 'utf8'),
      ),
    ).toEqual({
      version: 1,
      rules: [
        {
          path: '/css/site.a1b2c3d4.css',
          headers: { 'Cache-Control': IMMUTABLE },
        },
      ],
    })
    expect(await fs.readFile(path.join(root, '_headers'), 'utf8')).toBe(
      renderHeadersBlock(result.rules),
    )
  })

  it("appends to a _headers the asset copy put there, keeping the site's lines", async () => {
    await touch('css/site.a1b2c3d4.css')
    const site = '/*\n  Content-Security-Policy: default-src self\n'
    await touch('_headers', site)
    const claimed = []
    const outputs = {
      kind: (file) => (path.basename(file) === '_headers' ? 'asset' : null),
      claim: (file) => claimed.push(path.basename(file)),
    }
    const result = await writeCacheHeaders({
      config: resolveConfig({ host: 'netlify' }),
      root,
      manifest,
      outputs,
    })
    const written = await fs.readFile(path.join(root, '_headers'), 'utf8')
    expect(written.startsWith(site)).toBe(true)
    expect(written).toContain('/css/site.a1b2c3d4.css')
    expect(result.merged).toBe(true)
    expect(claimed).not.toContain('_headers')
  })

  it("host: 'firebase' writes the fragment, never firebase.json", async () => {
    await touch('css/site.a1b2c3d4.css')
    await touch('vendor/lib.deadbeef.js')
    const result = await writeCacheHeaders({
      config: resolveConfig({ host: 'firebase' }),
      root,
      manifest,
    })
    expect(result.formats).toEqual(['firebase'])
    expect(
      await fs.pathExists(path.join(root, 'cache-headers.firebase.json')),
    ).toBe(true)
    expect(await fs.pathExists(path.join(root, 'firebase.json'))).toBe(false)
    expect(result.lookalikes).toEqual(['/vendor/lib.deadbeef.js'])
  })

  it("is unset with no host and no format, silent for 'github-pages', and names a host with no encoding", async () => {
    await touch('css/site.a1b2c3d4.css')
    const unset = await writeCacheHeaders({
      config: resolveConfig({}),
      root,
      manifest,
    })
    expect(unset.unset).toBe(true)
    expect(unset.formats).toEqual([])
    const pages = await writeCacheHeaders({
      config: resolveConfig({ host: 'github-pages' }),
      root,
      manifest,
    })
    expect(pages.unset).toBe(false)
    expect(pages.uncovered).toEqual([])
    const vercel = await writeCacheHeaders({
      config: resolveConfig({ host: 'vercel' }),
      root,
      manifest,
    })
    expect(vercel.unset).toBe(false)
    expect(vercel.uncovered).toEqual(['vercel'])
  })

  it('lets cacheHeaders.format override host', async () => {
    await touch('css/site.a1b2c3d4.css')
    const result = await writeCacheHeaders({
      config: resolveConfig({
        host: 'netlify',
        cacheHeaders: { format: 'none' },
      }),
      root,
      manifest,
    })
    expect(result.formats).toEqual([])
    expect(await fs.pathExists(path.join(root, '_headers'))).toBe(false)
  })
})

describe('renderCacheHeadersJson', () => {
  it('is byte-stable and newline-terminated', () => {
    const rules = cacheHeaderRules(['/a.0000000a.css'])
    expect(renderCacheHeadersJson(rules)).toBe(renderCacheHeadersJson(rules))
    expect(renderCacheHeadersJson(rules).endsWith('\n')).toBe(true)
  })
})
