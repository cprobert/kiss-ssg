---
name: kiss-design
description: The look of a kiss-ssg site and the craft under it — when and how to bring in Anthropic's frontend-design skill for the visual direction while kiss keeps the structure, the measured design checks (weights that render, colours that mean one thing, hover and press that show, no line ending on one word, readable line length, consistency across templates, nothing that looks clickable and is not), and the design lift for an existing site. Use when asked to "give the site a lift", "freshen up the design", "make it look better", "why does this look AI-generated", "why does this look templated", "does this look finished", or when setting a new site's look. kiss-site-new calls it to set the look, and kiss-site-review calls it to review and for the lift. Not for accessibility (kiss-accessibility) or the words (kiss-writing-for-the-web).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Design

kiss decides how a site is built, not what it looks like. This skill holds the craft every look needs — the checks a site reads as unfinished without — and the process for setting or lifting a look without breaking the site under it. The visual direction itself comes from Anthropic's `frontend-design` skill when it is installed.

## In a kiss site

The look lives in the stylesheet and the layout (`src/assets/`, `src/layouts/`), with one view per page and partials for what repeats. A look goes into those files; a site never becomes a single-file page to be restyled.

## Build mode

When Anthropic's `frontend-design` skill is available, let it set the **visual direction** — type, colour, spacing tokens, layout character — while kiss keeps the **structure**: layouts, partials, the Sass/asset folder, one view per page. Its look goes into those files; the site never becomes a single-file page.

**When it is not installed, say so before you set the look.** Without a design skill, a site lands on the generic defaults. Built from the same brief with this skill alone, a trial site came out in cream, with a serif and a terracotta accent, dotted capital labels and three identical cards. With `frontend-design`, two builds of that brief each had a look of their own. Tell the owner what it adds, and point them at `node_modules/kiss-ssg/README.md` § "Optional: Anthropic's `frontend-design` skill for the look" for the install lines. Then go on as they answer: install it and continue, or build without it.

## Review mode

Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, with its priority and its measurement, one row per cause. A choice the site records is not a finding, and a record whose own reason a measurement now contradicts is marked **ask**; the protocol has the rule. Look at the site in a browser as the [browser pass](../kiss-site-review/browser-pass.md) says; without a browser, the browser checks did not run, and the report says so.

On every distinct page template:

- **Consistency across templates** — spacing, type scale, border radius, button styles. One page with its own idea of a button is the most common tell of a site assembled page by page.
- **Things that look clickable and are not** — underlined text, cards with hover styles, icons with no link, a label styled exactly like the site's buttons or chips.

1. **Every weight the CSS asks for is a weight that renders.** A `font-weight` of 600 against a font loaded at 400 and 700 renders as 700, and nothing reports it.
   - **A web font:** compare the weights in the font link or `@font-face` with the `font-weight` values in use.
   - **A system-font stack:** the stylesheet cannot answer, because the platform's own faces decide. Measured in Chromium on Windows, Segoe UI renders 500 as 600, and 650 as 700. Android's Roboto has a 500 but no 600. Render each weight in use in the browser and compare, or keep to 400 and 700, the only two every common system face ships. A headless browser on Linux is not one of those platforms: there `system-ui` resolves to whatever face is installed (Inter, in the 2026-10-21 pilot). So a measurement there says nothing about Windows, macOS or Android, and the check is **not run**, not passed, unless it was done on the platform itself.
