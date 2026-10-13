---
branch: chore/ux-taste-skill
base: main
status: open
opened: 2026-10-12
---

# Session — 2026-10-12: UX improvements — trialling the taste skill

## Intent (captured at /branch-open)

**Objective:** Find out whether tasteskill.dev's `redesign-existing-projects` skill improves the look of a real kiss site — the docs site first, then Pro Plumbing — and, if it does, recommend it on the docs site beside Anthropic's `frontend-design` as an optional skill for the look.

**Success criteria:**

- [ ] **The audit comes before the change.** `redesign-existing-projects` is run against the docs site (`src/`), and what it found — each finding with the file it points at — is written into this log before any style edit lands.
- [ ] **kiss keeps the structure.** The docs-site restyle lands in `src/`'s layouts, partials and Sass. No Tailwind, React or other new framework dependency is added, no page collapses into a single file, `node docs` builds and exits 0, and `npm run gates` passes.
- [ ] **No accessibility regression.** Text contrast stays at or above 4.5:1 in both themes. The focus style stays visible. The theme toggle and the homepage's agent selector still work.
- [ ] **The operator judges it by eye.** Before-and-after screenshots of the homepage and one guide page, light and dark, desktop and mobile, are put in front of the operator. Each change is kept or reverted on their call, and the call is recorded here. If the browser extension is unavailable, say so when the look is due and hand over the URL and the checklist.
- [ ] **Pro Plumbing gets the same trial on its own branch.** The same skill runs on a `ux/taste-skill` branch in `C:/Code/kiss/pro-plumbing`. `kiss-ssg check` passes there, the operator looks at the result, and keeping it is their decision. This branch records only the outcome.
- [ ] **A verdict is written down, with its evidence.** It says what the skill found or proposed that we would not have reached without it, and whether that earns a recommendation. "Am I adding this for the sake of it?" (2026-10-03) is the test.
- [ ] **If the verdict is yes, the docs site recommends both design skills side by side.** A short homepage passage, "optional: the look", names `frontend-design` and the taste skill and says what each is for. kiss keeps the structure, the passage mirrors `README.md`'s paragraph, and its install commands have been run for real rather than copied from a web page.
- [ ] **Clean room, if the passage ships.** A fresh sub-agent given only that homepage passage installs both skills into an empty folder and reports every place it had to guess.

**Non-goals / out of scope:**

