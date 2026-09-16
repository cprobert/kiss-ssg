import fs from 'fs-extra'
import { toAbsoluteUrl } from './utils.js'

/**
 * One crawler's block of `robots.txt`.
 *
 * @typedef {Object} RobotsAgent
 * @property {string} [userAgent] the agent this block addresses; default `'*'`
 * @property {string|string[]} [allow] paths to allow
 * @property {string|string[]} [disallow] paths to disallow
 * @property {number} [crawlDelay] seconds; omitted when absent
 */

/**
 * What `.robots()` takes.
 *
 * @typedef {Object} RobotsOptions
 * @property {RobotsAgent[]} [agents] one block per crawler; defaults to a single `*` block allowing everything
 * @property {string} [userAgent] shorthand for a single block's agent
 * @property {string|string[]} [allow] shorthand for a single block's `allow`
 * @property {string|string[]} [disallow] shorthand for a single block's `disallow`
 * @property {boolean|string|string[]} [sitemap] `true` (default) advertises this build's own `sitemap.xml`, but only when `.sitemap()` was called; a string or array advertises exactly those instead; `false` advertises none
 * @property {boolean} [overwrite] default `true`; `false` leaves an existing `robots.txt` alone
 */

/**
 * What the write did, and the two facts the report carries.
 *
 * @typedef {Object} RobotsWriteResult
 * @property {'written'|'skipped'} status `skipped` means a file was already there under `overwrite: false`
 * @property {string|null} text the rendered file, or `null` when nothing was written
 * @property {number} agents how many crawler blocks it carries
 * @property {boolean} disallowAll whether any block disallows the whole site
 * @property {string[]} sitemaps the absolute sitemap URLs advertised
 */

// A directive is one line, and a value carrying a line break would write more
// lines than the one it stands for — the same injection `normaliseAlias` drops
// an alias for in `lib/redirects.js`, and the same reasoning: a `disallow` may
// have come from a model rather than from a person's hands. A path is dropped
// rather than escaped, because there is no escape for a newline in this format
// and silently writing a *different* rule is worse than writing none.
/**
 * @param {unknown} value
 * @returns {string|null} the path with a leading `/`, or `null` when it cannot
 * be written as one line
 */
export function normaliseRobotsPath(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/[\s]/.test(raw)) return null
  return raw.startsWith('/') || raw.startsWith('*') ? raw : `/${raw}`
}

const asList = (value) =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value]

/**
 * The crawler blocks a call asks for, normalised: always a list, always with a
 * `userAgent`, and with every path reduced by `normaliseRobotsPath`.
 *
 * The default — one `*` block allowing everything — is what a site that calls
 * `.robots()` with no arguments gets, and it is the file the shipped examples
 * hand-write. The point of calling the method is not that block; it is the
 * `Sitemap:` line underneath it, which is the part a hand-written file cannot
 * keep in step with the build.
 *
 * @param {RobotsOptions} [options]
 * @returns {{ userAgent: string, allow: string[], disallow: string[], crawlDelay: number|null }[]}
 */
export function collectRobotsAgents(options = {}) {
  const shorthand =
    options.userAgent !== undefined ||
    options.allow !== undefined ||
    options.disallow !== undefined
  const source = options.agents?.length
    ? options.agents
    : shorthand
      ? [
          {
            userAgent: options.userAgent,
            allow: options.allow,
            disallow: options.disallow,
          },
        ]
      : [{ userAgent: '*', allow: '/' }]
  return source.map((agent) => ({
    userAgent: String(agent?.userAgent ?? '*').trim() || '*',
    allow: asList(agent?.allow).map(normaliseRobotsPath).filter(Boolean),
    disallow: asList(agent?.disallow).map(normaliseRobotsPath).filter(Boolean),
    crawlDelay:
      typeof agent?.crawlDelay === 'number' && Number.isFinite(agent.crawlDelay)
        ? agent.crawlDelay
        : null,
  }))
}

// `Disallow: /` is the sharpest edge in the package: it removes a site from
// search, it is one character away from the `Disallow:` that means "nothing is
// disallowed", and nothing about the build looks wrong afterwards. Detected
// here so `Kiss` can say it out loud on every build and put it in the report,
// rather than leaving it to be discovered in Search Console weeks later.
/**
 * @param {{ disallow: string[] }[]} agents
 * @returns {boolean} whether any block disallows the whole site
 */
export function disallowsEverything(agents = []) {
  return agents.some((agent) => agent.disallow.includes('/'))
}

