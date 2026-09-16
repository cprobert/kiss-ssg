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
/**
 * @param {unknown} value
 * @returns {string|null} the path with a leading `/`, or `null` when it cannot
 * be written as one line
 */
export function normaliseRobotsPath(value: unknown): string | null;
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
export function collectRobotsAgents(options?: RobotsOptions): {
    userAgent: string;
    allow: string[];
    disallow: string[];
    crawlDelay: number | null;
}[];
/**
 * @param {{ disallow: string[] }[]} agents
 * @returns {boolean} whether any block disallows the whole site
 */
export function disallowsEverything(agents?: {
    disallow: string[];
}[]): boolean;
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
export function collectSitemapUrls(sitemap: boolean | string | string[] | undefined, { siteUrl, hasSitemap, trailingSlash }?: {
    siteUrl?: string;
    hasSitemap?: boolean;
    trailingSlash?: boolean;
}): string[];
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
export function renderRobotsTxt(agents?: {
    userAgent: string;
    allow: string[];
    disallow: string[];
    crawlDelay: number | null;
}[], sitemaps?: string[]): string;
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
export function writeRobots({ config, logger, options, hasSitemap, overwrite, }: {
    config: any;
    logger: any;
    options?: RobotsOptions;
    hasSitemap?: boolean;
    overwrite?: boolean;
}): Promise<RobotsWriteResult>;
/**
 * One crawler's block of `robots.txt`.
 */
export type RobotsAgent = {
    /**
     * the agent this block addresses; default `'*'`
     */
    userAgent?: string;
    /**
     * paths to allow
     */
    allow?: string | string[];
    /**
     * paths to disallow
     */
    disallow?: string | string[];
    /**
     * seconds; omitted when absent
     */
    crawlDelay?: number;
};
/**
 * What `.robots()` takes.
 */
export type RobotsOptions = {
    /**
     * one block per crawler; defaults to a single `*` block allowing everything
     */
    agents?: RobotsAgent[];
    /**
     * shorthand for a single block's agent
     */
    userAgent?: string;
    /**
     * shorthand for a single block's `allow`
     */
    allow?: string | string[];
    /**
     * shorthand for a single block's `disallow`
     */
    disallow?: string | string[];
    /**
     * `true` (default) advertises this build's own `sitemap.xml`, but only when `.sitemap()` was called; a string or array advertises exactly those instead; `false` advertises none
     */
    sitemap?: boolean | string | string[];
    /**
     * default `true`; `false` leaves an existing `robots.txt` alone
     */
    overwrite?: boolean;
};
/**
 * What the write did, and the two facts the report carries.
 */
export type RobotsWriteResult = {
    /**
     * `skipped` means a file was already there under `overwrite: false`
     */
    status: "written" | "skipped";
    /**
     * the rendered file, or `null` when nothing was written
     */
    text: string | null;
    /**
     * how many crawler blocks it carries
     */
    agents: number;
    /**
     * whether any block disallows the whole site
     */
    disallowAll: boolean;
    /**
     * the absolute sitemap URLs advertised
     */
    sitemaps: string[];
};
