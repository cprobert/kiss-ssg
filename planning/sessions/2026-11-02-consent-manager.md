---
branch: feat/consent-manager
base: main
status: closed
opened: 2026-11-02
---

# Session — 2026-11-02: Consent management built into kiss

## Intent (captured at /branch-open)

**Objective:** Give kiss a built-in consent manager. A site declares its third-party services once in `config.consent`, kiss gates them behind the visitor's choice and renders a themable default banner. This replaces paid tools such as Cookiebot across the fleet without a third party.

**Decided before the open (conversation of 2026-11-02):**

- **Shape:**
  - built into the engine, not a plugin system (one use case does not justify an extension API);
  - services declared once in `config.consent.services` and loaded by name in templates (`{{script "name"}}`), so the banner, the cookie table and the audit read one list;
  - explicit gating with `type="text/plain"` and a data attribute; no auto-blocking;
  - click-to-load placeholders for iframes.
- **Banner rules:**
  - Accept and Reject equal on the first layer;
  - closing the banner means no consent;
  - category toggles off by default;
  - a settings link on every page to withdraw.
- **The choice:** a first-party cookie holding a consent ID, a timestamp and the config version; ask again after 6 months, and again when the version changes.
- **Consent log:** an optional `config.consent.endpoint` in v1. The build records a timestamped hash of every banner version either way.
- **Google:**
  - Consent Mode v2, basic by default; advanced is an opt-in with a warning;
  - AdSense and Ad Manager tags are refused or warned on, because they need a Google-certified consent manager.
- **UK statistics exception:** a category with `mode: 'objection'` (on by default, can be switched off), opt-in per site. The audit warns when a third-party origin sits in it.
- **Default UI:** themable from config (logo, wording, colours as CSS custom properties), plus an overridable banner partial. kiss keeps the behaviour.

**Inputs:**

- `planning/reviews/2026-11-02-consent-research.md`: the research pass, sources dated 2026-11-02; Google's four claims re-checked at source by the main session.
- `planning/reviews/2026-11-02-cookiebot-baseline.md`: Cookiebot on diploma-msc.com, measured in a clean profile.

**Success criteria:**

- [ ] **Contract first.** `planning/plans/2026-11-02-consent-manager.md` names:
  - the config shape, the helpers and the client API;
  - the cookie format;
  - the audit findings;
  - an **environment matrix**: script kinds (src, inline, module, `async`/`defer`, `document.write`, GTM-injected), iframes, no JavaScript, a returning visitor, a version bump, withdrawal, Consent Mode basic and advanced, a partial override.

  Each row of the matrix has a test. A fresh-context agent critiques the contract adversarially before anything is built against it.

- [ ] **Nothing before a choice, nothing after Reject.** On the new example, measured in a clean Chromium profile: no cookie, `localStorage` or IndexedDB entry and no request to a gated origin before a choice, or after Reject (the consent cookie aside). After Accept, the gated services load in document order.
- [ ] **Withdrawal works.** Changing the choice from the settings link deletes the declared first-party cookies, reloads the page, and the next measurement matches Reject.
- [ ] **Asking again works.** A version bump, or a choice older than 6 months, shows the banner again. A test covers both.
- [ ] **Consent Mode.**
  - `gtag('consent','default',…)` is emitted before anything Google loads;
  - `update` fires on load from the stored choice, and on every change;
  - the order is measured in a real browser, not inferred.
- [ ] **The audit.**
  - It reports a third-party script or iframe that loads without a declared service;
  - it reports a service an `objection` category would run from a third-party origin;
  - it refuses or warns on AdSense or Ad Manager.

  Each is seen red before it is fixed.

- [ ] **Theming.**
  - A site changes the logo, the wording and the colours from config alone.
  - A site that overrides the banner partial keeps gating, storage, events and focus behaviour; a test proves it.
  - The default banner passes WCAG 2.2 SC 2.4.11: a non-fixed region first in `<body>`, keyboard reachable.
