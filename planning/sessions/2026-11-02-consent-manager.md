---
branch: feat/consent-manager
base: main
status: open
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
