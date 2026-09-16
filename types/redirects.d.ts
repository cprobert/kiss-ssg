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
 * @property {string[]} removed sorted **served** paths the last record had, this build does not, and no alias covers — the URLs a browser asked for (`/about.html`, `/courses/`, `/`)
 * @property {string[]} collisions sorted alias paths a live page already answers, plus any alias two pages both claim
 * @property {{ id: string, from: string, to: string }[]} moved sorted by `from`; one page, paired by `id` across the two builds, whose path changed and whose old path no alias covers — `from` and `to` are served paths, like `removed`
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
 * @param {Object} [options]
 * @param {boolean} [options.trailingSlash] `config.links.trailingSlash`
 * @returns {string} the origin-less canonical path, always starting with `/`
 */
export function canonicalPathFor(buildTo: string, buildDir: string, { trailingSlash }?: {
    trailingSlash?: boolean;
}): string;
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
 * @param {boolean} [context.trailingSlash] `config.links.trailingSlash`: keep a directory index's trailing `/` in the emitted URL
 * @returns {RedirectRule[]} sorted by `from`, then `to`
 */
export function collectAliases(stack?: {
    buildTo: string;
    page: {
        options: Record<string, any>;
    };
}[], { buildDir, trailingSlash }?: {
    buildDir?: string;
    trailingSlash?: boolean;
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
 * The host-neutral intermediate representation, and the point of the whole
 * block: the rules as data, in the one file every format is derived from.
 *
 * `aliases` is a fact about the site ("this page used to answer `/old`"), and
 * that fact is portable. `_redirects` is not — it is one vendor's encoding of
 * it, and a site on Firebase or Vercel that got only that file got nothing it
 * could use while the report cheerfully said the redirects were written. So
 * the IR is written whatever `format` says, including `'none'`: a build always
 * leaves the list behind in a form the site can read, and `report().redirects.rules`
 * carries the same array for a script that would rather not touch the disk.
 *
 * `version` is there so a consumer can branch on the shape rather than guess
 * it.
 *
 * **`status` is always `301`, and nothing can change it.** It is written out
 * rather than left implicit so a consumer building a Vercel or nginx rule has
 * the code in the data instead of hardcoding it at the other end — that is the
 * whole of its job today. It is per-rule rather than per-file because that is
 * where a `302`, a `308` or a `410` would have to live if the surface ever
 * grew one, but `aliases` is a bare array of path strings and there is no way
 * to say anything but "permanently moved". Do not read this field as evidence
 * that mixed statuses work; they do not, and a reader who assumes otherwise
 * will ship a `301` where they meant a `302`.
 *
 * @param {RedirectRule[]} rules
 * @returns {string} pretty-printed JSON, newline-terminated
 */
export function renderRedirectsJson(rules?: RedirectRule[]): string;
/**
 * The Firebase Hosting encoding, as a **fragment to merge** — the `redirects`
 * array alone, not a `firebase.json`.
 *
 * Firebase does not read `_redirects` at all; it takes redirects from a
 * `redirects` array in `firebase.json`. That file also holds hosting targets,
 * headers, rewrites and often years of hand-maintained history — one real site
 * carries 227 redirects in it — so kiss emits the array it can vouch for and
 * the site merges it on its own terms. A build step that rewrote
 * `firebase.json` would be a build step that can lose a site's deploy config.
 *
 * @param {RedirectRule[]} rules
 * @returns {string} pretty-printed JSON, newline-terminated
 */
export function renderFirebaseRedirects(rules?: RedirectRule[]): string;
/**
 * The Vercel encoding, as a fragment to merge into `vercel.json`'s `redirects`
 * array — same reasoning as Firebase's. `permanent: true` is Vercel's spelling
 * of a 308; it is the permanent redirect that platform offers, and the closest
 * honest equivalent of the `301` every other format here writes.
 *
 * @param {RedirectRule[]} rules
 * @returns {string} pretty-printed JSON, newline-terminated
 */
export function renderVercelRedirects(rules?: RedirectRule[]): string;
/**
 * The Apache encoding, as a **fragment to include** — `Redirect` directives
 * alone, never a `.htaccess`.
 *
 * Same ownership rule as the Firebase and Vercel fragments, for a sharper
 * reason: a real `.htaccess` carries authentication, rewrite rules, caching
 * headers and error documents, and it is the *live* server config rather than
 * a deploy manifest. kiss writes `redirects.htaccess` for the site to
 * `Include` or concatenate, and never touches the file Apache actually reads.
 *
 * `Redirect` (mod_alias), not `RewriteRule`: the source is a literal path, and
 * a directive whose left-hand side is a regex would turn a `.` or a `+` in an
 * alias into a pattern. The alias `/a.b` must redirect `/a.b` and nothing else.
 *
 * @param {RedirectRule[]} rules
 * @returns {string} one directive per line, sorted, newline-terminated
 */
export function renderHtaccessRedirects(rules?: RedirectRule[]): string;
/**
 * Every host encoding this build should emit, as a list.
 *
 * The IR is the baseline and is written whatever this returns, including for
 * an empty list — `redirects.json` is the portable fact and `format` only ever
 * says which *vendor encodings* to put beside it. So the list is allowed to be
 * empty and that is the default: a site states its hosts, rather than
 * inheriting one.
 *
 * A list rather than a single value because a site can legitimately deploy to
 * more than one host — Netlify previews and Firebase production is a real
 * shape — and picking one at build time would mean building twice. A bare
 * string and a bare function are each a list of one, the way `aliases` takes
 * either. `'none'` is kept as a readable spelling of `[]` and is dropped from
 * the list rather than dispatched, which is why `HOST_FORMATS` has no row for
 * it.
 *
 * Duplicates collapse: two entries naming one format would render the same
 * file twice, and the second write would be the one on disk.
 *
 * @param {*} format `config.redirects.format`
 * @returns {(string|Function)[]} the encodings to emit, in order, each either a
 * `HOST_FORMATS` key or a writer function
 */
export function resolveRedirectFormats(format: any): (string | Function)[];
/**
 * What a custom writer asked for, normalised: always a list, always with a
 * string `file` and string `contents`. A writer that returns nothing writes
 * nothing, which is a legitimate answer (it may have posted the rules
 * somewhere itself).
 *
 * An absolute path, or one climbing out of the build folder with `..`, is
 * refused rather than resolved: a redirect writer is site code running in a
 * build, and "write any file on this machine" is not the capability it asked
 * for.
 *
 * @param {*} returned what the writer returned
 * @param {string} buildDir
 * @returns {{ file: string, contents: string }[]}
 */
export function normaliseWriterOutput(returned: any, buildDir: string): {
    file: string;
    contents: string;
}[];
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
 * It takes the **file** path. An alias covers it in either the canonical or the
 * served spelling, so the alias a notice recommends always silences the finding
 * that recommended it.
 *
 * @param {string} rel the old page's build-relative path (`/old-post.html`)
 * @param {Set<string>} fromSet every `from` this build's rules declare
 * @returns {boolean}
 */
export function coveredByAlias(rel: string, fromSet: Set<string>, { trailingSlash }?: {
    trailingSlash?: boolean;
}): boolean;
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
 * @param {boolean} [context.trailingSlash] `config.links.trailingSlash`, so a
 * finding names the URL this site actually serves
 * @returns {RedirectFindings}
 */
export function redirectFindings({ rules, currentPages, previousPages, buildDir, trailingSlash, }?: {
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
    trailingSlash?: boolean;
}): RedirectFindings;
/**
 * @typedef {Object} RedirectWriteResult
 * @property {'none'|'skipped'|'written'} status `none` when no page has an alias
 * @property {RedirectRule[]} rules what the file says, or would have said
 * @property {string[]} files every path written, build-folder-relative paths made absolute, in write order — `redirects.json` first, then one per format
 * @property {string[]} formats the formats that ran, in order: built-in names, and `'custom'` for each writer function; `[]` when only the IR was written
 * @property {boolean} unset whether this build has aliases, emitted no host file, and never chose — the upgrade case worth one notice
 */
/**
 * Writes the redirects. The one impure function here.
 *
 * Two files at most: `redirects.json` (the host-neutral IR, always) and the one
 * `config.redirects.format` names (`_redirects` by default). A custom writer
 * replaces the second with whatever it returns, and still gets the first — the
 * IR is the contract, not a side effect of the Netlify format.
 *
 * A site with no aliases writes **nothing** — not an empty file, not an empty
 * IR — so a `_redirects` a project keeps in `src/assets/` and copies into the
 * build is left exactly as it was. kiss only ever writes these files when it
 * has rules of its own to put in them; it never merges, and it never deletes.
 *
 * @param {{ buildTo: string, page: { options: Record<string, any> } }[]} stack
 * @param {Object} deps
 * @param {any} deps.config the resolved config — `folders.build`, `links.trailingSlash`, `redirects.format`
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
export const HOST_FORMATS: Readonly<{
    netlify: {
        file: string;
        render: typeof renderRedirects;
    };
    firebase: {
        file: string;
        render: typeof renderFirebaseRedirects;
    };
    vercel: {
        file: string;
        render: typeof renderVercelRedirects;
    };
    htaccess: {
        file: string;
        render: typeof renderHtaccessRedirects;
    };
}>;
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
     * sorted **served** paths the last record had, this build does not, and no alias covers — the URLs a browser asked for (`/about.html`, `/courses/`, `/`)
     */
    removed: string[];
    /**
     * sorted alias paths a live page already answers, plus any alias two pages both claim
     */
    collisions: string[];
    /**
     * sorted by `from`; one page, paired by `id` across the two builds, whose path changed and whose old path no alias covers — `from` and `to` are served paths, like `removed`
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
    /**
     * every path written, build-folder-relative paths made absolute, in write order — `redirects.json` first, then one per format
     */
    files: string[];
    /**
     * the formats that ran, in order: built-in names, and `'custom'` for each writer function; `[]` when only the IR was written
     */
    formats: string[];
    /**
     * whether this build has aliases, emitted no host file, and never chose — the upgrade case worth one notice
     */
    unset: boolean;
};
