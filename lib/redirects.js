import fs from 'fs-extra'
import { toAbsoluteUrl, toCanonicalPath } from './utils.js'

/**
 * One line of `_redirects`: an old path, and the page that now answers it.
 *
 * @typedef {Object} RedirectRule
 * @property {string} from the old path, with a leading `/`, query and fragment removed
 * @property {string} to the target page's canonical path — what `{{canonical}}` shows, origin stripped
 */

/**
 * The two advisory findings about what a rename left behind.
 *
 * @typedef {Object} RedirectFindings
 * @property {string[]} removed sorted build-relative paths the last record had, this build does not, and no alias covers
 * @property {string[]} collisions sorted alias paths a live page already answers, plus any alias two pages both claim
 */

/**
 * A page's canonical path, without the origin: `/`, `/courses/`, `/about`.
 *
 * The one join `sitemap.xml`, `llms.txt`, the feed and the `canonical` helper
 * all make — `toAbsoluteUrl(siteUrl, toCanonicalPath(rel))` — with an empty
 * `siteUrl`. `toCanonicalPath` alone is **not** enough: it only drops the last
 * segment's extension, so a directory index would come out as `/courses/index`
 * and the home page as `/index`, and both of those 404 (or 301-chain) on
 * Netlify and Cloudflare Pages. The `index` collapse and the trailing slash
 * live in `toAbsoluteUrl`. Never re-derive this arithmetic — a fourth copy that
 * disagreed would send a redirect to a URL the sitemap does not list.
 *
 * @param {string} buildTo the page's output file, as written
 * @param {string} buildDir the folder it was written into — the same naive
 * prefix slice `buildSitemapEntries` makes, so the two cannot disagree
 * @returns {string} the origin-less canonical path, always starting with `/`
 */
export function canonicalPathFor(buildTo, buildDir) {
  const rel = String(buildTo ?? '').slice(String(buildDir ?? '').length)
  return toAbsoluteUrl('', toCanonicalPath(rel))
}

/**
 * One alias as it will be written: a path with a leading `/` and nothing else
 * touched. The trailing-slash form is **preserved as written**, because
 * `/old/` and `/old` are two different source paths to a host and the author
 * is the one who knows which one used to be linked.
 *
 * @param {unknown} alias
 * @returns {string|null} the normalised path, or `null` for an empty one
 */
