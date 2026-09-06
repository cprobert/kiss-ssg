import { describe, it, expect } from 'vitest'
import {
  resolveConfig,
  resolveFolders,
  foldersToEnsure,
  DEFAULT_FOLDERS,
} from '../../lib/config.js'

describe('resolveFolders', () => {
  it('returns the defaults when nothing is given', () => {
    expect(resolveFolders()).toEqual(DEFAULT_FOLDERS)
  })

  it('re-derives every subfolder from src, unless explicitly set', () => {
    const f = resolveFolders({ src: './site', build: 'out', models: null })
    expect(f.pages).toBe('./site/pages')
    expect(f.partials).toBe('./site/partials')
    expect(f.build).toBe('out')
    expect(f.models).toBeNull()
  })

  it('strips trailing slashes from every folder, derived or explicit', () => {
    const f = resolveFolders({ src: './site/', assets: './src/assets/' })
    expect(f.src).toBe('./site')
    expect(f.pages).toBe('./site/pages')
    expect(f.partials).toBe('./site/partials')
    expect(f.assets).toBe('./src/assets')
  })

  it('normalises separators and collapses repeated slashes', () => {
    const f = resolveFolders({ src: '.\\site\\', build: 'out//dist/' })
    expect(f.src).toBe('./site')
    expect(f.models).toBe('./site/models')
    expect(f.build).toBe('out/dist')
  })

  it('keeps a folder usable when it is only a slash', () => {
    expect(resolveFolders({ build: '/' }).build).toBe('/')
    expect(resolveFolders({ build: './' }).build).toBe('./')
  })

  it('has no root key — it was documented but never read', () => {
    expect(resolveFolders()).not.toHaveProperty('root')
  })

  it('has no static key — it was documented but never read', () => {
    expect(resolveFolders()).not.toHaveProperty('static')
    expect(resolveFolders({ src: './site' })).not.toHaveProperty('static')
  })
})

describe('resolveConfig', () => {
  it('applies defaults and merges sass options', () => {
    const c = resolveConfig({ verbose: true, sass: { includePaths: ['x'] } })
    expect(c.dev).toBe(false)
    expect(c.cleanBuild).toBe(true)
    expect(c.port).toBe(3001)
    expect(c.livereloadPort).toBe(35729)
    expect(c.devHost).toBe('127.0.0.1')
    expect(c.verbose).toBe(true)
    expect(c.sass.includePaths).toEqual(['x'])
    expect(c.folders.pages).toBe('./src/pages')
  })

  it('defaults the fetch block for url models', () => {
    const c = resolveConfig({})
    expect(c.fetch).toEqual({
      headers: {},
      timeout: 10000,
      retries: 0,
      cache: false,
    })
  })

  it('merges the fetch block one level deep, like sass', () => {
    const c = resolveConfig({ fetch: { timeout: 1 } })
    expect(c.fetch).toEqual({
      headers: {},
      timeout: 1,
      retries: 0,
      cache: false,
    })
  })

  it('defaults the assets cache-busting block', () => {
    expect(resolveConfig({}).assets).toEqual({ hash: false, version: null })
  })

  it('merges the assets block one level deep, like sass', () => {
    expect(resolveConfig({ assets: { version: '1.2.3' } }).assets).toEqual({
      hash: false,
      version: '1.2.3',
    })
    expect(resolveConfig({ assets: { hash: true } }).assets).toEqual({
      hash: true,
      version: null,
    })
  })

  it('takes the default for a key passed explicitly as undefined', () => {
    expect(resolveConfig({ port: undefined }).port).toBe(3001)
    expect(resolveConfig({ cleanBuild: undefined }).cleanBuild).toBe(true)
    expect(
      resolveConfig({ sass: { includePaths: undefined } }).sass.includePaths,
    ).toEqual([])
    expect(resolveConfig({ fetch: { timeout: undefined } }).fetch.timeout).toBe(
      10000,
    )
    expect(resolveConfig({ assets: { hash: undefined } }).assets.hash).toBe(
      false,
    )
  })

  it('takes the default for a folder passed explicitly as undefined', () => {
    expect(
      resolveConfig({ folders: { assets: undefined } }).folders.assets,
    ).toBe('./src/assets')
  })

  it('keeps null as a value — it switches a folder off', () => {
    expect(
      resolveConfig({ folders: { assets: null } }).folders.assets,
    ).toBeNull()
  })

  it("accepts true, false and 'atomic' for cleanBuild, and nothing else", () => {
    expect(resolveConfig({ cleanBuild: true }).cleanBuild).toBe(true)
    expect(resolveConfig({ cleanBuild: false }).cleanBuild).toBe(false)
    expect(resolveConfig({ cleanBuild: 'atomic' }).cleanBuild).toBe('atomic')
    expect(() => resolveConfig({ cleanBuild: 'yes' })).toThrow(/cleanBuild/)
    expect(() => resolveConfig({ cleanBuild: 1 })).toThrow(/cleanBuild/)
    expect(() => resolveConfig({ cleanBuild: null })).toThrow(/cleanBuild/)
  })

  it('resolves no root folder', () => {
    expect(resolveConfig({}).folders).not.toHaveProperty('root')
  })

  it('resolves no static folder', () => {
    expect(resolveConfig({}).folders).not.toHaveProperty('static')
  })
})

describe('the build folder may never contain the source folder', () => {
  it('refuses a build folder that is the source folder', () => {
    expect(() =>
      resolveConfig({ folders: { src: './site', build: './site' } }),
    ).toThrow(/build folder/i)
  })

  it('refuses a build folder that is an ancestor of the source folder', () => {
    expect(() => resolveConfig({ folders: { build: '.' } })).toThrow(
      /build folder/i,
    )
    expect(() => resolveConfig({ folders: { build: './' } })).toThrow(
      /build folder/i,
    )
    expect(() => resolveConfig({ folders: { build: '/' } })).toThrow(
      /build folder/i,
    )
    expect(() =>
      resolveConfig({ folders: { src: './site/src', build: './site' } }),
    ).toThrow(/build folder/i)
  })

  it('allows a build folder that merely sits beside the source folder', () => {
    // The metacarpus shape: an archive root the source folder is not under.
    // The guard is a floor, not the fix for a build folder holding published
    // output — that is `cleanBuild: 'atomic'` plus validating the name.
    expect(
      resolveConfig({ folders: { build: './handbooks' } }).folders.build,
    ).toBe('./handbooks')
    expect(
      resolveConfig({ folders: { build: './handbooks/2026-sept' } }).folders
        .build,
    ).toBe('./handbooks/2026-sept')
  })

  it('leaves resolveFolders alone — the guard is a config-level refusal', () => {
    expect(resolveFolders({ build: '/' }).build).toBe('/')
  })
})

describe('foldersToEnsure', () => {
  it('lists every non-null folder that Kiss must create, regardless of assets', () => {
    const list = foldersToEnsure(resolveFolders({ src: 's', assets: null }))
    expect(list).toContain('s/layouts')
    expect(list).toContain('s/partials')
    expect(list).toContain('s/models')
    expect(list).toContain('s/controllers')
    expect(list).not.toContain(null)
    expect(list).not.toContain('s/static')
  })
})