- [ ] **The endpoint.** With `config.consent.endpoint` set, a choice POSTs the consent ID, the timestamp, the choices and the version. Without it, nothing is sent. A test covers both.
- [ ] **The diploma-msc trial.** With diploma-msc wired locally to this branch (junction) and Cookiebot replaced by `config.consent`, the clean-profile measurement shows:
  - nothing before a choice;
  - nothing after Reject, the Vimeo storage included;
  - after Accept, the same tag hosts the Cookiebot baseline loaded.

  Nothing in diploma-msc is committed or deployed from this branch.

- [ ] **Clean room.** A fresh agent given only the packed tarball adds consent to an empty site with GTM and a YouTube embed. It passes `kiss-ssg check` and the measurement, and reports every place it had to guess.
- [ ] **Docs.**
  - a `GUIDE.md` section, with its page entry in `src/models/guide.json` so `node docs` builds;
  - one index line in `llms.txt`, kept under the 16,000-character cap;
  - `README.md`;
  - `types/` regenerated;
  - every snippet run against the real engine.
- [ ] **Skills.**
  - `kiss-legal-and-privacy`, `kiss-front-end` and `kiss-site-new` reach for `config.consent`, with rows in `skill-coverage.test.js`;
  - wording that this makes wrong is banned in `CONTRADICTIONS`.
- [ ] **Engine.** Every new `lib/` module has a `test/unit/` sibling and an `AIKB/` doc with a row in `CLAUDE.md`. The client script is a real function inlined by its source, as `scorm-bridge.js` is: linted, type-checked, and tested both rendered and minified.
- [ ] **`npm run gates` passes**, and Codex reviews the `lib/` changes.

**Non-goals / out of scope:**

- IAB TCF, and any Google-certified CMP status; sites that show AdSense or Ad Manager ads keep a certified CMP.
- A hosted consent server; v1 only POSTs to an endpoint the site provides.
- Geotargeting, and automatic translation.
- Scanning for cookies at runtime; the services are declared.
- A general plugin or extension API.
- Committing or deploying anything in diploma-msc, including its Vimeo fix. That belongs in that repo.
- A Cookiebot-migration upgrade note; the 2.11.0 entry still carries `### Upgrading` or `### Nothing for a site to change`.

**Impact surface:** public API — new `config.consent`, new helpers, a client API (`window.kissConsent`), new audit findings. A minor bump, 2.11.0.

**Expected shape:** planned. The research and the measurement fix the destination, and the contract maps the route. The GTM and Consent Mode ordering is the part most likely to move once measured.

**Delegation convention:**

- The main session writes the contract and builds the engine core: config, the helpers, the client script, the cookie.
- Sub-agents take named slices within the files the contract assigns them: the default UI and theme, the example, the skill updates, the measurement runs.
- A fresh-context agent critiques the contract before any slice starts.
- **Agents never commit**; the operator's diff review is the checkpoint.
- No sub-agent removes a worktree that holds a junction, or touches the main checkout's `node_modules` (11-02 feedback).

**Contract:** `planning/plans/2026-11-02-consent-manager.md` (written in plan mode; amended in place with dated sections).

**Carried from earlier feedback:**

- **Decide in `lib/` from the first draft,** including which facts are gathered (11-01).
- **Measure an upstream tool before coding on it:** GTM and Consent Mode ordering, how the browser runs a cloned script (11-01).
- **The environment matrix goes in the contract** (11-01).
- **The operator reads the shipped skill changes before the close,** sent to a device if need be (11-02, retired row 58).
- **An overrule comes with its one-sentence reason** (11-01, 11-02, retired row 56).

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

**2026-11-03: the banner's default position.**

