/**
 * The built-in transforms, before a site's `config.transforms` is laid over
 * them. `.md` renders per call, AFTER Handlebars — so `{{link "x"}}` is a URL
 * and `{{> "nav"}}` is markup before Markdown reads the line — and `.txt` is
 * the file's own characters, escaped.
 *
 * @param {{ markdown: { render: (src: string) => string }, hbs: any }} deps
 * @returns {Record<string, KissTransform>}
 */
export function builtInTransforms({ markdown, hbs }: {
    markdown: {
        render: (src: string) => string;
    };
    hbs: any;
}): Record<string, KissTransform>;
/**
 * Runs every transform's `setup` once. Never rejects: a failed setup is
 * returned against its extension, so the caller can report it and the
 * partials of that extension can fail the pages that call them.
 *
 * @param {Record<string, KissTransform>} transforms
 * @returns {Promise<Map<string, Error>>} the extensions whose setup failed
 */
export function setupTransforms(transforms: Record<string, KissTransform>): Promise<Map<string, Error>>;
/**
 * The name `registerPartials` derives for a file, from its path alone —
 * so a watcher event can be mapped to the partial it names. `null` when the
 * file is under neither folder.
 *
 * @param {string} file a path as chokidar reports it (native or posix)
 * @param {{ partials?: string | null, layouts?: string | null }} folders
 * @returns {string | null}
 */
export function partialNameFor(file: string, folders: {
    partials?: string | null;
    layouts?: string | null;
}): string | null;
/**
 * Registers every partial and layout from disk, and unregisters any name the
 * previous pass produced that this one did not.
 *
 * The registered set mirrors disk: `previous` is what the last full pass
 * produced, and a name it holds that this pass did not has lost its file. The
 * extension decides the processing — `.html` and `.hbs` are compiled, every
 * other extension is looked up in the transform table (the built-ins, with
 * `config.transforms` laid over them) and a file whose extension is in neither
 * is not a partial. Layouts are `.hbs` only. Two files that derive one name
 * (`foo.md` and `foo.hbs`, or a partial and a layout) are a collision: the name
 * fails every page that calls it, and the collision is returned for the build
 * to report.
 *
 * @param {any} hbs the Handlebars environment
 * @param {{ folders: { partials?: string|null, layouts?: string|null }, transforms?: Record<string, KissTransform> }} config
 * @param {{ markdown: any, logger: any, graph?: any, failed?: Map<string, Error> }} deps
 * `failed` is the map `setupTransforms` fills, read when a partial renders
 * @param {string[]} [previous] the names the last pass registered
 * @returns {{ names: string[], collisions: { name: string, files: string[], error: Error }[] }}
 */
export function registerPartials(hbs: any, config: {
    folders: {
        partials?: string | null;
        layouts?: string | null;
    };
    transforms?: Record<string, KissTransform>;
}, deps: {
    markdown: any;
    logger: any;
    graph?: any;
    failed?: Map<string, Error>;
}, previous?: string[]): {
    names: string[];
    collisions: {
        name: string;
        files: string[];
        error: Error;
    }[];
};
/**
 * A partial transform (`config.transforms[ext]`): what kiss does to a partial
 * of that extension each time a page calls it.
 *
 * @typedef {Object} KissTransform
 * @property {boolean} [compile] whether the file is compiled as Handlebars
 * before `render` sees it; `true` by default, `false` hands `render` the
 * file's own characters
 * @property {(output: string, ctx: KissTransformContext) => string} render
 * called per partial call, after Handlebars, with the rendered string; its
 * return value is inserted into the page raw. Synchronous: anything async
 * belongs in `setup`
 * @property {() => any} [setup] awaited once, before the first page renders;
 * a rejection fails every page that calls a partial of this extension
 */
/**
 * What a transform's `render` is told about the call.
 *
 * @typedef {Object} KissTransformContext
 * @property {string} name the partial's name, as a template calls it
 * @property {string} file the partial's file
 * @property {string|undefined} page the output path of the page rendering it
 * @property {any} context the partial's context, as Handlebars passed it
 * @property {Record<string, any>} hash the call's hash arguments
 * (`{{> callout tone="warn"}}` is `{ tone: 'warn' }`); `{}` when none
 */
export const TEMPLATE_EXTENSIONS: readonly string[];
/**
 * A partial transform (`config.transforms[ext]`): what kiss does to a partial
 * of that extension each time a page calls it.
 */
export type KissTransform = {
    /**
     * whether the file is compiled as Handlebars
     * before `render` sees it; `true` by default, `false` hands `render` the
     * file's own characters
     */
    compile?: boolean;
    /**
     * called per partial call, after Handlebars, with the rendered string; its
     * return value is inserted into the page raw. Synchronous: anything async
     * belongs in `setup`
     */
    render: (output: string, ctx: KissTransformContext) => string;
    /**
     * awaited once, before the first page renders;
     * a rejection fails every page that calls a partial of this extension
     */
    setup?: () => any;
};
/**
 * What a transform's `render` is told about the call.
 */
export type KissTransformContext = {
    /**
     * the partial's name, as a template calls it
     */
    name: string;
    /**
     * the partial's file
     */
    file: string;
    /**
     * the output path of the page rendering it
     */
    page: string | undefined;
    /**
     * the partial's context, as Handlebars passed it
     */
    context: any;
    /**
     * the call's hash arguments
     * (`{{> callout tone="warn"}}` is `{ tone: 'warn' }`); `{}` when none
     */
    hash: Record<string, any>;
};
