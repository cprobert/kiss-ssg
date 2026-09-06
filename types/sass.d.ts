/**
 * The `sass` binding, loaded once per process on first call.
 *
 * @returns {any} the modern sass API (`compile`, `compileString`, …)
 */
export function loadSass(): any;
export function pickModernApi(mod: any): any;
export default loadSass;
