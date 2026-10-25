export function loadMinifier(): Promise<any>;
export function preloadMinifier(): void;
export class KissPage {
    /**
     * @param {string} view a `.hbs` filename under `pagesDir`, or inline template
     *   source
     * @param {{ hbs?: any, logger?: any, directory?: string, graph?: import('./dependency-graph.js').DependencyGraph, outputs?: import('./output-registry.js').OutputRegistry }} [deps]
     */
    constructor(view: string, { hbs, logger, graph, outputs, directory }?: {
        hbs?: any;
        logger?: any;
        directory?: string;
        graph?: import("./dependency-graph.js").DependencyGraph;
        outputs?: import("./output-registry.js").OutputRegistry;
    });
    /** @private @type {string} */
    private _directory;
    /** @private @type {string|null} */
    private _outputPath;
    /** @private @type {string} */
    private _buildDir;
    _path: string;
    _slug: string;
    _ext: string;
    _extLess: boolean;
    _buildTo: string;
    _dev: boolean;
    _debug: boolean;
    view: any;
    options: {};
    /** @type {string|null} */
    hash: string | null;
    /** @type {string[]|null} */
    links: string[] | null;
    /** @type {import('./audit.js').PageFacts|null} */
    audit: import("./audit.js").PageFacts | null;
    /** @type {{ selector: string, withLlms?: boolean }|null} */
    markdownCopy: {
        selector: string;
        withLlms?: boolean;
    } | null;
    /** @type {() => boolean} */
    llmsRequested: () => boolean;
    /** @type {string|null} */
    markdown: string | null;
    set buildDir(value: string);
    get buildDir(): string;
    pagesDir: string;
    /** @type {number} */
    livereloadPort: number;
    hbs: any;
    logger: any;
    graph: import("./dependency-graph.js").DependencyGraph;
    outputs: import("./output-registry.js").OutputRegistry;
    set path(path: any);
    set slug(slug: string);
    get slug(): string;
    set ext(extension: any);
    set extLess(val: any);
    get buildTo(): string;
    /** @returns {string|null} */
    get markdownTo(): string | null;
    get outputPath(): string;
    get outputOwner(): string;
    pageURL(): string;
    set isDev(dev: any);
    set debug(dev: any);
    prepare(): this;
    /**
     * Writes the Markdown copy of a page that has already been written but has
     * none, from the HTML on disk: the page rendered before the build called
     * `.llms()` (from a `generate()` callback, say), and `markdownTo` now names
     * a copy that `llms.txt` will link. The conversion and the claim are a
     * render's own. Does nothing for a page that is not written, has its copy
     * already, or should have none.
     *
     * @returns {Promise<void>}
     */
    writeMarkdownCopy(): Promise<void>;
    generate(): Promise<string>;
    _getTemplate(view: any): any;
}
