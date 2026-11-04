---
branch: feat/consent-dialog-services
base: main
status: open
opened: 2026-11-04
---

# Session — 2026-11-04: The consent dialog names each category's services, and kiss-branch-close opens the PR

## Intent (captured at /branch-open)

**Objective:** Make the settings dialog list, under each category, every service it covers by label and provider, so a visitor consents knowing which third parties rely on it (the ICO: "consent for categories of third-party controllers will not be specific enough"). Also make the shipped `kiss-branch-close` skill open a pull request as part of closing, rather than only when asked.

**Success criteria:**

- [ ] Under each non-necessary category's description, the dialog shows a plain list of its services, one item per service, as "label — provider" (provider omitted when it equals the label). The list is always visible, with no extra click.
- [ ] The necessary category lists its services the same way, when it has any.
- [ ] A category with no services shows no empty list.
- [ ] Every label and provider is escaped. A unit test in `test/unit/consent-ui.test.js` covers the markup, the order (name order, as `servicesIn` gives) and the escaping, and is seen failing first.
- [ ] The banner hash changes with the list (it is taken over the banner plus the dialog), and `consent-banners.json`'s `text` carries the services. An integration test shows a hash moving when a service's provider changes.
- [ ] The Markdown copy and the cookie table are unchanged, or a change to them is deliberate and stated.
- [ ] The "Always allow" grant switches still work, and still appear only when a grant exists (the Chromium suite stays green).
- [ ] Example 14's dialog, looked at by the operator in a browser, reads well on a phone width and a desktop width. This is the pulse eyeball.
- [ ] `plugins/kiss-memory/skills/kiss-branch-close/SKILL.md` pushes and then opens a pull request by default, seeding the Summary from the Objective and the test plan from the Success criteria. It says what to do when `gh` is missing or not signed in: report it and give the command; never block the close. The description line matches. A `test/unit/skill-coverage.test.js` row holds it, and the old "only if the user asks" sentence goes in the `CONTRADICTIONS` table.
- [ ] Docs: GUIDE.md § consent (the dialog's contents), `AIKB/consent-ui.md`, the CHANGELOG entry, and an Upgrading note saying that every banner hash moves.
- [ ] Clean room: a fresh agent given the packed tarball adds a consent service to a site and reports what the dialog now says about it; `kiss-ssg check` exits 0.
- [ ] `npm run gates` is green. Codex is clean, or stopped by the stop condition below.

**Non-goals / out of scope:** per-service switches in the dialog (consent stays per category, with the existing "always allow" grants); a cookie-by-cookie list in the dialog (that is `{{consentTable}}`'s job); collapsible sections; a consent server; changes to the record format; the other `kiss-branch-*` skills beyond what the PR change forces.

**Impact surface:** public API. The dialog's markup and every banner hash change on every consent site, and a shipped skill changes behaviour.

**Expected shape:** planned. The list's form was decided at open (plain, always visible), and the hash already covers the dialog.

**Delegation convention:** none: one session. The clean room is a sub-agent that only reads and builds in a scratch folder, and never commits.

**Review stop condition:** loop fix → Codex while it finds P1 or P2 within this branch's scope (the dialog markup, the banner hash and registry, the `kiss-branch-close` skill). Findings below P2 are listed in the session file, not fixed. After round 3, Claude stops and asks whether to go on.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-04** — after the first slice (`b2e09e9`). Criteria 1–3 met: example 14's dialog lists "Visit counter — Aster & Oak", "Google Tag Manager — Google", "YouTube", by Playwright and by `grep` of `public/index.html`. Criterion 4 met: four `consent-ui` cases, seen red first. The escape case with a hostile `provider` passed before the fix, because the provider was not rendered, so it was not red first. Criterion 5 met: the integration hash test, red first. The unfixed text held the labels (from the hidden grant rows) and no provider. Criterion 6 met, measured: none of example 14's five `.md` copies contains the list, and the diff does not touch `tableHtml`. Criterion 7 met: `test/browser/consent.test.js` 25/25. Criterion 9 met: the skill-coverage row and three `CONTRADICTIONS` patterns, red against the old `SKILL.md`, and the `kiss-memory` README line updated. Criterion 10 partial: GUIDE.md and `AIKB/consent-ui.md` are done; the CHANGELOG waits for the bump. Criteria 11 (clean room) and 12 (gates, Codex) not yet. Full suite 3793 passed, exit 0. The CSS is 7,161 bytes against the 7,168 ceiling, unchanged. I had said "about 30 bytes of room" without measuring and corrected it at this pulse. No drift. **Eyeball: looked** — the operator looked at the phone and desktop captures and wants a change, not yet described (the notes did not come through twice). **Offer: keep** — no visible caption over the list; `servicesLabel` names it for screen readers. Decision: adjust course, once the change is described.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
