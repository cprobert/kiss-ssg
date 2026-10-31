---
name: kiss-front-end
description: Build and review the markup, CSS and scripts a kiss-ssg site ships — image sizes and lazy loading, the order to reach for interactivity (the platform's own <details>, popover and <dialog> before any script, then Alpine's CSP build), full-screen heroes on phones, named transitions, hover kept off touch screens, no sideways scroll from 100vw or long strings, external links, and lists that work at 0 and 1 items. Use when asked about "front-end best practice", "performance", "lazy loading images", "layout shift", "add an accordion / a dropdown / a modal", "should I use JavaScript for this", "the page scrolls sideways on mobile", "hover sticks on my phone", or when writing a layout, a partial or the stylesheet. kiss-site-new and kiss-page-add call it to build, and kiss-site-review calls it to review. Not for accessibility (kiss-accessibility), the look (kiss-design) or the words (kiss-writing-for-the-web).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Front end

What a page ships should be small, stable and readable by the person who opens it next: markup the platform already understands, CSS that says what it animates, and script only where the platform cannot do the job. Each check says how it is measured, and says so where it was not.

## In a kiss site

- Markup lives in views, partials and the layout (`src/pages/`, `src/partials/`, `src/layouts/`), the stylesheet and scripts under `src/assets/` (`node_modules/kiss-ssg/GUIDE.md` § Assets).
- An image's `src`, `alt`, `width` and `height` come from the model beside it, so a page never guesses them.
- A link is written with `{{link}}`, never a typed path (`node_modules/kiss-ssg/llms.txt` § Building a site well).

## Build mode

- **Every `<img>` has its `width` and `height`**, from the model beside its `src` and `alt`, so the page does not jump as images arrive. Add `loading="lazy"` to images below the first screen, never to the first image a visitor sees.
- **A full-screen hero is `100svh`**, not `100dvh`, with a `100vh` line first as the fallback (review check 1).
- **Transitions name their properties**, and never `transition: all` (review check 2). A hover that moves or lifts something goes behind `@media (hover: hover) and (pointer: fine)` (review check 3).
- **A list fed by a model has an empty state**, and where it shows a count, a correct singular ("1 post") (review check 5). The marked slots in `kiss-writing-for-the-web` are for a menu, price list or team on the page whose items the owner has not given. The empty state is for a list with nothing in it when the site builds, including a news section that has no posts yet.

When a page needs a little interactivity, reach for it in this order, and keep the content in the rendered HTML either way — that is what keeps it crawlable:

1. **The platform first, with no script at all.** An accordion is `<details>`/`<summary>` (a shared `name` makes a group exclusive); a dropdown or a mobile menu is the `popover` attribute with a `popovertarget` button, which brings light-dismiss and Escape with it; a modal is `<dialog>`.
2. **Alpine.js's CSP build (`@alpinejs/csp`) when a component holds state the platform cannot** — tabs with their ARIA pattern, filtering a list, a form section that depends on an earlier answer. Self-host its `dist/cdn.min.js` as an asset loaded with `defer`, and keep the logic in `Alpine.data()` components in one script file that the markup names, which is the shape the CSP build is made for.
3. **Never scattered hand-written scripts**, one toggle per page in a different shape each time: a person reading the template has to be able to see what it does.

Most sites never reach step 2, and should not install Alpine until they do. kiss knows nothing about either; this is a recommendation, not a dependency.

## Review mode

Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, with its priority and its measurement, one row per cause. A choice the site records is not a finding, and a record whose own reason a measurement now contradicts is marked **ask**; the protocol has the rule. Look at the site in a browser as the [browser pass](../kiss-site-review/browser-pass.md) says; without a browser, the browser checks did not run, and the report says so.

In the browser, on every distinct page template:

- **Long text and unbroken strings** — a long title, a long URL or email, a big number. Does anything overflow its box or push the page sideways? A site whose content has none yet will get one from a model later, so put one into the page in the browser (not into the source) and look, including in a label or badge, a nav link and the site name, not only a paragraph. Use a string with no spaces and no hyphens: either one is a break opportunity, and a string with one passes where a URL would not. The usual fix is `overflow-wrap: anywhere` on headings and text. Not `break-word`: only `anywhere` lowers the width an inline-block, a flex item or a grid item shrinks to. Measured on example 11, `break-word` left a 320px page 724px wide.

