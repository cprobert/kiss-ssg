# Plan — design and usability learnings into kiss (2026-10-20)

**Branch:** `ccr-d677d579-ay3if6`.
**Intent:** `planning/sessions/2026-10-20-craft-learnings.md`.
**Source:** `planning/specs/2026-10-20-design-skills-evaluation.md`.

This plan names:

- every rule that comes in;
- where it lands (the audit, `kiss-site-review` or `kiss-site-new`);
- how it is measured;
- which repo or repos it came from.

Repo short names: **JK** jakubkrehel, **EK** emilkowalski, **MT** MengTo, **GS** garden-skills, **EL** elayadesign. Rules are written in kiss's own words, not copied.

## 1. Engine: the audit

### 1.1 Check ids

The intent said "two checks". The fragment check is split into **two ids**, so a site can ignore one shape with a reason without losing the other. A site that uses `href="#"` on purpose for a script-driven toggle should still hear about a skip link pointing at a missing `id`. That makes three new ids.

The three are inserted into `CHECKS` after `heading-skip`, beside the other per-page markup checks.

**Order and baselines** (corrected after the critique, item 1). `diffReports` does not read `audit` at all. What moves when `CHECKS` grows:

- the recorded `audit.findings` in each site's `AIKB/last-build.json` (examples 9 and 11, whose byte-stability `examples.test.js` asserts);
- `test/unit/audit.test.js`'s pinned list;
- `test/unit/config.test.js`;
- the CHECKS-driven row in `skill-coverage.test.js`. It forces the fix-table rows into the engine commit.

| Id                   | Fires when                                                                                                                                                                                                                                                                      | `detail`                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `viewport-zoom-lock` | The page's `<meta name="viewport">` content has `user-scalable` set to `no` or `0`, or `maximum-scale` below 2. Both stop the 200% zoom WCAG 1.4.4 asks for.                                                                                                                    | the content string, as written |
| `href-hash`          | An `<a>` or `<area>` with `href="#"` exactly: a link to nowhere. Usually a button that should be a `<button>`, or a link not filled in yet.                                                                                                                                     | `#`                            |
| `fragment-missing`   | An `<a>`/`<area>` `href` with a non-empty fragment whose target page is an HTML page this build wrote, where that page has no element with that `id` (or `<a name>`). Covers the same page (`#team`) and other internal pages (`/about.html#team`, a same-origin absolute URL). | the href, as written           |

**What `fragment-missing` deliberately does not report**, each because the build cannot know or the spec says it is fine:

- **`#top`.** It is not a finding when no `id="top"` exists: the HTML spec scrolls to the top for it.
- **A text fragment** (`#:~:text=…`).
- **A fragment on a non-HTML target** (`/guide.pdf#page=2`).
- **A fragment on a page the build did not write** (it resolved only through the filesystem or `hostServed`). The build has no ids for it.
- **An `id` added by script at runtime.** This is a false positive the check cannot avoid. `GUIDE.md` names it, and `audit.ignore` is the answer.

**Matching.** Ids are compared after percent-decoding the fragment (what the browser does) and entity-decoding the attribute. The comparison is case-sensitive, as the spec requires.

### 1.2 Facts: extracted at write time, as now

`PageFacts` gains three fields, filled by `extractPageFacts` from the same minified bytes:

- **`viewport: string|null`.** The first `<meta name="viewport">` content.
- **`ids: string[]`.** Every `id` attribute and every `<a name>`, sorted and deduplicated. Read from the text with comments, `<script>`, `<style>` and `<template>` bodies removed, **but `<svg>` kept**: an id inside inline SVG is a real fragment target. So this is a narrower strip than the count checks use.
- **`fragmentLinks: string[]`.** Every `<a>`/`<area>` `href` that contains `#`, as written (entity-decoded), sorted and deduplicated. Read with the count checks' strip.

Size: ids and fragment links are typically tens per page. They live on `KissPage.audit`, which is not written to `AIKB/last-build.json`. To be confirmed in step 2.1.

### 1.3 Decision in `auditBuild`

