# Six design-skill repos, evaluated for kiss-ssg

**Date:** 2026-10-20.

**Method.** Each repo was cloned at its current HEAD. The focus skills were read in full, and four read-only agents each took one or two repos. They worked to the same standard as the 2026-10-12 taste-skill trial: framework-neutral, no house style, no invented facts, and recorded decisions respected. Before anything was relied on, the main session re-checked the quotes below against the files, along with the `lib/links.js` claim and the examples' current look.

**Nothing was trialled on a real site.** Every rule here comes from reading the skills. None has been seen to change a kiss build yet. All six repos are MIT-licensed.

**One correction to the screenshot.** `build-awwwards-quality-sites` is in **MengTo/Skills** (`agent-skills/web-design/`), not in Owl-Listener/designer-skills.

## Verdicts

| Repo                                                     | What it is                                                                                                                                                                                                           | Verdict for kiss users                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **emilkowalski/skills** (15 skills)                      | Mostly animation and gesture physics. `apple-design` is WWDC fluid-interface material written for the web: springs, momentum, rubber-banding, built around Framer Motion. Also Swift, Expo and React-library skills. | **Mine for rules only.** The "wow" in `apple-design` is for apps. A static page has no drag, sheet or swipe to apply it to, and its web defaults are a house style (translucent chrome, the system font, "`damping: 1.0` springs everywhere"). The useful skill is `mobile-native`.                                                                                                                                                           |
| **ConardLi/garden-skills** (`web-design-engineer`)       | A staged workflow: a design read with five dials, then design-system, draft and critique checkpoints. It has good references: audience calibration presets, a protocol for redesigns, and a catalogue of failures.   | **Mine for rules only.** It builds React and Babel in a single HTML file, it adds Tweaks toggles "even if the user doesn't ask", and it runs the browser check **only when the user explicitly asks**, which reverses `kiss-site-new`. On the other hand, it forbids invented stats and testimonials.                                                                                                                                         |
| **elayadesign/ai-design-skills** (`landing-page-design`) | One 403-line file: conversion strategy, then a fixed visual system.                                                                                                                                                  | **Ignore.** It repeats the rejected tasteskill trap word for word: "Use organic data: `47.2%`, `$99.00`, `+1 (312) 847-1928`" and "Invent contextual, believable names". It also invents risk-reversal promises (free trial, money-back guarantee). It is Tailwind with Framer Motion, allows only four fonts, and has every element fade in over 800ms with no `prefers-reduced-motion` anywhere. It claims every web UI ("this file wins"). |
| **MengTo/Skills** (177 skills)                           | Codex-first. About 64 skills are unrelated (games, 3D, illustration, X posting). Most of web-design is single effects or named looks: Three.js appears in 62 skills, GSAP in 18.                                     | **`no-ai-design-slop` and `audit-ai-design-slop`: mine for rules only.** They are the closest in spirit to kiss: "slop is a choice made by reflex", "preserve established decisions", evidence for every finding, no scores. **`build-awwwards-quality-sites`: ignore.** It requires GSAP, adds a smooth-scroll engine, reveals headings word by word, and wants a photograph for every avatar.                                               |
| **jakubkrehel/skills** (14 skills, "interfaces")         | Written as code review. Each domain skill ends with a detection table, cites WCAG criteria by number, and says "a deliberate and consistent project convention … is a preference and not a finding".                 | **The best of the six. Mine for rules first; at most an optional companion for review.** Its recipes are Tailwind and React. It contradicts kiss's measured `overflow-wrap: anywhere` with `break-word`, and `variant` asks for "plausible names". It ships no checking script.                                                                                                                                                               |
| **Owl-Listener/designer-skills** (111 skills)            | Short, textbook-level content: Fitts's, Hick's and Miller's laws, POUR, and critique questions.                                                                                                                      | **Ignore.** A model already knows this material, and it has no detection patterns. `accessibility-audit` is 26 lines with no checks, and `critique-color` gives WCAG's large-text threshold as 18**px** where WCAG says 18**pt** (24px).                                                                                                                                                                                                      |

## What kiss could take

These rules are framework-neutral and checkable. None is in `kiss-site-new`, `kiss-site-review` or `lib/audit.js` today; that was checked by grep. Where a rule was found independently in several repos, the repos are listed, and that agreement is the strongest signal this exercise gives.

### Into `kiss-site-review`'s craft pass

1. **Visible focus** (jakubkrehel, MengTo, garden).
   - Never `outline: none` without a `:focus-visible` replacement.
   - The ring is 3:1 against what it crosses.
   - Focus is not hidden under the sticky header, which pairs with check 7.
   - Check it by tabbing through each template, plus a grep.