1. **`100vh` on a phone includes the space behind the browser's address bar.** A full-screen hero uses `100svh`, the screen with the address bar showing, which does not change as the visitor scrolls. `100dvh` follows the bar as it collapses, which is right for an app shell or a bar pinned to the bottom, and shifts the layout under the reader on a marketing page. Keep the `vh` line first as the fallback. This follows from the units' definitions (CSS Values 4); headless Chromium has no address bar to collapse, so it was not measured here.
2. **Transitions name what they animate.** Grep the stylesheet. `transition: all` animates every property that changes, including ones nobody meant to move, so name them (`transition: color 150ms, background-color 150ms`). A transition on `width`, `height`, `margin` or `padding` makes the browser lay the page out again on every frame, so animate `transform` and `opacity` instead.
3. **A hover that changes the box is kept off touch screens.** On a phone, `:hover` sticks after a tap. Measured: in a touch context, a card with an ungated `:hover { transform: translateY(-4px) }` was still lifted after the tap, while the same rule behind `@media (hover: hover) and (pointer: fine)` left it at rest. Gate a hover that transforms, lifts, or adds a shadow or a fill that changes the control's shape. A change of colour, background colour or underline can stay ungated. `kiss-design`'s hover-and-press check keeps its `:active` rule, because a press is what a tap should show.
4. **Nothing is `width: 100vw`.** `100vw` includes the vertical scrollbar, so on a desktop with classic scrollbars the page scrolls sideways by the bar's width. Measured: 15px of overflow at 1280px. Headless Chromium hides scrollbars by default (Playwright launches it with `--hide-scrollbars`), so this one only shows with that flag removed (`ignoreDefaultArgs: ['--hide-scrollbars']`). Use `width: 100%`. Overflow from a long string has its own fix, `overflow-wrap: anywhere` (above): measured, it fixed a flex child and a `1fr` grid track on its own, where `min-width: 0` alone did not.
5. **A list fed by a model works at 0 and at 1.** A tag, post, news or menu list renders a line saying it is empty when it has nothing, and where it shows a count, a correct singular at one ("1 post", not "1 posts"). Check by building a scratch copy of the site with that model cut down, never by editing the site's own models. At 0 there is one thing to expect. A fan-out over an empty model folder builds, though it logs `Invalid model`. But any page that `{{link}}`s to one of the removed items fails to render with `link: no page with id`, which is the build working as it should. Cut those links in the scratch copy too, or test the empty state on a list nothing else links into. This is not the same as `kiss-writing-for-the-web`'s marked placeholder slots: those are for an owner who has not given the items yet. This check is for a list that is genuinely empty when the site builds, such as a new tag with no posts.

What each check can be read from:

- **The stylesheet:** checks 1, 2, 3 and 4.
- **The templates:** check 5.
- **The browser:** long strings, and the touch half of check 3.

### External links open in a new tab

A link to another site opens in a new tab, so a visitor keeps their place on this one. The audit does not check this, so check the built HTML. Build the site for real first ([the browser pass](../kiss-site-review/browser-pass.md)), then list every link whose address is absolute:

```bash
grep -rhoE "<a [^>]*href=[\"']https?://[^>]*>" public
```

Replace `public` with the build folder. It prints each such opening tag; read them, and report the ones without `target="_blank"` whose address is not the site's own `siteUrl`. No output is a site with no external links. An absolute URL on the site's own address is internal: `{{link … absolute=true}}`, `{{absUrl}}` and `{{canonical}}` all produce one, and none of them opens a new tab. Neither do `mailto:` and `tel:` links, or a `#` anchor.

The fix is in the template or the partial that writes the link, never per page:

```handlebars
<a
  href='https://github.com/acme/site'
  target='_blank'
  rel='noopener noreferrer'
>
  GitHub<span class='visually-hidden'> (opens in a new tab)</span>
</a>
```

- **`rel="noopener noreferrer"`** stops the new page reaching back into this one through `window.opener`. `noopener` is the part that does it. `noreferrer` also withholds the address the visitor came from, so a site that keeps `noopener` alone has made a choice and is not an offender.
- **Say that it opens a new tab.** A screen-reader user gets no other signal that the context changed. Hidden text, as above, or a visible icon with the same words as its accessible name.
- **A link in Markdown** cannot carry `target`. Write that one link as an `<a>` in the `.md` file (Markdown allows raw HTML by default, `config.markdown.html: true`), or render the external links from a model through a partial that adds it.

List every offender in the report, grouped by the template that writes it.
