export function startDevServer(httpRoot: any, port: any, { logger, livereloadPort, host }: {
    logger: any;
    livereloadPort: any;
    host: any;
}): {
    server: any;
    livereload: any;
    refresh: (path: any) => any;
    ready: Promise<any>;
    close: () => Promise<any>;
};
