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

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
