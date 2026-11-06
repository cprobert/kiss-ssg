import fs from 'fs-extra'
import { inspect } from 'node:util'
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

  it('loads a folder model when modelsDir has a trailing slash', async () => {
    site = await makeSite({
      'm/team/a.json': { n: 'a' },
      'm/team/b.json': { n: 'b' },
    })
    const { data } = await resolveModel('team', deps(`${site.root}/m/`))
    expect(data).toEqual([{ n: 'a' }, { n: 'b' }])
  })

  it('rejects an unknown folder', async () => {
    site = await makeSite({})
    await expect(resolveModel('ghost', deps(`${site.root}/m`))).rejects.toThrow(
      'Invalid model ghost',
    )
  })

  it('fetches http(s) models with the injected fetch', async () => {
    const fetchImpl = async (url) => ({ ok: true, json: async () => ({ url }) })
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
    ).rejects.toMatchObject({
      // The fetch's own text (`boom`) is never shown: kiss writes the message
      // from the redacted URL and the error's name.
      message: 'Model fetch failed: http://x/ → Error',
    })
  })

  it('rejects an error response instead of using its JSON body as the model', async () => {
    const fetchImpl = async () => ({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      json: async () => ({ error: 'upstream down' }),
    })
    await expect(
      resolveModel('https://cms.example/api/posts', deps('m', { fetchImpl })),
    ).rejects.toThrow(/https:\/\/cms\.example\/api\/posts.*500/)
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

const okResponse = (data) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => data,
})
const errorResponse = (status, statusText = 'Error') => ({
  ok: false,
  status,
  statusText,
  json: async () => ({ error: statusText }),
})
// A fetch stub that records every call, so a test can assert how many
// attempts the policy made and what it sent.
function recorder(handler) {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    return handler(calls.length, url, options)
  }
  return { calls, fetchImpl }
}

