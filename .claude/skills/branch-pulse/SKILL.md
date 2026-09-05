---
name: branch-pulse
description: Mid-branch checkpoint — the Steer beat between /branch-open and /branch-close. Run it repeatedly while a branch is open to re-check progress against the success criteria captured at /branch-open, with evidence (the cheap test subset, a timeout-bounded example run, a human eyeball), catch drift early, and decide continue / adjust / record-amendment / ready-to-close. Use whenever you want to take stock mid-branch, or when asked to "pulse", "check progress", "how are we doing against the brief", "take the pulse", "am I drifting", or "is this ready to close yet". Cheap and formative — not a substitute for /branch-close.
---

# Pulse — Mid-Branch Checkpoint

`/branch-pulse` is the **Steer** beat of the dev loop — the middle the bookends left empty. `/branch-open` frames intent; `/branch-close` verifies and ships. Between them, work drifts in the gap where nothing checks it. The pulse closes that gap: it reads the **success criteria** captured at open and asks, with evidence rather than vibes, _are we converging on them, and are we still inside the remit?_

It is **formative**, not summative: cheap, repeatable, run every 20–30 minutes or at each natural slice boundary. It is the opposite of rushing to close — and the opposite of abandoning a session that has gone sideways. It catches the edge case while the work is still warm, and it makes the decision to continue, adjust, or stop a **deliberate** one.

This is supervised collaboration: the pulse is where the human steers and verifies mid-flight, rather than waiting for the close to discover the drift cold.

## When to use

Run `/branch-pulse` mid-branch, as often as it earns its keep, while the branch is `status: open`. Do **not** run it on the base branch, and it is **not** a substitute for `/branch-close` (it runs the cheap check subset, never the full gate battery).

---

## On invocation

Before scoping, output exactly:

```
"It is good to have an end to journey toward; but it is the journey that matters, in the end." — Ursula K. Le Guin
```

Then proceed.

---

## Execution

Keep this terse and fast — if a pulse starts to feel like a mini-close, it has failed its purpose.

### Step 1 — Find the intent

```bash
BASE=$(node scripts/base-branch.mjs)
git branch --show-current
grep -rl "branch: $(git branch --show-current)$" planning/sessions/*.md
```

If on the base branch: stop — the pulse is a mid-branch beat. If the `grep` finds the branch's intent artefact (the file `/branch-open` wrote, `status: open`): read its **Intent** — Objective, Success criteria, Non-goals, Impact surface, Expected shape. These are the baseline; **read them, never rewrite them** (the Intent block is immutable).

If no intent file (the harness auto-created the branch, or it wasn't opened with `/branch-open`): offer to **capture intent retrospectively**. Infer the Objective, Success criteria, Non-goals, Impact surface, and (almost always) an _emergent_ shape from the conversation so far, and write them to a `planning/sessions/<date>-<slug>.md` bound to the current branch by `branch:` frontmatter — the same artefact `/branch-open` writes, with its Intent heading marked _inferred retrospectively_ so the honesty is on the record. This rescues the session's intent from the ephemeral context window so the close, the reflection, and the next developer inherit it instead of losing it. If the user declines, proceed loosely against a checklist they give you.

### Step 2 — Read the trajectory

```bash
git diff "$BASE...HEAD" --stat
git status --short
```

Establish what has changed since the last pulse, and **of what kind** — engine logic, public API, docs, or tooling. This decides which checks Step 3 runs: there is no value smoke-running an example on a docs-only change, or running the suite on a `planning/` edit.

### Step 3 — Assess each success criterion, with evidence

Go through the success criteria one at a time. For each, state **met / partial / not yet / drifted** and the **evidence** — never a vibe. Run only the checks the change warrants:

- **Engine changed** (`lib/**`) → `npm test` (the cheap subset — **not** `npm run gates`; the full battery is the close's job). Narrow it while iterating: `npx vitest run test/unit/<module>.test.js`.
- **New module added** → `/test-coverage-check` (advisory, no flag) to surface logic lacking a `test/unit/` sibling early, so the close's `--gate` mode never surprises. If a `lib/` module was added or removed, also run `npx vitest run test/aikb.test.js` — it fails on a missing or unlisted `AIKB/` doc.
- **Public API or generated output changed** → smoke-run the example that exercises it and look at what it wrote:

  ```bash
  timeout 20 node examples/6-sitemap.js; ls -R examples/public | head
  ```

  **Always bound an example with `timeout`.** Dev-mode examples and `node docs` start a livereload server and never exit on their own — running one bare hangs the session (`AIKB/testing.md` § Gotchas). Then **hand off to the human to eyeball the generated HTML** — the human verifying is the point, not a fallback.

Speak in the supervision rubric's vocabulary (`.claude/skills/retrospective/rubric.md`) — this beat exercises **Verification & ownership** and **Pushback & steering** above all.

### Step 4 — Drift check

Compare the trajectory against the **Non-goals**, the **Objective**, and the declared **Impact surface**. A branch opened as "engine internals" that has started editing `llms.txt` has moved surface — that is a real signal, not a formality, because it changes the semver bump at close.

If the remit has _legitimately_ expanded (adjacent, shares the theme), append a dated entry to the intent file's `### Amendments` list — the one sanctioned channel for scope drift. If it looks like scope **creep** (a genuinely different subsystem or objective), say so and recommend stopping or deferring; never absorb it silently, and never spawn a new branch on initiative (the operator's call).

### Step 5 — Decide, out loud

State the call plainly, with its reason: **continue** (on track) / **adjust course** (re-steer, named correction) / **record amendment** (remit moved) / **ready to close** (criteria met, hand to `/branch-close`). This is the anti-rush, anti-abandon moment — the decision is deliberate, not drift.

### Step 6 — Log the beat

Append one dated line to the intent file's `## Pulse log` section (the file `/branch-open` wrote, or the one just captured retrospectively in Step 1; create the section once if an older file lacks it), capturing the evidence and the decision — e.g.:

```markdown
- **2026-09-05** — criteria 1–2 met (`test/unit/sitemap.test.js` green, 12 cases); criterion 3 not yet (llms.txt unwritten); no drift. Decision: continue.
```

Do **not** tick the Intent block's `[ ]` checkboxes — status is reported live and logged here; the close's **Verdict** does the final tick against the pristine baseline. Then commit **only the session file** (never `-A` — keep code out of this commit):

```bash
git add planning/sessions/<that-file>
git commit -m "Pulse: <YYYY-MM-DD> <one-line decision>"
```

---

## Relationship to the other beats

| Beat               | Skill                  | Role                                                                           | Verification                                                     |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| **Frame**          | `/branch-open`         | Capture intent + success criteria as the baseline                              | —                                                                |
| **Steer**          | `/branch-pulse` (here) | Re-check criteria vs evidence; catch drift; decide continue/adjust/amend/close | Formative — `npm test`, advisory coverage, a bounded example run |
| **Verify & close** | `/branch-close`        | Verify against the original criteria + reflect + ship                          | Summative — the full `npm run gates` battery                     |

The pulse and the close are the formative/summative pair — the same split as `/test-coverage-check`'s advisory-vs-`--gate` modes. Evidence the pulse accrues in the `## Pulse log` is what `/branch-close` and `/retrospective` read at the end, so the Verdict scores a criteria list that was checked all along, not one reconstructed cold.
