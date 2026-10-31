---
name: kiss-branch-merged
description: Tidy up after a piece of work on a kiss-ssg site has been merged — confirm the merge really happened and holds every local commit, bring the base branch up to date, check that the merged site still builds to the knowledge base kiss-branch-close recorded, delete the local branch, prune, and remove only the worktree the session file names. Use when told "it's merged", "the PR was merged", "squashed and merged", "clean up after the merge", or after kiss-branch-close once the pull request has gone in. The last beat after kiss-branch-open, kiss-branch-pulse and kiss-branch-close.
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

# Tidy up after a merge on a kiss-ssg site

The Tidy beat: `kiss-branch-open` (Frame) → `kiss-branch-pulse` (Steer) → `kiss-branch-close` (Verify) → **`kiss-branch-merged`** (Tidy). After a pull request merges, this machine still has the local branch, stale remote-tracking refs and, sometimes, the worktree `kiss-branch-open worktree` made. This skill removes them, and checks before each deletion. It writes nothing to the site: no commit, no record.

Shell state does not carry from one command to the next, so step 1 prints the base branch's name, and every later command writes that name where it says `<base>`.

## Execution instructions

### 1. Find the base, the branch, the merge and the worktree

**Which branch:** the current one, or the one the conversation names. If neither says, ask. Do not guess.

```bash
BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
[ -n "$BASE" ] || BASE=$(git ls-remote --symref origin HEAD 2>/dev/null | awk '/^ref:/ { sub("refs/heads/", "", $2); print $2 }')
echo "base: ${BASE:-unknown}"
git fetch --prune origin
git worktree list --porcelain
git grep -lE "^branch: <branch>[[:space:]]*$" <branch> -- planning/sessions
```

- **The base:** the first line asks the local record of the remote's default branch, and the second asks the remote itself, because a repository whose remote was added by hand has no local record. An `unknown` base means neither answered: ask which branch the work merges into. Never assume `main`.
- **The session file is read from the branch, not from this folder.** `git grep … <branch>` searches the branch's own commits, so it finds the file wherever this skill runs: a branch opened with `kiss-branch-open worktree` committed its session file inside the worktree, and the main checkout does not have it until the base is pulled. It prints `<branch>:planning/sessions/<file>`; read it with `git show <branch>:planning/sessions/<file>`. The pattern allows trailing whitespace, so a file with Windows line endings matches too.
- **The worktree this session made** is the path in the session file's `worktree:` line, and only that one is this skill's to remove. A file without the line made no worktree. If `git worktree list --porcelain` shows another worktree with the branch checked out (`branch refs/heads/<branch>`), stop and ask: someone may be working in it, and `git branch -D` refuses a branch a worktree has checked out anyway.

**Confirm the merge before deleting anything.** A squash merge, the usual choice on GitHub, puts one new commit on the base and none of the branch's own, so git alone cannot tell a squashed branch from an unmerged one; `git branch -D` would delete either.