- **What changes:** the theming criterion said the default banner is "a non-fixed region first in `<body>`". The operator chose a **fixed bottom bar by default, configurable to top** (inline, GOV.UK style).
- **The reason**, in the operator's choice of the option: it looks like what diploma-msc visitors already see.
- **What the criterion now reads:**
  - the default banner is first in `<body>` in DOM order and fixed to the bottom;
  - while it shows, `scroll-padding-bottom` equals its height, so no focused control is obscured (WCAG 2.2 SC 2.4.11), measured in the browser suite;
  - `ui.position: 'top'` gives the inline region.

**2026-11-03: the `gtm` preset defaults to `marketing`.**

- **The evidence:** spike S1b, contract Appendix A. In diploma-msc's real container, a statistics-only grant loaded Bing UET, ActiveCampaign and OpenAI scripts. Consent Mode governs Google's own tags, not a container's other tags.
- **What follows:**
  - GTM loads only when marketing is granted;
  - a site whose container gives every non-Google tag a consent check may set `category: 'statistics'`;
  - the diploma-msc trial adds a statistics-only scenario.
- **Not done here:** fixing diploma-msc's container is the operator's work, outside this branch.

**2026-11-03: the withdrawal criterion, restated after the contract critique.**

- **Why:** a page cannot delete a third party's cookies (`vuid` on `.vimeo.com`) or the storage inside an embed's frame, so "the next measurement matches Reject" was unachievable as written for any site with an embed that already ran.
- **What the criterion now reads:** changing the choice from the settings link deletes the declared **first-party** cookies and storage keys, reloads the page, and afterwards no request goes to a gated origin and no new storage is written. Third-party state that already exists is documented as out of reach, in the guide and in `{{consentTable}}`'s party column.

**2026-11-03: the helpers are `consentScript` and `consentEmbed`.** The operator chose these over `script` and `embed` so that no site field or helper of those names can collide, and so all six consent helpers read as one family. Every mention of `{{script}}` and `{{embed}}` in the Intent above means these.

**2026-11-03: the default UI restyled before the close.**

- **The reason, the operator's:** "the diploma MSc one looks better than ours" (its Cookiebot banner).
- **The operator's choices:**
  - keep the full-width bar, polished, rather than Cookiebot's column panel;
  - category switches in the dialog only, not on the first layer.
- **What changed:**
  - **The bar:** a centred inner column, a shadow, quieter body text from the theme's own colours, and full-width stacked choices on a phone.
  - **The dialog:** a header with ✕, real switches (checkboxes with `role="switch"`), divided rows, and the three choices in its footer.
- **Kept as it was:** the equal weight of the choices; Cookiebot's filled-versus-outlined pair was not copied.
- **The cost:** the CSS ceiling moves from 4,096 to 7,168 bytes; it is about 6.7 kB.
- **Then, the operator's:** "Choose cookies should be a different colour", pointing at Google's own consent screen. Accept all and Reject all stay two buttons of one weight; Choose cookies becomes a text button in the accent colour (`kiss-consent__more`), as Google sets "More options". The ICO's equal prominence is about accepting and refusing, so the detail route may differ.

**2026-11-03: the Codex review loops until clean.**

