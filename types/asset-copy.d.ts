/**
 * Queues one copy of `sourceDir` into `targetDir` (`Kiss._copyAssets`), and
 * records what it owns once it has run. Returns the queued run.
 *
 * @param {any} kiss
 * @param {string} sourceDir
 * @param {string} targetDir
 * @param {boolean} [watch] tracked by the rebuild queue instead of registration results
 */
export function copyAssetFolder(kiss: any, sourceDir: string, targetDir: string, watch?: boolean): any;
export function canonical(p: any): string;
export function assetCopyKey(sourceDir: any, targetDir: any): string;
