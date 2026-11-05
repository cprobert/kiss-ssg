---
branch: feat/page-ids-and-embed-poster
base: main
status: closed
opened: 2026-11-05
---

# Session — 2026-11-05: Page ids from CommonJS and served paths, and `{{embed}}` posters, wording and autoplay

## Intent (captured at /branch-open)

**Objective:** Ship two site requests as one minor release. From diploma-msc: page identity, meaning `toSlug` reachable from a CommonJS build script, explicit ids that cannot silently mismatch the written page, and an opt-in default id equal to the served path. From a1k9training: `{{embed}}` that looks like a video, meaning a self-hosted `poster=`, its own wording without `config.consent`, and autoplay on Load for the video presets.

**Success criteria:**

- [ ] **#1 CommonJS reach.** `require('kiss-ssg')` still returns the `Kiss` class, and `toSlug` and the rest of `utils` are reachable from it, e.g. `Kiss.utils.toSlug`. An integration test drives it through `require` and was seen red first.
- [ ] **#2 Explicit-id mismatch.** When a controller- or call-supplied `id` disagrees with the slug kiss actually wrote, the build says so: a named warning or report finding that names the page, the id and the written slug. The diploma-msc case (a trailing space, a leading `-`) is the regression test, seen red first. Whether the id is also normalised is decided by testing the reasons behind today's verbatim rule (`page-registry.js` § identity) against the new behaviour, and that decision is recorded here.
- [ ] **#3 Path ids.** An opt-in config key (name settled in its design pass) makes a page's default id its served path without the extension. That gives an id to pages sharing a view, which get none today. Explicit ids still win, and `{{link}}`, `last-build.json`'s moved and removed findings, and the AIKB record all agree with it. A fresh-context agent critiques the design note before any code is built against it.
- [ ] **#4 `poster=`.** `{{embed … poster=<local image>}}` draws the image through the `{{image}}` pipeline (AVIF/WebP `<picture>`, lazy unless `eager=true`, metadata stripped) inside the reserved box with no layout shift. A remote URL is refused with a message that says why (it would make the third-party request the facade exists to prevent). Measured in a browser: no request to the provider before Load.
- [ ] **#5 Wording.** Without `config.consent`, wording is settable per call (e.g. `load=`, `notice=`) and site-wide, through the same `ui.text` keys `config.consent` already uses, so the text has one home. The default Load button's accessible name includes the title (e.g. "Play video: <title>" for a video preset).
- [ ] **#6 Autoplay.** The youtube and vimeo presets add autoplay on Load by default, and `autoplay=false` turns it off. Measured in desktop Chromium: the video plays after the one click. The GUIDE does not claim iOS behaviour it has not measured. The operator's call: shipping it even if iOS still asks for a tap beats not shipping it.
- [ ] **Docs and contracts.** For every public change: `GUIDE.md`, one index line each in `llms.txt` (under its 16k cap), `README.md` where relevant, regenerated `types/`, the relevant skills (`kiss-front-end` or the embed or page skills) with a `skill-coverage` row, `AIKB/` docs for each module changed, and a `CHANGELOG.md` 2.13.0 entry with `### Upgrading`.
- [ ] **Clean room.** A fresh sub-agent, given only the packed tarball and its docs, builds in an empty folder a page with a postered YouTube embed and a CommonJS router that uses `Kiss.utils.toSlug` and path ids. Its result passes `kiss-ssg check`, and it reports every place it had to guess.
- [ ] **Fleet check.** diploma-msc and a1k9training each build against the branch's engine, and the result is recorded. diploma-msc's `pageSlug()` copy could go; a1k9training's embed takes `poster=`.
- [ ] `npm run gates` is green on the branch head.

**Non-goals / out of scope:** Fetching or caching provider thumbnails (`i.ytimg.com`) at build time. Changing the default id convention for sites that do not opt in. Changing `config.consent`'s banner or dialog. Presets other than youtube and vimeo getting autoplay. Measuring iOS Safari, unless the operator does it on a device.

**Impact surface:** public API: a new static on `Kiss`, a new config key, a new build warning, new `{{embed}}` hash keys, and a default change for two presets. Proposed bump: minor, 2.13.0.

**Expected shape:** between. #1, #2, #4, #5 and #6 are planned. #3 has a design pass first, and if it turns up more than expected it is recorded as an Amendment rather than forced through.

**Delegation convention:** One session builds all six items. One fresh-context agent critiques the #3 design note before it is built. Agents never commit.