- **The operator's choice:** after round 2, "fix both, loop until clean" over the recommended one-more-run stop. No stop condition beyond a clean run.
- **Rounds so far:** 1 (adversarial) and 2–7 (review), 17 findings. Every finding has been fixed with a regression test seen red first, the browser ones in Chromium. Severity fell round by round: rounds 1–5 held defects that ignored a visitor's choice in a setup a site would use; rounds 6–7 found edge cases and false audit findings.
- **Stop condition, set after round 7 (the operator, on the recommendation):** one last run. Only a P1, meaning consent bypassed or a choice ignored in a setup a site would really use, is fixed on this branch; anything below it is recorded here for later, and the branch goes to `/branch-close`.
- **Round 8, the last: no P1, so the loop ends.** One P2, logged for later rather than fixed here: on a site deployed under a path prefix (`siteUrl: 'https://example.com/site/'`), the banner's and dialog's policy link is written `/cookies/` rather than `/site/cookies/`, and `logoUrlFor` writes a root-relative logo URL, so both break there (`lib/handlebars-helpers.js`, the consent helpers). Not verified locally. The audit's link check would not see it, because `/cookies/` exists in the build folder.
- **The client's size ceiling, raised twice by the operator:** 12,000 → 12,288 → 13,312 bytes, at 12,346 minified, 4,517 gzipped.
- **Raised, not taken here:** the operator asked whether the client should be a cached file rather than inline. The recommendation is to split it into a small inline part (Consent Mode default and update, the stored-choice read, a `kissConsent` stub) and a cached, deferred file. That is its own piece of work after this branch, not absorbed into it.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-03:** the branch so far is `planning/` only: no code, so no tests or example run apply.
  - **Criterion 1 (contract first): met.** `0f78eef` holds the contract: about 50 environment-matrix rows, each naming its test file; the browser spike as Appendix A (S1–S7, plus S1b, statistics only, against the live GTM container with every hit aborted); and a fresh-context adversarial critique (6 blockers, 18 should-fix) folded into the body.
  - **Criteria 2–13: not yet.** Designed, not built. The spike already shows basic mode makes 0 requests before a choice, and the deletion loop clears every cookie shape tried.
  - **Drift:** none. The impact surface is still the public API (2.11.0). The four Amendments (bottom banner, `gtm` defaulting to marketing, the withdrawal criterion, the helper names) stay inside the objective.
  - **Eyeball: deferred.** Contract §1 (lines 21–146, the API a site writes) is to be asked again at the next pulse, before slice 2a closes.
  - **Offer: answered.** Consent helpers on learning-package pages: kept, with the operator's reason, "the lms should deal with that". Refined to match it: head, banner and settings render nothing on a packaged page; `consentScript` and `consentEmbed` fail there (contract §3).
  - **Decision: continue** into slice 2a.

- **2026-11-03 (second):** slices 2a (`7df4f1c`), 2c and 3 (`4634c44`) have landed: `lib/consent.js`, `lib/consent-client.js` and `lib/consent-ui.js`, plus the config wiring.
  - **Evidence:**
    - `npm test` was green at 109 files and 3,432 tests, and the consent and AIKB tests passed again after the size test was added (332);
    - typecheck and lint are clean (one older warning in example 7);
    - every new module has its `test/unit/` sibling, `AIKB/` doc and `CLAUDE.md` row.
  - **Criteria 4 (asking again) and 8 (endpoint): partial.** Both are unit-tested in the client (version, expiry, the beacon payload, no id without an endpoint); the browser suite is still to come (slice 4).
  - **Criterion 7 (theming): partial.** The UI is unit-tested; the override partial and the focus measurement come in slices 2b and 4.
  - **Criteria 2, 3 and 5: partial,** client logic only, with real-browser proof due in slice 4.
  - **Criteria 6 and 9–13: not yet.**
  - **Drift:** none. The impact surface is still the public API.
  - **Eyeball: looked.** The operator opened `scratchpad/preview/consent-preview-bottom.html`, a page built from the three modules (banner, settings dialog, embed, cookie table, settings control): "it's right". Claude's own screenshots first confirmed it rendered with no script errors, and that Accept set the cookie and revealed the embed.
  - **Offer: answered, kept.** A one-off "Load it" on an embed, followed by a choice that leaves its category off, reloads the page and stops the video, so that nothing refused keeps running.
  - **Decision: continue** into slice 2b (the helpers, the gated markup, the wiring check and the fixture site).

