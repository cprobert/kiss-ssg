/**
 * The file the feed is written to, relative to the build folder.
 *
 * @param {Record<string, any>} [options] the `.feed()` options
 * @returns {string} `options.filename`, or `feed.xml`
 */
export function feedFileName(options?: Record<string, any>): string;
/**
 * A `Date`, epoch milliseconds, or anything `new Date()` parses — and `null`
 * for everything else, including a value that parses to an invalid date.
 *
 * @param {unknown} value
 * @returns {Date|null}
 */
export function toDate(value: unknown): Date | null;
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
export function buildFeedItems(stack: {
    buildTo: string;
    page: {
        options: Record<string, any>;
    };
}[], { siteUrl, buildDir, section, dateField, limit, logger }: {
    siteUrl: string;
    buildDir: string;
    section?: string;
    dateField?: string;
    limit?: number;
    logger?: any;
}): FeedItems;
/**
 * Renders the RSS 2.0 document. Deterministic by construction: every date in it
 * comes from an item, so two identical builds produce identical bytes.
 *
 * @param {FeedChannel} channel
 * @param {FeedItem[]} items newest first
 * @returns {string} the file's text, one trailing newline
 */
export function renderRss(channel: FeedChannel, items: FeedItem[]): string;
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
export function writeFeed(stack: {
    buildTo: string;
    page: {
        options: Record<string, any>;
    };
}[], { config, logger, options, overwrite }: {
    config: any;
    logger: any;
    options?: Record<string, any>;
    overwrite?: boolean;
}): Promise<FeedWriteResult>;
export type FeedWriteResult = {
    status: "no-site-url" | "no-title" | "skipped" | "written";
    /**
     * the rendered document, or `null` when nothing was written
     */
    text: string | null;
};
/**
 * One `<item>` of the feed.
 */
export type FeedItem = {
    /**
     * the page's `title`, or its slug title-cased
     */
    title: string;
    /**
     * the same absolute URL the sitemap and `{{canonical}}` emit
     */
    url: string;
    /**
     * the page's `description`, or `''` when it has none
     */
    description: string;
    /**
     * the page's date, already parsed
     */
    date: Date;
};
/**
 * The items of one feed and the count of pages that could have been in it.
 */
export type FeedItems = {
    /**
     * newest first, truncated to `limit`
     */
    items: FeedItem[];
    /**
     * pages that passed every filter but carried no usable date
     */
    undated: number;
};
/**
 * The feed's `<channel>`, as `renderRss` takes it.
 */
export type FeedChannel = {
    title: string;
    /**
     * the site's own URL
     */
    link: string;
    /**
     * `''` when the author gave none
     */
    description: string;
    /**
     * the absolute URL of the feed itself, for `atom:link rel="self"`
     */
    feedUrl: string;
};
