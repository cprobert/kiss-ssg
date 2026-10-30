---
name: kiss-accessibility
description: Build and review a kiss-ssg site for accessibility to WCAG 2.2 AA — visible labels, a skip link, visible and unhidden keyboard focus, the current page marked for everyone, contrast of controls, target size, zoom and 200% text, motion and reduced motion, content that shows without script, and changes a screen reader is told about. Use when asked for an "accessibility check", "a11y review", "is this WCAG compliant", "keyboard navigation", "screen reader", "focus is invisible", "contrast", "skip link", or when building a layout, a nav or a form. kiss-site-new and kiss-page-add call it to build, and kiss-site-review calls it to review. Not for the words on a page (kiss-writing-for-the-web), the look (kiss-design) or markup performance (kiss-front-end).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Accessibility

A site is usable when a person on a keyboard, a screen reader, a phone, a zoomed screen or with motion turned off can reach and use everything on it. The floor is WCAG 2.2 AA. Each check says how it is measured, and says so where it was not; where a rule is stricter than AA, it says that too.

## In a kiss site

Most of these rules are one edit in one shared file, never one per page:

- the skip link, the viewport meta, `<main id="main">` and the nav live in the layout and its partials (`src/layouts/`, `src/partials/`);
- the current nav link is marked inside `{{#isActive}}`, the block helper that knows which page is current (`node_modules/kiss-ssg/GUIDE.md` § Helpers);
- focus, contrast and motion live in the stylesheet (`src/assets/`);
- the build's audit already reports `img-alt-missing`, `h1-count`, `heading-skip`, `viewport-zoom-lock` and `fragment-missing`; `kiss-site-review` says the kiss fix for each.

## Build mode

Build to these from the first layout. Most are a check in the review mode below, which says how it is measured and why; the build's audit reports the rest. Building to them now means the review finds nothing to fix:

- **Every image has `alt` text** that says what the image shows when it matters to the page, in the page's own words, and `alt=""` when it is decoration. The text comes from the model beside the image's `src`. The audit reports a missing `alt` as `img-alt-missing`; whether an `alt` says the right thing is this skill's review, and search reads the same words.
- **Every form field has a visible `<label>`**, tied to it by `for` and `id`. A placeholder is an example of the answer, never the label. An error message sits below the field it is about, and says what to fix in words (`kiss-writing-for-the-web`).
- **A skip link comes first** when a header or nav comes before `<main>`: `<a class="skip-link" href="#main">Skip to content</a>`, visible on focus, to `<main id="main">` (review check 7).
- **A visible focus style:** a `:focus-visible` ring, never a bare `outline: none` (review check 5). Give a sticky header `scroll-padding-top` at least its own height, and a sticky bottom bar (a call or cookie bar) `scroll-padding-bottom` at least its own (review checks 4 and 5).
- **The current nav link carries `aria-current="page"`**, set inside `{{#isActive}}`, and is marked by more than colour (review check 8).
- **The viewport meta is `width=device-width, initial-scale=1`**, never with `user-scalable=no` or a `maximum-scale`. The audit reports a zoom lock as `viewport-zoom-lock`.
- **Form inputs are 16px or larger**, each with its `autocomplete` token (`name`, `email`, `tel`), and no positive `tabindex` anywhere. iOS Safari zooms the page into a smaller input and does not zoom back out; that is reported, not measured here, because Chromium does not do it.
- **Content is visible without script.** Hide something for an entrance only under a class the script itself sets (review check 9).

## Review mode

Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, with its priority and its measurement, one row per cause. A choice the site records is not a finding, and a record whose own reason a measurement now contradicts is marked **ask**; the protocol has the rule. Look at the site in a browser as the [browser pass](../kiss-site-review/browser-pass.md) says; without a browser, the browser checks did not run, and the report says so.

Read the build's audit first (`npx kiss-ssg check <site-script> --summary`): `img-alt-missing`, `h1-count`, `heading-skip`, `viewport-zoom-lock` and `fragment-missing` are this skill's findings; `kiss-site-review` says the fix in the layout for each. Then read every image's `alt` the audit passed: does it say what the image shows, in the page's words, or is it a file name, "image", or the same text as the caption beside it?

1. **A control's edge is 3:1 or better against what it sits on, when the edge is what tells the reader it is a control.** That means a select, a text field, an outlined button, or a chip whose text is not otherwise styled as a link. Text has a 4.5:1 floor that most sites meet. A boundary that identifies a control has a 3:1 floor (WCAG 1.4.11) that a pale border colour usually misses. A chip whose text is already an underlined link is identified by its text, so its border is advisory. Measure from the stylesheet's colour values in every theme the site has, against every surface the control sits on. Where a background is translucent or blurred, name the colour you measured against.
2. **A result that changes on screen is also said.** A Copy button that turns into "Copied" is silent to a screen reader unless the words also land in an `aria-live="polite"` region. An `aria-label` on the button hides its changed text as well.
3. **Motion respects the visitor.**
   - Every `transition`, `animation` and `scroll-behavior: smooth` sits behind a `prefers-reduced-motion` media query.
   - Grep the stylesheet: a `transition` with no `prefers-reduced-motion` anywhere in it is the finding.
