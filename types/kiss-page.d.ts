export function loadMinifier(): Promise<any>;
export function preloadMinifier(): void;
export class KissPage {
    /**
     * @param {string} view a `.hbs` filename under `pagesDir`, or inline template
     *   source
     * @param {{ hbs?: any, logger?: any, graph?: import('./dependency-graph.js').DependencyGraph }} [deps]
     */
    constructor(view: string, { hbs, logger, graph }?: {
        hbs?: any;
        logger?: any;
        graph?: import("./dependency-graph.js").DependencyGraph;
    });
    _path: string;
    _slug: string;
    _ext: string;
    _extLess: boolean;
    _buildTo: string;
    _title: string;
    _dev: boolean;
    _debug: boolean;
    view: any;
    options: {};
    /** @type {string|null} */
    hash: string | null;
    buildDir: string;
    pagesDir: string;
    /** @type {number} */
    livereloadPort: number;
    hbs: any;
    logger: any;
    graph: import("./dependency-graph.js").DependencyGraph;
    set path(path: any);
    set slug(slug: string);
    get slug(): string;
    set ext(extension: any);
    set extLess(val: any);
    get buildTo(): string;
    pageURL(): string;
    set isDev(dev: any);
    set debug(dev: any);
    prepare(): this;
    generate(): Promise<string>;
    _getTemplate(view: any): any;
}
