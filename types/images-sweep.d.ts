/**
 * What `kiss-ssg images` asked a build to do, from its environment.
 *
 * @param {Record<string, string|undefined>} [env]
 * @returns {{ file: string, refresh: boolean }|null} `null` for any other build
 */
export function sweepRequest(env?: Record<string, string | undefined>): {
    file: string;
    refresh: boolean;
} | null;
/**
 * One instance's line in the sweep file.
 *
 * @typedef {Object} SweepLine
 * @property {string|null} cache the cache folder, absolute, or `null` for none
 * @property {string[]} keys every cache entry its pages asked for
 * @property {string[]} encoded the entries it encoded now (the misses)
 * @property {string|null} assets its assets folder, absolute: the one folder
 * the sweep looks in for originals to fix
 * @property {string[]} copies every folder it copies into the build
 * (`.copyAssets()` included), absolute: never scanned for rewrites, but a
 * photo in one keeps the width this instance needs
 * @property {number} maxWidth the recipe's largest width
 * @property {boolean} failed some variant could not be encoded
 * @property {boolean} cacheSkipped the cache could not be written, so this
 * instance's misses were not kept: a build warns and carries on, the sweep
 * refuses
 */
/**
 * @param {Object} input
 * @param {string|null} input.cache
 * @param {string[]} input.keys
 * @param {string[]} input.encoded
 * @param {string|null} input.assets
 * @param {string[]} [input.copies]
 * @param {number} input.maxWidth
 * @param {boolean} [input.failed]
 * @param {boolean} [input.cacheSkipped]
 * @returns {SweepLine}
 */
export function sweepLine({ cache, keys, encoded, assets, copies, maxWidth, failed, cacheSkipped, }: {
    cache: string | null;
    keys: string[];
    encoded: string[];
    assets: string | null;
    copies?: string[];
    maxWidth: number;
    failed?: boolean;
    cacheSkipped?: boolean;
}): SweepLine;
/**
 * @param {string[]} [argv] everything after `images`
 * @returns {{ script: string|null, args: string[], refresh: boolean, write: boolean, help: boolean, error: string|null }}
 */
export function parseImagesArgs(argv?: string[]): {
    script: string | null;
    args: string[];
    refresh: boolean;
    write: boolean;
    help: boolean;
    error: string | null;
};
/**
 * The sweep file's lines.
 *
 * @param {string} text
 * @returns {SweepLine[]}
 */
export function readSweepLines(text?: string): SweepLine[];
/**
 * @typedef {{ count: number, bytes: number }} Tally
 */
/**
 * Remove every entry of one cache folder that is not kept, and count. A
 * file not named like a cache entry is neither removed nor counted.
 *
 * @param {Object} input
 * @param {string} input.dir
 * @param {Set<string>} input.keep the entries some page asked for
 * @param {Set<string>} input.encoded the entries this run added
 * @param {boolean} [input.dryRun] count, remove nothing
 * @returns {{ added: Tally, removed: Tally, kept: Tally }}
 */
export function pruneCache({ dir, keep, encoded, dryRun }: {
    dir: string;
    keep: Set<string>;
    encoded: Set<string>;
    dryRun?: boolean;
}): {
    added: Tally;
    removed: Tally;
    kept: Tally;
};
/**
 * @typedef {Object} Original
 * @property {string} file absolute
 * @property {string} format
 * @property {number} width as displayed
 * @property {boolean} gps
 * @property {boolean} wide wider than the recipe's largest width
 */
/**
 * The rasters under `dir` that carry a GPS location or are wider than
 * `maxWidth`, from their headers alone.
 *
 * @param {{ dir: string, maxWidth: number }} input
 * @returns {Original[]} by path
 */
export function findOriginals({ dir, maxWidth }: {
    dir: string;
    maxWidth: number;
}): Original[];
/**
 * Rewrite the originals: `autoOrient()`, metadata stripped (`sharp`'s
 * default), resized down to `maxWidth`, JPEG at quality 90, PNG losslessly,
 * WebP at 90 and AVIF at 75. A file is replaced only when the result is
 * smaller, or when it had GPS.
 *
 * @param {Original[]} originals
 * @param {number} maxWidth
 * @returns {Promise<{ file: string, before: number, after: number, replaced: boolean }[]>}
 */
