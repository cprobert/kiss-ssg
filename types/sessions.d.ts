/**
 * A log's frontmatter as plain strings, or `null` when it has none. Only the
 * frontmatter counts: a log's body may quote another log's. What an editor or
 * a YAML habit adds reads the same as the plain line: CRLF endings, a
 * byte-order mark, spaces after a `---`, a quoted value, a ` # comment` (YAML
 * needs the space, so a `#` inside a value is part of it). The first line of
 * a key wins. A frontmatter that is never closed is none.
 *
 * @param {string} text
 * @returns {Record<string, string>|null}
 */
export function frontmatter(text: string): Record<string, string> | null;
/**
 * @typedef {Object} SessionEntry
 * @property {string} file the path inside the sessions folder, `/`-separated
 * @property {string} show how to name it to the caller: a path from where
 *   they stand, or `<ref>:<path>` that `git show` reads, when read from a
 *   branch's commits
 * @property {Record<string, string>} fields its frontmatter (empty when none)
 */
/**
 * The entries whose `branch:` is exactly `branch`, compared as text, so a dot
 * or a slash in a name is only itself. An empty branch matches nothing.
 *
 * @param {SessionEntry[]} entries
 * @param {string} branch
 * @returns {SessionEntry[]}
 */
export function matching(entries: SessionEntry[], branch: string): SessionEntry[];
/**
 * Newest first, by the date each log's file name starts with: one sort over
 * every log, subfolders included. Modification times are no guide: a fresh
 * clone gives every file the same one.
 *
 * @param {SessionEntry[]} entries
 * @returns {SessionEntry[]}
 */
export function newestFirst(entries: SessionEntry[]): SessionEntry[];
/**
 * One line per log, newest first, for `kiss-ssg session --list`: its path,
 * branch, status and when it was consolidated (`-` when it was not), tab
 * separated, under a header.
 *
 * @param {SessionEntry[]} entries
 * @returns {string}
 */
export function listLines(entries: SessionEntry[]): string;
/**
 * A branch's own commits: the local branch, or origin's copy when there is no
 * local one (a branch opened on another machine). The local branch first,
 * because it is the one the skills act on, and a log's frontmatter is written
 * once, at open, so a local copy behind origin's reads the same.
 *
 * @param {string} branch
 * @param {(full: string) => boolean} exists
 * @returns {string|null} a full ref
 */
export function branchCommits(branch: string, exists: (full: string) => boolean): string | null;
/**
 * Reads every log in `dir`, subfolders included, from this checkout, or, with
 * `ref`, from that ref's commits wherever this runs: a branch opened in a
 * worktree committed its log there, and this checkout may not have it yet.
 *
 * @param {{ dir: string, cwd?: string, ref?: string|null }} where `dir` is
 *   the sessions folder, absolute
 * @returns {SessionEntry[]}
 */
export function readSessions({ dir, cwd, ref }: {
    dir: string;
    cwd?: string;
    ref?: string | null;
}): SessionEntry[];
/**
 * The commits to read a named branch's logs from, or a reason there are none.
 *
 * @param {string} branch
 * @param {string} cwd
 * @returns {string|null}
 */
export function commitsOf(branch: string, cwd: string): string | null;
/**
 * @typedef {Object} CommandResult
 * @property {string} out what goes to stdout ('' for nothing)
 * @property {string} err what goes to stderr ('' for nothing)
 * @property {number} code the exit code
 */
/**
 * `kiss-ssg session`: every decision of the command, from its arguments to
 * its exit code, so the bin only prints.
 *
 * @param {string[]} argv the arguments after `session`
 * @param {{ cwd?: string }} [options]
 * @returns {CommandResult}
 */
export function runSession(argv: string[], { cwd }?: {
    cwd?: string;
}): CommandResult;
/** The folder a site keeps its session logs in, relative to the site. */
export const SESSIONS: "planning/sessions";
export const SESSION_HELP: "kiss-ssg session [<branch>] [options]\n\nFinds a branch's session log: the file in planning/sessions/ (subfolders\nincluded) whose frontmatter branch: is exactly the branch's name. Run it from\nthe site's folder. With no branch, the current one.\n\n  (no option)      print each matching log's path, from where you stand, one\n                   per line; nothing when there is none. More than one means\n                   the name was used before: ask which is this work's.\n  --from-branch    read the logs from the branch's own commits (the local\n                   branch, or origin's copy when there is no local one), and\n                   print each as <ref>:<path>, which git show reads\n  --get <key>      print one frontmatter value (base, worktree, status\u2026) of\n                   the branch's log. Exits 1 when there is no log, or more\n                   than one; prints nothing when the log has no such key.\n  --list           every log, newest first by the date its name starts with:\n                   path, branch, status, consolidated (- when not)\n  --help           this text\n\nExits 1 on a detached HEAD with no branch named, a branch that is nowhere\n(--from-branch), or a git that refuses, and says why in one line.";
export type SessionEntry = {
    /**
     * the path inside the sessions folder, `/`-separated
     */
    file: string;
    /**
     * how to name it to the caller: a path from where
     * they stand, or `<ref>:<path>` that `git show` reads, when read from a
     * branch's commits
     */
    show: string;
    /**
     * its frontmatter (empty when none)
     */
    fields: Record<string, string>;
};
export type CommandResult = {
    /**
     * what goes to stdout ('' for nothing)
     */
    out: string;
    /**
     * what goes to stderr ('' for nothing)
     */
    err: string;
    /**
     * the exit code
     */
    code: number;
};
