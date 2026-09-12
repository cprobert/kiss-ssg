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
 * The three advisory findings about what a rename left behind.
 *
 * @typedef {Object} RedirectFindings
 * @property {string[]} removed sorted build-relative paths the last record had, this build does not, and no alias covers
 * @property {string[]} collisions sorted alias paths a live page already answers, plus any alias two pages both claim
 * @property {{ id: string, from: string, to: string }[]} moved sorted by `from`; one page, paired by `id` across the two builds, whose build-relative path changed and whose old path no alias covers
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

/**
 * Whether an alias already answers for an old path.
 *
 * The alias is matched **in canonical form**: the old file's build-relative
 * path is reduced by the same `toAbsoluteUrl('', toCanonicalPath(rel))` join
 * every other URL here goes through, because that is the form `collectAliases`
 * writes a rule's target in and the form an author writes the source in
 * (`/old-post`, not `/old-post.html`). An alias spelled as the file
 * (`/old-post.html`) therefore does **not** cover it — it is a different source
 * path to the host, and saying it covered the loss would be a lie about what
 * the `_redirects` file does.
 *
 * One predicate, called from both loops below, so `removed` and `moved` can
 * never disagree about the same page: two findings for one event, or a page
 * that slips between them.
 *
 * @param {string} rel the old page's build-relative path (`/old-post.html`)
 * @param {Set<string>} fromSet every `from` this build's rules declare
 * @returns {boolean}
 */
export function coveredByAlias(rel, fromSet) {
  return fromSet.has(toAbsoluteUrl('', toCanonicalPath(rel)))
}

// An id is a pairing key only when it is a non-empty string on *both* sides.
// `null` means two different things — a page that claims no identity (an inline
// template, a `generate: false` page, a default id two pages arrived at and
// `Kiss` withdrew from both) — and a record written before ids existed has no
// key at all. Pairing nulls would pair every idless page with every other and
// report a site's whole stack as moved.
function pairingId(page) {
  const id = page?.id
  return typeof id === 'string' && id !== '' ? id : null
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
 * `moved` is the pages the last record wrote at one path and this build writes
 * at another — paired **by id**, so a page that kept its identity and changed
 * its address is reported as the one event it is, with the fix (`aliases`) to
 * hand. `removed` is the pages the last record wrote that this build does not,
 * minus any whose canonical path an alias now covers and minus any whose id
 * paired: a page that vanished with no redirect. `collisions` is the aliases a
 * live page already answers — on both Netlify and Cloudflare Pages a non-forced
 * rule is **silently skipped** when a real file exists at its source, so such a
 * rule does nothing at all — plus any `from` two pages both claim, where only
 * the first line can ever win.
 *
 * All three are advisory: nothing here moves `ok` or an exit code.
 *
 * @param {Object} context
 * @param {RedirectRule[]} [context.rules] this build's rules, from `collectAliases`
 * @param {{ buildTo: string, id?: string|null }[]} [context.currentPages] the pages this build writes, with their identities
 * @param {{ buildDir?: string, pages?: { buildTo?: string, hash?: string|null, id?: string|null }[] }|null} [context.previousPages]
 * the last record — its own `buildDir` and `pages[]`. `null`, or anything
 * unreadable, means there is no baseline and `removed` and `moved` are empty;
 * a record written before ids existed carries none, and degrades to the path
 * comparison alone
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
  /** @type {Map<string, string>} */
  const currentById = new Map()
  for (const page of currentPages) {
    const rel = buildRelative(page?.buildTo, buildDir)
    currentRelative.add(rel)
    live.add(rel)
    live.add(canonicalPathFor(page?.buildTo, buildDir))
    const id = pairingId(page)
    // An explicit id is unique by construction (`Kiss._preparePage` fails the
    // build on a second claim), so the first entry is the only entry; taking
    // the first rather than the last keeps the answer registration-ordered if
    // a hand-built stack ever breaks that.
    if (id && !currentById.has(id)) currentById.set(id, rel)
  }

  const collisions = new Set(duplicates)
  for (const from of froms) if (live.has(from)) collisions.add(from)

  const previousDir = previousPages?.buildDir ?? ''
  // A record is only ever written by a build that passed, so a `null` hash
  // there is a `generate: false` page: nothing was ever published at that path,
  // and nothing was therefore lost.
  const previous = (previousPages?.pages ?? []).filter(
    (page) => typeof page?.buildTo === 'string' && page.hash !== null,
  )

  // Moved first, because it is the finding that knows most: a page it pairs is
  // accounted for, whether it moved, stayed put or is covered by an alias, and
  // the removal loop below must not report the same event a second time.
  /** @type {{ id: string, from: string, to: string }[]} */
  const moved = []
  const paired = new Set()
  for (const page of previous) {
    const id = pairingId(page)
    if (!id) continue
    const to = currentById.get(id)
    if (to === undefined) continue
    const from = buildRelative(page.buildTo, previousDir)
    paired.add(from)
    if (from === to) continue
    if (coveredByAlias(from, fromSet)) continue
    moved.push({ id, from, to })
  }

  const removed = []
  for (const page of previous) {
    const rel = buildRelative(page.buildTo, previousDir)
    if (currentRelative.has(rel)) continue
    // The page is still in the site under the same id: it moved, or an alias
    // already covers the move. Either way it is not a page that vanished.
    if (paired.has(rel)) continue
    if (coveredByAlias(rel, fromSet)) continue
    removed.push(rel)
  }

  return {
    removed: [...new Set(removed)].sort(),
    collisions: [...collisions].sort(),
    // Sorted by `from` — the path a reader is looking for, and the one the
    // notice and the summary line lead with — then by `id`, so two moves out of
    // one old path (which only a hand-built record can produce) are still
    // ordered.
    moved: moved.sort(
      (a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id),
    ),
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
