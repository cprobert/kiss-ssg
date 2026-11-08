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
 * A log message with every file under the staging folder written as the
 * report writes it: each path is found in any spelling a writer can produce
 * (as `stagingSiblings` made it, `./docs.kiss-staging-…`; as `path.join`
 * writes it, `docs.kiss-staging-…`; absolute) and handed to `reportedPath`,
 * the one rule for a staged path, so the log and the report name a file the
 * same way (`./docs/x/y.html`). `\` is a separator only where it is one:
 * elsewhere it is a legal character in a file name, as `reportedPath` holds.
 * The folder named on its own is left alone, with or without a trailing
 * separator: a message about the staging folder itself ("could not remove …,
 * delete it by hand") has to name it. A match starts only where a path can
 * start, never partway through a longer one (`/elsewhere/docs.kiss-staging-…`),
 * and on Windows a path in another case is the same path.
 *
 * @param {string} text
 * @param {string} stagingDir
 * @param {string} buildDir
 * @returns {string}
 */
export function unstageText(text: string, stagingDir: string, buildDir: string): string;
/**
 * The logger a build writes through: the site's own, with the strings its
 * `success` and `info` lines are handed passed through `unstageText` while a
 * staging folder is active. Those are the "wrote this file" channels: each
 * writer logs the file it wrote (`sitemap.xml`, `_redirects`, the consent
 * files…), and under staging that is a folder with a random suffix that is
 * about to be renamed or deleted. Mapped here once, so a writer added later
 * cannot reintroduce it. `warn`, `error` and `debug` are left as they are:
 * they carry diagnostics (an `err.stack`, a file the staging folder could not
 * remove) whose real path is the one to act on.
 *
 * @template {object} L
 * @param {L} logger
 * @param {any} kiss
 * @returns {L}
 */
export function stagingLogger<L extends unknown>(logger: L, kiss: any): L;
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
