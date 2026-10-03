import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {
  assetCopyKey,
  canonical,
  copyAssetFolder,
} from '../../lib/asset-copy.js'
import { createAssetManifest } from '../../lib/asset-manifest.js'
import { OutputRegistry } from '../../lib/output-registry.js'
import { silentLogger } from '../../lib/logger.js'
import { resolveConfig } from '../../lib/config.js'

let temp
afterEach(async () => {
  if (temp) await fs.remove(temp)
  temp = null
})

const makeTemp = async () =>
  (temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-asset-copy-')))

// The state `copyAssetFolder` reads and writes on a Kiss instance, and no more.
const instance = (build) => ({
  config: resolveConfig({ folders: { src: path.dirname(build), build } }),
  logger: silentLogger,
  _assetQueue: Promise.resolve(),
  _promises: [],
  _failures: [],
  _sassFailures: new Map(),
  _assetCopies: new Map(),
  _restorableAssets: new Map(),
  _assetManifest: createAssetManifest(),
  _outputs: new OutputRegistry(silentLogger),
  _defaultAssetCopy: { targetDir: build },
  _stagedPath: (target) => target,
  _carry: (failure) => failure,
  _refreshReport: vi.fn(),
})

describe('canonical', () => {
  it('gives a folder the same key before and after it exists', async () => {
    const root = await makeTemp()
    const future = path.join(root, 'vendor')
    const before = canonical(future)
    await fs.ensureDir(future)
    expect(canonical(future)).toBe(before)
  })
})

describe('assetCopyKey', () => {
  it('is null when either half of the copy is missing', () => {
    expect(assetCopyKey(null, 'public')).toBe(null)
    expect(assetCopyKey('src/assets', undefined)).toBe(null)
  })

  it('is one key for two spellings of the same folders', async () => {
    const root = await makeTemp()
    await fs.ensureDir(path.join(root, 'src', 'assets'))
    expect(
      assetCopyKey(path.join(root, 'src', 'assets'), path.join(root, 'out')),
    ).toBe(
      assetCopyKey(
        path.join(root, 'src', '.', 'assets'),
        path.join(root, 'src', '..', 'out'),
      ),
    )
  })
})

describe('copyAssetFolder', () => {
  it('queues registration copies in order and tracks them on _promises', async () => {
    const root = await makeTemp()
    await fs.outputFile(path.join(root, 'a', 'one.txt'), '1')
    await fs.outputFile(path.join(root, 'b', 'two.txt'), '2')
    const build = path.join(root, 'public')
    const kiss = instance(build)

    const first = copyAssetFolder(kiss, path.join(root, 'a'), build)
    const second = copyAssetFolder(kiss, path.join(root, 'b'), build)

    expect(kiss._assetQueue).toBe(second)
    expect(kiss._promises).toEqual([first, second])
    await second
    expect(await fs.readFile(path.join(build, 'one.txt'), 'utf8')).toBe('1')
    expect(await fs.readFile(path.join(build, 'two.txt'), 'utf8')).toBe('2')
  })

  it('keeps a watch copy off _promises', async () => {
    const root = await makeTemp()
    await fs.outputFile(path.join(root, 'a', 'one.txt'), '1')
    const kiss = instance(path.join(root, 'public'))
    await copyAssetFolder(
      kiss,
      path.join(root, 'a'),
      path.join(root, 'public'),
      true,
    )
    expect(kiss._promises).toEqual([])
  })

  it('records a stylesheet that will not compile as a failure the copy owns, and clears it when fixed', async () => {
    const root = await makeTemp()
    const source = path.join(root, 'assets')
    const build = path.join(root, 'public')
    await fs.outputFile(path.join(source, 'bad.scss'), 'a { color: ')
    const kiss = instance(build)

    await copyAssetFolder(kiss, source, build)
    expect(kiss._failures).toHaveLength(1)
    expect(kiss._failures[0].view).toMatch(/^<sass: .*\/bad\.scss>$/)
    // A compile error, not a copy that could not run at all.
    expect(kiss._failures[0].error.message).toMatch(/expected/i)
    expect(kiss._failures[0].buildTo).toBe(null)
    const key = assetCopyKey(source, build)
    expect(kiss._sassFailures.get(key)?.has(kiss._failures[0])).toBe(true)
    expect(kiss._assetCopies.get(key)).toEqual({
      sourceDir: source,
      targetDir: build,
    })
    expect(kiss._refreshReport).toHaveBeenCalled()

    await fs.outputFile(path.join(source, 'bad.scss'), 'a { color: red }')
    await copyAssetFolder(kiss, source, build)
    expect(kiss._failures).toEqual([])
    expect(kiss._sassFailures.has(key)).toBe(false)
    expect(kiss._assetCopies.has(key)).toBe(false)
  })

  it("does not clear another copy's failure for a file of the same name", async () => {
    const root = await makeTemp()
    const build = path.join(root, 'public')
    await fs.outputFile(path.join(root, 'one', 'theme.scss'), 'a { color: ')
    await fs.outputFile(
      path.join(root, 'two', 'theme.scss'),
      'a { color: red }',
    )
    const kiss = instance(build)

    await copyAssetFolder(kiss, path.join(root, 'one'), path.join(build, 'one'))
    await copyAssetFolder(kiss, path.join(root, 'two'), path.join(build, 'two'))
    expect(kiss._failures).toHaveLength(1)
    expect(kiss._failures[0].view).toMatch(/one\/theme\.scss>$/)
  })
})