/**
 * The sitemap URLs to advertise.
 *
 * `true` means "this build's own sitemap" and is honoured **only when the
 * build actually writes one** — `hasSitemap`. Advertising a `sitemap.xml` that
 * was never written is a fetch error in every crawler that reads the line, and
 * a site that dropped `.sitemap()` should not keep claiming one. A string is
 * taken at its word, absolute or site-relative, because it may name a sitemap
 * index some other tool writes.
 *
 * The join is `toAbsoluteUrl`, the one every emitted URL in the package goes
 * through, so the URL here is character-for-character the one `.sitemap()`
 * wrote and follows `links.trailingSlash` with it.
 *
 * @param {boolean|string|string[]|undefined} sitemap
 * @param {Object} context
 * @param {string} [context.siteUrl]
 * @param {boolean} [context.hasSitemap] whether `.sitemap()` was called on this build
 * @param {boolean} [context.trailingSlash]
 * @returns {string[]} absolute URLs, in the order given
 */
export function collectSitemapUrls(
  sitemap,
  { siteUrl, hasSitemap = false, trailingSlash = true } = {},
) {
  if (sitemap === false) return []
  if (!siteUrl) return []
  const named = sitemap === true || sitemap === undefined ? [] : asList(sitemap)
  if (named.length)
    return named.map((entry) => {
      const value = String(entry)
      return /^[a-z][a-z0-9+.-]*:/i.test(value)
        ? value
        : toAbsoluteUrl(siteUrl, value, { trailingSlash })
    })
  if (!hasSitemap) return []
  return [toAbsoluteUrl(siteUrl, 'sitemap.xml', { trailingSlash })]
}

/**
 * The file's text. Blocks in the order given, one blank line between them, the
 * `Sitemap:` lines last — where every crawler looks for them, and where they
 * read as belonging to the file rather than to the final block.
 *
 * A block with no rules still writes its `User-agent:` line and a bare
 * `Disallow:`, which is the format's way of saying "nothing is disallowed".
 * Writing the agent alone would be a block with no directives, which is
 * undefined behaviour in the original spec.
 *
 * @param {{ userAgent: string, allow: string[], disallow: string[], crawlDelay: number|null }[]} agents
 * @param {string[]} [sitemaps]
 * @returns {string} newline-terminated
 */
export function renderRobotsTxt(agents = [], sitemaps = []) {
  const blocks = agents.map((agent) => {
    const lines = [`User-agent: ${agent.userAgent}`]
    for (const path of agent.disallow) lines.push(`Disallow: ${path}`)
    for (const path of agent.allow) lines.push(`Allow: ${path}`)
    if (agent.crawlDelay !== null)
      lines.push(`Crawl-delay: ${agent.crawlDelay}`)
    if (agent.disallow.length === 0 && agent.allow.length === 0)
      lines.push('Disallow:')
    return lines.join('\n')
  })
  const text = blocks.join('\n\n')
  const tail = sitemaps.map((url) => `Sitemap: ${url}`).join('\n')
  return [text, tail].filter(Boolean).join('\n\n') + '\n'
}

/**
 * Writes `<build>/robots.txt`. The one impure function here.
 *
 * Unlike `_redirects` there is a method to call: a crawl policy is a statement
 * about the site as a whole, not a property of a page, so nothing can infer it
 * from the stack. That also means a site keeping its own `robots.txt` in
 * `src/assets/` is untouched unless it asks for this — and `overwrite: false`
 * leaves the copied file alone even then.
 *
 * @param {Object} deps
 * @param {any} deps.config the resolved config — `folders.build`, `siteUrl`, `links.trailingSlash`
 * @param {any} deps.logger
 * @param {RobotsOptions} [deps.options]
 * @param {boolean} [deps.hasSitemap] whether `.sitemap()` was called on this build
 * @param {boolean} [deps.overwrite] default `true`
 * @returns {Promise<RobotsWriteResult>}
 */
export async function writeRobots({
  config,
  logger,
  options = {},
  hasSitemap = false,
  overwrite = true,
}) {
  const buildDir = config.folders.build
  const robotsPath = `${buildDir}/robots.txt`
  const agents = collectRobotsAgents(options)
  const sitemaps = collectSitemapUrls(options.sitemap, {
    siteUrl: config.siteUrl,
    hasSitemap,
    trailingSlash: config.links?.trailingSlash ?? true,
  })
  const disallowAll = disallowsEverything(agents)
  if (!overwrite && fs.existsSync(robotsPath)) {
    logger.info('Skipping robots.txt: already exists')
    return {
      status: 'skipped',
      text: null,
      agents: agents.length,
      disallowAll,
      sitemaps,
    }
  }
  const text = renderRobotsTxt(agents, sitemaps)
  await fs.outputFile(robotsPath, text)
  logger.success(robotsPath)
  return {
    status: 'written',
    text,
    agents: agents.length,
    disallowAll,
    sitemaps,
  }
}
