/**
 * `assets.images` as given, checked and filled in from the defaults one level
 * deep (`quality` merges per format).
 *
 * @param {*} images
 * @returns {KissImages}
 * @throws on a shape it cannot use, naming the key
 */
export function resolveImages(images: any): KissImages;
/**
 * The widths one source is served at: every configured width narrower than
 * it, plus its own width when that falls between steps or below the
 * smallest. Never wider than the source: kiss does not enlarge an image.
 *
 * @param {number} sourceWidth as displayed
 * @param {readonly number[]} widths ascending
 * @returns {number[]} ascending
 */
export function variantWidths(sourceWidth: number, widths: readonly number[]): number[];
/** The format the `<img>` falls back to: PNG keeps PNG, the rest JPEG. */
export function fallbackFormat(sourceFormat: string): "jpeg" | "png";
/**
 * The recipe one variant is made by, as the string its digest is taken over
 * with the source's: format, width and quality, and the version of kiss's
 * own pipeline (orient, resize, strip), which moves only when that changes.
 *
 * @param {{ format: string, width: number, quality: number|null }} recipe
 * @returns {string}
 */
export function recipeString({ format, width, quality }: {
    format: string;
    width: number;
    quality: number | null;
}): string;
/**
 * A variant's build-relative name: `img/hero.jpg` at 960 in AVIF is
 * `img/hero-960.<hash>.avif`, the hash where `hashedName` puts it. Content
 * named whatever `assets.hash` and `assets.version` say, since an image's
 * URL is only ever written by `{{image}}`.
 *
 * @param {string} emitted the source's build-relative path
 * @param {number} width
 * @param {string} format
 * @param {string} hash `HASH_LENGTH` hex characters
 * @returns {string}
 */
export function variantName(emitted: string, width: number, format: string, hash: string): string;
/**
 * The SHA-256 of a file's bytes, memoised by path, modification time and
 * size: the copied build file, never `src/`, so the name follows what ships.
 *
 * @param {string} file
 * @returns {string} hex
 */
export function fileDigest(file: string): string;
/**
 * Every variant one source is served as.
 *
 * @param {Object} input
 * @param {string} input.emitted the source's build-relative path
 * @param {{ format: string, width: number, height: number }} input.header
 * @param {string} input.digest `fileDigest` of the copied file
 * @param {KissImages} input.images
 * @returns {ImagePlan}
 */
export function planImage({ emitted, header, digest, images }: {
    emitted: string;
    header: {
        format: string;
        width: number;
        height: number;
    };
    digest: string;
    images: KissImages;
}): ImagePlan;
/** @param {unknown} value */
export function escapeAttribute(value: unknown): string;
/**
 * A `{{image}}` call's hash arguments, checked.
 *
 * @param {Record<string, unknown>} hash
 * @returns {{ alt: string|null, sizes: string|null, eager: boolean, root: string, attrs: [string, unknown][], problems: string[] }}
 * `problems` is empty for a call that can be served; `alt` and `sizes` are
 * `null` when missing
 */
export function imageArguments(hash?: Record<string, unknown>): {
    alt: string | null;
    sizes: string | null;
    eager: boolean;
    root: string;
    attrs: [string, unknown][];
    problems: string[];
};
/**
 * The `<picture>` for one plan: a `<source>` per format and the `<img>`,
 * every one carrying the same `sizes` (`auto, …` when lazy). Eager writes
 * `fetchpriority="high"` and no `loading`.
 *
 * @param {ImagePlan} plan
 * @param {{ alt: string, sizes: string, eager: boolean, root: string, attrs: [string, unknown][] }} options
 * @returns {string}
 */
export function pictureHtml(plan: ImagePlan, { alt, sizes, eager, root, attrs }: {
    alt: string;
    sizes: string;
    eager: boolean;
    root: string;
    attrs: [string, unknown][];
}): string;
/**
 * The plain `<img>` dev writes: the copied original at its own size, with
 * the loading attributes the build would write, and nothing encoded.
 *
 * @param {{ emitted: string, width: number|null, height: number|null }} source
 * @param {{ alt: string|null, eager: boolean, root: string, attrs: [string, unknown][] }} options
 * @returns {string}
 */
export function plainImgHtml({ emitted, width, height }: {
    emitted: string;
    width: number | null;
    height: number | null;
}, { alt, eager, root, attrs }: {
    alt: string | null;
    eager: boolean;
    root: string;
    attrs: [string, unknown][];
}): string;
/**
 * What this build's `{{image}}` calls asked for: every variant by its path,
 * and the pages that asked for each source. One per instance, reset when a
 * replay starts a new build. Whatever encodes the variants reads it.
 */
