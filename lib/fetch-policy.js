import fs from 'fs-extra'
import { isIP } from 'node:net'
import { STATUS_CODES } from 'node:http'
import { hashId, posixPath, redactUrl } from './utils.js'
import { DEFAULT_FETCH, resolveFetch } from './config.js'

const RETRY_BACKOFF_MS = 200

// A failure's message is written here, from parts with the shape Node's own
// values have, and never from the text of what failed. Node's fetch quotes the
// URL in its errors (`Failed to parse URL from <url>`), a status text and a
// body are the server's to write, and an error from an injected `fetchImpl`
// can say anything. Editing that text to take the URL out was a deny-list of
// spellings, and each of three reviews found one it missed (2026-11-06).
//
// Each part has its own shape, the one Node's value has: a code is upper-case
// letters, digits and `_` (`ECONNREFUSED`, `UND_ERR_SOCKET`); an address is an
// IP address; a port is a whole number from 1 to 65535; a host name is
// letters, digits, `.` and `-`; a status is a whole number from 100 to 599. A
// part of any other shape is not shown. So a replaced `fetch` can put a secret
// in a message only by putting it in a field as a value of that field's shape:
// a token that looks like a code, or one that looks like a host name.
const CODE = /^[A-Z][A-Z0-9_]*$/
const HOST_NAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i
const NAME = /^[A-Za-z]+$/

// The cause messages that are shown, by exact equality: a string kiss chose
// cannot carry a secret. Each was measured as the cause of `fetch failed` (or
// of `terminated`, for a body), and each says what happened where the cause
// has no code or address to say it with, or says it more plainly. The first
// four on Node 24.14.0 (2026-11-06), the last on Node 24.14.0 (2026-11-07);
// the floor, Node 22.23.4, is measured by CI through
// `test/unit/fetch-policy.test.js`.
const CONSTANT_CAUSES = new Set([
  'redirect count exceeded',
  'other side closed',
  'bad port',
  'unknown scheme',
  'self-signed certificate; if the root CA is installed locally, try running Node.js with --use-system-ca',
])

// The one error kiss builds before `failureOf` can see it: the timeout, which
// can now end a body read, so it reaches `failureOf` with a response already
// arrived. Marked so it is passed on as it is rather than rebuilt.
const ours = new WeakSet()

// Refusals of a fixed policy (a redirect to another origin, too many
// redirects, an unparseable location): the same request meets them again, so
// the retry loop ends at once, as it does for a 4xx.
const refusals = new WeakSet()

const fails = (url, what) =>
  new Error(`Model fetch failed: ${redactUrl(url)} → ${what}`)

const codeOf = (value) =>
  typeof value === 'string' && CODE.test(value) ? value : ''
const addressOf = (value) =>
  typeof value === 'string' && isIP(value) ? value : ''
const portOf = (value) =>
  Number.isInteger(value) && value >= 1 && value <= 65535 ? String(value) : ''
const hostNameOf = (value) =>
  typeof value === 'string' && HOST_NAME.test(value) ? value : ''
const statusOf = (response) => {
  const status = response?.status
  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null
}

const isRecord = (value) => typeof value === 'object' && value !== null

// One error's code and where it happened: `ECONNREFUSED 127.0.0.1:50614`,
// `ENOTFOUND no-such-host.invalid`. An IPv6 address is bracketed, so its own
// colons are not read as the port's. A message from the short list leads, with
// the code after it: `other side closed (UND_ERR_SOCKET)`.
function described(error) {
  if (!isRecord(error)) return ''
  const code = codeOf(error.code)
  const address = addressOf(error.address)
  const port = portOf(error.port)
  const host = isIP(address) === 6 ? `[${address}]` : address
  const where = host
    ? port
      ? `${host}:${port}`
      : host
    : hostNameOf(error.hostname)
  const facts = [code, where].filter(Boolean).join(' ')
  const constant =
    typeof error.message === 'string' && CONSTANT_CAUSES.has(error.message)
      ? error.message
      : ''
  if (constant) return facts ? `${constant} (${facts})` : constant
  return facts
}

// What went wrong, from the cause Node puts it in (or from the error itself,
// for a fetch that throws something else, or a disk write). A host
// with several addresses, such as `localhost`, fails with an AggregateError
// cause whose message is empty: each address it tried is in `errors`. What
// none of that describes keeps the error's name, and says it is a gap.
function whatFailed(error) {
  const cause = isRecord(error) ? error.cause : undefined
  for (const source of [cause, error]) {
    if (isRecord(source) && Array.isArray(source.errors)) {
      const each = source.errors.map(described).filter(Boolean)
      if (each.length) return each.join(', ')
    }
    const said = described(source)
    if (said) return said
  }
  const name = isRecord(error) ? error.name : undefined
  return typeof name === 'string' && NAME.test(name)
    ? `an error kiss cannot describe (${name})`
    : 'an error kiss cannot describe'
}