- **2026-11-03 (third):** six slices since the last pulse.
  - **What landed:**
    - slices 2b (`675b755`), 2d (`0f7bd3e`), 5 (`514cbd2`), 4m (`a7c4542`), 4 (`0988140`), 6 (`4530b42`) and 7 (`698777a`);
    - two fix commits (`d8e026c`, `c3e8321`), plus 5 engine gaps found by later slices, each seen red first (contract Amendments).
  - **Evidence:**
    - `npm run gates` green at `c3e8321` (test, the 15-test Chromium suite included, lint, typecheck, format, pack); only the trial report has changed since;
    - the diploma-msc trial measured nothing before a choice or after Reject (the Vimeo storage Cookiebot let through included), the same tag families after Accept with `gcs=G111`, and a clean withdrawal.
  - **Criteria met:** 1–9, 11 and 12 (12 in tests).
  - **Criterion 10 (clean room): not yet.**
  - **Criterion 13: partial;** Codex review at close.
  - **Drift:** none. The fixes stay inside the objective, and the impact surface is still the public API.
  - **Eyeball: deferred** to `/branch-close`: the updated `kiss-legal-and-privacy/SKILL.md` (steps 2–3, Build mode). The operator has not yet read the shipped skill changes, the lesson carried from 11-02.
  - **Offer: answered, kept.** On a site that offers no statistics category, Google's `analytics_storage` follows the category holding its Google tags (marketing for `gtm`). The guide tells authors that marketing's description must then cover measuring the site.
  - **Decision: continue** into slice 8 (the clean room).

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-11-03: Consent management built into kiss

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** kiss-ssg 2.11.0's cookie consent manager, 33 commits from `bba695a` to `4de886e`, before this reflection.

- **Engine:** four new modules, `lib/consent.js`, `lib/consent-client.js`, `lib/consent-gate.js` and `lib/consent-ui.js`, plus the wiring check in `lib/kiss-page.js`.
- **The build's report:** seven audit checks in `lib/audit.js`, the `consent` report key, and `kiss-ssg check`'s banner and version lines.
- **Tests:** an 18-test Chromium suite, run in CI on both legs.
- **Site-facing work:** example 14, the guide section, and four skills.
- **Proof:** a diploma-msc trial that replaced Cookiebot and caught the Vimeo storage it missed, a clean room from an empty folder, and eight Codex review rounds with 17 findings, each fixed red first.
- **Outside the repo:** a published draft specification for kiss-consent, the next project, not committed here.

## Reflect — what the session was

**The framing was strong, and the destination was planned.** The objective, thirteen criteria, non-goals and a delegation convention were captured at `/branch-open`. Two research passes were committed before the open: the consent rules, and Cookiebot measured on diploma-msc. The contract was written in plan mode. A seven-case browser spike measured the risky upstream behaviour (Consent Mode order, cloned-script order, `document.write`, parent-domain cookie deletion), and a fresh-context agent critiqued the contract adversarially before a slice was built. Six blockers came out of that critique, at the cost of a document edit.

**The second half was emergent, in three waves the brief did not hold.**

1. **A restyle.** It started with "the diploma MSc one looks better than ours" and ended with Google's "More options" model for Choose cookies.
2. **Eight Codex review rounds.** Their findings declined from consent ignored in normal use (rounds 1–5) to edge cases and false audit findings (6–7), then one P2 (8).
3. **A design conversation for the next phase:** the consent log, the visitor's history, a hosted service.

Each wave was absorbed with an Amendment or a session-log entry. The work stayed inside the objective, but the second half ran without a pulse.

## Evaluate — how the human supervised the AI

**Learning engagement was the session's strongest dimension.** The operator kept asking questions that moved the design, not questions that sought reassurance:

- **"What's the real risk here?"** about a more prominent Accept. The answer separated the settled rule (Reject on the first layer) from the grey zone (colour), and shipped as the GUIDE's filled-Accept override with its limits.
- **"Is it better to have an inline script or to have it separate so it's cached?"** This surfaced the inline-and-cached-file split, now planned.
- **"Are these reviews still proving value?"** It came at round 7, and the answer set the loop's stop condition.
- **"Was this the right decision?"** about building in rather than writing a plugin. The answer named what only the engine could do: the wiring check, the audit facts, the report key.

