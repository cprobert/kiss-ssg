export function defaultIdForView(view: any): string;
/**
 * The default identity of a page under `config.ids: 'path'`: where it is
 * served, as a key. `.html` is removed, because it is the extension the served
 * URL hides, and then a trailing `/index`, because a directory index is
 * served at its folder. Every other extension stays, so `about.html` and
 * `about.json` never compete for one id. The home page is `index`, as under
 * `'view'`, because an empty string is not an id. Not `utils.toURLKey`: that
 * removes any extension and reduces the home page to `''`.
 * @param {string} pageURL `KissPage.pageURL()`, build-relative
 * @returns {string}
 */
export function defaultIdForPath(pageURL: string): string;
export function explicitIdOf(options: any): string;
/**
 * Whether an explicit id was built from a slug as given rather than as
 * written: the slug `toSlug` changed (a trailing space, a leading `-`, a
 * capital), and the id ends in the unchanged one. The id is kept as written,
 * because a `{{link}}` built from the same data has to keep finding it, so
 * this only says that the two disagree, as the audit's `id-slug-mismatch`
 * (diploma-msc, 2026-11-05: seven Orchard slugs). An id that merely differs
 * from the slug says nothing: `id: 'home'` on `index` is a choice.
 * @param {string|null} id the explicit id, or `null` for a default one
 * @param {unknown} given `options.slug` as the page or its controller gave it
 * @param {string} written the slug the page was written under
 * @returns {string|null} the finding's detail, or `null`
 */
export function idSlugMismatch(id: string | null, given: unknown, written: string): string | null;
/**
 * @param {any} kiss
 * @param {any} options
 * @param {any} [origin]
 * @param {string|null} [idPrefix] given only by `_prepareMultiplePages`: what
 * this fan-out's items prefix their default ids with, in place of the view
 * route. Its presence is also what tells a fan-out item from a `.page()` page.
 * @param {string} [directory]
 * @param {number[]} [order] `[registration, item]`: the order the page was
 * registered in, which the stack does not keep (it fills in the order models
 * resolve). A learning package lists its pages by it (`lib/packages.js`).
 */
export function preparePage(kiss: any, options: any, origin?: any, idPrefix?: string | null, directory?: string, order?: number[]): {
    view: any;
    buildTo: string;
    page: KissPage;
    runCount: number;
    id: string;
    explicit: boolean;
    origin: any;
    order: number[];
};
export function idIndexFor(kiss: any): any;
/**
 * @param {any} kiss
 * @param {string} id
 * @returns {{ entry: any }|{ withdrawn: true, views: string[] }|null}
 */
export function lookupPage(kiss: any, id: string): {
    entry: any;
} | {
    withdrawn: true;
    views: string[];
} | null;
export function stackForRecord(kiss: any): any;
export function prepareMultiplePages(kiss: any, options: any, data: any, fresh: boolean, origin: any, directory?: string, registration?: number): Promise<void>;
/**
 * @param {any} kiss
 * @param {PageOptions} options
 * @param {string} directory
 */
export function registerPage(kiss: any, options: PageOptions, directory: string): void;
/**
 * @param {any} kiss
 * Queues every `.hbs` under `config.folders.pages` not already registered by
 * `view`, with default options. Repeated on every whole-site watch rebuild,
 * so page files added or deleted mid-session are picked up.
 *
 */
export function scanPages(kiss: any): void;
/**
 * @param {any} kiss
 * Logs the queued-promise and prepared-page counts, and — with
 * `verbose: true` — writes `debug.json` into the build folder: each page's
 * view, output path, run count and options, the options without `config`.
 *
 */
export function logViewStats(kiss: any): void;
export type PageOptions = import("./kiss.js").PageOptions;
import { KissPage } from './kiss-page.js';