- **GitHub, with `gh`:** `gh pr list --head <branch> --state all --json number,state,isCrossRepository,headRefOid,mergedAt,url`. It matches by name, so it can return more than one. Ignore any with `isCrossRepository: true` (a fork's branch with the same name). If one is `OPEN`, stop: the name is in use for unmerged work. If none is `MERGED`, stop. Otherwise step 2 checks a `MERGED` one.
- **A plain merge, any host:** `git merge-base --is-ancestor <branch> origin/<base>` succeeds when every commit on the branch is in the base. That is proof enough, and step 2 is already done.
- **Neither can tell** (a squash on GitLab or Bitbucket, or no `gh`): ask the person to confirm the merge, with AskUserQuestion, and say that you could not check it yourself. A "not sure" stops here.

### 2. Check that the merge holds every local commit

Before anything changes. A merged pull request only proves that what was pushed got merged. A commit made locally after the last push, or after the merge, is in no pull request, and `git branch -D` would delete it.

- **On GitHub,** fetch the merged pull request's head and check that it contains the local branch:

  ```bash
  git fetch origin "pull/<number>/head"
  git merge-base --is-ancestor <branch> FETCH_HEAD && echo "every local commit is in #<number>"
  git log --oneline FETCH_HEAD..<branch>
  ```

  With several `MERGED` pull requests, use the one that passes. If none does, stop.

- **Where the person confirmed the merge:** show them what you cannot check. `git log --oneline origin/<branch>..<branch>` lists commits never pushed, while the remote branch still exists; once it is gone, `git log --oneline origin/<base>..<branch>` lists every commit not visibly in the base. Ask before going on.

**Any commit listed** was never merged. Stop and show it: it needs a new branch and pull request, or the person's word that it can go. Delete nothing.

### 3. Bring the base up to date

Look before you switch a checkout: another session may be using it.

- **The branch is in its own worktree:** leave the main checkout on whatever branch it is on. Pull it (`git pull --ff-only`) only when it is on the base with no uncommitted changes; otherwise leave it, and say so in the report.
- **The branch is in the main checkout:** it is about to switch, so its uncommitted changes are this skill's concern. If `git status --short` prints anything, stop and show it, because it may be someone's work. Then `git checkout <base>` and `git pull --ff-only`.

Uncommitted changes in a checkout this skill does not switch, pull or remove are not its concern, and do not stop it.

A failed `--ff-only` means the local base has commits the remote does not. Stop and show them (`git log --oneline origin/<base>..<base>`); never reset the base.

### 4. Check the merged site against its record

`kiss-branch-close` recorded the knowledge base (`AIKB/`) on the branch, and the merge brought that record onto the base. Check that the merged base still builds to it, in a checkout that is on the merged base:

- **The branch was in the main checkout:** step 3 left it on the merged base. Run the check there.
- **The branch was in its own worktree:** run it in that worktree, which has its own `node_modules`, after moving it onto the merged base. It must be clean first (`git -C <worktree> status --short` prints nothing; if not, stop and ask). Step 5 removes it afterwards.

  ```bash
  git -C <worktree> checkout --detach origin/<base>
  ```

- **No checkout is on the merged base** (no worktree, and a main checkout left on another branch): skip the check, and say why in the report. A check run anywhere else describes that other branch, not the merge.

```bash
npx kiss-ssg check --summary <build-script>
```

Run it from that checkout. `--summary` goes before the script. Find the build script the way `kiss-site-brief` does (`package.json` scripts).

- **`ok`, and no diff against the record:** the base is exactly what the close verified.
- **A diff:** something else reached the base too — another branch merged after this one was recorded, or a merge conflict was resolved by hand. Do not record here, and do not commit to the base: report the diff, and say that the next `kiss-branch-open` will treat it as inherited drift and the next `kiss-branch-close` will record over it.
- **A failure:** the merged base does not build. That is the first thing to fix, on a new branch. Report it at the top.

### 5. Remove this session's worktree, then the branch

If the session file names a worktree, work from the main checkout, never from inside the worktree:

1. Stop its dev server (`.watch()`) and close its editor window: on Windows an open file stops the removal.
2. Check that it is clean: `git -C <worktree> status --short` prints nothing. If it does, stop and ask.
3. `git worktree remove <worktree>`.

Then, in the main checkout:

```bash
git branch -D <branch>        # only after step 2 showed every local commit merged
git fetch --prune origin
```

Never use `--force`. If `git worktree remove` or `git branch -D` refuses, report why. The branch on the remote is not this skill's to delete: leave it to the host's "Delete branch" button or setting, and mention it in the report if `git branch -r` still shows it.

### 6. Report

Short, decision first if there is one: the commit the base is at now, and the pull request the merge came from; step 4's result (the merged site matches its record, the drift, the failure, or why it was skipped); what was deleted; anything left and why (unmerged local commits, a main checkout left unpulled because it is on another branch, the branch still on the remote); and what the session file's Verdict leaves open.

## What this skill never does

- Delete a branch with a commit the merge does not hold, or whose merge it could not confirm, or a worktree with uncommitted changes.
- Remove a worktree the session file does not name.
- Assume the base is `main`.
- Record the knowledge base, or commit anything: the base moves only through a merge, and the record moves only at `kiss-branch-close`.
- Delete the remote branch, reset the base, or force-push.