export function normaliseAlias(alias) {
  const raw = String(alias ?? '').trim()
  // Both are addressed to the browser, never sent to the server, so neither can
  // be part of a redirect's source path.
  const withoutQuery = raw.replace(/[?#].*$/, '')
  // Repeated slashes collapse, leading ones included: `//old` is a
  // protocol-relative URL to a host that is not this site, and a source path
  // that reads as one is a rule that can never match.
  const path = `/${withoutQuery}`.replace(/\/{2,}/g, '/')
  return path === '/' && !withoutQuery ? null : path
}

// An `aliases` option is a list, but a record that carries one old URL as a
// bare string is the obvious thing to write and costs nothing to accept.
function aliasList(value) {
  if (Array.isArray(value)) return value
  return typeof value === 'string' ? [value] : []
}

/**
 * Every alias the site declares, as rules, sorted and deduplicated.
 *
 * A `generate: false` page is skipped: there is no file at its canonical path,
 * so a rule pointing at it would redirect one 404 to another. That is the same
 * filter `sitemap.xml`, `llms.txt` and the feed apply, for the same reason.
 *
 * Two pages that claim the **same** `from` are left as two rules rather than
 * silently reduced to one — the file says what the site declared — and the
 * clash is reported by `redirectFindings` as a collision of its own.
 *
 * @param {{ buildTo: string, page: { options: Record<string, any> } }[]} stack
 * @param {Object} [context]
 * @param {string} [context.buildDir] the folder the pages were written into
 * @returns {RedirectRule[]} sorted by `from`, then `to`
 */
export function collectAliases(stack = [], { buildDir = '' } = {}) {
  /** @type {RedirectRule[]} */
  const rules = []
  const seen = new Set()
  for (const entry of stack) {
    const options = entry?.page?.options
    if (!options || options.generate === false) continue
    const aliases = aliasList(options.aliases)
    if (aliases.length === 0) continue
    const to = canonicalPathFor(entry.buildTo, buildDir)
    for (const alias of aliases) {
      const from = normaliseAlias(alias)
      if (!from) continue
      // One page listing the same alias twice is one rule; two pages claiming
      // one alias are two rules and a collision, which is a different thing.
      const key = `${from}\t${to}`
      if (seen.has(key)) continue
      seen.add(key)
      rules.push({ from, to })
    }
  }
  return sortRules(rules)
}

function sortRules(rules) {
  return [...rules].sort(
    (a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to),
  )
}

/**
 * The `_redirects` file's text — the Netlify and Cloudflare Pages format, one
 * `<from> <to> 301` per line. Sorted here as well as in `collectAliases`, so
 * the bytes are the same whatever order the rules arrived in: two identical
 * builds must write an identical file or the site churns in git.
 *
 * @param {RedirectRule[]} rules
 * @returns {string} one line per rule, newline-terminated; `''` for no rules
 */
export function renderRedirects(rules = []) {
  const lines = sortRules(rules).map((rule) => `${rule.from} ${rule.to} 301`)
  return lines.length ? `${lines.join('\n')}\n` : ''
}

// Build-relative, both sides, and that is the whole point: `buildTo` is
// `${config.folders.build}/${pageURL}` verbatim, so the *same* site recorded
// from `examples/` (`../public/9-migrated/index.html`) and checked from the
// repo root (`public/9-migrated/index.html`) shares not one string. Comparing
// the raw paths would report every page of an untouched site as removed the
// first time somebody ran the check from a different folder.
function buildRelative(buildTo, buildDir) {
  const path = String(buildTo ?? '')
  const dir = String(buildDir ?? '')
  const rel = path.startsWith(dir) ? path.slice(dir.length) : path
  return rel.startsWith('/') ? rel : `/${rel}`
}

/**
 * What a rename left behind, and what an alias is about to be ignored for.
 *
 * `removed` is the pages the last record wrote that this build does not, minus
 * any whose canonical path an alias now covers: a page that vanished with no
 * redirect. `collisions` is the aliases a live page already answers — on both
 * Netlify and Cloudflare Pages a non-forced rule is **silently skipped** when a
 * real file exists at its source, so such a rule does nothing at all — plus any
 * `from` two pages both claim, where only the first line can ever win.
 *
 * Both are advisory: nothing here moves `ok` or an exit code.
 *
 * @param {Object} context
 * @param {RedirectRule[]} [context.rules] this build's rules, from `collectAliases`
 * @param {{ buildTo: string }[]} [context.currentPages] the pages this build writes
 * @param {{ buildDir?: string, pages?: { buildTo?: string, hash?: string|null }[] }|null} [context.previousPages]
 * the last record — its own `buildDir` and `pages[]`. `null`, or anything
 * unreadable, means there is no baseline and `removed` is empty
 * @param {string} [context.buildDir] this build's folder
 * @returns {RedirectFindings}
 */
export function redirectFindings({
  rules = [],
  currentPages = [],
  previousPages = null,
  buildDir = '',
} = {}) {
  const froms = rules.map((rule) => rule.from)
  const fromSet = new Set(froms)
  const duplicates = froms.filter(
    (from, index) => froms.indexOf(from) !== index,
  )

  // A live page answers two paths: the one a host serves it at, and the file
  // itself. `/about` and `/about.html` are both real, and an alias equal to
  // either of them is a rule the host will skip.
  const live = new Set()
  const currentRelative = new Set()
  for (const page of currentPages) {
    const rel = buildRelative(page?.buildTo, buildDir)
    currentRelative.add(rel)
    live.add(rel)
    live.add(canonicalPathFor(page?.buildTo, buildDir))
  }

  const collisions = new Set(duplicates)
  for (const from of froms) if (live.has(from)) collisions.add(from)

  const removed = []
  const previousDir = previousPages?.buildDir ?? ''
  for (const page of previousPages?.pages ?? []) {
    if (typeof page?.buildTo !== 'string') continue
    // A record is only ever written by a build that passed, so a `null` hash
    // there is a `generate: false` page: nothing was ever published at that
    // path, and nothing was therefore lost.
    if (page.hash === null) continue
    const rel = buildRelative(page.buildTo, previousDir)
    if (currentRelative.has(rel)) continue
    // The alias is written as the canonical path, so that is what the old
    // file's path has to be reduced to before the two can be compared.
    if (fromSet.has(toAbsoluteUrl('', toCanonicalPath(rel)))) continue
    removed.push(rel)
  }

  return {
    removed: [...new Set(removed)].sort(),
    collisions: [...collisions].sort(),
  }
}

/**
 * @typedef {Object} RedirectWriteResult
 * @property {'none'|'skipped'|'written'} status `none` when no page has an alias
 * @property {RedirectRule[]} rules what the file says, or would have said
 */

/**
 * Writes `<build>/_redirects`. The one impure function here.
 *
 * A site with no aliases writes **nothing** — not an empty file — so a
 * `_redirects` a project keeps in `src/assets/` and copies into the build is
 * left exactly as it was. kiss only ever writes that file when it has rules of
 * its own to put in it; it never merges, and it never deletes.
 *
 * @param {{ buildTo: string, page: { options: Record<string, any> } }[]} stack
 * @param {Object} deps
 * @param {any} deps.config the resolved config — `folders.build`
 * @param {any} deps.logger
 * @param {boolean} [deps.overwrite] default `true`
 * @returns {Promise<RedirectWriteResult>}
 */
export async function writeRedirects(
  stack,
  { config, logger, overwrite = true },
) {
  const buildDir = config.folders.build
  const rules = collectAliases(stack, { buildDir })
  if (rules.length === 0) return { status: 'none', rules }
  const file = `${buildDir}/_redirects`
  if (!overwrite && fs.existsSync(file)) {
    logger.info('Skipping _redirects: already exists')
    return { status: 'skipped', rules }
  }
  await fs.outputFile(file, renderRedirects(rules))
  logger.success(file)
  return { status: 'written', rules }
}
