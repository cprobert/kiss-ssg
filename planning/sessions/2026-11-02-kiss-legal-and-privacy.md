---
branch: feat/kiss-legal-and-privacy
base: main
status: open
opened: 2026-11-02
---

# Session — 2026-11-02: kiss-legal-and-privacy domain skill, measured with a promoted arm harness

## Intent (captured at /branch-open)

**Objective:** Add a `kiss-legal-and-privacy` domain skill so a kiss site gets the UK legal basics right (privacy and cookies, who-we-are disclosures, terms and consumer rights, content rights), and promote the arm harness to `scripts/` so this skill, and every later one, is measured against a site that has the failures it exists to prevent.

**Success criteria:**

- [ ] `plugins/kiss-ssg/skills/kiss-legal-and-privacy/SKILL.md` exists as a domain skill: UK first (UK GDPR and DPA 2018, PECR, Companies Act website disclosures, Consumer Contracts Regulations, copyright and licences), EU differences noted only where they bite. It covers four areas: privacy and cookies, who-we-are disclosures, terms and consumer rights, and content rights. It has a build mode and a review mode in the shape of the other domain skills, and its description stays under the 400-character cap.
- [ ] Every legal rule in the skill cites a primary source (ICO guidance, legislation.gov.uk, Companies House, CMA). The skill says plainly that it is not legal advice, and it names the decisions it leaves to a human or a lawyer rather than making them.
- [ ] Each sentence about a static site's behaviour (what kiss sets, what a font CDN or an embed sends) is measured on a built site before it is written, not inferred.
- [ ] `kiss-site-new` and `kiss-site-review` open the skill through a Markdown link to its `SKILL.md`. The review pass reports to `kiss-site-review/review-protocol.md`. `test/unit/skill-coverage.test.js` holds both links.
- [ ] The site-facing lists name the new skill: `README.md`, `llms.txt` (one index line, under the 16k cap), `src/models/skills.json` (the docs Skills page, checked built), `lib/init.js`'s list, and the domain-skill list in `CLAUDE.md`.
- [ ] The arm harness is in `scripts/`: it copies a site, runs an arm with and without a skill, and summarises the transcripts. It has a `test/unit/` test. Arms run with an allow-list and never with permission bypasses, and transcripts stream from the first run.
- [ ] A weak-bench fixture site with the legal gaps the skill targets exists outside `examples/`, since it is a fixture to exercise, not an example to imitate. The gaps include no privacy notice, analytics set before consent, a Google Fonts CDN link, no company details in the footer, an unlicensed image and a form with no notice.
- [ ] The skill is measured with the harness on that bench, with and without the skill. The result, cost included, is recorded in the Pulse log. A "no difference" result is reported as one, and a finding about length is acted on in the same message.
- [ ] Clean-room: a fresh agent given only what ships (the packed tarball and the plugin) builds a small business site from an empty folder that passes `kiss-ssg check`, and reports every place it had to guess about the legal pages.
- [ ] `npm run gates` is green.

**Non-goals / out of scope:** Jurisdictions beyond the UK, except EU notes where they bite. Generating legal documents as advice, or drafting bespoke terms for a business. A consent-banner component or any engine feature: the skill is judgement and the engine is unchanged, apart from `lib/init.js`'s skill list. Linking from `kiss-site-import` and `kiss-page-add`, which are not in scope this branch. The `disallowAll` check-diff mismatch and the watch flake from the 11-01 log, which are engine-side and belong to the next engine branch.

**Impact surface:** tooling & docs. It adds a plugin skill, a `scripts/` harness and a fixture, and adds the name to the doc lists and `lib/init.js`'s list. A patch bump, as `kiss-seo` and `kiss-accessibility` were.

**Expected shape:** between. The harness is planned, because it has been built five times and its shape is known. The skill's content is emergent, because the research decides it and the bench measurement may cut it.

**Delegation convention:** The main session writes the contract, briefs and reviews. Sub-agents implement each workstream inside the files the contract names. One fresh-context agent critiques the contract adversarially before any workstream starts. Agents never commit, because the operator's diff review is the checkpoint. Headless arms run with an allow-list and never with permission bypasses.

**Contract:** `planning/plans/2026-11-02-kiss-legal-and-privacy.md`, which is written and critiqued before the first workstream starts. It is amended in place with dated sections. It lists the two workstreams (harness and bench; skill and its wiring), the files each may touch, and the seam between them: the harness's command line and the bench's known gaps, which the skill is measured against.

