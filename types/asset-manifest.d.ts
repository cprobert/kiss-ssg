export function isHashable(urlPath: any): boolean;
export function contentHash(bytes: any): string;
export function hashedName(urlPath: any, hash: any): string;
export function createAssetManifest(): {
    hasOwner(owner: any): boolean;
    reconcile(owner: any, current: any): any[];
    record(urlPath: any, emittedPath: any): any;
    lookup(urlPath: any): any;
    toObject(): any;
};
export const HASH_LENGTH: 8;
