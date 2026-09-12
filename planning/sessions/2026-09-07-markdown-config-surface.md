---
branch: feat/markdown-config
base: main
status: closed
opened: 2026-09-07
consolidated: 2026-09-12
---

# Session — 2026-09-07: A Config Surface for Markdown Options

## Intent (captured at /branch-open)

**Objective:** Give `new Kiss(config)` a `markdown` block for Remarkable options — merged one
level deep like `sass` and `fetch` — and correct the `breaks` default that v2 flipped by
accident, so a site's markdown rendering is configuration rather than a documented reach into
`kiss.remarkable` followed by a manual `registerPartials()`.

**Success criteria:**

- [ ] `new Kiss({ markdown: { breaks: true } })` changes both `.md` partial rendering and the
      `{{markdown}}` helper, with no `kiss.registerPartials()` call in the consumer's script —
      the block is applied before construction-time partial registration.
- [ ] `markdown` merges one level deep over the defaults, like `sass` and `fetch`: setting one
      key leaves the others at their defaults rather than replacing the object.
- [ ] Defaults ship as `html: true, xhtmlOut: true, breaks: false` — `breaks` restored to the
      published v1.0.2 value, `xhtmlOut` deliberately left at v2's `true`.
- [ ] A hard-wrapped `.md` partial renders as one paragraph by default, with no `<br />` at the
      source's wrap points. Regression test asserts this against a fixture partial.
- [ ] `lib/config.js` unit test covers the new key (default, one-level merge, `null`/`undefined`
      handling) alongside the existing `sass`/`fetch` merge tests.
- [ ] `llms.txt`, `README.md` and the affected `AIKB/` docs (`config.md`, `kiss.md`,
      `partials.md`) describe the block; `types/` regenerated via `npm run types`.
- [ ] `CHANGELOG.md` records the `breaks` default correction as a behaviour change, not just
      the additive config key.
- [ ] `npm run gates` passes.

**Non-goals / out of scope:**

- No `preset` support (`'commonmark'` / `'full'`) — options only. Reconsider if anyone asks.
- No per-page markdown override. Partials render once at construction, so the option is
  per-`Kiss`-instance by nature, exactly like `sass` and `fetch`.
- Not reverting `xhtmlOut` to v1's `false`. `<br />` and `<br>` are identical in HTML5; the
  only cost is diff noise when comparing a v1 build to a v2 one, which is a migration-time
  concern, not a rendering one.
- Not touching the a1k9 site (separate repo). Its two-line workaround becomes deletable, but
  removing it is a job for that repo.
- Not swapping or upgrading the Markdown renderer.

**Impact surface:** public API — a new `config` key, plus a change to default rendered output.
Obliges `llms.txt` + `README.md` + regenerated `types/`. Additive config would be a minor bump;
the `breaks` default change is observable in built output, so `/branch-close` should weigh that
too. On the current `2.0.0-alpha` line the mechanical bump is
`npm version prerelease --preid alpha`.

**Expected shape:** planned — the destination and the route are both known. The config-block
pattern already exists twice (`sass`, `fetch`); this follows it. The only unmapped part is
where exactly the option has to be applied so it lands before partials register.

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

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-09-08: A Config Surface for Markdown Options

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** `config.markdown`, and `breaks` restored to its published-v1 default (`0242ae1`), plus the bump to `2.0.0-beta.1` with a CHANGELOG entry written as a behaviour change (`5626ee3`).

## Reflect — what the session was

**Planned, and it stayed planned** — which is worth recording, because the two branches before it did not. The intent named the pattern to follow (`sass`/`fetch`/`assets`, merged one level deep), the one unmapped question (where the block had to be applied so it landed before partials registered), and two decisions taken at `/branch-open` rather than discovered mid-build: options-only with no `preset`, and `xhtmlOut` deliberately left at v2's `true` while only `breaks` was reverted. All three held. No Amendment was needed.

The route was as short as the intent implied. The engine diff is **41 lines across two files** — `DEFAULT_MARKDOWN`, a four-line merge and a typedef in `lib/config.js`, and one line in `lib/kiss.js`. Everything else is 165 lines of test, 37 of prose, and 63 of machine-generated `types/`.

## Evaluate — how the human supervised the AI

**Pushback & steering — the standout, and it arrived as a question rather than a correction.** Near the end the operator asked: _"There's a lot of work here. I thought we were just setting config options. Remind me: why are we doing this, and what's been done?"_ That is a supervision act, not a request for reassurance: it re-checks delivered work against remembered intent, which is exactly the check an autonomous agent cannot perform on its own behalf.

What makes it interesting is that the answer cut both ways. The **branch** was proportionate — 41 engine lines, with the test-and-doc ratio set by CLAUDE.md's own rules, not by Claude's enthusiasm. But the **session** genuinely was large: this branch was the eighth piece of work in one sitting, after a consumer diagnosis, a `npm run dev` triage that found three distinct causes, an unplanned three-branch consolidation, closing someone else's branch, a Windows defect found and fixed at its gates, and a CI matrix. The operator's instinct that something had grown was right; it just wasn't this branch. Answering it with the actual `git diff --stat` rather than a defence was the right move, and it is the shape that answer should always take.

