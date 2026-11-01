import fs from 'fs-extra'
import { rawDate, toDate } from './feed.js'
import { toAbsoluteUrl, toCanonicalPath } from './utils.js'

// The fields a page's date is read from, most specific first: when it last
// changed, then when it was published. `sitemapLastmod` overrides both.
const DATE_FIELDS = ['updated', 'date']

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * The page's last-modified date as a W3C datetime, or `undefined` when it
 * carries none. Google uses `lastmod` only when it is "consistently and
 * verifiably" accurate, so a page with no date of its own states none rather
 * than the build time. `sitemapLastmod` is the author's word and is written
 * as given; a date read from `updated` or `date` is normalised, a date-only
 * string kept as it is so no time zone can move it to another day.
 *
 * @param {Record<string, any>} options a page's options, with `model` resolved
 * @param {string} buildTo the page's output path, for the warning
 * @param {any} [logger] warns once per unreadable date
 * @returns {string|undefined}
 */
function pageLastmod(options, buildTo, logger) {
  if (options.sitemapLastmod) return options.sitemapLastmod
  for (const field of DATE_FIELDS) {
    const raw = rawDate(options, field)
    if (raw == null || raw === '') continue
    const text = typeof raw === 'string' ? raw.trim() : ''
    const date = toDate(raw)
    if (DATE_ONLY.test(text)) {
      // `2026-02-30` parses (as 2 March), so a day is kept only when it reads
      // back as itself; a date-only string parses as UTC, so this is exact.
      if (date?.toISOString().slice(0, 10) === text) return text
    } else if (date) return date.toISOString()
    logger?.warn(
      `Sitemap: ignoring an unreadable ${field} on ${buildTo}: ${String(raw)}`,
    )
  }
}

export function buildSitemapEntries(
  stack,
  { siteUrl, buildDir, trailingSlash = true, logger = undefined },
) {
  return stack
    .filter(
      (entry) =>
        !entry.page.options.ignoreSitemap &&
        // A page whose canonical is elsewhere has said another URL is the
        // real one; a sitemap that listed it would advertise a duplicate.
        !entry.page.options.canonical &&
        entry.page.options.generate !== false,
    )
    .map((entry) => {
      const options = entry.page.options
      // The same two functions the `canonical` helper uses, under the same
      // `links.trailingSlash` policy, so a page's `<loc>` and its own
      // `<link rel="canonical">` can never disagree — a directory index
      // included, which ends in `/` on both sides or on neither.
      const urlPath = toCanonicalPath(entry.buildTo.slice(buildDir.length))
      // `priority` and `changefreq` only when the page sets them: Google
      // ignores both, and a `1.00` on every page says nothing.
      const url = { loc: toAbsoluteUrl(siteUrl, urlPath, { trailingSlash }) }
      const lastmod = pageLastmod(options, entry.buildTo, logger)
      if (lastmod) url.lastmod = lastmod
      if (options.sitemapChangefreq) url.changefreq = options.sitemapChangefreq
      if (options.sitemapPriority) url.priority = options.sitemapPriority
      return url
    })
}

export function renderSitemapXml(urls) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  for (const url of urls) {
    xml += '  <url>\n'
    xml += `    <loc>${url.loc}</loc>\n`
    if (url.lastmod) xml += `    <lastmod>${url.lastmod}</lastmod>\n`
    if (url.changefreq)
      xml += `    <changefreq>${url.changefreq}</changefreq>\n`
    if (url.priority) xml += `    <priority>${url.priority}</priority>\n`
    xml += '  </url>\n'
  }
  return xml + '</urlset>'
}

export async function writeSitemap(
  stack,
  { config, logger, outputs = undefined, overwrite = true },
) {
  if (!config.siteUrl) {
    logger.error('Cannot generate sitemap.xml: config.siteUrl is not set')
    return { status: 'no-site-url', urls: null }
  }
  const buildDir = config.folders.build
  const sitemapPath = `${buildDir}/sitemap.xml`
  if (!overwrite && fs.existsSync(sitemapPath)) {
    logger.info('Skipping sitemap.xml: already exists')
    return { status: 'skipped', urls: null }
  }
  const urls = buildSitemapEntries(stack, {
    siteUrl: config.siteUrl,
    buildDir,
    trailingSlash: config.links?.trailingSlash ?? true,
    logger,
  })
  await fs.outputFile(sitemapPath, renderSitemapXml(urls))
  outputs?.claim(sitemapPath, 'sitemap')
  logger.success(sitemapPath)
  return { status: 'written', urls }
}
