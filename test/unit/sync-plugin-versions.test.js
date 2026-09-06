import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {
  withVersion,
  syncPluginVersions,
  MANIFESTS,
} from '../../scripts/sync-plugin-versions.mjs'

describe('withVersion', () => {
  it('sets a top-level version (plugin.json shape)', () => {
    expect(withVersion({ name: 'x', version: '1.0.0' }, '2.0.0')).toEqual({
      name: 'x',
      version: '2.0.0',
    })
  })

  it('sets the version on every entry of a plugins array (marketplace shape)', () => {
    const out = withVersion(
      { name: 'm', plugins: [{ name: 'a', version: '1.0.0' }] },
      '2.0.0',
    )
    expect(out.plugins[0].version).toBe('2.0.0')
  })

  // The guard that keeps this from inventing a field a schema never asked for.
  it('leaves a manifest with no version untouched', () => {
    const input = { name: 'x', description: 'y' }
    expect(withVersion(input, '2.0.0')).toEqual(input)
  })

  it('does not mutate its input', () => {
    const input = { version: '1.0.0', plugins: [{ version: '1.0.0' }] }
    withVersion(input, '2.0.0')
    expect(input.version).toBe('1.0.0')
    expect(input.plugins[0].version).toBe('1.0.0')
  })
})

describe('syncPluginVersions', () => {
  let root
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-sync-'))
    await fs.outputJson(path.join(root, 'package.json'), { version: '9.9.9' })
    await fs.outputJson(path.join(root, MANIFESTS[0]), {
      name: 'kiss-ssg',
      plugins: [{ name: 'kiss-ssg', version: '0.0.1' }],
    })
    await fs.outputJson(path.join(root, MANIFESTS[1]), {
      name: 'kiss-ssg',
      version: '0.0.1',
    })
  })
  afterEach(() => fs.remove(root))

  it('writes package.json version into both manifests and reports them', async () => {
    const changed = syncPluginVersions({ root })
    expect(changed.sort()).toEqual([...MANIFESTS].sort())
    expect(
      (await fs.readJson(path.join(root, MANIFESTS[0]))).plugins[0].version,
    ).toBe('9.9.9')
    expect((await fs.readJson(path.join(root, MANIFESTS[1]))).version).toBe(
      '9.9.9',
    )
  })

  // Idempotence is what lets the lifecycle hook run on every bump without
  // producing an empty diff when nothing moved.
  it('reports nothing changed on a second run', () => {
    syncPluginVersions({ root })
    expect(syncPluginVersions({ root })).toEqual([])
  })
})
