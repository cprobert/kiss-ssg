/**
 * The handle `startDevServer` returns, for a child that `kiss-ssg dev` started:
 * the servers are the command's, so this one asks over the channel (spec § 5.3).
 * `ready` settles on the command's answer to the `serve` it sent, and a bind
 * failure there rejects it like one here. `refresh` sends a reload. `close()`
 * resolves at once and sends nothing: a restart or a stop must not take down
 * servers the command is keeping, and only the command closes them.
 *
 * @param {{ root: string, port: number, host: string, livereloadPort: number }} serve
 * @param {{ send: (message: object) => void, onMessage: (listener: (message: any) => void) => () => void }} channel `onMessage` returns the function that stops listening
 * @returns {{ ready: Promise<void>, refresh: (path?: string) => void, close: () => Promise<void> }}
 */
export function linkDevServer(serve: {
    root: string;
    port: number;
    host: string;
    livereloadPort: number;
}, { send, onMessage }: {
    send: (message: object) => void;
    onMessage: (listener: (message: any) => void) => () => void;
}): {
    ready: Promise<void>;
    refresh: (path?: string) => void;
    close: () => Promise<void>;
};
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
