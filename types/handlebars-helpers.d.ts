/**
 * Registers kiss's built-in helpers on one Handlebars environment: `markdown`,
 * `sass`, `offset`, `stringify`, `lookup`, `canonical`, `absUrl`, `asset`,
 * `link`, `isActive` and `env`. Each is Handlebars runtime — see `AIKB` and
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
 * @returns {typeof import('handlebars')} the same environment
 */
export function registerHandlebarsHelpers(hbs: typeof import("handlebars"), config: import("./config.js").KissConfig, { markdown, logger, assets, lookupPage }: {
    markdown: any;
    logger: ReturnType<typeof import("./logger.js").createLogger>;
    assets?: ReturnType<typeof createAssetManifest>;
    lookupPage?: (id: string) => ({
        entry: any;
    } | {
        withdrawn: true;
        views: string[];
    } | null);
}): typeof import("handlebars");
import { createAssetManifest } from './asset-manifest.js';
