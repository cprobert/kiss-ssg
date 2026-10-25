/**
 * The references in a stylesheet: each `@import` and each `url()`, in
 * document order, once each.
 *
 * @param {string} css
 * @returns {string[]}
 */
export function extractCssReferences(css: string): string[];
/**
 * The references in a page, split by what they are. `needs` are the files the
 * page needs to display (`src`, `srcset`, `poster`, `object[data]`, SVG
 * `use`/`image`, the stylesheets, icons and preloads of `<link>`, and every
 * `url()` and `@import` in a `<style>` element or a `style` attribute);
 * `anchors` are where it links (`<a href>`, `<area href>`). Anything else, a
 * form's `action` or a script's own imports among them, is neither. Each list
 * is in document order, once each.
 *
 * @param {string} html
 * @returns {{ needs: string[], anchors: string[], base: string | null }} `base`
 * is the first `<base href>`, against which a browser resolves every relative reference
 */
export function extractReferences(html: string): {
    needs: string[];
    anchors: string[];
    base: string | null;
};
/**
 * The build-relative file a page's references resolve from, given its
 * `<base href>`: a file in the folder the base names, resolved as a URL
 * resolves it (`../assets/` and `../assets/start.html` name `assets/`; `..`
 * and `.` name a folder too, with no slash). `from` itself for an empty base;
 * null for an absolute or root-relative base, which names nothing in the build.
 *
 * @param {string} base the `<base href>`
 * @param {string} from the page, build-relative
 * @returns {string | null}
 */
export function documentBase(base: string, from: string): string | null;
/**
 * Where a reference made by the build-relative file `from` points.
 *
 * - `{ kind: 'skip' }`: nothing to follow or report (an empty value, a
 *   `#fragment`, a protocol-relative URL, or a scheme such as `https:`,
 *   `mailto:` or `data:` that is not this site).
 * - `{ kind: 'outside', reason }`: root-relative, above the build folder, a
 *   folder, or an absolute URL to this site (`siteOrigin`).
 * - `{ kind: 'path', rel }`: the build-relative path it names, `?query` and
 *   `#fragment` dropped and percent-escapes decoded.
 *
 * @param {string} ref
 * @param {string} from
 * @param {{ siteOrigin?: string | null }} [options]
 * @returns {{ kind: 'skip' } | { kind: 'outside', reason: string } | { kind: 'path', rel: string }}
 */
export function resolveReference(ref: string, from: string, { siteOrigin }?: {
    siteOrigin?: string | null;
}): {
    kind: "skip";
} | {
    kind: "outside";
    reason: string;
} | {
    kind: "path";
    rel: string;
};
/**
 * The deepest folder that holds every one of the build-relative `paths`: `''`
 * for the build folder itself.
 *
 * @param {string[]} paths
 * @returns {string}
 */
export function commonRoot(paths: string[]): string;
/**
 * The pages of each package, in registration order, packages by id. A page is
 * a member when its `package` option is a string and it is written
 * (`generate` is not `false`).
 *
 * @param {any[]} stack stack entries, each with `page.options` and `order`
 * @returns {Map<string, any[]>}
 */
export function packageMembers(stack: any[]): Map<string, any[]>;
/**
 * Works out and writes every learning package of a settled build: one zip per
 * package and format, into `config.packages.dir`. Nothing is written unless
 * every package can be: a member page with no usable `id`, one that was not
 * written, or a file named `imsmanifest.xml` at a package's root is a failure,
 * returned rather than thrown.
 *
 * @param {any[]} stack the projected stack (`stackForRecord`): each entry's `id` is `null` where it is not usable
 * @param {object} context
 * @param {KissPackages} context.packages
 * @param {string | null} [context.siteUrl]
 * @param {string} context.writeRoot the folder the build writes into (staging under `'atomic'` and check)
 * @param {(file: string) => boolean} context.written whether this build wrote a file (an absolute path)
 * @param {{ claim?: (file: string, owner: string, kind: any) => void } | null} [context.outputs]
 * @param {{ notice: (message: string) => void }} context.logger
 * @returns {Promise<{ packages: PackageResult[] | null, failures: string[] }>}
 */
