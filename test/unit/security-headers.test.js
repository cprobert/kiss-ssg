import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  SECURITY_HEADERS,
  SECURITY_BLOCK,
  siteHeaderNames,
  securityHeaders,
  renderSecurityBlock,
  renderFirebaseSecurityHeaders,
  writeSecurityHeaders,
} from '../../lib/security-headers.js'
import {
  mergeHeadersFile,
  renderHeadersBlock,
  BLOCK_START,
} from '../../lib/cache-headers.js'

describe('the baseline', () => {
  it('is the light, set-and-forget set, with no X-XSS-Protection and no preload', () => {
    expect(Object.keys(SECURITY_HEADERS)).toEqual([
      'Strict-Transport-Security',
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ])
    // includeSubDomains and preload only once every subdomain serves HTTPS
    // (research, second pass, finding 2): the site adds them, kiss does not.
    expect(SECURITY_HEADERS['Strict-Transport-Security']).toBe(
      'max-age=63072000',
    )
    const names = Object.keys(SECURITY_HEADERS).map((n) => n.toLowerCase())
    for (const costly of [
      'x-xss-protection',
      'content-security-policy',
      'x-frame-options',
      'cross-origin-opener-policy',
    ])
      expect(names).not.toContain(costly)
  })
})

describe('the site’s own headers win', () => {
  const site = [
    '/*',
    '  X-Content-Type-Options: nosniff',
    '  referrer-policy: no-referrer',
    '/admin/*',
    '  Permissions-Policy: camera=()',
    BLOCK_START,
    '/*',
    '  Strict-Transport-Security: max-age=1',
    '# kiss-ssg: end of cache headers',
    '',
  ].join('\n')

  // Codex review, 2026-11-06: a header the site sets on a narrower path
  // (`/admin/*`) counts too, or kiss's `/*` value would join and override it.
  it('reads every path the site sets, case-insensitively, outside kiss’s blocks', () => {
    expect([...siteHeaderNames(site)].sort()).toEqual([
      'permissions-policy',
      'referrer-policy',
      'x-content-type-options',
    ])
  })

  it('leaves a header the site sets to the site, and names it', () => {
    const { headers, skipped } = securityHeaders(siteHeaderNames(site))
    expect(skipped).toEqual([
      'X-Content-Type-Options',
      'Referrer-Policy',
      'Permissions-Policy',
    ])
    expect(Object.keys(headers)).toEqual(['Strict-Transport-Security'])
  })
})

describe('encodings', () => {
  it('a `_headers` block is one `/*` rule between its own markers', () => {
    expect(renderSecurityBlock({ 'X-Content-Type-Options': 'nosniff' })).toBe(
      `${SECURITY_BLOCK.start}\n/*\n  X-Content-Type-Options: nosniff\n${SECURITY_BLOCK.end}\n`,
    )
  })

  it('the security block sits beside the cache block, and replaces only itself', () => {
    const cache = renderHeadersBlock([
      { path: '/a.12345678.css', headers: { 'Cache-Control': 'x' } },
    ])
    const once = mergeHeadersFile(
      cache,
      renderSecurityBlock({ A: '1' }),
      SECURITY_BLOCK,
    )
    const twice = mergeHeadersFile(
      once,
      renderSecurityBlock({ A: '2' }),
      SECURITY_BLOCK,
    )
    expect(twice).toContain(BLOCK_START)
    expect(twice).toContain('  A: 2')
    expect(twice).not.toContain('  A: 1')
    expect(twice.split(SECURITY_BLOCK.start).length).toBe(2)
  })

  it('the Firebase fragment is one `**` source of key/value pairs', () => {
    expect(JSON.parse(renderFirebaseSecurityHeaders({ A: '1' }))).toEqual({
      headers: [{ source: '**', headers: [{ key: 'A', value: '1' }] }],
    })
  })
})