**Review threat model (written now, per the 2026-11-04 feedback):** One site per build script, honest source files, a stable working directory. High and medium findings within this branch's diff are fixed on the branch. Lower findings, and findings in hostile-input, multi-site or mixed-version scenarios, are listed in this log and not fixed. When a round's findings change kind, the threat model goes back to the operator before the next round. Between rounds the largest fix diff is shown to the operator. A scoped Codex review and a fleet check run at the pulse after each engine slice, not only at the close.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-11-05, version (at `/branch-close` Step 4a).** Claude proposed a minor, 2.13.0, from the impact surface: two new config keys, new `{{embed}}` keys, a new audit check, and a changed default for the video presets. **The operator chose a patch, 2.12.2.** Reason, in the operator's words: "Small cleanups". The CHANGELOG entry still carries an `### Upgrading` note, because a video embed's button and autoplay change for every site on `^2`, and CLAUDE.md asks for a note on any patch a site must check.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-05, after slice 1 (`cde4907`).** #1 met: every named export is a static on the class. The test compares the ES module's named exports with the statics through a real `require`, and was red first, listing all twelve exports rather than only `utils`. #2 met: the audit check `id-slug-mismatch`, with the diploma-msc case as its regression test, red first. **Decision on #2: warn, do not normalise.** The verbatim rule's reasons still hold: a `{{link}}` built from the same raw data must keep resolving, and rewriting an id would move its `last-build.json` pairing and a learning package's learner records. The check fires only when `toSlug` changed the slug and the id ends in the unchanged one, so `id: 'home'` on `index` is never named. Gates green. **Codex** over `bf6f366..cde4907`, which ran the whole diff: no actionable findings. **Fleet:** a1k9training on the registry's 2.12.0, then on a junction to the branch: 20/20 pages byte-identical, tree clean. One new finding, `consent-missing` for a Google Maps frame, is 2.12.1's on `main` (`9ed6c73`), not this branch. diploma-msc was not swapped, because its own session may be working in it. It joins the final fleet check, coordinated with that session. Decision: continue to slice 2.
- **2026-11-05, after slice 2 (`a4b175d`).** #3 met on its tests. Design in `planning/plans/2026-11-05-path-ids.md`; a fresh-context agent's critique returned eight findings before any code, all checked locally and all taken (amendment section of the plan). The two that changed the design: an engine-invented `snippet-<random>` slug claims no id, and the report gains `ids`, so `moved` pairs only within one convention. 12 new tests red first, then green. A GUIDE claim (the `slug=` sugar under `'path'`) was run as a test before shipping. Gates green on the commit. **Codex** over `cde4907..a4b175d`: no actionable defects (static read, five commands). **Fleet:** a1k9training, default `ids`, 20/20 pages unchanged. **Watch flake** (`AIKB/rebuild.md` register): failed in a full gates run and once in five solo runs, its third sighting and the first solo one. Put to the operator before any investigation; **operator: leave it recorded.** Decision: continue to slice 3.
- **2026-11-05, after slice 3 (`d511534`, fixes `9f8c7ea`, `16f6fc6`).** #4 met. **Operator decision:** a poster gets a readable default (a dark strip, white text, a play mark on a video), overridable through custom properties, bending the 2026-11-04 geometry-only rule for this one case because a photo changes its premise. The relayed thumbnail claim was measured before the GUIDE used it: `sddefault.jpg` returned 200 and 31 KB for a public video. **Browser (Chromium, 375 and 1440 px):** the still loads, nothing is requested off the site before the click, the box keeps 16:9, and nothing below moves on Load. **Codex, three rounds over `a4b175d..`:** round 1 found a P2 (the poster dropped `{{image}}`'s `root=`; fixed as the class, all four of `{{image}}`'s keys); round 2 found a P2 (the consent theme's muted `.kiss-embed__notice p` read dark on the strip, measured `color(srgb .3 .3 .3)`; fixed as the class, every `p` and `a` in the strip, with a themed browser case red first); round 3 clean. Both findings were ordinary-site cases, so the threat model held. The fix diff was shown to the operator between rounds. **Watch flake:** failed once more in a gates run (third time this session), passed on the re-run, left recorded as the operator decided. **Fleet:** a1k9training, no poster yet, 20/20 pages unchanged. Decision: continue to slice 4.
- **2026-11-05, after slice 4 (`fcfb9ce`, fix `f11b162`).** #5 and #6 met. **#5:** a video's button says "Play video" (`ui.text.embedPlay`, following a site's own `embedLoad` when it set only that, so a translated site gains no English). Every Load button's name carries the title, words first (WCAG 2.5.3). `load=`/`notice=`/`open=` per call, and `embeds: { text }` site-wide with no consent, refused beside an active consent so the words have one home. The GUIDE sentence that sent wording to `config.consent` is banned in `CONTRADICTIONS`, and the ban was seen to catch it. **#6:** only the Load click adds `autoplay=1`, in the facade and the consent client; a stored-choice reveal never does. The browser test of the consent client was red with the client change stashed. **Measured** in headless Chromium 156 with a real YouTube video: playing with sound at 6.4 s; the `autoplay=false` control paused at 0. iOS Safari is not measured, as agreed at the open, and the GUIDE says so. **Codex, two rounds over `16f6fc6..`:** round 1 found a P2, reproduced (`consent: false` refused `embeds`; fixed as the class by deciding from the resolved consent, red first); round 2 clean. The fix diff was shown to the operator. **Fleet:** a1k9training, 19/20 unchanged; the one page with an embed (`courses/puppy-socialisation.html`) changed, as expected. Decision: continue to slice 5 (clean room, final fleet check including diploma-msc; the version bump and the CHANGELOG entry belong to `/branch-close`).
- **2026-11-05, slice 5 (clean room and fleet).** **Clean room** met. A fresh agent, given only the packed tarball (`npm pack` of `f11b162`), built a CommonJS router (`router.cjs`, `require('kiss-ssg')`, `Kiss.utils.toSlug`) with `ids: 'path'`, a catalog that picks the view per item, messy slugs, and postered YouTube embeds with a custom Load label. `check` exited 0: 5 pages, no broken links, no audit findings after it fixed its own first-run findings. It named five places it guessed, each checked locally. Three were real gaps in this branch's new paragraph (how a catalog chooses the view; that `{{link … slug=}}` slugs its argument; that a fan-out item's id follows its written slug, so set `slug`), and they are now stated. One was an audit-table row (`img-first-lazy` now names `eager=true` for a poster), plus a typo. One was already documented: `check` writing the encode cache is in GUIDE § Responsive images, which the agent did not read. **Fleet, diploma-msc**, checked without touching its tree or `node_modules`: its session may be working there, on `feat/link-management`, so a `NODE_OPTIONS` module hook redirected `kiss-ssg` for my runs only. The run is proven to be the branch, since the report carries `ids: 'view'`, which 2.12.0 has no key for. 685/688 pages are byte-identical, with the same verdict and the same 11,888 audit findings, and no `id-slug-mismatch`, as expected while the site builds its ids with its own `pageSlug()`. The 3 pages that differ (`p/all`, `ps/all`, `tools/deploy`) also differ between two runs of 2.12.0 alone, so they are nondeterministic on the site's side. The tree was clean after every run. Decision: ready for the operator's call on `/branch-close`. The version bump and the CHANGELOG entry are its steps.
- **2026-11-05, at `/branch-close` Step 5a.** **Eyeball: looked.** No pulse had asked for one, so the close asked. The operator was shown the clean room's postered video page, screenshotted at 375 and 1440 px. At 1440 it was as designed. At 375 the notice wrapped and the dark strip covered nearly all of the still, with its text against the box's edges. **Operator: fix the phone layout now.** Measured before and after, on an unstyled site: the strip covered 81% → 52% of the box at 320 px, 69% → 44% at 375 px, and 15% → 9% at 1440. The text went from 0 to 12 px in from the edges. The fix is padding, `.875em`, tight paragraph margins, and the watch link beside the button, all inline. A browser assertion now holds the strip under 50% at 375 px, and was red with the fix stashed. New commits mean the close reruns from Step 1, per its resume rule.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-11-05: Page ids from CommonJS and served paths, and `{{embed}}` posters, wording and autoplay

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** six site-requested features as 2.12.2, in twelve commits from `bf6f366` to the close:

