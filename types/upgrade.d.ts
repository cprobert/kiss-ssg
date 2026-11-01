/**
 * @typedef {Object} Version
 * @property {number} major
 * @property {number} minor
 * @property {number} patch
 * @property {string[]} pre the prerelease identifiers, empty for a release
 */
/**
 * A semver version, or `null` for anything else: a range (`^2.6.2`), a tag, a
 * `v` prefix, or the `unknown` `describeEngine` reports for an unreadable
 * manifest.
 *
 * @param {string|null|undefined} text
 * @returns {Version|null}
 */
export function parseVersion(text: string | null | undefined): Version | null;
/**
 * Semver precedence, so it sorts: a prerelease comes before its release,
 * numeric identifiers compare as numbers and before alphanumeric ones, and a
 * shorter list of identifiers comes first when the rest are equal
 * (`2.0.0-alpha.2 < 2.0.0-alpha.10 < 2.0.0-beta < 2.0.0-beta.0 < 2.0.0`).
 * No semver package is a dependency, and the changelog's headings are the
 * test of this one.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} negative, zero or positive
 */
export function compareVersions(a: string, b: string): number;
/**
 * Every `## <version> — <date>` entry in a CHANGELOG.md, in the file's order,
 * with its upgrade notes. This is the one parser of the note shape: the
 * changelog's own test imports it rather than keeping a second regex. A
 * heading inside a fenced block is text, not a heading.
 *
 * @param {string} text
 * @returns {Entry[]}
 */
export function changelogEntries(text: string): Entry[];
/**
 * The upgrade notes a site moving from `from` to `to` has to read: every note
 * of every entry after `from`, up to and including `to`, oldest first. An
 * entry in that range with no note is named in `quiet`, so the output can say
 * how many releases had nothing to change. `from` may be a version the
 * changelog never mentions; `null` (the starting version is not known) takes
 * every entry up to `to`.
 *
 * @param {string} text the CHANGELOG.md of the version being installed
 * @param {string|null} from
 * @param {string} to
 * @returns {{ notes: (Note & { version: string, date: string })[], quiet: string[] }}
 */
export function upgradeNotes(text: string, from: string | null, to: string): {
    notes: (Note & {
        version: string;
        date: string;
    })[];
    quiet: string[];
};
/**
 * The lowest version a plain range in `package.json` allows (`^2.6.2`,
 * `~2.7.0`, `2.8.0`, `>=2.5.0`), or `null` for anything it cannot read that
 * from: a `file:` link, a URL, a tag, a compound range.
 *
 * @param {string|null|undefined} spec
 * @returns {string|null}
 */
export function specFloor(spec: string | null | undefined): string | null;
/**
 * Whether a plain `package.json` range lets npm install `version`: `^` keeps
 * the major (and the minor below 1.0.0), `~` the minor, an exact pin only
 * itself, `>=` anything from its floor. Anything `specFloor` cannot read (a
 * `file:` link, a URL, a tag) allows nothing, because npm would not install
 * this release from the registry for it.
 *
 * @param {string|null|undefined} spec
 * @param {string} version
 * @returns {boolean}
 */
export function specAllows(spec: string | null | undefined, version: string): boolean;
/**
 * @typedef {Object} UpgradeArgs
 * @property {boolean} plan
 * @property {boolean} json
 * @property {string|null} from
 * @property {boolean} help
 * @property {string|null} error a usage error: print it with the help, exit 1
 */
/**
 * @param {string[]} argv the arguments after `upgrade`
 * @returns {UpgradeArgs}
 */
export function parseUpgradeArgs(argv?: string[]): UpgradeArgs;
/**
 * What `kiss-ssg upgrade` will do, from facts the bin gathered. Pure: it
 * neither reads nor writes anything.
 *
 * @param {UpgradeFacts} facts
 * @returns {UpgradePlan}
 */
export function planUpgrade(facts: UpgradeFacts): UpgradePlan;
/**
 * @typedef {Object} Check
 * @property {boolean|null} ok `null`: could not be checked
 * @property {string} what
 * @property {string} [fix]
 */
/**
 * The check after the install, which is the reason the command installs at
 * all: a `file:` link survives a plain `npm install` (six of six sites on the
 * 2.5.0 upgrade), so "npm exited 0" is not "the site now builds against the
 * release".
 *
 * @param {{ engine: UpgradeFacts['engine'], lock: LockFacts|null, registry: string|null, savedSpec?: string|null }} after
 * @param {string} to
 * @returns {{ ok: boolean, checks: Check[] }}
 */
export function verifyUpgrade(after: {
    engine: UpgradeFacts["engine"];
    lock: LockFacts | null;
    registry: string | null;
    savedSpec?: string | null;
}, to: string): {
    ok: boolean;
    checks: Check[];
};
/**
 * The human-readable output: the move, what ran, the checks, the notes, and
 * the next step.
 *
 * @param {UpgradePlan} plan
 * @param {{ ran: string|null, verified: ReturnType<typeof verifyUpgrade>|null }|null} result
 *   `null` for `--plan`, or a run that installed nothing
 * @returns {string}
 */
