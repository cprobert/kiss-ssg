---
name: kiss-open
description: Capture what a piece of work on a kiss-ssg site is meant to change, before changing it — objective, checkable criteria, non-goals, impact surface — into a session file, then create or adopt the branch. Use when starting work on a kiss site, or when asked to "open a branch", "start a new feature on the site", "add a section to the site" (before writing it), "capture intent", "spec this before we build", or "plan this change". Pair it with kiss-pulse mid-work and kiss-close at the end.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

# Open a piece of work on a kiss-ssg site

The Frame beat. Something has to record what this change was _meant_ to do, or the close has nothing to verify against and the reflection is reconstructed from memory. This skill writes that record — `planning/sessions/<date>-<slug>.md` — and it is the same file `kiss-pulse` appends to and `kiss-close` reads.

This is the site-shaped loop: no version bump, no package, no npm publish. What is verified at close is the site's **output**, so the criteria are phrased in pages.

## Execution instructions

### 1. Read back the Feedback, and count how often it has come back

```bash
ls -t planning/sessions/*.md 2>/dev/null | head -3
```

Read each one's `## Feedback` section. Anything that shows up in **two or more** of them is a recurring lesson that has not stuck — surface those to the user now, as this branch's standing checklist, and copy them into the session file under **Inherited feedback**. If there are no sessions yet, say so and skip; this is the first.

Then count across **all** of them, not just the three you read back:

```bash
grep -l "^consolidated:" planning/sessions/*.md | wc -l   # already folded into AIKB/site.md
grep -L "^consolidated:" planning/sessions/*.md           # not yet
```

The three-session read-back is the briefing; the count is the diagnosis, and it needs the whole history because a lesson that recurred in 2026-05, 2026-07 and 2026-08 is invisible to a window of three. Skim every session's Feedback — including the consolidated ones, and say that you did — and tally which items recur.

**Recommend `kiss-consolidate` when either fires**, before the interview, and say which:

- a Feedback item has recurred in **three or more** sessions — nobody is going to learn it by being told a fourth time; it needs promoting to a rule in `AIKB/site.md` and retiring from the read-back;
- **five or more** sessions lack `consolidated:` — the logs have outrun the read-back and the older lessons are write-only.

It is a recommendation, not a gate: the user may open the branch anyway. Do not run `kiss-consolidate` from inside this skill — it is a separate beat, and its commit does not belong in this branch's first diff. An item that already appears under **Retired feedback** in `AIKB/site.md` has been dealt with: it is a convention now, so do not re-surface it as inherited feedback.

**Also list possibly abandoned work.** A session file still `status: open` on a branch that is not this one is a piece of work somebody walked away from:

```bash
grep -l "^status: open$" planning/sessions/*.md | xargs grep -H "^branch:"
```

Name each one with its branch and its opened date, and ask the user what it is — finished but never closed, genuinely still in flight elsewhere, or abandoned. Their call, not yours: do not close, delete or adopt any of them. If one of them is the branch you are about to adopt in step 2, that is not abandoned work — that is this piece of work, and step 2 handles it.

### 2. Confirm the starting state

```bash
BASE=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
BASE=${BASE:-main}
git branch --show-current
git status --short
```

- **On the base branch** — the normal case; you will create a branch in step 5.
- **Already on a feature branch** (a harness often creates one for you) — **adopt it in place**, do not branch off it. Confirm: "You're already on `<branch>` — I'll capture intent onto this branch." If it already carries unrelated work or an existing session file, stop and ask.

Uncommitted changes: surface them and ask whether to commit or stash first.

### 3. Know the site's current shape

```bash
npx kiss-ssg check --summary <build-script>
```

`--summary` goes **before** the script: everything after it is passed through to the site's own build script.

The page list this prints is the baseline the success criteria are written against, and it is also proof the site was green _before_ you touched it. If it is already failing, that is the first thing to fix or to name as inherited. Find the build script the way `kiss-catch-up` does (`package.json` scripts). If the site has an `AIKB/site-map.md`, skim it for the sections your change is near.

**Read `AIKB/site.md` before the interview, if the site has one.** It is the authored, evergreen page — what the site is and who for, how it is deployed, the conventions, the standing gotchas, the feedback already retired into rules — and it is the accumulated answer to half the questions the interview would otherwise ask. Two things follow from it: the conventions constrain what a sensible objective looks like here, and a standing gotcha near the change is worth naming out loud before anybody writes a criterion that walks into it. It is curated, not generated, so treat it as recollection: accurate the day it was written, never re-checked by a build.

The check also prints its note findings — `note missing:`, `note dead:`, `note stale:`, `note dangling:`. Any of them present at open is **inherited**, not yours. Record them in the session file so the close can tell them apart from rot this branch caused; a big crop of them is another reason to recommend `kiss-consolidate` first.

When the site has been recorded before, the check also prints its diff against that record with no flag asked for. Read it: anything already `+`, `-` or `~` before you have touched a thing is inherited drift, and belongs in the session file rather than in your change.

### 4. Interview for intent

Match the interview to the work — a typo needs a one-line objective, a new section needs the whole thing. Use AskUserQuestion for the two structured choices. Ask only what removes real ambiguity.

