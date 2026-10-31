# base.js

## Responsibility

`kiss-ssg base`: the branch a site's piece of work merges into, and the ref to diff against or start new work from. The kiss-memory skills call it rather than ask git themselves.

## Public interface

- `parseLsRemote(text)` — the branch `git ls-remote --symref origin HEAD` names, or `null`.
- `chooseDiffRef(found, behind)` — of the local base and origin's, the one with the fewest commits to HEAD; a tie keeps the local branch.
- `chooseStart(facts, name)` — `{ ref, reason }`: where new work starts.
- `runBase(argv, { cwd })` — the whole command: `{ out, err, code }`.
- `BASE_HELP` — the command's help text.

## Depends on

`lib/git.js`, `lib/sessions.js`.

## Depended on by

`bin/kiss-ssg.js` (`kiss-ssg base`), and through it the `kiss-memory` skills.

## Non-obvious behavior

- **The base is the session log's `base:` line first**, then the remote's default branch. The default comes from the clone's record (`refs/remotes/origin/HEAD`), else from asking origin (`ls-remote --symref`), because a remote added by hand has no record. With neither, the command exits 1 and says to ask: it never assumes `main`. A merge skill that knows better (a pull request's `baseRefName`, which a retargeted request changes) uses that instead; the skill says so.
- **Where the name came from is printed on stderr**, and stdout carries the bare answer, so a skill can read either.
- **`--ref` picks the ref this work started from.** `git fetch` never moves a local branch, so a stale local base would put everyone else's newer commits in the diff, while a local base with unpushed commits is the one the work came from.
- **`--start` starts from origin's base** unless only the local one exists or it has commits origin lacks; when the two have diverged it exits 1, because which to start from is the person's call.
- **`--base <name>` skips the lookup.** `kiss-branch-open` creates a worktree before it writes the session log, so at that moment no log can name the base the person chose; without the option, `--start` would answer for the remote's default instead. It does not combine with `--from-branch`, which only says where to look the base up.
- **Every ref is printed in full**, so a tag of the same name (`v2`) is never read in its place. With the short name, `git pull origin v2` fetched the tag and said "Already up to date" while the base stayed behind (measured, 2026-10-31).

## Types

Returns `import('./sessions.js').CommandResult`.
