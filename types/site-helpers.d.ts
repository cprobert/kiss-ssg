/**
 * The entry file kiss would load for a helpers folder, or `null` when the
 * folder has none — which is the ordinary case for a site with no custom
 * helpers and must stay silent.
 *
 * Posix-normalised, like every other path kiss hands out: `path.resolve`
 * returns native separators, and this one is compared against a watcher event
 * and reported in `_failures[].buildTo`. A backslash in either is a path that
 * matches nothing and a failure a consumer cannot grep for.
 *
 * @param {string|null|undefined} folder
 * @returns {string|null}
 */
export function helpersEntry(folder: string | null | undefined): string | null;
/**
 * Whether a path a watcher reported is one of the helpers folder's entry
 * files. Both sides are resolved before they are compared, which is the whole
 * point: `resolveConfig` leaves `./helpers` **relative**, so chokidar watches
 * a relative path and emits relative events, while `helpersEntry` returns an
 * absolute one. Comparing them with separator normalisation alone made an edit
 * to the entry look like an edit to a sibling — in the *default*
 * configuration, which no test covered because every one of them named the
 * folder absolutely.
 *
 * It asks whether the path *could* be an entry rather than whether it is the
 * one precedence picks today, because a delete is answered with this too: with
 * `index.js` and `index.mjs` both present, deleting `index.js` leaves
 * `helpersEntry` pointing at `index.mjs`, and asking "is this the entry" would
 * classify the file that just vanished as a sibling.
 *
 * @param {string|null|undefined} folder `config.folders.helpers`
 * @param {string|null|undefined} file a path as the watcher reported it
 * @returns {boolean}
 */
export function isHelpersEntry(folder: string | null | undefined, file: string | null | undefined): boolean;
/**
 * Whether a watch event on this path should take the **entry reload** path.
 *
 * Narrower than `isHelpersEntry`, and the two are deliberately different
 * questions. A reload busts the *selected* entry's URL and nothing else, so
 * editing `index.mjs` while `index.js` is selected must not take the reload
 * path: the edit would not be picked up, the site would rebuild with stale
 * helpers, and the restart notice that names the problem would not fire.
 *
 * A **deleted** candidate is the exception, and is why `isHelpersEntry` exists
 * separately: removing `index.js` changes which file is the entry — to
 * `index.mjs`, or to none at all — so it reloads even though it is not the
 * selection at the moment the question is asked.
 *
 * @param {string|null|undefined} folder `config.folders.helpers`
 * @param {string|null|undefined} file a path as the watcher reported it
 * @returns {boolean}
 */
export function isActiveHelpersEntry(folder: string | null | undefined, file: string | null | undefined): boolean;
/**
 * Imports `<folders.helpers>/index.js` and calls its `registerHelpers` export
 * (or its default) with the `Kiss` instance.
 *
 * `fresh` busts both module caches the way `controller-resolver.js` does, so a
 * watch rebuild picks up an edited helper instead of re-running the copy Node
 * already holds. Re-registering an existing helper name is how Handlebars
 * replaces one, so an *edited* helper needs no teardown — but a *removed* one
 * does: the registry still holds it, and the registrar that would have put it
 * back is gone. `previous` is the list this call last returned as `registered`
 * — `{ name, prior }` pairs, not bare names, because a registrar may have
 * *overridden* something rather than added it. Those entries are undone after
 * the module imports and before the registrar runs: a name with a `prior` is
 * restored to it, a name without one is unregistered. Recording only the name
 * meant an overridden kiss built-in was destroyed when the site stopped
 * overriding it — silently, since an argument-less mustache renders empty
 * rather than throwing. They are put back if the registrar throws, since a
 * half-registered site is worse than the one it replaced.
 *
 * Resolves to a description of what happened rather than throwing: a helpers
 * folder that cannot be loaded is a build failure for the caller to record,
 * not an exception thrown through the constructor.
 *
 * `required` says whether the author named this folder or kiss guessed it, and
 * it decides **how much evidence kiss needs before running a stranger's code**.
 *
 * Named by the author: `registerHelpers`, or a default export, and anything
 * that goes wrong is a build failure. They pointed kiss here.
 *
 * Guessed: only the **named** `registerHelpers` export is trusted, because that
 * name is the opt-in and a default export is the ordinary shape of every module
 * ever written. `registerHelpers ?? default` used to call any default-exported
 * function with the kiss instance, so an unrelated utility barrel in a root
 * `helpers/` — a formatter, a client factory, a `connect()` — was invoked and
 * its throw killed the build of a site that had never heard of this
 * convention. Measured on four entry shapes. kiss now does not call it at all:
 * a side effect is as bad as an exception, and a catch cannot undo one. An
 * import that throws is the same judgement — a browser-utility barrel touching
 * `window` at the top level is fine in a bundle and throws in Node, and tells
 * us nothing about whose folder this is — so a guessed folder warns and carries
 * on.
 *
 * What does **not** soften: a module that exports `registerHelpers` by name is
 * unambiguously kiss's, whoever chose the folder, so a throw from it is a build
 * failure either way. A broken registrar on a green build renders every
 * `{{helper}}` as nothing, which is the failure this module exists to prevent.
 *
 * @param {string|null|undefined} folder `config.folders.helpers`
 * @typedef {{ name: string, prior: import('handlebars').HelperDelegate|undefined }} OwnedHelper
 *
 * @param {{ kiss: any, logger: any, fresh?: boolean, previous?: OwnedHelper[], required?: boolean, builtins?: string[] }} deps
 * @returns {Promise<{ loaded: boolean, entry: string|null, registered?: OwnedHelper[], error?: Error }>}
 */
