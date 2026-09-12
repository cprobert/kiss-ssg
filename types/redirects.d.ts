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
export function canonicalPathFor(buildTo: string, buildDir: string): string;
/**
 * One alias as it will be written: a path with a leading `/` and nothing else
 * touched. The trailing-slash form is **preserved as written**, because
 * `/old/` and `/old` are two different source paths to a host and the author
 * is the one who knows which one used to be linked.
 *
 * @param {unknown} alias
 * @returns {string|null} the normalised path, or `null` for an empty one
 */
export function normaliseAlias(alias: unknown): string | null;
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
export function collectAliases(stack?: {
    buildTo: string;
    page: {
        options: Record<string, any>;
    };
}[], { buildDir }?: {
    buildDir?: string;
}): RedirectRule[];
/**
 * The `_redirects` file's text — the Netlify and Cloudflare Pages format, one
 * `<from> <to> 301` per line. Sorted here as well as in `collectAliases`, so
 * the bytes are the same whatever order the rules arrived in: two identical
 * builds must write an identical file or the site churns in git.
 *
 * @param {RedirectRule[]} rules
 * @returns {string} one line per rule, newline-terminated; `''` for no rules
 */
export function renderRedirects(rules?: RedirectRule[]): string;
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
export function coveredByAlias(rel: string, fromSet: Set<string>): boolean;
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
export function redirectFindings({ rules, currentPages, previousPages, buildDir, }?: {
    rules?: RedirectRule[];
    currentPages?: {
        buildTo: string;
        id?: string | null;
    }[];
    previousPages?: {
        buildDir?: string;
        pages?: {
            buildTo?: string;
            hash?: string | null;
            id?: string | null;
        }[];
    } | null;
    buildDir?: string;
}): RedirectFindings;
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
export function writeRedirects(stack: {
    buildTo: string;
    page: {
        options: Record<string, any>;
    };
}[], { config, logger, overwrite }: {
    config: any;
    logger: any;
    overwrite?: boolean;
}): Promise<RedirectWriteResult>;
/**
 * One line of `_redirects`: an old path, and the page that now answers it.
 */
export type RedirectRule = {
    /**
     * the old path, with a leading `/`, query and fragment removed
     */
    from: string;
    /**
     * the target page's canonical path — what `{{canonical}}` shows, origin stripped
     */
    to: string;
};
/**
 * The three advisory findings about what a rename left behind.
 */
export type RedirectFindings = {
    /**
     * sorted build-relative paths the last record had, this build does not, and no alias covers
     */
    removed: string[];
    /**
     * sorted alias paths a live page already answers, plus any alias two pages both claim
     */
    collisions: string[];
    /**
     * sorted by `from`; one page, paired by `id` across the two builds, whose build-relative path changed and whose old path no alias covers
     */
    moved: {
        id: string;
        from: string;
        to: string;
    }[];
};
export type RedirectWriteResult = {
    /**
     * `none` when no page has an alias
     */
    status: "none" | "skipped" | "written";
    /**
     * what the file says, or would have said
     */
    rules: RedirectRule[];
};
