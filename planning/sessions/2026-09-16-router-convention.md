---
branch: claude/a1k9-router-helpers-refactor-meez9p
base: main
status: open
opened: 2026-09-16
---

# Session — 2026-09-16: The router convention

## Intent (captured at /branch-open)

**Objective:** Make the router convention — `router.js` as a route table, with tiered
extraction into `helpers/`, `config/` and a build-report module as a site grows — the shape
kiss-ssg teaches by default: stated in `llms.txt`, carried by the three site-building skills,
enforced by `skill-coverage`, and demonstrated by all eleven examples.

**Provenance:** the convention is a1k9training's, landed there in PR #28 (`267cb4a`), which
split a 570-line `generate.js` into a 208-line `router.js` plus `src/helpers/`,
`src/config/business.js` and `scripts/build-report.mjs`. This branch generalises it; it does
not change that site.

**The rule being taught** (not just the name):

- **Tier 0 — one file.** `router.js`: config, routes, `.generate()`/`.sitemap()`, a helper or
  two inline. Correct up to roughly 150 lines.
- **Tier 1 — extract helpers.** When custom helpers pass ~a third of the file, or there are
  more than about three: `helpers/`, one module per kind, `index.js` composing
  `register*Helpers(kiss)`, called immediately after `new Kiss()`.
- **Tier 2 — extract facts and plumbing.** A fact appearing in both markup and JSON-LD/feed
  metadata goes to `config/`; `complete()`/`catch()` callbacks past a few lines get their own
  module.

The thresholds are the point. Without them "adopt this by default" scaffolds a `helpers/index.js`
composing two registrars over one `eq` helper onto a four-page brochure site, and the convention
reads as ceremony.

**Audience, stated because it decides several calls below:** the examples' only reader is an
agent using them as reference while implementing for a client. It does not browse, it lands —
so the ladder has to be _indexed_ (selectable by router shape in `kiss-site-new`'s exemplar
table, declared in each script's header) rather than narrated across the set. And because an
agent copies exactly one example wholesale, the threshold rule is repeated at the top of every
`router.js` rather than stated once.

**Success criteria:**

- [ ] `llms.txt` carries a `## The build script` section: the name, what belongs in the file,
      what does not, and the three tiers with their thresholds.
- [ ] `kiss-site-new`, `kiss-page-add` and `kiss-site-migrate` each name the convention.
      `kiss-site-migrate` carries a rename-then-grep step — a `generate.js` → `router.js` rename
      silently orphans a Tailwind `@source` glob, a `main:` field, an npm script or a CI
      invocation (a1k9 lost a build to exactly this; `qa/css-source-guard.mjs` exists because of it).
- [ ] `test/unit/skill-coverage.test.js` has a row for the convention, seen to fail once with the
      row's pattern removed from a skill.
- [ ] All eleven examples run from `examples/<n>-<name>/router.js`; `package.json`'s `eg1`–`eg11`
      and `CLAUDE.md`'s `check`/`aikb` invocations updated to match.
- [ ] Every `router.js` declares its own tier in a header comment and restates the thresholds.
- [ ] Examples 1–4 stay tier 0 and say why they are not split; 5–6 show tier 1; 11 shows tier 2
      (`helpers/` + `config/` + build-report module).
- [ ] The examples' extracted helpers export a pure function and register a thin adapter, and read
      model data at render time rather than at registration — neither of a1k9's two flaws
      propagates into what agents copy.
- [ ] `script()` and the rendered "How this example works" script panel are gone from
      `_shared/site.js` and from every example.
- [ ] `examples/README.md` no longer promises that only the feature differs between two examples;
      it states the two axes and indexes each example's tier.
- [ ] `kiss-site-new`'s exemplar table is selectable by router shape as well as by situation.
- [ ] `npm run gates` passes, and `test/integration/examples.test.js` passes against the moved
      scripts with every page count unchanged.

**Non-goals / out of scope:**

- Renumbering the examples. An agent arrives via the skill's table; the number is a handle, and
  reordering handles buys nothing against the churn in four skills, the tests and `CLAUDE.md`.
- A twelfth example. Example 11 becomes the tier-2 exemplar instead.
- Any change to `lib/` — no engine behaviour, config key, method or built-in helper moves.
- Fixing a1k9training itself (helpers sealed in untestable closures, `courses.js`'s ladder going
  stale under `_replay()` in dev, `SECTIONS` belonging in `src/config/`). Separate work, on that
  repo, best done before the tier-2 exemplar is written from its shape.
- Backwards compatibility for anyone who copied the old `npm run egN` or `node N-name.js`
  invocations. Deliberately dropped: the audience is agents reading the current tree.

**Impact surface:** tooling & docs — `llms.txt`, `plugins/*/skills/`, `examples/`, `test/` and
`CLAUDE.md`. Nothing in `lib/` changes, no method, config key or helper is added or altered, so a
consuming site's code cannot observe this. Patch bump. (`llms.txt` and `examples/` do ship in the
`files` whitelist, so the _content_ of `node_modules/kiss-ssg` changes shape — noted, and still
not an API promise.)

