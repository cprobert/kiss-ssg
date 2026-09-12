---
name: kiss-branch-close
description: Finish a piece of work on a kiss-ssg site — verify the build diff against the intent captured at kiss-branch-open, prove the site's knowledge base was kept up (notes for every controller, URL model and pipeline step the change touched), record and commit `AIKB/`, write the reflection into the session file, and push. Use when asked to "close the branch", "wrap this up", "we're done, ship it", "finish this change", or "write the retrospective" on a kiss-ssg site. Opens a pull request only when asked.
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
- **No `broken link:` line.** The check scans every page this build wrote; a broken internal link is a change to the site a reader will hit. Fix the template or model that wrote it. `removed without redirect:` is the same kind of stop: a page the last record had is gone and nothing sends its old URL anywhere — add the old path to the new page's `aliases`, or state in the session file that the page is meant to be gone and why. `alias collides with a page:` means the host will silently ignore that rule; fix the alias.
- **Nothing in the diff that no criterion asked for.** Each `+`, `-` or `~` is either claimed by a criterion, explained (a shared partial legitimately changed those pages), or a finding. An unexplained `-` is a page that has silently disappeared.

If the intent moved during the work, it should already be a dated **Amendment**; judge against intent-plus-amendments, and say in the Verdict whether that was good drift or scope creep.

### 3. Prove the knowledge base kept up

The map is generated for you at step 4; the judgement in it never is. Two checks:

**a. No subject is unexplained, and no note has rotted.** The check evaluates the note rules on any site that has recorded once (a site that never has reports `aikb: null`, and gets its first record in step 4). It reports four lists on `aikb.notes`, printed in the summary as four lines. None of them changes the exit code — they are readings, and this step is the gate that makes two of them matter:

| Line             | What it means                                                                                                                 | At a close                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `note missing:`  | a controller file, URL model or pipeline step in the map with no note under `AIKB/notes/`                                     | **hard stop.** Write the note now (`## What it does`, `## Why it is this way`, `## Gotchas`) rather than closing with a gap             |
| `note stale:`    | a stamped note whose `subject-hash` differs from the subject's current hash — the code moved on this branch, the note did not | **hard stop, the same one.** This is precisely the failure this close exists to catch: re-read the subject, update the note, restamp it |
| `note dangling:` | `"<note path>: <token>"` — a backticked file-looking reference, in a note or in `AIKB/site.md`, that resolves to nothing      | **fix before recording.** Point it at where the file lives now, or rewrite the sentence so it does not need it                          |
| `note dead:`     | a note whose subject has left the map                                                                                         | delete it — or, if the subject went missing by mistake, restore the subject and keep the note, and say which you did                    |

All four must be empty before step 4 records. Recording a build whose notes are stale or dangling bakes the rot into the baseline the next branch reads.

**Stamp every note you write or update.** The stamp is the one frontmatter line `subject-hash: <sha1>`. Take the hash from the **check's report**, not from the map on disk: `AIKB/site-map.json` is the last record's and holds the old hash for any subject this branch changed, while every check reports the current hashes under `aikb.subjects` — entries of `{ kind, id, note, hash }`; take the `hash` of the entry whose `note` is this note's path:

```bash
npx kiss-ssg check <build-script> 2>/dev/null \
  | node -e "for (const r of JSON.parse(require('fs').readFileSync(0,'utf8')).reports ?? JSON.parse(require('fs').readFileSync(0,'utf8'))) for (const s of r.aikb?.subjects ?? []) console.log(s.hash, s.kind, s.id, s.note)"
```

(The JSON is `{ reports, diff }` when the site has a baseline and a bare array when it has not.) The stamp goes at the very top of the note:

```markdown
---
subject-hash: 9f2c1b0a4e7d83f6c5b21a908d7e6f4c3b2a1908
---

# controllers/stockist.js

## What it does

…
```

The engine never writes that line; this skill does. It is what lets the next check say "this note was written against a different version of this code" instead of everybody having to reread both. Read the hash out of the report — never invent one, and never stamp a note you have not actually brought up to date, because a wrong stamp silences the very warning it exists to raise. Leaving a legacy note unstamped is fine: an unstamped note is never stale, just unstamped. A URL model has no hash and never goes stale. Re-run the check: all four lines clean is the proof you stamped right.

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

A note that did not move while its subject did is the failure mode this gate exists to catch: the code changed, the reason nobody wrote down. Update it — even one line under `## Gotchas` — and restamp it as in (a) before continuing. `note stale:` catches this mechanically for notes that carry a stamp; this diff read is what catches it for the ones that do not, which is every note written before stamping existed. A genuinely note-free change (a typo in a controller comment) is a judgement call: say out loud that you are skipping it and why — and do not restamp a note you did not update, or you will have silenced the warning without doing the work.

### 4. Record the knowledge base, and commit it

Nothing else writes `AIKB/`. Not a build, not the dev server, not a watch rebuild, not `check` — only this command, and only here:

```bash
npx kiss-ssg aikb <build-script>
```

**This is the only moment the baseline moves.** That is the whole design: because the record sits still while a branch is open, the diff `kiss-branch-pulse` and step 2 read answers "since this piece of work opened" rather than "since somebody last ran a build". Moving it early costs the branch its own measurement, so record here, after the verification, and nowhere else.

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
- **Feedback — recommendations for next time.** Both partners, every item ending in a concrete next-time change. This is the section `kiss-branch-open` reads back at the start of the next piece of work, so write it to be inherited: vague advice comes back to haunt you three sessions running.
- **Verdict — did we achieve the objective?** Re-state the brief, tick each success criterion `[x]` / `[ ]` with its evidence, and say **met / partially met / the objective moved**. State what is concretely better on the site now, and what remains open.

Be specific — name the pages, the partial, the controller, the failure mode. A reflection that could describe any session has no value to the person who reads it in two years.

Commit it:

```bash
git add planning/sessions/<file>
git commit -m "Close: reflection + status"
```

### 6. Decide whether to recommend a consolidation

The close keeps one branch's memory honest. Nothing in it keeps the **whole** base honest, and two measurable symptoms say it has stopped being:

```bash
grep -L "^consolidated:" planning/sessions/*.md | wc -l   # sessions never folded in
```

- **A Feedback item has recurred in three or more sessions.** Compare the Feedback you just wrote against every earlier session's — not only the three `kiss-branch-open` reads back. An item on its third outing is not a lesson anybody is going to learn by being told again; it needs promoting to a rule in `AIKB/site.md`.
- **Five or more sessions lack `consolidated:`.** The logs have outrun the read-back, so everything older than the last three is effectively write-only.

Either one: recommend `kiss-memory-consolidate` in the final report, naming which trigger fired and the evidence (the item and its dates, or the count). **Do not run it here.** It is a separate beat, on nobody's branch, and folding it into a close would mix housekeeping edits into the diff you just verified.

### 7. Push, and stop

```bash
git push -u origin HEAD
```

**Open a pull request only if the user asks.** If they do, seed the Summary from the Objective and the test plan from the Success criteria, so the reviewer reads the intent beside the diff. Otherwise report: build green, criteria met, notes up to date and stamped, all four note lines clean, `AIKB/` recorded and committed, reflection written, branch pushed.

Finish with three lines to the console — what shipped and the verdict, the competency level, and the single most useful piece of feedback — so nobody has to open the file to get the point. Add a fourth line only if step 6 fired: "the knowledge base is due a sweep — run `kiss-memory-consolidate`", with the trigger.
