/**
 * @typedef {Object} CommandResult
 * @property {string} out
 * @property {string} err
 * @property {number} code
 */
/**
 * The repository issues go to, from this package's own `bugs.url`, never
 * from the site's.
 *
 * @param {string} [root] the package folder
 * @returns {string} `owner/name`
 */
export function issueRepo(root?: string): string;
/**
 * Every token-shaped value in a text, by line and kind, never the value.
 *
 * @param {string} text
 * @returns {{ line: number, kind: string }[]}
 */
export function findTokens(text: string): {
    line: number;
    kind: string;
}[];
/**
 * An issue reference given to `--status`: a URL into this repository's
 * issues, `#78` or `78`.
 *
 * @param {string} ref
 * @param {string} repo `owner/name`
 * @returns {number|null}
 */
export function issueNumber(ref: string, repo: string): number | null;
/**
 * The CHANGELOG's one form for a shipped issue, `Fixes [#n](…/issues/n)`.
 * A bare mention does not count. Shared with `test/unit/changelog.test.js`.
 * Any whitespace after `Fixes`: prettier wraps the changelog, and can break
 * the line there.
 *
 * @param {string} repo `owner/name`
 * @returns {RegExp} global; groups: the number in the text, the number in the URL
 */
export function fixesLink(repo: string): RegExp;
/**
 * The version whose CHANGELOG entry carries `Fixes [#n](…)` for this issue,
 * or `null`.
 *
 * @param {string} changelog
 * @param {number} number
 * @param {string} repo
 * @returns {string|null}
 */
export function shippedIn(changelog: string, number: number, repo: string): string | null;
/**
 * The `filed: <URL>` lines in a text that name an issue in this
 * repository: what a site's session log or `AIKB/site.md` records for an
 * issue it filed. A URL into another project, or a bare number ("Bugs
 * filed: 2"), is not one.
 *
 * @param {string} text
 * @param {string} repo `owner/name`
 * @returns {{ number: number, ref: string }[]}
 */
export function parseFiled(text: string, repo: string): {
    number: number;
    ref: string;
}[];
/**
 * What a draft says about the build, from the reports `kiss-ssg check`
 * printed or `KISS_REPORT` collected, or from the site's last record.
 *
 * @param {any[]} reports
 * @param {string} source how the reports were found
 * @param {{ anonymous?: boolean }} [options] `anonymous` leaves the failing
 *   views out, since a view's path can name the site or its client
 * @returns {string}
 */
export function buildSummary(reports: any[], source: string, { anonymous }?: {
    anonymous?: boolean;
}): string;
/**
 * @typedef {Object} IssueFacts
 * @property {string} version the installed kiss-ssg's
 * @property {string} node
 * @property {string} os
 * @property {string} site the site's package name, or its folder's
 * @property {string|null} siteUrl
 * @property {string} build what `buildSummary` said
 */
/**
 * The draft's Markdown: each of the kind's headings, in the form's order,
 * filled from the facts and the notes.
 *
 * @param {{ kind: 'bug'|'feature', notes?: string, facts: IssueFacts, anonymous?: boolean }} input
 * @returns {string}
 */
export function draftIssue({ kind, notes, facts, anonymous }: {
    kind: "bug" | "feature";
    notes?: string;
    facts: IssueFacts;
    anonymous?: boolean;
}): string;
/**
 * The command the operator runs, prefixed `! ` for a Claude Code session so
 * `gh`'s output (the new issue's URL) lands in it. Never run here.
 *
 * @param {{ repo: string, title: string, file: string, platform?: string }} input
 *   `platform` is accepted for callers, and changes nothing: one form serves
 *   every shell
 * @returns {string}
 */
export function createCommand({ repo, title, file }: {
    repo: string;
    title: string;
    file: string;
    platform?: string;
}): string;
/**
 * @param {string[]} argv the arguments after `issue`
 * @returns {{ mode: 'draft'|'status'|'filed'|'help', kind?: 'bug'|'feature', title?: string, notes?: string|null, report?: string|null, anonymous?: boolean, out?: string|null, search?: boolean, ref?: string, error?: string }}
 */
export function parseIssueArgs(argv: string[]): {
    mode: "draft" | "status" | "filed" | "help";
    kind?: "bug" | "feature";
    title?: string;
    notes?: string | null;
    report?: string | null;
    anonymous?: boolean;
    out?: string | null;
    search?: boolean;
    ref?: string;
    error?: string;
};
/**
 * Runs `gh` with an argument list and no shell, or reports that it could not.
 *
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{ ok: boolean, stdout: string }}
 */
export function runGh(args: string[], cwd: string): {
    ok: boolean;
    stdout: string;
};
/**
 * `kiss-ssg issue`: every decision of the command, so the bin only prints.
 *
 * @param {string[]} argv the arguments after `issue`
 * @param {{ cwd?: string, gh?: typeof runGh, platform?: string, tmpdir?: string, repo?: string, write?: (file: string, text: string) => void }} [options]
 * @returns {CommandResult}
 */
export function runIssue(argv: string[], { cwd, gh, platform, tmpdir, repo, write, }?: {
    cwd?: string;
    gh?: typeof runGh;
    platform?: string;
    tmpdir?: string;
    repo?: string;
    write?: (file: string, text: string) => void;
}): CommandResult;
export const BUG_HEADINGS: readonly string[];
export const FEATURE_HEADINGS: readonly string[];
export const ISSUE_HELP: "kiss-ssg issue: draft an issue for kiss-ssg, and see whether a filed one shipped.\n\n  npx kiss-ssg issue bug|feature --title \"<one line>\" [options]\n      writes the draft to a file outside the site and prints the gh command that\n      files it. It never posts: you run the command.\n      --notes <file>   your words: What happened, What was expected, Reproduction,\n                       Config excerpt (bug), or What you were trying to do, What\n                       kiss does now, What would help, Workaround in use (feature),\n                       as ### headings; text before any heading goes in the first\n      --report <file>  the build to describe: kiss-ssg check's output or a\n                       KISS_REPORT file (default: AIKB/last-build.json, the last\n                       recorded passing build)\n      --anonymous      leave the site's name and URL out\n      --out <file>     where the draft goes (default: the OS temp folder)\n      --no-search      skip the search for issues with the same title\n  npx kiss-ssg issue --status <issue URL or number>\n      whether the installed kiss-ssg's CHANGELOG ships a fix for it\n  npx kiss-ssg issue --filed\n      every \"filed: <issue URL>\" in planning/sessions/ and AIKB/site.md, each\n      with --status's answer\n\nA draft holding a token-shaped value is refused (exit 1), naming the line,\nnever the value. Exit 2 is a usage error.";
export type CommandResult = {
    out: string;
    err: string;
    code: number;
};
export type IssueFacts = {
    /**
     * the installed kiss-ssg's
     */
    version: string;
    node: string;
    os: string;
    /**
     * the site's package name, or its folder's
     */
    site: string;
    siteUrl: string | null;
    /**
     * what `buildSummary` said
     */
    build: string;
};
