export function defaultIdForView(view: any): string;
export function explicitIdOf(options: any): string;
/**
 * @param {any} kiss
 * @param {any} options
 * @param {any} [origin]
 * @param {string|null} [idPrefix] given only by `_prepareMultiplePages`: what
 * this fan-out's items prefix their default ids with, in place of the view
 * route. Its presence is also what tells a fan-out item from a `.page()` page.
 */
export function preparePage(kiss: any, options: any, origin?: any, idPrefix?: string | null, directory?: string): {
    view: any;
    buildTo: string;
    page: KissPage;
    runCount: number;
    id: string;
    explicit: boolean;
    origin: any;
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
export function prepareMultiplePages(kiss: any, options: any, data: any, fresh: boolean, origin: any, directory?: string): Promise<void>;
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
 * `verbose: true` — writes `debug.json` into the build folder.
 *
 */
export function logViewStats(kiss: any): void;
export type PageOptions = import("./kiss.js").PageOptions;
import { KissPage } from './kiss-page.js';
