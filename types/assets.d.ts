/**
 * @typedef {{ file: string, error?: Error, skipped?: boolean, changed?: boolean }} SassResult
 *
 * @param {string} sourceDir
 * @param {string} targetDir
 * @param {{ config: any, logger: any, outputs?: import('./output-registry.js').OutputRegistry, owner?: string }} deps
 * @returns {Promise<SassResult>[]} one per stylesheet it saw — compiled,
 * failed, or skipped as a partial
 */
export function compileSassFiles(sourceDir: string, targetDir: string, { config, logger, outputs, owner }: {
    config: any;
    logger: any;
    outputs?: import("./output-registry.js").OutputRegistry;
    owner?: string;
}): Promise<SassResult>[];
export function copyAssets(sourceDir: any, targetDir: any, { config, logger, manifest, outputs, owner, display, }: {
    config: any;
    logger: any;
    manifest?: {
        readonly urlRevision: number;
        hasOwner(owner: any): boolean;
        reconcile(owner: any, current: any): any[];
        lookup(urlPath: any): any;
        toObject(): any;
    };
    outputs?: any;
    owner?: any;
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
    changed?: boolean;
};