- **`viewport-zoom-lock`** is per page, from `facts.viewport`. The content is parsed as comma- or semicolon-separated `key=value`, case-insensitive. `user-scalable` of `no` or `0` fires. `maximum-scale` parsed as a number fires when it is below 2.
- **`href-hash`** is per page: each `fragmentLinks` entry that is exactly `#`.
- **`fragment-missing`.** For each other entry:
  1. split off the fragment;
  2. classify the remainder with `classifyReference` (an empty remainder means this page);
  3. resolve it to a build-relative page path;
  4. look up that page's `ids`.

  This needs:
  - **a new export from `lib/links.js`:** `resolveTarget(ref, options)` → the matched candidate (build-relative) or `null`. `resolveReference` becomes `resolveTarget(...) !== null`, so the two cannot disagree. **Corrected (critique, item 2):** the existing loop accepts the directory `about` for `/about`, because `existsSync` is true for a folder, so the matched candidate would never be a page. `known` is therefore tried across **all** candidates before the filesystem, which changes no `resolveReference` answer (it only reorders two true paths). A real-filesystem test covers `extensionLess` and `trailingSlash: false`;
  - **`auditBuild` options:** `extensionLess` (passed from `config.extensionLess` by `runAudit`) and the `siteUrl` it already gets;
  - **a map** from build-relative `buildTo` to `ids`, built from the audited pages.

  A target that resolves to a path not in that map (an asset, or a file the build did not write) is skipped, per 1.1.

### 1.4 Tests (each seen red first)

`test/unit/audit.test.js`:

- **Extraction:** viewport; ids including in SVG and excluded in `<template>`; fragment links from `<a>` and `<area>` only, not from `<link>` or `<use>`.
- **Each check:**
  - fires and is silent where it should be;
  - `#top` is exempt;
  - text fragments are exempt;
  - cross-page works, with and without `extensionLess`;
  - a same-origin absolute URL is checked;
  - a non-HTML target is skipped;
  - `audit.ignore` removes each id independently.

`test/unit/links.test.js` gets `resolveTarget`'s candidates. The integration suite gets one build that reports both checks through `report().audit` and the summary line.

### 1.5 Docs in the same commit

- `AIKB/audit.md`: the three ids, the facts, the non-obvious list.
- `AIKB/links.md`: `resolveTarget`.
- `GUIDE.md` § Launch-readiness audit: the three checks and the runtime-id caveat.
- `llms.txt`: the audit's index line names the new ids, within the cap.
- `README.md`, if it enumerates checks.
- `plugins/kiss-ssg/skills/kiss-build-check/SKILL.md`: its sentence listing what the audit covers.
- `kiss-site-review`'s fix table: three rows.
- `npm run types`.
- `CHANGELOG.md` 2.8.0: an upgrade note, mirrored in `kiss-site-migrate`. It says sites on `^2` will see the new findings, and how to ignore one with a reason.

## 2. `kiss-site-review`: two passes

### 2.1 Shape

Today, step 3 is "the judgement pass" (the browser plus the craft pass), step 4 is the report and step 5 is `ignore`. The new order:

1. **Run the check and read `audit`.** Unchanged, plus three fix-table rows.
2. **External links.** Unchanged.
3. **The usability and best-practice audit.** Today's browser pass plus the craft pass, grown (2.2).
4. **Report the audit, then fix what the operator picks.** Gains a **P0–P3** column and clustering (2.3).
5. **The design lift.** New (2.4). Offered after the audit's fixes, never folded into them.
6. **`ignore`.** Unchanged.

The description gains the trigger phrases "give the site a lift", "freshen up the design" and "usability audit", which route here.

### 2.2 The new craft checks

The existing nine stay: control edge 3:1, announced results, weights, one-meaning colour, motion and hover/press, single-word lines, sticky header, `dvh`, privacy line. **Check 8 is corrected** (below). The new ones follow, each with **where it is read** and **how it was measured before its wording ships**. "Measured" means a scratch page, served over HTTP and driven by Playwright in this repo's Chromium, showing both the failure and the fix. Any claim headless Chromium cannot reproduce says so in the skill rather than asserting it.

