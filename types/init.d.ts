/**
 * @typedef {Object} InitArgs
 * @property {boolean} install run npm when the engine is missing
 * @property {boolean} help print {@link INIT_HELP}
 * @property {string|null} error a usage error: print it with the help and exit 1
 */
/**
 * @param {string[]} [argv] everything after `init`
 * @returns {InitArgs}
 */
export function parseInitArgs(argv?: string[]): InitArgs;
/**
 * A valid npm package name from a folder name: lower case, runs of anything
 * npm refuses collapsed to one hyphen, no leading dot, underscore or hyphen.
 *
 * @param {string} folderName
 * @returns {string}
 */
export function packageName(folderName: string): string;
/**
 * What `kiss-ssg init` will do to this folder, in order. Install is last, so
 * a failed network still leaves every file written.
 *
 * @param {InitState} state
 * @returns {InitAction[]}
 */
export function planInit(state: InitState): InitAction[];
/**
 * @param {InitAction} action
 * @returns {string}
 */
export function describeAction(action: InitAction): string;
/**
 * What to do after `init`: install the plugins, open the agent, paste a prompt.
 * The install commands are printed rather than implied by the settings file:
 * Claude Code does not offer to install plugins a project's
 * `.claude/settings.json` declares when it first opens the folder (observed
 * 2026-09-26 on a clean profile), so a declaration alone installs nothing.
 *
 * @returns {string}
 */
export function nextSteps(): string;
export const MARKETPLACE: "kiss-ssg";
export const MARKETPLACE_REPO: "cprobert/kiss-ssg";
export const PLUGINS: string[];
export const LLMS_IMPORT: "@node_modules/kiss-ssg/llms.txt";
export const STARTER_MARKER: "Started by `npx kiss-ssg init`";
/** @type {Record<string, string>} */
export const STARTER_RENAMES: Record<string, string>;
export const FIRST_PROMPT: "Use the kiss-site-new skill to build me a site for <who it is for and what it should say>, with <the pages it needs>. It will be served by <the host, e.g. Netlify> at <https://its-address>. Run the build check when you are done.";
export const INIT_HELP: "kiss-ssg init [--no-install]\n\n  Set this folder up for a coding agent, and start a site if there is none:\n\n    package.json           created, or merged: the build, dev, check and aikb\n                           scripts, and \u2014 only with the starter \u2014 \"type\":\n                           \"module\" and \"main\": \"router.js\"\n    CLAUDE.md, AGENTS.md   point the agent at node_modules/kiss-ssg/llms.txt\n    .claude/settings.json  the kiss-ssg marketplace and its two plugins, the\n                           entries claude plugin install --scope project\n                           writes, so the site records which skills it uses\n    router.js, src/        a starter site \u2014 only when no project is here yet\n                           (no router.js, no src/, no package.json main file\n                           or build script) \u2014 and its node_modules/ and\n                           public/ ignore rules,\n                           added to any .gitignore already here\n    node_modules/kiss-ssg  npm install --save-dev kiss-ssg@<this version>,\n                           unless it is installed, package.json already asks\n                           for a version, or --no-install is given\n\n  Claude Code does not install plugins a settings file declares, so init ends\n  by printing the three --scope project install commands to run before claude.\n\n  An existing file is never overwritten. Running it twice changes nothing.";
export type InitArgs = {
    /**
     * run npm when the engine is missing
     */
    install: boolean;
    /**
     * print {@link INIT_HELP}
     */
    help: boolean;
    /**
     * a usage error: print it with the help and exit 1
     */
    error: string | null;
};
export type InitState = {
    /**
     * the folder's own name, for a new package.json
     */
    folderName: string;
    /**
     * the running kiss-ssg's version, which is what gets installed
     */
    version: string;
    /**
     * `--no-install` was not given
     */
    install: boolean;
    /**
     * `node_modules/kiss-ssg/package.json` exists — an installed engine, not merely a folder by that name
     */
    hasEngine: boolean;
    /**
     * `router.js` exists
     */
    hasRouter: boolean;
    /**
     * `src/` exists
     */
    hasSrc: boolean;
    /**
     * `package.json`'s `main` names a file that exists
     */
    hasMain: boolean;
    /**
     * each file's text, or null when absent
     */
    files: {
        "package.json": string | null;
        "CLAUDE.md": string | null;
        "AGENTS.md": string | null;
        ".claude/settings.json": string | null;
        ".gitignore": string | null;
    };
    /**
     * the shipped `starter/` folder: path relative to it → text
     */
    starter: Record<string, string>;
};
export type InitAction = {
    kind: "write";
    path: string;
    content: string;
    verb: "create" | "merge" | "append";
    detail?: string;
} | {
    kind: "skip";
    path: string;
    reason: string;
} | {
    kind: "install";
    spec: string;
};
