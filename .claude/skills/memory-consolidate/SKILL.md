---
name: memory-consolidate
description: Housekeeping sweep of this repo's institutional memory — fold the durable lessons out of `planning/sessions/` into the place that will actually be read (a bullet in `CLAUDE.md`, or a step in a ritual skill), retire the feedback that keeps coming back, and report the mechanical staleness `/corpse-collector` finds. Use when asked to "consolidate the session logs", "the same feedback keeps coming back", "tidy the memory", "fold the reflections into the rules", "the logs are piling up unread", or when `/branch-open` or `/branch-close` recommends it. Runs between branches — it never opens, closes or pushes one.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Consolidate

The repo's memory has two halves and they rot differently.

The **docs** rot mechanically: a `lib/` module moves and its `AIKB/` note does not, a path in prose stops existing. `/corpse-collector` already finds that half, and this skill reports it rather than repeating it.

The **session logs** rot by accumulation. `/branch-open` reads the Feedback back at the start of every branch, but a log is only read a handful at a time, so a lesson written eleven branches ago is write-only — and the same recommendation comes back branch after branch because nothing ever promoted it out of the log into a place that acts. This repo's own history is the proof: "look at one built page yourself" appears in four reflections across five days, and the 2026-09-09 log says so in as many words. Being told a fifth time is not going to work. Something has to change in `CLAUDE.md` or in the ritual.

That promotion is this skill. It is not part of the three-beat loop — **Frame** (`/branch-open`) → **Steer** (`/branch-pulse`) → **Verify & close** (`/branch-close`) — it runs **between** pieces of work, on nobody's branch in particular, when one of those beats or a human says the logs have outrun the read-back.

> **This skill edits `CLAUDE.md` and the ritual skills under `.claude/skills/`.** It is not a note-tidying pass — a retirement lands as a rule Claude is instructed to follow, or as a step the ritual will stop for. Show the human `git diff` before the commit and let them read it. Those files govern every future session in this repo; a line added to them carelessly is worse than a lesson left in a log.

**Four hard rules, no exceptions:**

- **Never delete a session log.** Consolidating means stamping it as read, not throwing it away. The log is the evidence behind the rule you promoted out of it.
- **Never change a log's prose.** The Intent, Amendments, Pulse log and Reflection are what happened. You add one frontmatter line and nothing else.
- **Never resolve a contradiction silently.** Where a log and `CLAUDE.md` disagree, quote both and hand it to the human (Step 8).
- **Never open, close or push a branch from here.** One commit on whatever branch you are on, and no PR. If the operator wants this on its own branch, that is their call to make before you start.

---

## On invocation

Before reading anything, output exactly:

```
"A good memory is one trained to forget the trivial." — Clifton Fadiman
```

Then proceed.

---

## Execution instructions

### Step 1 — Run the scanner and read the AIKB-staleness rows

```bash
node .claude/skills/corpse-collector/scripts/scan.mjs
```

This is the mechanical half, and it is cheap — run it first so the report opens with facts rather than with judgment. The whole scan is worth skimming, but the rows this skill owns are **Check 8 — AIKB docs behind their modules**: rows beginning `AIKB/` and reading `N commits behind lib/…`, one per module doc that has not been touched since the module moved on under it two or more commits ago.

Read such a row as **"go and read that doc"**, not as "that doc is wrong". A note can be several commits behind its module and still be perfectly true — the commits may have touched nothing the doc describes. So: open the doc, open `git log <doc-last-commit>..HEAD -- lib/<module>.js`, and decide. Fix the doc if it has drifted; say "read, still accurate" in the report if it has not. Never rewrite a doc to silence a row.

**If no such rows appear at all**, do not conclude the docs are fresh until you have looked at the check list. `✓ Check 8 … clean` means clean. **No Check 8 in the list at all** means this copy of the scanner predates the check — say so plainly in the report ("the mechanical half could not run in this working tree") and consolidate the logs alone. A check that is absent and a check that is clean look identical in a report that does not distinguish them.

The rest of the scan's findings are `/corpse-collector`'s business, not this skill's. Mention anything alarming; do not start fixing it here.

### Step 2 — List the logs nobody has folded in

A session log carries `consolidated: <YYYY-MM-DD>` in its frontmatter once it has been read by this skill. Everything without that line is unread:

```bash
grep -L "^consolidated:" planning/sessions/*.md
```

A log still `status: open` will be in that list on **every** sweep until its branch closes and `/session-reflect` writes its Feedback — there is nothing to fold in yet, and Step 7 leaves it unstamped. That is expected, not an oversight, and it is not a reason to stamp it early.

No unconsolidated logs and no AIKB rows: say so, change nothing, and stop. A sweep that commits nothing is a good outcome, not a failed run.

### Step 3 — Read the logs and tally by audience

Read each unconsolidated log's **`## Feedback`**, **`### Amendments`** and **`## Verdict`** sections, newest first. The rest is prose you do not need here.

