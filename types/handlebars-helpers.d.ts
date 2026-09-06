/**
 * Registers kiss's built-in helpers on one Handlebars environment: `markdown`,
 * `sass`, `offset`, `stringify`, `lookup`, `canonical`, `absUrl`, `asset`,
 * `isActive` and `env`. Each is Handlebars runtime — see `AIKB` and llms.txt
 * for what each one renders.
 *
 * @param {typeof import('handlebars')} hbs the environment to register on
 * @param {import('./config.js').KissConfig} config read by `sass`, `env`,
 * `canonical`/`absUrl` (`siteUrl`) and `asset` (`assets`)
 * @param {Object} deps
 * @param {any} deps.markdown the Remarkable instance behind the `markdown` helper
 * @param {ReturnType<typeof import('./logger.js').createLogger>} deps.logger
 * @param {ReturnType<typeof createAssetManifest>} [deps.assets] what each asset
 * copy emitted, which is what `asset` looks a path up in
 * @returns {typeof import('handlebars')} the same environment
 */
export function registerHandlebarsHelpers(hbs: typeof import("handlebars"), config: import("./config.js").KissConfig, { markdown, logger, assets }: {
    markdown: any;
    logger: ReturnType<typeof import("./logger.js").createLogger>;
    assets?: ReturnType<typeof createAssetManifest>;
}): typeof import("handlebars");
import { createAssetManifest } from './asset-manifest.js';
