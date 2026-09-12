import fs from 'fs-extra'
import path from 'node:path'
import { entryTitle, oneLine, topSegment } from './llms.js'
import { toAbsoluteUrl, toCanonicalPath } from './utils.js'

/**
 * One `<item>` of the feed.
 *
 * @typedef {Object} FeedItem
 * @property {string} title the page's `title`, or its slug title-cased
 * @property {string} url the same absolute URL the sitemap and `{{canonical}}` emit
 * @property {string} description the page's `description`, or `''` when it has none
 * @property {Date} date the page's date, already parsed
 */

/**
 * The items of one feed and the count of pages that could have been in it.
 *
 * @typedef {Object} FeedItems
 * @property {FeedItem[]} items newest first, truncated to `limit`
 * @property {number} undated pages that passed every filter but carried no usable date
 */

/**
 * The feed's `<channel>`, as `renderRss` takes it.
 *
 * @typedef {Object} FeedChannel
 * @property {string} title
 * @property {string} link the site's own URL
 * @property {string} description `''` when the author gave none
 * @property {string} feedUrl the absolute URL of the feed itself, for `atom:link rel="self"`
 */

// The default, and the only name `Kiss.feed()` and `writeFeed` may disagree
// about — so they read it from here rather than each defaulting for itself.
const DEFAULT_FILENAME = 'feed.xml'

/**
 * The file the feed is written to, relative to the build folder.
 *
 * @param {Record<string, any>} [options] the `.feed()` options
 * @returns {string} `options.filename`, or `feed.xml`
 */
export function feedFileName(options = {}) {
  const name = oneLine(options.filename)
  return name || DEFAULT_FILENAME
}

/**
 * Reads a page's date: the page option first, the resolved model second. One
 * field name governs both lookups, so a site that dates its posts in a model
 * and a site that dates them in the registration read the same key.
 *
 * @param {Record<string, any>} options a page's options, with `model` resolved
 * @param {string} dateField
 * @returns {unknown} the raw value, `undefined` when the page carries none
 */
function rawDate(options, dateField) {
  if (options[dateField] != null) return options[dateField]
  const model = options.model
  // A page with no model has `undefined` here; a non-`dynamic` page handed an
  // array model has the whole array, which has no date of its own. Neither is
  // an error — both are simply undated.
  if (!model || typeof model !== 'object' || Array.isArray(model)) return
  return model[dateField]
}

/**
 * A `Date`, epoch milliseconds, or anything `new Date()` parses — and `null`
 * for everything else, including a value that parses to an invalid date.
 *
 * @param {unknown} value
 * @returns {Date|null}
 */
export function toDate(value) {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime())
  if (typeof value === 'number')
    return Number.isFinite(value) ? new Date(value) : null
  if (typeof value !== 'string' || !value.trim()) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * One item per dated page that belongs in the feed, newest first. A page is
 * left out by `ignoreFeed`, by `ignoreSitemap` (a page the author keeps out of
 * the sitemap has no business being syndicated), by `generate: false` (there is
 * nothing at that URL), by `section` when one is given, and by having no date.
 *
 * @param {{ buildTo: string, page: { options: Record<string, any> } }[]} stack
 * @param {Object} context
 * @param {string} context.siteUrl
 * @param {string} context.buildDir
 * @param {string} [context.section] a top-level `path` segment to include; omit for every page
 * @param {string} [context.dateField] default `'date'`
 * @param {number} [context.limit] default `20`; a non-positive or non-finite limit means no cap
 * @param {any} [context.logger] warns once per unparsable date
 * @returns {FeedItems}
 */
export function buildFeedItems(
  stack,
  { siteUrl, buildDir, section, dateField = 'date', limit = 20, logger },
) {
  // Sanitised on both sides, so `section: '/Blog/'` still matches the pages
  // built under `blog/`.
  const wanted = section == null ? null : topSegment(section)
  let undated = 0
  /** @type {FeedItem[]} */
  const items = []
  for (const entry of stack) {
    const options = entry.page.options
    if (options.ignoreFeed || options.ignoreSitemap) continue
    if (options.generate === false) continue
    if (wanted !== null && topSegment(options.path) !== wanted) continue
    const raw = rawDate(options, dateField)
    const date = toDate(raw)
    if (!date) {
      // A page with no date at all is an ordinary page, not a mistake — most
      // of a site is undated. A date that was *given* and cannot be read is a
      // typo the author wants to hear about, once.
      if (raw != null)
        logger?.warn?.(
          `Feed: ignoring an unreadable ${dateField} on ${entry.buildTo}: ${String(raw)}`,
        )
      undated++
      continue
    }
    // Exactly the join `buildSitemapEntries` and `buildLlmsEntries` make, and
    // therefore the one `{{canonical}}` makes: a `<link>`/`<guid>` here can
    // never name a URL the page itself does not claim.
    const urlPath = toCanonicalPath(entry.buildTo.slice(buildDir.length))
    items.push({
      title: entryTitle(options),
      url: toAbsoluteUrl(siteUrl, urlPath),
      description: oneLine(options.description),
      date,
    })
  }
  // Newest first; the url breaks a tie so two posts dated the same day come out
  // in the same order on every machine and in every run.
  items.sort(
    (a, b) =>
      b.date.getTime() - a.date.getTime() ||
      (a.url < b.url ? -1 : a.url > b.url ? 1 : 0),
  )
  const capped =
    Number.isFinite(limit) && limit >= 0 ? items.slice(0, limit) : items
  return { items: capped, undated }
}

