import crypto from 'node:crypto'
import path from 'node:path'
import {
  attribute,
  classifyReference,
  decodeEntities,
  resolveTarget,
} from './links.js'

// A page that loads its own CSS or JS with `integrity="sha384-…"` names the
// hash of the bytes its author wrote. kiss changes those bytes after the
// author took that hash: the copy minifies `.css` and `.js` (on by default)
// and `assets.purge` rewrites a stylesheet. The browser then refuses the file
// and the page breaks, while the build passed (Codex at the close,
// 2026-11-05). This module decides, from the written pages and the files on
// disk, which local references no longer match. `lib/build-finish.js` makes
// each one a build failure.

const TAG = /<(script|link)\b([^>]*)>/gi
const INTEGRITY = attribute('integrity')
const SRC = attribute('src')
const HREF = attribute('href')
// The hash functions SRI defines, weakest first: a browser uses only the
// strongest one an attribute names.
const RANK = { sha256: 1, sha384: 2, sha512: 3 }

/**
 * @param {RegExpMatchArray|null} match a `links.js` `attribute()` match
 * @returns {string|null}
 */
function valueOf(match) {
  if (!match) return null
  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? '')
}

/**
 * The usable tokens of an `integrity` value: `<algo>-<base64>`, an optional
 * `?options` dropped, any other algorithm skipped.
 *
 * @param {string} value
 * @returns {{ algo: 'sha256'|'sha384'|'sha512', digest: string }[]}
 */
export function parseIntegrity(value) {
  const tokens = []
  for (const token of String(value ?? '')
    .trim()
    .split(/\s+/)) {
    const match = /^(sha256|sha384|sha512)-([^?]+)/.exec(token)
    if (match)
      tokens.push({
        algo: /** @type {'sha256'|'sha384'|'sha512'} */ (match[1]),
        digest: match[2],
      })
  }
  return tokens
}

/**
 * Whether bytes satisfy an `integrity` value as a browser checks it: against
 * the tokens of the strongest algorithm named, any one of which may match.
 *
 * @param {Buffer} bytes
 * @param {string} value
 * @returns {boolean|null} `null` when no token is usable, which a browser
 * treats as no integrity at all
 */
export function matchesIntegrity(bytes, value) {
  const tokens = parseIntegrity(value)
  if (tokens.length === 0) return null
  const strongest = tokens.reduce((a, b) =>
    RANK[b.algo] > RANK[a.algo] ? b : a,
  )
  const digest = crypto
    .createHash(strongest.algo)
    .update(bytes)
    .digest('base64')
  return tokens.some(
    (t) =>
      t.algo === strongest.algo &&
      t.digest.replace(/=+$/, '') === digest.replace(/=+$/, ''),
  )
}

/**
 * The local `<script src>` and `<link href>` references, on the given pages,
 * whose file in the build no longer matches its `integrity` attribute. A
 * reference to another site, or to a file the build does not hold (the link
 * scan's business), is not judged.
 *
 * @param {Object} input
 * @param {{ buildTo: string, html: string }[]} input.pages
 * @param {string} input.buildDir the folder the pages were written into
 * @param {string|null} [input.siteUrl]
 * @param {boolean} [input.extensionLess]
 * @param {boolean} [input.trailingSlash]
 * @param {(file: string) => Buffer|null} input.read a file's bytes, `null` when absent
 * @returns {{ page: string, ref: string }[]}
 */
export function checkIntegrity({
  pages,
  buildDir,
  siteUrl = null,
  extensionLess = false,
  trailingSlash = true,
  read,
}) {
  const found = []
  for (const { buildTo, html } of pages) {
    for (const tag of String(html).matchAll(TAG)) {
      const attrs = tag[2]
      const integrity = valueOf(attrs.match(INTEGRITY))
      if (!integrity) continue
      const ref = valueOf(
        attrs.match(tag[1].toLowerCase() === 'script' ? SRC : HREF),
      )
      if (!ref) continue
      const { kind, path: target } = classifyReference(ref, { siteUrl })
      if (kind !== 'internal' || target === null) continue
      const rel = resolveTarget(target, {
        pageBuildTo: buildTo,
        buildDir,
        extensionLess,
        trailingSlash,
        siteUrl,
        exists: () => true,
      })
      if (rel === null) continue
      const bytes = read(path.join(buildDir, rel))
      if (!bytes) continue
      if (matchesIntegrity(bytes, integrity) === false)
        found.push({ page: buildTo, ref })
    }
  }
  return found
}
