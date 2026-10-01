---
branch: feat/docs-theme-toggle
base: main
status: open
opened: 2026-10-01
---

# Session — 2026-10-01: A light/dark toggle in the docs site header

## Intent (captured at /branch-open)

**Objective:** Let a visitor to the docs site choose light or dark mode from a toggle in the header, remembered across pages and visits, instead of the device setting being the only thing that decides.

**Success criteria:**

- [ ] **It works without the device setting.** The toggle switches the whole site between light and dark, and the page loads in the chosen mode on every page and on a return visit, with no flash of the other mode first.
- [ ] **The device setting is still the default.** A visitor who has never used the toggle gets whatever their device asks for, exactly as now.
- [ ] **It is usable.** It is a real `<button>` with an accessible name that says what it will do, works by keyboard with a visible focus ring, and the page still works if storage is blocked (private window).
- [ ] **Builds clean.** `node docs` exits 0 with 0 broken links and 0 audit findings, and `npm run gates` passes.
- [ ] **Operator eyeball, mid-branch.** The operator clicks the toggle in `node docs --dev` after the first slice lands, logged by `/branch-pulse` — not left to the close.

**Non-goals / out of scope:** a third "follow the device" option in the toggle itself; the `starter/` site; any `lib/` change.

**Impact surface:** tooling & docs — the docs site under `src/` and the built `docs/`. No shipped file changes, so no version bump is expected.

**Expected shape:** planned — one header control, one script, a few CSS rules.

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
