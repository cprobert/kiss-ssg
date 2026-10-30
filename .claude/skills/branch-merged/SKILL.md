---
name: branch-merged
description: After-merge clean-up, the step after /branch-close. Once the pull request has been merged on GitHub (usually squashed), confirm it really is merged, bring the base branch up to date, delete the local branch, prune the remote-tracking refs, and remove only the worktree the branch's session file names, only when it is clean. Use when told "merged", "squashed and merged", "PR merged", "tidy up after the merge", or when /branch-merged is invoked.
---

# Branch merged — clean up after the pull request

`/branch-merged` is the last beat of the loop: `/branch-open` (Frame) → `/branch-pulse` (Steer) → `/branch-close` (Verify & close) → **`/branch-merged`** (Tidy). Someone merges the pull request on GitHub, usually with "Squash and merge". What is left on this machine is a stale local branch, stale remote-tracking refs and, sometimes, the worktree `/branch-open worktree` made. This skill removes them, and checks before each deletion.

**Why the check comes from GitHub, not git.** A squash merge puts one new commit on the base; the branch's own commits are never in it. So `git branch -d` refuses to delete a squash-merged branch, and `git branch -D` deletes a branch whether or not it was merged. Only the pull request's state says the branch is safe to delete.

## On invocation

Before anything else, output exactly:

```
"The only thing that is constant is change." — Heraclitus
```

Then proceed.

## Execution instructions

### 1. Find the branch, its pull request and the worktree this session made

```bash
BASE=$(node scripts/base-branch.mjs)
git branch --show-current
git status --short
git worktree list
grep -rlE "^branch: <branch>[[:space:]]*$" planning/sessions     # the branch's session file
gh pr list --head <branch> --state all --json number,state,title,mergedAt
```

- **Not on the branch** (on the base, or in another folder): take the branch from the conversation (the pull request `/branch-close` opened), or ask. Do not guess.
- **Uncommitted changes:** stop and show them. They may be someone's work in progress. Ask before anything else.
- **The pull request is not `MERGED`** (open, closed without a merge, or not found): stop and say so. Delete nothing.

**The worktree this session made** is the one the session file names in `worktree:`. That one, and only that one, is this skill's to remove. A session file without the line made no worktree. Never remove a worktree because its name looks right: another session or another person may be working in it.

### 2. Bring the base up to date

Look before you switch a checkout: another session may be using it.

- **The branch is in its own worktree** (`worktree:`): leave the main checkout's branch as it is. Run `git fetch --prune` there, and `git pull --ff-only` only when it is on the base with no uncommitted changes.
- **The branch is in the main checkout:** `git checkout "$BASE"`, then `git pull --ff-only`.

A failed `--ff-only` means the local base has commits GitHub does not have. Stop and show them (`git log "origin/$BASE..$BASE" --oneline`); never reset the base.

### 3. Remove this session's worktree, then the branch

If the session file names a worktree, work from the main checkout, never from inside the worktree:

1. Stop anything serving or watching it (an example's `--dev`, `node docs --dev`) and close its editor window: on Windows an open file stops the removal.
2. Check that it is clean: `git -C <worktree> status --short` prints nothing. If it does, stop and ask.
3. Remove it: `git worktree remove <worktree>`.

Then, in the main checkout:

```bash
git branch -D <branch>        # only after step 1 showed MERGED
git fetch --prune
```

Never use `--force`. If `git worktree remove` refuses, report why.

**The branch on GitHub** is not this skill's to delete: GitHub's "Delete branch" button, or the setting that deletes it on merge, is the owner's choice. If `git branch -r` still shows it after the prune, say so in the report with the command, and leave it.

### 4. Report

Short, decision first if there is one:

- the commit the base is at now (`git log --oneline -1`), and the pull request it came from;
- what was deleted: the local branch, and the worktree if there was one;
- anything left, and why: an uncommitted file, the branch still on GitHub, a worktree the session file does not name;
- what the session file's Verdict and the pull request leave open for later.

## What this skill never does

- Delete a branch whose pull request is not merged, or a worktree with uncommitted changes.
- Remove a worktree the session file does not name.
- Switch the branch of a checkout another session is using.
- Delete the remote branch, reset or rebase the base, or force-push.
- Merge a pull request, or publish a version: both are the operator's acts.
