import fs from 'fs-extra'
import path from 'node:path'
import { mergeHeadersFile } from './cache-headers.js'

// The security headers a static site can send with no upkeep: set once, never
// touched again by a day-to-day edit. Opt-in (`config.securityHeaders: true`),
// because a header changes what a browser allows on a site that already works.
//
// The baseline is deliberately light (planning/plans/2026-11-05-headers.md):
// no Content-Security-Policy, no framing header, no Cross-Origin-Opener-Policy.
// Each of those protects more and costs more — a CSP blocks every widget an
// owner adds later until the policy changes, framing breaks Moodle showing a
// learning package, and COOP can break pop-up payment and sign-in windows — so
// the kiss-security skill leaves them to a site that has a reason. The values
// are OWASP's HTTP Headers Cheat Sheet's, except HSTS, which leaves out
// `preload`: it is slow to undo, and only safe once every subdomain serves
// HTTPS (planning/specs/2026-10-30-privacy-and-security-research.md, findings
// 1, 2 and 4 of the second pass). `X-XSS-Protection` is never sent.
//
// The headers go wherever the host's cache headers go — the same `_headers`,
// in a block of their own, or a Firebase fragment of their own — and the
// site's own headers win: a header the site's `_headers` already sets for
// every page is not written again.

/** The baseline, in the order it is written. */
export const SECURITY_HEADERS = Object.freeze({
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=()',
})

/** The marker lines around kiss's security block in `_headers`. */
export const SECURITY_BLOCK = Object.freeze({
  start: '# kiss-ssg: security headers (generated, do not edit)',
  end: '# kiss-ssg: end of security headers',
})

// Each host's encoding, keyed by the cache-header format names in
// `lib/config.js` HOSTS, so the two can never disagree about a host.
const SECURITY_HEADER_FORMATS = Object.freeze({
  netlify: { file: '_headers', kind: 'headers-file' },
  cloudflare: { file: '_headers', kind: 'headers-file' },
  firebase: { file: 'security-headers.firebase.json', kind: 'firebase' },
})

/**
 * @typedef {Object} SecurityHeadersWriteResult
 * @property {'none'|'written'} status `none` when `securityHeaders` is off
 * @property {Record<string, string>} headers what kiss wrote, after the
 * site's own headers were taken out
 * @property {string[]} skipped headers the site already sets, left to it
 * @property {string[]} files every path written, `security-headers.json` first
 * @property {string[]} formats the formats that ran
 * @property {boolean} unset the headers are on and no host was set
 * @property {string[]} uncovered hosts kiss cannot write headers for
 */

/**
 * The header names a `_headers` file sets for every page (`/*`), lower-cased.
 * kiss's own blocks are left out: they are rewritten on every build.
 *
 * @param {string|null} file the `_headers` text
 * @returns {Set<string>}
 */
export function siteWideHeaderNames(file) {
  const names = new Set()
  if (!file) return names
  let rule = null
  let inKissBlock = false
  for (const raw of file.split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (line.startsWith('# kiss-ssg:')) {
      inKissBlock = !line.includes('end of')
      continue
    }
    if (inKissBlock || line.trim() === '' || line.trim().startsWith('#'))
      continue
    if (!/^\s/.test(line)) {
      rule = line.trim()
      continue
    }
    const match = /^\s+([^:]+):/.exec(line)
    if (rule === '/*' && match) names.add(match[1].trim().toLowerCase())
  }
  return names
}

/**
 * The baseline less every header the site already sets for every page.
 *
 * @param {Set<string>} siteNames from `siteWideHeaderNames`
 * @returns {{ headers: Record<string, string>, skipped: string[] }}
 */
export function securityHeaders(siteNames) {
  /** @type {Record<string, string>} */
  const headers = {}
  const skipped = []
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (siteNames.has(name.toLowerCase())) skipped.push(name)
    else headers[name] = value
  }
  return { headers, skipped }
}

/**
 * kiss's security block for a `_headers` file: one `/*` rule.
 *
 * @param {Record<string, string>} headers
 * @returns {string}
 */
export function renderSecurityBlock(headers) {
  const lines = [SECURITY_BLOCK.start, '/*']
  for (const [key, value] of Object.entries(headers))
    lines.push(`  ${key}: ${value}`)
  lines.push(SECURITY_BLOCK.end)
  return `${lines.join('\n')}\n`
}

/**
 * The Firebase fragment, to merge into `firebase.json`'s `headers` array.
 * Firebase overwrites HSTS on its own `*.web.app` subdomains; only a custom
 * domain serves this value.
 *
 * @param {Record<string, string>} headers
 * @returns {string}
 */
export function renderFirebaseSecurityHeaders(headers) {
  const list = Object.entries(headers).map(([key, value]) => ({ key, value }))
  return `${JSON.stringify({ headers: [{ source: '**', headers: list }] }, null, 2)}\n`
}

/**
 * Write this build's security headers into `root`. Runs after the cache
 * headers, so a `_headers` the cache writer made is merged into, not replaced.
 *
 * @param {Object} input
 * @param {import('./config.js').KissConfig} input.config
 * @param {string} input.root where the build is being written
 * @param {{ claim(file: string, owner: string): void }} [input.outputs]
 * @returns {Promise<SecurityHeadersWriteResult>}
 */
export async function writeSecurityHeaders({ config, root, outputs }) {
  const hosts = config.host ?? []
  const result = {
    status: /** @type {'none'|'written'} */ ('none'),
    headers: /** @type {Record<string, string>} */ ({}),
    skipped: /** @type {string[]} */ ([]),
    files: /** @type {string[]} */ ([]),
    formats: /** @type {string[]} */ ([]),
    unset: false,
    uncovered: hosts.filter((host) => host === 'vercel'),
  }
  if (config.securityHeaders !== true) return result

  const headersFile = path.join(root, '_headers')
  const existing = fs.existsSync(headersFile)
    ? await fs.readFile(headersFile, 'utf8')
    : null
  const { headers, skipped } = securityHeaders(siteWideHeaderNames(existing))
  result.status = 'written'
  result.headers = headers
  result.skipped = skipped
  result.unset = hosts.length === 0

  const json = path.join(root, 'security-headers.json')
  await fs.outputFile(
    json,
    `${JSON.stringify({ version: 1, rules: [{ path: '/*', headers }] }, null, 2)}\n`,
  )
  outputs?.claim(json, 'security headers')
  result.files.push(json)

  const formats = []
  for (const host of hosts) {
    const spec = SECURITY_HEADER_FORMATS[host]
    // `netlify` and `cloudflare` both mean `_headers`: write it once.
    if (
      spec &&
      !formats.some((f) => SECURITY_HEADER_FORMATS[f].file === spec.file)
    )
      formats.push(host)
  }
  if (Object.keys(headers).length === 0) return result
  for (const format of formats) {
    const spec = SECURITY_HEADER_FORMATS[format]
    const file = path.join(root, spec.file)
    if (spec.kind === 'headers-file') {
      // Merged into whatever is there — the site's own file, the cache
      // headers' block, or both — and claimed only when kiss made the file.
      const current = fs.existsSync(file)
        ? await fs.readFile(file, 'utf8')
        : null
      await fs.outputFile(
        file,
        mergeHeadersFile(current, renderSecurityBlock(headers), SECURITY_BLOCK),
      )
      if (current === null) outputs?.claim(file, 'security headers')
    } else {
      await fs.outputFile(file, renderFirebaseSecurityHeaders(headers))
      outputs?.claim(file, 'security headers')
    }
    result.files.push(file)
    result.formats.push(format)
  }
  return result
}
