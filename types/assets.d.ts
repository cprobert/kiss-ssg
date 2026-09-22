/**
 * @typedef {{ file: string, error?: Error, skipped?: boolean }} SassResult
 *
 * @param {string} sourceDir
 * @param {string} targetDir
 * @param {{ config: any, logger: any }} deps
 * @returns {Promise<SassResult>[]} one per stylesheet it saw — compiled,
 * failed, or skipped as a partial
 */
export function compileSassFiles(sourceDir: string, targetDir: string, { config, logger }: {
    config: any;
    logger: any;
}): Promise<SassResult>[];
export function copyAssets(sourceDir: any, targetDir: any, { config, logger, manifest, protectedPaths, display, }: {
    config: any;
    logger: any;
    manifest?: {
        hasOwner(owner: any): boolean;
        reconcile(owner: any, current: any): any[];
        record(urlPath: any, emittedPath: any): any;
        lookup(urlPath: any): any;
        toObject(): any;
    };
    protectedPaths?: Set<any>;
    display?: {
        source?: string;
        target?: string;
    };
}): Promise<{
    id: string;
    data: any;
    sass?: undefined;
    error?: undefined;
} | {
    id: string;
    data: string;
    sass: SassResult[];
    error?: undefined;
} | {
    id: string;
    data: any;
    error: any;
    sass: SassResult[];
}>;
export type SassResult = {
    file: string;
    error?: Error;
    skipped?: boolean;
};
