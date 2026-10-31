/**
 * Runs git and returns its stdout, or throws a `GitError` with git's first
 * line of complaint.
 *
 * @param {string[]} args
 * @param {{ cwd?: string, input?: string }} [options]
 * @returns {string}
 */
export function git(args: string[], { cwd, input }?: {
    cwd?: string;
    input?: string;
}): string;
/**
 * Runs git and returns its trimmed stdout, or `null` when git refused. For a
 * question whose "no" is an answer, not a failure.
 *
 * @param {string[]} args
 * @param {string} [cwd]
 * @returns {string|null}
 */
export function tryGit(args: string[], cwd?: string): string | null;
/**
 * Whether a ref exists, by its exact full name. `show-ref --verify`, not
 * `rev-parse`, which resolves a revision: it reads `refs/tags/v2~1` as the tag
 * v2 and `refs/heads/v2~1` as the branch v2.
 *
 * @param {string} full e.g. `refs/heads/main`
 * @param {string} [cwd]
 * @param {(args: string[], cwd?: string) => string|null} [run]
 * @returns {boolean}
 */
export function refExists(full: string, cwd?: string, run?: (args: string[], cwd?: string) => string | null): boolean;
/**
 * The refs a branch name has here, by full name, the local branch first. Which
 * of them a caller reads is its own rule. By full name because a short name
 * resolves a tag before a branch, and an integration branch may share its
 * name with a tag (`v2`).
 *
 * @param {string} name
 * @param {(full: string) => boolean} exists
 * @returns {{ full: string, short: string }[]}
 */
export function branchRefs(name: string, exists: (full: string) => boolean): {
    full: string;
    short: string;
}[];
/**
 * A git that refused (not a repository, an unsafe directory, a bad ref): the
 * first line of what git said. Callers report it in one line, never as a
 * stack trace a skill cannot tell from "nothing found".
 */
export class GitError extends Error {
}
