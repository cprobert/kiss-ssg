---
branch: feat/docs-theme-toggle
base: main
status: closed
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

- **2026-10-01 — two content changes to the docs site, at the operator's request.** (1) The home page's example is Pro Plumbing, not Aster & Oak: "Replace Aster & Oak, a Bristol roastery, with Pro-Plumbing as the example". The verdict panel shows a real `kiss-ssg check` of `C:\Code\kiss\pro-plumbing` (7 pages, 0 failed, 131 links checked with 0 broken). It drops the "0 launch-readiness findings" line, because that site is on kiss-ssg 2.6.2, which has no audit. The social card's line is redrawn with the same numbers. (2) "Migrating from v1" is removed from the guide: "not needed". The guide controller names it in a `LEFT_OUT` list, so the rule that every `GUIDE.md` section has a page still catches new ones. "Development file changes", which shared that page but is not about v1, moves to "Assets and builds". `/guide/migrating/` now 404s on the live site.
- **2026-10-01 — the docs preview gets its own folder.** Operator's call, after the toggle "disappeared" from a running preview. A production `node docs` had overwritten the `docs/` folder the preview was serving. `node docs --dev` now builds into `.preview/`, which `.gitignore`, `.prettierignore` and ESLint all ignore. Measured: with the preview running, `docs/` shows 0 changes, and a production build run alongside leaves the preview's pages pointing at localhost. This is tooling, still tooling & docs.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-01**
  - **Criteria.**
    - (1) met: a click switches and saves, and the choice holds on another page (browser JS check). No-flash is inferred from the head script's position, not observed.
    - (2) met: with nothing saved, the page followed the device (dark).
    - (3) met: a real `<button>` named for its action, and it works with storage blocked. Keyboard use was confirmed by the operator, not by Claude.
    - (4) met at `df79989`: 128 links, 0 broken, 0 audit findings. Gates not yet run.
    - (5) met by this pulse.
  - **Drift:** the two content changes are recorded as an Amendment. The surface is still tooling & docs.
  - **Found this beat:** the operator's preview showed no toggle. A production `node docs` run by Claude at 10:07 overwrote the `docs/` folder the 10:04 preview was serving, so the page loaded the live site's old `site.js` and the button stayed hidden. Touching `docs.js` made the preview rebuild, which fixed it. Proposed, not yet answered: build the preview into its own ignored folder. Also noted: nested `docs/**/index.json` debug files escape the `docs/*.json` ignore rule.
  - **Eyeball: looked.** "it works": switching, persistence across pages, and Tab to the toggle and Enter with a visible focus ring.
  - **Decision:** continue.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Log — 2026-10-01: A light/dark toggle in the docs site header

**What we shipped:**

- a header toggle that remembers the visitor's choice and is applied before the first paint (`6797f22`);
- Pro Plumbing as the home page's example, and no "Migrating from v1" page (`df79989`);
- a docs preview that builds into its own `.preview/` folder (`86e7d78`).

No version bump: nothing on the branch ships in the npm package.

**Supervision:** **Active supervisor.** Planned, then grew by two operator requests, both recorded as Amendments as they came.

- **This branch applied the last one's feedback.** It was opened before the work. It was pulsed after the first slice. The eyeball was taken mid-branch while the preview was warm, with the answer "looked, it works", including the keyboard check Claude's browser tool could not perform.
- **Verification & ownership was the standout:** the human check happened where it was cheap. It also surfaced a real defect: the toggle had "disappeared".
- **The defect was Claude's.** A production `node docs` run for a commit overwrote the `docs/` folder the operator's preview was serving. Claude traced it with evidence (the process's start time against the file's write time) rather than guessing.
- **The structural fix was the operator's call** from the options Claude put forward: the preview builds into its own folder.
- **The codex review was skipped correctly:** no `lib/` or `bin/` change.

**Feedback for next time:**

- **Claude — before writing a folder someone else is serving, check what is running.** `node docs` ran while the operator's preview served `docs/`. The new `.preview/` folder removes this case. The habit still applies anywhere two processes share an output folder: `netstat`, or ask, before building into it.
- **Claude — answer "where did it go?" by checking every place it should be.** The toggle was in the source, the local build and the branch, but not the live site (unmerged) or the preview (overwritten). Checking all five at once found the cause in two commands.
- **Operator — keep taking the eyeball at the pulse.** It caught what no gate could, at no cost to the close.
- **Process — `docs/*.json` misses nested debug files.** Moot now that the preview no longer writes into `docs/`. Revisit it if a production build ever writes `index.json` files.

**Did we achieve the objective?** **Met.**

- [x] **It works without the device setting.** It switches, and the choice is saved and holds across pages (browser check plus the operator). No-flash is inferred from the head script's position.
- [x] **The device setting is still the default.** With nothing saved, the page followed the device.
- [x] **It is usable.** It's a real `<button>`, named for its action, and works with storage blocked. Keyboard use and the visible focus ring were confirmed by the operator.
- [x] **Builds clean.** `node docs` gives 128 links, none broken, and 0 audit findings. `npm run gates` exits 0.
- [x] **Operator eyeball, mid-branch.** Looked, at the pulse.

**Still open:**

- The live site gets the toggle, the Pro Plumbing example and the new guide only when this merges.
- `/guide/migrating/` will then 404.
- npm is still at 2.6.2, behind `main`'s 2.6.6.
