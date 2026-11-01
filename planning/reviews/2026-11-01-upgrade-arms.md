# `kiss-ssg upgrade` and the method-only `kiss-site-migrate`: the 2026-11-01 arms

Measured on `feat/upgrade-command` at `cda9ea9`. **One run per arm: a signal, not a verdict.**

## How the arms ran

Each arm was one headless `claude -p` session (`claude-opus-5-5`, Claude Code 2.1.316). Each ran in
its own scratchpad copy, with these settings:

- `--setting-sources local`, `--strict-mcp-config`, `--no-chrome`;
- one `--plugin-dir`;
- a deny list for commit, push, remote, `gh`, publish and deploy;
- `--max-budget-usd 6`;
- its own npm cache.

The engine was this branch, packed as 2.9.0 with the draft 2.9.0 changelog entry. It was
published to a verdaccio run from the scratchpad (`127.0.0.1:4873`), which served kiss-ssg from
itself only and proxied npmjs for everything else. Nothing was published to npm.

The operator launched the arms (`run-arms.mjs`) because the session's permission check refused
the launch: `--dangerously-skip-permissions` read as creating unsafe agents. A first launch was
interrupted, and the runner buffered output until exit, so nothing of that launch survived. The
runner was changed to stream transcripts, every copy was rebuilt from source, and the arms ran
again. These are the results of that second run.

What was done with each arm is counted from its stream-json transcript (tool calls and the
command's own output lines), not from the agent's account. The real `C:\Code\kiss\swan-love` was
only read; it was `git status`-clean at `c23a268` afterwards.

| Arm         | Site                                                                                                          | Plugin                   | Brief                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------- |
| `fleet-old` | swan-love (`c23a268`): `^2.6.2` declared, **2.5.0 installed**, lockfile 2.6.2, `AIKB/` recorded, 11 pages     | `main`'s `kiss-ssg`      | "Upgrade this site to the latest kiss-ssg and tell me what changed."        |
| `fleet-new` | the same, from the same commit                                                                                | this branch's `kiss-ssg` | the same                                                                    |
| `cleanroom` | made by the published 2.8.0's `init`, then `file:../main-tree` (a link to `main` at 2.8.7), committed, 1 page | this branch's `kiss-ssg` | the same, plus "When you have finished, list every place you had to guess." |

## Results

| Arm         | Reached                                                                                                                                                                                                              | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Cost, time   |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `fleet-old` | 2.9.0 installed; `check` ok, 11 pages byte-identical to the record. Not committed: it judged the registry unfit for deploy and asked                                                                                 | The old skill's manual steps (`npm pkg get` ×2, `npm ls`, `npm ci`, `npm install kiss-ssg@^2.9.0`), then read the CHANGELOG. **It then found and ran `npx kiss-ssg upgrade --plan --from 2.6.2`**, because the 2.9.0 entry told it to. It started the notes from the lockfile's 2.6.2 rather than the installed 2.5.0, so it skipped 2.6.0's note (harmless here). It also rewrote the lockfile's registry URLs to npmjs with `sed -i`, including one for a 2.9.0 tarball npmjs does not have. | $0.67, 130 s |
| `fleet-new` | 2.9.0, `^2.9.0`, lockfile pinned from the registry, not a link; `check` ok, 11 unchanged; `AIKB/` re-recorded                                                                                                        | `upgrade --plan`, then `upgrade`. It started from the installed 2.5.0 and printed the disagreement with the lockfile. It worked every note from 2.6.0 to 2.9.0 against the site, with a table of applies / does not. It tried to rebuild the old version for a byte comparison; the registry held only 2.9.0. **It tried to commit**; the deny list stopped it.                                                                                                                                | $0.50, 94 s  |
| `cleanroom` | `file:` link replaced: the command printed `ok: … is 2.9.0, not a link`, `ok: package.json asks for ^2.9.0`, `ok: package-lock.json pins kiss-ssg 2.9.0`. `check` ok; `diff -r` against a pre-upgrade build is empty | `upgrade --plan` (unknown start, so every note since 2.4.0), then `--plan --from 2.8.7` read off the linked tree, then the install. It recorded `AIKB/`. It did not commit ("you hadn't asked me to"). It listed five guesses.                                                                                                                                                                                                                                                                 | $0.38, 79 s  |

Total: $1.55. Session criteria: **8 met** (`fleet-new`) and **9 met** (`cleanroom`).

## What the arms found

1. **Step 5 reads as an instruction to commit.** "Commit `package.json`, the lockfile, `AIKB/` and
   the fixes the notes asked for as one upgrade" led `fleet-new` to run `git commit` unasked. The
   `cleanroom` arm read the same words and asked first. The sentence is ambiguous.
2. **The command's verification lines are easy to filter away.** `fleet-new` piped the install run
   through `grep -v '^## \|^- \|^ '` to skip the notes, which also dropped the `  ok:` lines,
   because they are indented like note text. It confirmed the version by hand instead. Nothing
   failed, so nothing was hidden, but a `FAILED:` line would have been hidden the same way.
3. **A linked tree's version is the first guess an agent makes.** `cleanroom` took `--from 2.8.7`
   from `../main-tree/package.json`. Then, because a working tree can carry unreleased changes, it
   read every note since 2.4.0 as well. The command knows that version (`describeEngine` reads it)
   and says only "unknown".
4. **The 2.9.0 note reaches an agent that does not have the new skill.** `fleet-old` found the
   command through the changelog alone. The note is the one channel every upgrading agent reads,
   whatever plugin version it has.

## What this harness cannot say

- **The scratchpad registry shaped behaviour.** `fleet-old` refused to commit, and `sed`-edited
  the lockfile, because the registry was local. `cleanroom` listed it as a guess. A real upgrade
  against npmjs has neither prompt. It also held only 2.9.0, so no arm could rebuild the old
  version for a byte comparison. The fleet arms relied on `check`'s diff against the record; the
  clean room had its own pre-upgrade build.
- **`fleet-old` is not a clean "without".** The engine it installed carried the command and the
  note that names it.
- **One site, already in good shape for an upgrade.** No note required a code change. A site
  that hits a note's failure (a `package` key, a SCORM page, a section-wide `aria-current`) is the
  bench that would show whether the method holds under a real fix.
