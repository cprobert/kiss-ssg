import fs from 'fs-extra'
import { inspect } from 'node:util'
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

// A model URL is fetched as written and printed with every query value
// replaced: the query is where an access token sits, and a message lands on
// stderr, in a CI log and in a pasted bug report.
describe('fetchModel: a token in the query string', () => {
  const TOKEN = 'SECRET-TOKEN-F'
  const URL_WITH_TOKEN = `https://cdn.example.com/entries?access_token=${TOKEN}&type=course`
  const SHOWN =
    'https://cdn.example.com/entries?access_token=[redacted]&type=[redacted]'

  // Everything a logger was handed, as `console.*` would print it: an Error
  // argument is printed with its stack, its `cause` and its own properties.
  const recordingLogger = () => {
    const calls = []
    const record =
      (level) =>
      (...args) =>
        calls.push({ level, args })
    return {
      calls,
      logger: {
        ...silentLogger,
        verbose: true,
        debug: record('debug'),
        info: record('info'),
        warn: record('warn'),
        error: record('error'),
        notice: record('notice'),
      },
      text: () =>
        calls
          .map(({ level, args }) =>
            [level, ...args.map((a) => inspect(a, { depth: Infinity }))].join(
              ' ',
            ),
          )
          .join('\n'),
    }
  }
  const caught = async (promise) => {
    try {
      await promise
    } catch (error) {
      return error
    }
    throw new Error('expected a rejection')
  }
  const printed = (error) => inspect(error, { depth: Infinity })

  it('fetches the URL as written', async () => {
    const seen = []
    await fetchModel(URL_WITH_TOKEN, {
      fetchImpl: async (url) => {
        seen.push(url)
        return ok({ a: 1 })
      },
      logger: silentLogger,
    })
    expect(seen).toEqual([URL_WITH_TOKEN])
  })

  it('names the URL redacted when the server answers 404', async () => {
    const { logger, text } = recordingLogger()
    const error = await caught(
      fetchModel(URL_WITH_TOKEN, {
        fetchImpl: async () => ({
          ok: false,
          status: 404,
          statusText: 'Not Found',
        }),
        logger,
      }),
    )
    expect(error.message).toBe(`Model fetch failed: ${SHOWN} → 404 Not Found`)
    expect(printed(error)).not.toContain(TOKEN)
    expect(text()).not.toContain(TOKEN)
  })

  it('names the URL redacted when the fetch times out', async () => {
    const error = await caught(
      fetchModel(URL_WITH_TOKEN, {
        fetchImpl: () => new Promise(() => {}),
        timeout: 20,
        logger: silentLogger,
      }),
    )
    expect(error.message).toBe(`Model fetch timed out after 20ms: ${SHOWN}`)
    expect(printed(error)).not.toContain(TOKEN)
  })

  it('names the URL redacted after the retries run out', async () => {
    const error = await caught(
      fetchModel(URL_WITH_TOKEN, {
        fetchImpl: async () => ({
          ok: false,
          status: 503,
          statusText: 'Unavailable',
        }),
        retries: 1,
        logger: silentLogger,
      }),
    )
    expect(error.message).toBe(
      `Model fetch failed: ${SHOWN} → 503 Unavailable (after 2 attempts)`,
    )
    expect(printed(error)).not.toContain(TOKEN)
  })

  it.each([
    // Node's own fetch echoes the URL it was given in these two messages, and
    // the first carries it again in its `cause` (`input`). Measured on Node
    // 22/24: neither touches the network.
    [`http://[bad url?access_token=${TOKEN}`],
    [`https://user:pass@127.0.0.1:1/x?access_token=${TOKEN}`],
  ])(
    'keeps the token out of an error the fetch itself raised (%s)',
    async (url) => {
      const error = await caught(
        fetchModel(url, { fetchImpl: globalThis.fetch, logger: silentLogger }),
      )
      expect(printed(error)).not.toContain(TOKEN)
      expect(printed(error)).not.toContain('pass@')
    },
  )

  it('keeps the cause’s message, which is where a network failure says what happened', async () => {
    const error = await caught(
      fetchModel(URL_WITH_TOKEN, {
        fetchImpl: async () => {
          throw new TypeError('fetch failed', {
            cause: Object.assign(
              new Error('connect ECONNREFUSED 127.0.0.1:9'),
              {
                input: URL_WITH_TOKEN,
              },
            ),
          })
        },
        logger: silentLogger,
      }),
    )
    expect(error.message).toBe('fetch failed: connect ECONNREFUSED 127.0.0.1:9')
    expect(printed(error)).not.toContain(TOKEN)
  })

  it('keeps the token out of the cache-hit line under verbose', async () => {
    site = await makeSite({})
    const cache = `${site.root}/.kiss-cache`
    await fetchModel(URL_WITH_TOKEN, {
      fetchImpl: async () => ok({ a: 1 }),
      cache,
      logger: silentLogger,
    })
    const { logger, calls, text } = recordingLogger()
    await expect(
      fetchModel(URL_WITH_TOKEN, {
        fetchImpl: async () => {
          throw new Error('a cached model must not hit the network')
        },
        cache,
        logger,
      }),
    ).resolves.toEqual({ a: 1 })
    expect(calls).toEqual([
      { level: 'debug', args: ['Model cache hit', SHOWN] },
    ])
    expect(text()).not.toContain(TOKEN)
  })
})