| #       | Check                                                                                                                                                                                                                                                             | Read from                                                                                                     | Measurement before shipping                                                                                                                                                                                                        | Source     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 8 (fix) | `100dvh` is for an app shell or bottom-pinned UI. A hero uses `100svh`, which does not change as the address bar collapses mid-scroll. Keep the `vh` line first as the fallback.                                                                                  | stylesheet                                                                                                    | Headless Chromium has no collapsing address bar, so the shift itself **cannot be measured here**; the skill says it follows from the units' definitions (CSS Values 4) and was not measured. Measured: the browser resolves `svh`. | EK         |
| 10      | **Focus is visible.** No `outline: none`/`0` without a `:focus-visible` replacement. The ring is 3:1 against what it sits on. Focus is never hidden under the sticky header.                                                                                      | stylesheet (grep) + browser (Tab through each template, compare the focused element's rect with the header's) | Measured: a page with `outline: none` shows no change on Tab. With `scroll-padding-top` below the header height, a Tab to a lower link lands it under the header.                                                                  | JK, MT, GS |
| 11      | **Targets are big enough.** At least 24×24 CSS px for every control and for links outside running text (WCAG 2.5.8). 44×44 is advised for primary touch controls. Links inside a sentence are exempt.                                                             | browser (`getBoundingClientRect` at 375px)                                                                    | Measured: rects of a nav link and an icon button on example 11.                                                                                                                                                                    | JK, MT, GS |
| 12      | **A skip link comes first.** It is the first focusable element, visible on focus, and targets the `id` on `<main>`. The audit's `fragment-missing` catches a broken target.                                                                                       | templates + browser (first Tab)                                                                               | Measured: first Tab focuses it, and it is visible.                                                                                                                                                                                 | JK, EL     |
| 13      | **The current page is marked for everyone.** `aria-current="page"` on the current nav link (`{{isActive}}` decides it), and the marking is not colour alone (WCAG 1.4.1).                                                                                         | templates + built HTML                                                                                        | `{{isActive}}`'s real signature is checked in `lib/handlebars-helpers.js`, and the snippet is run against the engine before it ships.                                                                                              | EL, MT     |
| 14      | **Transitions name their properties.** No `transition: all`, and no transition on `width`, `height`, `margin` or `padding` (layout work on every frame).                                                                                                          | stylesheet (grep)                                                                                             | A grep pattern, run against the examples' stylesheets to see what it finds.                                                                                                                                                        | EK, JK, MT |
| 15      | **Hover that changes the box is kept off touch.** A hover that transforms, lifts or recolours a background goes behind `@media (hover: hover) and (pointer: fine)`. On touch, the style latches after a tap. Check 5's `:active` stays.                           | stylesheet                                                                                                    | Measured: a Playwright touch context taps a card with an ungated `:hover` transform, and its computed transform after the tap is still the hover one. The gated version is not.                                                    | EK, JK     |
| 16      | **Content shows without script, and reduced motion shows the end state.** With JavaScript off, no section stays at `opacity: 0` or `visibility: hidden`. Under `prefers-reduced-motion: reduce`, animated content is in its final state, not a shorter animation. | browser (JS disabled; `emulateMedia({ reducedMotion: 'reduce' })`)                                            | Measured: a fade-in-on-scroll section is invisible with JS off and visible when the hiding class is added by script instead.                                                                                                       | MT         |
| 17      | **Overflow, at its cause.** A flex child holding text gets `min-width: 0`; a grid track gets `minmax(0, 1fr)`; nothing is `width: 100vw` (it includes the scrollbar). These sit beside the `overflow-wrap: anywhere` line.                                        | stylesheet + browser (the 320px pass)                                                                         | Measured: `100vw` overflows when classic scrollbars show. Headless Chromium may use overlay scrollbars; if so, the skill says so. `min-width: auto` overflow and its fix are measured with a long string in a flex row.            | EK, JK     |
| 18      | **Text at 200%.** With the root font size doubled at 1280px, nothing clips, overlaps or is cut off (WCAG 1.4.4). Spacing set in `rem`/`em` grows with it; `px` does not.                                                                                          | browser                                                                                                       | Measured: a fixed-`px`-height box with text overflows at 200%; `min-height` in `rem` does not.                                                                                                                                     | EK         |
| 19      | **Line length.** Body text runs about 45–75 characters per line at desktop width, usually a `max-width` in `ch` on the text column.                                                                                                                               | stylesheet + browser (characters per line at 1440)                                                            | Measured on example 11 at 1440.                                                                                                                                                                                                    | JK, MT     |
| 20      | **Lists fed by a model work at 0 and 1.** A tag, post or menu list renders an empty state when it has none, and a correct singular at one ("1 post"). Check in a scratch copy of the model, never the site's own.                                                 | templates + a build of a scratch copy                                                                         | Measured: example 11's tag template at 1 post (the 2026-10-13 plural fix).                                                                                                                                                         | EK, GS     |

