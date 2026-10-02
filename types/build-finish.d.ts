export function finishBuild(kiss: any): Promise<any>;
/**
 * Everything `buildReport` needs, in one place. It is read twice — once by
 * `_finishBuild()` when a build settles, and once by `_refreshReport()` when
 * something changes the failure list without settling a build — and two call
 * sites assembling this literal separately is exactly the shape that has
 * gone wrong repeatedly on this branch: they drift, and the one nobody looks
 * at is the one that lies.
 *
 * @returns {any}
 */
export function reportInputs(kiss: any): any;
/**
 * Re-assembles the settled report against the CURRENT failure list.
 *
 * `report()` is the machine verdict, and between settles it was a stale one:
 * a watch asset save that broke a stylesheet, or a helpers reload that
 * failed, put the failure on `_failures` and logged it in red immediately
 * while `report().ok` went on saying `true` until the next whole-site
 * replay. Measured. A scoped re-render and an asset re-copy settle no build,
 * so neither calls `_finishBuild()` — and re-running `_finishBuild()` here
 * would be wrong in the other direction, because it carries the once-per-
 * build side effects: a `KISS_REPORT` line (one per BUILD, not per call), a
 * `last-build.json` record, a `dependency-graph.json` write. This re-derives
 * the report and nothing else.
 *
 * What it deliberately does NOT re-derive is what an asset copy or a helpers
 * reload cannot change: the aikb verdict (a map of pages and partials) and
 * the redirect findings (page aliases). Both are reused from the settle that
 * produced them, which is why they are held on the instance.
 *
 * A no-op before the first build settles — there is nothing to refresh, and
 * `report()` correctly answers `null`.
 *
 */
export function refreshReport(kiss: any): void;
export function buildAikb(kiss: any): Promise<import("./aikb.js").AikbResult>;
/**
 * @param {any} kiss
 * @param {{ quiet?: boolean }} [options]
 */
export function runLinkCheck(kiss: any, { quiet }?: {
    quiet?: boolean;
}): any;
/**
 * @param {any} kiss
 * @param {{ quiet?: boolean }} [options]
 */
export function runAudit(kiss: any, { quiet }?: {
    quiet?: boolean;
}): any;
export function writeAliasRedirects(kiss: any): any;
export function lastBuildRecord(kiss: any): import("./build-report.js").BuildReport;
export function findRedirectChanges(kiss: any): {
    file: any;
    aliases: number;
    rules: import("./redirects.js").RedirectRule[];
    json: any;
    formats: any;
    files: any;
    removed: string[];
    collisions: string[];
    moved: {
        id: string;
        from: string;
        to: string;
    }[];
};
