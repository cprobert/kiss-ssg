import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {
  withVersion,
  syncPluginVersions,
  MANIFESTS,
} from '../../scripts/sync-plugin-versions.mjs'

const root = path.resolve(import.meta.dirname, '../..')
// The marketplace is the one manifest that lists other manifests; the rest are
// the per-plugin ones it points at.
const [MARKETPLACE, ...PLUGIN_MANIFESTS] = MANIFESTS

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

// The list is the contract: a plugin added to the marketplace whose manifest is
// not here silently keeps its old version through every `npm version`.
describe('MANIFESTS', () => {
  it('covers the marketplace and every plugin it lists', () => {
    const marketplace = fs.readJsonSync(path.join(root, MARKETPLACE))
    const expected = marketplace.plugins.map(
      (entry) =>
        `${path.posix.normalize(entry.source)}/.claude-plugin/plugin.json`,
    )
    expect([...PLUGIN_MANIFESTS].sort()).toEqual(expected.sort())
  })

  it('names files that exist', () => {
    for (const rel of MANIFESTS)
      expect(fs.existsSync(path.join(root, rel))).toBe(true)
  })
})

describe('syncPluginVersions', () => {
  let tmp
  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-sync-'))
    await fs.outputJson(path.join(tmp, 'package.json'), { version: '9.9.9' })
    await fs.outputJson(path.join(tmp, MARKETPLACE), {
      name: 'kiss-ssg',
      plugins: PLUGIN_MANIFESTS.map((rel) => ({
        name: path.basename(path.dirname(path.dirname(rel))),
        version: '0.0.1',
      })),
    })
    for (const rel of PLUGIN_MANIFESTS)
      await fs.outputJson(path.join(tmp, rel), {
        name: path.basename(path.dirname(path.dirname(rel))),
        version: '0.0.1',
      })
  })
  afterEach(() => fs.remove(tmp))

  it('writes package.json version into every manifest and reports them', async () => {
    const changed = syncPluginVersions({ root: tmp })
    expect(changed.sort()).toEqual([...MANIFESTS].sort())
    const marketplace = await fs.readJson(path.join(tmp, MARKETPLACE))
    for (const entry of marketplace.plugins) expect(entry.version).toBe('9.9.9')
    for (const rel of PLUGIN_MANIFESTS)
      expect((await fs.readJson(path.join(tmp, rel))).version).toBe('9.9.9')
  })

  // Idempotence is what lets the lifecycle hook run on every bump without
  // producing an empty diff when nothing moved.
  it('reports nothing changed on a second run', () => {
    syncPluginVersions({ root: tmp })
    expect(syncPluginVersions({ root: tmp })).toEqual([])
  })
})