// A response's media type, without its parameters, when it is the shape one
// has: `text/html` from `text/html; charset=utf-8`.
function mediaType(response) {
  const header = response?.headers?.get?.('content-type')
  const type = typeof header === 'string' ? header.split(';')[0].trim() : ''
  return /^[\w.+-]+\/[\w.+-]+$/.test(type) ? type : ''
}

// The status and its standard phrase (`404 Not Found`), never the server's own
// status text, which it can fill with anything.
function statusLine(response) {
  const status = statusOf(response)
  if (status === null) return 'a status kiss cannot read'
  const phrase = STATUS_CODES[status]
  return phrase ? `${status} ${phrase}` : String(status)
}

// Which failure an attempt's error was, decided from what kiss knows (did a
// response arrive) and never from the error's text.
function failureOf(url, error, response) {
  if (ours.has(error)) return error
  if (response) {
    // `response.json()` threw: a SyntaxError is a body that is not JSON, and
    // anything else is the body failing to arrive after the headers did. The
    // status is a 2xx, so its number alone says it.
    const status = statusOf(response) ?? 'a status kiss cannot read'
    if (!(error instanceof SyntaxError))
      return fails(
        url,
        `${status}, but the body could not be read: ${whatFailed(error)}`,
      )
    const type = mediaType(response)
    return fails(
      url,
      `${status}, but the body is not JSON${type ? ` (${type})` : ''}`,
    )
  }
  return fails(url, whatFailed(error))
}

// A URL the fetch cannot take, refused before any attempt: Node's fetch quotes
// the URL in the error it raises for each, so kiss says it instead, once.
function checkUrl(url) {
  if (!URL.canParse(url)) throw fails(url, 'not a URL that can be fetched')
  const { username, password } = new URL(url)
  if (username || password)
    throw fails(
      url,
      'the URL holds a user name or password, which fetch will not send: ' +
        'put the credential in fetch.headers',
    )
}

// A header the fetch would refuse, refused here first. Node's fetch quotes the
// value in the error it raises (`Headers.append: "<value>" is an invalid header
// value.`), and the value is the token, so that error must never be raised:
// the headers are tried against the same `Headers` the fetch builds, and the
// failure is kiss's own, naming the header and never what it holds. A name is
// not a secret (`redactFetchHeaders` keeps them too). The headers are a plain
// object by then (`resolveFetch`).
function checkHeaders(headers) {
  try {
    new Headers(headers)
    return
  } catch {
    // The error quotes the value: nothing of it is kept.
  }
  const refused = Object.entries(headers)
    .filter(([name, value]) => {
      try {
        new Headers([[name, value]])
        return false
      } catch {
        return true
      }
    })
    .map(([name]) => `"${name}"`)
  throw new Error(
    `fetch.headers: ${refused.join(', ') || 'a header'} cannot be sent — ` +
      'its name or its value holds a character a header may not ' +
      '(in a value: a line break, a NUL, or a character above 255). ' +
      'The value is not shown.',
  )
}

// The cache entry is keyed by the header set as well as the URL: the same URL
// with a different bearer token is a different identity upstream, so one
// build's body must never be served to another's request.
function cacheFileFor(dir, url, headers) {
  const identity = JSON.stringify([url, Object.entries(headers).sort()])
  return `${posixPath(dir)}/${hashId(identity)}.json`
}

const MAX_REDIRECTS = 5

// The `location` of a 3xx response that has one, else ''. Read from a
// `redirect: 'manual'` response, which Node returns with its headers readable.
function isRedirect(response) {
  const status = statusOf(response)
  if (status === null || status < 300 || status > 399) return ''
  const location = response.headers?.get?.('location')
  return typeof location === 'string' ? location : ''
}

// The origins are parsed ones (scheme, host, port), so no text of the
// server's reaches the message beyond a host name; the headers are not named.
function refusedRedirect(url, from, to) {
  const error = fails(
    url,
    `redirected from ${from} to ${to}, and fetch.headers is set, which is ` +
      'never sent to another origin: fetch the final URL directly, or ' +
      'remove the header',
  )
  ours.add(error)
  refusals.add(error)
  return error
}

// One attempt: the response, and its parsed body when it is a 2xx. `seen`
// records a 2xx response as soon as it arrives, so a failure after it is
// known to be the body's rather than the network's.
//
// With custom headers a redirect is followed here, not by the fetch, because
// the fetch would send them to wherever the endpoint points: a same-origin
// redirect is followed (at most MAX_REDIRECTS), another origin fails the model.
// With none there is no secret to leak, and the fetch follows as it always did.
async function attempt(url, { fetchImpl, headers, signal, maxBytes }, seen) {
  const guarded = Object.keys(headers).length > 0
  let target = url
  let response
  for (let followed = 0; ; followed++) {
    const init = signal ? { headers, signal } : { headers }
    response = await fetchImpl(
      target,
      guarded ? { ...init, redirect: 'manual' } : init,
    )
    const location = guarded && isRedirect(response)
    if (!location) break
    const next = URL.canParse(location, target)
      ? new URL(location, target)
      : null
    const from = new URL(target).origin
    if (next && next.origin !== from)
      throw refusedRedirect(url, from, next.origin)
    if (!next || followed >= MAX_REDIRECTS) {
      const error = fails(
        url,
        next
          ? `more than ${MAX_REDIRECTS} redirects, with fetch.headers set`
          : 'a redirect to a location that is not a URL',
      )
      ours.add(error)
      refusals.add(error)
      throw error
    }
    target = next.href
  }
  if (!response.ok) return { response }
  seen.response = response
  return { response, data: await bodyWithin(url, response, maxBytes) }
}

