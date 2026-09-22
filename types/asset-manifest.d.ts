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
    reconcile(owner: any, current: any): any[];
    lookup(urlPath: any): any;
    toObject(): any;
};
export const HASH_LENGTH: 8;
