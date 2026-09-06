import fs from 'fs-extra'
import { hashId, posixPath } from './utils.js'
import { DEFAULT_FETCH } from './config.js'

const RETRY_BACKOFF_MS = 200

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
      reject(new Error(`Model fetch timed out after ${timeout}ms: ${url}`))
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
      logger.debug('Model cache hit', url)
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
        `Model fetch failed: ${url} → ${response.status} ${response.statusText}`,
      )
      // A 4xx is the server rejecting this request, not a blip: repeating it
      // cannot change the answer, and retrying an auth failure can lock a key.
      if (response.status < 500) break
    } catch (error) {
      failure = error
    }
    if (attempts < allowed) await wait(RETRY_BACKOFF_MS * attempts)
  }
  throw attempts > 1
    ? new Error(`${failure.message} (after ${attempts} attempts)`)
    : failure
}
