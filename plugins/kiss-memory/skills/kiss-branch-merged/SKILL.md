---
name: kiss-branch-merged
description: Tidy up after a piece of work on a kiss-ssg site has been merged — confirm the merge really happened, bring the base branch up to date, check that the merged site still builds to the knowledge base kiss-branch-close recorded, delete the local branch, prune, and remove only the worktree the session file names. Use when told "it's merged", "the PR was merged", "squashed and merged", "clean up after the merge", or after kiss-branch-close once the pull request has gone in. The last beat after kiss-branch-open, kiss-branch-pulse and kiss-branch-close.
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

# Tidy up after a merge on a kiss-ssg site

The Tidy beat: `kiss-branch-open` (Frame) → `kiss-branch-pulse` (Steer) → `kiss-branch-close` (Verify) → **`kiss-branch-merged`** (Tidy). After a pull request merges, this machine still has the local branch, stale remote-tracking refs and, sometimes, the worktree `kiss-branch-open worktree` made. This skill removes them, and checks before each deletion. It writes nothing to the site: no commit, no record.

## Execution instructions

### 1. Find the branch, the merge and the worktree

```bash
BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
BASE=${BASE:-main}
git branch --show-current
git status --short
git worktree list
grep -rl "^branch: <branch>$" planning/sessions/*.md
```

- **Uncommitted changes:** stop and show them. They may be someone's work. Ask before anything else.
- **Which branch:** the current one, or the one the conversation names. Do not guess.

**Confirm the merge before deleting anything.** A squash merge, the usual choice on GitHub, puts one new commit on the base and none of the branch's own, so git alone cannot tell a squashed branch from an unmerged one; `git branch -D` would delete either.

- **GitHub, with `gh`:** `gh pr list --head <branch> --state all --json number,state,mergedAt`. Go on only when it says `MERGED`.
- **A plain merge, any host:** after step 2, `git branch --merged "$BASE"` lists the branch when its commits are in the base.
- **Neither can tell** (a squash on GitLab or Bitbucket, or no `gh`): ask the person to confirm the merge, with AskUserQuestion, and say that you could not check it yourself. A "not sure" stops here.

**The worktree this session made** is the one the session file names in `worktree:`, and only that one is this skill's to remove. Never remove a worktree because its name looks right.

### 2. Bring the base up to date

- **The branch is in its own worktree:** leave the main checkout's branch as it is; `git fetch --prune` there, and `git pull --ff-only` only when it is on the base with no uncommitted changes.
- **The branch is in the main checkout:** `git checkout "$BASE"`, then `git pull --ff-only`.

A failed `--ff-only` means the local base has commits the remote does not. Stop and show them (`git log "origin/$BASE..$BASE" --oneline`); never reset the base.

### 3. Check the merged site against its record

`kiss-branch-close` recorded the knowledge base (`AIKB/`) on the branch, and the merge brought that record onto the base. Check that the merged site still builds to it:

```bash
npx kiss-ssg check --summary <build-script>
```

`--summary` goes before the script. Find the build script the way `kiss-site-brief` does (`package.json` scripts).

- **`ok`, and no diff against the record:** the base is exactly what the close verified.
- **A diff:** something else reached the base too — another branch merged after this one was recorded, or a merge conflict was resolved by hand. Do not record here, and do not commit to the base: report the diff, and say that the next `kiss-branch-open` will treat it as inherited drift and the next `kiss-branch-close` will record over it.
- **A failure:** the merged base does not build. That is the first thing to fix, on a new branch. Report it at the top.

### 4. Remove this session's worktree, then the branch

If the session file names a worktree, work from the main checkout, never from inside the worktree:

1. Stop its dev server (`.watch()`) and close its editor window: on Windows an open file stops the removal.
2. Check that it is clean: `git -C <worktree> status --short` prints nothing. If it does, stop and ask.
3. `git worktree remove <worktree>`.

Then, in the main checkout:

```bash
git branch -D <branch>        # only after step 1 confirmed the merge
git fetch --prune
```

Never use `--force`. The branch on the remote is not this skill's to delete: leave it to the host's "Delete branch" button or setting, and mention it in the report if `git branch -r` still shows it.

### 5. Report

Short, decision first if there is one: the commit the base is at now; step 3's result (the merged site matches its record, or the drift, or the failure); what was deleted; anything left and why; and what the session file's Verdict leaves open.

## What this skill never does

- Delete a branch whose merge it could not confirm, or a worktree with uncommitted changes.
- Remove a worktree the session file does not name.
- Record the knowledge base, or commit anything: the base moves only through a merge, and the record moves only at `kiss-branch-close`.
- Delete the remote branch, reset the base, or force-push.
