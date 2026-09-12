---
name: kiss-consolidate
description: Tidy a kiss-ssg site's knowledge base — fold the durable lessons out of the session logs into `AIKB/site.md`, retire feedback that keeps coming back, and fix the stale, dangling and dead notes the check reports. Use when asked to "consolidate the knowledge base", "tidy the notes", "fold the session logs into site.md", "the same feedback keeps coming back", "the knowledge base feels inconsistent", "the notes are out of date", "clean up AIKB", or when kiss-open or kiss-close recommends it. Housekeeping between pieces of work — it never records the knowledge base and never opens or closes a branch.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Consolidate a kiss-ssg site's knowledge base

The knowledge base has three parts and they rot differently. The **map** is regenerated every record, so it cannot rot. The **notes** rot quietly in two mechanical ways — the subject changes and the note does not, or the note names a file that no longer exists — and the check now reports both. The **session logs** rot by accumulation: they are read back a handful at a time, so a lesson written eighteen sessions ago is write-only, and the same feedback comes back branch after branch because nothing ever promoted it to a rule.

This skill is the housekeeping beat that answers all three. It is not part of the open → pulse → close loop; run it **between** pieces of work, when the loop or a human says the base needs a sweep.

**Three hard rules, no exceptions:**

- **Never run `npx kiss-ssg aikb`.** The baseline belongs to the close. Recording here would move it to now and cost the next branch its diff. This skill only ever runs a plain `check`.
- **Never edit a generated file.** `AIKB/README.md`, `AIKB/site-map.md`, `AIKB/site-map.json` and `AIKB/last-build.json` are written by the record and nothing else. You edit `AIKB/site.md`, `AIKB/notes/**` and the session logs' frontmatter.
- **Never delete a session log.** Consolidating means stamping it as read, not throwing it away. The log is the evidence behind the line you promoted into `site.md`.

## Execution instructions

### 1. Run a plain check and read the four note findings

```bash
npx kiss-ssg check --summary <build-script>
```

`--summary` goes **before** the script: everything after the script is passed through to the site's own build script. Find the build script the way `kiss-catch-up` does (`package.json` scripts, else the file that constructs `new Kiss(...)`).

Four lines in the summary are this skill's worklist. None of them changes the exit code — they are readings, not gates — so read them even when the build is green:

| Line             | What it means                                                                                                            | What you do with it                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `note missing:`  | a controller file, URL model or pipeline step in the map with no note under `AIKB/notes/`                                | step 10 — write it, or list it        |
| `note dead:`     | a note whose subject has left the map                                                                                    | step 9 — delete it, or restore        |
| `note stale:`    | a note stamped `subject-hash:` whose stamp differs from the subject's current hash — the code moved, the note did not    | step 7 — re-read, update, restamp     |
| `note dangling:` | `"<note path>: <token>"` — a backticked file-looking reference, in a note or in `AIKB/site.md`, that resolves to nothing | step 8 — fix the reference, or remove |

If the site has never been recorded there is no `aikb` block at all and none of these lines appear. Say so and stop: there is nothing mechanical to consolidate, the site needs `npx kiss-ssg aikb <build-script>` once at the next close first. The session logs can still be folded into `site.md` if the user wants that alone — ask.

`ok: false` is not a blocker for this skill (it writes no record), but report it: a broken site is the more urgent thing, and a consolidation that does not mention it reads as an all-clear.

### 2. List the unconsolidated sessions

A session log carries `consolidated: <YYYY-MM-DD>` in its frontmatter once it has been folded in. Everything without that line is unread:

```bash
grep -L "^consolidated:" planning/sessions/*.md
```

Read each one's **Feedback**, **Amendments** and **Verdict** sections, newest first — the rest is prose you do not need here. Keep a tally as you go: which Feedback item appeared in which session file, by date. That tally is what decides a retirement in step 6.

No unconsolidated sessions and no note findings: say so, change nothing, and stop. A clean sweep that commits nothing is a good outcome, not a failed run.

### 3. Read `AIKB/site.md`, creating it if it is absent

`site.md` is the curated, evergreen half of the knowledge base — authored by people, never generated, never overwritten by a build. The engine only ever scans it for dangling references. It is where a lesson goes to stop being news.

```bash
cat AIKB/site.md
```

**Absent?** Create it from this template, exactly these five headings in this order, each with the one-line note that says what belongs under it. Leave the notes in place — they are the instructions for whoever edits it next:

```markdown
# <Site name> — what we know

<!-- Authored and evergreen. The build never writes this file; kiss-consolidate
     curates it and the check only scans it for dangling references. -->

## What this site is and who for

<!-- Purpose and audience in a few sentences: what this site exists to do, who reads it, who owns it. -->

## How it is deployed

<!-- Where the built output goes and how it gets there: host, branch or pipeline, domain, anything manual. -->

## Conventions

<!-- The rules this site is built to. Naming, structure, where a new page goes, what a controller may assume. -->

## Standing gotchas

<!-- The traps that keep catching people, and what to do instead. Durable, not one-off — a fixed bug is not a gotcha. -->

## Retired feedback

<!-- Lessons promoted out of the session logs, each naming the session dates it recurred in, so kiss-open stops surfacing them. -->
```

**Present?** Read it whole before writing a word. You are extending a curated page, not regenerating it: keep its voice, keep its order, and do not restructure it to suit the material you are bringing.

### 4. Read the notes

```bash
ls AIKB/notes/**/*.md
```

Read every note named in a finding, and skim the rest — you cannot spot a contradiction between two notes you have not both read. Note which carry a `subject-hash:` stamp and which do not. An unstamped note is **not** stale; it simply predates stamping, and the next close or this sweep will stamp it when it next writes it.

---

The reading is done. Everything below writes.

### 5. Fold the durable lessons into `site.md`

Go through the unconsolidated sessions' **Feedback**, **Amendments** and **Verdicts** and ask one question of each item: _is this still true of the site tomorrow?_

- **Durable** — "controllers never fetch; the model does", "the events feed 404s out of season, so the page needs an empty state", "deploys are manual on Fridays" — goes into `site.md` under the heading it belongs to (Conventions for a rule, Standing gotchas for a trap, How it is deployed for a deploy fact, What this site is for a purpose statement). One line each, written as a rule someone can follow, not as a story about the session it came from.
- **Episodic** — "the API was down on Tuesday", "we forgot to run the check before pushing this once" — stays in the log. Do not promote it.
- **Already there** — say nothing twice. If `site.md` already covers it, the session simply confirms it; sharpen the existing line if the session taught you something more precise, otherwise leave it alone.

A single line under the right heading beats a paragraph under a new one. Do not invent a sixth section.

### 6. Retire the feedback that keeps coming back

Use the tally from step 2. **A Feedback item that recurs in two or more sessions is a lesson that never stuck** — nobody is going to learn it by being told a fourth time, so promote it out of the loop:

1. Write it as a line under **Conventions** (if it is a rule) or **Standing gotchas** (if it is a trap).
2. Write a matching line under **Retired feedback**, naming the session dates it recurred in:

   ```markdown
   - Always run the check before pushing — recurred 2026-06-04, 2026-07-19, 2026-08-30; now a convention.
   ```

Both lines, always. The Conventions/Gotchas line is the rule; the Retired-feedback line is what tells `kiss-open`'s read-back that this one has been dealt with and should stop being surfaced as inherited feedback every branch. One without the other either loses the lesson or keeps re-raising it.

### 7. Fix the `stale` notes

For each `note stale:` entry the subject moved under the note. Re-read the subject — the controller file, the pipeline step's `run` command, whatever the map names — and bring the note back into line: what it does now, why it is this way now, which gotchas still apply. Then restamp it from the map, so the next check reads clean.

Take the hash from `AIKB/site-map.json`'s `subjects` array, whose entries are `{ kind, id, note, hash }`; find the one whose `note` is this note's path and copy its `hash` verbatim:

```bash
node -e "for (const s of require('./AIKB/site-map.json').subjects) console.log(s.hash, s.kind, s.id, s.note)"
```

The stamp is one frontmatter line at the very top of the note:

```markdown
---
subject-hash: 9f2c1b0a4e7d83f6c5b21a908d7e6f4c3b2a1908
---

# controllers/stockist.js

## What it does

…
```

**The engine never writes that line — this skill and `kiss-close` do.** A note you rewrite gets the current hash; a note you did not touch keeps whatever stamp it had. Never copy a hash you have not just read out of `site-map.json`, and never invent one to silence the line: an unstamped note is honest, a wrongly stamped one lies to every future check.

A URL model never goes stale (its id is the whole subject), so a `note stale:` entry naming one is a finding to raise with the human, not something to restamp.

### 8. Fix the `dangling` references

Each entry reads `"<note path>: <token>"` — the note, and the backticked token in it that resolves to nothing: not a file on disk, not a page view or output path, not a partial, model source, controller id or folder the map knows. Three honest outcomes, and you pick per reference:

- **Renamed** — the file moved. Update the reference to where it lives now.
- **Gone** — the thing it named no longer exists. Rewrite the sentence so it does not need the reference, or drop the sentence. Do not leave a backticked ghost in place with a "(removed)" beside it.
- **Never existed** — a typo, or a path someone imagined. Fix the spelling, or cut it.

