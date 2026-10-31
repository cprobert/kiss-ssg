---
name: kiss-branch-merged
description: Tidy up after a piece of work on a kiss-ssg site has been merged — confirm the merge really happened and holds every local commit, bring the base branch up to date, check that the merged site still builds to the knowledge base kiss-branch-close recorded, delete the local branch, prune, and remove only the worktree the session file names. Use when told "it's merged", "the PR was merged", "squashed and merged", "clean up after the merge", or after kiss-branch-close once the pull request has gone in. The last beat after kiss-branch-open, kiss-branch-pulse and kiss-branch-close.
allowed-tools: Read, Bash, Glob, Grep, AskUserQuestion
---

# Tidy up after a merge on a kiss-ssg site

The Tidy beat: `kiss-branch-open` (Frame) → `kiss-branch-pulse` (Steer) → `kiss-branch-close` (Verify) → **`kiss-branch-merged`** (Tidy). After a pull request merges, this machine still has the local branch, stale remote-tracking refs and, sometimes, the worktree `kiss-branch-open worktree` made. This skill removes them, and checks before each deletion. It writes nothing to the site: no commit, no record.

Shell state does not carry from one command to the next, so step 1 prints the base branch's name, and every later command writes that name where it says `<base>`.

## Execution instructions

**Run every command below from the site's folder**: the one with its `package.json`, `AIKB/` and `planning/sessions/`. When the site is in a subfolder of its repository, change into it first. From the repository's root, `planning/sessions` names a folder that does not exist, and a lookup finds nothing.

### 1. Find the base, the branch, the merge and the worktree

**Which branch:** the current one, or the one the conversation names. If neither says, ask. Do not guess.

```bash
BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
[ -n "$BASE" ] || BASE=$(git ls-remote --symref origin HEAD 2>/dev/null | awk '/^ref:/ { sub("refs/heads/", "", $2); print $2 }')
echo "base: ${BASE:-unknown}"
git fetch origin
git worktree list --porcelain
B=<branch>
C="refs/heads/$B"
git show-ref -q --verify "$C" || C="refs/remotes/origin/$B"
git show-ref -q --verify "$C" || echo "there is no branch $B here or on origin"
git -c core.quotePath=false ls-tree -r --full-name --name-only "$C" -- planning/sessions 2>/dev/null | while read -r f; do
  if [ "$(git show "$C:$f" | awk -v k=branch '{ sub(/\r$/, "") } NR == 1 { sub(/^\357\273\277/, ""); if ($0 !~ /^---[ \t]*$/) exit; next } /^---[ \t]*$/ { if (found) print v; exit } index($0, k ":") == 1 && !found { v = substr($0, length(k) + 2); sub(/[ \t]#.*$/, "", v); gsub(/^[ \t]+|[ \t]+$/, "", v); q = substr(v, 1, 1); if (length(v) > 1 && (q == "\"" || q == "\047") && substr(v, length(v)) == q) v = substr(v, 2, length(v) - 2); found = 1 }')" = "$B" ]; then echo "$C:$f"; fi
done
```

- **The base is the one the work merged into.** With `gh`, that is the merged pull request's `baseRefName` (below), which wins over everything else, because a pull request can be retargeted after it was opened. Without `gh`, it is the one the session file names: `kiss-branch-open` writes the branch the work merges into on its `base:` line, and that is the base for every step below: work aimed at `release` merged into `release`, whatever the remote's default is. Read it from the line the loop printed, which is the file as `<ref>:<path>`, the ref the loop read it from. Shell state does not carry between commands, so write the line in, rather than `$C`:

  ```bash
  git show '<the line the loop printed>' | awk -v k=base '{ sub(/\r$/, "") } NR == 1 { sub(/^\357\273\277/, ""); if ($0 !~ /^---[ \t]*$/) exit; next } /^---[ \t]*$/ { if (found) print v; exit } index($0, k ":") == 1 && !found { v = substr($0, length(k) + 2); sub(/[ \t]#.*$/, "", v); gsub(/^[ \t]+|[ \t]+$/, "", v); q = substr(v, 1, 1); if (length(v) > 1 && (q == "\"" || q == "\047") && substr(v, length(v)) == q) v = substr(v, 2, length(v) - 2); found = 1 }'
  ```

  It is the same `awk` the loop reads `branch:` with, given another key: the frontmatter only, so a `base:` line in the body is not the base, and a quoted value or a trailing `# comment` reads as the plain name. Only with no session file, or no `base:` line, use what the first lines printed: the local record of the remote's default branch, or the remote itself, because a repository whose remote was added by hand has no local record. An `unknown` base then means neither answered: ask which branch the work merges into. Never assume `main`.

