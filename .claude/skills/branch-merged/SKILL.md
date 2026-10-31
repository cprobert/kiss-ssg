---
name: branch-merged
description: After-merge clean-up, the step after /branch-close. Once the pull request has been merged on GitHub (usually squashed), confirm it really is merged and that it holds every local commit, bring the base branch up to date, delete the local branch, prune the remote-tracking refs, and remove only the worktree the branch's session file names, only when it is clean. Use when told "merged", "squashed and merged", "PR merged", "tidy up after the merge", or when /branch-merged is invoked.
---

# Branch merged — clean up after the pull request

`/branch-merged` is the last beat of the loop: `/branch-open` (Frame) → `/branch-pulse` (Steer) → `/branch-close` (Verify & close) → **`/branch-merged`** (Tidy). Someone merges the pull request on GitHub, usually with "Squash and merge". What is left on this machine is a stale local branch, stale remote-tracking refs and, sometimes, the worktree `/branch-open worktree` made. This skill removes them, and checks before each deletion.

**Why the check comes from GitHub, not git.** A squash merge puts one new commit on the base; the branch's own commits are never in it. So `git branch -d` refuses to delete a squash-merged branch, and `git branch -D` deletes a branch whether or not it was merged. Only the pull request says what was merged, and only its head commit says which commits that was.

**Each code block sets what it uses.** Shell state does not carry from one Bash call to the next, so a block that needs the branch sets `B` itself, and where a block needs the base it says `<base>`: write in the merged pull request's `baseRefName`, which step 1 asks `gh` for. Never `scripts/base-branch.mjs`, which works the base out from this checkout's HEAD (step 3).

## On invocation

Before anything else, output exactly:

```
"The only thing that is constant is change." — Heraclitus
```

Then proceed.

## Execution instructions

### 1. Find the branch, its pull request and its worktree

**Which branch:** the current one, or the one the conversation names (the pull request `/branch-close` opened). If neither says, ask. Do not guess.

```bash
B=<branch>
git fetch origin
git worktree list --porcelain
C="refs/heads/$B"; git show-ref -q --verify "$C" || C="refs/remotes/origin/$B"
if [ -f scripts/session-file.mjs ]; then node scripts/session-file.mjs "$B" --from-branch
else T=$(mktemp -d) && for f in session-file base-branch is-main; do git show "$C:scripts/$f.mjs" > "$T/$f.mjs" || exit 1; done && node "$T/session-file.mjs" "$B" --from-branch; fi
gh pr list --head "$B" --state all --json number,state,isCrossRepository,headRefOid,baseRefName,mergedAt,url
```

**The session file is read from the branch, not from this folder.** `--from-branch` reads every session file in the branch's own commits, so it finds the file wherever this skill runs: a branch opened with `/branch-open worktree` committed its session file inside the worktree, and the main checkout does not have it until the base is pulled. It compares the `branch:` value in each file's frontmatter, and nowhere else, with the branch name exactly, so a dot or a slash in the name is only itself, and a file with Windows line endings still matches. It prints each match as `<ref>:<path>`, the ref it read: the local branch, or origin's copy when there is no local one, and never a tag that shares the name. Read the file with `git show '<the line it printed>'`, written in as it stands, because shell state does not carry between commands. The fetch does not prune: a branch deleted on merge keeps its `origin/` ref until step 4, so the lookup can still read it. A main checkout on a commit older than `scripts/session-file.mjs` does not have the script, so the block then runs the branch's own copy, with the two scripts it imports, from a scratch folder.

- **One file:** that is this session's file.
- **None:** the branch has no session file, so it made no worktree.
- **No branch here or on origin** (the lookup says so): the branch was opened on another machine and its remote branch was deleted on merge. This machine then has no worktree of it to remove and no commits of it to lose, so step 2 is done; carry on from step 3, and say in the report that the session file could not be read.
- **More than one:** the branch name was used before. Stop and ask which is this session's: a `worktree:` line read from the wrong file would remove another session's worktree.

**The worktree this session made** is the path in the session file's `worktree:` line, and only that one is this skill's to remove. A session file without the line made no worktree. Then compare it with `git worktree list --porcelain`: if a worktree has the branch checked out (`branch refs/heads/<branch>`) and it is not the one the file names, stop and ask. Never remove a worktree because its name looks right: another session or another person may be working in it. And `git branch -D` refuses a branch that a worktree has checked out, so a worktree nobody accounts for blocks the deletion anyway.

**Which pull request.** `gh pr list --head <branch>` matches by name, so it can return more than one:

- Ignore any with `isCrossRepository: true`: a fork's branch with the same name.
- **One is `OPEN`:** stop. The name is in use for work that has not merged, perhaps a new branch that reused it.
- **None is `MERGED`** (closed without a merge, or none found): stop and say so. Delete nothing.
- **One or more is `MERGED`:** step 2 decides, by checking that one of them holds every local commit.

