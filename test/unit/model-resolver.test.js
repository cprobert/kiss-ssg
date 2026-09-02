import { describe, it, expect, afterEach } from 'vitest'
import { resolveModel } from '../../lib/model-resolver.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})
const deps = (modelsDir, extra = {}) => ({
  modelsDir,
  logger: silentLogger,
  ...extra,
})

describe('resolveModel', () => {
  it('reads a json file relative to modelsDir', async () => {
    site = await makeSite({ 'm/a.json': { x: 1 } })
    await expect(
      resolveModel('a.json', deps(`${site.root}/m`)),
    ).resolves.toEqual({ id: 'a.json', data: { x: 1 } })
  })

  it('rejects a missing json file with a Skipping message', async () => {
    site = await makeSite({})
    await expect(
      resolveModel('nope.json', deps(`${site.root}/m`)),
    ).rejects.toThrow('Skipping: nope.json')
  })

  it('loads every json in a folder as an array', async () => {
    site = await makeSite({
      'm/team/a.json': { n: 'a' },
      'm/team/b.json': { n: 'b' },
    })
    const { data } = await resolveModel('team', deps(`${site.root}/m`))
    expect(data).toEqual([{ n: 'a' }, { n: 'b' }])
  })

  it('rejects an unknown folder', async () => {
    site = await makeSite({})
    await expect(resolveModel('ghost', deps(`${site.root}/m`))).rejects.toThrow(
      'Invalid model ghost',
    )
  })

  it('fetches http(s) models with the injected fetch', async () => {
    const fetchImpl = async (url) => ({ json: async () => ({ url }) })
    await expect(
      resolveModel('https://x/y', deps('m', { fetchImpl })),
    ).resolves.toEqual({
      id: 'https://x/y',
      data: { url: 'https://x/y' },
    })
  })

  it('rejects when fetch fails, attaching the cause', async () => {
    const fetchImpl = async () => {
      throw new Error('boom')
    }
    await expect(
      resolveModel('http://x', deps('m', { fetchImpl })),
    ).rejects.toMatchObject({ message: 'boom' })
  })

  it('passes objects through with a content hash id, and undefined as {}', async () => {
    const a = await resolveModel({ k: 1 }, deps('m'))
    const b = await resolveModel({ k: 1 }, deps('m'))
    expect(a.data).toEqual({ k: 1 })
    expect(a.id).toBe(b.id)
    await expect(resolveModel(undefined, deps('m'))).resolves.toEqual({
      data: {},
    })
  })

  it('rejects other types', async () => {
    await expect(resolveModel(42, deps('m'))).rejects.toThrow(
      'Unexpected model type: number',
    )
  })
})
