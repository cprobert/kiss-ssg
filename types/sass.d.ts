/**
 * The `sass` binding, loaded once per process on first call.
 *
 * @returns {any} the modern sass API (`compile`, `compileString`, …)
 */
export function loadSass(): any;
/**
 * Compiles a stylesheet file, reusing the previous result while neither it nor
 * anything it imports has changed.
 *
 * @param {string} target absolute path to the stylesheet
 * @param {{loadPaths?: string[], style?: string}} [options]
 * @returns {string} the compiled CSS
 */
export function compileFile(target: string, { loadPaths, style }?: {
    loadPaths?: string[];
    style?: string;
}): string;
/**
 * Compiles a stylesheet from source, reusing the previous result while nothing
 * it imports has changed. Inline blocks that import nothing are keyed on their
 * source alone, so an identical block rendered on many pages compiles once.
 *
 * @param {string} source the stylesheet source
 * @param {{loadPaths?: string[], style?: string}} [options]
 * @returns {string} the compiled CSS
 */
export function compileSource(source: string, { loadPaths, style }?: {
    loadPaths?: string[];
    style?: string;
}): string;
/** Empties the compile cache. Exported for tests. */
export function clearSassCache(): void;
export function pickModernApi(mod: any): any;
export default loadSass;