- **Objective** — one sentence: what changes on this site, and why.
- **Success criteria** — phrased so a build diff can check them. Say which pages appear, disappear or change:
  - `+ public/courses/data-science.html` and 3 sibling pages exist
  - `~ public/index.html` — the course list on the home page includes them
  - `- public/old-prospectus.html` is gone
  - nothing else in the build changes
    Anything that a diff genuinely cannot see (copy tone, a design judgement) is still a criterion — just mark it "eyeball" so the close knows a human has to look.
- **Non-goals** — what this change is deliberately not doing.
- **Impact surface** — which layer this touches. It tells the close what to hold you to:
  - **content** — copy and data only; the shape of the site is unchanged
  - **templates & partials** — views, layouts, partials; a shared partial changes every page that renders it
  - **data & controllers** — models, controller files, fetched URL models; the layer that carries judgement, so it obliges a note under `AIKB/notes/`
  - **build script & config** — the chain itself, `folders`, `siteUrl`, `cleanBuild`; blast radius is the whole site
  - **assets & deploy** — `config.assets`, pipeline steps, where the output goes; also obliges a note
- **Expected shape** — planned (destination known) or emergent (revealed as you go). Both are fine; naming it lets the close compare.

### 5. Create or adopt the branch

Adopting (step 2)? Skip this. Otherwise propose a name from the objective (`content/…`, `feat/…`, `fix/…`) and confirm before:

```bash
git checkout -b <branch-name>
```

### 6. Make sure this branch has a baseline

Check for the record:

```bash
ls AIKB/site-map.json
```

**It exists** — do nothing. The record is the state at the last close, and that is exactly what `kiss-pulse` and `kiss-close` want to diff against. Never record at open on a site that already has one: recording would move the baseline to _now_ and this branch's diff would come out empty.

**It is absent** — this site has never been recorded, so there is nothing to measure the branch against. Record once, now, so it has one:

```bash
npx kiss-ssg aikb <build-script>
```

That runs the build staged and discarded exactly as `check` does — it publishes no site — and writes `AIKB/README.md` (once), `AIKB/site-map.md`, `AIKB/site-map.json` and `AIKB/last-build.json`. Read what it wrote: `site-map.md` is the site's shape as the engine actually saw it — pages, views, models, controllers, partials, pipeline steps. If it contradicts what the interview assumed, correct the criteria before they go into the session file in step 7. Then commit the folder on its own, ahead of any of your work:

```bash
git add AIKB
git commit -m "Record: knowledge base at open"
```

**If the build fails**, the record is refused — `not recorded — build failed`, nothing written. That is the first finding of this branch, not an obstacle to work around: say so, add "the site builds green again" to the success criteria, and record once it passes — the branch simply opens without a baseline, and `kiss-close` records at the end as it always does.

### 7. Write and commit the session file

Write `planning/sessions/<YYYY-MM-DD>-<slug>.md` from the template below (create the folder if it does not exist), then:

```bash
git add planning/sessions/<file>
git commit -m "Open: <objective, short>"
```

Tell the user: intent captured, branch ready. Run `kiss-pulse` as you go and `kiss-close` when done. This is now the single open piece of work — scope that drifts is recorded as a dated **Amendment** in this file, never split into a second branch on your initiative.

## Session-file template

```markdown
---
branch: <branch-name>
base: <base branch>
status: open
opened: <YYYY-MM-DD>
---

# Session — <YYYY-MM-DD>: <Descriptive Title>

## Intent (captured at kiss-open)

**Objective:** <one sentence>

**Success criteria:**

- [ ] <pages added / removed / changed, or an "eyeball" criterion>
- [ ] <…>

**Non-goals / out of scope:** <what this is deliberately not doing>

**Impact surface:** content | templates & partials | data & controllers | build script & config | assets & deploy — <one line why>

**Expected shape:** planned | emergent | between — <one line why>

**Inherited feedback:** <recurring items from the last three sessions' Feedback, or "none — first session">

### Amendments

<!-- Dated notes where the remit legitimately expanded mid-branch. Good drift is
     recorded here and stays on this branch; a new branch is the operator's call. -->

## Pulse log

<!-- Appended by kiss-pulse, one dated line per checkpoint: criteria status,
     the evidence, and the decision. Append-only — the Intent above is immutable,
     and the criteria are ticked only at close. -->

---

<!-- kiss-close writes the reflection below and flips status: closed -->
```

## The loop

**Frame** (`kiss-open`, here) → **Steer** (`kiss-pulse`, repeatedly) → **Verify & close** (`kiss-close`). All three read this one file. `kiss-consolidate` sits outside the loop, between pieces of work: it folds the session logs' durable lessons into `AIKB/site.md` and fixes the notes, which is what stops this step's read-back surfacing the same feedback forever. The baseline they measure against moves exactly once per piece of work, at `kiss-close` — this skill records only to establish one that does not exist yet. For the engine's own contract — what `npx kiss-ssg aikb` records, what the report carries, what `check` diffs against — read `node_modules/kiss-ssg/llms.txt`; nothing here restates it.