Already covered, so not added: the privacy line (9), contrast measurement discipline (1 already says "measure"), and the 320px pass.

**Moved to `kiss-site-new` as build-time floors only** (they are about markup a site writes once):

- inputs at 16px or more;
- a valid `autocomplete` token;
- no positive `tabindex`.

"What each check can be read from" is rewritten to cover 1–20.

### 2.3 The report

The table becomes:

| Priority | Where | What | Measured | Why it matters | Proposed fix |
| -------- | ----- | ---- | -------- | -------------- | ------------ |

- **P0:** a visitor is blocked. Content is unreachable or invisible, zoom is locked, there is a keyboard trap, or a form cannot be submitted.
- **P1:** fails a WCAG 2.2 AA criterion, or is broken on a common device (overflow at 320px).
- **P2:** a visible flaw that reads as unfinished: a widow, a stuck hover, a weight that does not render.
- **P3:** polish.

**Cluster:** one row per cause, not per instance. "`transition: all` in 7 rules of `site.scss`" is one row naming the count.

Sort by priority. The operator picks from the table as now. The audit's own findings get a priority too: `viewport-zoom-lock` is P0, `fragment-missing` on a skip link is P1, and so on, in a short mapping.

### 2.4 The design lift (new step 5)

It is offered once the audit's picked fixes are in, because a lift on a broken page measures the wrong thing.

1. **Decisions first.** This is the craft pass's existing "look for the decision" rule, applied to the look: `BRAND.md`, README design notes, stylesheet comments, the site's `AIKB/`. A recorded decision is not on the table unless the operator says so.
2. **The read, in one line:** who the site is for, and how bold the lift should be. An existing site is in **preserve** mode by default: one step bolder than it is now at most, with identity, navigation labels and content kept. Trust-first audiences (a trade, a public service, a clinic) sit low; a creative studio or a campaign sits high. Garden's calibration presets are the source of the idea, adapted as a prose rule, not a dials table.
3. **Preserve / improve / remove.** Sort what is there into three lists: strengths to keep, weak hierarchy, spacing, contrast or craft to improve, and clutter or dead patterns to remove. (GS)
4. **Two or three proposals.** Each one names:
   - what changes;
   - the files (layouts, partials, Sass, never a page collapsed into one file);
   - why it suits the read;
   - before-and-after screenshots at 375 and 1440, from the site served over HTTP.

   The operator picks.

5. **The protected contract.** URLs, page ids, anchor ids, form field names and their order, navigation labels, the logo, legal or pricing copy, and the content itself do not change in a lift. A URL that has to move gets `aliases`. (GS)
6. **After:** `npx kiss-ssg check` again, and the craft checks the change touched.

**With `frontend-design` available,** it sets the direction inside this frame: kiss's structure, the read and the contract. **Without it,** say so and point at the README's install section. The proposals are then limited to the craft findings and the read's "improve" list, with no change made only for taste.

## 3. `kiss-site-new`: build-time floors

The existing "Whatever the look, keep these" list gains short bullets. Each is a line, not a rule restated, pointing at `kiss-site-review`'s craft pass by check number for the full text:

- a skip link first, to `<main>`'s id (12);
- a visible `:focus-visible` style (10);
- `aria-current` from `{{isActive}}` (13);
- no zoom lock in the viewport meta (the audit now reports it);
- inputs at 16px or more, with an `autocomplete` token, and no positive `tabindex`;
- a hero sized in `svh` (8);
- transitions name their properties (14);
- box-changing hover behind `(hover: hover)` (15);
- content visible without script (16);
- model-fed lists with an empty state and a singular (20).