### Inherited from the read-back (2026-11-02)

- Measure on a weak bench and say what the bench is for before the arms run (2026-11-01 SEO). This is now a criterion.
- Name the site-facing docs in the criteria (2026-11-01 upgrade). This is now a criterion.
- Act on a length finding when you report it (2026-11-01 SEO).
- The operator gives a reason in one sentence when overruling, and "no reason" is said as such (2026-11-01, both logs).
- The arm harness's promotion was scheduled for **this branch** at the open (Step 2a). It is a criterion above.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

**2026-11-02 — seeded from the a1k9training legal feedback.** The operator ran a review on a1k9training, a sole trader's site, and a separate compliance check found 17 legal findings beyond the one `kiss-site-review` reported. Evidence: `planning/reviews/2026-11-02-a1k9-legal-feedback.md`. The operator's direction: "draw all of this into a legal skill. So no duplication with llms.txt or other skills." The contract is `planning/plans/2026-11-02-kiss-legal-and-privacy.md`. Changes to the Intent above:

- **Engine audits come onto this branch:** `report().thirdParty`, plus the audit checks `privacy-link-missing`, `placeholder-left` and `checkbox-prechecked`. This was against the recommendation, which was the next branch. Reason: no reason given. **The impact surface moves from tooling & docs to public API: a minor bump with a `### Upgrading` note.** The non-goal "no engine feature" is withdrawn.
- **`references/eu.md` ships alongside `uk.md`.** This was against the recommendation, which was `uk.md` only, shaped for more. Reason: no reason given. The skill asks for the jurisdiction first. It holds the method in `SKILL.md` and the dated law in the per-jurisdiction references.
- **`kiss-page-add` becomes a third caller**, as recommended. It was a non-goal at the open.
- **The bench is a copy of a1k9training at `385434a`**, the local clone's head, which predates the privacy work. The feedback's 18 findings become its answer key. A small fixture in `test/fixtures/` is added for the unit tests. This replaces the "built fixture" criterion as the measurement bench.
- **No duplication is now a criterion.** Every legal rule lives in the new skill. `kiss-writing-for-the-web`, `kiss-seo`, `review-protocol.md`, `kiss-front-end` and `kiss-site-new` keep only the trigger sentence and a link to the skill, and each moved sentence is banned in a `CONTRADICTIONS` table.
- **The contract has three workstreams:** A (the harness and the bench), B (the skill and its wiring) and C (the engine), with the seams fixed in its names table.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-02** — Planning only: the session file, the contract with the critique folded in, and the feedback. Every criterion is not yet met; all are designed in the contract. No drift beyond the Amendment, which already moved the surface to public API. **Eyeball: looked** — the operator read the contract's critique section: "Looked, it matches". **Offer: unanswered** — the offer was who marks the arm results (Claude marking its own skill is self-assessment). The operator was unsure what it meant and asked to proceed with building, so it will be re-asked, with context, before the measurement. Decision: continue. A writes the fixture and the harness, and B and C start against the contract's names table.
- **2026-11-02 (2)** — All three workstreams have landed: `5e2300e` (harness and fixture), `a969c50` (engine), `61a9eee` (skill and wiring).
  - **Evidence:** `npm test` passes 3,249 tests; typecheck and lint pass; `llms.txt` is 14,734 characters.
  - **Legal plugin review (`/legal:compliance-check`):** 9 findings. The operator chose to fix the high and medium ones (#1–#6), and each fix was checked at legislation.gov.uk before it was written. It is the same model family, so it is a second opinion, not an independent one.
  - **Measurement:** `planning/reviews/2026-11-02-legal-arms.md`, $4.12 for four arms, marked blind by a fresh agent (the operator's choice).
    - On a1k9 the skill changed the outcome: with it, 13 hit, 3 partial, 0 missed; without it, 2 hit, 8 partial, 6 missed.
    - On the fixture there was no difference: 6 hit and 1 partial with it, 7 hit without.
    - Two fixture shortfalls traced to the skill and were fixed in the same message: self-host a CDN font; analytics is an owner decision.
  - **Criteria:** skill, sources, callers, lists, harness, fixture and measurement are met, with evidence above. Clean-room and gates are not yet met.
  - **Drift:** none beyond the 2026-11-02 Amendment. **Eyeball: not asked this pulse** (the operator read the contract at the first pulse). The skill's `SKILL.md` is the artefact to read before close.
  - **Decision:** continue to the clean room, then close.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