2. **Target size** (jakubkrehel, MengTo, garden). The floor is 24×24 CSS px (WCAG 2.5.8 AA), with 44×44 on touch advised. Measure with `getBoundingClientRect` at 375px. To enlarge a target, use a pseudo-element on the wrapper.
3. **Skip link** (jakubkrehel, elayadesign). It is the first focusable element and targets the `<main>` that kiss already requires. It was listed as "worth a later look" on 2026-10-12 and never landed.
4. **`aria-current="page"` on the current nav link** (elayadesign), set from `{{isActive}}`. The current link should not be marked by colour alone (MengTo; WCAG 1.4.1).
5. **No `transition: all`** (emilkowalski, jakubkrehel). Name the properties instead. Also, no animating `width`, `height`, `margin` or `padding` (MengTo). Both sit beside check 5's grep.
6. **Hover that moves or recolours goes behind `@media (hover: hover) and (pointer: fine)`** (emilkowalski, jakubkrehel). On touch, `:hover` latches after a tap. This keeps check 5's `:active` rule.
7. **Reduced motion means the final state, not shorter motion. Content is visible with JS off** (MengTo, twice). Load each template with JS disabled: nothing should be left at `opacity: 0`. Check 5 today asks only that motion sits behind the media query.
8. **A correction to check 8** (emilkowalski): `100dvh` is right for an app shell. On a marketing hero it shifts the layout mid-scroll, so the hero uses `100svh`.
9. **Overflow causes, not only symptoms** (emilkowalski, jakubkrehel). `min-width: 0` on the flex child, `minmax(0, 1fr)` on grid tracks, and no `width: 100vw`. These complement `overflow-wrap: anywhere`.
10. **Text at 200% zoom** (emilkowalski, WCAG 1.4.4). Today the browser pass checks widths, never zoom.
11. **Line length of 60–75 characters** (jakubkrehel, MengTo).
12. **Report shape** (MengTo). Add a priority column (P0–P3), and group repeated instances into one systemic finding.
13. **A protected contract for any restyle** (garden). Anchor ids, form field names and URLs do not change silently, and a moved URL gets `aliases`.

### Into `kiss-site-new`

- **Form inputs at 16px or more**, or iOS Safari zooms on focus and does not zoom back (emilkowalski, jakubkrehel). Add a valid `autocomplete` token (jakubkrehel; WCAG 1.3.5). Both belong beside the existing visible-label rule.
- **Every model-fed list rendered with 0 and 1 items** (emilkowalski, garden). An empty state and a correct plural. The "1 posts" bug fixed on 2026-10-13 is exactly this class.

### Into the engine: candidates, each a public behaviour change

- **An audit check for zoom lock.** `user-scalable=no` or `maximum-scale=1` in the viewport meta (emilkowalski, jakubkrehel). It is a fact in the written `<head>`, so it fits `lib/audit.js` the way `og-image-missing` does.
- **Fragments are not checked today. Measured:** `lib/links.js:141` and `:206` skip every reference that starts with `#`. So `href="#"` and an in-page `#anchor` with no matching id are never reported. elayadesign's "a button pointing at `#` is either linked or visually disabled" is the rule. kiss already has the written page, so it could resolve fragments against its ids.

### For the parked control-quality idea (`planning/ideas/2026-09-29-ux-control-quality-skill.md`)

jakubkrehel's `better-accessibility` (with `hit-areas.md` and `focus-and-keyboard.md`) already covers most of its "start with the checkable rules" list:

- 24px and 44px targets;
- `:focus-visible` with a 3:1 ring;
- `<a href>` against `<button>`;
- disabled semantics.

None of the six repos ships the **runnable checker** the idea asks for, measuring contrast and target size against a site's real CSS. That part would still have to be built.

## Traps that recur

Four patterns kiss has already decided against appear again across these repos:

- **Invented content:**
  - elayadesign's "organic data";
  - emilkowalski `prototype`: "plausible names and numbers";
  - jakubkrehel `variant`: "plausible names";
  - Owl-Listener `onboarding-design`: "realistic sample content".
- **Single-file output and dev UI shipped into the site** (garden).
- **One house style presented as taste:** GSAP, word reveals, glass navs, a fixed font list, exact spring values.
- **Rules that fire on recorded decisions.** MengTo's slop catalogue flags "a tracked uppercase eyebrow" and "a warm cream surface". Those are exactly what the operator chose to **keep** for the examples (addendum to the 2026-10-12 session log). Its "preserve established decisions" looks for a `DESIGN.md`, while kiss sites record decisions in a `BRAND.md` or the README.

A process trap as well: every emilkowalski skill opens with "respond only with … Do not provide any other information until the user asks a question". An agent running on its own stalls there.

## For a person's Claude account

- **Keep Anthropic's `frontend-design` as the one skill for the look.** Nothing here does its job better for a kiss site.
- **Do not install `landing-page-design`, `build-awwwards-quality-sites` or `apple-design` at user scope.**
  - `landing-page-design` claims every web UI.
  - The other two impose a house look that would compete with `frontend-design` on every site, not only the one meant for it.
- **If you want one addition, it is jakubkrehel's `better-accessibility`** (perhaps `better-typography` too), used for review, with two caveats:
  - ignore its Tailwind and React recipes;
  - keep `overflow-wrap: anywhere` over its `break-word`.

  By the precedent of the `webapp-testing` trial (2026-10-13), where the installed skill was never invoked in three runs, this deserves a measured trial before kiss recommends it. Folding its rules into kiss's own skills delivers most of the value without the install.

- **Skip Owl-Listener.** It is the largest of the six and adds the least.
