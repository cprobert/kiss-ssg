import fs from 'fs-extra'
import { STATUS_CODES } from 'node:http'
import { hashId, posixPath, redactUrl } from './utils.js'
import { DEFAULT_FETCH } from './config.js'

const RETRY_BACKOFF_MS = 200

// A failure's message is written here, from parts that cannot carry a secret,
// and never from the text of what failed. Node's fetch quotes the URL in its
// errors (`Failed to parse URL from <url>`), a status text and a body are the
// server's to write, and an error from an injected `fetchImpl` can say
// anything. Editing that text to take the URL out was a deny-list of
// spellings, and each of three reviews found one it missed (2026-11-06).

// The one shape a code, an address, a port or a host has when Node raises it
// (`ECONNREFUSED`, `::1`, `50614`, `no-such-host.invalid`).
// A space, a quote, a `?` or a `/` cannot pass, so neither can a URL or a
// sentence.
const PART = /^[A-Za-z0-9_.:-]+$/

// The cause messages that are shown, by exact equality: a string kiss chose
// cannot carry a secret. Each was measured on Node 24.14.0 as the cause of
// `fetch failed`, and each says what happened where the cause has no code or
// address to say it with.
const CONSTANT_CAUSES = new Set([
  'redirect count exceeded',
  'other side closed',
  'bad port',
  'unknown scheme',
])

// The errors this module built itself, already redacted: passed on as they
// are. Rebuilding one put its redacted URL through a second redaction.
const ours = new WeakSet()
function own(message) {
  const error = new Error(message)
  ours.add(error)
  return error
}

const part = (value) =>
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && PART.test(value))
    ? String(value)
    : ''

const isRecord = (value) => typeof value === 'object' && value !== null

// One error's code and where it happened: `ECONNREFUSED 127.0.0.1:50614`,
// `ENOTFOUND no-such-host.invalid`. An IPv6 address is bracketed, so its own
// colons are not read as the port's. A message from the short list leads, with
// the code after it: `other side closed (UND_ERR_SOCKET)`.
function described(error) {
  if (!isRecord(error)) return ''
  const code = part(error.code)
  const address = part(error.address)
  const port = part(error.port)
  const host = address.includes(':') ? `[${address}]` : address
  const where = host ? (port ? `${host}:${port}` : host) : part(error.hostname)
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
// cause whose message is empty: each address it tried is in `errors`.
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
  return typeof name === 'string' && /^[A-Za-z]+$/.test(name)
    ? name
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
  const status = part(response?.status)
  const phrase = STATUS_CODES[status]
  return phrase ? `${status} ${phrase}` : status || 'a status kiss cannot read'
}

// Which failure this was, decided from what kiss knows (does the URL parse,
// does it carry credentials, did a response arrive) and never from the
// error's text.
function failureOf(url, error, response) {
  const fails = (what) => own(`Model fetch failed: ${redactUrl(url)} → ${what}`)
  if (ours.has(error)) return error
  if (response) {
    // `response.json()` threw: a SyntaxError is a body that is not JSON, and
    // anything else is the body failing to arrive after the headers did. The
    // status is a 2xx, so its number alone says it.
    const status = part(response.status)
    if (!(error instanceof SyntaxError))
      return fails(
        `${status}, but the body could not be read: ${whatFailed(error)}`,
      )
    const type = mediaType(response)
    return fails(
      `${status}, but the body is not JSON${type ? ` (${type})` : ''}`,
    )
  }
  if (!URL.canParse(url)) return fails('not a URL that can be fetched')
  const { username, password } = new URL(url)
  if (username || password)
    return fails(
      'the URL holds a user name or password, which fetch will not send: ' +
        'put the credential in fetch.headers',
    )
  return fails(whatFailed(error))
}

// A header the fetch would refuse, refused here first. Node's fetch quotes the
// value in the error it raises (`Headers.append: "<value>" is an invalid header
// value.`), and the value is the token, so that error must never be raised:
// the headers are tried against the same `Headers` the fetch builds, and the
// failure is kiss's own, naming the header and never what it holds. A name is
// not a secret (`redactFetchHeaders` keeps them too).
function checkHeaders(headers) {
  try {
    new Headers(headers)
    return
  } catch {
    // The error quotes the value: nothing of it is kept.
  }
  // Named one by one only for the documented shape, a plain record. Anything
  // else (pairs, a string, null) is refused whole, without a name.
  const record =
    headers && Object.getPrototypeOf(headers) === Object.prototype
      ? Object.entries(headers)
      : []
  const refused = record
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

// The timeout is a race as well as an abort: `fetchImpl` is an injected seam,
// and one that ignores its signal (a stub, a polyfill) would otherwise hang
// the whole build with no way out.
async function fetchOnce(url, { fetchImpl, headers, timeout }) {
  if (!timeout) return fetchImpl(url, { headers })
  const controller = new AbortController()
  let timer
  const expiry = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort()
      reject(own(`Model fetch timed out after ${timeout}ms: ${redactUrl(url)}`))
    }, timeout)
  })
  const attempt = Promise.resolve(
    fetchImpl(url, { headers, signal: controller.signal }),
  )
  attempt.catch(() => {})
  try {
    return await Promise.race([attempt, expiry])
  } finally {
    clearTimeout(timer)
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchModel(url, options) {
  const { headers, timeout, retries, cache } = { ...DEFAULT_FETCH, ...options }
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

  // Outside the loop: the same headers cannot be accepted on a second attempt.
  checkHeaders(headers)

  const allowed = Math.max(0, retries) + 1
  let attempts = 0
  let failure
  while (attempts < allowed) {
    attempts++
    // Set once a 2xx response has arrived, so a failure after it is known to
    // be the body's rather than the network's.
    let arrived
    let data
    let parsed = false
    try {
      const response = await fetchOnce(url, { fetchImpl, headers, timeout })
      if (response.ok) {
        arrived = response
        data = await response.json()
        parsed = true
      } else {
        failure = own(
          `Model fetch failed: ${redactUrl(url)} → ${statusLine(response)}`,
        )
        // A 4xx is the server rejecting this request, not a blip: repeating
        // it cannot change the answer, and retrying an auth failure can lock
        // a key.
        if (response.status < 500) break
      }
    } catch (error) {
      failure = failureOf(url, error, arrived)
    }
    if (parsed) {
      // Outside the attempt's catch: a disk that refuses the write is not a
      // reason to fetch again. Its message names the hashed cache file and
      // the error's code, never the URL.
      if (cacheFile)
        await fs.outputJson(cacheFile, data).catch((error) => {
          throw own(
            `Model cache write failed: ${cacheFile} → ${whatFailed(error)}`,
          )
        })
      return data
    }
    if (attempts < allowed) await wait(RETRY_BACKOFF_MS * attempts)
  }
  throw attempts > 1
    ? new Error(`${failure.message} (after ${attempts} attempts)`)
    : failure
}
