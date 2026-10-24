/**
 * A zip archive of `entries`, every entry stored (no compression), so the
 * bytes depend on nothing but the entries: not on the machine, the Node
 * version or the order the entries were given in. Entries are written in the
 * byte order of their UTF-8 names, every timestamp is 1980-01-01 00:00, and
 * there are no extra fields, comments, data descriptors or directory entries.
 *
 * @param {ZipEntry[]} entries
 * @returns {Buffer}
 */
export function zip(entries: ZipEntry[]): Buffer;
/**
 * One file of a zip: its path inside the archive and its contents.
 */
export type ZipEntry = {
    /**
     * forward-slash path inside the archive, relative, no `..` or empty segment
     */
    name: string;
    /**
     * the contents; a string is written as UTF-8
     */
    bytes: string | Uint8Array;
};
