---
branch: feat/kiss-legal-and-privacy
base: main
status: closed
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

# Session Reflection — 2026-11-02: kiss-legal-and-privacy, the audits that feed it, and the harness that measures it

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped (2.10.0, 15 commits):**

- `5e2300e`: the arm harness `scripts/arms.mjs`, the legal weak-site fixture and its answer key.
- `a969c50`: the three audit checks, `report().thirdParty` and `audit.privacyPage`.
- `61a9eee`: the seventh domain skill, with the legal sentences moved out of four other skills.
- `ac6544f`: the measurement.
- `6d98b98`: fixes from grading the live a1k9training.
- `c178964`: the clean room.
- `4391de2` and `83e299c`: a false positive and two Codex P2s, each fixed with a test seen red first.
- `771b9cc`: the bump.

**Outside this repo:** a local, unpushed branch in a1k9training, `fix/privacy-review-2026-11-02` (`1e8ac66`), with four page fixes.

## Reflect — what the session was

**The framing was unusually good, because it began from evidence.** The operator opened with a three-word ask ("Lew legal domain skill"), then supplied the feedback from a real compliance session on a1k9training: 18 findings and the method that found them. That turned an open-ended "write a legal skill" into a concrete brief. Its sharpest instruction was "no duplication with llms.txt or other skills."

The shape sat **between planned and emergent**:

- **Planned:** the harness, rebuilt five times before; and the contract with its names table, critiqued before any build and corrected for two blockers (`thirdParty` cannot come from `KissPage.links`; the first-party rule was undecided).
- **Emergent:** the skill's content, and two extensions the operator added mid-branch. One was a legal-plugin review of the agents' output. The other was grading the live a1k9training, which found a1k9-specific examples in the skill that primed any review of that site with its own answers.

The planned half held. The emergent half is where the skill got better.

## Evaluate — how the human supervised the AI

**Harness leverage was the strongest dimension, and it came from the operator.** Two of the most productive moves were the operator's, not Claude's.

- **Installing the `legal` plugin and saying "use the legal plugin to review the results from the sub agents".** Claude checked each claim at legislation.gov.uk before acting on it, and the review produced six fixes. One example: the statistics exception's no-sharing condition, PECR Sch. A1 para. 5(1)(c). As written, it would have let an agent file Google Analytics under the exception.
- **"Review C:\Code\kiss\a1k9training using our new skill — grade its compliance".** This tested the skill against a site in its real state. It found what neither the arms nor the clean room could:
  - the skill quoted a1k9training's own findings;
  - its storage check read too early for a 6-second idle timer;
  - P1 had no slot for an unmet Art. 28 contract.

Each sum-beats-the-parts moment pointed the work at a reviewer with a different view (a plugin, a real site). Claude's side was to check what came back before acting on it.

**Pushback & steering: strong on scope, silent on reasons.** The operator decided every scope fork asked: the engine audits on this branch, `eu.md` now, the bench, blind marking, both Codex fixes. Two of those overrode Claude's recommendation (the engine on this branch, `eu.md` now). Both were recorded as "no reason given" after Claude asked once and no answer came. The reason rule recurs in the read-back and in `retired.md`, so it comes back again here.

**Learning engagement was thin, and the miss was partly Claude's.** The pulse's one-decision offer was "who marks the arm results". The operator answered "I'm not sure what you're talking about. Can we just proceed with building the skill". The question was asked before the measurement existed, about a harness the operator had not seen. Claude parked it, re-asked it with context at the measurement, and the operator chose a blind fresh agent. That was a good answer, so the lesson is the timing, not the question.

**Verification & ownership: the artefact everyone depends on was read only by agents.**

- **Where the operator supervised:** the contract ("Looked, it matches"), and the measurement and grade results as relayed.
- **Where they did not:** the shipped `SKILL.md` was not read end to end by a person before close, the Step 5a outcome passed in.
- **The checkpoint that slipped:** the operator meant to steer the skill, and the skill's content was judged by a sub-agent writer, a same-family legal plugin, a blind same-family marker and Claude. That is four same-family readers and no human one.

**Claude's own errors, named:**