2. **A colour that means something means only that.** If green is "passed" or red is "error", a badge or button that borrows it for anything else teaches the reader the wrong thing.
3. **Every link and control acknowledges hover and press:** a colour change, a thicker underline, or a pixel of travel. Give `:active` the same rule, so a tap on a phone gets it too. In the browser, compare a link's computed style at rest, on hover and while the mouse is held down. The finding is no _visible_ change. A changed `text-decoration-thickness` on a link with no underline, for example, changes nothing anyone sees. Include the brand link and the current page's nav link.
4. **No heading or paragraph ends on a single word.** Look at 320px and 375px wide, where "putting / off" is the usual sight. This one depends on the words, so scan every page, not one per template. Count a heading or paragraph whose last rendered line holds one word. Group the count by page and report it as one row. One rule each, site-wide:
   - `text-wrap: pretty` on paragraphs fixes most of them. It is a browser's best effort, not a guarantee: example 11 still had a seven-line paragraph and a two-line footer ending on one word with it applied. For the ones left, put `&nbsp;` between the last two words, or change the words.
   - `text-wrap: balance` on headings evens the lines. That fixes most cases, but not a heading of three or four words that has to wrap: "The cascara / experiment" is already balanced. Accept that one, or change the size.
5. **Running text stops at a readable line.** Count the characters a line in the longest paragraph of each template at 1440px, about 45 to 75 being comfortable. `max-width` in `ch` sets it, but measure rather than trust the number: `ch` is the width of "0", wider than an average letter, so measured on example 11, `70ch` came out at 97 characters a line, and `54ch` at 60 to 79 across six posts (median 70). Before its cap, that page's posts ran to 115. Measure every page of a template, not one paragraph: one paragraph measured 60–71 and hid the 79.

A sticky bar's share of a phone screen is measured in `kiss-accessibility`'s review (its check 4), with the padding that keeps focus clear of it.

What each check can be read from:

- **The stylesheet:** checks 2 and 5's cap, and 1 for a web font.
- **The browser:** checks 3, 4 and 5, and 1 on a system-font stack.

## The design lift

Offer it once the fixes the operator picked are in, and only then. It is the operator's choice whether to run it at all.

**When Anthropic's `frontend-design` skill is not installed, say so and do not attempt the lift.** Point the operator at `node_modules/kiss-ssg/README.md` § "Optional: Anthropic's `frontend-design` skill for the look" for the install lines. The review's fixes are the whole of the work without it.

With it installed, `frontend-design` sets the **visual direction** (type, colour, spacing tokens, layout character) inside the frame below, and kiss keeps the **structure**: layouts, partials, the Sass/asset folder, one view per page. Never collapse a page into a single-file page to restyle it. In preserve mode, take its direction for the one or two things the proposals change, not its process for a new design: no fresh token system and no new palette, because the site already has those, recorded.

1. **Decisions first.** The review protocol's rule, applied to the look. Read `BRAND.md`, any design notes in the README, comments in the stylesheet and the site's `AIKB/`. A recorded decision is off the table unless the operator puts it back on.
2. **A one-line design read:** who the site is for, and how bold the lift should be. An existing site is in **preserve** mode unless the operator asks for more: at most one step bolder than it is now, keeping its identity, its navigation labels and its content. A trust-first audience (a trade, a clinic, a public service) sits low; a creative studio or a campaign can go higher.
3. **Preserve, improve, remove.** Sort what is there into three lists:
   - strengths to keep;
   - weak hierarchy, spacing, contrast or craft to improve;
   - clutter or dead patterns to remove.
4. **Two or three proposals.** Each one says:
   - what changes;
   - which files it touches;
   - why it suits the read;
   - before-and-after screenshots at 375 and 1440, from the site served over HTTP. A pair that is identical because the proposal leaves that width alone is fine, and says so.

   Make the "after" in a **scratch copy** of the site and throw the copy away, so the site's own source changes only once the operator has picked.

5. **The protected contract.** A lift does not change:
   - URLs, page ids or anchor ids;
   - form field names or their order;
   - navigation labels, the logo, or legal and pricing copy;
   - the content itself.

   A URL that has to move gets `aliases`. A proposal adds no copy, figure, testimonial or section the owner did not give. The rule against invented facts is `kiss-writing-for-the-web`'s, and it holds here.

6. **After the pick:** make the change in the site, run `npx kiss-ssg check` again, and re-run the review checks the change touched.
