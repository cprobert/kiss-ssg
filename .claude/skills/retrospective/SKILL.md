---
name: retrospective
description: Supervised-collaboration session reflection. Generates a date-stamped reflection in planning/sessions/ that reads how actively the human supervised the AI — reflect on the session, evaluate the supervision against the rubric, give feedback for next time, and verdict on whether the objective was achieved — as CPD for both the human and Claude. Run before wiping context to preserve institutional memory that context windows cannot hold.
---

# Retrospective — Supervised-Collaboration Reflection

A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set less by the model than by **how actively the human supervised it** — framing the problem, asking the AI to explain rather than accepting code blindly, correcting it rather than absorbing the first answer, verifying before accepting, and being able to explain afterwards what changed. A reflection that only records "what Claude did" misses the point. This skill reads the **supervision**, and doubles as **CPD** — a record of how both partners can work better next time.

The structure is **Reflect → Evaluate → Feedback → Verdict**: reflect on what the session was, evaluate the supervision against the rubric, give feedback for next time, and a verdict on whether the objective was achieved.

## When to use

Run `/retrospective` before clearing context or ending a significant session. Context windows are ephemeral; the decisions, tensions, and supervision dynamics within a session disappear with them. Run it after `/docs-sweep` and the gates — correctness first, then reflection.

> **Where reflections live: `planning/sessions/`.** Not `docs/` — `docs.js` empties that directory on every run (`cleanBuild: true`), so anything written there is deleted by the next build. Session logs sit beside the specs and plans in `planning/`.

---

## On invocation

Before scoping the session, output exactly:

```
Mirror, mirror on the wall,
who's the fairest of them all?
```

Then proceed.

---

## Execution

### Step 1 — Scope the session, and find the intent

```bash
BASE=$(node scripts/base-branch.mjs)
git log "$BASE..HEAD" --oneline
git diff "$BASE...HEAD" --name-only
grep -rl "branch: $(git branch --show-current)$" planning/sessions/*.md
```

The `grep` finds this branch's **intent artefact** — the session file `/branch-open` wrote (frontmatter `branch:` matches the current branch).

