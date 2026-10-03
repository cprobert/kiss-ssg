/**
 * The staging and renamed-aside siblings of one build. One suffix for both,
 * so a leftover pair is recognisably one crashed run rather than two unrelated
 * ones; the pid in it is what `sweepStaleSiblings` tells a live build by.
 *
 * @param {string} target the build folder the author named
 * @returns {{ stagingDir: string, oldDir: string }}
 */
export function stagingSiblings(target: string): {
    stagingDir: string;
    oldDir: string;
};
/**
 * The folder this build WRITES into: the staging sibling while one is active,
 * the author's folder otherwise.
 *
 * @param {any} kiss
 * @returns {string}
 */
export function writeRoot(kiss: any): string;
/**
 * `config` as a writer module (sitemap, llms, feed, redirects, robots) should
 * see it: `folders.build` is the write root. The same object as `config` when
 * nothing is staged, so the ordinary build allocates nothing.
 *
 * @param {any} kiss
 * @returns {any}
 */
export function writeConfig(kiss: any): any;
/**
 * @param {any} kiss
 */
export function sweepStaleSiblings(kiss: any): void;
/**
 * @param {any} kiss
 * @param {string} target
 * @returns {string}
 */
export function stagedPath(kiss: any, target: string): string;
/**
 * @param {any} kiss
 * @param {any} target
 * @returns {any}
 */
export function toReportedPath(kiss: any, target: any): any;
/**
 * @param {string} from
 * @param {string} to
 * @param {string} folder the build folder the operator named, for the message
 */
export function renameForPromote(from: string, to: string, folder: string): Promise<void>;
/**
 * @param {any} kiss
 * @param {string} old
 * @param {string} target
 */
export function restorePrevious(kiss: any, old: string, target: string): Promise<void>;
/**
 * @param {any} kiss
 */
export function promote(kiss: any): Promise<void>;
/**
 * @param {any} kiss
 * @param {string} staging
 * @param {string} target
 */
export function swapIn(kiss: any, staging: string, target: string): Promise<void>;
/**
 * @param {any} kiss
 */
export function discardStaging(kiss: any): Promise<void>;
/**
 * @param {any} kiss
 * @param {string} staging
 */
export function abandonStaging(kiss: any, staging: string): Promise<void>;
/**
 * @param {any} kiss
 * @param {string} staging
 * @param {string} which the adjective the warning uses for the folder
 */
export function removeStaging(kiss: any, staging: string, which: string): Promise<void>;
