export function runController(options: any, controller: any, { logger }: {
    logger: any;
}): any;
export function loadController(controllersDir: any, file: any, { logger, fresh }: {
    logger: any;
    fresh?: boolean;
}): Promise<any>;
export function applyController(options: any, { controllersDir, logger, fresh }: {
    controllersDir: any;
    logger: any;
    fresh?: boolean;
}): Promise<any>;