**Learning engagement — the same question, read the other way.** "Remind me why we are doing this" is an agent used to rebuild context, which is the honest use when a day has spanned three repositories. The chain it recovered — a1k9's two-line workaround → the published `1.0.2` tarball → `ec0f4fa` flipping `breaks` incidentally → a config surface plus a restored default — is the justification for the branch, and it was worth being able to restate on demand rather than trusting that it had been right eight steps ago.

**Verification & ownership — the TDD cycle caught Claude's own bad test, twice.** The first discriminator was `xhtmlOut: false` asserting a bare `<br>`; it passed against an unimplemented feature, because a non-dev build minifies and the minifier rewrites `<br />` to `<br>` whatever `xhtmlOut` said. A test that passes before the feature exists proves nothing, and only writing it first exposed that. The replacement — `typographer`, whose substitutions are text and survive minification — is strictly better, and it doubles as proof of the passthrough design, since `typographer` is an option kiss has no default for. A second assertion (`&#x27;` for an apostrophe) guessed wrong about escaping and was corrected against the real output rather than the expected one.

The repo then caught what neither of us would have: `test/aikb.test.js` asserts `llms.txt`'s and `README.md`'s config blocks match `resolveConfig({})`, and `types.test.js` demands a byte-identical fresh emit. Three tests went red the instant the default changed. Documentation here cannot drift from the defaults, by construction — the guard fired on exactly the change it was built for.

**Harness leverage — correct at both ends, thin in the middle.** `/branch-open` captured intent that seeded the build and this reflection; `/branch-close` sequenced the checks. But **the branch was never pulsed**, and the operator's scope question is precisely what `/branch-pulse` exists to host: a mid-branch re-read of delivered work against captured criteria. Asked at the end, it can only confirm or regret; asked at the midpoint, it can redirect. The question was well-judged and arrived late for want of a scheduled slot, not for want of attention.

**Competency level: Active supervisor.** Planned non-trivial work before code, took two design decisions up front that held, challenged scope against intent while the work was still open, and required evidence rather than a summary. Short of the lead level for one specific reason: the mid-branch checkpoint the operator's own ritual prescribes was skipped, and the check it exists for happened anyway — unscheduled, at the boundary.

## Feedback — recommendations for next session

**For the human.** Run `/branch-pulse` once per work session on an open branch, even a short one. Your "I thought we were just setting config options" question is a textbook pulse, and its value is proportional to how much work remains when you ask it. At the midpoint it can change the plan; at the close it can only audit it.

**For Claude — two, and both are the same failure to volunteer information.** First, offer the pulse. This branch ran open for a full working session with no checkpoint and I never suggested one, though the ritual I was running names it as the middle beat. Second, when a small change produces a large diff, state the ratio **before** being asked: "41 lines of engine, 165 of test, 37 of docs, 63 generated — the ratio is CLAUDE.md's rules, not scope creep." I had that number available the whole time and only produced it once challenged. An operator should not have to ask whether they are being over-served.

**Technical, for the record.** A non-dev build minifies, and the minifier normalises tag syntax — so `<br />` versus `<br>` can never discriminate between renderer configurations in an integration test. Assert on something the minifier does not touch: text substitutions (`typographer`), or content presence. Written into `test/integration/markdown.test.js` as a comment so the next person does not re-derive it.

## Verdict — did we achieve the objective?

**Objective met — all eight captured criteria.**

- [x] `new Kiss({ markdown: { … } })` changes both `.md` partial rendering and the `{{markdown}}` helper with no consumer-side `registerPartials()` — the renderer is built at `lib/kiss.js:298`, before the constructor's `registerPartials()` at `:344`.
- [x] Merges one level deep, like `sass`/`fetch`/`assets`: setting one key leaves the rest at their defaults.
- [x] Defaults ship as `html: true, xhtmlOut: true, breaks: false` — `breaks` restored to published v1.0.2, `xhtmlOut` deliberately left at v2's value.
- [x] A hard-wrapped `.md` partial renders as one paragraph with no `<br />`, pinned by `test/integration/markdown.test.js`.
- [x] `test/unit/config.test.js` covers the default, the one-level merge, `undefined` handling, and arbitrary-option passthrough.
- [x] `llms.txt`, `README.md`, `AIKB/config.md`, `AIKB/kiss.md` and `AIKB/partials.md` describe the block; `types/` regenerated.
- [x] `CHANGELOG.md` leads with the `breaks` correction as a behaviour change, before the additive key.
- [x] `npm run gates` passes — and now on `windows-latest` as well, from the previous branch.

**Measurable impact.** `a1k9training/generate.js` can delete its two-line workaround outright; the comment above it warning that partials must be re-registered describes a trap that no longer needs avoiding. Any v1 site upgrading gets correct hard-wrapped markdown with no build-script edit at all, which was the actual regression. And a site wanting different Markdown behaviour now has a documented config key instead of an undocumented reach into `kiss.remarkable`.

**What remains open.** Publishing, still — `2.0.0-beta.1` is bumped and unpublished, as `beta.0` was before it, so a1k9training and diploma-msc remain on `alpha.5` and see none of the day's four landed changes. Separately: the diploma-msc fixes (the duplicated `.pages()` block, the missing `.catch`, and the product decision about which model owns `/p/<slug>`), and the `onDuplicate: 'skip'` idea that came out of that diagnosis — deliberately parked rather than absorbed, which is the discipline that was missing this morning.
