export function readModelFile(modelsDir: any, file: any): any;
export function readModelsFromFolder(modelsDir: any, folder: any): any[];
export function resolveModel(model: any, { modelsDir, logger, fetchImpl, fetchConfig }: {
    modelsDir: any;
    logger: any;
    fetchImpl?: typeof fetch;
    fetchConfig: any;
}): Promise<{
    id: string;
    data: any;
} | {
    data: {};
    id?: undefined;
}>;