- **The session file is read from the branch, not from this folder.** The loop reads every session file in the branch's own commits, so it finds the file wherever this skill runs: a branch opened with `kiss-branch-open worktree` committed its session file inside the worktree, and the main checkout does not have it until the base is pulled. It compares the `branch:` value in each file's frontmatter, and nowhere else, with the branch name exactly, so a dot or a slash in the name is only itself, and what an editor or a YAML habit adds still matches (Windows line endings, a byte-order mark, a quoted value, a trailing `# comment`); the `awk` is the one `kiss-branch-close` and `kiss-branch-pulse` carry. It reads the branch by its full ref name, because a tag may share the short one, and from origin's copy when there is no local branch (one opened on another machine). It prints each match as `<ref>:<path>`, which `git show` reads as it stands; `--full-name` makes the path start at the repository's root, and `core.quotePath=false` keeps git from quoting a name with an accent in it, which `git show` could not read, so the lookup also works for a site that lives in a subfolder of its repository. One file is this session's. None means the branch has no session file and made no worktree. **No branch here or on origin** (the lookup says so): the branch was opened on another machine and its remote branch was deleted on merge. This machine then has no worktree of it to remove and no commits of it to lose, so step 2 is done; carry on from step 3, with the base the remote's default gave, and say in the report that the session file could not be read. The fetch does not prune, so a branch deleted on merge keeps its `origin/` ref until step 5, and the lookup can still read it. More than one means the name was used before: stop and ask which is this session's, because a `worktree:` line read from the wrong file would remove another session's worktree.
- **The worktree this session made** is the path in the session file's `worktree:` line, and only that one is this skill's to remove. A file without the line made no worktree. If `git worktree list --porcelain` shows another worktree with the branch checked out (`branch refs/heads/<branch>`), stop and ask: someone may be working in it, and `git branch -D` refuses a branch a worktree has checked out anyway.

**Confirm the merge before deleting anything.** A squash merge, the usual choice on GitHub, puts one new commit on the base and none of the branch's own, so git alone cannot tell a squashed branch from an unmerged one; `git branch -D` would delete either.