- **A guess the operator approved on:** Claude described the process holding port 3001 as "likely your `npm run dev` docs preview". It was `node router.js --dev`, some site's dev server, and was stopped on that description.
- **A sub-agent incident:** workstream C deleted the real `node_modules` through a scratch worktree's junction. It restored it with `npm ci`, and Claude verified the lockfile was unchanged and no worktree was left.
- **Never-red tests:** two tests B added were never seen red (the skill's own needles row; the `allowedIn` owners test).

**Iteration discipline was good.** There were two pulses and three review loops (the critique, the legal plugin, Codex). After each, the claims were checked at the source or in the code. The full suite was run on the combined tree before it was sliced into three commits.

**Competency level: Active supervisor.** The operator framed from evidence, chose the decisive reviewers and bench, and took every scope decision. Two things keep it from Agentic engineering lead: the shipped skill was never read by its owner, and two overrides carry no reason.

## Feedback — recommendations for next session

- **Operator — read the shipped skill before the close.** `kiss-legal-and-privacy/SKILL.md` is about 7.7k and is what every site will follow. Four same-family readers checked it; none was you. This lesson is in `retired.md` row 78 ("send it to the device rather than take 'not now'") and recurred here. Claude offered it after the measurement and the close went ahead without it.
- **Operator — when you overrule, give the one sentence first.** It applied twice here (the engine on this branch; `eu.md` now). Both read as sound calls, and both are recorded as "no reason given".
- **Claude — ask the one-decision question about something the operator has seen.** "Who marks the arm results" was asked before any result existed and read as noise. Hold the question until the artefact it is about is on screen.
- **Claude — identify a process before asking to stop it.** Read its command line (`Get-CimInstance Win32_Process`) first and name it exactly. A guess in the question is a guess the operator approves.
- **Claude — brief sub-agents never to remove a worktree that holds a junction**, and never to touch the main checkout's `node_modules`. C's red-test worktree deleted it. A cheaper red-test route is `git stash` of the fix, or a copy of the one module.
- **Process — `scripts/arms/transcript.mjs` counts only `Read` calls as skill reads.** The clean room read `SKILL.md` with `cat`, and the summary said 0. Count `Bash` reads of `SKILL.md` paths too, with a test. Recorded in `planning/reviews/2026-11-02-legal-arms.md`.
- **Process — the fixture bench needs a scratch repo,** because `setup` copies a whole repository at a commit. A `--site-path <subfolder>` option on `setup` would make the fixture a one-command bench.
- **Process — finish the a1k9training branch from a session in that repo.** `fix/privacy-review-2026-11-02` (`1e8ac66`) needs its `qa/baseline/content.json` refresh as the last commit, its `kiss-branch-*` close, a push and a PR. Gaynor's processor agreement and the two accepted-risk records are hers.
- **Process — three pre-existing dead paths** found by the corpse collector belong to the next docs branch: `lib/css-split.js` in `AIKB/html-split.md` and `AIKB/kiss.md`; `examples/_shared/assets/robots.txt` in `AIKB/robots.md`.

## Verdict — did we achieve the objective?

**The brief:** a UK-first legal domain skill with no duplication, the audits that feed it, and the harness promoted to `scripts/` to measure it on a weak bench. **Met, with one criterion partly met.** The objective moved by Amendment (engine audits, `eu.md`, `kiss-page-add`, the a1k9 bench), and that was good drift: each piece was used by the measurement.

- [x] **The skill exists.** UK and EU, four areas, build and review modes, a 353-character description (`61a9eee`, refined in `6d98b98`).
- [ ] **Every rule cites a primary source: partly met.**
  - **UK:** every fact is dated with a legislation.gov.uk or gov.uk source, and the six legal-review fixes were each checked at the source.
  - **EU:** EUR-Lex and curia returned nothing to automated fetches. C-298/07, E-Commerce Directive art. 5, the Omnibus review rules and the EAA are marked "unverified at source", which is honest, but they are not cited at the primary source.
- [x] **Behaviour sentences measured.** The `youtube-nocookie` keys and the 6-second idle timer were measured in Chromium. The legal-review facts were checked at legislation.gov.uk.
- [x] **Three callers link the skill,** and `skill-coverage.test.js` holds each link and the `CONTRADICTIONS` bans.
- [x] **The site-facing lists:** README, `llms.txt` (14,734 of 16,000), the docs Skills page (rebuilt), init, `CLAUDE.md`.
- [x] **The harness is in `scripts/` with tests.** 43 tests; no bypass flag can be built; transcripts stream.
- [x] **The weak-bench fixture** is in `test/fixtures/`, with its integration test.
- [x] **Measured with and without, $4.12, blind-marked.**
  - On a1k9 the skill changed the outcome: 13 hit, 3 partial, 0 missed with it, against 2 hit and 6 missed without.
  - On the fixture there was no difference, reported as such, and its two shortfalls became skill fixes.
- [x] **Clean room:** an empty folder reached the skill through `kiss-site-new` and passed `kiss-ssg check`. $1.59.
- [x] **`npm run gates` passes,** re-run after every fix. Codex reviewed the whole branch in two passes, with two P2s fixed.
- [x] _(Amendment)_ **No duplication:** the moved sentences are banned in `CONTRADICTIONS`. **Engine audits** shipped with an `### Upgrading` note.

**What is concretely better:** a kiss site with a form now gets a flagged missing privacy link, a pre-ticked marketing box and leftover placeholders from the build itself. Its agent has one place to learn what the law asks, and that place was measured to change the outcome on a real site.

**Still open:**

- the operator's own read of `SKILL.md`;
- the EU facts EUR-Lex would not serve;
- the a1k9training branch's close and Gaynor's agreement;
- the transcript undercount;
- a bench with a special-category form, a consent banner and a price, since the legal-review fixes for those are not exercised yet.