// The parsed body, read no further than `maxBytes` (0 reads any size). A
// declared Content-Length over the limit is refused before the body is read;
// an undeclared one is counted as it streams and cancelled on the byte that
// crosses it. Either is a refusal, so it is not retried: the same URL sends
// the same body. A response with no stream (a stub) is parsed as it is.
async function bodyWithin(url, response, maxBytes) {
  if (!maxBytes || !response.body) return response.json()
  const tooLarge = () => {
    const error = fails(
      url,
      `the body is larger than fetch.maxBytes (${maxBytes} bytes): raise it, or 0 for no limit`,
    )
    ours.add(error)
    refusals.add(error)
    return error
  }
  const declared = Number(response.headers?.get?.('content-length'))
  if (declared > maxBytes) {
    await response.body.cancel().catch(() => {})
    throw tooLarge()
  }
  const chunks = []
  let size = 0
  const reader = response.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      throw tooLarge()
    }
    chunks.push(value)
  }
  return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)))
}

// One timer per attempt covers the headers and the body. The timeout is a
// race as well as an abort: the abort reaches undici's body stream, and the
// race holds for a `fetchImpl` that ignores its signal (a stub, a polyfill),
// which would otherwise hang the whole build with no way out. The race is
// lost before the abort is raised, so kiss's message wins over the
// `AbortError` the abort gives the body read.
async function attemptWithin(
  url,
  { fetchImpl, headers, timeout, maxBytes },
  seen,
) {
  if (!timeout)
    return attempt(
      url,
      { fetchImpl, headers, signal: undefined, maxBytes },
      seen,
    )
  const controller = new AbortController()
  let timer
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        `Model fetch timed out after ${timeout}ms: ${redactUrl(url)}`,
      )
      ours.add(error)
      reject(error)
      controller.abort()
    }, timeout)
  })
  const work = attempt(
    url,
    { fetchImpl, headers, signal: controller.signal, maxBytes },
    seen,
  )
  work.catch(() => {})
  try {
    return await Promise.race([work, expiry])
  } finally {
    clearTimeout(timer)
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchModel(url, options) {
  // A key passed as `undefined` takes its default, as `resolveConfig` does:
  // a spread would let it replace the default.
  const given = { ...DEFAULT_FETCH }
  for (const key of Object.keys(DEFAULT_FETCH))
    if (options[key] !== undefined) given[key] = options[key]
  const { headers, timeout, retries, cache, maxBytes } = resolveFetch(given)
  const { fetchImpl = globalThis.fetch, logger } = options
  const cacheFile = cache && cacheFileFor(cache, url, headers)

  if (cacheFile && (await fs.pathExists(cacheFile))) {
    try {
      const data = await fs.readJson(cacheFile)
      logger.debug('Model cache hit', redactUrl(url))
      return data
    } catch {
      logger.warn(`Ignoring unreadable model cache entry: ${cacheFile}`)
    }
  }

  // Outside the loop: the same URL and headers cannot be accepted on a second
  // attempt.
  checkUrl(url)
  checkHeaders(headers)

  const allowed = retries + 1
  let attempts = 0
  let failure
  while (attempts < allowed) {
    attempts++
    const seen = {}
    let outcome
    try {
      outcome = await attemptWithin(
        url,
        { fetchImpl, headers, timeout, maxBytes },
        seen,
      )
    } catch (error) {
      failure = failureOf(url, error, seen.response)
      if (refusals.has(error)) break
    }
    if (outcome && 'data' in outcome) {
      // Outside the attempt's catch: a disk that refuses the write is not a
      // reason to fetch again, nor to lose the model. Its warning names the
      // hashed cache file and the error's code, never the URL.
      if (cacheFile)
        await fs.outputJson(cacheFile, outcome.data).catch((error) => {
          logger.warn(
            `Model cache write failed: ${cacheFile} → ${whatFailed(error)}; the model is used without caching`,
          )
        })
      return outcome.data
    }
    if (outcome) {
      failure = fails(url, statusLine(outcome.response))
      // Only a 5xx is retried. A 4xx is the server rejecting this request, not
      // a blip: repeating it cannot change the answer, and retrying an auth
      // failure can lock a key. A status kiss cannot read is not a 5xx.
      const status = statusOf(outcome.response)
      if (status === null || status < 500) break
    }
    if (attempts < allowed) await wait(RETRY_BACKOFF_MS * attempts)
  }
  throw attempts > 1
    ? new Error(`${failure.message} (after ${attempts} attempts)`)
    : failure
}