The `webapp-testing` handoff's screenshot step gains "and Tab once from the top of each template".

## 4. Tests that pin the text

- **`test/unit/skill-coverage.test.js`:** one row per new section or rule group, each seen red before its text and green after. The groups:
  - the two-pass shape;
  - checks 10–20 (one row each);
  - the P0–P3 report;
  - the design lift's read, contract and "without `frontend-design`" lines;
  - `kiss-site-new`'s floors;
  - the three fix-table rows;
  - the migrate note.
- **`CONTRADICTIONS`:** ban the old check-8 sentence ("`100dvh` is the screen the visitor actually sees"), which reads as advice for every case.

## 5. Examples, pilot, clean room

- **Examples.** Run every example's `check` after the engine lands. Any new finding is fixed in the example (the examples are exemplars) or recorded in the session log with its reason. Re-record the `AIKB/` of examples whose records change (9 and 11 have records).
- **Pilot.** `Probert-Family/pro-plumbing`, attached to this session:
  1. A `pilot/craft-review` branch there, with kiss installed from this branch's `npm pack`.
  2. Run the new review end to end.
  3. Put the findings table and screenshots in front of the operator.
  4. Count the findings that would undo a recorded decision, and fix the wording until there are none.
  5. Push fixes to the pilot branch only, on the operator's picks.
- **Clean room.** Two fresh agents with only the packed tarball:
  - **(a)** reviews example 11 (copied to an empty folder);
  - **(b)** builds the README's bakery brief.

  Both report every guess, and (b) passes `kiss-ssg check`.

## 6. Order of work

1. Confirm the two "to be confirmed" points (diff keying, facts not persisted).
2. The engine, with tests seen red, docs and types, in one commit.
3. The examples' check, with fixes or records.
4. **Pulse.**
5. Scratch measurements for checks 8 and 10–20, recorded in the session log.
6. The skills and the coverage rows, seen red then green, in one commit.
7. **Pulse.**
8. The pilot.
9. The clean rooms.
10. Wording fixes.
11. The close, when the operator asks.

## Critique and answers

### 2026-10-20 — answers to the fresh-context critique

Fifteen items came back. The blockers were re-derived against the code before being accepted:

- `lib/check.js:412` diffs hashes and assets only;
- the candidate loop in `lib/links.js` accepts a directory;
- `auditLines` (`lib/build-report.js:466-475`) names pages only;
- `README.md:71` lists the checks.

Where an item changes the plan's text, the section above is amended in place. Where it changes the skills' wording, the answer here is what the wording follows.

1. **Baselines.** Accepted. §1.1 is corrected. The fix-table rows land in the engine commit, and §4's separate row is dropped.
2. **`resolveTarget` and directories.** Accepted. §1.3 is corrected, with a real-filesystem test.
3. **`audit.ignore` is per check.** Put to the operator, who chose **accept and document**: GUIDE says that ignoring `fragment-missing` for runtime ids turns off its skip-link coverage too, and `href-hash` stays separate for the commonest deliberate case. No new key.
4. **The changelog heading.** Accepted. The entry is drafted without a semver heading (to be confirmed against `test/unit/changelog.test.js`). The number is set at `/branch-close`.
5. **Scope drift.** Accepted. Two dated Amendments go in the session log: three ids instead of two, and the examples fixes. On the lift without `frontend-design`, the **intent stands**: the skill says so and does not attempt the lift. The audit's fixes are the whole pass in that case.
6. **The summary hides the detail.** Accepted. `auditLines` groups `viewport-zoom-lock` and `fragment-missing` by detail, as the duplicate checks are. `href-hash` stays a page list. The GUIDE example is updated.
7. **Fragment edge cases.** Accepted:
   - a query-only reference (`?q=1#team`) is this page;
   - the fragment is cut at `:~:` before matching, so a text directive after a real fragment still checks the fragment;
   - `#top` matches case-insensitively;
   - the raw fragment is tried before the percent-decoded one;
   - a page carrying `<base href>` is not fragment-checked;
   - a target written by another instance falls outside the map and is skipped.

   All of these go in the "does not report" list and the tests.

