---
name: branch-open
description: Start-of-branch ritual, the mirror of /branch-close. Run on the base branch before starting a piece of work — it interviews you to capture the intent (objective, success criteria, non-goals, impact surface, expected shape), writes that intent as a committed session-log artefact bound to the new branch, then creates the branch. The captured intent seeds the PR body and is the brief the closing reflection evaluates against. Use whenever you are about to start a new branch / piece of work, or when asked to "open a branch", "start a feature", "capture intent", or "spec this before we build".
---

# Open Branch

`/branch-open` is the front bookend of the dev loop. `/branch-close` evaluates whether we did what we set out to do — so something has to _record_ what we set out to do. That's this skill: capture intent up front, as a committed artefact, so the brief is real (not reconstructed from memory at the end), seeds the PR, and is the baseline the closing reflection scores against.

The captured intent lives in one `planning/sessions/<date>-<slug>.md` file per branch. `/branch-open` writes its **Intent** half; `/branch-close` → `/retrospective` writes its **Reflection** half into the same file. Open and close are two ends of one artefact.

> **Why `planning/`, not `docs/`.** `docs/` is build output — `docs.js` empties it on every run (`cleanBuild: true`), so nothing hand-written survives there. Session logs live beside the specs and plans in `planning/`.

## When to use

Run `/branch-open` before you start a new piece of work — normally on the base branch, but also when the harness (mobile / web) has already dropped you on a fresh auto-created feature branch, in which case it **adopts** that branch rather than nesting a new one (Step 1). Do not run it once real work is already underway — use it at the clean starting line.

---

## On invocation

Before the interview, pick **one of the quotes below at random** (vary it each time) and output it exactly — quote then attribution — then proceed:

- "Alone we can do so little; together we can do so much." — Helen Keller
- "While every love story comes to an end, I'm so glad we're only on chapter one."
- "Let's start from now and make a brand new ending." — Carl Bard
- "Coming together is a beginning, staying together is progress, and working together is success." — Henry Ford
- "I can do things you cannot, you can do things I cannot; together we can do great things." — Mother Teresa
- "If you want to go fast, go alone. If you want to go far, go together." — African Proverb
- "And suddenly you know: It's time to start something new and trust the magic of beginnings." — Meister Eckhart
- "A journey of a thousand miles begins with a single step." — Lao Tzu
- "It always seems impossible until it is done." — Nelson Mandela

---

## Execution instructions

### Step 1 — Confirm starting state

```bash
node scripts/base-branch.mjs     # the branch this work will merge back into
git branch --show-current
git status
```

`scripts/base-branch.mjs` resolves the integration branch — `main`, or the major line currently in development (`v2` today). Every step below that says "the base" means whatever it printed. Override it with `git config kiss.baseBranch <name>` if it guesses wrong.

Two starting cases:

- **On the base branch** — the normal case. You'll create a new branch in Step 4.
- **Already on a feature branch** — the harness (mobile / web) often auto-creates one before you ever reach `/branch-open`. Do **not** branch off it (no branch-of-a-branch). Instead **adopt the current branch in place**: capture intent onto it and skip Step 4's creation. Confirm first ("You're already on `<branch>` — I'll capture intent onto this branch rather than create a new one"). Exception: if the current branch already carries substantial unrelated work or an existing intent file, stop and ask — that is a genuine "not at a clean starting line" case, not an auto-created branch.

If there are uncommitted changes: surface them and ask whether to stash/commit first.

### Step 2 — Weight the interview

Match the interview to the work:

- **Trivial** (typo, one-line fix, obvious chore): skip the interview — capture a one-line objective and go. Don't make a small change sit through a requirements session.
- **Substantial** (a feature, a refactor, anything ambiguous or with real blast radius): run the full interview below.

When unsure, ask one question: "quick chore, or something worth speccing?"

### Step 2a — Read back the Feedback, and count how often it has come back

```bash
ls -t planning/sessions/*.md | head -3
```

