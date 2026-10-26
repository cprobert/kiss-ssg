/**
 * The bridge as one inline `<script>`, the same bytes on every build: no file
 * to copy, so a page that carries it works on the web and in either package.
 *
 * @param {Object} [options]
 * @param {'manual' | 'seen'} [options.complete] `'manual'` (the default) leaves
 * completion to `kissScorm.status()`; `'seen'` completes a page on load, which
 * in Moodle opens every later launch in review mode, where nothing is saved
 * @returns {string}
 */
export function scormBridgeScript({ complete }?: {
    complete?: "manual" | "seen";
}): string;