- No change to `lib/`, `bin/` or the public API.
- No change to the shipped kiss skills (`kiss-site-new`, `kiss-site-review`) or to `README.md`. The recommendation goes on the docs site only (operator's choice at the open).
- Not trialling `design-taste-frontend`, `high-end-visual-design` or `minimalist-ui`. The flagship `design-taste-frontend` defaults to React/Next.js and Tailwind v4, which kiss's Handlebars-and-Sass structure does not use.
- Not reviving the parked interactive-control UX skill (`planning/ideas/2026-09-29-ux-control-quality-skill.md`).

**Impact surface:** tooling & docs — the docs site (`src/`, rebuilt into `docs/`) and this log. Nothing a consuming site installs changes, so the bump is a patch or none.

**Expected shape:** emergent — this is an experiment. We do not know what the skill will propose or whether we will keep it, so the criteria are about reaching a verdict, not about a particular design.

**Delegation convention:** none: one session. The skill runs in the main session. Any sub-agent (the clean-room run) reports back and never commits; the operator's diff review is the checkpoint.

**Inherited feedback carried in (2026-10-03):** question every recommendation before adding it. If the browser extension is unavailable when the visual check is due, say so then.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-10-12 — the verdict is no; criteria 7 and 8 lapse.** The operator chose "No recommendation" when the evidence from both sites was put to them, and that was Claude's recommendation too. So no homepage passage is written, and no clean-room install runs. Both criteria were conditional on a yes ("If the verdict is yes…", "if the passage ships"). They are closed as not applicable, not as missed. See § Verdict.
- **2026-10-12 — Pro Plumbing scope, at the operator's direction:**
  - `npm ci` and `npm i --no-save playwright-core` there, to bring a stale `node_modules` (kiss-ssg 2.6.2 against a 2.7.0 lockfile) to the lockfile and run the site's own review;
  - a draft privacy note for Greg to confirm (P3), which is content, not design.

  Both land in the Pro Plumbing repo, not this one.

- **2026-10-12 — the shipped `kiss-site-review` skill gains "The craft pass", at the operator's request.** The request was: "What can we adopt from their skills that did work into our review skill? … add them so that we don't lose this value". This reverses the non-goal "no change to the shipped kiss skills" for this one skill, and only for what the trial showed working:
  - the rule to look for a recorded decision before calling anything a finding (twelve of the trialled skill's findings would have undone recorded decisions);
  - nine measured checks:
    - control-edge contrast 3:1 (#1);
    - announced results (#3);
    - weights loaded (#2);
    - a colour that means one thing (#4);
    - motion behind `prefers-reduced-motion` (#5, P2);
    - `text-wrap` (#11, P1);
    - the sticky header on a phone (#8);
    - `100dvh` (P8);
    - a privacy line on a form that collects personal details (P3).

  Nothing the trial rejected is carried over, and the taste skill is not named. #1 and #3 came from Claude's accessibility reading during the trial, not from the taste checklist, and are included because they were the trial's most valuable fixes.

  **What this adds to the branch:**
  - **Impact surface:** still tooling & docs. A shipped skill changes, but no API does, so the bump is a patch, and it now needs a `CHANGELOG.md` entry.
  - **New criterion:** a fresh sub-agent given only the packed skill reviews a built example and reports where it had to guess (the clean-room rule for anything a consuming project follows).
  - **Test:** a `skill-coverage.test.js` row pins the section. It was seen red (1 failed of 171) before the text existed and green (171 passed) after.

- **2026-10-12 — the shared example stylesheet gets the craft fixes, at the operator's request.** The request was "Fix them on this branch", about the craft findings the clean-room run made on example 11. That stylesheet is byte-identical in 11 of the 12 examples: its header said "six", and it now says eleven of twelve. So the fix went into all eleven copies, which still hash identically.

  **Fixed:**
  - a `--control` edge for tag chips: `#948678` light, at least 3.22:1, and `#75685a` dark, at least 3.23:1;
  - nav weights 400 and 700, not 500 and 650;
  - `:hover` and `:active` on every link, nav link and tag;
  - `text-wrap: pretty` on paragraphs, and `balance` on the eyebrow;
  - `overflow-wrap: anywhere` on text;
  - `scroll-padding-top`, and a header that is static below 34rem;
  - `flex-shrink: 0` on the brand mark, and a dark `--on-accent` (8.52:1 where white was 2.19:1);
  - the status tones re-declared for dark (`#6cc792`, `#e0b45a`);
  - a build badge that no longer looks like a chip.

  **Kept:** the demo copy, because the example records itself as an exemplar.

  **Measured on example 11's build, served over HTTP:**

  | What                                  | Result                                                                          |
  | ------------------------------------- | ------------------------------------------------------------------------------- |
  | Header at 375×667                     | 110px and static, so the skip link lands with content at 56px, nothing under it |
  | Header on desktop                     | 65px, with `scroll-padding-top` at 88px                                         |
  | Nav weights                           | rendered 400 and 700                                                            |
  | Tag border                            | `#948678` at rest, the accent on hover                                          |
  | Brand mark in dark                    | `#15120f`                                                                       |
  | 320px page with long strings injected | 320px wide                                                                      |

  **A mistake caught by measuring.** `overflow-wrap: break-word` left that page 724px wide, because the eyebrow is an inline-block and `break-word` does not lower its min-content. `anywhere` does. The skill's own long-text line, written earlier this session, had said `break-word`, and it is corrected in the same commit.

  **Results:** `npm test` passes (85 files, 2255 tests). Examples 9 and 11 still `check` as unchanged against their recorded builds, so neither `AIKB/` needed re-recording.

- **2026-10-12 — `kiss-site-new` gains three floors that hold "whatever the look", at the operator's request.** The operator asked: "There's also other skills in the plugin that could be useful for new sites. Have you reviewed those?"
  - **The review.** A read-only sub-agent went through `design-taste-frontend`, `high-end-visual-design` and `minimalist-ui` against `kiss-site-new`, `kiss-site-review` and `frontend-design`. It proposed five floors and listed seven traps. Its key quotes were re-derived before use:
    - `frontend-design` line 34: "it's up to you to come up with copy and placeholder content";
    - `design-taste-frontend` line 640: "organic, messy data (`47.2%`, `+1 (312) 847-1928`)";
    - `kiss-site-new` line 55: copy an example's structure, "never its content".
  - **The choice.** The operator chose:
    1. never invent a fact about the business, with marked placeholders listed for the owner, and the "realistic sample data" advice named as the trap;
    2. visible `<label>`s on every field;
    3. `width` and `height` on every image, lazy loading only below the first screen.

    Declined:
    - **design tokens in one place;**
    - **self-hosted web fonts.** This conflicts with this repo's own docs site, which links Google Fonts.

  - **Test.** A `skill-coverage.test.js` row was seen red (1 of 172) before the text and green (172) after. No clean-room run has covered these three yet.

- **2026-10-12 — the aesthetic question, and a bake-off on this branch, at the operator's request.** The operator reframed the goal: "default sites can sometimes be a little uninspired … I wondered if skills could improve the quality of the template and page design aesthetic". They asked about `design-taste-frontend` and `high-end-visual-design` "either as an optional or adopted". Claude read both, and `frontend-design`, in full.
  - **`high-end-visual-design`: neither optional nor adopted.** It is one house style applied to every brief:
    - double-bezel cards, a floating pill nav, scroll entrances on every element, `py-24` minimum;
    - written in Tailwind syntax, with "React/Tailwind/HTML" as its output (line 84);
    - paid fonts assumed to be loaded (line 15).

    It contradicts `frontend-design` on that skill's own list of AI giveaways:
    - it mandates uppercase eyebrow pills (line 52);
    - its "Editorial Luxury" archetype is warm cream with a serif (line 26), `frontend-design`'s first listed default;
    - its scroll entrances on every element (line 69) are what `frontend-design` says "read as AI-generated".

  - **`design-taste-frontend`: not as an optional.** Its defaults are React, Next.js and Tailwind (lines 127–131), or npm design systems (section 2.A). Two ideas add to `frontend-design`:
    - a one-line **design read**, built from the description, existing brand assets and the constraints that override taste (section 0);
    - **boldness matched to the audience** (the dials table, where trust-first is low).
  - **A finding about kiss itself.**
    - **Measured:** the starter has no stylesheet, so a new site's look comes entirely from the agent and `frontend-design`.
    - **Seen:** the eleven examples' shared look, cream `#f7f4ef`, clay `#9a5b34` and uppercase pill eyebrows, is `frontend-design`'s first AI-default trait.
    - **Not measured:** whether agents carry that look into new sites.
  - **The operator chose:** "Bake-off first, then adopt", run here, by three fresh agents in parallel. The brief is the README's bakery prompt, verbatim. kiss comes from a fresh `npm pack` (2.7.5, this branch). Each agent works in its own empty folder and is told not to use the Skill tool or other skills:
    - **A:** `kiss-site-new` only;
    - **B:** A plus `frontend-design`;
    - **C:** B plus the proposed design-read text, kept as `scratchpad/bakeoff/design-read.md` until it is adopted or dropped.

    Adoption waits for the screenshots.

- **2026-10-12/13 — bake-off results, and what was adopted (operator's choice).**
  - **Method.** One `shoot.mjs` pass served each build over HTTP and screenshotted home and menu, at 1280×900 and 390×844, top and full page. That is 24 shots, in `scratchpad/bakeoff/shots/`. All three builds `check` `ok`: A 6 pages, B 7, C 7.
  - **A (kiss alone):** cream `#f4ebdd`, a serif, a terracotta accent, "BAKERY · LEEDS" in tracked capitals with dots (twice), pill buttons, three identical rounded cards with `→`. That is four or five of `frontend-design`'s listed AI defaults. Its menu is `[Item name] … £ tbc` slots.
  - **B (+ `frontend-design`):** a Victorian signwritten board (green, a gilt double border, Ultra in capitals). The plan rejected the cream/serif/terracotta instinct and the invented "every morning". The menu has example items marked "example", with "price to follow".
  - **C (+ `frontend-design` + design read):** read itself as "trust-first local-business". It uses Besley in one blue ink, with the name huge like a shop sign, and puts **opening hours, address and contact on the first screen**. B has them below the fold. Its menu is example items with a "Price tbc" highlight and a draft banner. It also wrote two "sample" news posts that make claims (parkin trays to order).
  - **Read.**
    - `frontend-design` made the difference: A is the generic look, and B and C each look designed.
    - The design read's visible effect (practical facts first) is one build against one, so it is not attributable. It is not adopted.
    - B and C both invented menu items, under `frontend-design`'s "come up with copy and placeholder content".
    - C noticed that example 11 uses dotted meta lines and capital eyebrows, both on `frontend-design`'s list.
  - **Adopted in `kiss-site-new`.** The operator chose: the `frontend-design` nudge, the sharper "never invent" rule, and the skill gaps.
    - **The nudge:** when `frontend-design` is not installed, say so before setting the look, and point at the README's install section. The README's `example-skills@anthropic-agent-skills` does contain `frontend-design` (its `marketplace.json` lists it). The bake-off's copy came from `claude-plugins-official` and differs in text, so the version skew is noted and not chased.
    - **"Never invent":** empty marked slots, never example items or sample posts; placeholders stay visible; a name read off the domain is a guess.
    - **Step 6** has a `npx kiss-ssg check … --summary` fallback, and the review step falls back to the audit lines.
    - **The init marker:** step 1 says to delete it once the starter has grown. `STARTER_MARKER` is only written by `lib/init.js`, never read, so deleting it changes no behaviour.
    - **Tests:** three `skill-coverage.test.js` rows, seen red (3 of 175) and then green. One pattern was aligned with the wording ("Never fill it with…") after the text landed: the text was present, and the phrase in the row differed.
  - **Operator decision: "Restyle them here".** The eleven examples' shared look (cream, clay, capital pill eyebrows, dotted meta lines) is to be redone on this branch, with `frontend-design`.

- **2026-10-13 — the examples restyled, following `frontend-design`'s plan, review, build and critique process.** The plan was put to the operator and approved ("Yes, build it").
  - **Palette, measured.** The colours come from the coffee:
    - green-bean paper `#eef1ea`;
    - roasted-bean ink `#2a1d17`, 14.3:1;
    - one coffee-cherry accent `#a3263a`, 6.4:1;
    - control edges `#7f8a76`, 3.2:1;
    - the dark set `#141a16`, `#e8ece3` and `#f08a98`, with every text pair at 6.8:1 or more;
    - status tones re-chosen for the new paper, at 5.19:1 or more.
  - **Type.** System serif headings (Charter, Iowan, Sitka, Cambria, Georgia) over the system sans, on a 1.25 scale, weights 400 and 700 only. No web fonts.
  - **The one bold element** is the card as an ink-bordered coffee-bag label: a 1.5px ink border, 3px corners, no shadow, a rule under the title.
  - **Removed:**
    - the cream, the clay, the 12px radius and the shadows;
    - pill nav, which is now an underline;
    - uppercase table headers.

    The eyebrow is sentence case and stays: it carries which example a page is.

  - **Templates.** A script file (`scratchpad/undot.mjs`) rewrote every `·` join in examples 1–11:
    - "Example 3, pages", "Recipe: config";
    - meta lines with commas;
    - footer badges.

    Example 11's link rows became `<p class="links">` with no separators, its pagination a "Page N of M" span, and its 404 links a sentence. In all, 35 `.hbs` files changed, 44 lines. Page titles keep `·` as the title separator. Example 12, with its own look, is untouched.

  - **The critique pass found two faults, both fixed.**
    - **A specificity bug of exactly the kind `frontend-design` warns about.** `.hero p` outranked `.eyebrow` and turned it grey and body-sized; it is now `p:not(.eyebrow)`.
    - **Too much accent.** Every card title was a cherry link, so titles are now ink with a `--control` underline.

    Screenshots of examples 11, 3 and 8, light and dark, desktop and phone, are in `scratchpad/restyle/`. Writing the screenshot script also turned up an argument bug: splitting on `:` cut `C:`, and the first run's shots were discarded.

  - **Results:**
    - the eleven stylesheets are byte-identical;
    - examples 9 and 11's `AIKB/last-build.json` were re-recorded through `bin/kiss-ssg.js aikb`, with page hashes only;
    - `npm run gates` is green (85 files).

- **2026-10-13 — the second clean-room run of `kiss-site-review`, mid-`/branch-close`, and its fixes.** The operator chose "Fix both, then restart the close".
  - **The run.** A fresh agent had only the fixed skill and the restyled example 11 from a fresh `npm pack`. It found no guesses in step 1's JSON shapes, the step 2 grep, the 404 or Markdown-copy checks, or craft checks 1, 2, 4, 8 and 9.
  - **A claim I wrote was measured false.** "`text-wrap: pretty` on paragraphs fixes it" failed twice with `pretty` applied: a 7-line post paragraph ("So: / Wednesdays.") at 320px, and the 2-line footer ("kiss-ssg.") at 375px. It is the second time on this branch that a sentence written into this skill was disproved by measurement. The first was `balance` "site-wide".
  - **Skill fixes:**
    - `pretty` is "a browser's best effort, not a guarantee", with `&nbsp;` or a reword as the fallback;
    - check 6 scans every page, because the words decide it;
    - check 5's finding is no _visible_ change, and it now includes the brand link and the current nav link;
    - the long-text probe must be a string with no spaces or hyphens: the agent's first hyphenated string passed falsely;
    - a Playwright or Puppeteer driven through the shell counts as a browser.
  - **Example fixes:**
    - **Two links marked current on `/blog/tags/`.** `aria-current="page"` was on both "All posts" and "Tags". This predates the branch: it comes from `folderMatch: true` on All posts in `router.js`. `folderMatch` moved to Tags, so each tags page now has one current link and `/blog/` has All posts. A post or listing page 2 now marks no item. The README line quoting the nav item is updated to match.
    - **The brand stamp fills with cherry** on hover and press (measured `rgba(0,0,0,0)` → `rgb(163,38,58)`).
    - **`overflow-wrap: anywhere` now covers `.nav__link` and `.brand__text`.** A 60-character unbroken label keeps a 320px page at 320px.
    - **The footer:** "Aster & Oak, a fictional roastery, built with&nbsp;kiss-ssg" in ten layouts, a comma replacing the spaced em dash.
    - **The post:** "So:&nbsp;Wednesdays", which renders as U+00A0 (bytes `302 240`).
  - **Results.** Examples 9 and 11 re-recorded their `AIKB/last-build.json`, and `npm run gates` is green. The fixes have not been through a third clean-room run.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-12** — Criteria 1–3 met:
  - **1:** the audit (`59c3bc6`) came before the edits (`dd31eb8`).
  - **2:** only `src/` layout, page, Sass and `site.js` changed, with no dependency added. `node docs` exits 0 (157 links, none broken) and `npm run gates` is green.
  - **3:** text contrast is 5.1:1 or above. Control edges are 3.07:1 or above. The Required badge is 5.59 light and 5.61 dark. The dark figure is re-measured at the shipped 12% wash: the audit section's 5.00 was measured at 18%, a wash the CSS does not use. Playwright, live site against preview: the copy announcement, sentence-case badges and the phone anchor jump were red before and are green after. The theme toggle, agent selector, focus outline and reduced motion are green on both.

  Criterion 6 is partial (interim read only). Criteria 4, 5, 7 and 8 are not yet started. No drift: still tooling & docs, and `docs/` is deliberately not rebuilt yet.

  **Eyeball: deferred.** The destination is the open item below, to be cleared before `/branch-close`. Decision: **continue**, to Pro Plumbing.

  **Open eyeball item (deferred 2026-10-12):** compare `scratchpad/before/home-phone-dark-top.png` with `scratchpad/after/home-phone-dark-top.png` (session scratchpad), or run `node docs --dev` at http://127.0.0.1:3001. Then keep or revert each change. The one to rule on is the phone header no longer being sticky.

## Audit — docs site (2026-10-12)

Ran `redesign-existing-projects` (user-level install, tasteskill) against `src/`, audit only. No style edits yet.

**How it was run, and what it could not see.** The browser extension was not connected, so this audit reads source and measures. Nothing here was looked at in a browser. Findings marked _unverified_ need an eye on the rendered page. Contrast was measured by a scratch script (WCAG 2.x formula) over the `site.scss` tokens in both themes.

**Attribution.** Each finding names the skill checklist line that raised it. "Beyond the skill" marks one found while reading the code that no checklist line asks about. The verdict depends on this split.

### Findings worth acting on

| #   | Finding                                                                                                                                                                                                                                                                                                                                                       | Where                                                                    | Raised by                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| 1   | **Control borders are 1.27–1.36:1.** The agent `<select>`, the agent-box Copy button and the host option chips are identified only by a `--rule` border. That is below the 3:1 non-text contrast a control's boundary needs (WCAG 1.4.11), in both themes. Measured: light 1.36, dark 1.31 on `--surface`.                                                    | `site.scss:699-706`, `:756-767`, `:570-580`; `--rule` at `:11` and `:54` | Beyond the skill — its audit has no non-text-contrast line                       |
| 2   | **Two `font-weight: 600` rules render as 700.** Atkinson Hyperlegible Next is loaded at 400/700/800 only, so the "Required" badges and the host chips fall back to bold, and the lighter hierarchy they were written for never shows. (The `600` on code keywords is fine: the mono font loads 600.)                                                          | `layout.hbs:26`; `site.scss:542`, `:575`                                 | Skill: "Only Regular and Bold weights used"                                      |
| 3   | **A copy that worked is not announced.** The Copy buttons change their text to "Copied", but nothing is live, so a screen reader hears nothing. The agent-box buttons also carry an `aria-label` ("Copy the Claude Code commands") that overrides the changed text, so even re-reading the button says "Copy".                                                | `site.js:5-15`; `index.hbs:79`                                           | Beyond the skill (it asks for loading/error states, not announced ones)          |
| 4   | **Green breaks the site's own rule.** `site.scss:1-4` says `--pass` green appears "only where something passed". The "Required" badge is green.                                                                                                                                                                                                               | `site.scss:551-554`                                                      | Skill, loosely: "More than one accent colour". The rule broken is the site's own |
| 5   | **No motion and no pressed state anywhere.** There is not one `transition` in the stylesheet. Hover changes snap, and no control responds to being pressed. Any motion added needs a `prefers-reduced-motion` guard (the stylesheet has none today).                                                                                                          | `site.scss` (0 matches for `transition`)                                 | Skill: "Instant transitions", "No active/pressed feedback"                       |
| 6   | **Radii off the scale.** The tokens are `--radius-small` (4px) and `--radius-panel` (10px), but the select uses `0.4rem` and the prompt cards `0.5rem`. Four radii look accidental.                                                                                                                                                                           | `site.scss:704`, `:791`                                                  | Skill: "Uniform border-radius", inverted: here it is ununiform by accident       |
| 7   | **Sibling cards disagree.** `.agent-box` has a `--surface` fill and a `--radius-panel` corner. `.prompts__item`, directly below it in the same step, has no fill and a third radius. Same component role, two looks.                                                                                                                                          | `site.scss:725-732` vs `:789-799`                                        | Skill: "Inconsistent vertical rhythm in side-by-side elements" (nearest line)    |
| 8   | _Unverified._ **The sticky header may be two rows tall on a phone.** The mark is 3.4rem tall, and with four nav items and the toggle in a wrapping flex row, a 375px viewport probably wraps to two rows. A sticky header then takes a large share of the screen, and `scroll-padding-top: 5rem` may be less than its height, hiding anchor targets under it. | `site.scss:95`, `:241-275`; `header.hbs`                                 | Skill: "Missing whitespace" / layout. Needs a look                               |
| 9   | _Unverified._ **The hero copy floats.** `.hero__inner` centres both columns vertically. The toolkit panel is much taller than the copy, so the heading probably sits halfway down the panel rather than at the top of the page.                                                                                                                               | `site.scss:405-410`                                                      | Skill: "Everything centered" (vertical variant). Needs a look                    |
| 10  | **Dead CSS.** `.steps` is only ever used as `.steps--stacked`, which overrides its three-column grid. The `repeat(3, …)` rule and the `margin-top: auto` on `pre` never apply.                                                                                                                                                                                | `site.scss:626`, `:653-656`                                              | Skill: "Three equal card columns"; it points at the rule, the rule is dead       |
| 11  | **Paragraphs can end on one word.** Headings have `text-wrap: balance`; body paragraphs, ledes and card text have no `text-wrap: pretty`.                                                                                                                                                                                                                     | `site.scss:116`, `:132-138`, `:205-210`                                  | Skill: "Orphaned words"                                                          |
| 12  | **All-caps badges.** The "Required / Recommended / To go live" labels are uppercase with tracking, the one all-caps element on the site.                                                                                                                                                                                                                      | `site.scss:540-549`                                                      | Skill: "All-caps subheaders", "Pill-shaped badges"                               |

**#8 and #9 confirmed, after the audit.** Before-screenshots of the live site were taken with Playwright, through a scratch script that borrows the copy installed in `C:/Code/kiss/a1k9training`. Nothing was installed here. The set covers the home and guide pages, light and dark, at 1280×900 and 390×844, and is kept in the session scratchpad. The Chrome extension connected long enough for one homepage shot, then stopped responding to screenshots.

- **#8 is worse than suspected.** On a 390px phone the header wraps to **three rows**: the brand, the nav, then the theme toggle alone. It is 182px tall, 22% of an 844px screen, and stays fixed while scrolling. `scroll-padding-top` is 80px, so an anchor jump lands about 100px under the header. On desktop the header is 67px.
- **#9 is seen at 1280px.** The hero copy sits vertically centred against the toolkit panel, leaving a band of empty page above the heading.
- **Dark mode on desktop reads well.** No new finding there.

**Operator decision:** apply all twelve, in one slice. The colours are chosen by measurement:

- `--control` borders: `#7f86ad` light, `#626aa8` dark, at least 3.07:1 on every background a control sits on.
- The "Required" badge in brand blue on a blue wash: 5.59:1 light, 5.00:1 dark.

### Skill rules that fired and should be rejected

These checklist items match the site, but following them would undo a deliberate choice that is recorded in the code:

- **"Replace the font"**: the skill suggests Geist, Outfit or Satoshi. Atkinson Hyperlegible was chosen for legibility (`layout.hbs:26`), and a docs site is read, not glanced at.
- **"Flat design with zero texture", "Empty sections"**: the skill suggests grain, noise overlays, background imagery and picsum placeholders. Being flat is a decision: `site.scss:838-839` records that there is no shadow token. Placeholder imagery on a docs site is noise.
- **"Light/dark toggle is always a sun/moon switch"**: the skill suggests a dropdown or system detection. System detection already exists (`site.js:25`), and the icon is the convention people recognise.
- **"Generic card look (border + background)"**: border-not-shadow is the stated framing for screenshots that are light in either theme (`site.scss:837-839`).
- **The upgrade techniques** (spring physics, scroll-driven reveals, parallax stacks, broken grid, glassmorphism): these are for landing pages and fight a reference site's job.

### What already passes

Most of the checklist passes:

- **Colour:** no pure black. One accent (the brand blue), with the rose kept for selection. Text contrast measured 5.1:1 or above for every text pair, in both themes; body text is 16.1–17.0:1.
- **Accessibility and structure:** a visible global `:focus-visible`, a skip link, `aria-current` on the nav and the guide menu, and semantic landmarks throughout.
- **Assets and pages:** alt text on every meaningful image, a favicon and Open Graph tags, and a custom 404.
- **Copy:** no AI clichés and sentence-case headings.
- **Layout:** a max-width container, and grids rather than flex percentage maths.

### Interim read on the skill (not the verdict)

The skill is written for landing pages and redesigns of generic AI output, and this site is neither. Of its roughly 70 checks:

- Most passed.
- Five fired and should be rejected.
- Ten produced a real finding (#2, #4–#12; the first draft of this line said "about nine").

Those real findings are small: craft and consistency, not direction. The two most valuable findings (#1 control contrast, #3 unannounced copy) came from reading the code with accessibility in mind, not from the checklist, which has no line for either. The skill was useful as a prompt to look systematically. Whether it beats `frontend-design`, or no skill at all, is not settled until the restyle is seen.

## Audit — Pro Plumbing (2026-10-12)

Ran `redesign-existing-projects` against `C:/Code/kiss/pro-plumbing` on its own branch, `ux/taste-skill`. Audit only.

**Setup, with the operator's approval.** `npm ci` brought `node_modules` to the lockfile. The installed kiss-ssg was 2.6.2, but the lockfile and the last commit say 2.7.0. Then `npm i -D --no-save playwright-core`, as the site's `CLAUDE.md` prescribes. `package.json` is unchanged.

**Baseline.**

- `npm run check`: 7 pages, 0 failed, 131 links with none broken, and no audit findings.
- `npm run review --shots`, run with `CHROME_PATH` set to the cached Playwright Chromium:
  - design system: 0 literals bypassing a token;
  - layout: 7 pages × 3 viewports, 0 must-fix, 0 should-fix, 14 could-improve, all tap targets under the 44px convention and above WCAG's 24px.
- The 21 before-screenshots are copied to the session scratchpad's `pp-before/`.

**Context the docs site did not have.** This site was designed on purpose, and the decisions are written down. `BRAND.md` holds a palette sampled from the logo with every working colour measured, a spacing and type token scale, the eyebrow and favicon decisions, and the WhatsApp green. `VOICE.md` governs every word. The templates explain their choices in comments. So the question here is whether the skill finds what that work missed.

### Findings

| #   | Finding                                                                                                                                                                                                                                                                                                                                    | Where                                               | Raised by                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------- |
| P1  | **Headings leave a word alone on a phone.** No `text-wrap` anywhere in the stylesheet. Seen at 375px: "A small job you've been putting / off" and "A bathroom, or something / bigger".                                                                                                                                                     | `site.css:567-576`; `pp-before/home-mobile-375.png` | Skill: "Orphaned words"                                        |
| P2  | **Motion is not guarded.** Four transitions, one of them the outline button's arrow sliding on hover, and no `prefers-reduced-motion` rule in the file.                                                                                                                                                                                    | `site.css:668`, `:718`, `:819-823`, `:1942`         | Skill: transitions line. The guard itself is beyond it         |
| P3  | **A privacy notice is missing.** The contact form collects a name, phone number, email, postcode and a photo, and no page or note says what happens to them. This is not design, and the words and the facts (Netlify forms, how long Greg keeps them) are Greg's, so this branch does not write it.                                       | `src/pages/contact.hbs:45-135`; no page matches     | Skill: "No legal links"                                        |
| P4  | _Taste._ **The hero copy floats.** `.hero-inner` centres the copy against the taller photo, leaving an empty band above the eyebrow at 1280px. It is milder than on the docs site.                                                                                                                                                         | `site.css` `.hero-inner { align-items: center }`    | Skill: "Everything centered"                                   |
| P5  | _Taste._ **The `h1` is quiet beside the photo.** `--text-h1` tops out at 2.2rem, so "Local plumber in Aberdare" is a modest line next to a 515px image.                                                                                                                                                                                    | `site.css:130`                                      | Skill: "Headlines lack presence"                               |
| P6  | _Taste._ **The contact page has two competing filled buttons:** a blue "Call Greg" and a flame "Ask Greg to ring me". Between them sits a row of three unlabelled facts after the call button. `BRAND.md` names flame as the accent button, so the colours are deliberate. Whether two filled buttons on one page compete is the question. | `pp-before/contact-desktop-1280.png`                | Skill: "One filled + one ghost", "More than one accent colour" |
| P7  | Trivial: two consecutive `h1 {}` blocks.                                                                                                                                                                                                                                                                                                   | `site.css:578-584`                                  | Beyond the skill                                               |
| P8  | Trivial: `min-height: calc(100vh - 12rem)` on the 404 page. On mobile, `dvh` measures the screen as you see it.                                                                                                                                                                                                                            | `site.css:1461`                                     | Skill: "`100vh`"                                               |

### Rejected: each is a decision this site already recorded

- **Swap the body font:** a system stack for body text, and a webfont only for headings (`BRAND.md` § Spacing and type).
- **A different header colour:** slate rather than near-black was the operator's option A, 2026-09-18 (`site.css:610-620`).
- **"Random dark section":** the doors band is dark so the page closes on white before a dark footer (`index.hbs:78-80`).
- **One accent, not three door colours:** the blue, white and flame rules are deliberate, one per door (`site.css:456-475`).
- **"Three equal card columns"**, for the jobs gallery: it is photographs, not feature cards.
- **Grain, imagery, motion upgrades:** wrong for a sole trader's confirmation page.
- **Copy rules:** no clichés found, and `VOICE.md` is stricter than the skill.

### Interim read

On a site that was designed, the skill found two small real defects (P1, P2), one important non-design omission (P3), three taste questions (P4–P6) and two trivia. Seven of its rules fired against decisions already on record. It found nothing in colour, contrast, spacing or tokens: the site's own `review` and `BRAND.md` had already done that work, measured. Its most valuable line here, the missing privacy notice, is a checklist item ("No legal links") that a design-only skill would not have raised.

### Outcome (pro-plumbing `ux/taste-skill`, `a0d874b`, not pushed)

**Operator decision:** apply P1, P2, P7 and P8; leave P4–P6 alone; draft P3 for Greg to check.

- **P1 confirmed by eye.** Heading crops at 375px, live site against the branch build served over HTTP, both in Archivo Narrow:
  - home, before: "A small job you've been putting / off";
  - home, after: "A small job you've / been putting off";
  - the FAQ and small-jobs headings balance the same way.
- **P2 (reduced motion): checked by reading only**, not in a browser.
- **P3 is drafted under the form in Greg's voice, and marked do-not-merge.** A comment above it lists the three statements Greg must confirm: use, not passed on, and deletion from both his email and the Netlify forms dashboard.
- **Results after the change:**
  - `npm run check` passes, 7 pages.
  - `npm run review` is unchanged: 0 must, 0 should, 14 could, and 0 off-token literals.
- **`AIKB/` is not re-recorded**, because the work there is not closed.
- **A measurement error, caught.** The first "after" heading measurement loaded the build over `file://`. The site's root-relative `/css/` and `/fonts/` URLs resolved against the drive root, so the page rendered unstyled in a serif. Two rounds of numbers were wrong before the fallback font gave it away in a crop. Re-measured over HTTP. A text heuristic ("last line under 25% of the box") was also dropped, because balancing defeats it. The judgement was made from crops instead.

## Verdict on the skill (2026-10-12)

**No recommendation.** The docs site will not name the taste skill beside `frontend-design`. The operator decided, on Claude's recommendation.

**What it found that we would not otherwise have reached:**

- **The docs site:** ten small, real polish and consistency fixes (#2, #4–#12). The two that mattered most, control contrast (#1) and the unannounced copy (#3), came from reading the code with accessibility in mind, and no checklist line asks for either.
- **Pro Plumbing:** one strategic omission, the missing privacy note (P3), which a design-only skill would not raise, plus two small fixes. Nothing in colour, contrast, spacing or tokens, where the site's own `review` and `BRAND.md` had already measured everything.

**What it cost:**

- **Rules aimed at deliberate choices.** Twelve of its rules fired against decisions the sites had made on purpose: five on the docs site, seven on Pro Plumbing. An agent in a consuming project that follows the skill without that judgement undoes design work.
- **It is not one skill.** "tasteskill" installs four. The flagship, `design-taste-frontend`, defaults to React/Next.js and Tailwind v4, which pull against kiss's Handlebars and Sass structure. A recommendation would point there, not at the audit-first skill that was tested.

**"Am I adding this for the sake of it?"** Yes, on this evidence. It is a reasonable checklist for tidying an existing site, not design direction. kiss already defers direction to `frontend-design`.

**Not done, and worth a later look.** Pulling the useful slice of the checklist into kiss's own `kiss-site-review` skill: the strategic omissions (legal links for a form that collects personal data, a custom 404, a skip link), `text-wrap`, and the reduced-motion guard. Not done because it would change a shipped skill, which is a non-goal of this branch. The parked idea `planning/ideas/2026-09-29-ux-control-quality-skill.md` already proposes a smaller version of the same thing. _Superseded the same day:_ the operator asked for exactly this, and it landed as the craft pass (see Amendments, and below).

## The craft pass in `kiss-site-review`, and its clean-room run (2026-10-12)

**The run.** A fresh general-purpose sub-agent had no conversation context. It was given only two things:

- the branch's `kiss-site-review/SKILL.md`, the copy the plugin marketplace installs (skills do not ship in the npm tarball);
- example 11, copied out of `npm pack`'s tarball into an empty folder, with kiss-ssg installed from that tarball. `check` passed there: 15 pages, 0 failed.

It followed the skill to the report, stopped there, fixed nothing, and listed every place it had to guess. It took about 7 minutes.

**What it showed.** All nine craft checks were carried out:

- **Real findings in example 11**, which ships as an exemplar:
  - tag-chip edges at 1.23–1.35:1;
  - weights 500 and 650 on a system stack, rendering as 600 and 700;
  - no `:active` anywhere, and one hover rule;
  - paragraphs ending on one word;
  - a 110px sticky header that hides 70px of the skip link's target;
  - long unbroken text pushing a 320px page to 997px;
  - demo copy shown to visitors.
- **Eighteen numbered places where it guessed.** Each one that bore on the skill was re-derived locally before anything was edited:
  - the `{ reports, diff }` output shape is real (`lib/check.js:75-80`, `:304`);
  - `GUIDE.md:1066` and `:1068` hold exceptions the skill's table had dropped;
  - example 11's stylesheet uses 500 and 650 on `$font-sans`.

**Fixed in the skill.** The class is "a sentence a literal follower cannot carry out, or that is wrong when checked".

- **Check 1 (control edges):** now scoped to an edge that identifies the control. WCAG 1.4.11 applies only then; a chip whose text is an underlined link is advisory. It also says to measure against every surface, and to name the colour used for a translucent background.
- **Check 3 (font weights):** a system-font stack cannot be answered from the stylesheet. Weights are rendered in the browser instead, or kept to 400 and 700. A first draft said "400, 600 and 700, which the common system faces all ship". That was caught before the commit: Android's Roboto has no 600.
- **Check 5 (motion):** now covers every link and control, with a method for hover and press.
- **Check 6 (single words):** the widths are 320 and 375. It says `balance` cannot fix a short heading that must wrap. The shipped draft claimed `balance` would fix this "site-wide", and the run measured that as false.
- **Check 7 (sticky header):** the screen is now 375×667.
- **What-can-be-read-from-what:** the closing line is now a three-way list, because check 3 needs the browser on a system-font stack.
- **"Look for the decision":** it now says where design notes live, and that an unexplained choice is not automatically a finding.
- **Step 4:** the report table names the craft pass and the Markdown copy, with a measurement for each craft finding.
- **Elsewhere in the skill, the same class:**
  - step 1 reads `{ reports, diff }`;
  - the audit table carries GUIDE's `.example is fine` and the `stray-file` exemptions;
  - step 2 says that no output with exit 1 is the passing result;
  - the long-text check says to inject a test string in the browser;
  - a new bullet covers placeholder, demo and scaffold copy (lorem ipsum appeared in the taste checklist too).

`skill-coverage.test.js` is still green after the fixes (171 passed). The fixes were not re-run through a second clean-room agent.

**Left as found:**

- `allowed-tools` lists no browser tool. The agent drove Playwright through Bash, and the skill neither sanctions nor forbids that.
- The `--dev` "Cannot GET" claim was not tested by the run.
- The canonical link and `.md` copy on a 404 page are outside this branch.
- Example 11's own findings are recorded here, not fixed. They are for the operator to decide on: they are real, and example 11 ships as something to copy.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