describe('resolveModel fetch policy', () => {
  it('sends the configured headers with the request', async () => {
    const { calls, fetchImpl } = recorder(() => okResponse({ ok: 1 }))
    await resolveModel(
      'https://api.example/data',
      deps('m', {
        fetchImpl,
        fetchConfig: { headers: { Authorization: 'Bearer t' } },
      }),
    )
    expect(calls[0].options.headers).toEqual({ Authorization: 'Bearer t' })
  })

  it('rejects with a timeout that names the url', async () => {
    const fetchImpl = () => new Promise(() => {})
    await expect(
      resolveModel(
        'https://api.example/slow',
        deps('m', { fetchImpl, fetchConfig: { timeout: 20 } }),
      ),
    ).rejects.toThrow(/timed out after 20ms: https:\/\/api\.example\/slow/)
  })

  it('retries a 5xx and resolves on the next attempt', async () => {
    const { calls, fetchImpl } = recorder((n) =>
      n === 1 ? errorResponse(500, 'Server Error') : okResponse({ ok: 1 }),
    )
    await expect(
      resolveModel(
        'https://api.example/flaky',
        deps('m', { fetchImpl, fetchConfig: { retries: 1 } }),
      ),
    ).resolves.toEqual({ id: 'https://api.example/flaky', data: { ok: 1 } })
    expect(calls).toHaveLength(2)
  })

  it('never retries a 4xx', async () => {
    const { calls, fetchImpl } = recorder(() => errorResponse(404, 'Not Found'))
    await expect(
      resolveModel(
        'https://api.example/gone',
        deps('m', { fetchImpl, fetchConfig: { retries: 3 } }),
      ),
    ).rejects.toThrow(/404/)
    expect(calls).toHaveLength(1)
  })

  it('makes exactly one attempt with the default retries', async () => {
    const { calls, fetchImpl } = recorder(() =>
      errorResponse(500, 'Server Error'),
    )
    await expect(
      resolveModel('https://api.example/down', deps('m', { fetchImpl })),
    ).rejects.toThrow(/500/)
    expect(calls).toHaveLength(1)
  })

  it('reads the on-disk cache instead of fetching the same url twice', async () => {
    site = await makeSite({})
    const cache = `${site.root}/.kiss-cache`
    const { calls, fetchImpl } = recorder(() => okResponse({ n: 1 }))
    const args = deps('m', { fetchImpl, fetchConfig: { cache } })
    await resolveModel('https://api.example/posts', args)
    await expect(
      resolveModel('https://api.example/posts', args),
    ).resolves.toEqual({ id: 'https://api.example/posts', data: { n: 1 } })
    expect(calls).toHaveLength(1)
  })

  it('treats a different header set as a different cache entry', async () => {
    site = await makeSite({})
    const cache = `${site.root}/.kiss-cache`
    const { calls, fetchImpl } = recorder(() => okResponse({ n: 1 }))
    await resolveModel(
      'https://api.example/posts',
      deps('m', { fetchImpl, fetchConfig: { cache, headers: { A: '1' } } }),
    )
    await resolveModel(
      'https://api.example/posts',
      deps('m', { fetchImpl, fetchConfig: { cache, headers: { A: '2' } } }),
    )
    expect(calls).toHaveLength(2)
  })

  it('never caches an error response', async () => {
    site = await makeSite({})
    const cache = `${site.root}/.kiss-cache`
    const { fetchImpl } = recorder(() => errorResponse(500, 'Server Error'))
    await expect(
      resolveModel(
        'https://api.example/down',
        deps('m', { fetchImpl, fetchConfig: { cache } }),
      ),
    ).rejects.toThrow(/500/)
    expect(await fs.readdir(cache).catch(() => [])).toEqual([])
  })

  it('reads a cache file written by an earlier build', async () => {
    site = await makeSite({})
    const cache = `${site.root}/.kiss-cache`
    await resolveModel(
      'https://api.example/posts',
      deps('m', {
        fetchImpl: async () => okResponse({ n: 7 }),
        fetchConfig: { cache },
      }),
    )
    const fresh = deps('m', {
      fetchImpl: async () => {
        throw new Error('a cached model must not hit the network')
      },
      fetchConfig: { cache },
    })
    await expect(
      resolveModel('https://api.example/posts', fresh),
    ).resolves.toEqual({ id: 'https://api.example/posts', data: { n: 7 } })
  })
})

describe('resolveModel: a token in the query string', () => {
  const TOKEN = 'SECRET-TOKEN-F'
  const URL_WITH_TOKEN = `https://cdn.example.com/entries?access_token=${TOKEN}&type=course`
  const SHOWN =
    'https://cdn.example.com/entries?access_token=[redacted]&type=[redacted]'

  it('hands back the real URL as the id, and fetched the real URL', async () => {
    const { calls, fetchImpl } = recorder(() => okResponse({ n: 1 }))
    await expect(
      resolveModel(URL_WITH_TOKEN, deps('m', { fetchImpl })),
    ).resolves.toEqual({ id: URL_WITH_TOKEN, data: { n: 1 } })
    expect(calls.map((c) => c.url)).toEqual([URL_WITH_TOKEN])
  })

  it('logs and rejects with the URL redacted, the attached error too', async () => {
    const logged = []
    const logger = {
      ...silentLogger,
      error: (...args) => logged.push(args),
      debug: (...args) => logged.push(args),
    }
    const { fetchImpl } = recorder(() => errorResponse(404, 'Not Found'))
    let error
    try {
      await resolveModel(URL_WITH_TOKEN, { modelsDir: 'm', logger, fetchImpl })
    } catch (e) {
      error = e
    }
    expect(logged).toEqual([[`Error getting model from ${SHOWN}`]])
    expect(error.message).toBe(`Model fetch failed: ${SHOWN} → 404 Not Found`)
    // What the page registry's catch prints: the message, then the attached
    // original error — with its stack and anything hanging off it.
    const printed = inspect(error, { depth: Infinity })
    expect(printed).not.toContain(TOKEN)
    expect(inspect(error.error, { depth: Infinity })).not.toContain(TOKEN)
  })
})
