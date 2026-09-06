export function createLogger({ verbose, silent }?: {
    verbose?: boolean;
    silent?: boolean;
}): {
    verbose: boolean;
    banner: (...args: any[]) => void;
    info: (...args: any[]) => void;
    success: (...args: any[]) => void;
    highlight: (...args: any[]) => void;
    notice: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    debug: (...args: any[]) => void;
    plain: (...args: any[]) => void;
};
export namespace silentLogger {
    export { verbose };
    export function banner(...args: any[]): void;
    export function info(...args: any[]): void;
    export function success(...args: any[]): void;
    export function highlight(...args: any[]): void;
    export function notice(...args: any[]): void;
    export function warn(...args: any[]): void;
    export function error(...args: any[]): void;
    export function debug(...args: any[]): void;
    export function plain(...args: any[]): void;
}
declare namespace _default { }
export default _default;
