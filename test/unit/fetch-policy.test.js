import fs from 'fs-extra'
import http from 'node:http'
import net from 'node:net'
import { inspect } from 'node:util'
import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest'
import { fetchModel } from '../../lib/fetch-policy.js'
import { silentLogger } from '../../lib/logger.js'
import { redactUrl } from '../../lib/utils.js'
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
    // The standard phrase for 503, not the server's own `Unavailable`.
    expect(error.message).toBe(
      `Model fetch failed: ${SHOWN} → 503 Service Unavailable (after 2 attempts)`,
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

  it('says what a network failure was from its cause’s code and address, never its text', async () => {
    const error = await caught(
      fetchModel(URL_WITH_TOKEN, {
        fetchImpl: async () => {
          throw new TypeError('fetch failed', {
            cause: Object.assign(
              new Error(`connect ECONNREFUSED 127.0.0.1:9 ${TOKEN}`),
              {
                code: 'ECONNREFUSED',
                syscall: 'connect',
                address: '127.0.0.1',
                port: 9,
                input: URL_WITH_TOKEN,
              },
            ),
          })
        },
        logger: silentLogger,
      }),
    )
    expect(error.message).toBe(
      `Model fetch failed: ${SHOWN} → ECONNREFUSED 127.0.0.1:9`,
    )
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

// Node's fetch refuses a header value holding a line break or a NUL, and the
// error it raises quotes the value: `Headers.append: "<value>" is an invalid
// header value.` The value is the token (review of 7c527a3, 2026-11-06).
describe('fetchModel: a header value the fetch refuses', () => {
  const SECRET = 'SECRET-HEADER-V'
  const URL = 'http://127.0.0.1:1/model.json'
  const caught = async (promise) => {
    try {
      await promise
    } catch (error) {
      return error
    }
    throw new Error('expected a rejection')
  }
  const printed = (error) => inspect(error, { depth: Infinity })
  // The real fetch, counted: it is what quotes the value.
  const countingFetch = () => {
    const seen = []
    const fetchImpl = (...args) => {
      seen.push(args)
      return globalThis.fetch(...args)
    }
    return { seen, fetchImpl }
  }

  it.each([
    ['a second line', `Bearer ${SECRET}\nSECOND-LINE`],
    ['a NUL', `Bearer ${SECRET}${String.fromCharCode(0)}tail`],
    ['a character above 255', `Bearer ${SECRET}${String.fromCharCode(256)}`],
  ])('names the header and never its value (%s)', async (_label, value) => {
    const { seen, fetchImpl } = countingFetch()
    const error = await caught(
      fetchModel(URL, {
        headers: { Accept: 'application/json', Authorization: value },
        fetchImpl,
        logger: silentLogger,
      }),
    )
    expect(printed(error)).not.toContain(SECRET)
    expect(printed(error)).not.toContain('SECOND-LINE')
    expect(error.message).toContain('"Authorization"')
    expect(error.message).not.toContain('"Accept"')
    expect(seen).toEqual([])
  })

  it('does not retry it: the same headers cannot be accepted the second time', async () => {
    const { seen, fetchImpl } = countingFetch()
    const error = await caught(
      fetchModel(URL, {
        headers: { Authorization: `Bearer ${SECRET}\nSECOND-LINE` },
        retries: 2,
        fetchImpl,
        logger: silentLogger,
      }),
    )
    expect(error.message).not.toContain('attempts')
    expect(seen).toEqual([])
  })

  it('still sends a value that only ends in a line break, which fetch trims', async () => {
    const headers = { Authorization: `Bearer ${SECRET}\n` }
    const seen = []
    await expect(
      fetchModel(URL, {
        headers,
        fetchImpl: async (url, init) => {
          seen.push(init.headers)
          return ok({ a: 1 })
        },
        logger: silentLogger,
      }),
    ).resolves.toEqual({ a: 1 })
    expect(seen).toEqual([headers])
  })
})

// A failure's message is built by kiss from parts that cannot carry a secret:
// the redacted URL, a status and its standard phrase, an error's code and
// address, a media type, a short list of constant cause messages. No text
// that came from outside kiss (an error's message, a status text, a body)
// reaches it. Patching Node's text instead missed a new shape in each of three
// reviews (code review of PR #76, 2026-11-06).
describe('fetchModel: a failure’s message is written by kiss', () => {
  const TOKEN = 'SECRET-TOKEN-G'
  const PASSWORD = 'SECRET-PASS-G'
  const q = `?token=${TOKEN}`
  let server
  let base
  let closedPort

  beforeAll(async () => {
    // A port nothing listens on: bind one, read its number, close it.
    closedPort = await new Promise((resolve) => {
      const probe = net.createServer()
      probe.listen(0, '127.0.0.1', () => {
        const { port } = /** @type {net.AddressInfo} */ (probe.address())
        probe.close(() => resolve(port))
      })
    })
    server = http.createServer((req, res) => {
      const path = new URL(req.url, 'http://x').pathname
      const send = (status, body, type, reason) => {
        res.writeHead(status, reason, { 'content-type': type })
        res.end(body)
      }
      if (path === '/401')
        return send(401, '{"error":"no"}', 'application/json')
      if (path === '/403')
        return send(403, TOKEN, 'text/plain', `Bad key ${TOKEN}`)
      if (path === '/500') return send(500, TOKEN, 'text/plain')
      if (path === '/html')
        return send(
          200,
          `<!doctype html><p>${TOKEN}</p>`,
          'text/html; charset=utf-8',
        )
      if (path === '/text') return send(200, TOKEN, 'text/plain')
      if (path === '/odd-type') return send(200, TOKEN, TOKEN)
      if (path === '/drop') return req.socket.destroy()
      if (path === '/redirect') {
        res.writeHead(302, { location: req.url })
        return res.end()
      }
      return send(404, '{}', 'application/json')
    })
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${server.address().port}`
  })
  afterAll(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })

  const recordingLogger = () => {
    const calls = []
    const record = (...args) => calls.push(args)
    const logger = {
      ...silentLogger,
      verbose: true,
      debug: record,
      info: record,
      warn: record,
      error: record,
      notice: record,
    }
    return { logger, text: () => inspect(calls, { depth: Infinity }) }
  }
  const failure = async (url, options = {}) => {
    const { logger, text } = recordingLogger()
    try {
      await fetchModel(url, { timeout: 5000, logger, ...options })
    } catch (error) {
      return { error, everything: inspect(error, { depth: Infinity }) + text() }
    }
    throw new Error('expected a rejection')
  }

  // The real fetch, against a local server: every shape the close's review
  // drove through a whole build, and the review's measured cases.
  it.each([
    ['a non-2xx status', () => `${base}/401${q}`, '401 Unauthorized'],
    [
      'a status text carrying a token',
      () => `${base}/403${q}`,
      '403 Forbidden',
    ],
    ['a 5xx', () => `${base}/500${q}`, '500 Internal Server Error'],
    [
      'an HTML body with status 200',
      () => `${base}/html${q}`,
      '200, but the body is not JSON (text/html)',
    ],
    [
      'a body beginning with a token',
      () => `${base}/text${q}`,
      '200, but the body is not JSON (text/plain)',
    ],
    [
      'a media type that is not one',
      () => `${base}/odd-type${q}`,
      '200, but the body is not JSON',
    ],
    [
      'a dropped socket',
      () => `${base}/drop${q}`,
      'other side closed (UND_ERR_SOCKET)',
    ],
    [
      'a redirect loop',
      () => `${base}/redirect${q}`,
      'redirect count exceeded',
    ],
    [
      'a closed port on 127.0.0.1',
      () => `http://127.0.0.1:${closedPort}/x${q}`,
      () => `ECONNREFUSED 127.0.0.1:${closedPort}`,
    ],
    [
      'a URL holding a user name and password',
      () => `http://USER-G:${PASSWORD}@127.0.0.1:${closedPort}/x${q}`,
      'the URL holds a user name or password, which fetch will not send: put the credential in fetch.headers',
    ],
  ])('%s', async (_label, urlOf, expected) => {
    const url = urlOf()
    const { error, everything } = await failure(url)
    const after = typeof expected === 'function' ? expected() : expected
    expect(error.message).toBe(
      `Model fetch failed: ${redactUrl(url)} → ${after}`,
    )
    expect(everything).not.toContain(TOKEN)
    expect(everything).not.toContain(PASSWORD)
  })

  it.each([
    [`http://exa mple.invalid/x${q}`],
    [`http://u:${PASSWORD}@127.0.0.1:notaport/x${q}`],
  ])('says a URL that does not parse cannot be fetched (%s)', async (url) => {
    const { error, everything } = await failure(url)
    expect(error.message).toMatch(/^Model fetch failed: /)
    expect(error.message).toMatch(/ → not a URL that can be fetched$/)
    expect(everything).not.toContain(TOKEN)
    expect(everything).not.toContain(PASSWORD)
  })

  // Several addresses (localhost is ::1 and 127.0.0.1 on most machines): the
  // cause is an AggregateError with an empty message, and each address tried
  // is in its `errors`. Before, this printed a bare `fetch failed`.
  // Two causes with no code or address, where the constant is all there is to
  // say. Without them on the list the message ended `→ TypeError` (the main
  // session's whole-build run of round three, 2026-11-06).
  // The second URL is shown as `redactUrl` shows any string that is not an
  // http(s) URL: cut at its query.
  it.each([
    [
      'a port fetch will not use',
      'http://127.0.0.1:1/x',
      'http://127.0.0.1:1/x?token=[redacted] → bad port',
    ],
    [
      'a scheme fetch does not know',
      'httpx://127.0.0.1/x',
      'httpx://127.0.0.1/x?[redacted] → unknown scheme',
    ],
  ])('says %s, from the short list', async (_label, url, said) => {
    const { error, everything } = await failure(`${url}${q}`)
    expect(error.message).toBe(`Model fetch failed: ${said}`)
    expect(everything).not.toContain(TOKEN)
  })

  it('names each address tried when localhost refuses', async () => {
    const url = `http://localhost:${closedPort}/x${q}`
    const { error, everything } = await failure(url)
    expect(error.message).toMatch(
      new RegExp(
        `→ ECONNREFUSED \\S+:${closedPort}(, ECONNREFUSED \\S+:${closedPort})*$`,
      ),
    )
    expect(everything).not.toContain(TOKEN)
  })

  it('lists every address of an AggregateError cause, as Node raises one', async () => {
    const refused = (address) =>
      Object.assign(new Error(`connect ECONNREFUSED ${address}:9 ${TOKEN}`), {
        code: 'ECONNREFUSED',
        syscall: 'connect',
        address,
        port: 9,
      })
    const url = `https://api.example.com/x${q}`
    const { error, everything } = await failure(url, {
      fetchImpl: async () => {
        throw new TypeError('fetch failed', {
          cause: Object.assign(
            new AggregateError([refused('::1'), refused('127.0.0.1')], ''),
            { code: 'ECONNREFUSED' },
          ),
        })
      },
    })
    expect(error.message).toBe(
      `Model fetch failed: ${redactUrl(url)} → ECONNREFUSED [::1]:9, ECONNREFUSED 127.0.0.1:9`,
    )
    expect(everything).not.toContain(TOKEN)
  })

  it('names an unknown host from the cause’s code and hostname', async () => {
    const url = `https://no-such-host.invalid/x${q}`
    const { error } = await failure(url, {
      fetchImpl: async () => {
        throw new TypeError('fetch failed', {
          cause: Object.assign(
            new Error('getaddrinfo ENOTFOUND no-such-host.invalid'),
            {
              code: 'ENOTFOUND',
              syscall: 'getaddrinfo',
              hostname: 'no-such-host.invalid',
            },
          ),
        })
      },
    })
    expect(error.message).toBe(
      `Model fetch failed: ${redactUrl(url)} → ENOTFOUND no-such-host.invalid`,
    )
  })

  // The review's case: a query the parser re-encodes (`sec ret` → `sec%20ret`)
  // was quoted raw by the error and matched none of the URL's spellings.
  it('shows nothing of an error that quotes a raw query', async () => {
    const url = 'https://api.example.com/x?q=sec ret'
    const { error, everything } = await failure(url, {
      fetchImpl: async () => {
        throw new Error('bad thing at ?q=sec ret here')
      },
    })
    expect(error.message).toBe(`Model fetch failed: ${redactUrl(url)} → Error`)
    expect(everything).not.toContain('sec ret')
  })

  it('shows no part of a cause that is not the type Node gives it', async () => {
    const url = `https://api.example.com/x${q}`
    const { error, everything } = await failure(url, {
      fetchImpl: async () => {
        throw Object.assign(new TypeError('fetch failed'), {
          name: `Type Error ${TOKEN}`,
          cause: Object.assign(new Error(TOKEN), {
            code: `E ${TOKEN}`,
            address: { toString: () => TOKEN },
            port: `1 ${TOKEN}`,
          }),
        })
      },
    })
    expect(error.message).toBe(
      `Model fetch failed: ${redactUrl(url)} → an error kiss cannot describe`,
    )
    expect(everything).not.toContain(TOKEN)
  })

  // Kiss's own timeout message is already redacted. Scrubbing it a second
  // time turned `https://api.example.com/` into `…//` and `?a=[redacted]`
  // into `?[redacted][redacted][redacted][redacted]`.
  it.each([['https://api.example.com'], ['https://api.example.com/x?a=']])(
    'passes its own timeout message on as it is (%s)',
    async (url) => {
      const { error } = await failure(url, {
        fetchImpl: () => new Promise(() => {}),
        timeout: 20,
      })
      expect(error.message).toBe(
        `Model fetch timed out after 20ms: ${redactUrl(url)}`,
      )
    },
  )

  it('says when a 2xx body fails to arrive, from the error’s code', async () => {
    const url = `https://api.example.com/x${q}`
    const { error, everything } = await failure(url, {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new TypeError(`terminated ${TOKEN}`, {
            cause: Object.assign(new Error(TOKEN), { code: 'ECONNRESET' }),
          })
        },
      }),
    })
    expect(error.message).toBe(
      `Model fetch failed: ${redactUrl(url)} → 200, but the body could not be read: ECONNRESET`,
    )
    expect(everything).not.toContain(TOKEN)
  })

  // A disk that refuses the cache write is not a reason to fetch again, and
  // its message names the hashed cache file, never the URL.
  it('fails a cache write once, without fetching again', async () => {
    site = await makeSite({})
    const cache = `${site.root}/not-a-folder`
    await fs.writeFile(cache, 'a file where the cache folder should be')
    let calls = 0
    const url = `https://api.example.com/x${q}`
    const { error, everything } = await failure(url, {
      fetchImpl: async () => {
        calls++
        return ok({ a: 1 })
      },
      cache,
      retries: 2,
    })
    expect(calls).toBe(1)
    expect(error.message).toMatch(
      /^Model cache write failed: .*not-a-folder\/[0-9a-f]+\.json → [A-Z]+$/,
    )
    expect(everything).not.toContain(TOKEN)
  })

  it('is a fresh Error with no cause', async () => {
    const { error } = await failure(`http://127.0.0.1:${closedPort}/x${q}`)
    expect(error.constructor).toBe(Error)
    expect(error.cause).toBeUndefined()
    expect(Object.keys(error)).toEqual([])
  })
})