export function formatUpgrade(plan: UpgradePlan, result: {
    ran: string | null;
    verified: ReturnType<typeof verifyUpgrade> | null;
} | null): string;
export const UPGRADE_HELP: "kiss-ssg upgrade [--plan] [--from <version>] [--json]\n\n  Install this kiss-ssg into the site in this folder, check that it landed,\n  and print the CHANGELOG.md upgrade notes between the version the site had and\n  this one. Run it by version, so npx fetches the one you mean rather than the\n  site's own older copy, which has no upgrade command:\n\n    npx kiss-ssg@latest upgrade --plan     read the notes first\n    npx kiss-ssg@latest upgrade            install, verify, print the notes\n\n  It installs kiss-ssg@<this version> into the section package.json already\n  uses (devDependencies when neither), which replaces a file: link, a URL or a\n  git dependency. It then checks that node_modules/kiss-ssg is not a link to a\n  working tree, is this version, and that package-lock.json resolves it from\n  the registry npm is configured for.\n\n  It refuses, and writes nothing, when there is no package.json or when the\n  installed kiss-ssg is a registry release newer than this one. It will not\n  install when the site uses pnpm, yarn or an npm-shrinkwrap.json, when it is\n  an npm workspace member, when npm cannot say which registry it uses, when\n  package.json or package-lock.json has uncommitted changes, or when git fails;\n  --plan still prints the notes then, and says why the install is blocked.\n\n  --plan             print the notes and what it would run; install nothing\n  --from <version>   the version the site was on, when it cannot tell: a link\n                     to a working tree, or a site already upgraded by npm\n                     update. It changes which notes print, never what installs\n  --json             print { from, to, install, verified, notes, ... }\n  --help             this text\n\nExits 1 when it refused, npm failed, or the check after the install failed.";
export type Version = {
    major: number;
    minor: number;
    patch: number;
    /**
     * the prerelease identifiers, empty for a release
     */
    pre: string[];
};
export type UpgradeArgs = {
    plan: boolean;
    json: boolean;
    from: string | null;
    help: boolean;
    /**
     * a usage error: print it with the help, exit 1
     */
    error: string | null;
};
export type LockFacts = {
    /**
     * the lockfile, relative to the site's folder
     */
    path: string;
    /**
     *   its entry for the engine, `null` when it has none
     */
    entry: {
        version?: string;
        resolved?: string;
        link?: boolean;
    } | null;
};
export type UpgradeFacts = {
    /**
     * the running kiss-ssg
     */
    own: {
        version: string;
        changelog: string;
    };
    args: UpgradeArgs;
    pkg: {
        found: boolean;
        section: "dependencies" | "devDependencies" | null;
        spec: string | null;
    };
    engine: ReturnType<typeof import("./check.js").describeEngine>;
    /**
     * `null`: no package-lock.json above the site
     */
    lock: LockFacts | null;
    /**
     * the engine's version in the
     * lockfile as committed at HEAD, `null` when unknown
     */
    committedLockVersion: string | null;
    /**
     * a pnpm or yarn lockfile, when there is one
     */
    otherLockfile: string | null;
    /**
     *   what git says about package.json and the lockfile
     */
    git: {
        state: "clean" | "not-a-repo";
    } | {
        state: "dirty";
        files: string[];
    } | {
        state: "error";
        said: string;
    };
    /**
     * `npm config get registry`, run in the
     * project npm resolves; `null` when npm could not answer
     */
    registry: string | null;
    /**
     * npm's first line when it could not
     */
    registryError?: string | null;
};
export type UpgradePlan = {
    /**
     * the version the site was on, `null` when unknown
     */
    from: string | null;
    /**
     * where `from` came from, for the output
     */
    fromSource: string;
    to: string;
    /**
     * the npm arguments, or `null`
     */
    install: {
        args: string[];
    } | null;
    /**
     * why it will not run; nothing is written
     */
    refuse: string | null;
    /**
     * why an install would refuse; under `--plan`
     * the notes still print, because reading writes nothing
     */
    blocked: string | null;
    warnings: string[];
    notes: (Note & {
        version: string;
        date: string;
    })[];
    /**
     * versions in range with nothing to change
     */
    quiet: string[];
};
export type Check = {
    /**
     * `null`: could not be checked
     */
    ok: boolean | null;
    what: string;
    fix?: string;
};
export type Note = {
    /**
     * `Upgrading`, or `Upgrading: <topic>`
     */
    heading: string;
    /**
     * everything under it, to the next `###` or `##`
     */
    text: string;
};
export type Entry = {
    version: string;
    date: string;
    /**
     * the entry's `### Upgrading` sections, in order
     */
    notes: Note[];
    /**
     * it has `### Nothing for a site to change`
     */
    nothingToChange: boolean;
};
