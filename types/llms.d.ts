/**
 * Resolves a `summary`/`notes` option: the contents of the file it names, or the
 * string itself. A `.md` file is used as it is — `llms.txt` is markdown.
 *
 * @param {unknown} value
 * @returns {Promise<string>} the resolved text, trailing whitespace trimmed
 */
export function resolveText(value: unknown): Promise<string>;
/**
 * The display name for one top-level path segment: an explicit mapping, else the
 * segment title-cased. The root group (a page with no `path`) is keyed `root`.
 *
 * @param {string} segment the sanitised first segment of a page's `path`, `''` for a root page
 * @param {Record<string, string>} [sections]
 * @returns {string}
 */
export function sectionNameFor(segment: string, sections?: Record<string, string>): string;
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
export function buildLlmsEntries(stack: {
    buildTo: string;
    page: {
        options: Record<string, any>;
    };
}[], { siteUrl, buildDir, sections }: {
    siteUrl: string;
    buildDir: string;
    sections?: Record<string, string>;
}): LlmsEntry[];
/**
 * Groups entries by section, first-seen order, with the root section first
 * wherever it appears — a reader meets the site's own top-level pages before its
 * subsections.
 *
 * @param {LlmsEntry[]} entries
 * @param {string} [rootSection] the display name the root group resolved to
 * @returns {LlmsGroup[]}
 */
export function groupLlmsEntries(entries: LlmsEntry[], rootSection?: string): LlmsGroup[];
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
export function renderLlmsTxt({ title, summary, groups, notes }: {
    title: string;
    summary: string;
    groups?: LlmsGroup[];
    notes?: string;
}): string;
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
export function writeLlms(stack: {
    buildTo: string;
    page: {
        options: Record<string, any>;
    };
}[], { config, logger, options, overwrite }: {
    config: any;
    logger: any;
    options?: Record<string, any>;
    overwrite?: boolean;
}): Promise<LlmsWriteResult>;
export type LlmsWriteResult = {
    status: "no-site-url" | "no-title" | "no-summary" | "skipped" | "written";
    /**
     * the rendered file, or `null` when nothing was written
     */
    text: string | null;
};
/**
 * One page as `llms.txt` lists it.
 */
export type LlmsEntry = {
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
     * the display name of the group it belongs to
     */
    section: string;
};
/**
 * One `##` section of the file: a display name and the pages under it.
 */
export type LlmsGroup = {
    name: string;
    entries: LlmsEntry[];
};
