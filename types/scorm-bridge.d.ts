/**
 * The bridge as one inline `<script>`, the same bytes on every build: no file
 * to copy, so a page that carries it works on the web and in either package.
 *
 * @param {Object} [options]
 * @param {boolean} [options.manual] leave completion to `kissScorm.status()`;
 * by default a page is complete when it is seen
 * @returns {string}
 */
export function scormBridgeScript({ manual }?: {
    manual?: boolean;
}): string;