**Pushback & steering: the operator corrected Claude where it mattered most.** When the operator first suggested `localStorage` for a consent log, Claude argued against it: the cookie already holds the choice, and a local history is not evidence. The operator came back with the case Claude had flattened: "they withdraw consent … then go back in and give limited consent". The point was never to replace the cookie. It was to give the visitor a dated history they can see. Claude conceded, captured the exact sequence in Chromium, and rebuilt the spec around it. That is the session's clearest case of the sum beating the parts: Claude knew the mechanism, and the operator knew what the visitor needs to see.

**The operator also overruled Claude without a reason, and Claude did not ask for one.** After round 2, the operator chose "Fix both, loop until clean" over the recommended "one more run, P1 only". CLAUDE.md asks Claude, in that case, for the reason in one sentence before writing the choice down. Claude recorded it as "no stop condition beyond a clean run" and did not ask. The loop then ran five more rounds before a stop condition existed. CLAUDE.md says a review loop needs one before it starts.

**Iteration discipline: the pulses stopped where the work was densest.** There were three pulses, each with evidence and an eyeball answer, up to the clean room. After that came the restyle, eight Codex rounds, two raises of the client's size ceiling and a five-commit docs and version close, with no pulse at all. CLAUDE.md tells Claude to offer a pulse "after every Amendment and every multi-round review". Claude offered none, so the close read a pulse log that stopped before most of the late changes. In mitigation, every Codex fix had a regression test seen red first, and the browser ones were measured in Chromium. The cadence of checks held inside each fix, even though no pulse brought the operator back in.

**Where the human intended to supervise, versus where they did.** On the UI, the operator supervised fully: they looked at the preview and every restyle screenshot, and asked for a different colour. On the skill, they deferred the read at the third pulse and did it at the close ("looks right"). On the Codex loop, the operator chose the policy and Claude verified every fix itself. No fix diff from rounds 1–8 was looked at by the operator. That was acceptable because each came with a failing-then-passing test. Still, the eight rounds' 17 fixes, into the part of the engine visitors run, are the least supervised code on the branch.

**Harness leverage was high and deliberate:**

- plan mode for the contract;
- Claude in Chrome to study Cookiebot;
- sub-agents for the critique, the slices, the docs, a verification pass and the clean room;
- a real-site trial through a junction;
- Codex as the independent reviewer;
- `AskUserQuestion` at every fork;
- a published page for the next project's spec.

Two places it fell short:

- **The size ceiling was raised twice in one afternoon.** Each time Claude reported the overshoot only after it had happened. Neither time did it suggest a budget for the review rounds still to come.
- **The diminishing returns from Codex were visible by round 6.** The operator had to ask before Claude raised them.

**Competency level: Active supervisor**, with lead-level framing. The research, plan mode, the critique, the trial and the clean room are agentic-engineering-lead behaviour, and so were the decisions on build-vs-plugin, the buttons, packaged pages and records. What holds the level back is the late branch: an unbounded review loop with no pulses, whose fixes the operator saw only as summaries.

## Feedback — recommendations for next session