- **GitHub, with `gh`:** `gh pr list --head <branch> --state all --json number,state,isCrossRepository,headRefOid,baseRefName,mergedAt,url`. It matches by name, so it can return more than one. Ignore any with `isCrossRepository: true` (a fork's branch with the same name). If one is `OPEN`, stop: the name is in use for unmerged work. If none is `MERGED`, stop. Otherwise step 2 checks a `MERGED` one.
- **A plain merge, any host:** `git merge-base --is-ancestor refs/heads/<branch> refs/remotes/origin/<base>` succeeds when every commit on the branch is in the base. That is proof enough, and step 2 is already done.
- **Neither can tell** (a squash on GitLab or Bitbucket, or no `gh`): ask the person to confirm the merge, with AskUserQuestion, and say that you could not check it yourself. A "not sure" stops here.

### 2. Check that the merge holds every local commit

Before anything changes. A merged pull request only proves that what was pushed got merged. A commit made locally after the last push, or after the merge, is in no pull request, and `git branch -D` would delete it.

- **No local branch** (`git rev-parse --verify --quiet refs/heads/<branch>` prints nothing: the branch was opened on another machine, or already deleted here): this machine has no commits of it to lose, so this step is done. Step 5 has no local branch to delete, only the prune.
- **On GitHub,** fetch the merged pull request's head and check that it contains the local branch:

  ```bash
  git fetch origin "pull/<number>/head"
  git merge-base --is-ancestor refs/heads/<branch> FETCH_HEAD && echo "every local commit is in #<number>"
  git log --oneline FETCH_HEAD..refs/heads/<branch>
  ```

  With several `MERGED` pull requests, use the one that passes. If none does, stop. **Any commit the log lists** was never merged: stop and show it. It needs a new branch and pull request, or the person's word that it can go. Delete nothing.

- **Where the person confirmed the merge, and the branch is still on the remote:** what was merged is what was pushed, so the commits never pushed are the ones at risk.

  ```bash
  git log --oneline refs/remotes/origin/<branch>..refs/heads/<branch>
  ```

  An empty list means every local commit was pushed, and so merged, on the person's word. Any commit it lists was never pushed: stop and show it, as above.

- **Where the person confirmed the merge, and the branch is gone from the remote** (the host deleted it on merge): nothing left on this machine says which commits the squash took. Show the person every commit the branch has that the base does not:

  ```bash
  git log --oneline refs/remotes/origin/<base>..refs/heads/<branch>
  ```

  After a squash this lists all of the branch's commits, which is expected: the squash replaced them with one new commit. Ask, with AskUserQuestion, whether the merge included every commit listed, naming the newest. A yes lets the deletion go ahead. A no, or a "not sure", stops here, and nothing is deleted.

### 3. Bring the base up to date

Look before you switch a checkout: another session may be using it.

- **The branch is in its own worktree:** leave the main checkout on whatever branch it is on. Pull it (`git pull --ff-only origin refs/heads/<base>`) only when it is on the base with no uncommitted changes; otherwise leave it, and say so in the report.
- **The branch is in the main checkout:** it is about to switch, so its uncommitted changes are this skill's concern. If `git status --short` prints anything, stop and show it, because it may be someone's work. Then:

  ```bash
  git show-ref -q --verify refs/heads/<base> || git switch -c <base> --track refs/remotes/origin/<base>
  git switch <base>
  git pull --ff-only origin refs/heads/<base>
  ```

  A tag may share the base's name (this repository has `v1` and `v2`), so the base is named in full where it could be read as one: with no local branch, `git switch <base>` refuses, because the name resolves to the tag, so the first line creates the branch from `refs/remotes/origin/<base>`; and `git pull --ff-only origin <base>` fetches the tag, says "Already up to date", and leaves the base behind, so the pull names `refs/heads/<base>`. Naming what it pulls also means a local base with no upstream set pulls too.

Uncommitted changes in a checkout this skill does not switch, pull or remove are not its concern, and do not stop it.

If the pull fails, read what it says before deciding why. "Not possible to fast-forward" means the local base has commits the remote does not: stop and show them (`git log --oneline refs/remotes/origin/<base>..refs/heads/<base>`), and never reset the base. Anything else (no network, a pull already in progress) is not about the base's commits: report it as git said it, and skip the update.

### 4. Check the merged site against its record

`kiss-branch-close` recorded the knowledge base (`AIKB/`) on the branch, and the merge brought that record onto the base. Check that the merged base still builds to it, in a checkout that is on the merged base:

- **The branch was in the main checkout:** step 3 left it on the merged base, when step 3 updated it. Run the check there. If step 3 skipped the update (the pull failed), the checkout is on an older base, and a check there would report the merge as drift: skip the check, and say why in the report.
- **The branch was in its own worktree:** run it in that worktree, which has its own `node_modules`, after moving it onto the merged base. It must be clean first (`git -C <worktree> status --short` prints nothing; if not, stop and ask). Step 5 removes it afterwards.

  ```bash
  git -C <worktree> checkout --detach refs/remotes/origin/<base>
  ```

- **No checkout is on the merged base** (no worktree, and a main checkout left on another branch): skip the check, and say why in the report. A check run anywhere else describes that other branch, not the merge.

```bash
if [ -L node_modules/kiss-ssg ]; then echo "kiss-ssg is linked to $(readlink node_modules/kiss-ssg): not installing"
elif [ -f package-lock.json ]; then npm ci
else npm install --no-package-lock; fi &&
npx kiss-ssg check --summary <build-script>
```

Run it from that checkout. The install comes first because the merge may have changed the dependencies, kiss-ssg among them, and a check run on the old `node_modules` describes the old engine, not the merged base. `npm ci` installs exactly what the lockfile says and never rewrites it, and with no lockfile `--no-package-lock` keeps `npm install` from writing one, so the checkout stays clean for step 5; if the install fails, report that and skip the check. A `node_modules/kiss-ssg` that is a link to a working tree (`npm link`) is the engine the person chose, and `npm ci` would delete it for the registry's copy, so nothing is installed: the check runs the linked engine, and the report says so, with the link's target. `--summary` goes before the script. Find the build script the way `kiss-site-brief` does (`package.json` scripts).

- **`ok`, and no diff against the record:** the base is exactly what the close verified.
- **A diff:** something else reached the base too — another branch merged after this one was recorded, or a merge conflict was resolved by hand. Do not record here, and do not commit to the base: report the diff, and say that the next `kiss-branch-open` will treat it as inherited drift and the next `kiss-branch-close` will record over it.
- **A failure:** the merged base does not build. That is the first thing to fix, on a new branch. Report it at the top.

**Then look at that checkout again** (`git status --short` in it). It was clean before the check: step 3 made sure of the main checkout, and the worktree bullet above of the worktree. So anything it prints now, the install or the check wrote, usually a pipeline step (`assets.pipeline`) that writes into a tracked folder. Put back exactly what it lists, and nothing else: `git restore -- <file>` for each changed file, and `git clean -f -- <file>` for each new one, leaving `node_modules/` alone. Otherwise step 5 finds a worktree that is not clean and stops, and a main checkout is left with changes nobody made. Say in the report which files the build writes into the source: that is worth a look on its own, on a later branch, not here.

### 5. Remove this session's worktree, then the branch

If the session file names a worktree, work from the main checkout, never from inside the worktree:

1. Stop its dev server (`.watch()`) and close its editor window: on Windows an open file stops the removal.
2. Check that it is clean: `git -C <worktree> status --short` prints nothing. If it does, stop and ask.
3. `git worktree remove <worktree>`.

Then, in the main checkout:

```bash
git branch -D <branch>        # only after step 2 showed every local commit merged; none with no local branch
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