export function rewriteOriginals(originals: Original[], maxWidth: number): Promise<{
    file: string;
    before: number;
    after: number;
    replaced: boolean;
}[]>;
/**
 * The whole sweep, once the build has run: prune each cache against every
 * line that names it, list the originals, and rewrite them under `write`.
 *
 * @param {Object} input
 * @param {SweepLine[]} input.lines
 * @param {{ ok?: boolean }[]} input.reports the run's build reports
 * @param {{ status: number|null, signal?: string|null, error?: Error|null }} [input.script]
 * how the site's script itself ended. A script that settled one instance and
 * then threw has written only passing reports, so its exit decides too.
 * @param {boolean} [input.write]
 * @param {string} [input.cwd] what paths are printed relative to
 * @returns {Promise<{ out: string, err: string, code: 0|1, rerun: boolean }>}
 * `rerun` is true when an original was rewritten: its digest changed, so the
 * cache this pass left holds its old variants and lacks its new ones, and the
 * caller runs the build and this sweep once more, without `write`.
 */
export function sweepImages({ lines, reports, script, write, cwd, }: {
    lines: SweepLine[];
    reports: {
        ok?: boolean;
    }[];
    script?: {
        status: number | null;
        signal?: string | null;
        error?: Error | null;
    };
    write?: boolean;
    cwd?: string;
}): Promise<{
    out: string;
    err: string;
    code: 0 | 1;
    rerun: boolean;
}>;
export const IMAGES_HELP: "kiss-ssg images <script> [--refresh] [--write] [-- args\u2026]\n\nRuns the site's build script staged and then discarded, as check does, so\nit knows exactly which image variants the pages ask for. It encodes every\nvariant missing from the encode cache (assets.images.cache, by default\n.kiss-cache/images, committed by the site) and removes cache entries no page\nasked for. It prints how many entries were added, removed and kept, and\ntheir bytes. Commit the cache afterwards.\n\nIt also lists each original under folders.assets that carries a GPS\nlocation in its metadata, or is wider than the recipe's largest width.\n\n  --refresh   encode every variant again, ignoring the cache\n  --write     rewrite those originals in place: turned the right way up,\n              metadata stripped, resized down to the largest width. A JPEG\n              is re-encoded at quality 90 and a PNG losslessly; a file is\n              replaced only when the result is smaller or it had GPS. Read\n              the diff in git before committing it.\n  --help      this text\n\nNothing in src/ changes without --write. Exits 1 if any site failed to\nbuild, in which case the cache is not pruned.";
/**
 * One instance's line in the sweep file.
 */
export type SweepLine = {
    /**
     * the cache folder, absolute, or `null` for none
     */
    cache: string | null;
    /**
     * every cache entry its pages asked for
     */
    keys: string[];
    /**
     * the entries it encoded now (the misses)
     */
    encoded: string[];
    /**
     * its assets folder, absolute: the one folder
     * the sweep looks in for originals to fix
     */
    assets: string | null;
    /**
     * every folder it copies into the build
     * (`.copyAssets()` included), absolute: never scanned for rewrites, but a
     * photo in one keeps the width this instance needs
     */
    copies: string[];
    /**
     * the recipe's largest width
     */
    maxWidth: number;
    /**
     * some variant could not be encoded
     */
    failed: boolean;
    /**
     * the cache could not be written, so this
     * instance's misses were not kept: a build warns and carries on, the sweep
     * refuses
     */
    cacheSkipped: boolean;
};
export type Tally = {
    count: number;
    bytes: number;
};
export type Original = {
    /**
     * absolute
     */
    file: string;
    format: string;
    /**
     * as displayed
     */
    width: number;
    gps: boolean;
    /**
     * wider than the recipe's largest width
     */
    wide: boolean;
};
