/**
 * What the `image` helper is handed by the orchestrator. Functions, never
 * snapshots: the build root and the recipe are read at each call.
 *
 * @typedef {Object} ImageDeps
 * @property {(name: string) => ({ file: string, emitted: string }|null)} locate
 * the copied file a template's path names, absolute, and its build-relative
 * output; `null` when no copy emitted it
 * @property {() => import('./images.js').KissImages} recipe `assets.images`
 * @property {ReturnType<typeof createImageIndex>} index
 */
/**
 * Registers kiss's built-in helpers on one Handlebars environment: `markdown`,
 * `sass`, `offset`, `stringify`, `lookup`, `canonical`, `absUrl`, `asset`,
 * `image`, `link`, `isActive`, `env`, `scormBridge`, `embed`, and the consent
 * manager's `consentHead`, `consentBanner`, `consentScript`,
 * `consentSettings`, `consentTable` and `consentRecord`. Each is Handlebars runtime — see `AIKB` and
 * llms.txt for what each one renders.
 *
 * @param {typeof import('handlebars')} hbs the environment to register on
 * @param {import('./config.js').KissConfig} config read by `sass`, `env`,
 * `canonical`/`absUrl`/`link` (`siteUrl`) and `asset` (`assets`)
 * @param {Object} deps
 * @param {any} deps.markdown the Remarkable instance behind the `markdown` helper
 * @param {ReturnType<typeof import('./logger.js').createLogger>} deps.logger
 * @param {ReturnType<typeof createAssetManifest>} [deps.assets] what each asset
 * copy emitted, which is what `asset` looks a path up in
 * @param {(id: string) => ({ entry: any }|{ withdrawn: true, views: string[] }|null)} [deps.lookupPage]
 * the page registry behind `link`, resolved against the orchestrator's live
 * stack on every call: `{ entry }` for a page that claims the id, `{ withdrawn,
 * views }` for a default id two pages arrived at, `null` for an id no page
 * claims. A function, never a snapshot — helpers are registered once per
 * instance and a watch replay builds a new stack. The default resolves nothing,
 * so a caller that registers helpers without a registry still gets every other
 * helper.
 * @param {(hash: string, text: string) => void} [deps.recordBanner] told each
 * consent banner's hash and the text it was taken from, for the banner
 * registry (`consent-banners.json`); the default records nothing
 * @param {ImageDeps} [deps.images] what `image` needs: where a copied source
 * is, the recipe, and the index it records each request on. The default
 * locates nothing, so a caller without an asset copy still gets every other
 * helper
 * @returns {typeof import('handlebars')} the same environment
 */
export function registerHandlebarsHelpers(hbs: typeof import("handlebars"), config: import("./config.js").KissConfig, { markdown, logger, assets, lookupPage, recordBanner, images, }: {
    markdown: any;
    logger: ReturnType<typeof import("./logger.js").createLogger>;
    assets?: ReturnType<typeof createAssetManifest>;
    lookupPage?: (id: string) => ({
        entry: any;
    } | {
        withdrawn: true;
        views: string[];
    } | null);
    recordBanner?: (hash: string, text: string) => void;
    images?: ImageDeps;
}): typeof import("handlebars");
/**
 * What the `image` helper is handed by the orchestrator. Functions, never
 * snapshots: the build root and the recipe are read at each call.
 */
export type ImageDeps = {
    /**
     * the copied file a template's path names, absolute, and its build-relative
     * output; `null` when no copy emitted it
     */
    locate: (name: string) => ({
        file: string;
        emitted: string;
    } | null);
    /**
     * `assets.images`
     */
    recipe: () => import("./images.js").KissImages;
    index: ReturnType<typeof createImageIndex>;
};
import { createAssetManifest } from './asset-manifest.js';
import { createImageIndex } from './images.js';
