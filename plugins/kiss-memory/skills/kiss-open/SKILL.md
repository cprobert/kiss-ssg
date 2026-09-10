---
name: kiss-open
description: Capture what a piece of work on a kiss-ssg site is meant to change, before changing it — objective, checkable criteria, non-goals, impact surface — into a session file, then create or adopt the branch. Use when starting work on a kiss site, or when asked to "open a branch", "start a new feature on the site", "add a section to the site" (before writing it), "capture intent", "spec this before we build", or "plan this change". Pair it with kiss-pulse mid-work and kiss-close at the end.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

# Open a piece of work on a kiss-ssg site

The Frame beat. Something has to record what this change was _meant_ to do, or the close has nothing to verify against and the reflection is reconstructed from memory. This skill writes that record — `planning/sessions/<date>-<slug>.md` — and it is the same file `kiss-pulse` appends to and `kiss-close` reads.

This is the site-shaped loop: no version bump, no package, no npm publish. What is verified at close is the site's **output**, so the criteria are phrased in pages.

## Execution instructions

### 1. Read back the last three sessions' Feedback

```bash
ls -t planning/sessions/*.md 2>/dev/null | head -3
```

Read each one's `## Feedback` section. Anything that shows up in **two or more** of them is a recurring lesson that has not stuck — surface those to the user now, as this branch's standing checklist, and copy them into the session file under **Inherited feedback**. If there are no sessions yet, say so and skip; this is the first.

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
npx kiss-ssg check <build-script> --summary
```

The page list this prints is the baseline the success criteria are written against, and it is also proof the site was green _before_ you touched it. If it is already failing, that is the first thing to fix or to name as inherited. Find the build script the way `kiss-catch-up` does (`package.json` scripts). If the site has an `AIKB/site-map.md`, skim it for the sections your change is near.

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

### 6. Write and commit the session file

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

**Frame** (`kiss-open`, here) → **Steer** (`kiss-pulse`, repeatedly) → **Verify & close** (`kiss-close`). All three read this one file. For the engine's API — what `.aikb()` writes, what the report carries, what `check --against` compares — read `node_modules/kiss-ssg/llms.txt`; nothing here restates it.