In an older log, read whatever **plays their role**. The logs predate the template, so a missing `## Feedback` heading is not a test for whether a log carries feedback: some hold their recommendations inline, in a closing paragraph, or under a heading of their own wording, and a `grep` for the heading will report them as having nothing to give. Open every log in the Step 2 list and read it. Only after reading does "nothing durable in this one" become a finding rather than a heading that happened to be spelled differently.

Feedback items name their audience in bold at the start — **Operator**, **Claude**, **Both** or **Process** — because `/session-reflect` requires it, and the older logs do it informally (`**For the operator**` as a group heading, or `- **Operator — look at the artefact you asked for.**` inline). Read either shape; where a log predates the convention and names no audience at all, infer it from the item and **say in the report that you inferred it**.

Keep a tally as you read: for each distinct lesson, which log dates it appeared in and which audience it was aimed at. **Two items are the same lesson when the next-time change they ask for is the same**, not when the wording matches, and not when the virtue behind them matches:

- "look at one built page" and "open `dependency-graph.json` yourself" — **one lesson**: the operator verifies an artefact first-hand. The artefact differs; the change does not.
- "verify one artefact" and "verify one number" — **one lesson**, for the same reason. Do not split a lesson because the evidence it names is of a different kind.
- "Claude should offer the pulse" and "the operator should run the pulse" — **one lesson with two halves**, and the halves have different audiences. Tally it once, and expect Step 5 to write both halves.
- "shell discipline: write a long command to a file first" and "verify the edit actually landed" — **not one lesson**. Both come from the same virtue (care with mechanical edits), but the next-time change is different in each, and merging them produces a rule so general nobody acts on it.

That tally decides everything in Step 5, so write it down rather than holding it in your head.

Also note, from the Verdicts and Amendments: anything a log records as still open, and any drift it absorbed. An open item that three branches have carried is a lesson in the same sense as a Feedback item.

### Step 4 — Read the destinations before you write to them

You are editing curated files that many future sessions read. Read them whole first:

```bash
cat CLAUDE.md
cat .claude/skills/memory-consolidate/retired.md
```

The **whole** of `CLAUDE.md`, not § Rules alone. A Claude-audience lesson can belong under § Rules or under § Git workflow, and the sharpen-before-add judgment in Step 5 needs both in view: a rule about how a branch is run is often already stated, in weaker form, in the § Git workflow prose rather than in the § Rules bullets.

Plus whichever ritual skill a lesson is heading for — `.claude/skills/branch-open/SKILL.md`, `.claude/skills/branch-pulse/SKILL.md` or `.claude/skills/branch-close/SKILL.md` — read in full, because a step added in the wrong voice or the wrong place in the sequence will be skipped by the next operator who runs it.

**A lesson already listed in `retired.md` is done.** It is a rule now; do not retire it twice, and do not count its later recurrences towards a new promotion.

---

The reading is done. Everything below writes.

### Step 5 — Route each recurring lesson to the place that can act on it

**A lesson that recurs in two or more logs has not stuck**, and the log is not where it will stick. Promote it.

**Two and three are different numbers doing different jobs.** Three recurrences — or five unconsolidated logs — is the _trigger_: what `/branch-open` and `/branch-close` watch for to tell you a sweep is due. Two is the _bar for promotion_ once you are already in one: having opened every log anyway, a lesson on its second outing is a lesson that did not stick, and leaving it for a third sweep only guarantees it will be written a third time. Do not go looking for a sweep at two; do not leave a two behind when you are in one.

Route by the audience the lesson was written for — the audience decides the destination, because the two audiences fail differently:

| Audience     | Where it goes                                                                                                                                                                                                                                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Claude**   | A bullet in `CLAUDE.md` — § Rules for a code or repo convention, § Git workflow for a rule about how a branch is run — or a sharpening of the bullet already there. Claude reads that file every session, so a rule stated there is a rule that gets followed.                                                              |
| **Operator** | A **step, or a stop, in the ritual skill it belongs to** — `/branch-open`, `/branch-pulse` or `/branch-close`. A human does not read `CLAUDE.md` before every branch, and restating the lesson in another reflection is exactly what has already failed four times. If the ritual does not stop for it, it does not happen. |
| **Both**     | Judge which half is load-bearing. Usually it is both halves of one lesson: the rule that binds Claude, and the ritual step that makes the operator's half happen. Write both, and say so in the report.                                                                                                                     |
| **Process**  | Judge where the process lives. A rule about how work is documented or handed off is usually a `CLAUDE.md` bullet; a rule about when something is checked is usually a ritual step.                                                                                                                                          |

Three things to hold to while writing:

- **Write the destination's voice, not the log's.** A `CLAUDE.md` rule is one imperative line in the register of the bullets around it. A ritual step is a numbered step in that skill's sequence, with the command or the artefact named, placed where it actually falls in the order — and if it is a stop, it says plainly that it stops and what it asks.
- **Sharpen before you add.** If the rule or the step is already there in weaker form, make it sharper; do not add a second bullet saying nearly the same thing. Two overlapping rules are read as one vague one.
- **Leave the episodic in the log.** "The API was down on Tuesday", "the branch got renamed by the harness once" — true, not durable. Not everything that recurred twice is a rule; a coincidence recurring is still a coincidence, and promoting it adds noise to a file whose authority depends on every line earning its place.

