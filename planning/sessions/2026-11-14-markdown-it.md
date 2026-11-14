---
branch: feat/markdown-it
base: main
status: open
opened: 2026-11-14
scope: lib/**, types/**, test/**, package.json, package-lock.json, GUIDE.md, llms.txt, README.md, AIKB/**, CHANGELOG.md, CLAUDE.md, src/**, scripts/budgets.mjs, scripts/gates.mjs, scripts/markdown-links.mjs, scripts/bench.mjs, .github/pull_request_template.md, planning/**, plugins/**, examples/**, .claude/skills/**
---

# Session — 2026-11-14: markdown-it in place of remarkable, and the freeze (Phase 1's close)

## Intent (captured at /branch-open)

**Objective:** Replace remarkable with markdown-it as the renderer behind `.md` partials and the `{{markdown}}` helper, exposed as `kiss.markdown`, and declare the feature freeze by making the budget check a gate. This closes Phase 1 of the road to 3.0 as 2.17.0.

**Success criteria:**

- [ ] `remarkable` is gone from `package.json` (dependencies and devDependencies) and from `lib/`, `src/`, `types/` and `test/`. `markdown-it` is a runtime dependency, and `runtimeDeps` does not grow (21 now, measured).
- [ ] The instance is `kiss.markdown`. `kiss.remarkable` no longer exists. `config.markdown` is handed to markdown-it, with the same three defaults (`html: true`, `xhtmlOut: true`, `breaks: false`) and every other key passed through.
- [ ] Every output byte that changes is explained. A unit or integration test pins each rendering difference the swap introduces, and the upgrade note names each one a site could see.
- [ ] **Fleet:** `node scripts/fleet-check.mjs C:/Code/kiss/a1k9training --base main` is run, plus at least one other fleet site with `.md` content. Every differing page is explained in the pulse log, and none is a regression.
- [ ] `AIKB/upstream.md`'s Remarkable entry (no HTML block starting with `<h1>`–`<h6>`) is re-checked against markdown-it, then rewritten or removed, along with its workaround in `src/controllers/guide.js`.
- [ ] The docs site (`node docs`) builds with markdown-it, and the guide pages' headings and links still resolve.
- [ ] Public API in the same commit: `GUIDE.md` § Markdown options, `llms.txt` (still ≤16,000 characters), `README.md`, `npm run types`, `AIKB/kiss.md`, `AIKB/config.md`, `AIKB/handlebars-helpers.md` and `AIKB/partials.md`. Any skill or `CONTRADICTIONS` row that names `kiss.remarkable` is updated or banned.
- [ ] **Freeze:** the budget baseline is re-recorded after the swap, `npm run gates` runs `node scripts/budgets.mjs --check`, and that check fails on growth (shown by a test that sees it fail). `CLAUDE.md` records the freeze in one sentence.
- [ ] **Clean room:** a fresh sub-agent, given only the packed tarball and its docs, builds a small site with a `.md` partial and a `{{markdown}}` block plus one markdown-it option, passes `kiss-ssg check`, and reports where it had to guess.
- [ ] **Publish record:** this log records what v2.16.0's `/kiss-publish` run saw: whether auto mode refused the tag push, whether `disable-model-invocation` kept the skill out of model reach, and how long it took to stage (`gh run view 43625135105`). Those inferred assumptions in the 2026-11-12 log become measured ones.
- [ ] `CHANGELOG.md` has a 2.17.0 entry with `### Upgrading`, and `npm run gates` passes.

**Non-goals / out of scope:** heading ids or anchors on Markdown headings (markdown-it, like remarkable, writes none; GUIDE.md's link-check trap stays). Any markdown-it plugin shipped by default. Highlighting. The rest of Phase 2 (`kiss-ssg build`/`dev`). Bringing the budget keys that are already worse back under their old baseline: the freeze stops growth from here and doesn't claw back.

**Impact surface:** public API: `kiss.remarkable` becomes `kiss.markdown`, the renderer's output bytes can change, and a new gate. Minor bump to 2.17.0 with an upgrade note.

**Expected shape:** planned. The swap is bounded and the roadmap names the route, but the byte differences emerge only from the tests and the fleet.

**Assumptions:**

- Measured (2026-11-14, `grep -rn remarkable lib/ …`): remarkable is constructed in one place, `lib/kiss.js:770`, as `new Remarkable({ ...this.config.markdown })`, and handed to the helpers and partials as `markdown`. `src/controllers/guide.js` builds two more instances of its own.
- Measured (2026-11-14, `grep -rln "\.remarkable"` over `C:\Code\kiss`, excluding node_modules, public and docs; exit 1, no matches; and over `examples/*/*.js` and `starter/`, also no matches): no fleet site or example reads `kiss.remarkable`.
- Measured (2026-11-14, `node scripts/budgets.mjs --check`): `runtimeDeps` is 21 and 6 of 9 keys are already worse than baseline, so the gate needs a re-record before it can pass.
- Measured (2026-11-14, `npm view markdown-it version`): 15.0.3, modified 2026-10-16, with six dependencies of its own. Remarkable 2.0.1 has two.
- Inferred: markdown-it accepts `html`, `xhtmlOut`, `breaks`, `typographer` and `langPrefix` under the same names, so `config.markdown` keeps its shape.
- Inferred: most CommonMark output is byte-identical between the two. The differences will be in edge cases: autolinks (remarkable's `linkify` uses autolinker), typographer quotes, HTML-block rules and entity escaping.
- Inferred: markdown-it's HTML-block rule allows `<h1>`–`<h6>`, so remarkable's upstream defect, and the workaround in `src/controllers/guide.js`, go away.

**Delegation convention:** none: one session (Opus) implements. The operator chose this over the recommended Sonnet implementer, giving the reason "I trust opus more".

**Independent review:** Codex at the close (`/branch-close` Step 7), which doubles as Phase 1's phase-exit review. There's no mid-branch Codex round; the operator chose this with the same reason as above.

### Amendments

- **2026-11-14 — two rendering decisions, both the operator's, both as recommended.** Footnotes (`[^1]`), which Remarkable rendered by default, are not bundled: GUIDE.md gets a `markdown-it-footnote` recipe, and the upgrade note names the loss (runtimeDeps stays 21). Strikethrough renders markdown-it's `<s>` rather than Remarkable's `<del>`, with no override. Evidence: a probe of 47 syntax cases through both renderers with kiss's defaults found 8 that differ (whitespace in tables, lists and indented code; raw `<hN>` no longer wrapped in `<p>`; `data:` images; `~~` → `<s>`; footnotes). With `linkify: true`, bare URLs now link; under Remarkable 2 that option did nothing. No fleet site uses footnotes or `~~` (grep over `C:\Code\kiss`, examples and src).
- **2026-11-14 — scope widened** to `scripts/markdown-links.mjs` and `scripts/bench.mjs`, both readers of Remarkable's token shape or name, and `.github/pull_request_template.md`, which lists the gates. Each is a sibling of the class this branch changes, found by `node scripts/scope-check.mjs` at the first pulse.

## Pulse log

- **2026-11-14** — Slices: engine swap `940b61f`, freeze `f689d83`, GUIDE fix `16f5dc5`; 0 commits behind `origin/main`. Criterion 1 (remarkable gone, markdown-it in, runtimeDeps 21): **met**, `budgets.mjs --check` shows runtimeDeps 21 same; `grep remarkable` finds only history comments. Criterion 2 (`kiss.markdown`, no `kiss.remarkable`, `config.markdown` passthrough): **met**, `test/integration/markdown.test.js`. Criterion 3 (every changed byte explained and pinned): **partial**, 6 tests pinned and red-first at main (`- red-first: test/integration/markdown.test.js failed at main (5b0644a), 2026-11-14`); the upgrade note is not yet written. Criterion 4 (fleet): **met**. a1k9training identical (20 hashes, 571 files, 0 differ); learna-kiss identical (37 hashes, 316 files; `ok=false` on both sides, 14 failures from missing CMS data); swan-love identical (11 hashes, 105 files). diploma-msc is inconclusive: 36 hashes change, but main against main also changes 36, so its pages are not deterministic run to run, and its build fails on both sides (68 failures, no CMS data). Criterion 5 (upstream entry, guide.js workaround): **met**, both removed, and the Round 21 test passes without the unwrap. Criterion 6 (`node docs`): **met**, 336 links none broken, audit none, no `<p></p>`. Criterion 7 (public API docs): **met**, GUIDE.md, llms.txt (15,997 ≤ 16,000), types, AIKB ×6, a CONTRADICTIONS entry seen failing on the old docs; README names no renderer. Criterion 8 (freeze): **met**. The baseline was re-recorded at the freeze, `budgets` is the sixth gate, and `test/unit/gates.test.js` runs the real gate and sees it fail on growth (red at main only as an import failure). CLAUDE.md has the one sentence. Criterion 9 (clean room): **not yet**. Criterion 10 (publish record): **met**, from `gh run view 43625135105`, `npm view kiss-ssg time` and the operator. The tag push started the run at 18:10:49Z. The gates job took 18:10:52–18:13:09 (`npm run gates` 1m48s); the stage job 18:13:13–18:13:31, "Stage the version" 9s, staged 18:13:29. Tag to staged 2m40s, run 2m42s. Public at 18:46:16 after the operator's 2FA. `disable-model-invocation: true` held (operator: "Held: I typed it"); whether auto mode refused the tag push is **unknown** (operator: "Don't remember"). Criterion 11 (CHANGELOG, gates): **not yet**, close-time. Scope: `scope-check` listed 3 files, recorded above as an Amendment. **Eyeball: looked, by Claude.** The operator asked for a screenshot of GUIDE.md § Markdown options as the docs site renders it; Claude shot it, found the footnote recipe's comment overflowing its code box, fixed it (`16f5dc5`), and sent the re-shot PNG. The operator replied "What do you think", and the verdict that it reads right is Claude's. **Review:** the operator chose `/code-review` on the slice now, over waiting for Codex at the close; pending, run by the operator. **Offer:** re-recording the budget baseline at the freeze, absorbing 2.15.1's and 2.16's growth: kept. Decision: continue, with the clean room and the upgrade note after the review.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