4. **A sticky bar is measured on a phone, not assumed: a header at the top, or a call or cookie bar at the bottom.** At 375×667, how tall is each one, as a share of the screen? Does a jump to an `#anchor` land under a top bar, because `scroll-padding-top` is smaller than it? A bottom bar needs `scroll-padding-bottom` at least its own height in the same way. A header that wraps to two or three rows and stays stuck costs every page its reading space.
5. **Focus is visible, and never hidden.** Grep the stylesheet: `outline: none` or `outline: 0` with no `:focus-visible` rule giving the focus a replacement is the finding. Measured: with `outline: none` and nothing else, a link focused from the keyboard shows no change at all. A replacement ring is 3:1 against what it sits on, like check 1. Then, in the browser, **Tab through each template in both directions**: forward from the top, and backwards (Shift+Tab) from the bottom. Each direction catches a different bar:

   - A forward Tab brings each control in from the bottom of the screen, so it is a **bottom** bar that hides it. In the 2026-10-21 pilot, a 71px call bar at the bottom of a phone screen hid a link and a form field completely.
   - Shift+Tab brings each control in from the top, so it is a **top** bar that hides it. Measured: under a 120px sticky header, Shift+Tab left links hidden with `scroll-padding-top` at 0 and at 40px, and not at 136px.

   A focused element hidden by a bar fails WCAG 2.4.11. The fix is check 4's: `scroll-padding-top` or `scroll-padding-bottom` at least the bar's height.

6. **Targets are big enough to hit.** WCAG 2.5.8 asks for 24×24 CSS pixels, with exceptions: a smaller target passes when a 24px circle centred on it does not overlap another target, a link inside running text is exempt, and so is a control the browser draws unstyled. So the finding is a control **under 24px in either direction that is also closer than 24px to another one**, measured with `getBoundingClientRect` at 375px wide. On example 11, two card-title links measured 21px tall and pass because they are spaced. 44×44 is advice for a primary control on touch, not a finding.
7. **A skip link comes first** when a header or nav comes before `<main>`. It is the first thing a keyboard reaches, "Skip to content", visible when it has focus, and it targets the `id` on `<main>` (`<a class="skip-link" href="#main">` and `<main id="main">`). In the browser: the first Tab lands on it, and Enter lands `<main>` clear of any sticky header. The audit's `fragment-missing` already catches a skip link whose target has no `id`.
8. **The current page is marked for everyone.** The current nav link carries `aria-current="page"`, and it differs by more than colour alone (WCAG 1.4.1): a weight, an underline, a background. `{{isActive}}` is a block helper that knows which page is current. Its first argument is the page's own context, `this` at the top of a template or `..` inside an `{{#each}}`, and the attribute goes inside it: `{{#isActive this href=(link "about")}}<a href="{{href}}"{{#if active}} aria-current="page"{{/if}}>About</a>{{/isActive}}`. Example 11's layout does the same for a whole nav from a model. Read the built HTML for the attribute, and compare the current link's computed style with another link's.
9. **Content shows without script, and reduced motion shows the end state.**
   - Load each template with JavaScript off (`javaScriptEnabled: false` in Playwright). Measured: a section that starts at `opacity: 0` until a script adds a class stays invisible. Hide it only under a class the script itself sets on `<html>` (`.js .reveal { opacity: 0 }`), and it shows when the script never runs.
   - Under `prefers-reduced-motion: reduce` (`page.emulateMedia({ reducedMotion: 'reduce' })`), animated content is already in its final place, not running a shorter animation. That is kiss's own rule, stricter than WCAG 2.3.3, which is AAA. Only that the emulation reaches the page was measured.
10. **Text at 200% still fits.** Double the root font size at 1280px wide (`document.documentElement.style.fontSize = '200%'`) and look for text that is clipped or overlaps (WCAG 1.4.4). Measured: a box with `height: 48px` clipped its text, and the same box with `min-height: 3rem` grew with it. Clipping is the finding. Text in `px` that does not grow with the root is not, because full-page zoom also satisfies 1.4.4.

What each check can be read from:

- **The stylesheet:** check 1, and the grep halves of 3 and 5.
- **The templates and scripts:** checks 2, 7 and 8.
- **The browser:** checks 4, 6, 9 and 10, and the keyboard half of 5.
