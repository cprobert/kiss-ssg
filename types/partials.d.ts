export function registerPartialsFrom(hbs: any, folder: any, ext: any, { markdown, logger, graph }: {
    markdown: any;
    logger: any;
    graph: any;
}): string[];
/**
 * The name `registerPartialsFrom` derives for a file, from its path alone —
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
export function registerPartials(hbs: any, config: any, deps: any, previous?: any[]): string[];