export function writePackages(stack: any[], { packages: settings, siteUrl, writeRoot, written, outputs, logger, }: {
    packages: KissPackages;
    siteUrl?: string | null;
    writeRoot: string;
    written: (file: string) => boolean;
    outputs?: {
        claim?: (file: string, owner: string, kind: any) => void;
    } | null;
    logger: {
        notice: (message: string) => void;
    };
}): Promise<{
    packages: PackageResult[] | null;
    failures: string[];
}>;
/**
 * The settings of `config.packages`, resolved.
 *
 * @typedef {object} KissPackages
 * @property {'imscp' | 'scorm12' | Array<'imscp' | 'scorm12'>} format the format of each package, or several to write each package in each
 * @property {string} dir the build-relative folder the zips are written to
 * @property {((id: string, pages: PackagePageInfo[]) => string) | null} title a package's title; the first page's `title` when `null`
 * @property {string[] | null} only the package ids to write; every package when `null`
 * @property {boolean} schemas put the SCORM 1.2 schema files (`lib/schemas/scorm12`) in each SCORM 1.2 package, named in its manifest
 */
/**
 * What `config.packages.title` is given about each page of a package.
 *
 * @typedef {object} PackagePageInfo
 * @property {string} id
 * @property {string} title
 * @property {Record<string, any>} options the page's options
 * @property {any} model the page's resolved model
 */
/**
 * A reference a package cannot carry, and why.
 *
 * @typedef {object} PackageOutside
 * @property {string} page the file holding the reference, as written (a staging path under `'atomic'` and check)
 * @property {string} href the reference as the file wrote it
 * @property {string} reason `<what>: <why an LMS cannot follow it>`
 */
/**
 * One package written in one format.
 *
 * @typedef {object} PackageResult
 * @property {string} id
 * @property {'imscp' | 'scorm12'} format
 * @property {string} file the zip, as written
 * @property {string} title
 * @property {string} hash sha1 of the zip's bytes, which depend only on its files (`lib/zip.js`)
 * @property {string[]} pages the member pages, in the order the table of contents lists them, as written
 * @property {number} files the entries in the zip, `imsmanifest.xml` included
 * @property {number} bytes the zip's size, for an LMS's upload limit
 * @property {PackageOutside[]} outside sorted by page, then href
 */
/** A package id: lower-case letters, digits and single hyphens. */
export const PACKAGE_ID: RegExp;
/**
 * The settings of `config.packages`, resolved.
 */
export type KissPackages = {
    /**
     * the format of each package, or several to write each package in each
     */
    format: "imscp" | "scorm12" | Array<"imscp" | "scorm12">;
    /**
     * the build-relative folder the zips are written to
     */
    dir: string;
    /**
     * a package's title; the first page's `title` when `null`
     */
    title: ((id: string, pages: PackagePageInfo[]) => string) | null;
    /**
     * the package ids to write; every package when `null`
     */
    only: string[] | null;
    /**
     * put the SCORM 1.2 schema files (`lib/schemas/scorm12`) in each SCORM 1.2 package, named in its manifest
     */
    schemas: boolean;
};
/**
 * What `config.packages.title` is given about each page of a package.
 */
export type PackagePageInfo = {
    id: string;
    title: string;
    /**
     * the page's options
     */
    options: Record<string, any>;
    /**
     * the page's resolved model
     */
    model: any;
};
/**
 * A reference a package cannot carry, and why.
 */
export type PackageOutside = {
    /**
     * the file holding the reference, as written (a staging path under `'atomic'` and check)
     */
    page: string;
    /**
     * the reference as the file wrote it
     */
    href: string;
    /**
     * `<what>: <why an LMS cannot follow it>`
     */
    reason: string;
};
/**
 * One package written in one format.
 */
export type PackageResult = {
    id: string;
    format: "imscp" | "scorm12";
    /**
     * the zip, as written
     */
    file: string;
    title: string;
    /**
     * sha1 of the zip's bytes, which depend only on its files (`lib/zip.js`)
     */
    hash: string;
    /**
     * the member pages, in the order the table of contents lists them, as written
     */
    pages: string[];
    /**
     * the entries in the zip, `imsmanifest.xml` included
     */
    files: number;
    /**
     * the zip's size, for an LMS's upload limit
     */
    bytes: number;
    /**
     * sorted by page, then href
     */
    outside: PackageOutside[];
};