8. **Markdown has no heading ids.** Accepted as correct behaviour that will be common. GUIDE says `[x](#section)` in Markdown content needs a real `id`, for example a raw `<h2 id="section">` or a `<a id="section"></a>`. The `.md` copies are not audited (`.html` only), and GUIDE says that too.
9. **Viewport.**
   - Every viewport meta is collected, and **any** one that locks zoom fires. Which one a browser applies is not measured here, so the safe reading is taken.
   - Separators are commas, semicolons or whitespace, and whitespace around `=` is trimmed.
   - `user-scalable` values `no` and `0` fire. No external tool is cited, because none was checked.
   - **Priority is P1, not P0:** it fails WCAG 1.4.4, and iOS Safari has ignored `user-scalable=no` since iOS 10 (stated as reported, not measured).
10. **Skill wording.** Accepted, and measured in this session (`scratchpad/measure/`):
    - **Check 10.** Measured: a forward Tab never hid a link under a 120px sticky header. A backward Tab did, at `scroll-padding-top` 0 and 40px, and not at 136px. The skill says to Tab **backwards** from the bottom of the page, and to follow an `#anchor`. It names WCAG 2.4.11.
    - **Check 11.** The rule is: a target smaller than 24×24 is a finding only if a 24px circle on it overlaps another target. Links inside running text and controls the browser draws are exempt. 44px stays advice. Measured on example 11: two card-title links are 21px tall and are spaced, so they are not findings.
    - **Check 15.** The measurement asserts `matchMedia('(hover: hover)')` is false in the touch context, so the gated arm is not passing by default. Measured: the ungated card's transform after a tap stays `translateY(-4px)`; the gated card's is `none`.
    - **Check 16.** Measured with JS off: a section hidden until script adds a class stays at `opacity: 0`. Hiding it only under a class that script sets (`.js .reveal`) leaves it visible. The reduced-motion half is stated as **kiss's own rule**, stricter than WCAG 2.3.3, which is AAA. Measured only that the emulation reaches the page.
    - **Check 17 is cut down.** Measured with a 73-character unbroken string at 320px: `overflow-wrap: anywhere` alone fixed a flex child and a `1fr` grid track; `min-width: 0` alone did not. The `min-width`/`minmax` advice adds nothing to the existing rule and is dropped. `100vw` stays. Measured: 15px of overflow at 1280px **only with classic scrollbars**, because Playwright launches with `--hide-scrollbars` unless that is turned off. The skill says so.
    - **Check 18.** The finding is **clipping**, measured: a 48px-high box clips at a 32px root, and `min-height: 3rem` does not. Text in `px` that does not grow with the root is not a finding, because full-page zoom also meets 1.4.4.
    - **The 16px-input floor.** The iOS zoom-on-focus behaviour cannot be reproduced in Chromium, and the skill says it is reported, not measured.
11. **Lift proposals and "report first".** Accepted. The after-screenshots are made in a **scratch copy** of the site, which is discarded, so the site's source changes only once the operator picks. The never-invent rule is restated in the lift: the contract freezes the content that exists, and a proposal adds no copy, figure or section the owner did not give.
12. **Empty states and placeholders.** Accepted. These are two different cases:
    - an owner who gave no items gets `kiss-site-new`'s marked placeholder slots;
    - a model-fed list that is empty **at build time** (a tag with no posts yet, a filter with no results) renders an empty-state line.

    Check 20 says which is which.

13. **Starter and examples.** Put to the operator, who chose **fix them here**:
    - a skip link and `<main id>` in examples 4 and 12;
    - a line-length `max-width` in `ch` on post body text, in all 11 copies of the shared stylesheet, kept byte-identical.

    The starter has no header or nav before `<main>`, so WCAG 2.4.1 does not ask for a skip link there. The floor is worded "when a header or nav comes before `<main>`".

14. **The docs site in the sweep.** Accepted: `kiss-ssg check docs.js` is run with the examples. It covers a path-prefixed `siteUrl` and relative `../x/#anchor` links.
15. **`README.md` lists the checks.** Accepted: its audit line is updated.
