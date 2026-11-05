export function isHashable(urlPath: any): boolean;
export function contentHash(bytes: any): string;
export function hashedName(urlPath: any, hash: any): string;
export function createAssetManifest(): {
    /** Compare successful Sass writes with this copy's previous emitted bytes.
     * @param {string} owner
     * @param {Map<string, string>} current
     * @returns {Set<string>}
     */
    reconcileSass(owner: string, current: Map<string, string>): Set<string>;
    readonly urlRevision: number;
    hasOwner(owner: any): boolean;
    /** Whether this copy produced `output`, recorded or not.
     * @param {string} owner
     * @param {string} output build-relative
     * @returns {boolean}
     */
    owns(owner: string, output: string): boolean;
    /** Remember outputs a copy wrote but stopped before recording.
     * @param {string} owner
     * @param {Iterable<string>} outputs build-relative, as `reconcile` returns
     */
    unrecorded(owner: string, outputs: Iterable<string>): void;
    /** Last-good output from this copy only, never another copy's mapping.
     * @param {string} owner
     * @param {string} name
     * @returns {string|null}
     */
    previous(owner: string, name: string): string | null;
    reconcile(owner: any, current: any): any[];
    lookup(urlPath: any): any;
    /** Point a name at a new output after the copy: a stylesheet purged at
     * the settle (`lib/css-purge.js`) is re-hashed, so its name moves. Every
     * copy that mapped the name to the old output follows it, so the next
     * reconcile deletes the old file rather than keeping it.
     * @param {string} name the path a template writes
     * @param {string} output the new build-relative output
     */
    retarget(name: string, output: string): void;
    toObject(): any;
};
export const HASH_LENGTH: 8;