describe('writeSecurityHeaders', () => {
  let root
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-security-'))
  })
  afterEach(async () => {
    await fs.remove(root)
  })
  const config = (extra) => ({ securityHeaders: true, host: [], ...extra })

  it('writes nothing when the site has not turned it on', async () => {
    const result = await writeSecurityHeaders({
      config: { host: ['netlify'] },
      root,
    })
    expect(result.status).toBe('none')
    expect(await fs.readdir(root)).toEqual([])
  })

  it('turned off, takes back what an earlier build wrote and keeps the rest', async () => {
    // cleanBuild: false keeps the folder, so a block an earlier build wrote
    // would otherwise stay live after the site turned the option off.
    const site = '/*\n  X-Frame-Options: SAMEORIGIN\n'
    const cache = renderHeadersBlock([
      { path: '/a.1234abcd.css', headers: { 'Cache-Control': 'immutable' } },
    ])
    const before = mergeHeadersFile(
      mergeHeadersFile(site, cache),
      renderSecurityBlock(SECURITY_HEADERS),
      SECURITY_BLOCK,
    )
    await fs.outputFile(path.join(root, '_headers'), before)
    await fs.outputFile(path.join(root, 'security-headers.json'), '{}')
    await fs.outputFile(path.join(root, 'security-headers.firebase.json'), '{}')
    await writeSecurityHeaders({ config: { host: ['netlify'] }, root })
    expect(await fs.readFile(path.join(root, '_headers'), 'utf8')).toBe(
      mergeHeadersFile(site, cache),
    )
    expect(await fs.readdir(root)).toEqual(['_headers'])
  })

  it('removes a `_headers` that held nothing but its block', async () => {
    await fs.outputFile(
      path.join(root, '_headers'),
      renderSecurityBlock(SECURITY_HEADERS),
    )
    await writeSecurityHeaders({
      config: { host: ['firebase'], securityHeaders: true },
      root,
    })
    expect(await fs.pathExists(path.join(root, '_headers'))).toBe(false)
    expect(
      await fs.pathExists(path.join(root, 'security-headers.firebase.json')),
    ).toBe(true)
  })

  it('merges into a `_headers` the site and the cache headers already wrote', async () => {
    const site = '/*\n  X-Content-Type-Options: nosniff\n'
    await fs.outputFile(path.join(root, '_headers'), site)
    const result = await writeSecurityHeaders({
      config: config({ host: ['netlify', 'cloudflare'] }),
      root,
    })
    const file = await fs.readFile(path.join(root, '_headers'), 'utf8')
    expect(file.startsWith(site)).toBe(true)
    expect(file).toContain('  Strict-Transport-Security: max-age=63072000')
    expect(file).not.toContain('  X-Content-Type-Options: nosniff\n# kiss')
    expect(result.skipped).toEqual(['X-Content-Type-Options'])
    expect(result.formats).toEqual(['netlify'])
  })

  it('writes the Firebase fragment, never firebase.json', async () => {
    const result = await writeSecurityHeaders({
      config: config({ host: ['firebase'] }),
      root,
    })
    expect(result.formats).toEqual(['firebase'])
    expect(await fs.pathExists(path.join(root, 'firebase.json'))).toBe(false)
    expect(
      await fs.pathExists(path.join(root, 'security-headers.firebase.json')),
    ).toBe(true)
  })

  // Codex review, 2026-11-06: Firebase never reads `_headers`, so a header
  // the site sets there must not be dropped from the Firebase fragment.
  it('keeps the full baseline in the Firebase fragment whatever _headers sets', async () => {
    await fs.outputFile(
      path.join(root, '_headers'),
      '/*\n  X-Content-Type-Options: nosniff\n',
    )
    await writeSecurityHeaders({
      config: config({ host: ['netlify', 'firebase'] }),
      root,
    })
    const fragment = JSON.parse(
      await fs.readFile(
        path.join(root, 'security-headers.firebase.json'),
        'utf8',
      ),
    )
    expect(fragment.headers[0].headers.map((h) => h.key)).toEqual(
      Object.keys(SECURITY_HEADERS),
    )
  })

  it('with no host, writes the portable list alone and says so', async () => {
    const result = await writeSecurityHeaders({ config: config(), root })
    expect(result.unset).toBe(true)
    expect(await fs.readdir(root)).toEqual(['security-headers.json'])
  })

  it('names Vercel as uncovered, and writes nothing for GitHub Pages', async () => {
    const result = await writeSecurityHeaders({
      config: config({ host: ['vercel', 'github-pages'] }),
      root,
    })
    expect(result.uncovered).toEqual(['vercel'])
    expect(result.formats).toEqual([])
  })
})
