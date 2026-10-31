# git.js

## Responsibility

The git questions kiss's commands ask, asked one way: run git and get its output or a one-line refusal, and say whether a branch or tag exists by its exact name. `lib/sessions.js` and `lib/base.js` are built on it, and this repository's own `scripts/base-branch.mjs` imports `branchRefs` and `refExists` from it, so a rule about refs exists once.

## Public interface

- `git(args, { cwd, input })` — stdout as text, or throws `GitError` with the first line git wrote to stderr.
- `tryGit(args, cwd)` — trimmed stdout, or `null` when git refused: for a question whose "no" is an answer.
- `refExists(full, cwd, run = tryGit)` — whether a ref exists, by its full name.
- `branchRefs(name, exists)` — `[{ full, short }]` for `refs/heads/<name>` and `refs/remotes/origin/<name>`, whichever exist, local first.
- `class GitError` — git refused.

## Depends on

`node:child_process` only.

## Depended on by

`lib/sessions.js`, `lib/base.js`, and the repository's dev tooling `scripts/base-branch.mjs` (which passes its own cached runner as `run`).

## Non-obvious behavior

- **`refExists` asks `git show-ref --verify`, never `rev-parse`.** `rev-parse` resolves a revision, so it reads `refs/tags/v2~1` as the tag `v2` and `refs/heads/v2~1` as the branch `v2`. That misread an override and named a revision as a branch, one code review apart (2026-10-31, rounds 16 and 17).
- **Branches are named in full** (`refs/heads/…`, `refs/remotes/origin/…`) because a short name resolves a tag before a branch, and this repository's tags `v1` and `v2` share the integration branches' names. Every short-name use of a base in the branch skills went wrong at least once during the 2026-10-31 reviews.
- **A refusal is one line.** A skill reading a command's output cannot tell a stack trace from "nothing found", so every caller reports `GitError`'s message, never the error itself.
- Why this module exists at all: the same rules had been written as shell in four skills and as JavaScript in two scripts, and each review found a case one copy missed. The root cause analysis is in `planning/sessions/2026-10-30-branch-merged-and-privacy.md`.

## Types

`GitError extends Error`. `branchRefs` returns `{ full: string, short: string }[]`.
