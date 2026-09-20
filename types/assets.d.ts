export function compileSassFiles(sourceDir: any, targetDir: any, { config, logger }: {
    config: any;
    logger: any;
}): Promise<{
    file: string;
    error?: undefined;
} | {
    file: string;
    error: Error;
}>[];
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
    data: any;
    sass?: undefined;
    error?: undefined;
} | {
    id: string;
    data: string;
    sass: ({
        file: string;
        error?: undefined;
    } | {
        file: string;
        error: Error;
    })[];
    error?: undefined;
} | {
    id: string;
    data: any;
    error: any;
    sass: ({
        file: string;
        error?: undefined;
    } | {
        file: string;
        error: Error;
    })[];
}>;