**Expected shape:** planned — the destination is named (one convention, four doc surfaces, eleven
routers) and the route is mapped. The emergent part is each example's internal split, which is
decided as it is moved.

**Delegation convention:** none — one session. Claude writes, the operator reviews the diff.
Recorded because it departs from one inherited lesson: 2026-09-10's _"dogfood every new skill with
a fresh agent following it literally, before it ships"_ applies to the three skills edited here.
Not delegation of the writing — it is placed at the first pulse, as one fresh-context agent
following the edited `kiss-site-new` on a throwaway site, before the examples move against it.

### Amendments

**2026-09-16 — the remit now includes patching the engine, and the impact surface has moved.**

The operator has established a feedback loop: consumer sites (`a1k9training`,
`pro-plumbing`) build against the **live** kiss-ssg working tree rather than a published
version, and unexpected behaviour found while building a real site is patched here rather than
worked around there. `pro-plumbing` is wired with `file:../kiss-ssg`, which npm symlinks, so a
patch in this repo is live in that site's next build with no reinstall.

Two engine defects came out of the first site built that way, and both are fixed on this branch:

1. **A page's `config: { extensionLess: false }` was accepted and silently ignored.**
   `_preparePage` read `extLess` from the instance's config rather than the page's resolved one,
   so a site that is `extensionLess` everywhere could not emit the literal `404.html` that
   Netlify and Cloudflare Pages require and will not fall back from. Fixed in `lib/kiss.js`;
   `test/integration/canonical.test.js` § per-page extensionLess, seen red first.
2. **A camelCase controller could not have a note named after itself.** `notePathFor` lower-cases,
   the generated README documents the rule as the filename without `.js`, so `jobList.js` with a
   `jobList.md` beside it was reported `missing` _and_ `dead` — two findings for one casing
   difference, and unactionable in either direction. `evaluateNotes` is now case-tolerant on read
   and canonical on write. `test/unit/aikb.test.js`, seen red first.

**This changes the impact surface from `tooling & docs` to `public API`, and the bump from patch
to minor.** Per-page `extensionLess` is behaviour a consuming site can observe and now depends on;
`llms.txt` § API documents it. That is the operator's call at `/branch-close` and it is recorded
here so the bump is read off intent rather than re-derived from the diff.

Non-goals amended accordingly: "no change to `lib/`" is withdrawn. Everything else stands —
still no renumbering, no twelfth example, and a1k9training is still untouched.

Two findings from the same session are **not** patched, deliberately, because both are judgement
calls rather than defects:

- The dangling-reference check flags a backticked file extension in prose (`` `.json` ``) and a
  path into the engine's own source (`lib/controller-resolver.js`) cited by a site's note. Both
  are arguably correct strictness. Reworded in the site instead; raised for the operator.
- `kiss-site-new`'s pointer to `llms.txt` § The build script does not resolve against the latest
  published version (2.2.1). It resolves on release of this branch, but a plugin skill can always
  outrun the installed engine.

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

**2026-09-16 — criterion 6 cannot be met honestly, and is amended.**

