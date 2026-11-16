---
branch: feat/markdown-it
base: main
status: closed
opened: 2026-11-14
consolidated: 2026-11-16
scope: lib/**, types/**, test/**, package.json, package-lock.json, GUIDE.md, llms.txt, README.md, AIKB/**, CHANGELOG.md, CLAUDE.md, src/**, scripts/budgets.mjs, scripts/gates.mjs, scripts/markdown-links.mjs, scripts/bench.mjs, .github/pull_request_template.md, .claude-plugin/marketplace.json, planning/**, plugins/**, examples/**, .claude/skills/**
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
- **2026-11-14 — scope widened** to `.claude-plugin/marketplace.json`, which `npm version minor` synced at the close's bump to 2.17.0 (`scripts/sync-plugin-versions.mjs`), found by the close's Step 5b.
- **2026-11-14 — the fleet check run on live CMS data, at the operator's request.** learna-kiss and diploma-msc were cloned into the scratchpad, `get-data` fetched their Orchard content there (diploma-msc: 799 items in 18 types), and `fleet-check` built each clone from `main` and from the branch. 71 of 1,953 files differed; a diploma-msc control (main against main) differed in 0 bytes. Each difference traced to its CMS source: literal U+00A0 kept where Remarkable wrote a space (68 files); a link destination's `&amp;` decoded once, which fixes a broken Google Scholar link Remarkable published (1 page and its Markdown copy); a lone `<img>` line no longer wrapped in `<p>` (1 page, ~16px less space under the Max Healthcare logo). A browser comparison of the 38 differing pages, with third parties blocked and a base-against-base control, found no other visible change (the live countdown banner accounts for the rest). Three tests were added for these (`19a8ae6`) and one for the `data:image` allowance (`452e8f4`), each seen failing on main with remarkable installed unsaved for the red-first run. The CHANGELOG draft was corrected twice by measurement: `&nbsp;` entities and `<iframe>` were never affected.

## Pulse log

- **2026-11-14** — Slices: engine swap `940b61f`, freeze `f689d83`, GUIDE fix `16f5dc5`; 0 commits behind `origin/main`. Criterion 1 (remarkable gone, markdown-it in, runtimeDeps 21): **met**, `budgets.mjs --check` shows runtimeDeps 21 same; `grep remarkable` finds only history comments. Criterion 2 (`kiss.markdown`, no `kiss.remarkable`, `config.markdown` passthrough): **met**, `test/integration/markdown.test.js`. Criterion 3 (every changed byte explained and pinned): **partial**, 6 tests pinned and red-first at main (`- red-first: test/integration/markdown.test.js failed at main (5b0644a), 2026-11-14`); the upgrade note is not yet written. Criterion 4 (fleet): **met**. a1k9training identical (20 hashes, 571 files, 0 differ); learna-kiss identical (37 hashes, 316 files; `ok=false` on both sides, 14 failures from missing CMS data); swan-love identical (11 hashes, 105 files). diploma-msc is inconclusive: 36 hashes change, but main against main also changes 36, so its pages are not deterministic run to run, and its build fails on both sides (68 failures, no CMS data). Criterion 5 (upstream entry, guide.js workaround): **met**, both removed, and the Round 21 test passes without the unwrap. Criterion 6 (`node docs`): **met**, 336 links none broken, audit none, no `<p></p>`. Criterion 7 (public API docs): **met**, GUIDE.md, llms.txt (15,997 ≤ 16,000), types, AIKB ×6, a CONTRADICTIONS entry seen failing on the old docs; README names no renderer. Criterion 8 (freeze): **met**. The baseline was re-recorded at the freeze, `budgets` is the sixth gate, and `test/unit/gates.test.js` runs the real gate and sees it fail on growth (red at main only as an import failure). CLAUDE.md has the one sentence. Criterion 9 (clean room): **not yet**. Criterion 10 (publish record): **met**, from `gh run view 43625135105`, `npm view kiss-ssg time` and the operator. The tag push started the run at 18:10:49Z. The gates job took 18:10:52–18:13:09 (`npm run gates` 1m48s); the stage job 18:13:13–18:13:31, "Stage the version" 9s, staged 18:13:29. Tag to staged 2m40s, run 2m42s. Public at 18:46:16 after the operator's 2FA. `disable-model-invocation: true` held (operator: "Held: I typed it"); whether auto mode refused the tag push is **unknown** (operator: "Don't remember"). Criterion 11 (CHANGELOG, gates): **not yet**, close-time. Scope: `scope-check` listed 3 files, recorded above as an Amendment. **Eyeball: looked, by Claude.** The operator asked for a screenshot of GUIDE.md § Markdown options as the docs site renders it; Claude shot it, found the footnote recipe's comment overflowing its code box, fixed it (`16f5dc5`), and sent the re-shot PNG. The operator replied "What do you think", and the verdict that it reads right is Claude's. **Review:** the operator chose `/code-review` on the slice now, over waiting for Codex at the close; pending, run by the operator. **Offer:** re-recording the budget baseline at the freeze, absorbing 2.15.1's and 2.16's growth: kept. Decision: continue, with the clean room and the upgrade note after the review.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-11-14: markdown-it in place of remarkable, and the freeze

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:**

- The renderer swap: markdown-it 15 is the renderer behind `.md` partials and `{{markdown}}`, as `kiss.markdown`, and `kiss.remarkable` is removed (`940b61f`).
- The feature freeze: `budgets` is the sixth gate, with the baseline recorded at the freeze (`f689d83`).
- Ten renderer behaviours pinned in `test/integration/markdown.test.js`, each seen failing on `main` (`940b61f`, `19a8ae6`, `452e8f4`).
- 2.17.0, with an upgrade note (`19591fc`).
- Phase 1 of the road to 3.0 is closed.

## Reflect — what the session was

**Framing.** The brief was framed well before any code. The roadmap had already named the work, and the open turned it into eleven checkable criteria. The read-back turned a three-times-recurring item (the publish record) into a criterion, not a fourth read-back. Two design forks surfaced once the code met reality: footnotes and `<s>`. Both were put to the operator as questions before any code depended on them.

**Shape.** The work was planned for most of its length: swap, freeze, pulse, review, clean room. It turned emergent at the operator's request to fetch live CMS data for learna-kiss and diploma-msc. The planned route had reached "fleet identical on three sites", which was true and would have been the release claim. The emergent leg found what that claim had missed:

- 71 of 1,953 files changed on the two sites the operator cares most about;
- one live broken link, fixed as a side effect;
- three renderer behaviours with no test and no line in the changelog.

The plan served the swap. The emergent leg served the release.

## Evaluate — how the human supervised the AI

**Pushback & steering: the session's decisive moment was the operator's.** After a fleet check and a browser comparison that both came back clean, the operator said: "Run get data on learna and diploma MSc. They're the ones I really want to know are safe." Claude had treated learna-kiss (failing without CMS data) and diploma-msc (non-deterministic, main against main) as limits of the measurement, and reported them as such. The operator treated them as the sites that mattered and asked for the measurement to be made possible.

That exchange produced something neither side held alone. The operator knew which sites carry real content. Claude worked out how to fetch it without touching the real folders:

- a throwaway clone for each site;
- an install with `--ignore-scripts`, so the global `firebase-tools` postinstall didn't run;
- `core.longpaths` passed through `GIT_CONFIG_*` for the 190-character filenames;
- the fetched content committed in the clone only.

Claude then traced every one of the 71 files to its CMS source. The diploma-msc control, main against main, gave 0 bytes changed. So the earlier "inconclusive" verdict on that site had been a side effect of missing data, not a property of the site.

**Verification & ownership: the human decided, and handed back the looking.** The operator decided every fork with a reason or a recommendation:

- footnotes as a recipe, not a bundled plugin;
- `<s>`, not `<del>`;
- the minor bump;
- keeping the re-recorded baseline;
- skipping `/security-review`;
- reviewing the first slice now, not only at the close.

The operator also typed `/codex:review` mid-branch. But the eyeball was handed back. Asked whether § Markdown options read right, the operator answered "What do you think". That makes it **looked, by Claude**: Claude's own look found and fixed one fault (the code comment overflowing its box, `16f5dc5`). The three side-by-sides sent later have no answer on record, so it is unknown whether the operator saw the Max Healthcare spacing change. The operator meant to supervise the look at the pulse; in fact Claude judged it.

**Iteration discipline: strong.**

- One pulse after the first two slices, with the scope widening recorded at it.
- Two Codex passes: the operator's at `e83a0b8`, and the close's over the whole branch.
- Three fleet runs, the last on live data.
- A clean room whose result Claude re-ran before accepting.
- Every new test run red-first.

One red-first was hollow at first. After `npm uninstall remarkable`, `main`'s `lib/kiss.js` failed on import, so the whole file "failed at main" without any test running. Claude caught it from the output (`(0 test)`) and re-ran with remarkable installed via `--no-save` until the run proved each test.

**Where Claude over-reached, three times, each caught within a turn or two:**

- It told the operator that 2.16.0's `/kiss-publish` had not run. It had, and was waiting on 2FA: an unchecked inference from `npm view` alone.
- In a security question, it said that "a test pins" the `data:image` allowance. None did. It corrected this the next turn and wrote the test (`452e8f4`).
- The first CHANGELOG draft claimed `&nbsp;` entities and `<iframe>` were affected. A probe showed neither was, and both lines were corrected before the bump.

Each was a claim stated before its measurement, which is exactly what `CLAUDE.md` § Rules forbids. Each was caught by Claude, but only after it had been written down, and in one case after it had gone into a question.

**Harness leverage: high.**

- A Sonnet clean room, in the background, on the packed tarball.
- Background fleet runs, while the freeze slice was written in the foreground.
- Codex twice.
- Python Playwright through `/webapp-testing`, with servers started by `Start-Process` and stopped by PID, as the last log recommended over `with_server.py`.
- A token-level diff script once the character-level one proved quadratic.

The shell-edit hook refused one PowerShell `Out-File`, and the PIDs were printed instead. The rule held.

**Competency level: Active supervisor.** The operator framed, steered at the decisive moment, decided every fork and asked for the review mid-branch. The look was handed back, and the visual results have no recorded answer, which keeps it short of Agentic engineering lead.

## Feedback — recommendations for next session

- **Operator — give the verdict on an artefact you asked to see.** "What do you think" handed the look back twice in two days (2026-11-14 partial transforms, and here). Nobody has yet said whether the Max Healthcare spacing change is acceptable. Next time, answer the eyeball question with what you saw ("fine", or "the logo spacing matters"), even from a phone.
- **Operator — keep naming the sites you care about.** "They're the ones I really want to know are safe" found more than every planned check combined. Say it at `/branch-open` next time, as the fleet criterion's named sites, so it is planned and not a late emergent leg.
- **Claude — measure a claim before it goes into a question, not after.** The `data:image` claim went into a security `AskUserQuestion` unchecked. It is the same rule as retired row 83 (a relayed finding re-derived first), applied to Claude's own claims. Before an option's description states a fact, run the grep that shows it.
- **Claude — do not report a site as "inconclusive" and stop.** learna-kiss and diploma-msc were written up as limits of the measurement. The operator had to ask for the data fetch that made them measurable. When a fleet site can't be measured, name what would make it measurable (here, `get-data` into a clone) and offer it.
- **Process — `red-first.mjs` cannot prove a test after a dependency the base needs has been removed.** Every red-first after the uninstall failed on import at `main`. The workaround (`npm install --no-save <dep>`, run, `npm prune`) should go in `AIKB/testing.md`, or become a red-first flag that installs the base's dependencies.
- **Process — a CMS-driven fleet site needs its data to be checked at all.** The recipe that worked: a clone, `.env` copied in, `npm install --no-package-lock --ignore-scripts`, `get-data`, the data force-added under `GIT_CONFIG_*` `core.longpaths`, then `fleet-check` on the clone, then the copied `.env` deleted. It belongs in the fleet memory, or as a `fleet-check` option, so the next phase exit starts from it.

## Verdict — did we achieve the objective?

**The brief:** replace remarkable with markdown-it as `kiss.markdown`, and declare the freeze by making the budget check a gate, closing Phase 1 as 2.17.0.

**Verdict: met.** The objective grew once, into the live-data fleet check, and that was good drift.

- [x] **remarkable out, markdown-it in, runtimeDeps not grown.** `package.json` has no remarkable. `budgets --check` shows runtimeDeps at 21, the same as before.
- [x] **`kiss.markdown`, no `kiss.remarkable`, `config.markdown` passthrough.** Integration tests. An unknown option is ignored, which was probed.
- [x] **Every changed byte explained and pinned.** Ten tests in "the renderer is markdown-it", all failing on `main`, with remarkable installed for the red-first run. All 71 live-data differences were traced to source. The CHANGELOG names each change, and two of its claims were corrected by measurement.
- [x] **Fleet.** a1k9training, swan-love and learna-kiss are byte-identical without CMS data. With CMS data, diploma-msc and learna-kiss show 71 of 1,953 files changed, all explained, against a deterministic control. The browser comparison found two visible changes, both in the upgrade note.
- [x] **Upstream entry and guide.js workaround removed.** Round 21's test passes without the unwrap.
- [x] **`node docs`.** 336 links, none broken, the audit clean, no `<p></p>`.
- [x] **Public API docs in the same commit.** GUIDE.md, llms.txt (15,997 characters), README.md, types, the AIKB docs, and a CONTRADICTIONS entry. The docs sweep fixed the CLAUDE.md pipeline paragraph at the close (`164fa8f`).
- [x] **Freeze.** `budgets` is the sixth gate, `test/unit/gates.test.js` sees it fail on growth, and CLAUDE.md has one sentence on the freeze.
- [x] **Clean room.** Sonnet built a site from the shipped docs alone, with a footnote plugin, curly quotes and `{{link}}`. Claude re-ran `check` (exit 0) and read the HTML. Its guesses were older traps, or the packing happening before the version bump.
- [x] **Publish record.** The 2.16.0 run went from tag to staged in 2m40s and was public at 18:46:16. `disable-model-invocation` held. Whether auto mode refused the tag push is unknown, because the operator doesn't remember.
- [x] **CHANGELOG 2.17.0 with `### Upgrading`, and the gates pass.** All six passed at `cbca292`. Codex reviewed the whole branch at the close and found no actionable regressions.

**What is better:**

- The renderer is maintained and follows CommonMark.
- A broken Google Scholar link on diploma-msc will be fixed at that site's next build.
- Budget growth now fails a gate.

**Still open:**

- Whether the Max Healthcare logo spacing needs a `<p>` in the CMS.
- Publishing 2.17.0 with `/kiss-publish`, and the fleet's upgrade to it, which Phase 1's exit needs.
- #90's clean-room traps.
- The red-first and CMS-fleet recipes named above.