- **If found** (it'll be `status: open`): write the Reflection *into that file*, beneath its marker (the Reflection goes **below** the marker; the Intent, Amendments, and Pulse log above it stay untouched). Its captured **Intent** is the brief your **Reflect** and **Verdict** sections evaluate against — don't reconstruct it. Its **`## Pulse log`** (if any) is the running evidence trail the mid-branch pulses left — read it for the Verdict's criteria check and for where supervision actually held. Flip `status: closed` when done. Do not create a new file.
- **If none** (the branch wasn't opened with `/branch-open`): reconstruct intent from the conversation and create a fresh file (Step 4). Still valuable — the brief is just self-reported rather than captured.

If there are no commits either, reflect from the conversation history regardless.

### Step 2 — Weight

**Full reflection** for significant sessions: real architectural decisions, failure modes discovered, tooling/process changes, or design tensions surfaced. **Condensed** for routine work (small fixes, straightforward implementation).

### Step 3 — Write the reflection

**Be specific** — name commits, files, exact failure modes, and the concrete change each lesson prompts. A reflection that could describe any session has no institutional value. Use this repo's own vocabulary: `lib/` modules by name, the `AIKB/` doc that covers them, the gate that caught (or missed) the problem.

**Write for a developer who wasn't in the room**, reading this months later as CPD — on the code, and on how a human and an AI agent actually work together. That second reader is the point. Use the shared supervision rubric (the seven dimensions and four competency levels defined in [`rubric.md`](./rubric.md), beside this skill), but never coin _new_ private metaphors or in-jokes — anything that needs this session to decode it has failed.

#### Full reflection template

```markdown
# Session Reflection — {YYYY-MM-DD}: {Descriptive Title}

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** [1–2 lines, with commit hashes / PR — the factual anchor everything else hangs on]

## Reflect — what the session was
How clearly was the goal framed before work began, and what shape did the work take — **planned** (the destination known up front, the route largely mapped) or **emergent** (the goal and route revealed as we went)? It's a spectrum; name where this session sat, and whether that shape served the work or fought it — a planned task that kept being re-planned, or an exploratory one forced down a premature plan.

## Evaluate — how the human supervised the AI
The heart of the reflection. Read the session against the **seven behavioural dimensions** of the supervision rubric (defined in [`rubric.md`](./rubric.md) — use those names, they are the shared vocabulary):

- **Problem framing** — did the human scope before asking for code, or leave the ambiguity for Claude to guess?
- **Learning engagement** — did the human ask the AI to explain ("why this", "why not X?"), or accept code without understanding it? This is where self-teaching lives: was the agent used to build understanding, or to bypass it?
- **Pushback & steering** — did the human correct drift early and challenge weak moves, or absorb the first plausible answer?
- **Verification & ownership** — was the output verified (tests run, the diff reviewed, the generated site actually looked at — not just the summary) before it was accepted as done?
- **Iteration discipline** — was a long agent run punctuated by verification, or run one-shot to a large unverified output? This is the dimension Anthropic's ~400k-session analysis sharpens: experts run _longer_ action chains but catch edge cases mid-run and don't abandon troubled work, closing the ~91%-partial / ~28–33%-verified gap. If the session one-shotted a large change with no mid-course check, name it plainly and feed it back — the `/branch-pulse` Steer beat is the concrete remedy to recommend. (Distinct from Verification & ownership, which judges the _final_ check; this judges the _cadence_ of checks along the way.)
- **Architecture sense-making** — could the human explain what changed and why, afterwards?
- **Harness leverage** — did the session reach for Claude Code's force-multipliers where they'd have helped — plan mode for ambiguous work, sub-agents for parallel search or fresh-context review, the right skill / slash command, MCP tools instead of guessing? This one is two-sided by construction: Claude should offer these proactively, not wait to be asked — so a miss is often a shared lesson, and it is the richest seam of "what could the operator learn" for the Feedback section.

  **Reading plan-mode sessions:** invoking plan mode is itself the positive harness signal — a deliberate choice to structure the work before acting. The system's `"I approved the plan"` text is the UX output of that tool, not evidence of passive acceptance. For plan-mode sessions, Pushback & steering evaluates engagement *with the plan content* (scope challenges, questions before approval, changes requested); Verification & ownership evaluates supervision *after* approval (was execution reviewed, was drift caught?). The same logic applies to built-in tooling generally: reaching for `/branch-open`, a skill, or a slash command is leverage — read it as deliberate tool use, not passivity.

The rubric is a **lens, not a form**. Don't grind through all seven as a scorecard — that produces the generic reflection this skill exists to avoid. Lead with the two or three dimensions that actually discriminated _this_ session (where the supervision was notably strong or notably absent), and pass over the unremarkable ones in a line or skip them. Name the active-vs-passive evidence **from this session**, not the dimension's definition.

Then name the most important thing plainly: **where did the human intend to supervise, versus where they actually did?** If Claude's momentum carried past a checkpoint the human meant to hold — "approved, but I'll evaluate the result" becoming Claude self-evaluating and closing the loop — say so; that is the single most useful lesson these logs carry about working with an autonomous agent. The `## Pulse log` is the literal record of where the human paused to steer mid-branch: a branch pulsed regularly and one closed cold are different supervision stories — read the cadence as evidence for Verification & ownership. Point to specific moments: where the exchange produced something neither input held alone (the sum beating the parts), where one carried the other, where a handoff was rough.

End with the **competency level** — one of **Passive delegator / Assisted operator / Active supervisor / Agentic engineering lead** — named explicitly, with the evidence that places the session there. No flattery: the level is earned by what happened, not aspired to.

## Feedback — recommendations for next session
Honest, both directions, both partners — framed as **recommendations**, not observations. Anchor them to the dimensions that scored low in Evaluate: if learning engagement was thin, the recommendation is concrete ("ask Claude to explain the non-obvious block before accepting it"); if verification was waved through, name the check that should have run. **Harness leverage is usually the richest seam here** — it's where the operator has the most to learn: if plan mode, a sub-agent pass, a fitting skill, or an MCP tool would have made the session faster, safer, or more accurate and wasn't used, name the specific technique and when to reach for it next time. Keep the technical specifics: failure modes caught (and missed), and the fix each one points to. Every item ends in a concrete next-time change. This is the institutional-memory payload — don't let it go soft.

## Verdict — did we achieve the objective?
The culmination. Re-state the brief, then a plain verdict against the original intent: **met**, **partially met**, or **the objective moved** (and was that good drift or scope creep?). If success criteria were captured at `/branch-open`, check each one off explicitly with `[x]` / `[ ]` and the evidence (the `## Pulse log` already records much of it, accrued mid-branch) — that turns this from a self-report into a checklist. This Verdict is where the criteria get ticked; the pulses left them untouched on purpose, so the baseline stayed pristine until now. State the measurable impact — what is concretely better now — and what remains open, so success can be evaluated rather than assumed.
```

#### Condensed template

```markdown
# Session Log — {YYYY-MM-DD}: {Descriptive Title}

**What we shipped:** [commits / PR + one line]
**Supervision:** [planned or emergent; competency level — passive delegator / assisted operator / active supervisor / agentic engineering lead; the standout dimension, strong or weak; intended vs actual supervision]
**Feedback for next time:** [concrete, both partners]
**Did we achieve the objective?** [verdict + what's still open]
```

### Step 4 — Choose the filename

Format: `YYYY-MM-DD-{topic-slug}.md`. The slug captures the primary theme in 2–4 kebab-case words. If several themes exist, use the most significant.

### Step 5 — Write and commit

**If filling an intent file** (found in Step 1): write the Reflection beneath its `<!-- … -->` marker, flip `status: open` → `closed` in the frontmatter, then commit the update:

```bash
git add planning/sessions/<that-file>
git commit -m "Close branch: reflection + status"
```

**Otherwise** (no intent file) create a fresh file at `planning/sessions/{filename}` and commit:

```bash
git add planning/sessions/{filename}
git commit -m "Add session reflection: {title}

Brief summary of what the session covered."
```

(Within `/branch-close`, the push happens at the push step — don't push here.)

### Step 6 — Précis to the console

After committing, print a short **TL;DR to the console** so the session ends with the takeaway visible — the whole point is that nobody should have to open the file to get the insight. Three bullets, a hook not a re-dump (the file holds the depth):

```
## Session précis — {title}

- **Shipped / verdict:** {one line — what landed; objective met, partially met, or drifted}
- **Supervision:** {the competency level; the standout dimension, or the missed-checkpoint flag if one fired}
- **Feedback for next:** {the single recommendation that matters most — for one partner or the pair}

Full reflection → `planning/sessions/{filename}`
```

---

## What makes a good reflection?

**Specific over generic.** "the pack gate caught `files` dropping `AIKB/` before it reached npm" is useful; "the tooling worked well" is not. Name the commit, the file, the failure mode.

**Honest over flattering.** Evaluate is the trap: the competency level must be earned by the evidence, and "the sum beat the parts" must point to a *real* exchange that produced something neither input held alone — not mutual back-patting. Name where Claude over-reached or the human's steer was needed; name where the human accepted code blindly or waved a checkpoint through. Both directions.

**Two-sided.** It's a supervision reflection. If the whole thing reads as Claude's solo diary, the lens has failed — bring the human's inputs, decisions, and course-corrections into it.

**Feedback-actionable.** Every recommendation ends in a concrete next-time change, for one partner or the partnership — not an abstract intention.

---

## Relationship to other gates

| Gate | When | What it captures |
|---|---|---|
| `npm run gates` | Gates step of `/branch-close` | Correctness: test, lint, format, pack |
| `/docs-sweep` | Docs Sweep step of `/branch-close` | Doc accuracy across the branch |
| `/retrospective` | Retrospective step of `/branch-close`, before context wipe | The supervision: how actively the human supervised, feedback for next time, and whether the objective was achieved |