Read each one's `## Feedback` section — the recommendations the last three branches left for next time. Anything that appears in **two or more** of them is a lesson that has not stuck, and this branch inherits it: surface those items to the user before the interview and keep them visible through it, so the criteria can be written to hold them. A reflection nobody reads at the next open is a diary, not institutional memory.

The three-log read-back is the briefing. The **count** is the diagnosis, and it needs the whole history:

```bash
ls planning/sessions/*.md | wc -l                 # logs in total
grep -L "^consolidated:" planning/sessions/*.md   # the ones never folded in
```

Skim **every** log's Feedback, not the last three, and tally which lessons recur — then say that you did. Three is too narrow a window to see the pattern: "look at one built page yourself" recurred across four logs in five days in this repo (2026-09-05, 09-06, 09-08, 09-09) and a window of three would have shown it as an ordinary one-off at any point along the way.

**Skip anything already listed in `.claude/skills/consolidate/retired.md`.** A lesson in that table has been dealt with — it is a rule in `CLAUDE.md` or a step in one of these rituals now, not an outstanding recommendation — so re-surfacing it as inherited feedback is noise that trains the operator to skim the read-back.

**Recommend `/consolidate` when either trigger fires**, before the interview, naming which one and the evidence:

- a lesson has recurred in **three or more** logs — nobody is going to learn it by being told a fourth time; it needs promoting to a rule or a ritual step;
- **five or more** logs lack `consolidated:` — the logs have outrun the read-back, and everything older than the last three is write-only.

It is a recommendation, not a gate: the user may open the branch anyway. **Do not run `/consolidate` from here** — it is a separate beat, and its `CLAUDE.md` and skill edits do not belong in this branch's first diff.

**Also list possibly abandoned work.** A log still `status: open` on a branch that is not the one you are about to work on is a piece of work somebody walked away from:

```bash
grep -l "^status: open$" planning/sessions/*.md | xargs grep -H "^branch:"
```

Name each one with its branch and its opened date and ask the user what it is — finished but never closed, still genuinely in flight elsewhere, or abandoned. Their call, not yours: do not close, delete or adopt any of them. If one names the branch you are adopting in Step 4, that is not abandoned work — that is this piece of work.

### Step 3 — Interview for intent

Elicit the fields below. Use AskUserQuestion for the structured choices (impact surface, expected shape) and open dialogue for the objective and criteria. Ask only what actually shapes the work — questions that reduce real ambiguity, not interrogation theatre. If the user already stated something clearly, reflect it back rather than re-asking.

- **Objective** — one sentence: what are we doing and why.
- **Success criteria** — the checkable conditions for "done". This is the keystone: it becomes the PR test plan, the reviewer's acceptance list, and the reflection's "did we achieve the objective?" verdict. Push for criteria that are observable, not vibes.
- **Non-goals / out of scope** — what we are deliberately not doing. Guards against scope creep and tells the reviewer what not to expect.
- **Impact surface** — which layer this work touches. kiss-ssg is a published npm package, so this is not decoration: it decides the semver bump `/branch-close` proposes at Step 4a, and which docs `/docs-sweep` will hold you to.
  - **Public API** — anything a consuming site can observe: `lib/kiss.js`'s methods, the `config` shape, the built-in helpers, the `files` whitelist. Obliges `llms.txt` + `README.md`, and a minor or major bump.
  - **Engine internals** — a `lib/` module's implementation with the API unchanged. Obliges that module's `AIKB/` doc, and a patch bump.
  - **Tooling & docs** — tests, skills, `scripts/`, the docs site under `src/`, `planning/`. Patch bump, or none.
- **Expected shape** — planned (the destination known up front, the route largely mapped) or emergent (the goal and route revealed as we go). Both are valid; naming it sets expectations and lets the reflection's Reflect section compare actual vs expected.

Two more fields, **asked only for a substantial branch** — a chore does not need either, and asking anyway is the interrogation theatre this step warns against:

- **Delegation convention** — who briefs and who implements, and what the agents may do. Say it once here rather than re-deciding it per task: normally the main session briefs and reviews, sub-agents implement inside a named scope, and **agents never commit** — the operator's diff review is the checkpoint, and a sub-agent that commits removes it. Record whatever this branch actually agrees, including "no delegation, one session".
- **Contract** — ask only when more than one workstream is expected. Name the `planning/plans/<date>-<slug>.md` the workstreams build against: the one document that says what each workstream owns, which files it may touch, and where the seams are. It is amended **in place**, with a dated section, when the design moves — never forked into a second plan, or the workstreams start building against different documents without anyone noticing. Write the file (or confirm it exists) before the first workstream starts, and put its path in the session file so the reflection can be read against it.

### Step 4 — Name and create the branch (only when starting from the base branch)

**Adopting an existing branch (Step 1):** skip this — you are already on it. Use the current branch name in the session-file frontmatter.

**Starting from the base:** propose a branch name from the objective (`feat/…`, `fix/…`, `chore/…`, `refactor/…`) and a kebab-case slug. Confirm with the user, then:

```bash
git checkout -b <branch-name>
```

### Step 5 — Write the intent artefact

Create `planning/sessions/<date>-<slug>.md` using the template below. `<date>` is today. The frontmatter binds the file to the branch — that is how `/branch-close` later finds _this_ session among many (match `branch:` to the current branch; `status: open`). Leave the Reflection half as a marked placeholder for the close.

### Step 6 — Commit the intent

```bash
git add planning/sessions/<date>-<slug>.md
git commit -m "Open branch: <objective, short>

Intent captured at branch-open."
```

Then tell the user: branch created, intent captured — start the work, run `/branch-pulse` to take stock against the criteria as you go, and run `/branch-close` when done. Remind them this is now the **single active branch**: work stays here until close, scope drift is recorded as a dated **Amendment** in this file (not split into a new branch), and you will not create another branch on your own initiative — only when they explicitly ask.

---

## Session-file template

```markdown
---
branch: <branch-name>
base: <base branch>
status: open
opened: <YYYY-MM-DD>
---

# Session — <YYYY-MM-DD>: <Descriptive Title>

## Intent (captured at /branch-open)

**Objective:** <one sentence>

**Success criteria:**

- [ ] <observable condition for done>
- [ ] <…>

**Non-goals / out of scope:** <what we are deliberately not doing>

**Impact surface:** public API | engine internals | tooling & docs — <one line why>

**Expected shape:** planned | emergent | between — <one line why>

**Delegation convention:** <who briefs, who implements, what the agents may not do — or "none: one session"; substantial branches only>

**Contract:** <path to the `planning/plans/` document the workstreams build against, amended in place with dated sections — omit when there is only one workstream>

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->
```

---

## How it fits the dev loop

The branch runs as three beats, all reading this one session file: **Frame** (`/branch-open`, here) → **Steer** (`/branch-pulse`, repeated mid-branch) → **Verify & close** (`/branch-close`).

- **`/branch-pulse`** reads this file's **Success criteria** mid-branch and checks progress against them with evidence, logging each checkpoint to the `## Pulse log` section — so drift is caught while the work is warm, not discovered cold at the close.
- **`/branch-close` → `/retrospective`** finds this file by its `branch:` frontmatter, writes the Reflection beneath the marker (reading **Intent** for the Reflect section, the **Pulse log** for accrued evidence, and checking **Success criteria** in the Verdict — "did we achieve the objective?"), and flips `status: closed`.
- **`/branch-close` PR body** seeds its Summary and Test plan from the captured **Objective** and **Success criteria**, so the reviewer sees the original intent beside the diff. Its version bump reads the **Impact surface**.
- A branch not opened with `/branch-open` simply has no intent file — `/branch-pulse` falls back to asking what to check, and `/retrospective` falls back to creating a fresh reflection, so this is additive, not required.
