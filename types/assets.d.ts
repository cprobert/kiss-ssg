export function compileSassFiles(sourceDir: any, targetDir: any, { config, logger }: {
    config: any;
    logger: any;
}): Promise<void>[];
export function copyAssets(sourceDir: any, targetDir: any, { config, logger, manifest }: {
    config: any;
    logger: any;
    manifest?: {
        record(urlPath: any, emittedPath: any): any;
        lookup(urlPath: any): any;
        toObject(): any;
    };
}): Promise<{
    id: string;
    data: string;
    error?: undefined;
} | {
    id: string;
    data: any;
    error: any;
}>;
