/**
 * A valid XML ID (an NCName) for `raw` after `prefix`: every run of characters
 * outside `[A-Za-z0-9_.-]` becomes one `-`. The prefix starts with a letter,
 * so the ID does too. With `used`, a second raw value that cleans to an ID
 * already given gets `-2`, a third `-3`, in the order they are asked for.
 *
 * @param {string} prefix
 * @param {string} raw
 * @param {Set<string>} [used]
 * @returns {string}
 */
export function xmlId(prefix: string, raw: string, used?: Set<string>): string;
/**
 * The `imsmanifest.xml` of a learning package, as text: an IMS content
 * package 1.1 or a SCORM 1.2 package. It is written straight into the
 * package's zip, never through the page pipeline, whose HTML minifier breaks
 * XML. The same package always gives the same text.
 *
 * Every identifier has a prefix (`MANIFEST-`, `ORG-`, `ITEM-`, `RES-`) and is
 * a valid XML ID, unique in the document. A page's item and resource
 * identifiers come from its `id`, not its path or position: an LMS matches a
 * package's items by identifier when it is uploaded again, so they must stay
 * the same while the page does.
 *
 * @param {ManifestPackage} pkg
 * @returns {string}
 */
export function renderManifest(pkg: ManifestPackage): string;
/**
 * One page of a learning package, as its manifest lists it.
 */
export type ManifestMember = {
    /**
     * the page's `id`: its item and resource identifiers come from it, so they stay the same while it does
     */
    id: string;
    /**
     * the item's title in the table of contents
     */
    title: string;
    /**
     * the page's path inside the package, forward slashes
     */
    href: string;
    /**
     * every file the page's resource lists: the page, then the files it needs, as paths inside the package
     */
    files: string[];
    /**
     * a title to group the page under, with the other members of that section
     */
    section?: string;
};
/**
 * A learning package, as its manifest describes it.
 */
export type ManifestPackage = {
    /**
     * the package's id
     */
    id: string;
    /**
     * the organization's title
     */
    title: string;
    format: "imscp" | "scorm12";
    /**
     * the pages, in the order the table of contents lists them
     */
    members: ManifestMember[];
};