- **Claude — ask for the reason when the operator overrules a recommendation, every time.** The "loop until clean" choice went into the log without one, against CLAUDE.md § Rules. Next time, one `AskUserQuestion` follow-up before writing the choice down, and "no reason given" if none comes.
- **Claude — offer `/branch-pulse` after each Codex round that changes `lib/`, and after an Amendment.** The rule exists and was not followed for the restyle or any of eight rounds. A pulse per round costs a few minutes; the branch-close had to rely on the commit messages instead.
- **Claude — raise diminishing returns before the operator asks.** By round 6 the findings had turned into false audit findings. The table Claude produced at round 7 could have been produced at round 5 or 6, with the stop-condition question attached. The operator should never have to ask to be asked.
- **Both — set a review loop's stop condition when it starts, even when the answer is "until clean".** "Until clean" can still carry a checkpoint ("revisit after three rounds", "P1 only after round N"). The loop found real defects; the open-ended part was the cost, not the finding count.
- **Claude — measure before reporting a number in an AIKB doc, and re-measure when touching it.** `AIKB/consent-client.md` said 10,932 bytes when the client was already 11,607. That was found only when the size test failed in round 4. A ceiling raised twice in an afternoon also says the budget was set without headroom for review fixes.
- **Operator — look at one Codex fix diff per round in a long review loop.** Every fix was tested, but none was read by a person. Glancing at the biggest one per round (the withdrawal tracking in round 4, the shared-cookie rule in round 5) keeps the reviewer's findings and the fixes in view at the same time.
- **Process — the next branch's brief is ready.** The kiss-consent specification (draft 0.5, published as a page) has D1–D13 for the history log and viewer, with D13 still to decide. Copy it into `planning/specs/` at `/branch-open` as the contract. Two items from this branch fit that branch:
  - the round-8 P2, the policy and logo URLs losing a sub-folder prefix, which lives in the same URL code `ui.history` will use;
  - the inline-and-cached-file split, which decides where the viewer's code loads.

## Verdict — did we achieve the objective?

**Brief:** give kiss a built-in consent manager. A site declares its services once in `config.consent`, kiss gates them and renders a themable banner, and paid tools such as Cookiebot are no longer needed.

**Met.** The criteria, against the pulse log and the close:

- [x] **Contract first:** `0f78eef`, an environment matrix of about 50 rows, the browser spike (Appendix A), and an adversarial critique folded in.
- [x] **Nothing before a choice, nothing after Reject:** measured in Chromium on example 14 and on the diploma-msc trial (`698777a`); document order after Accept is in the browser suite.
- [x] **Withdrawal works:** deletes on the host and parent domains (prefixed cookies too since `e373d25`), reloads, and matches Reject; services started by `when()` or their scripts are withdrawn too since `37d9897`.
- [x] **Asking again works:** version bump and expiry, unit and browser tests.
- [x] **Consent Mode:** default before `gtm.js`, update on load and change, measured in Chromium; `gcs=G111` on the trial after `c3e8321`.
- [x] **The audit:** ungated third parties, an objection category's third-party origin, AdSense or Ad Manager; each red first.
- [x] **Theming:** logo, wording and colours from config, the override partial keeping behaviour (browser test), and WCAG 2.2 SC 2.4.11 kept by the spacer and focus handling. The criterion's "non-fixed region" was amended to a fixed bottom bar by default.
- [x] **The endpoint:** POSTs a choice with an endpoint, nothing without; browser test, and captured records in the kiss-consent spec.
- [x] **The diploma-msc trial:** nothing before a choice; nothing after Reject, the Vimeo storage included; the same tag hosts after Accept; nothing committed there.
- [x] **Clean room:** `072258a`, an empty folder to a passing, gated site, with every guess reported.
- [x] **Docs:** GUIDE section and docs page, the `llms.txt` lines under the cap, README, types, snippets run.
- [x] **Skills:** the four skills, with coverage rows and contradiction bans.
- [x] **Engine:** four modules, each with tests and an AIKB doc; the client inlined from its source, tested rendered and minified.
- [x] **Gates and Codex:** `npm run gates` green at `4de886e`; eight Codex rounds over `lib/`, the last at `655b2f7`. `655b2f7..HEAD` is documentation, the changelog and the version only, with no independent review.

**What is concretely better:** a kiss site can now replace a paid consent manager with one block of config. The build fails a page wired wrongly, and the audit names a tracker nothing gates, which no hosted manager can do.

**Open:**

- the round-8 P2 (sub-folder deployments);
- the inline-and-cached-file split of the client, now 12,346 bytes minified, 4,517 gzipped, under a 13,312 ceiling;
- Firefox and Safari, never measured;
- D13 in the next phase's spec;
- the adviser's answers on retention and the history log's storage status.
