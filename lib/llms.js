import fs from 'fs-extra'
import {
  sanitizePath,
  toAbsoluteUrl,
  toCanonicalPath,
  toTitleCase,
} from './utils.js'

/**
 * One page as `llms.txt` lists it.
 *
 * @typedef {Object} LlmsEntry
 * @property {string} title the page's `title`, or its slug title-cased
 * @property {string} url the same absolute URL the sitemap and `{{canonical}}` emit
 * @property {string} description the page's `description`, or `''` when it has none
 * @property {string} section the display name of the group it belongs to
 */

/**
 * One `##` section of the file: a display name and the pages under it.
 *
 * @typedef {Object} LlmsGroup
 * @property {string} name
 * @property {LlmsEntry[]} entries
 */

// The title `KissPage.prepare()` fills in for a page that was given none. It is
// derived from the *placeholder* slug (`index`) in the constructor, before the
// real slug is set, so every untitled page arrives here as "Index" — which is a
// useless entry in a curated index. Treated as unset, and the page's own slug
// title-cased instead. Harmless for a page that really is the index: its slug
// title-cases to the same word.
const UNTITLED = 'Index'

// A summary or notes option is either the text itself or a path to a file
// holding it. `fs` decides which — but only for a string that could plausibly be
// a path: a multi-line or very long one is prose, and asking the filesystem
// about it is a syscall that can only ever answer "no".
const MAX_PATH_LENGTH = 512

/**
 * Resolves a `summary`/`notes` option: the contents of the file it names, or the
 * string itself. A `.md` file is used as it is — `llms.txt` is markdown.
 *
 * @param {unknown} value
 * @returns {Promise<string>} the resolved text, trailing whitespace trimmed
 */
export async function resolveText(value) {
  if (typeof value !== 'string') return ''
  const looksLikePath =
    value.length > 0 && value.length <= MAX_PATH_LENGTH && !value.includes('\n')
  if (looksLikePath) {
    // Relative to process.cwd(), like every other path a build script hands the
    // engine from the outside.
    const stat = await fs.stat(value).catch(() => null)
    if (stat?.isFile()) return (await fs.readFile(value, 'utf8')).trimEnd()
  }
  return value.trimEnd()
}

/**
 * The display name for one top-level path segment: an explicit mapping, else the
 * segment title-cased. The root group (a page with no `path`) is keyed `root`.
 *
 * @param {string} segment the sanitised first segment of a page's `path`, `''` for a root page
 * @param {Record<string, string>} [sections]
 * @returns {string}
 */
export function sectionNameFor(segment, sections = {}) {
  if (sections[segment]) return sections[segment]
  if (!segment) return sections.root || 'Pages'
  return toTitleCase(segment.replace(/[-_]+/g, ' '))
}

// A title is link text and a description follows a colon on the same line, so
// neither may carry a newline into the file. Exported because `lib/feed.js`
// derives an item's title and description from the same options and must get
// the same string: an RSS `<title>` and an `llms.txt` link text that disagree
// are two names for one page.
/**
 * @param {unknown} value
 * @returns {string} the value with every run of whitespace collapsed to one
 * space and the ends trimmed; `''` for a non-string
 */
export const oneLine = (value) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''

// `[` and `]` would end the link text early; the URL's own parentheses would end
// the target early. Percent-encoding the URL's is safe — it is the same URL — so
// the entry stays a valid markdown link either way.
const escapeText = (text) => text.replace(/([[\]\\])/g, '\\$1')
const escapeUrl = (url) => url.replace(/\(/g, '%28').replace(/\)/g, '%29')

/**
 * A page's display title: its own `title`, or its slug title-cased when it has
 * none (see `UNTITLED`). Shared with `lib/feed.js`.
 *
 * @param {Record<string, any>} options a page's options
 * @returns {string}
 */
export function entryTitle(options) {
  const slugTitle = toTitleCase(String(options.slug ?? '').replace(/-/g, ' '))
  const title = oneLine(options.title)
  return title && title !== UNTITLED ? title : slugTitle
}

/**
 * The first segment of a page's `path`, sanitised — the section key both this
 * file's grouping and `lib/feed.js`'s `section` filter read, so a page can
 * never land in one and miss the other.
 *
 * @param {unknown} pagePath a page's `path` option
 * @returns {string} `''` for a page with no path
 */
export function topSegment(pagePath) {
  return String(sanitizePath(String(pagePath ?? '')) || '')
    .split('/')[0]
    .trim()
}

/**
 * One entry per page that belongs in `llms.txt`, in registration order. A page
 * is left out by `ignoreLlms`, by `ignoreSitemap` (the AI index is a curated
 * subset of the same site the sitemap describes, never a superset), or by
 * `generate: false` (there is nothing at that URL).
 *
 * @param {{ buildTo: string, page: { options: Record<string, any> } }[]} stack
 * @param {Object} context
 * @param {string} context.siteUrl
 * @param {string} context.buildDir
 * @param {Record<string, string>} [context.sections] top-level path segment → display name
 * @returns {LlmsEntry[]}
 */