- `Kiss.<named export>` statics for CommonJS (`cde4907`)
- the audit check `id-slug-mismatch` (`cde4907`)
- `config.ids: 'path'` (`a4b175d`)
- `{{embed … poster=}}` (`d511534`, with Codex fixes `9f8c7ea` and `16f6fc6`, and the phone-layout fix `359e1a7`)
- embed wording and autoplay on Load (`fcfb9ce`, with Codex fix `f11b162`)
- clean-room doc fixes (`0a184be`), the docs sweep (`34ddc2f`) and the bump (`237cb08`).

## Reflect — what the session was

**Framing.** The work started as two roadmap requests relayed by peer sessions: diploma-msc's toSlug/ids message and a1k9training's embed note in `planning/ideas/`. Claude first checked each relayed claim against `lib/` before repeating it: `require` returning `[]`, and the verbatim id at `page-registry.js:190`. The operator chose to put all six on one branch, consistent with the one-branch-per-request preference. At `/branch-open` the operator answered four structured questions (autoplay default on, wording "both, one home", here, one session) and added one line of intent: "Even if autoplay doesn't work on the iPhone, it's better than not doing anything."

**Shape.** It was **between planned and emergent**, as the intent predicted. Items #1, #2 and #4–#6 went as mapped. #3 was emergent by design: a design note, then a fresh-context critique, which returned eight findings that reshaped it (an engine-invented slug claims no id; the report records `ids`, so `moved` pairs only within one mode). The shape served the work. The `/loop` the operator set ("a Codex review after each loop, fix high and medium before the next") turned five slices into five review gates, and that cadence is what made it a planned branch rather than a long unverified run.