// `&` first, or it would escape the `&` of the entities that follow it. Both
// quote forms go too: the same function escapes attribute values (`atom:link`'s
// href) as escapes text, and one function that is right everywhere beats two
// that differ by one character.
const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

/**
 * Renders the RSS 2.0 document. Deterministic by construction: every date in it
 * comes from an item, so two identical builds produce identical bytes.
 *
 * @param {FeedChannel} channel
 * @param {FeedItem[]} items newest first
 * @returns {string} the file's text, one trailing newline
 */
export function renderRss(channel, items) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(channel.title)}</title>`,
    `    <link>${escapeXml(channel.link)}</link>`,
    `    <description>${escapeXml(channel.description ?? '')}</description>`,
    `    <atom:link href="${escapeXml(channel.feedUrl)}" rel="self" type="application/rss+xml"/>`,
  ]
  // The newest item's date, never the wall clock — see AIKB/feed.md. No items,
  // no date to claim: the element is left out rather than invented.
  if (items.length)
    lines.push(
      `    <lastBuildDate>${items[0].date.toUTCString()}</lastBuildDate>`,
    )
  for (const item of items) {
    lines.push('    <item>')
    lines.push(`      <title>${escapeXml(item.title)}</title>`)
    lines.push(`      <link>${escapeXml(item.url)}</link>`)
    lines.push(`      <guid isPermaLink="true">${escapeXml(item.url)}</guid>`)
    lines.push(`      <pubDate>${item.date.toUTCString()}</pubDate>`)
    if (item.description)
      lines.push(
        `      <description>${escapeXml(item.description)}</description>`,
      )
    lines.push('    </item>')
  }
  lines.push('  </channel>', '</rss>')
  return `${lines.join('\n')}\n`
}

/**
 * @typedef {Object} FeedWriteResult
 * @property {'no-site-url'|'no-title'|'skipped'|'written'} status
 * @property {string|null} text the rendered document, or `null` when nothing was written
 */

/**
 * Writes `<build>/<filename>`. Every reason not to write one is reported rather
 * than thrown — a missing `siteUrl` or `title` is a build the author still
 * wants, minus this file.
 *
 * @param {{ buildTo: string, page: { options: Record<string, any> } }[]} stack
 * @param {Object} deps
 * @param {any} deps.config the resolved config — `siteUrl` and `folders.build`
 * @param {any} deps.logger
 * @param {Record<string, any>} [deps.options] the `.feed()` options
 * @param {boolean} [deps.overwrite] default `true`
 * @returns {Promise<FeedWriteResult>}
 */
export async function writeFeed(
  stack,
  { config, logger, options = {}, overwrite = true },
) {
  const filename = feedFileName(options)
  if (!config.siteUrl) {
    logger.error(`Cannot generate ${filename}: config.siteUrl is not set`)
    return { status: 'no-site-url', text: null }
  }
  if (!options.title || typeof options.title !== 'string') {
    logger.error(`Cannot generate ${filename}: options.title is not set`)
    return { status: 'no-title', text: null }
  }
  const buildDir = config.folders.build
  const feedPath = `${buildDir}/${filename}`
  // The same containment check a page write makes (`lib/kiss-page.js`): the
  // filename is the one auxiliary file an author names, and under `'atomic'`
  // or check `buildDir` is a staging folder that was promised to be the only
  // thing written. Thrown, not reported — `.feed()` logs it like any other
  // failure to write, and a build script naming `../` is a bug in the script.
  const resolvedBuildDir = path.resolve(buildDir)
  if (!path.resolve(feedPath).startsWith(resolvedBuildDir + path.sep)) {
    throw new Error(`Refusing to write outside the build folder: ${feedPath}`)
  }
  if (!overwrite && fs.existsSync(feedPath)) {
    logger.info(`Skipping ${filename}: already exists`)
    return { status: 'skipped', text: null }
  }
  const { items, undated } = buildFeedItems(stack, {
    siteUrl: config.siteUrl,
    buildDir,
    section: options.section,
    dateField: options.dateField || 'date',
    limit: options.limit === undefined ? 20 : options.limit,
    logger,
  })
  // One line for the whole build rather than one per page: a site is mostly
  // undated pages, and naming each of them would bury the feed's own success.
  if (undated)
    logger.info(`${filename}: ${undated} page(s) with no date left out`)
  const text = renderRss(
    {
      title: options.title,
      link: toAbsoluteUrl(config.siteUrl, ''),
      description: oneLine(options.description),
      feedUrl: toAbsoluteUrl(config.siteUrl, filename),
    },
    items,
  )
  await fs.outputFile(feedPath, text)
  logger.success(feedPath)
  return { status: 'written', text }
}
