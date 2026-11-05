/**
 * The usable tokens of an `integrity` value: `<algo>-<base64>`, an optional
 * `?options` dropped, any other algorithm skipped.
 *
 * @param {string} value
 * @returns {{ algo: 'sha256'|'sha384'|'sha512', digest: string }[]}
 */
export function parseIntegrity(value: string): {
    algo: "sha256" | "sha384" | "sha512";
    digest: string;
}[];
/**
 * Whether bytes satisfy an `integrity` value as a browser checks it: against
 * the tokens of the strongest algorithm named, any one of which may match.
 *
 * @param {Buffer} bytes
 * @param {string} value
 * @returns {boolean|null} `null` when no token is usable, which a browser
 * treats as no integrity at all
 */
export function matchesIntegrity(bytes: Buffer, value: string): boolean | null;
/**
 * The local `<script src>` and `<link href>` references, on the given pages,
 * whose file in the build no longer matches its `integrity` attribute. A
 * reference to another site, or to a file the build does not hold (the link
 * scan's business), is not judged.
 *
 * @param {Object} input
 * @param {{ buildTo: string, html: string }[]} input.pages
 * @param {string} input.buildDir the folder the pages were written into
 * @param {string|null} [input.siteUrl]
 * @param {boolean} [input.extensionLess]
 * @param {boolean} [input.trailingSlash]
 * @param {(file: string) => Buffer|null} input.read a file's bytes, `null` when absent
 * @returns {{ page: string, ref: string }[]}
 */
export function checkIntegrity({ pages, buildDir, siteUrl, extensionLess, trailingSlash, read, }: {
    pages: {
        buildTo: string;
        html: string;
    }[];
    buildDir: string;
    siteUrl?: string | null;
    extensionLess?: boolean;
    trailingSlash?: boolean;
    read: (file: string) => Buffer | null;
}): {
    page: string;
    ref: string;
}[];
