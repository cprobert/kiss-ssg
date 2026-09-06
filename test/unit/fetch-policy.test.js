import fs from 'fs-extra'
import { describe, it, expect, afterEach } from 'vitest'
import { fetchModel } from '../../lib/fetch-policy.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
})

const ok = (data) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => data,
})
describe('fetchModel', () => {
  it('returns the parsed body of a 2xx response', async () => {
    await expect(
      fetchModel('https://api.example/x', {
        fetchImpl: async () => ok({ a: 1 }),
        logger: silentLogger,
      }),
    ).resolves.toEqual({ a: 1 })
  })

  it('names the attempt count once it has retried', async () => {
    let calls = 0
    await expect(
      fetchModel('https://api.example/x', {
        fetchImpl: async () => {
          calls++
          throw new Error('ECONNRESET')
        },
        retries: 2,
        logger: silentLogger,
      }),
    ).rejects.toThrow(/3 attempts/)
    expect(calls).toBe(3)
  })

  it('passes an abort signal, and times out even if the fetch ignores it', async () => {
    let signal
    await expect(
      fetchModel('https://api.example/x', {
        fetchImpl: (url, options) => {
          signal = options.signal
          return new Promise(() => {})
        },
        timeout: 20,
        logger: silentLogger,
      }),
    ).rejects.toThrow(/timed out/)
    expect(signal.aborted).toBe(true)
  })

  it('gives each url its own cache entry', async () => {
    site = await makeSite({})
    const cache = `${site.root}/.kiss-cache`
    const fetchImpl = async (url) => ok({ url })
    await fetchModel('https://api.example/a', {
      fetchImpl,
      cache,
      logger: silentLogger,
    })
    await fetchModel('https://api.example/b', {
      fetchImpl,
      cache,
      logger: silentLogger,
    })
    expect(await fs.readdir(cache)).toHaveLength(2)
  })

  it('refetches when the cache file is unreadable', async () => {
    site = await makeSite({})
    const cache = `${site.root}/.kiss-cache`
    let calls = 0
    const fetchImpl = async () => {
      calls++
      return ok({ a: 1 })
    }
    await fetchModel('https://api.example/a', {
      fetchImpl,
      cache,
      logger: silentLogger,
    })
    const [file] = await fs.readdir(cache)
    await fs.writeFile(`${cache}/${file}`, 'not json')
    await expect(
      fetchModel('https://api.example/a', {
        fetchImpl,
        cache,
        logger: silentLogger,
      }),
    ).resolves.toEqual({ a: 1 })
    expect(calls).toBe(2)
  })
})
