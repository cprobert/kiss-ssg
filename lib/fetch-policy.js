import fs from 'fs-extra'
import { hashId, posixPath, redactUrl } from './utils.js'
import { DEFAULT_FETCH } from './config.js'

const RETRY_BACKOFF_MS = 200

// An error the fetch itself raised, rebuilt with the URL redacted wherever its
// message repeats it. Node's own fetch does exactly that ("Failed to parse URL
// from <url>", "…includes credentials: <url>") and carries the URL again in
// its `cause`, which `console.error` prints. So the original is never passed
// on: only its message and its cause's message survive, scrubbed of every
// spelling of the URL (as written, as the parser serialises it, and its raw
// query and credentials), in a fresh Error whose stack is built from the
// scrubbed message. A cause's own properties (`input`, the URL again) are
// dropped with it.
function scrubbed(error, url) {
  const shown = redactUrl(url)
  // Whole URLs first, then whatever piece of one is left. A query is matched
  // with its leading `?`, so a short one (`?x`) cannot match inside a word.
  const replacements = [[url, shown]]
  try {
    const parsed = new URL(url)
    replacements.push([parsed.href, shown], [parsed.search, '?[redacted]'])
    if (parsed.username || parsed.password) {
      const password = parsed.password ? `:${parsed.password}` : ''
      replacements.push([`${parsed.username}${password}@`, ''])
    }
  } catch {
    const query = url.match(/\?[^#]*/)?.[0]
    if (query && query !== '?') replacements.push([query, '?[redacted]'])
  }
  // The cause's message is kept, because for a network failure it is the only
  // useful part: Node says `fetch failed` and puts `connect ECONNREFUSED …` in
  // the cause, which is no longer printed with the error.
  const cause = error?.cause?.message
  let message = String(error?.message ?? error) + (cause ? `: ${cause}` : '')
  for (const [spelling, replacement] of replacements)
    if (spelling) message = message.split(spelling).join(replacement)
  return new Error(message)
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
      reject(
        new Error(
          `Model fetch timed out after ${timeout}ms: ${redactUrl(url)}`,
        ),
      )
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

  const allowed = Math.max(0, retries) + 1
  let attempts = 0
  let failure
  while (attempts < allowed) {
    attempts++
    try {
      const response = await fetchOnce(url, { fetchImpl, headers, timeout })
      if (response.ok) {
        const data = await response.json()
        if (cacheFile) await fs.outputJson(cacheFile, data)
        return data
      }
      failure = new Error(
        `Model fetch failed: ${redactUrl(url)} → ${response.status} ${response.statusText}`,
      )
      // A 4xx is the server rejecting this request, not a blip: repeating it
      // cannot change the answer, and retrying an auth failure can lock a key.
      if (response.status < 500) break
    } catch (error) {
      // Our own timeout message is already redacted; scrubbing it again is a
      // no-op. Anything else came from the fetch, or from parsing its body.
      failure = scrubbed(error, url)
    }
    if (attempts < allowed) await wait(RETRY_BACKOFF_MS * attempts)
  }
  throw attempts > 1
    ? new Error(`${failure.message} (after ${attempts} attempts)`)
    : failure
}
