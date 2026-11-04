---
branch: feat/consent-dialog-services
base: main
status: closed
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

- **2026-11-04, from the pulse eyeball (the operator):** four dialog changes.
  - The YouTube preset's provider becomes Google.
  - Every list item shows the provider in brackets, always: "YouTube (Google)", "Vimeo (Vimeo)". This replaces criterion 1's "label — provider, provider omitted when it equals the label".
  - The dialog's choices put Accept all first: Accept, Reject, Save. The banner already did.
  - The Cookie policy and consent history links move from the dialog's body to its footer, below the buttons (the recommendation, taken).
  - Forced by the provider change, the operator chose the recommendation: the embed's buttons name the service, not the provider. A new `{service}` placeholder (the label) and the defaults "Always allow {service}" and "Open it on {service}". The notice keeps "hosted by {provider}". Otherwise a YouTube embed would offer "Always allow Google" for a grant of YouTube alone, and Google Maps already did.

- **2026-11-04, at the close (the operator):**
  - Version 2.11.2, not the proposed 2.12.0. The operator's reason: "2.11 isn't published yet". npm's newest is 2.9.0, and 2.11.1 was never published.
  - The docs sweep measured that the YouTube provider change moves the purposes `version` of every site using the preset (`b870e36a9103` → `1588eaa503a3`), so their visitors are asked again. The operator accepted the re-ask, the recommendation: the controller named has changed. The upgrade note says so, and that a site can pin `version`.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-04** — after the first slice (`b2e09e9`). Criteria 1–3 met: example 14's dialog lists "Visit counter — Aster & Oak", "Google Tag Manager — Google", "YouTube", by Playwright and by `grep` of `public/index.html`. Criterion 4 met: four `consent-ui` cases, seen red first. The escape case with a hostile `provider` passed before the fix, because the provider was not rendered, so it was not red first. Criterion 5 met: the integration hash test, red first. The unfixed text held the labels (from the hidden grant rows) and no provider. Criterion 6 met, measured: none of example 14's five `.md` copies contains the list, and the diff does not touch `tableHtml`. Criterion 7 met: `test/browser/consent.test.js` 25/25. Criterion 9 met: the skill-coverage row and three `CONTRADICTIONS` patterns, red against the old `SKILL.md`, and the `kiss-memory` README line updated. Criterion 10 partial: GUIDE.md and `AIKB/consent-ui.md` are done; the CHANGELOG waits for the bump. Criteria 11 (clean room) and 12 (gates, Codex) not yet. Full suite 3793 passed, exit 0. The CSS is 7,161 bytes against the 7,168 ceiling, unchanged. I had said "about 30 bytes of room" without measuring and corrected it at this pulse. No drift. **Eyeball: looked** — the operator looked at the phone and desktop captures and wants a change, not yet described (the notes did not come through twice). **Offer: keep** — no visible caption over the list; `servicesLabel` names it for screen readers. Decision: adjust course, once the change is described.