export function createImageIndex(): {
    /**
     * @param {string} source the source's build-relative path
     * @param {string|null} page the asking page's URL
     * @param {ImageVariant[]} list
     */
    record(source: string, page: string | null, list: ImageVariant[]): void;
    /** @returns {(ImageVariant & { source: string })[]} by path */
    variants(): (ImageVariant & {
        source: string;
    })[];
    /** @param {string} source @returns {string[]} the pages that asked for it */
    pagesUsing(source: string): string[];
    reset(): void;
};
/**
 * `config.assets.images`, resolved.
 *
 * @typedef {Object} KissImages
 * @property {number[]} widths the variant widths, ascending (default `[480,
 * 768, 960, 1440, 1920]`)
 * @property {('avif'|'webp')[]} formats the `<source>` formats, in the order
 * they are offered (default `['avif', 'webp']`)
 * @property {{ avif: number, webp: number, jpeg: number }} quality 1–100 per
 * format (default AVIF 50, WebP 75, JPEG 80)
 * @property {string|false} cache the encode cache, relative to the folder the
 * build runs from (default `.kiss-cache/images`), committed by the site; a
 * hit is a copy. `false` keeps none, so every build encodes everything
 */
/**
 * One file a `{{image}}` call names.
 *
 * @typedef {Object} ImageVariant
 * @property {string} path build-relative: `img/hero-960.a1b2c3d4.avif`
 * @property {'avif'|'webp'|'jpeg'|'png'} format
 * @property {number} width
 * @property {number} height
 * @property {number|null} quality `null` for PNG, which is lossless
 * @property {string} digest the full digest the name's hash is cut from: the
 * source's bytes plus the recipe
 */
/**
 * What one `{{image}}` call serves.
 *
 * @typedef {Object} ImagePlan
 * @property {{ format: string, type: string, variants: ImageVariant[] }[]} sources
 * one per `<source>`, in `formats` order
 * @property {ImageVariant[]} fallback the `<img>`'s own `srcset`, in the
 * source's format (JPEG for a WebP or AVIF source)
 * @property {ImageVariant} src the fallback's middle width
 * @property {number} width the largest variant's width, the `<img>`'s
 * @property {number} height the largest variant's height
 */
export const DEFAULT_IMAGES: Readonly<{
    widths: readonly number[];
    formats: readonly ["avif", "webp"];
    quality: Readonly<{
        avif: 50;
        webp: 75;
        jpeg: 80;
    }>;
    cache: ".kiss-cache/images";
}>;
export const IMAGE_OWN_ATTRIBUTES: readonly string[];
/**
 * `config.assets.images`, resolved.
 */
export type KissImages = {
    /**
     * the variant widths, ascending (default `[480,
     * 768, 960, 1440, 1920]`)
     */
    widths: number[];
    /**
     * the `<source>` formats, in the order
     * they are offered (default `['avif', 'webp']`)
     */
    formats: ("avif" | "webp")[];
    /**
     * 1–100 per
     * format (default AVIF 50, WebP 75, JPEG 80)
     */
    quality: {
        avif: number;
        webp: number;
        jpeg: number;
    };
    /**
     * the encode cache, relative to the folder the
     * build runs from (default `.kiss-cache/images`), committed by the site; a
     * hit is a copy. `false` keeps none, so every build encodes everything
     */
    cache: string | false;
};
/**
 * One file a `{{image}}` call names.
 */
export type ImageVariant = {
    /**
     * build-relative: `img/hero-960.a1b2c3d4.avif`
     */
    path: string;
    format: "avif" | "webp" | "jpeg" | "png";
    width: number;
    height: number;
    /**
     * `null` for PNG, which is lossless
     */
    quality: number | null;
    /**
     * the full digest the name's hash is cut from: the
     * source's bytes plus the recipe
     */
    digest: string;
};
/**
 * What one `{{image}}` call serves.
 */
export type ImagePlan = {
    /**
     * one per `<source>`, in `formats` order
     */
    sources: {
        format: string;
        type: string;
        variants: ImageVariant[];
    }[];
    /**
     * the `<img>`'s own `srcset`, in the
     * source's format (JPEG for a WebP or AVIF source)
     */
    fallback: ImageVariant[];
    /**
     * the fallback's middle width
     */
    src: ImageVariant;
    /**
     * the largest variant's width, the `<img>`'s
     */
    width: number;
    /**
     * the largest variant's height
     */
    height: number;
};
