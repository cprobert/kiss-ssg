/**
 * The entry file kiss would load for a helpers folder, or `null` when the
 * folder has none — which is the ordinary case for a site with no custom
 * helpers and must stay silent.
 *
 * @param {string|null|undefined} folder
 * @returns {string|null}
 */
export function helpersEntry(folder: string | null | undefined): string | null;
/**
 * Imports `<folders.helpers>/index.js` and calls its `registerHelpers` export
 * (or its default) with the `Kiss` instance.
 *
 * `fresh` busts both module caches the way `controller-resolver.js` does, so a
 * watch rebuild picks up an edited helper instead of re-running the copy Node
 * already holds. Re-registering an existing helper name is how Handlebars
 * replaces one, so an *edited* helper needs no teardown — but a *removed* one
 * does: the registry still holds it, and the registrar that would have put it
 * back is gone. `previous` is the list this call last returned as `registered`;
 * those names are cleared after the module imports and before the registrar
 * runs, so whatever the new source does not register stays gone. They are put
 * back if the registrar throws, since a half-registered site is worse than the
 * one it replaced.
 *
 * Resolves to a description of what happened rather than throwing: a helpers
 * folder that cannot be loaded is a build failure for the caller to record,
 * not an exception thrown through the constructor.
 *
 * @param {string|null|undefined} folder `config.folders.helpers`
 * @param {{ kiss: any, logger: any, fresh?: boolean, previous?: string[] }} deps
 * @returns {Promise<{ loaded: boolean, entry: string|null, registered?: string[], error?: Error }>}
 */
export function loadSiteHelpers(folder: string | null | undefined, { kiss, logger, fresh, previous }: {
    kiss: any;
    logger: any;
    fresh?: boolean;
    previous?: string[];
}): Promise<{
    loaded: boolean;
    entry: string | null;
    registered?: string[];
    error?: Error;
}>;
