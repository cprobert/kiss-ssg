# Contract — kiss-legal-and-privacy: a legal domain skill, the audits that feed it, and the harness that measures it

Branch `feat/kiss-legal-and-privacy`, opened 2026-11-02. Session file: `planning/sessions/2026-11-02-kiss-legal-and-privacy.md`. Evidence: `planning/reviews/2026-11-02-a1k9-legal-feedback.md` (the a1k9training session that found 18 legal findings kiss had no skill for).

This is the one document the three workstreams build against. It is amended **in place**, with a dated section at the end, when the design moves. It is never forked into a second plan.

## Why

On a1k9training (2 November 2026), `kiss-site-review` found one legal issue: the enquiry form said nothing about personal details. A separate compliance check then found 17 more. The knowledge kiss has is four scattered sentences (`kiss-writing-for-the-web` 131 and 139, `review-protocol.md` P1, `kiss-information-architecture` 77, `kiss-seo` 33); the agent supplied the rest from its own knowledge. This branch puts that knowledge in one domain skill. No other skill or `llms.txt` holds a second copy. It also gives the engine the facts a privacy review needs, and measures whether the skill changes the site an agent produces.

## Decisions already made (2026-11-02, the open and its Amendment)

- **Name:** `kiss-legal-and-privacy`, the seventh domain skill.
- **Jurisdictions:** the skill asks for the jurisdiction first. `references/uk.md` and `references/eu.md` ship now. Any other jurisdiction gets "no reference yet: flag it, and advise a local adviser".
- **Scope:** privacy and cookies, who-we-are disclosures, terms and consumer rights (flag, don't draft), content rights.
- **Authority:** every legal fact cites a primary source, with the date it was checked. The skill says once that it is not legal advice, and routes consumer-contract and liability questions to an adviser.
- **Callers:** `kiss-site-new`, `kiss-site-review` and `kiss-page-add`. Each opens the skill through a Markdown link to its `SKILL.md`.
- **Engine audits on this branch.** Impact surface: **public API**, so a **minor** bump with a `### Upgrading` note.
- **Bench:** a copy of a1k9training at `385434a`, before the privacy work, plus a small fixture in `test/fixtures/` for the unit tests.
- **No duplication:** every legal rule lives in the new skill. Other skills keep their trigger sentence (what to notice) and a link to the skill (what to do), never the rule itself.

## Workstreams

Three, with these owners. A file not listed under a workstream is not that workstream's to touch: ask the main session.

### A — The arm harness and the bench

**Goal:** promote the harness rebuilt five times in scratchpads (2026-10-13, 10-21, 10-31, 11-01 ×2) to `scripts/`, so a skill is measured by running one command, not by rebuilding the harness again.

**Owns:**

- `scripts/arms.mjs`, with one subcommand per step (below).
- Any helper module under `scripts/arms/`, if the file grows past one responsibility.
- `test/unit/arms.test.js`.
- `test/fixtures/legal-weak-site/`.
- `planning/reviews/2026-11-02-legal-arms.md`, the measurement write-up, filled at the end.

**Shape** (the CLI is the seam with B's measurement, so it is fixed here):

```
node scripts/arms.mjs setup     --site <repo path> --commit <sha> --arm <name> --plugin <dir> [--engine <tgz>] --out <dir>
node scripts/arms.mjs run       --arm-dir <dir> --brief <file> [--budget <usd>] [--model <id>]
node scripts/arms.mjs summarise --arm-dir <dir> [--answer-key <file>]
```

- **`setup`** copies the site **from git at the commit** (`git -C <site> archive <sha>`), so the real working tree is never read past its object store and never written. It installs the engine (a packed tarball, default: `npm pack` of this tree) with its own npm cache. It records the source repo, commit, engine version and plugin directory in `<out>/<arm>/arm.json`.
- **`run`** launches one headless `claude -p` session in the copy with:
  - `--setting-sources local`, `--strict-mcp-config`, `--no-chrome`, one `--plugin-dir`;
  - `--output-format stream-json --verbose`, **streamed to `transcript.jsonl` as it arrives**, never buffered until exit;
  - `--max-budget-usd`;
  - an **allow-list** of tools and commands. **Never** `--dangerously-skip-permissions` or any bypass mode. A deny list on top covers commit, push, remote, `gh`, publish and deploy.

  The operator launches `run` when the session's permission check refuses it. The command it prints is copy-paste ready.

- **`summarise`** reads `transcript.jsonl` and reports:
  - cost and duration;
  - each `Skill` call and each `Read` of a `SKILL.md`, with the skill named;
  - tool calls by kind;
  - the final message;
  - with `--answer-key`, each key item marked hit, missed or not applicable, with the transcript line that shows it.

  It counts from the transcript, never from the agent's own account.

**Decisions in tested code:** every rule `arms.mjs` follows is in an exported function with a unit test: the argument parsing, the claude argument list (the test asserts no bypass flag can appear), the transcript parsing and the answer-key scoring. A test that runs a real `claude` is out of scope. The test runs `summarise` against a recorded `transcript.jsonl` fixture.

**The bench:**

- **a1k9 at `385434a`.** First, check which of the 18 findings are actually visible at that commit. The local clone predates the review; the feedback was written against a later tree. Write `test/fixtures/legal-answer-key.json`, one entry per finding:

  ```
  { id, finding, lane, visibleAt385434a, howScored }
  ```

  The four lanes are page wording, owner habit, owner decision and adviser. `howScored` is one of: fixed on the site, asked of the owner, put in the handout, recorded as an accepted risk, flagged to an adviser. A finding not visible at `385434a` is marked as such and scored as not applicable. It is never planted.

- **`test/fixtures/legal-weak-site/`** is a minimal kiss site (3 pages) with planted gaps:
  - a form collecting email and phone, with no line about them and no privacy link;
  - a pre-ticked "send me offers" checkbox;
  - a `<mark>to confirm</mark>` left in a page;
  - a Google Fonts `<link>`;
  - a YouTube `youtube-nocookie.com` iframe;
  - an analytics `<script src>` from a third-party origin;
  - no address or email anywhere.

  It is a fixture for C's integration tests and A's harness test, **not an example**: it lives under `test/` and never ships.

**Brief for the arms:** "Review this site's privacy and legal pages before launch, fix what you can, and tell me what only I can decide." One brief, same for both arms. The arms are `without` (`main`'s plugin) and `with` (this branch's plugin), both on this branch's packed engine, so the audits are the same in both and the skill is the only variable. **Say what the bench is for before the arms run**, in the write-up's first paragraph: a site with the gaps, where a good skill should move the score and a weak one will not.

### B — The skill and its wiring

**Owns:**

- `plugins/kiss-ssg/skills/kiss-legal-and-privacy/`: `SKILL.md`, plus `references/uk.md`, `references/eu.md`, `references/owner-handout.md` (the template for the owner's one-page checklist) and `references/sources.md` if the sources outgrow the jurisdiction files.
- The edits to other skills, listed under _De-duplication_ below.
- The list entries: `README.md`, `llms.txt` (one index line, kept under the 16,000-character cap), `src/models/skills.json`, `lib/init.js`'s skill list (a name only), the domain-skill paragraph in `CLAUDE.md`.
- `test/unit/skill-coverage.test.js`: the three caller rows and the `CONTRADICTIONS` bans.

**`SKILL.md` holds method; references hold law.** The body is the same for every jurisdiction:

1. **Ask the jurisdiction**, and where the owner is based, unless the site's `AIKB/` or its pages already say. Open the matching reference.
2. **Take an inventory before drafting anything**, of every place personal data enters or leaves the site:
   - **From the build:** form fields and the form backend, `mailto:` and `tel:` links, third-party origins (iframes, scripts, stylesheets, fonts), analytics, and the host as a processor. The audits and `report().thirdParty` (workstream C) give most of this; say which command prints them.
   - **Asked of the owner:** email provider, who else sees enquiries (including the site's own developer and administrator), payments, messaging groups, paper records, photos, and any intent to market.
3. **Measure storage in a real browser, never from templates.** Check cookies, `localStorage` and IndexedDB on every page before any interaction, then again after one click. The method lives in `kiss-site-review/browser-pass.md`; this skill says what to look for, and does not copy the method.
4. **Write the notice from the law's checklist** (the Art. 13 items are in the reference), checked against the inventory. **Delete every statement the inventory does not support.** Adapting another organisation's policy is the normal case, and its claims are the hazard.
5. **Mark every fact the owner has not given**: `<mark>` plus "to confirm". The audit's `placeholder-left` stops it shipping.
6. **Keep the form's line as true as the page.** When the page changes (for example, marketing is added), the line changes in the same edit.
7. **Sort every finding into one of four lanes:**
   - page wording: the agent fixes it;
   - owner habit: it goes in the handout;
   - owner decision: recorded as an accepted risk;
   - adviser: flagged, not drafted.
8. **Record accepted risks** in the format `review-protocol.md` uses for design decisions, so the next review reads them as decisions.
9. **Produce the owner handout**, one page, from `references/owner-handout.md`: the ICO fee, the opt-out list, photo consent, deletion reminders, and what to do in a breach.
10. **Verify a vendor claim at its source** (a DPA, a certification), recording the URL and the date. **Never link a deep URL you have not loaded.** Some regulators refuse automated fetches (ico.org.uk returned 403); give a phone number or a search term instead.

**References** hold dated, sourced law, and each fact carries `(checked YYYY-MM-DD, <source URL>)`:

- **`uk.md`:**
  - UK GDPR Arts 6, 7, 13, 14, 28, 30, 32 and 33;
  - the DPA 2018;
  - the Data (Use and Access) Act 2025. **Verify commencement before writing anything as current; a provision not yet in force is written as "from <date>" or "not yet in force".**
  - PECR regs 6 and 22, with the soft opt-in;
  - the ICO fee (Charges and Information Regs 2018);
  - the E-Commerce Regs 2002 reg. 6, with CJEU C-298/07;
  - Companies Act website disclosures (Company, LLP and Business Names Regs 2015);
  - the Consumer Contracts Regs 2013 (flag only);
  - the DMCC Act 2024 on fake reviews (moved from `kiss-seo`);
  - copyright and licences (CDPA 1988, attribution as the licence requires);
  - retention benchmarks: HMRC record-keeping, and the Limitation Act 1980.
- **`eu.md`:**
  - GDPR, with the same article list;
  - the ePrivacy Directive art. 5(3), and the fact that it is implemented nationally, so the reference names the variation rather than one rule;
  - the E-Commerce Directive art. 5;
  - the Consumer Rights Directive (flag only);
  - the Omnibus Directive's review rules;
  - copyright;
  - the European Accessibility Act, only where it touches a legal page (the accessibility statement), linked to `kiss-accessibility` and not restated.

  Each item is marked where it differs from the UK.

**De-duplication**, the edits B makes elsewhere. Each moved sentence is banned in that file's `CONTRADICTIONS` table:

| File                                                 | Keeps                                                                                                                                   | Moves to the new skill                                                                                                                                                                                                               |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `kiss-writing-for-the-web/SKILL.md:131` (P1 example) | the example, as a pointer                                                                                                               | —                                                                                                                                                                                                                                    |
| `kiss-writing-for-the-web/SKILL.md:139`              | "a form that collects personal details says what happens to them", in the site's voice, marked to confirm; plus a link to the new skill | what the notice must contain                                                                                                                                                                                                         |
| `kiss-seo/SKILL.md:33`                               | the `FAQPage`/`HowTo` clause; "no review stars on the business itself"                                                                  | the legal clause ("illegal in the UK if fake or filtered"), with a link                                                                                                                                                              |
| `kiss-site-review/review-protocol.md:25`             | P1's definition                                                                                                                         | P1 legal examples (an Art. 13 item missing, storage before consent, a pre-ticked marketing box, no business address) added as examples that link the skill; the accepted-risk record format added here, because it is the protocol's |
| `kiss-site-review/SKILL.md:69`                       | the writing pass                                                                                                                        | a legal pass line linking the new skill                                                                                                                                                                                              |
| `kiss-front-end/SKILL.md`                            | — (new)                                                                                                                                 | a click-to-load facade for video and maps, as the fix for storage before consent, noting that `youtube-nocookie.com` is not storage-free (**measure it**, don't copy the claim)                                                      |
| `kiss-site-new/SKILL.md`                             | — (new)                                                                                                                                 | a site with a form ships with a privacy page, a footer link and the form line from day one, every claim marked to confirm, per the linked skill                                                                                      |
| `kiss-page-add/SKILL.md`                             | — (new)                                                                                                                                 | a page that adds a form field, an embed or a third-party script opens the linked skill                                                                                                                                               |
| `kiss-information-architecture/SKILL.md:77`          | unchanged (where the privacy link sits is IA)                                                                                           | —                                                                                                                                                                                                                                    |

### C — The engine: facts and audits

**Owns:**

- `lib/audit.js`, `lib/build-report.js` and `lib/build-finish.js`, only where the new key is threaded.
- `lib/kiss-page.js`, only if a new fact field needs parking.
- `lib/config.js`, only if a new config key is needed (see the open question below).
- Their `AIKB/` docs: `audit.md`, `build-report.md`, `build-finish.md`.
- `test/unit/audit.test.js`, `test/unit/build-report.test.js`, and an integration test that builds `test/fixtures/legal-weak-site/`.
- `GUIDE.md` § the audit and § the build report.
- `llms.txt`: one index line per new name, under the cap.
- `README.md`, if it lists audit checks.
- `types/` (via `npm run types`).
- `CHANGELOG.md`'s entry, with a `### Upgrading` note.

**The seam with B is the names**, fixed here so B can write against them before C lands:

| Name                   | Kind                              | Fires when                                                                                                                                               | Notes                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report().thirdParty`  | report key: a fact, not a finding | always present                                                                                                                                           | `{ pages: [{ page, origins: [{ origin, kinds: ['iframe'\|'script'\|'stylesheet'\|'font'\|'img'\|'form-action'] }] }], origins: [<distinct, sorted>] }`. An origin is third-party when it is not `config.siteUrl`'s origin. Font preconnects/stylesheets count. Extracted at write time beside links, like every audit fact. |
| `privacy-link-missing` | audit check                       | a page with a `<form>` that has an `email`/`tel` input (by `type`, or by `name`/`autocomplete` of `email`/`tel`) and no `<a>` to the privacy page        | The default convention for "the privacy page" is **open** (below).                                                                                                                                                                                                                                                          |
| `placeholder-left`     | audit check                       | a `<mark>` element, or the text "to confirm" (case-insensitive) outside script/style/comments, in a built page                                           | Same family as `debug-dump`: unfinished work shipping.                                                                                                                                                                                                                                                                      |
| `checkbox-prechecked`  | audit check                       | `<input type="checkbox" checked>` whose label (by `for`/`id`, or wrapping `<label>`) mentions offers, news, newsletter, marketing, updates or promotions | Word list in one exported constant, tested.                                                                                                                                                                                                                                                                                 |

The checks are appended to `CHECKS` (public vocabulary: adding is not breaking, and renaming is). They are advisory like every audit check, so they never move `ok` or an exit code, and `config.audit.ignore` accepts them. The Upgrading note says a site may see new findings and how to ignore one with a reason.

**Open question C must put to the operator before coding `privacy-link-missing`:** how does the build know which page is the privacy page? The proposed convention, with a default: a page whose `id` is `privacy`, or failing that, any `<a>` whose href path ends in a `privacy` segment or whose text contains "privacy". Override: a config key such as `audit.privacyPage: '<id>'`. A convention with a default, overridable by config, which is kiss's order. If it needs a new config key, that key is public API and joins the Upgrading note.

**Verify before writing** (C's first step): does `extractReferences` in `lib/links.js` already capture `<iframe src>`, `<script src>`, `<link href>` and `<form action>`? If it does, `thirdParty` is derived from `KissPage.links` and adds no second parse. If not, extend the extraction in one place.

## Order and parallelism

1. **This contract is critiqued** by one fresh-context agent, adversarially, before anything is built: what writes each artefact, when, and what moves its baseline? Findings are folded in here as a dated section.
2. **A and C run in parallel.** They share only `test/fixtures/legal-weak-site/`, which **A writes first** (it is small) and C reads.
3. **B starts once the names table above is final.** It may run alongside C, since it writes against the names, not the code. Its `SKILL.md` names the audit checks and `thirdParty` by these names.
4. **Measurement** runs once A, B and C have all landed: pack the engine, set up both arms on a1k9 `385434a`, run, and summarise against the answer key. Results go in `planning/reviews/2026-11-02-legal-arms.md` and one Pulse-log line. A "no difference" is reported as one. If the skill came out long and the measurement shows its extra length did not change outcomes, the cut is proposed in the same message.
5. **Clean-room:** a fresh agent given only the packed tarball and the plugin builds a small business site with a contact form from an empty folder. It must pass `kiss-ssg check` with no `privacy-link-missing` or `checkbox-prechecked` finding, and list every guess it made about the legal pages. `placeholder-left` findings are expected, since the owner's facts are unknown.

## Environment matrix

Each row has a test or a measured run, named at the close.

| Case                                                                 | Covered by                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------- |
| A site with no form (`privacy-link-missing` must not fire)           | C unit test                                                    |
| A form posting to Netlify (`data-netlify`) vs an external `action`   | C unit test                                                    |
| A form whose fields have `name="email"` but `type="text"`            | C unit test                                                    |
| A `<mark>` inside a `<script>` string or a comment                   | C unit test (must not fire)                                    |
| A label wrapping the checkbox vs a label linked by `for`             | C unit test                                                    |
| `siteUrl` unset or local, so the "third-party" origin is undecidable | C unit test: the behaviour is decided and documented           |
| A font from the site's own origin vs from `fonts.gstatic.com`        | C unit test                                                    |
| Windows paths in `setup`'s copy; Git Bash vs PowerShell launch       | A test, plus the measured run on this machine                  |
| A `claude` CLI that rejects a flag the harness passes                | A, the measured run: the error text is recorded                |
| An arm that tries to commit                                          | A: the deny list holds it, and `summarise` reports the attempt |

## Out of scope

- Generating bespoke terms or advice.
- Jurisdictions beyond the UK and EU. A US-state reference is a later branch.
- A consent-banner component.
- `kiss-site-import`.
- The `disallowAll` check-diff mismatch and the watch flake from the 2026-11-01 log.

## Amendments

<!-- Dated sections, appended when the design moves. -->

### 2026-11-02 — the fresh-context critique, folded in

One fresh-context agent read the contract against the code and against a1k9 at `385434a`, and found 2 blockers, 10 majors and 3 minors. The main session re-checked the load-bearing claims itself:

- `extractReferences` returns a flat, sorted string list (`lib/links.js`);
- `llms.txt` is 14,675 characters;
- `DOMAIN_SKILLS` sits at `test/unit/skill-coverage.test.js:1275`, and `kiss-site-review/SKILL.md:71` says "which of the six";
- at `385434a` the site has the email form, the Maps iframes and the `youtube-nocookie` iframes, one of them injected by `site.js:88`;
- "to confirm" appears 12 times in fleet `src/`.

Where this section disagrees with the body above, **this section wins**.

**C — `thirdParty` (blocker 1).** It is its own kind-aware fact in `extractPageFacts`, read quote-aware in the `ATTRS` style. It is **not** derived from `KissPage.links`, which keeps no tag kind and includes every `<a>`.

- **What it reads:**
  - `script[src]`, `iframe[src]`, `img`/`source` `src` and `srcset`, and `form[action]`;
  - `link` whose `rel` is `stylesheet`, `preload`, `preconnect` or `dns-prefetch`.
- **Never `<a>`,** and never `rel=canonical` or `alternate`.
- **Kinds:** `script`, `iframe`, `img`, `form-action`, `stylesheet`, `preload`, `preconnect`. There is no `font` kind; a `preload as=font` reports as `preload` with its `as` value.
- **Scope:** it covers static markup only. An iframe injected by script (a1k9's facade) and a CSS `@import` are invisible to it, and `GUIDE.md` and the skill say an empty `thirdParty` proves nothing.

**C — what counts as first-party (blocker 2).**

- **First-party:** a relative URL, or an absolute URL whose host equals `siteUrl`'s host, with a leading `www.` dropped on both sides. A `//host` URL resolves as https.
- **With `siteUrl` unset or local:** every absolute http(s) origin is listed, and the key carries `siteUrl: null`. The audit does not guess.
- **The report key follows the report's conventions:**
  - appended last;
  - `null` when no page extracted facts (a failed build);
  - each `page` mapped out of staging the way findings are.
- **The Upgrading note says** every site's `AIKB/last-build.json` gains the key at its next `aikb`.

**C — `placeholder-left` (major 3).**

- **Fires on:** any `<mark>` outside script, style, template and comments, or the bracketed text `[to confirm`.
- **Does not fire on:** the bare phrase "to confirm" (12 prose hits in the fleet). The matrix gains a row: prose containing "to confirm" must not fire.
- **The skill tells authors** to write a placeholder as `<mark>[to confirm: …]</mark>`.

**C — the privacy page (major 4, the operator's choice: convention plus a config key).**

- **Which page is the privacy page:** the page whose id is `privacy`. Failing that, the internal page whose built path is `privacy.html` or `privacy/index.html`.
- **The override:** a new config key, `audit.privacyPage: '<id>'`. `lib/config.js` validates it, and it is public API, so it goes in `GUIDE.md`, `types/` and the Upgrading note.
- **A form's privacy link must resolve to that page** through `resolveTarget`. Link text is never matched, and an external href never counts.
- **New facts:**
  - forms, with each field's `type`, `name` and `autocomplete`;
  - internal anchor hrefs;
  - the page id, threaded into `AuditPage` through `build-finish.js`.
- **A field counts** when it is not `type=hidden` and not a honeypot (a `name` of `bot-field`, or Netlify's `netlify-honeypot` attribute naming it).
- **Matrix rows added:** a honeypot email field; `type=hidden name=email`; a footer newsletter form, which fires on every page, where the summary line must stay readable.

**C — `checkbox-prechecked` (minor 13).**

- **`checked`** is a presence test on quote-blanked attributes, as `ALT` is, so `data-checked` and `aria-checked` never match.
- **The label** is matched on word boundaries against the word list, and is read from `for`/`id`, a wrapping `<label>`, `aria-label` or `aria-labelledby`.
- **The word list:** offers, news, newsletter, marketing, promotions, partners, third parties. "Updates" is dropped because it catches service updates.

**A — scoring is human-marked, and `setup` makes a baseline (major 5).**

- **`setup`** runs `git init` in the extracted copy and commits it as the baseline. Without that, "fixed on the site" has nothing to diff against, and the "arm tries to commit" row tests nothing.
- **`summarise`** reports `git diff --stat` and the changed files. With `--answer-key`, it emits an **evidence index** per item: candidate lines from the tool calls, the diff and the final message.
- **A person marks each item** from that index. The tested code builds the index and never decides a prose judgement. The write-up says the scoring is human-marked.

**A — the brief (major 6).** For both arms: "Review this site's privacy and legal pages before launch, fix what you can, and tell me what only I can decide. You cannot ask me questions now; list what you would ask." The answer key scores "asked of the owner" as "listed as a question". This includes the jurisdiction question.

**A — two benches (major 7, the operator's choice: a second, smaller pair).**

- **a1k9 at `385434a`** carries the form, the Maps iframes, the `youtube-nocookie` iframes (static and injected), no privacy page and a locality-only address.
- **`test/fixtures/legal-weak-site/`** carries the Google Fonts link, the analytics script, the pre-ticked box and the `<mark>`. Its planted gaps join the answer key with `bench: 'fixture'`.
- **The fixture pair** runs at a lower budget cap.
- **The write-up says** which bench measured which gap. `385434a` is the clone's head on `^2.7.0`; the feedback was written against a later tree, and the answer key's `visibleAt385434a` records the difference.

**A — what the arms vary (major 8).** The variable is "this branch's plugin diff", not "the skill". Both arms run this branch's packed engine, whose docs name the new checks; the write-up says so, as `upgrade-arms.md` did.

- **Plugin trees** come from `git archive` of a recorded sha: `main`'s at a fixed sha, and this branch's at its head.
- **`arm.json` records:**
  - the plugin sha, and whether the tree was dirty;
  - the engine tarball's sha512;
  - the Claude Code version and the model.

**A — environment matrix additions (major 9).**

| Case                                                                                                  | Covered by                                             |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| A browser available in the arm (Playwright Chromium on the allow-list) vs not                         | the measured run, recorded in `arm.json`               |
| Network for npm, Playwright and the regulators' pages                                                 | the measured run                                       |
| The site's own dependencies (`npm ci`, including a1k9's `@tailwindcss/cli`) before the engine tarball | A test (the order of `setup`'s steps) plus the run     |
| Whether `--setting-sources local` stops the copy's `CLAUDE.md`, `.claude/skills/` and `.mcp.json`     | the first run checks it and records it; **unverified** |

Without a browser, the storage finding is scored as "said the pass did not run" (`browser-pass.md`), never as a miss.

**B — files added to B's ownership (major 10):**

- `DOMAIN_SKILLS` in `test/unit/skill-coverage.test.js`;
- "which of the six" in `kiss-site-review/SKILL.md:71`, which becomes "seven" or is reworded so it doesn't count;
- `test/unit/init.test.js`'s list of domain skills;
- the 400-character description test.

**B — `llms.txt` (major 11).** The skill's name goes on the line that lists the domain skills, and `thirdParty` joins the list of report keys. No line per audit check: no existing check id is in `llms.txt`, and they live in `GUIDE.md`. That spends well under the 1,325 characters left.

**B — de-duplication corrections (major 12).**

- **Every edit is anchored on a quoted sentence, never a line number.** P1 is at `review-protocol.md:24`. `kiss-writing-for-the-web:131` is that skill's own P1 scale.
- **Both coverage rows that assert "personal details"** (`skill-coverage.test.js` ~401 and ~579) must still pass after the move: the trigger sentence stays.
- **Severity:** `review-protocol.md`'s P2 ("the audit's page checks") names `privacy-link-missing`, `checkbox-prechecked` and `placeholder-left` as exceptions, because they are P1.
- **Each `CONTRADICTIONS` ban** gets `allowedIn: kiss-legal-and-privacy/references/uk.md`, or wherever the sentence moved to.

**Ownership (minor 15).**

- **The main session owns** the single `CHANGELOG.md` entry and the plugin-manifest version sync. A and C hand their notes to it.
- **C owns** `GUIDE.md` and `README.md:81`, which lists audit checks.
- **`arms.mjs` spawns `claude` and `npm` behind an injectable runner**, so `run` is testable without a real `claude`, and every argument goes through the tested builder.

**Order, revised.** The privacy-page convention is now settled (above), so B and C can start together. A writes the fixture first, because C's tests read it. Everything else stands.
