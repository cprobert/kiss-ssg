---
branch: chore/ux-taste-skill
base: main
status: open
opened: 2026-10-12
---

# Session — 2026-10-12: UX improvements — trialling the taste skill

## Intent (captured at /branch-open)

**Objective:** Find out whether tasteskill.dev's `redesign-existing-projects` skill improves the look of a real kiss site — the docs site first, then Pro Plumbing — and, if it does, recommend it on the docs site beside Anthropic's `frontend-design` as an optional skill for the look.

**Success criteria:**

- [ ] **The audit comes before the change.** `redesign-existing-projects` is run against the docs site (`src/`), and what it found — each finding with the file it points at — is written into this log before any style edit lands.
- [ ] **kiss keeps the structure.** The docs-site restyle lands in `src/`'s layouts, partials and Sass. No Tailwind, React or other new framework dependency is added, no page collapses into a single file, `node docs` builds and exits 0, and `npm run gates` passes.
- [ ] **No accessibility regression.** Text contrast stays at or above 4.5:1 in both themes. The focus style stays visible. The theme toggle and the homepage's agent selector still work.
- [ ] **The operator judges it by eye.** Before-and-after screenshots of the homepage and one guide page, light and dark, desktop and mobile, are put in front of the operator. Each change is kept or reverted on their call, and the call is recorded here. If the browser extension is unavailable, say so when the look is due and hand over the URL and the checklist.
- [ ] **Pro Plumbing gets the same trial on its own branch.** The same skill runs on a `ux/taste-skill` branch in `C:/Code/kiss/pro-plumbing`. `kiss-ssg check` passes there, the operator looks at the result, and keeping it is their decision. This branch records only the outcome.
- [ ] **A verdict is written down, with its evidence.** It says what the skill found or proposed that we would not have reached without it, and whether that earns a recommendation. "Am I adding this for the sake of it?" (2026-10-03) is the test.
- [ ] **If the verdict is yes, the docs site recommends both design skills side by side.** A short homepage passage, "optional: the look", names `frontend-design` and the taste skill and says what each is for. kiss keeps the structure, the passage mirrors `README.md`'s paragraph, and its install commands have been run for real rather than copied from a web page.
- [ ] **Clean room, if the passage ships.** A fresh sub-agent given only that homepage passage installs both skills into an empty folder and reports every place it had to guess.

**Non-goals / out of scope:**

- No change to `lib/`, `bin/` or the public API.
- No change to the shipped kiss skills (`kiss-site-new`, `kiss-site-review`) or to `README.md`. The recommendation goes on the docs site only (operator's choice at the open).
- Not trialling `design-taste-frontend`, `high-end-visual-design` or `minimalist-ui`. The flagship `design-taste-frontend` defaults to React/Next.js and Tailwind v4, which kiss's Handlebars-and-Sass structure does not use.
- Not reviving the parked interactive-control UX skill (`planning/ideas/2026-09-29-ux-control-quality-skill.md`).

**Impact surface:** tooling & docs — the docs site (`src/`, rebuilt into `docs/`) and this log. Nothing a consuming site installs changes, so the bump is a patch or none.

**Expected shape:** emergent — this is an experiment. We do not know what the skill will propose or whether we will keep it, so the criteria are about reaching a verdict, not about a particular design.

**Delegation convention:** none: one session. The skill runs in the main session. Any sub-agent (the clean-room run) reports back and never commits; the operator's diff review is the checkpoint.

**Inherited feedback carried in (2026-10-03):** question every recommendation before adding it. If the browser extension is unavailable when the visual check is due, say so then.

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

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
