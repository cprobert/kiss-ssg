---
name: kiss-close
description: Finish a piece of work on a kiss-ssg site — verify the build diff against the intent captured at kiss-open, prove the site's knowledge base was kept up (notes for every controller, URL model and pipeline step the change touched), record and commit `AIKB/`, write the reflection into the session file, and push. Use when asked to "close the branch", "wrap this up", "we're done, ship it", "finish this change", or "write the retrospective" on a kiss-ssg site. Opens a pull request only when asked.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Close a piece of work on a kiss-ssg site

The Verify beat. Two questions, in order: **did the site end up how we said it would**, and **did we leave enough behind for the next person** — who may be you, in two years, with no memory of any of this. The second question is the one every project skips, so it is a gate here, not a nicety.

Run this only when the human asks to close. Never on your own initiative, and never from a sub-agent.

## Execution instructions

### 1. Find the intent and the base

```bash
BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
BASE=${BASE:-main}
git branch --show-current
git log "$BASE..HEAD" --oneline
git status --short
```

Stop if you are on the base branch, or if there are no commits to close. Find the session file (`grep -rl "branch: $(git branch --show-current)$" planning/sessions/*.md`) and read its **Intent**, **Amendments** and **Pulse log**. No session file: reconstruct the intent from the work and say in the reflection that it is self-reported, not captured.

Commit or stash anything outstanding before verifying — the check runs the working tree, so uncommitted work would be verified and then not shipped.

### 2. Verify the build and the diff

```bash
npx kiss-ssg check --summary <build-script>
```

`--summary` goes **before** the script: everything after the script is passed through to the site's own build script.

The diff needs no flag. The check compares this build against the site's record — `AIKB/last-build.json`, written the last time somebody closed a piece of work — and prints `+ - ~ = N unchanged` under the report line. Nothing since has moved that baseline (builds, dev servers and watch rebuilds never write it), so the block is the whole of what this branch did to the site's output. If no block appears, the site has never been recorded: verify the criteria against the page list by eye, say so in the Verdict, and step 4 gives the next branch a baseline.

Three things must hold, and each is a hard stop:

- **`ok: true`** on every report, exit 0. A failing page is never closed over.
- **Every success criterion met**, with the diff line that proves it. Criteria marked "eyeball" go to the human to look at — do not tick them yourself.
- **Nothing in the diff that no criterion asked for.** Each `+`, `-` or `~` is either claimed by a criterion, explained (a shared partial legitimately changed those pages), or a finding. An unexplained `-` is a page that has silently disappeared.

If the intent moved during the work, it should already be a dated **Amendment**; judge against intent-plus-amendments, and say in the Verdict whether that was good drift or scope creep.

### 3. Prove the knowledge base kept up

The map is generated for you at step 4; the judgement in it never is. Two checks:

**a. No subject is unexplained.** The check evaluates the note rules on any site that has recorded once (a site that never has reports `aikb: null`, and gets its first record in step 4). The report's `aikb.notes.missing` must be empty — every controller file, URL model and pipeline step in the map has a note under `AIKB/notes/`. Write the missing ones now (`## What it does`, `## Why it is this way`, `## Gotchas`) rather than closing with a gap. Anything in `aikb.notes.dead` is a note whose subject is gone: delete it, or fix the map if the subject should still be there.

**b. Every subject this change touched has a note that changed with it.**

```bash
git diff --name-only "$BASE...HEAD"
```

From that list, take the subjects the change actually touched — files under the controllers folder, URL models and pipeline steps added or edited in the build script — and confirm the matching note is in the same list:

| Touched                                               | Note that must have changed with it              |
| ----------------------------------------------------- | ------------------------------------------------ |
| a controller file, e.g. `controllers/stockist.js`     | `AIKB/notes/controllers/stockist.md`             |
| a URL model, e.g. `https://api.example.com/v2/events` | `AIKB/notes/models/api.example.com-v2-events.md` |
| a pipeline step, e.g. `tailwind`                      | `AIKB/notes/pipeline/tailwind.md`                |

A note that did not move while its subject did is the failure mode this gate exists to catch: the code changed, the reason nobody wrote down. Update it — even one line under `## Gotchas` — before continuing. A genuinely note-free change (a typo in a controller comment) is a judgement call: say out loud that you are skipping it and why.

### 4. Record the knowledge base, and commit it

Nothing else writes `AIKB/`. Not a build, not the dev server, not a watch rebuild, not `check` — only this command, and only here:

```bash
npx kiss-ssg aikb <build-script>
```

**This is the only moment the baseline moves.** That is the whole design: because the record sits still while a branch is open, the diff `kiss-pulse` and step 2 read answers "since this piece of work opened" rather than "since somebody last ran a build". Moving it early costs the branch its own measurement, so record here, after the verification, and nowhere else.

It runs the site's build staged and discarded exactly as `check` does, so it publishes no site; what it writes is the knowledge base in `config.folders.aikb` (default `./AIKB`): `README.md` if it is not there yet, then `site-map.md`, `site-map.json` and `last-build.json`.

**`not recorded — build failed` is a hard stop.** A record only ever describes a build that worked, so a failure writes nothing at all. Do not commit around it, and do not close: go back to step 2, fix the failure, and record again.

Read what it wrote before you commit it:

```bash
git status --short AIKB
git diff -- AIKB
git add AIKB planning/sessions/<file> <the rest of the change>
git commit -m "<what changed on the site>"
```

The three generated files are byte-stable across identical builds, so every line of that diff is a real change to the site's shape — the pages, models, controllers, partials and pipeline steps the branch moved. It should read like the change you just verified; anything in it you cannot account for is a finding, and belongs in the Verdict. The `last-build.json` you commit is the baseline the next branch's checks diff against.

### 5. Write the reflection into the session file

Append it beneath the marker at the bottom of the session file — Intent, Amendments and Pulse log above it stay untouched — then flip `status: open` to `closed`. Score the session against the seven dimensions and four competency levels in [`rubric.md`](./rubric.md), beside this skill; use its names bare, they are the shared vocabulary.

Four sections:

- **Reflect — what the session was.** How clearly was the change framed before work began; was it planned or emergent, and did that shape serve it?
- **Evaluate — how the human supervised the AI.** The heart of it. Lead with the two or three rubric dimensions that actually discriminated this session, not all seven as a scorecard. Name where the human intended to supervise versus where they actually did — the pulse cadence in the log is direct evidence. End on a named competency level, earned by the evidence, no flattery.
- **Feedback — recommendations for next time.** Both partners, every item ending in a concrete next-time change. This is the section `kiss-open` reads back at the start of the next piece of work, so write it to be inherited: vague advice comes back to haunt you three sessions running.
- **Verdict — did we achieve the objective?** Re-state the brief, tick each success criterion `[x]` / `[ ]` with its evidence, and say **met / partially met / the objective moved**. State what is concretely better on the site now, and what remains open.

Be specific — name the pages, the partial, the controller, the failure mode. A reflection that could describe any session has no value to the person who reads it in two years.

Commit it:

```bash
git add planning/sessions/<file>
git commit -m "Close: reflection + status"
```

### 6. Push, and stop

```bash
git push -u origin HEAD
```

**Open a pull request only if the user asks.** If they do, seed the Summary from the Objective and the test plan from the Success criteria, so the reviewer reads the intent beside the diff. Otherwise report: build green, criteria met, notes up to date, `AIKB/` recorded and committed, reflection written, branch pushed.

Finish with three lines to the console — what shipped and the verdict, the competency level, and the single most useful piece of feedback — so nobody has to open the file to get the point.