export function buildLlmsEntries(stack, { siteUrl, buildDir, sections = {} }) {
  return stack
    .filter((entry) => {
      const options = entry.page.options
      return (
        !options.ignoreLlms &&
        !options.ignoreSitemap &&
        options.generate !== false
      )
    })
    .map((entry) => {
      const options = entry.page.options
      // Exactly the join `buildSitemapEntries` makes, and therefore exactly the
      // one the `canonical` helper makes: an entry here can never name a URL
      // the page itself does not claim.
      const urlPath = toCanonicalPath(entry.buildTo.slice(buildDir.length))
      const segment = topSegment(options.path)
      return {
        title: entryTitle(options),
        url: toAbsoluteUrl(siteUrl, urlPath),
        description: oneLine(options.description),
        section:
          oneLine(options.llmsSection) || sectionNameFor(segment, sections),
      }
    })
}

/**
 * Groups entries by section, first-seen order, with the root section first
 * wherever it appears — a reader meets the site's own top-level pages before its
 * subsections.
 *
 * @param {LlmsEntry[]} entries
 * @param {string} [rootSection] the display name the root group resolved to
 * @returns {LlmsGroup[]}
 */
export function groupLlmsEntries(entries, rootSection) {
  /** @type {Map<string, LlmsEntry[]>} */
  const groups = new Map()
  for (const entry of entries) {
    if (!groups.has(entry.section)) groups.set(entry.section, [])
    groups.get(entry.section)?.push(entry)
  }
  const names = [...groups.keys()]
  if (rootSection && groups.has(rootSection))
    names.sort((a, b) => (a === rootSection ? -1 : b === rootSection ? 1 : 0))
  return names.map((name) => ({
    name,
    entries: /** @type {LlmsEntry[]} */ (groups.get(name)),
  }))
}

// A blockquote line with nothing to quote is `>` and not `> `: a trailing space
// is invisible in the file and noise in a diff.
const quote = (text) =>
  text
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n')

/**
 * Renders the file: an H1 title, a blockquote summary, one `##` section per
 * group and an optional trailing `## Notes` — the llmstxt.org shape.
 *
 * @param {Object} input
 * @param {string} input.title
 * @param {string} input.summary
 * @param {LlmsGroup[]} [input.groups]
 * @param {string} [input.notes]
 * @returns {string} the file's text, one trailing newline
 */
export function renderLlmsTxt({ title, summary, groups = [], notes = '' }) {
  const blocks = [`# ${oneLine(title)}`, quote(summary)]
  for (const group of groups) {
    const lines = group.entries.map((entry) => {
      const link = `- [${escapeText(entry.title)}](${escapeUrl(entry.url)})`
      return entry.description ? `${link}: ${entry.description}` : link
    })
    // A blank line under every `##`, the same shape `## Notes` has: the file
    // is read as markdown as often as it is parsed as a list.
    blocks.push([`## ${group.name}`, lines.join('\n')].join('\n\n'))
  }
  if (notes) blocks.push(['## Notes', notes].join('\n\n'))
  return `${blocks.join('\n\n')}\n`
}

/**
 * @typedef {Object} LlmsWriteResult
 * @property {'no-site-url'|'no-title'|'no-summary'|'skipped'|'written'} status
 * @property {string|null} text the rendered file, or `null` when nothing was written
 */

/**
 * Writes `<build>/llms.txt`. Every reason not to write one is reported rather
 * than thrown — a missing `siteUrl`, `title` or `summary` is a build the author
 * still wants, minus this file.
 *
 * @param {{ buildTo: string, page: { options: Record<string, any> } }[]} stack
 * @param {Object} deps
 * @param {any} deps.config the resolved config — `siteUrl` and `folders.build`
 * @param {any} deps.logger
 * @param {Record<string, any>} [deps.options] the `.llms()` options
 * @param {boolean} [deps.overwrite] default `true`
 * @returns {Promise<LlmsWriteResult>}
 */
export async function writeLlms(
  stack,
  { config, logger, options = {}, overwrite = true },
) {
  if (!config.siteUrl) {
    logger.error('Cannot generate llms.txt: config.siteUrl is not set')
    return { status: 'no-site-url', text: null }
  }
  if (!options.title || typeof options.title !== 'string') {
    logger.error('Cannot generate llms.txt: options.title is not set')
    return { status: 'no-title', text: null }
  }
  if (!options.summary || typeof options.summary !== 'string') {
    logger.error('Cannot generate llms.txt: options.summary is not set')
    return { status: 'no-summary', text: null }
  }
  const buildDir = config.folders.build
  const llmsPath = `${buildDir}/llms.txt`
  if (!overwrite && fs.existsSync(llmsPath)) {
    logger.info('Skipping llms.txt: already exists')
    return { status: 'skipped', text: null }
  }
  const sections = options.sections || {}
  const entries = buildLlmsEntries(stack, {
    siteUrl: config.siteUrl,
    buildDir,
    sections,
  })
  const text = renderLlmsTxt({
    title: options.title,
    summary: await resolveText(options.summary),
    notes: await resolveText(options.notes),
    groups: groupLlmsEntries(entries, sectionNameFor('', sections)),
  })
  await fs.outputFile(llmsPath, text)
  logger.success(llmsPath)
  return { status: 'written', text }
}