### 2. Check that the merge holds every local commit

Before anything changes. A pull request that says `MERGED` only proves that what was pushed got merged. A commit made locally after the last push, or after the merge, is in no pull request, and `git branch -D` would delete it.

- **No local branch** (`git rev-parse --verify --quiet refs/heads/<branch>` prints nothing: the branch was opened on another machine, or already deleted here): this machine has no commits of it to lose, so this step is done. Step 4 has no local branch to delete, only the prune.

Otherwise, fetch the merged pull request's head and check that it contains the local branch:

```bash
git fetch origin "pull/<number>/head"
git merge-base --is-ancestor refs/heads/<branch> FETCH_HEAD && echo "every local commit is in #<number>"
git log --oneline FETCH_HEAD..refs/heads/<branch>
```

- **It prints the line, and the log is empty:** the merge holds every local commit, and `<number>` is the pull request to report. With several `MERGED` pull requests, use the one that passes. If none does, stop.
- **The log lists commits:** those commits were never merged. Stop and show them: they need a new branch and pull request, or the operator's word that they can go. Delete nothing.

### 3. Bring the base up to date

**The base is the merged pull request's `baseRefName`**: the branch GitHub merged into, which step 1 asked `gh` for. Not `scripts/base-branch.mjs`, which works the base out from this checkout's HEAD, and after a merge HEAD may be on another integration branch, or on another session's work. Write that name where the blocks below say `<base>`.

Look before you switch a checkout: another session may be using it.

- **The branch is in its own worktree** (`worktree:`): leave the main checkout on whatever branch it is on. Pull it (`git pull --ff-only origin refs/heads/<base>`) only when it is on the base with no uncommitted changes; otherwise leave it, and say so in the report.
- **The branch is in the main checkout:** it is about to switch, so its uncommitted changes are this skill's concern. If `git status --short` prints anything, stop and show it, because it may be someone's work in progress. Then:

```bash
git show-ref -q --verify refs/heads/<base> || git switch -c <base> --track refs/remotes/origin/<base>
git switch <base>
git pull --ff-only origin refs/heads/<base>
```

A tag may share the base's name (this repository has `v1` and `v2`), so the base is named in full where it could be read as one: with no local branch, `git switch <base>` refuses, because the name resolves to the tag, so the first line creates the branch from `refs/remotes/origin/<base>`; and `git pull --ff-only origin <base>` fetches the tag, says "Already up to date", and leaves the base behind, so the pull names `refs/heads/<base>`. Naming what it pulls also means a local base with no upstream set pulls too.

Uncommitted changes in a checkout this skill does not switch, pull or remove are not its concern, and do not stop it.

If the pull fails, read what it says before deciding why. Anything but "Not possible to fast-forward" (no network, a pull already in progress) is not about the base's commits: report it as git said it, and skip the update. "Not possible to fast-forward" means the local base has commits GitHub does not have. Stop and show them, and never reset the base:

```bash
git log --oneline refs/remotes/origin/<base>..refs/heads/<base>
```

### 4. Remove this session's worktree, then the branch

If the session file names a worktree, work from the main checkout, never from inside the worktree:

1. Stop anything serving or watching it (an example's `--dev`, `node docs --dev`) and close its editor window: on Windows an open file stops the removal.
2. Check that it is clean: `git -C <worktree> status --short` prints nothing. If it does, stop and ask.
3. Remove it: `git worktree remove <worktree>`.

Then, in the main checkout:

```bash
git branch -D <branch>        # only after step 2 showed every local commit merged; none with no local branch
git fetch --prune origin
```

Never use `--force`. If `git worktree remove` or `git branch -D` refuses, report why.

**The branch on GitHub** is not this skill's to delete: GitHub's "Delete branch" button, or the setting that deletes it on merge, is the owner's choice. If `git branch -r` still shows it after the prune, say so in the report with the command, and leave it.

### 5. Report

Short, decision first if there is one:

- the commit the base is at now (`git log --oneline -1`), and the pull request the merge came from;
- what was deleted: the local branch, and the worktree if there was one;
- anything left, and why: unmerged local commits, an uncommitted file in a checkout this skill had to change, a main checkout left unpulled because it is on another branch, the branch still on GitHub, a worktree the session file does not name;
- what the session file's Verdict and the pull request leave open for later.

## What this skill never does

- Delete a branch with a commit the merged pull request does not hold, or whose pull request is not merged, or a worktree with uncommitted changes.
- Remove a worktree the session file does not name.
- Switch the branch of a checkout another session is using.
- Delete the remote branch, reset or rebase the base, or force-push.
- Merge a pull request, or publish a version: both are the operator's acts.
