---
name: kiss-close
description: Finish a piece of work on a kiss-ssg site — verify the build diff against the intent captured at kiss-open, prove the site's knowledge base was kept up (notes for every controller, URL model and pipeline step the change touched), regenerate and commit `AIKB/`, write the reflection into the session file, and push. Use when asked to "close the branch", "wrap this up", "we're done, ship it", "finish this change", or "write the retrospective" on a kiss-ssg site. Opens a pull request only when asked.
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
npx kiss-ssg check --against AIKB/last-build.json --summary <build-script>
```

`--against` and `--summary` go **before** the script: everything after the script is passed through to the site's own build script.

Three things must hold, and each is a hard stop:

- **`ok: true`** on every report, exit 0. A failing page is never closed over.
- **Every success criterion met**, with the diff line that proves it. Criteria marked "eyeball" go to the human to look at — do not tick them yourself.
- **Nothing in the diff that no criterion asked for.** Each `+`, `-` or `~` is either claimed by a criterion, explained (a shared partial legitimately changed those pages), or a finding. An unexplained `-` is a page that has silently disappeared.

If the intent moved during the work, it should already be a dated **Amendment**; judge against intent-plus-amendments, and say in the Verdict whether that was good drift or scope creep.

### 3. Prove the knowledge base kept up

The map regenerates itself; the judgement does not. Two checks:

**a. No subject is unexplained.** The report's `aikb.notes.missing` must be empty — every controller file, URL model and pipeline step in the map has a note under `AIKB/notes/`. Write the missing ones now (`## What it does`, `## Why it is this way`, `## Gotchas`) rather than closing with a gap. Anything in `aikb.notes.dead` is a note whose subject is gone: delete it, or fix the map if the subject should still be there.

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

### 4. Regenerate `AIKB/` for real, and commit it

`check` publishes nothing, so it does not refresh the knowledge base. Run the site's own build:

```bash
npm run build   # or: node <build-script>
git status --short AIKB
git add AIKB planning/sessions/<file> <the rest of the change>
git commit -m "<what changed on the site>"
```

`AIKB/site-map.md`, `AIKB/site-map.json` and `AIKB/last-build.json` are byte-stable across identical builds, so a diff here is a real change to the site's shape — read it before committing it, and let the new `last-build.json` be the baseline the next `--against` compares to. If the build wrote no `AIKB/` at all, the site does not call `.aikb()`: say so and offer to add it (`node_modules/kiss-ssg/llms.txt` has the method).

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

**Open a pull request only if the user asks.** If they do, seed the Summary from the Objective and the test plan from the Success criteria, so the reviewer reads the intent beside the diff. Otherwise report: build green, criteria met, notes up to date, `AIKB/` regenerated and committed, reflection written, branch pushed.

Finish with three lines to the console — what shipped and the verdict, the competency level, and the single most useful piece of feedback — so nobody has to open the file to get the point.
