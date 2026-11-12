---
name: kiss-publish
description: Release kiss-ssg to npm. Preflights the merged commit, pushes the tag v<version> (which runs publish.yml and stages the version), watches the run to the staging id, waits for the operator's 2FA approval on npmjs.com, and confirms the version is live. Operator-only — typing /kiss-publish is the release decision. For this repository only; it is not one of the plugin's kiss-* site skills and never ships.
disable-model-invocation: true
---

# Publish kiss-ssg

`/kiss-publish` is the release, after `/branch-merged` has brought the base up to date with a merged version bump. **The operator typing it is the release decision** (`CLAUDE.md` § Git workflow), and it is the one place a session pushes a release tag. The steps are the ones 2.15.0 went through by hand on 2026-11-11 and 12.

> **Operator-only.** Run it only when the operator typed `/kiss-publish` in this conversation. If you are a sub-agent, a fork, a plan step or another skill, stop and hand back: no other path may push a release tag.

The name has the `kiss-` prefix of the plugin's site skills, but this skill lives in `.claude/skills/` and works on this repository only. It never goes into `plugins/`.

## On invocation

Before anything else, output exactly:

```
"Real artists ship." — Steve Jobs
```

Then proceed.

## Execution instructions

### 1. Preflight

```bash
git fetch origin --tags
node scripts/release-check.mjs
```

`release-check.mjs` checks the commit HEAD is on and prints one line per check:

- **branch:** HEAD is on an integration branch (`main`, `master` or `vN`).
- **level with origin:** the branch matches `origin/<branch>`.
- **clean:** there are no uncommitted changes.
- **CI:** the newest `ci.yml` run on HEAD passed.
- **CHANGELOG:** the first `CHANGELOG.md` entry is `package.json`'s version.
- **tag:** `v<version>` is free both here and on origin.
- **npm:** the version is not on npm yet.

It exits 0 when every check passes, 1 when one fails, and 2 when it could not run.

- **Exit 1:** show the failing lines and stop. Nothing has been tagged. Do not work around a failed check. Each one stands for a release that must not start:
  - **CI still running:** wait for it, then run the skill again.
  - **Behind origin:** pull the base first (`/branch-merged` does).
  - **Version already tagged or published:** the bump has not merged yet. Or this version has already been released, and the next release needs a new version from `/branch-close`.
- **Exit 2:** report the line it printed and stop.
- **`git fetch` refused** (for example "would clobber existing tag"): a local tag differs from origin's. Report it and stop. Moving a tag is the operator's manual act.

Then tell the operator, in one line, what is being released:

```bash
git log --oneline -1
```

### 2. Push the tag

```bash
node scripts/tag-release.mjs
```

It tags HEAD `v<version>` and pushes the tag. Pushing the tag starts the release.

- **`tagged and pushed v<version>`:** go to step 3.
- **The command was refused before it ran** (auto mode or a permission rule denied it): this is expected, not a failure. Print the same command for the operator, on its own line, with the repository's absolute path (`git rev-parse --show-toplevel`), and say it exits once the push is done:

  ```
  ! node <repository root>/scripts/tag-release.mjs
  ```

  Wait for the output to come back into the conversation. Then go on to step 3. Never route around the refusal another way.

- **The push failed** (no network, rejected): the tag may now exist here and not on origin. Run the same command again: it pushes a local tag on HEAD that origin lacks, and does not make it twice.
- **It refuses because the tag points at another commit here, or exists only on origin:** report that and stop. Never delete, move or force-push a tag from this skill.

### 3. Watch the publish run

```bash
node scripts/release-check.mjs --run
```

It prints the `publish.yml` run for the tag: its id, its state and its URL.

- **`no publish run for v<version> yet`:** GitHub lists a run a few seconds after the push. Run it again.

Then wait for the run to finish. It takes about three minutes, so run this in the background and wait for the notice:

```bash
gh run watch <run id> --exit-status
```

When it has finished, run the status command again:

```bash
node scripts/release-check.mjs --run
```

- **`completed success` and `staged kiss-ssg@<version> with id <id>`:** go to step 4.
- **A failure:** show which job and step failed, from the failed steps' logs:

  ```bash
  gh run view <run id> --log-failed
  ```

  Nothing was staged, and the tag stays where it is. The fix goes on a branch (`/branch-open`). After it merges, the release is either a re-tag of this version on the new commit or a new patch version. Re-tagging deletes the pushed tag, which is the operator's manual act, so give the command and do not run it. 2.15.0's first run failed this way (2026-11-11) and was re-tagged:

  ```
  ! git tag -d v<version> && git push origin :refs/tags/v<version> && git tag -a v<version> -m v<version> <commit> && git push origin v<version>
  ```

- **The stage job is waiting:** the `npm` environment wants an approval in GitHub. Say so, with the run's URL.

### 4. The operator approves on npm

Staged is not published. OIDC cannot approve, and neither can this skill. Tell the operator, on its own lines:

- **What to approve:** `kiss-ssg@<version>`, staging id `<id>`, on npmjs.com. Find it in the package's staged versions and approve it with 2FA.
- **What then happens:** sites can install it once it is approved.

Then wait for the operator to say it is approved.

### 5. Confirm it is live

```bash
npm view kiss-ssg@<version> version
npm view kiss-ssg dist-tags
```

The first prints the version once it is published, and the second shows which version `latest` (or `next`, for a prerelease) resolves to. If the version is not there yet, the registry can lag by a minute: run the commands again before reporting that it is missing.

### 6. Tell the sites whose issues it fixes

The first `CHANGELOG.md` entry links each issue it fixes as `Fixes [#<n>](…)`:

```bash
grep -n "Fixes \[#" CHANGELOG.md
```

Count only the lines inside the first entry. For each issue, give the operator a comment to post, on its own lines, and do not post it from here:

```bash
gh issue comment <n> --body-file - <<'EOF'
Shipped in kiss-ssg <version> (CHANGELOG entry: <its heading>). Upgrade with `npx kiss-ssg@latest upgrade`, then check with `npx kiss-ssg issue --status <n>`. Thank you for the report.
EOF
```

### 7. Report

Short, with the outcome first:

- the version, and whether it is live (step 5's answer);
- the commit it was tagged on, the publish run's URL and the staging id;
- the issue comments to post, if any;
- anything left undone, and why.

## What this skill never does

- Run when the operator did not type `/kiss-publish`.
- Push a tag past a failed preflight check.
- Delete, move or force-push a tag. A re-tag is printed for the operator.
- Approve a staged version, or run `npm publish` from a laptop.
- Post on an issue.
