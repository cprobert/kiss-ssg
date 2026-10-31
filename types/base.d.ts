/**
 * The branch `git ls-remote --symref origin HEAD` names, or `null`.
 *
 * @param {string|null} text
 * @returns {string|null}
 */
export function parseLsRemote(text: string | null): string | null;
/**
 * Of a base's local branch and origin's, the one this work started from: the
 * fewest commits between it and HEAD. `git fetch` never moves a local branch,
 * so a local base is often behind origin's, and diffing against it would
 * carry everyone else's newer commits; a local base with unpushed commits is
 * kept. A tie keeps the local branch.
 *
 * @param {{ full: string }[]} found from `branchRefs`, local first
 * @param {(full: string) => number} behind commits from the ref to HEAD
 * @returns {string|null} a full ref
 */
export function chooseDiffRef(found: {
    full: string;
}[], behind: (full: string) => number): string | null;
/**
 * Where new work starts: origin's base, unless only the local one exists, or
 * the local one has commits origin lacks (unpushed work to keep). Diverged,
 * the two disagree, and that is the person's call.
 *
 * @param {{ local: boolean, origin: boolean, localOnly: number, originOnly: number }} facts
 *   `localOnly`/`originOnly`: commits on one and not the other
 * @returns {{ ref: string|null, reason: string }}
 */
export function chooseStart({ local, origin, localOnly, originOnly }: {
    local: boolean;
    origin: boolean;
    localOnly: number;
    originOnly: number;
}, name: any): {
    ref: string | null;
    reason: string;
};
/**
 * `kiss-ssg base`: every decision of the command, so the bin only prints.
 *
 * @param {string[]} argv the arguments after `base`
 * @param {{ cwd?: string }} [options]
 * @returns {import('./sessions.js').CommandResult}
 */
export function runBase(argv: string[], { cwd }?: {
    cwd?: string;
}): import("./sessions.js").CommandResult;
export const BASE_HELP: "kiss-ssg base [<branch>] [options]\n\nThe branch a piece of work merges into. Run it from the site's folder. It is\nthe base: line of the branch's session log (the current branch, or the one\nnamed), and otherwise the remote's default branch. Prints the name on stdout,\nand where it came from on stderr.\n\n  --from-branch    read the session log from the branch's own commits\n  --ref            print the ref to diff against instead: of the local base\n                   and origin's, the one this branch started from\n  --start          print the ref to start new work from instead: origin's,\n                   unless the local base has commits origin lacks; exits 1\n                   when the two have diverged\n  --help           this text\n\nEvery ref is printed in full (refs/heads/\u2026, refs/remotes/origin/\u2026), so a tag\nof the same name is never read in its place. Exits 1, saying why in one line,\nwhen there is no base to name.";
