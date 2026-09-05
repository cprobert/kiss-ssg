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

  it('takes the default for a key passed explicitly as undefined', () => {
    expect(resolveConfig({ port: undefined }).port).toBe(3001)
    expect(resolveConfig({ cleanBuild: undefined }).cleanBuild).toBe(true)
    expect(
      resolveConfig({ sass: { includePaths: undefined } }).sass.includePaths,
    ).toEqual([])
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

  it('resolves no root folder', () => {
    expect(resolveConfig({}).folders).not.toHaveProperty('root')
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
  })
})