Remember `AIKB/site.md` is scanned too, so a dangling entry may name it rather than a note. Same three outcomes.

### 9. Deal with the `dead` notes

A `note dead:` entry is a note whose subject has left the map. Two possibilities, and they look identical from here, so decide deliberately and **say which you chose in the report**:

- **The subject was genuinely retired** — the controller was deleted, the pipeline step removed, the URL model dropped. Delete the note. What it knew is history; if any of it was durable, it goes into `site.md` under Standing gotchas or Conventions first, then the note goes.
- **The subject went missing by mistake** — a controller accidentally deleted, a pipeline step dropped in a refactor, a registration commented out and never restored. Then the note is right and the site is wrong: restore the subject, do not delete the note, and flag it as a finding. This is the most valuable thing this sweep ever finds, and it only shows up as a dead note.

When you cannot tell from the code and the logs, leave the note, say so, and hand it to the human.

### 10. Write the `missing` notes you can honestly write

For each `note missing:` subject, read its code — the controller file, the pipeline step's command, the URL the model fetches.

- **If the subject is understandable from its code**, write the note: `## What it does`, `## Why it is this way`, `## Gotchas`. Stamp it with its `hash` from `site-map.json` as in step 7. Be plain about the limits of what you can see — "why" inferred from code is a guess, so write it as one ("appears to exist so that…") rather than as fact.
- **If it is not** — a magic number nothing explains, a URL nobody can account for, a pipeline step whose purpose is not in the command — **do not write a note.** A fabricated rationale is worse than an empty slot, because the next person believes it. List the subject for the human in the report instead, with the question you would need answered.

### 11. Flag the contradictions — never resolve one silently

While reading you will find places where two sources disagree: a note that says the feed is cached and a `site.md` line that says it is live; a convention that says pages live under `src/pages` and a map that shows half of them elsewhere; two notes with opposite accounts of the same controller.

**Collect these and hand them to the human. Do not pick a winner.** A contradiction is evidence that something real changed and somebody's model of the site is wrong — resolving it by quietly deleting the side you believe less destroys exactly the signal that would have told them. Quote both sides, name both files, and say what you would need to know to settle it.

The one exception is a contradiction the map settles mechanically — the map is generated, so where a note contradicts the map about a fact the map holds (a view path, a controller id), the map is right and the note is stale. Fix it as step 7, and still mention it.

### 12. Stamp the sessions and commit once

Add one frontmatter line to every session log you read in step 2 — not only the ones you took something from, since "read and nothing durable in it" is also a result worth recording:

```markdown
---
branch: content/autumn-prospectus
base: main
status: closed
opened: 2026-08-30
consolidated: 2026-09-11
---
```

Nothing else in the log changes. The Intent, Pulse log and reflection are the record of what happened, and they stay exactly as they were.

Then one commit for the whole sweep:

```bash
git add AIKB planning/sessions
git status --short
git commit -m "Consolidate: <n> sessions into site.md, <m> notes fixed"
```

Check `git status --short` before committing: nothing generated should appear in it. If `site-map.json`, `site-map.md`, `last-build.json` or `AIKB/README.md` show as modified, you edited a generated file — revert those paths and say so.

### 13. Report

Five short sections, plainly:

- **What moved into `site.md`** — the lines added, under which headings, from which sessions.
- **What was retired** — each promoted Feedback item with the dates it recurred in, so the human can see why it earned promotion.
- **What was fixed** — stale notes restamped, dangling references repaired or removed, dead notes deleted (and any subject you restored instead, called out on its own line), missing notes written.
- **What needs a human** — missing notes you refused to invent, with the question each needs answered; dead notes you could not judge; anything `note stale:` reported that you could not restamp.
- **Contradictions** — each one, both sides quoted, unresolved. If there are none, say none.

End with the count in the commit message and one sentence on the shape of the base now: what a returning developer would get from `site.md` alone that they would not have got last week.

## Where this sits

`kiss-open` (Frame) → `kiss-pulse` (Steer) → `kiss-close` (Verify) run a piece of work. This runs **between** pieces of work, on nobody's branch in particular, and it is recommended to you by `kiss-open`'s read-back or `kiss-close`'s final report when a Feedback item has recurred in three or more sessions, or five or more sessions lack `consolidated:`. Run it by hand whenever the base feels inconsistent. For what the check reports, what the record writes and what `subjects` carries, read `node_modules/kiss-ssg/llms.txt` — nothing here restates the engine's contract.