The captured criteria said "examples 5–6 show tier 1 (`helpers/`); 11 shows tier 2". Counting
`registerHelper` calls across all eleven routers before writing anything: **ten have none, and
example 9 has exactly one.** Example 5 is the _built-in_ helper reference — every helper it shows
is one kiss ships — so there is nothing custom there to extract.

Meeting the criterion as written would mean inventing custom helpers for two examples purely to
justify a folder, which is the cargo-culting this branch's own thresholds exist to prevent, and it
would be the first thing an agent copied. Criterion 6 is amended to what the set can demonstrate
truthfully:

- **Examples 1–10 are tier 0**, each router's header saying why it was _not_ split. Example 9
  carries the sharpest version: one helper, in a 200-line file, is neither threshold, so it stays
  inline and the header says so. That teaches the rule better than a manufactured folder would.
- **Example 11 is tier 2**, earned honestly: its name was written out three times (the feed's
  channel title, `llms.txt`'s heading, the listing prose) and its description twice.
  `config/site.js` now holds both. It is the demonstration that the `config/` seam is earned by
  **duplication, not by length** — the independent-triggers finding from the pro-plumbing dogfood,
  now shown in running code rather than only asserted in prose.
- **No shipped example reaches the helper-extraction threshold, and the docs now say so** rather
  than implying one does. `examples/README.md` and `kiss-site-new`'s new router-shape table both
  name the gap and describe the shape a site takes when it gets there.

The alternative — a twelfth example built specifically to have four helpers — stays a non-goal. A
site that exists to demonstrate a folder is not an exemplar of anything.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-09-16 (slice one: the convention)** — criteria 1–3 met: `llms.txt` § The build script
  present with the three tiers (`test/aikb.test.js` 152 passed, its `## Helpers`/`## Config`
  section slicing unaffected); all three `kiss-ssg` skills carry it; the two `skill-coverage` rows
  were seen to fail (`2 failed | 32 passed` against a `kiss-page-add` with the convention stripped)
  before passing (34). Criterion 11 partial — `npm run gates` all five green and `npm test` 1252
  passed, but the examples half is untestable until they move. Criteria 4–9 not yet: slice two.
  Criterion 10 deliberately deferred — `kiss-site-new`'s exemplar table cannot offer a router-shape
  column until the examples actually carry tiers; writing it now would be a doc making a claim about
  code that does not exist.
  **Pre-move baseline captured** for slice two: `timeout 40 node 11-blog.js` exits 0, builds 14
  HTML pages, 171 internal references none broken — the numbers `test/integration/examples.test.js`
  asserts and the moved scripts must reproduce.
  **Scope note, not an amendment:** `README.md` was edited (a `### The build script` section under
  Usage, generic `build.js`/`site.js` placeholders → `router.js`) though no criterion named it.
  Same objective, same impact surface, so it is recorded here rather than as scope drift.
  Two self-inflicted defects caught pre-push: a blanket `build.js` → `router.js` replace rewrote
  `AIKB/last-build.json` into `last-router.json` (the 09-10 bulk-rename lesson, landing on me), and
  the first commit carried `"peer": true` lockfile churn from an `npm install`. Both fixed before
  the push. Decision: **continue** to slice two.

- **2026-09-16 (dogfood: `kiss-site-new` on a greenfield site)** — followed the edited skill
  literally to scaffold `cprobert/pro-plumbing` (home + services fan-out + contact, Netlify,
  `extensionLess`). Weaker than the 09-10 lesson asks for — the author following his own skill
  supplies what it left out — but five findings came out of it anyway.
  1. **The skill's new pointer dangles on every real install today.** `npm install kiss-ssg`
     resolves to **2.2.1** (latest published; this repo is 2.2.2, unreleased), whose `llms.txt`
     has no `## The build script`. `kiss-site-new` now tells an agent to read a section that is
     not there. It resolves on release, but a plugin skill can always be newer than the installed
     package, so the skill should carry enough inline to stand without it.
  2. **The two tier-0 triggers can disagree and the doc does not say which wins.** The finished
     router is 177 lines — past the "roughly 150" ceiling — with one helper at about a fifth of
     the file, which is neither extraction trigger. Kept it inline. The doc should say the line
     count is the symptom and the helper proportion the cause.
  3. **`config/` is earned by duplication, not by size, so the numbering misleads.** This site
     needed `src/config/business.js` immediately (the phone number is in the markup and in the
     JSON-LD) while staying tier 0 for helpers. "Tier 2" reads as a later stage; the triggers are
     independent and the section should say so.
  4. **Engine finding, out of scope here: a page's `config: { extensionLess: false }` is accepted
     and silently ignored.** `lib/kiss.js:1155` sets `kissPage.extLess` from
     `this.config.extensionLess`, the instance's. So an `extensionLess` site cannot emit a literal
     `404.html`, which is the only thing Netlify and Cloudflare Pages look for. Worked around in
     the site with a catch-all rule in `netlify.toml`. Not fixed — `lib/` is a non-goal on this
     branch.
  5. **The AIKB dangling-note check false-positives on prose.** Writing "once per `` `.json` ``
     record" in a controller note produced `note dangling: …: .json`. A backticked extension in a
     sentence is read as a subject token.
     Decision: **continue**; findings 1–3 fold into the examples slice, 4 and 5 are for the operator
     to place.

- **2026-09-16 (shape comparison: a1k9training vs pro-plumbing)** — the operator asked whether
  a1k9's practices washed through into a site built after the change. Compared the two trees.

  **The caveat that governs everything below: pro-plumbing is contaminated evidence.** It was
  built in the same session, with a1k9's `CLAUDE.md` imported into context. Some of what landed
  there came from having read a1k9, not from the skill. This is the 2026-09-10 lesson — dogfood a
  skill with a _fresh_ agent — biting exactly where it was predicted to. The comparison is still
  useful, but it measures an upper bound, not what the skill alone produces.

  **Washed through, and attributable to this branch or to llms.txt:** `router.js` as a route
  table (206 lines vs a1k9's 208); the tier thresholds applied _correctly_ — pro-plumbing has
  `src/config/` but deliberately no `src/helpers/`, because two helpers is under the threshold,
  which is the convention working rather than being ignored; `config/` earned by duplication;
  `{{link}}` by identity; `AIKB/` recorded with a note per controller; `complete()`/`catch()`.

  **Did NOT wash through — in a1k9, absent from every kiss-ssg skill, and absent from
  pro-plumbing.** Each was verified by grep across `plugins/kiss-ssg/skills/*/SKILL.md`:

  1. **A rendered-site QA harness.** a1k9 has `qa/` — Playwright, axe-core, Lighthouse, snapshot
     and compare against a baseline, a preview verifier. **No kiss-ssg skill mentions browser QA
     at all.** `kiss-build-check` verifies the _build_; nothing verifies the _page_ — contrast,
     console errors, horizontal overflow at 375px, structured-data parity. Largest single gap.
  2. **Caching policy.** a1k9 ships `src/assets/_headers` (immutable for hashed assets, a year for
     images). No skill mentions `_headers`, caching or immutability; pro-plumbing has none.
  3. **The image convention** — versioned filenames, never overwrite in place, an optimisation
     script. In no skill. Applied in pro-plumbing (`logo-mark-v1.svg`) only because a1k9's
     CLAUDE.md was in context — the clearest single instance of the contamination above.
  4. **`AIKB/site.md`**, the consolidated "why". a1k9 has one; `kiss-site-new` never asks for one.
  5. **The memory loop.** pro-plumbing has no `planning/sessions/` and no vendored kiss-memory
     skills; `kiss-site-new` does not mention setting the loop up.
  6. **CI.** a1k9 runs QA on every PR. Nothing upstream suggests a workflow.

  **Flows the other way — pro-plumbing is better than a1k9 on three counts**, and these belong
  upstream too: the `known` helper that withholds a value until it is real, so placeholder text
  can never reach JSON-LD (a1k9 has no equivalent); `extensionLess` from the first commit, which
  avoids the `canonical=true`-on-every-call rule a1k9 is permanently stuck with; and a brand file
  carrying measured contrast ratios beside each token.

  **Verdict on the captured objective: achieved.** Every criterion is met or explicitly amended,
  and the convention is stated, carried, enforced and demonstrated. **Verdict on the operator's
  broader ambition — "take the best practices from a1k9 upstream" — roughly a third done.** The
  router convention is one practice of about six that site evolved. The remaining five are
  scoped above and are the natural next branch.

- **2026-09-16 (clean-room test, two arms)** — two fresh subagents built the same brief (a mobile
  bicycle repair business, distant from dogs and plumbing) from `npm pack` of this branch. Arm A
  got the tarball only — what a real npm consumer gets, since `plugins/` ships zero files. Arm B
  also got the four skills vendored into `.claude/skills/`, which is a1k9's workaround. Neither
  was told anything about the convention. Both scored against the files, not their own reports.

  | Check                                    | Arm A (no skills)           | Arm B (skills)              |
  | ---------------------------------------- | --------------------------- | --------------------------- |
  | `router.js` at root, route table         | 118 lines                   | 145 lines                   |
  | `src/config/` for dual-surface facts     | yes                         | yes                         |
  | `src/helpers/`                           | absent, 0 helpers — correct | absent, 0 helpers — correct |
  | `{{link}}` / hand-typed hrefs            | 24 / **0**                  | 12 / **0**                  |
  | `complete()` + `catch`                   | yes                         | yes                         |
  | `AIKB/` recorded + notes                 | 7 files                     | 6 files                     |
  | **Invented facts**                       | **none**                    | **none**                    |
  | **`CLAUDE.md` with the llms.txt import** | **NO**                      | yes                         |

  **The delta is one row.** Everything else the arms derived from `llms.txt` and `examples/` alone.
  The skills' unique contribution on this task was step 2 — writing the `CLAUDE.md` import that
  makes every _future_ session read the contract. That is a persistence mechanism, not a
  build-quality one, and it is the one thing that does not ship. It is also the highest-leverage
  thing in the four skills, because without it every later session starts from nothing.

  **Neither arm invented the withheld facts** (email, hours, qualifications) — the practice a1k9
  holds hardest and that no skill mentions. Both reached it from the brief alone. That weakens the
  case for writing it into the skills and strengthens the case that it is simply what a careful
  agent does when told a fact is unavailable.

  **Isolation leaked, and not through either agent's conduct.** Arm B declared unprompted that the
  sibling repositories' `CLAUDE.md` contents were injected into its context by the harness. Arm A
  reported reading nothing outside its project and noted that arm-b's skills were surfaced to it
  mid-task without being invoked. So a subagent cannot be isolated from this session's registered
  repositories: a genuinely clean run needs a separate session with only the test repo attached.
  Both results are therefore an upper bound.

  **Two defects, each found independently by both arms:**
  1. **`isActive` builds its block context from its own hash**, so `{{label}}` inside the block is
     not inherited from the surrounding `{{#each}}`. Arm A caught it by reading `lib/` before
     writing; arm B shipped it and caught it by reading the rendered HTML — five nav links with
     empty labels on a **green build**. Two independent agents, one trap. `llms.txt` § Helpers
     does not say it.
  2. **The AIKB dangling check treats any backticked token containing `/` as a file path**, so a
     page id or an illustrative path written in prose is reported dangling. This is now its
     **fourth** independent report (twice mine on pro-plumbing, once per arm).

### Inherited feedback this branch carries

- **The operator eyeball has recurred three times since being retired** (09-10, 09-12, 09-15).
  `retired.md`'s preamble says that is evidence the destination was wrong; 09-15 proposes moving
  it into `/branch-pulse` and leaving `/branch-close` Step 5a as a confirmation. That is a
  `/memory-consolidate` job, not this branch's — but this branch's first pulse should carry a real
  look at a built artefact rather than deferring it to the close a fourth time.
- **Unanswered across two logs (09-10, 09-12):** whether
  `planning/benchmarks/baseline-main.json` is the branch's baseline (`CLAUDE.md`) or history
  (09-06 follow-up). Does not block this branch; still open.
- **09-15:** state which claims are measured and which are inferred. This branch writes prose
  about a1k9's shape into kiss-ssg's docs — each claim about that site is checkable against the
  repo, and gets checked rather than remembered.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
