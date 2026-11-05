---
branch: feat/page-ids-and-embed-poster
base: main
status: open
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

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-11-05, after slice 1 (`cde4907`).** #1 met: every named export is a static on the class. The test compares the ES module's named exports with the statics through a real `require`, and was red first, listing all twelve exports rather than only `utils`. #2 met: the audit check `id-slug-mismatch`, with the diploma-msc case as its regression test, red first. **Decision on #2: warn, do not normalise.** The verbatim rule's reasons still hold: a `{{link}}` built from the same raw data must keep resolving, and rewriting an id would move its `last-build.json` pairing and a learning package's learner records. The check fires only when `toSlug` changed the slug and the id ends in the unchanged one, so `id: 'home'` on `index` is never named. Gates green. **Codex** over `bf6f366..cde4907`, which ran the whole diff: no actionable findings. **Fleet:** a1k9training on the registry's 2.12.0, then on a junction to the branch: 20/20 pages byte-identical, tree clean. One new finding, `consent-missing` for a Google Maps frame, is 2.12.1's on `main` (`9ed6c73`), not this branch. diploma-msc was not swapped, because its own session may be working in it. It joins the final fleet check, coordinated with that session. Decision: continue to slice 2.
- **2026-11-05, after slice 2 (`a4b175d`).** #3 met on its tests. Design in `planning/plans/2026-11-05-path-ids.md`; a fresh-context agent's critique returned eight findings before any code, all checked locally and all taken (amendment section of the plan). The two that changed the design: an engine-invented `snippet-<random>` slug claims no id, and the report gains `ids`, so `moved` pairs only within one convention. 12 new tests red first, then green. A GUIDE claim (the `slug=` sugar under `'path'`) was run as a test before shipping. Gates green on the commit. **Codex** over `cde4907..a4b175d`: no actionable defects (static read, five commands). **Fleet:** a1k9training, default `ids`, 20/20 pages unchanged. **Watch flake** (`AIKB/rebuild.md` register): failed in a full gates run and once in five solo runs, its third sighting and the first solo one. Put to the operator before any investigation; **operator: leave it recorded.** Decision: continue to slice 3.
- **2026-11-05, after slice 3 (`d511534`, fixes `9f8c7ea`, `16f6fc6`).** #4 met. **Operator decision:** a poster gets a readable default (a dark strip, white text, a play mark on a video), overridable through custom properties, bending the 2026-11-04 geometry-only rule for this one case because a photo changes its premise. The relayed thumbnail claim was measured before the GUIDE used it: `sddefault.jpg` returned 200 and 31 KB for a public video. **Browser (Chromium, 375 and 1440 px):** the still loads, nothing is requested off the site before the click, the box keeps 16:9, and nothing below moves on Load. **Codex, three rounds over `a4b175d..`:** round 1 found a P2 (the poster dropped `{{image}}`'s `root=`; fixed as the class, all four of `{{image}}`'s keys); round 2 found a P2 (the consent theme's muted `.kiss-embed__notice p` read dark on the strip, measured `color(srgb .3 .3 .3)`; fixed as the class, every `p` and `a` in the strip, with a themed browser case red first); round 3 clean. Both findings were ordinary-site cases, so the threat model held. The fix diff was shown to the operator between rounds. **Watch flake:** failed once more in a gates run (third time this session), passed on the re-run, left recorded as the operator decided. **Fleet:** a1k9training, no poster yet, 20/20 pages unchanged. Decision: continue to slice 4.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
