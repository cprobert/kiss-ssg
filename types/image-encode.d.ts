/**
 * @typedef {import('./images.js').ImageVariant & { source: string }} RequestedVariant
 */
/**
 * @typedef {Object} EncodeResult
 * @property {number} requested variants asked for
 * @property {string[]} encoded the cache names of the misses, encoded now
 * @property {number} cached hits, copied from the cache
 * @property {string[]} keys the cache name of every requested variant
 * @property {string[]} written absolute paths of every variant written to the build
 * @property {{ source: string, error: Error }[]} failures one per source that
 * could not be encoded
 * @property {boolean} cacheSkipped the cache could not be written, so none
 * of this build's misses were kept
 */
/** The cache's name for one variant: its full digest and its extension. */
export function cacheName(v: {
    digest: string;
    path: string;
}): string;
/**
 * Encode or copy every requested variant into the build at `root`.
 *
 * @param {Object} input
 * @param {RequestedVariant[]} input.variants
 * @param {string} input.root where the build is being written; each
 * variant's `source` is a path in it
 * @param {string|null} input.cache the cache folder, absolute, or `null` for none
 * @param {boolean} [input.refresh] ignore the cache's hits and encode
 * everything again (`kiss-ssg images --refresh`)
 * @param {number} [input.concurrency] sources decoded at once
 * @param {(message: string) => void} [input.warn]
 * @returns {Promise<EncodeResult>}
 */
export function encodeVariants({ variants, root, cache, refresh, concurrency, warn, }: {
    variants: RequestedVariant[];
    root: string;
    cache: string | null;
    refresh?: boolean;
    concurrency?: number;
    warn?: (message: string) => void;
}): Promise<EncodeResult>;
export type RequestedVariant = import("./images.js").ImageVariant & {
    source: string;
};
export type EncodeResult = {
    /**
     * variants asked for
     */
    requested: number;
    /**
     * the cache names of the misses, encoded now
     */
    encoded: string[];
    /**
     * hits, copied from the cache
     */
    cached: number;
    /**
     * the cache name of every requested variant
     */
    keys: string[];
    /**
     * absolute paths of every variant written to the build
     */
    written: string[];
    /**
     * one per source that
     * could not be encoded
     */
    failures: {
        source: string;
        error: Error;
    }[];
    /**
     * the cache could not be written, so none
     * of this build's misses were kept
     */
    cacheSkipped: boolean;
};