**A lesson whose destination already exists is still retired.** The row in `retired.md` is the output, and the edit is zero, or a sharpening — a bullet added to a step's menu, a sentence made specific. Adding the step a second time is the failure this skill prevents, one level up: a ritual with two steps asking for the same thing is exactly the "told a fifth time" pattern, moved from the logs into the rituals. Check the destination before you write to it, and be willing for the honest answer to be "the ritual already does this; the lesson is retired and nothing needed changing".

An item that appeared once stays in the log and stays in `/branch-open`'s read-back. That is the system working — it has not failed yet.

### Step 6 — Record every retirement in `retired.md`

Every lesson you retired gets one row in `.claude/skills/memory-consolidate/retired.md`: the lesson, the dates it recurred in, exactly where it went, and what you actually had to change to put it there.

```markdown
| Look at one built artefact yourself before accepting the branch | 2026-09-05, 2026-09-06, 2026-09-08, 2026-09-09 | `/branch-close` Step 5a — Operator eyeball | none — destination existed (added one bullet to its menu) |
```

That example is the case worth recognising, not the exceptional one: the step was already in the ritual, so the **Edit made** column reads `none — destination existed` and the row itself is the whole output of the retirement.

**Edit made** takes one of three values, and it is the column a human scans to see whether this sweep changed the repo or merely accounted for it:

- `new rule` — a bullet or a step that did not exist before;
- `sharpened` — the rule or step was there in weaker form and now says the specific thing;
- `none — destination existed` — the repo already asks for this; name in brackets anything small you added, or leave it bare.

Both halves, always — the edit (when there is one) is what changes behaviour, and the row is what tells `/branch-open`'s read-back to stop surfacing this one as inherited feedback. A promotion without a row comes back next branch as if nothing happened; a row without a promotion, in a case where the destination did _not_ already exist, silences the lesson without fixing anything.

### Step 7 — Stamp every log you read

Add one frontmatter line to every log listed in Step 2 — including the ones you took nothing from, because "read, nothing durable in it" is a result worth recording:

```markdown
---
branch: feat/incremental-rebuild
base: main
status: closed
opened: 2026-09-08
consolidated: 2026-09-12
---
```

Nothing else in the file changes.

Do **not** stamp a log that is still `status: open` — that is a branch in flight, and its Feedback section is not written yet. List those in the report instead.

### Step 8 — Flag the contradictions, never resolve one

You will find places where a log and `CLAUDE.md` disagree, or where two logs disagree with each other: a reflection that says agents may commit and a rule that says they may not, two logs with opposite accounts of what the gate caught.

**Quote both sides, name both files, and hand it to the human.** Do not pick a winner. A contradiction is evidence that something real changed and somebody's model of the repo is out of date — resolving it by quietly rewriting the side you believe less destroys exactly the signal that would have told them. Say what you would need to know to settle it.

### Step 9 — Show the diff, then commit once

```bash
git status --short
git diff
```

Walk the human through the `CLAUDE.md` and `.claude/skills/` hunks before committing — those are the governing files, and this is the moment to catch a rule that reads well and is wrong. Then one commit for the whole sweep:

```bash
git add CLAUDE.md .claude/skills planning/sessions
git commit -m "Consolidate: <n> logs, <m> lessons retired"
```

One commit, whatever the sweep touched. No push, no PR, no branch.

**If you cannot get an answer** — a headless run, a delegated agent, any context with no human to ask — do not guess your way past it. Make **no edit that needed an answer**: leave the contradiction unresolved, the ambiguous routing unrouted, the inferred audience unpromoted. List each one under **Needs a human** in the report, and **leave the whole sweep uncommitted** so the person who reads the diff is the one who decides. An uncommitted sweep with an honest list is a finished run; a committed sweep that guessed is not.

### Step 10 — Report

Short, plain, in this order:

- **Mechanical** — the AIKB-staleness rows, each with what you did: doc updated, or read and still accurate. Or the plain statement that the check did not run in this working tree.
- **Retired** — each promoted lesson, the log dates it recurred in, its audience, and where it landed. This is the section the human is really reading.
- **Left in the logs** — lessons that appeared once, and anything episodic you deliberately did not promote.
- **Contradictions** — each one, both sides quoted, unresolved. If there are none, say none.
- **Needs a human** — logs still `status: open` that you did not stamp; items whose audience you had to infer; anything you could not route without a decision; and, in a run with nobody to ask, every edit you declined to make for want of an answer. Say plainly whether the sweep was committed or left in the working tree for the reader to judge.

End with the count from the commit message and one sentence on what a returning developer gets from `CLAUDE.md` and the rituals now that they would not have got last week.

---

## Where this sits

`/branch-open` (Frame) → `/branch-pulse` (Steer) → `/branch-close` (Verify & close) run one piece of work. This runs **between** pieces of work. It is recommended to you by `/branch-open`'s read-back or `/branch-close`'s closing report when a Feedback item has recurred in **three or more** logs, or **five or more** logs lack `consolidated:` — and you can run it by hand whenever the reflections start repeating themselves.
