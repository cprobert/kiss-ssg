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
 * What to do after `init`: open the agent, accept the plugins, paste a prompt.
 *
 * @param {{ probeOffered: boolean }} options whether Claude Code offers declared plugins on first launch (Task 1's probe)
 * @returns {string}
 */
export function nextSteps({ probeOffered }: {
    probeOffered: boolean;
}): string;
export const MARKETPLACE: "kiss-ssg";
export const MARKETPLACE_REPO: "cprobert/kiss-ssg";
export const PLUGINS: string[];
export const LLMS_IMPORT: "@node_modules/kiss-ssg/llms.txt";
export const STARTER_MARKER: "Started by `npx kiss-ssg init`";
/** @type {Record<string, string>} */
export const STARTER_RENAMES: Record<string, string>;
export const FIRST_PROMPT: "Use the kiss-site-new skill to build me a site for <who it is for and what it should say>, with <the pages it needs>. Run the build check when you are done.";
export const INIT_HELP: "kiss-ssg init [--no-install]\n\n  Set this folder up for a coding agent, and start a site if there is none:\n\n    package.json           created, or merged: \"type\": \"module\", and the\n                           build, dev and check scripts\n    CLAUDE.md, AGENTS.md   point the agent at node_modules/kiss-ssg/llms.txt\n    .claude/settings.json  the kiss-ssg marketplace and its two plugins, at\n                           project scope, so everyone who opens the folder in\n                           Claude Code is offered the same skills\n    router.js, src/        a starter site \u2014 only when neither exists yet\n    node_modules/kiss-ssg  npm install --save-dev kiss-ssg@<this version>,\n                           unless it is there already or --no-install is given\n\n  An existing file is never overwritten. Running it twice changes nothing.";
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
     * `node_modules/kiss-ssg` exists
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
     * each file's text, or null when absent
     */
    files: {
        "package.json": string | null;
        "CLAUDE.md": string | null;
        "AGENTS.md": string | null;
        ".claude/settings.json": string | null;
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