export function loadSiteHelpers(folder: string | null | undefined, { kiss, logger, fresh, previous, required, builtins, }: {
    kiss: any;
    logger: any;
    fresh?: boolean;
    previous?: OwnedHelper[];
    required?: boolean;
    builtins?: string[];
}): Promise<{
    loaded: boolean;
    entry: string | null;
    registered?: OwnedHelper[];
    error?: Error;
}>;
/**
 * Imports `<folders.helpers>/index.js` and calls its `registerHelpers` export
 * (or its default) with the `Kiss` instance.
 *
 * `fresh` busts both module caches the way `controller-resolver.js` does, so a
 * watch rebuild picks up an edited helper instead of re-running the copy Node
 * already holds. Re-registering an existing helper name is how Handlebars
 * replaces one, so an *edited* helper needs no teardown — but a *removed* one
 * does: the registry still holds it, and the registrar that would have put it
 * back is gone. `previous` is the list this call last returned as `registered`
 * — `{ name, prior }` pairs, not bare names, because a registrar may have
 * *overridden* something rather than added it. Those entries are undone after
 * the module imports and before the registrar runs: a name with a `prior` is
 * restored to it, a name without one is unregistered. Recording only the name
 * meant an overridden kiss built-in was destroyed when the site stopped
 * overriding it — silently, since an argument-less mustache renders empty
 * rather than throwing. They are put back if the registrar throws, since a
 * half-registered site is worse than the one it replaced.
 *
 * Resolves to a description of what happened rather than throwing: a helpers
 * folder that cannot be loaded is a build failure for the caller to record,
 * not an exception thrown through the constructor.
 *
 * `required` says whether the author named this folder or kiss guessed it, and
 * it decides **how much evidence kiss needs before running a stranger's code**.
 *
 * Named by the author: `registerHelpers`, or a default export, and anything
 * that goes wrong is a build failure. They pointed kiss here.
 *
 * Guessed: only the **named** `registerHelpers` export is trusted, because that
 * name is the opt-in and a default export is the ordinary shape of every module
 * ever written. `registerHelpers ?? default` used to call any default-exported
 * function with the kiss instance, so an unrelated utility barrel in a root
 * `helpers/` — a formatter, a client factory, a `connect()` — was invoked and
 * its throw killed the build of a site that had never heard of this
 * convention. Measured on four entry shapes. kiss now does not call it at all:
 * a side effect is as bad as an exception, and a catch cannot undo one. An
 * import that throws is the same judgement — a browser-utility barrel touching
 * `window` at the top level is fine in a bundle and throws in Node, and tells
 * us nothing about whose folder this is — so a guessed folder warns and carries
 * on.
 *
 * What does **not** soften: a module that exports `registerHelpers` by name is
 * unambiguously kiss's, whoever chose the folder, so a throw from it is a build
 * failure either way. A broken registrar on a green build renders every
 * `{{helper}}` as nothing, which is the failure this module exists to prevent.
 */
export type OwnedHelper = {
    name: string;
    prior: import("handlebars").HelperDelegate | undefined;
};