## Evaluate — how the human supervised the AI

**Iteration discipline — the strongest dimension, and the operator's design.** The operator structured the work as slices, each closed by a Codex review, with high and medium findings fixed before the next. Across the branch, Codex returned five P2 findings, every one a real ordinary-site defect, and each was fixed with a regression test seen red first:

- a poster dropped `root=`
- the consent theme turned the strip's text dark on dark, measured at `color(srgb .3 .3 .3)`
- `consent: false` refused `embeds`
- the other two were duplicates within a round.

No round drifted into hostile-input findings, so the threat model written at the open held without being renegotiated. The largest fix diff was shown between rounds, which retires a recurring lesson. A fleet check ran on a1k9training after every slice, and once on diploma-msc. That is the "experts run longer chains but verify mid-run" pattern, set by the operator in one sentence.

**Verification & ownership — strong on machines, late on the eye, and one look changed the product.** The machine verification was thorough:

- browser measurements in real Chromium: the poster at 375 and 1440 px, nothing off-host before a click, no layout shift
- a real YouTube video playing with sound after one click, with an `autoplay=false` control paused
- a clean room from the packed tarball alone
- diploma-msc checked through a module-resolution hook, without touching a tree its own session was using.

But **no pulse asked the operator to look at anything**. Claude wrote the pulse entries straight into the log rather than running `/branch-pulse`, whose Step 4 asks for an eyeball. So the first human look was at `/branch-close` Step 5a. It was immediately decisive: the 375 px screenshot showed the dark strip covering 69% of the poster with text against the edges, a defect every test passed. The operator said "fix the phone layout now", and the strip went to 44% (52% at 320 px). Had the eye come at slice 3, that fix would have gone through the slice's own Codex loop instead of reopening the close.

**Pushback & steering.** The operator overruled Claude three times:

- **The version:** a patch, 2.12.2, against the proposed minor. Reason: "Small cleanups".
- **The flake:** leave it recorded (Claude's recommendation).
- **The phone layout:** fix it now.

They also chose a readable poster default over the "geometry only" rule, a real design decision. A rule's premise had changed, and Claude raised it as a question rather than deciding it.

**Learning engagement and architecture sense-making were thin.** The operator asked for no explanations. Their inputs were decisions on Claude's framing, not questions about how the code works. That is fine for a feature batch they had already shaped at the open, but it means the understanding of, say, why `moved` must not pair across `ids` modes lives in the plan and the commit messages rather than in a conversation.

**Harness leverage — good, mostly at Claude's initiative:**

- a fresh-context sub-agent critiqued the path-ids contract before code was built against it (the 2026-09-12 pattern, which paid again)
- a clean-room agent built from the tarball
- `AskUserQuestion` with previews for the poster look
- `/loop` with Codex as the review gate, which was the operator's.

One harness miss was Claude's: the skill that carries the eyeball step was never invoked.

**Intended vs actual supervision.** The operator intended review after every slice, and got it, by Codex. They did not intend to skip looking at the product mid-branch. That happened because Claude's hand-written pulses left out the step that asks. The close's Step 5a fallback caught it, which is that step working as designed.

**Competency level: Active supervisor.** Evidence:

- the review cadence was designed up front
- every override came with a stated reason
- the operator looked at the artefact when shown it and redirected the product.

It is not Agentic engineering lead, because the operator steered through Claude's questions rather than probing the work unprompted, and the first look came at the close.

## Feedback — recommendations for next session

- **Claude — run `/branch-pulse`; never hand-write a pulse entry.** The skill carries the eyeball (Step 4). Writing pulse lines directly dropped it on every slice of this branch, and the phone-layout defect waited until the close. After an engine slice, invoke the skill and let it ask.
- **Claude — for a visual feature, put a screenshot in front of the operator in the slice that builds it.** The poster passed computed-colour and bounding-box assertions at 375 px and still covered 69% of the still. A test checks what you thought to measure; a look sees what you didn't. `npm run screenshot` takes seconds.
- **Operator — a patch over a proposed minor has now been chosen twice with a precedent-setting reason** (2026-11-04: "still patching the 2.11 work"; here: "Small cleanups", for two config keys, a new audit check and a changed default). If "features that extend the current minor's work are patches" is the rule, say so for CLAUDE.md § Git workflow, so the next close proposes it rather than a minor. Until then, every close will propose the minor and the log will record an override.
- **Process — the watch flake is now the gates' most common red.** It failed twice in gates runs and once in five solo runs. The operator chose to leave it recorded, which is the rule's default. But the register's own trigger ("fails twice, read the hashes") has fired, and it blocked two commits this session. If it recurs on the next branch, schedule it as that branch's objective rather than reading it back again.
- **Both — keep slice-plus-Codex as the default shape for a multi-feature branch.** Five P2s were found while the code was warm, each fixed as a class with a red test, and the close's full-branch review found nothing new. That is the cheapest the review loop has been on any branch since the 14-round loop of 2026-11-05.
- **Claude — measure before claiming, and run the control.** The autoplay claim was measured against an `autoplay=false` control, and the thumbnail URL against a real fetch. The diploma-msc "three changed pages" were run twice on 2.12.0 before being called the site's own nondeterminism. Each turned an inference into a stated measurement. Keep it.

## Verdict — did we achieve the objective?

**Brief:** ship the two site requests as one release: page identity for diploma-msc (#1–#3) and a video-looking, worded, autoplaying `{{embed}}` for a1k9training (#4–#6).

**Verdict: met.** The release is 2.12.2 rather than the intended 2.13.0, by the operator's choice, recorded with their reason.

- [x] **#1 CommonJS reach.** `Kiss.utils.toSlug` and every named export are statics. The ESM-versus-CJS test was red first, listing all twelve exports.
- [x] **#2 Explicit-id mismatch.** `id-slug-mismatch` in the audit, with the diploma case red first. Decision recorded: warn, never rewrite.
- [x] **#3 Path ids.** `ids: 'path'`; the design was critiqued before code (8 findings, all taken); 12 tests red first; `moved` pairs only within one mode.
- [x] **#4 `poster=`.** It goes through the `{{image}}` pipeline and refuses a remote URL. Measured in Chromium: nothing off-host before Load, no layout shift, readable under the consent theme. After the operator's look, the strip covers 44% of the box at 375 px.
- [x] **#5 Wording.** `load=`/`notice=`/`open=` and `embeds: { text }`, with one home (refused beside an active consent). "Play video: <title>" as the name. The old GUIDE sentence is banned in `CONTRADICTIONS`.
- [x] **#6 Autoplay.** On the Load click only, never on a stored choice. Measured: playing with sound in headless Chromium 156; the control paused. iOS unmeasured, as agreed.
- [x] **Docs and contracts.** GUIDE, llms.txt (15,966/16,000), README, types, AIKB, skills with `skill-coverage` rows, and CHANGELOG 2.12.2 with `### Upgrading`.
- [x] **Clean room.** CommonJS router, path ids, postered embeds from the tarball alone. `check` passed. Three doc gaps were found and fixed.
- [x] **Fleet check.** a1k9training: only its embed page changed. diploma-msc: byte-identical bar three pages that differ between runs of 2.12.0 itself. Neither site adopted anything yet: diploma's `pageSlug()` copy and a1k9's `poster=` are their own sessions' work, which the criterion phrased as possible, not done.
- [x] **Gates** green on the branch head. Codex reviewed the whole branch clean against `main`, and the close's range `0a184be..HEAD` clean.

**Measurable impact:**

- A CommonJS site no longer copies `toSlug`.
- A site whose views are shared can drop every explicit id (123 of 686 on diploma-msc).
- A video embed reads as a video, plays in one press, and tells a screen-reader user what it is.

**Open:**

- the watch flake (recorded)
- the version rule the operator applied, which CLAUDE.md does not yet state
- the two sites adopting the features on their own branches.