- **2026-11-04** — the eyeball's changes, made and re-checked. There were two rounds, from phone screenshots sent to the operator's device. Round one: provider in brackets always, YouTube → Google, Accept first, links in the footer (`480b050`). Round two: a rule above the footer links, which are now centred (the operator chose "rule above the links" over a tinted footer). That took the CSS to 7,204 bytes, and the operator raised the ceiling from 7,168 to 7,424. **Eyeball: looked** — "Perfect - proceed". Decision: continue to the clean room, then `/branch-close`.
- **2026-11-04** — **clean room** (criterion 11). A fresh agent was given only the tarball packed at `a2c8246`, which holds the footer commit `9143131`, in an empty scratch folder. It built a two-page site with `gtag`, `youtube` and its own "Live chat (Parrotline Ltd)" service. Build exit 0; `kiss-ssg check` **exit 0**. Its dialog, verbatim: "Live chat (Parrotline Ltd)", "Google Analytics (Google)", "YouTube (Google)"; Accept all, Reject all, Save choices; both links in `__links` after the buttons. Its embed said "hosted by Google", "Always allow YouTube", "Open it on YouTube". It reported eight guesses. Two were about this branch's dialog and are fixed in GUIDE.md: the docs drew the close glyph as ✕ where the build renders ×, and the dialog's hidden per-service grant switches were undocumented. The other six predate this branch and are left for a docs branch: no mention of `"type": "module"`, the default folders or how a page gets its id, near consent; the policy and history on one page; the URL shape under the default `trailingSlash`; and no list of the setting keys a placeholder must avoid.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-11-04: The consent dialog names its services, and kiss-branch-close opens the PR

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** `b2e09e9` (service lists, `servicesLabel`, `kiss-branch-close` opens the PR), `480b050` (label (provider) always, YouTube → Google, Accept first, footer links, the `{service}` embed placeholder), `9143131` (footer links ruled off and centred, CSS ceiling 7,168 → 7,424), `edd30cf` (the clean room's two dialog doc gaps), the docs-sweep fixes, and 2.11.2. Gates green; Codex round 1 clean.

## Reflect — what the session was

Planned, and the plan held for its first slice. The open fixed the list's form (plain, always visible), the review's stop condition and the bundling of the skill change in one question set, and the first commit matched it. Then the operator's look at the dialog changed the work. That was by design: the design moved there, in two rounds, from screenshots on a phone. So the shape was planned code under emergent visual design, and the pulse was where the one met the other.

## Evaluate — how the human supervised the AI

**Verification & ownership — strong, and it changed the product.** The operator looked at the artefact, not a summary of it. They looked twice, from a phone once they asked for thumbnails. Each look produced concrete changes no gate or reviewer would have asked for: YouTube's provider is Google, the provider always in brackets, Accept first, the links in a ruled-off footer. "Wants a change" with no notes, twice, was a broken input channel, not disengagement. When asked in plain text, the operator gave four precise changes at once.

**Pushback & steering — the operator steered the design and took the recommendations on mechanics.** Every question with a recommendation was answered: the embed wording, the links' place, the CSS ceiling, the re-ask. One went against the recommendation: 2.11.2 over 2.12.0, with a reason when asked ("2.11 isn't published yet"). The operator chose the rule above the links over a tinted footer. That was a design call Claude had no basis to make.

**Harness leverage — good use, one slip.** Thumbnails were sent to the device with `SendUserFile` as soon as asked. A clean-room sub-agent ran on the packed tarball and found two real doc gaps. Codex ran once and was clean. The slip: a pointless `python -` heredoc command hung for two minutes. It is the second branch running with the same slip, and it wrote nothing.

**Where Claude's own claims needed checking.** Three times in this branch Claude stated a number or a behaviour before measuring it:

- "about 30 bytes of room" under the CSS ceiling, actually 7;
- "about 70 bytes" in the changelog draft, actually 126;
- the version re-ask, which surfaced only in the docs sweep, not at the YouTube change.

The first two were caught and corrected before they shipped. The third is the substantive one: changing a preset's provider moves `version` for every site using it. The question belonged in the eyeball round, where the operator decided YouTube is Google. It was asked at the close instead. It was asked and measured before anything shipped, but late.

**Competency level: Active supervisor.** The operator framed the work, looked at the artefact at the point it was cheap, changed the design from what they saw, and gave a reason when they overruled. The remaining step to agentic engineering lead would be naming the configuration and the consequences up front ("YouTube is Google, and yes, re-ask"). This session reached that only because Claude asked at the close.

## Feedback — recommendations for next session

- **Claude — ask what a config or preset change moves before making it.** A preset field that feeds `purposesVersion`, a banner hash, or a cookie name has a consequence on every site. When the operator asks for one, say it at the moment: "this asks every YouTube site's visitors again". Here it waited for the docs sweep.
- **Claude — measure before giving a number, even an aside.** "About 30 bytes" and "about 70 bytes" were both guesses written as facts. The rule is already in `CLAUDE.md` § Rules. The fix is to run the one-line measurement before the sentence, not after.
- **Claude — never send a placeholder or no-op shell command.** A `python -` with a heredoc waits on stdin and hung again, two branches running. A command that does nothing should not be sent at all. The same goes for the close's last edit: `status: open` → `closed` was flipped with `sed -i`. The result was correct, but it went against `CLAUDE.md`'s "never pass prose through the shell", under an auto-mode instruction that invites it. The rule's paragraph already names that case. Use Edit.
- **Operator — when an `AskUserQuestion` "Other" or notes field seems to vanish, type the change as a message.** It worked at once here. Two empty answers in a row are a sign the channel is broken, not that there is nothing to say.
- **Process — `AskUserQuestion` notes did not reach the session twice (2026-11-03 and today).** Worth a feedback report: a "Something else" choice arrived with no text.
- **Process — the clean room's six older doc gaps are a docs branch's**, with the three dead paths the corpse collector found again: consent docs that never say `"type": "module"`, the default folders, how a page gets its id, one page for policy and history, URL shape under the default `trailingSlash`, and which hash keys are settings.

## Verdict — did we achieve the objective?

The brief: the dialog names each category's services by label and provider, and `kiss-branch-close` opens the PR. **Met, and the objective moved for the better**: the operator's look turned a list into a redesigned dialog. The Amendments record each change.

- [x] Each non-necessary category lists its services. The form was amended to "label (provider)" always (Amendment, 2026-11-04); example 14 and the clean room show it verbatim.
- [x] Necessary lists its services the same way when it has any (`consent-ui` test).
- [x] A category with no services shows no list (test).
- [x] Escaped, ordered, tested, red first. The hostile-provider case was not red first; noted at the pulse.
- [x] The hash moves with the list and `consent-banners.json`'s text carries it (integration test, red first).
- [x] The Markdown copy and the cookie table are unchanged (measured at the pulse).
- [x] The grant switches still work (Chromium 25/25).
- [x] Example 14's dialog read well at phone and desktop width. **Eyeball: looked**, two rounds of changes, then "Perfect - proceed".
- [x] `kiss-branch-close` opens the PR, with the `gh` fallbacks, a coverage row and three `CONTRADICTIONS` patterns (red first).
- [x] Docs: GUIDE.md, AIKB (`consent-ui`, `consent-gate`, `consent`), the CHANGELOG with an Upgrading note (every hash moves; YouTube sites ask again).
- [x] Clean room: `kiss-ssg check` exit 0, the dialog as documented, two gaps fixed.
- [x] `npm run gates` green; Codex round 1 clean, within the stop condition.

What is concretely better: a visitor sees which companies rely on each choice before making it, Accept leads in both layers, and a site's close opens its PR. What remains open: publishing 2.11.x to npm (the operator's act), and the docs branch above.
