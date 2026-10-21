---
name: kiss-site-review
description: Review a kiss-ssg site in two passes — a usability and best-practice audit (the build's launch-readiness audit, then the built pages in a browser), then an optional design lift — and report before fixing anything. Use when asked to "review the site", "is this site ready to launch", "is it ready to go live", "does this look finished", "run a launch checklist", "do a polish pass", "usability audit", "accessibility check", "give the site a lift", "freshen up the design", "why does this look AI-generated", "why does this look templated", or when a kiss build passes but the site still looks rough. For a build that fails, use kiss-build-check first.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Review a kiss-ssg site for launch

The question is whether the site is **ready to launch** — whether a visitor, a search engine or a link preview meets a finished site. It is not about hiding how the site was built. Most of what makes a site read as "generated" is the same list as what makes it read as unfinished: no titles, one description on every page, a broken heading outline, no favicon, no 404 page, a debug file in the build.

It runs as **two passes**, in this order:

1. **The usability and best-practice audit** (steps 1–4): what is missing, broken or hard to use, each finding measured, reported before anything is fixed.
2. **The design lift** (step 5): optional and offered after the audit's fixes, never folded into them. A lift on a page that still overflows or hides its focus measures the wrong thing.

The skill carries no copy of the API. `node_modules/kiss-ssg/GUIDE.md` § Checking a build (**Launch-readiness audit**) is the contract for what each check means; read it rather than trusting the summary below.

## Execution instructions

### 1. Run the check and read `audit`

```bash
npx kiss-ssg check <site-script> --summary
```

If the summary's first line does not start `ok` (the JSON's `ok` is not `true`), stop and use the `kiss-build-check` skill: a build with any failure reports `audit: null`, because the site-wide findings would be false. Then read the JSON report (`npx kiss-ssg check <site-script>` without `--summary`) and take two keys from each report in it. What it prints is an array of reports, or, when the site has a recorded `AIKB/last-build.json` to diff against, an object `{ "reports": [...], "diff": [...] }`. Read the reports from `reports` when it is there and from the array when it is not:

- `audit` — `{ checked, ignored, skipped, findings: [{ check, page, detail }] }`. The summary prints one `audit <check>: …` line per check that fired, naming up to three pages; a duplicate check gets one line per shared value, `audit title-duplicate: "<the title>" on 6 pages (…)`, because a duplicate is only fixable once you know what is duplicated. `viewport-zoom-lock` and `fragment-missing` get one line per value too: the viewport content, or the href to grep the templates for.
- `links` — the `broken link:` findings. Fix those in the template or model that wrote them.

Two fields change what "no findings" means, so say them out loud in the report:

- **`ignored`** is the site's own `config.audit.ignore` list. Those checks did not run; a clean audit with checks ignored is not a clean site.
- **`skipped`** lists `not-found-missing`, `stray-file` and `console-log` when the build runs under `cleanBuild: false` — the folder holds earlier builds' files, so those three cannot be judged. They are unknown, not passed.

Group the findings by check. The fix for each, in kiss terms — nearly all of the page checks are one edit to the layout's `<head>`, not an edit per page:

| Check                   | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title-missing`         | A `<title>` in the layout's `<head>`, filled from the page's model or options                                                                                                                                                                                                                                                                                                                                                                                                          |
| `title-duplicate`       | The layout is printing a site-wide string. Print the page's own title with the site name after it — `{{title}} · {{config.site.name}}`. A page's default `title` is its own slug, title-cased, so most pages need nothing more; the home page (default `Index`) and any page whose slug reads badly set `title` in their options or model, or override a `title` block                                                                                                                 |
| `description-missing`   | `<meta name="description">` in the layout's `<head>`, from a per-page field                                                                                                                                                                                                                                                                                                                                                                                                            |
| `description-duplicate` | The same: one tagline on every page is the finding. A page that is a deliberate copy sets its `canonical` option to the original and drops out of both duplicate checks                                                                                                                                                                                                                                                                                                                |
| `og-image-missing`      | `<meta property="og:image">` in the layout, with a site default and a per-page override                                                                                                                                                                                                                                                                                                                                                                                                |
| `og-image-relative`     | Scrapers never resolve a relative `og:image`: use `{{absUrl …}}` around the path                                                                                                                                                                                                                                                                                                                                                                                                       |
| `canonical-missing`     | `<link rel="canonical" href="{{canonical}}">` in the layout. It fires only when `siteUrl` is set, and `{{canonical}}` is built from it — so fix `site-url-local` first, or every canonical names the wrong host                                                                                                                                                                                                                                                                        |
| `img-alt-missing`       | An `alt` on the `<img>` named in the detail. A decorative image takes `alt=""`, which is correct and passes                                                                                                                                                                                                                                                                                                                                                                            |
| `h1-count`              | Exactly one `<h1>` per page. The usual cause is a layout whose logo or site name is an `<h1>` while the view has its own                                                                                                                                                                                                                                                                                                                                                               |
| `heading-skip`          | Re-level the heading named in the detail (`h2 -> h4`): headings are an outline, not a font size. Style with a class instead                                                                                                                                                                                                                                                                                                                                                            |
| `viewport-zoom-lock`    | Take `user-scalable=no` and `maximum-scale` out of the layout's viewport meta: `width=device-width, initial-scale=1` is the whole of it. A page that zooms into a form field on a phone has inputs under 16px; fix the font size, never the zoom                                                                                                                                                                                                                                       |
| `href-hash`             | A `href="#"` is a link to nowhere. If it does something on the page (opens a menu, a dialog), it is a `<button type="button">`; if it should go somewhere, give it the destination, with `{{link}}` for a page of the site. If a script really needs it, put `href-hash` in `audit.ignore` with the reason                                                                                                                                                                             |
| `fragment-missing`      | The `#fragment` in the detail names no `id` on the page it lands on. Fix whichever side is wrong: the link's spelling, or the target's `id`. A skip link targets `<main id="main">`. A heading in Markdown has no `id`, so write that one as HTML (`<h2 id="team">`). An id a script adds at runtime cannot be seen; ignoring the check for that turns off its coverage of the skip link too, so say so in the reason                                                                  |
| `favicon-missing`       | `<link rel="icon" href="{{asset …}}">` in the layout, or a `favicon.ico` copied to the build root                                                                                                                                                                                                                                                                                                                                                                                      |
| `not-found-missing`     | A `404` view, excluded from the sitemap with `ignoreSitemap: true`. **The `extensionLess` trap:** on an `extensionLess` site that view builds to `404/index.html`, which hosts do not serve, and the detail says so — register it with `config: { extensionLess: false }` and `slug: '404'` so it lands at `404.html`. A site that finds its pages with `.scan()` does this with a `.page({ view: '404.hbs', … })` earlier in the chain than `.scan()` — the earlier registration wins |
| `site-url-local`        | `siteUrl` is a `localhost`, loopback, `.local`/`.test`/`.invalid` or preview-deploy address (`.example` is fine). Set the production address — the sitemap, the feed and every canonical are built from it                                                                                                                                                                                                                                                                             |
| `debug-dump`            | `viewStats()` under `verbose: true` wrote `debug.json` — every page's options and models — into the build. Call `viewStats()` only under `--dev`                                                                                                                                                                                                                                                                                                                                       |
| `stray-file`            | A `.map`, `.log`, `.bak`, `.swp` or `~` file, a dotfile (but not `.nojekyll`, `.htaccess` or `.well-known/`) or an OS file in the build, almost always from an asset folder copied whole. Remove it from the asset folder, or stop the pipeline step emitting source maps for production                                                                                                                                                                                               |
| `console-log`           | `console.log(` left in a script you wrote. Remove it; a third-party file belongs under `vendor/` or as `*.min.js`, which the check skips                                                                                                                                                                                                                                                                                                                                               |

### 2. External links open in a new tab

A link to another site opens in a new tab, so a visitor keeps their place on this one. The audit does not check this, so check the built HTML. Build the site for real first (see step 3), then list every link that leaves the site without `target="_blank"`:

```bash
grep -rhoE "<a [^>]*href=[\"']https?://[^>]*>" public | grep -vE "target=[\"']_blank" | grep -v 'https://your-site.example'
```

Replace `public` with the build folder and `https://your-site.example` with the site's `siteUrl`. No output and exit code 1 is the passing result: `grep` found no offender. Either quote style matches, so a link written as in the example below is not reported. An absolute URL on the site's own address is internal: `{{link … absolute=true}}`, `{{absUrl}}` and `{{canonical}}` all produce one, and none of them opens a new tab. Neither do `mailto:` and `tel:` links, or a `#` anchor.

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

- **`rel="noopener noreferrer"`** stops the new page reaching back into this one through `window.opener`.
- **Say that it opens a new tab.** A screen-reader user gets no other signal that the context changed. Hidden text, as above, or a visible icon with the same words as its accessible name.
- **A link in Markdown** cannot carry `target`. Write that one link as an `<a>` in the `.md` file (Markdown allows raw HTML by default, `config.markdown.html: true`), or render the external links from a model through a partial that adds it.

List every offender in the report (step 4), grouped by the template that writes it.

### 3. The usability and best-practice audit, in a browser

The audit reads markup. Whether the site looks finished needs eyes. `check` publishes nothing, so there is nothing on disk to look at yet: build the site for real first (`npm run build` on a site set up by `init`, or `node <site-script>`). That writes the build folder — including anything the audit flagged, such as a `debug.json` — so say in the report that you did, and remove it afterwards if it was not there when you started. With a browser tool available, look at the built site **served with the build folder as the site root**: the site's own `--dev` preview (`npm run dev`), or any static server started in the build folder (`public/` by default). Never a server rooted above it — VS Code Live Server opened on the repo is the usual one — because every root-relative `{{link}}` then resolves outside the site and reads as broken when it is not.

Then, on every distinct page template (not every page):

- **Widths** 320, 768 and 1440, and one odd width (say 1023) where breakpoints meet.
- **Long text and unbroken strings** — a long title, a long URL or email, a big number. Does anything overflow its box or push the page sideways? A site whose content has none yet will get one from a model later, so put one into the page in the browser (not into the source) and look, including in a label or badge, a nav link and the site name, not only a paragraph. Use a string with no spaces and no hyphens: either one is a break opportunity, and a string with one passes where a URL would not. The usual fix is `overflow-wrap: anywhere` on headings and text. Not `break-word`: only `anywhere` lowers the width an inline-block, a flex item or a grid item shrinks to. Measured on example 11, `break-word` left a 320px page 724px wide.
- **Consistency across templates** — spacing, type scale, border radius, button styles. One page with its own idea of a button is the most common tell of a site assembled page by page.
- **Things that look clickable and are not** — underlined text, cards with hover styles, icons with no link, a label styled exactly like the site's buttons or chips.
- **Placeholder, demo and scaffold copy** — lorem ipsum, "Example", "TODO", "fictional", a "how this works" panel, a build badge, a sentence addressed to the developer rather than the visitor. It is the plainest sign of a site that is not finished, and it lands in the Markdown copies too. A site that says it is an example or a demo has recorded that as a decision (see the craft pass below). Ask before calling it a finding.
- **The 404 page** — open `/404.html` itself. What a URL that does not exist shows depends on the server: a host serves `404.html`, but the `--dev` preview answers with a bare `Cannot GET`, so judge the page, not the preview. Does it help someone who is lost: the nav, a way home, a search or the main sections? And is it kept out of `sitemap.xml` (`ignoreSitemap: true`)? — the audit does not check that.

- **One page's Markdown copy** — the `.md` beside the HTML (`about.md`, `courses/index.md`), which agents read and `llms.txt` links. This one needs no browser. Is it the page's content alone? A header, footer or menu in it means the layout has no `<main>` around the content, or a menu that is not a `<nav>`. The audit does not check it.

#### The craft pass

These are the finishing details a site reads as unfinished without. Each one is measured or seen, not argued from taste, and the audit checks none of them.

**First, look for the decision.** Before calling anything a finding, check whether the site records it as a choice:

- a `BRAND.md`, or design notes in the `README.md`, the site's `AIKB/` or a planning folder;
- a comment in the stylesheet or the template;
- an `audit.ignore` entry.

A dark band, a system font, an unusual colour role or a modest heading size that the site explains is a decision. One it does not explain is not automatically a finding: only the checks below are. Name the record and leave it, or ask the operator. Never "fix" a recorded decision as if it were a mistake. Every one of the checks below can be overruled this way.

1. **A control's edge is 3:1 or better against what it sits on, when the edge is what tells the reader it is a control.** That means a select, a text field, an outlined button, or a chip whose text is not otherwise styled as a link. Text has a 4.5:1 floor that most sites meet. A boundary that identifies a control has a 3:1 floor (WCAG 1.4.11) that a pale border colour usually misses. A chip whose text is already an underlined link is identified by its text, so its border is advisory. Measure from the stylesheet's colour values in every theme the site has, against every surface the control sits on. Where a background is translucent or blurred, name the colour you measured against.
2. **A result that changes on screen is also said.** A Copy button that turns into "Copied" is silent to a screen reader unless the words also land in an `aria-live="polite"` region. An `aria-label` on the button hides its changed text as well.
3. **Every weight the CSS asks for is a weight that renders.** A `font-weight` of 600 against a font loaded at 400 and 700 renders as 700, and nothing reports it.
   - **A web font:** compare the weights in the font link or `@font-face` with the `font-weight` values in use.
   - **A system-font stack:** the stylesheet cannot answer, because the platform's own faces decide. Measured in Chromium on Windows, Segoe UI renders 500 as 600, and 650 as 700. Android's Roboto has a 500 but no 600. Render each weight in use in the browser and compare, or keep to 400 and 700, the only two every common system face ships.
4. **A colour that means something means only that.** If green is "passed" or red is "error", a badge or button that borrows it for anything else teaches the reader the wrong thing.
5. **Motion respects the visitor.**
   - Every link and control acknowledges hover and press: a colour change, a thicker underline, or a pixel of travel. Give `:active` the same rule, so a tap on a phone gets it too. In the browser, compare a link's computed style at rest, on hover and while the mouse is held down. The finding is no _visible_ change. A changed `text-decoration-thickness` on a link with no underline, for example, changes nothing anyone sees. Include the brand link and the current page's nav link.
   - Every `transition`, `animation` and `scroll-behavior: smooth` sits behind a `prefers-reduced-motion` media query.
   - Grep the stylesheet: a `transition` with no `prefers-reduced-motion` anywhere in it is the finding.
6. **No heading or paragraph ends on a single word.** Look at 320px and 375px wide, where "putting / off" is the usual sight. This one depends on the words, so scan every page, not one per template. One rule each, site-wide:
   - `text-wrap: pretty` on paragraphs fixes most of them. It is a browser's best effort, not a guarantee: example 11 still had a seven-line paragraph and a two-line footer ending on one word with it applied. For the ones left, put `&nbsp;` between the last two words, or change the words.
   - `text-wrap: balance` on headings evens the lines. That fixes most cases, but not a heading of three or four words that has to wrap: "The cascara / experiment" is already balanced. Accept that one, or change the size.
7. **A sticky header is measured on a phone, not assumed.** At 375×667, how tall is it, as a share of the screen? Does a jump to an `#anchor` land under it, because `scroll-padding-top` is smaller than the header? A header that wraps to two or three rows and stays stuck costs every page its reading space.
8. **`100vh` on a phone includes the space behind the browser's address bar.** A full-screen hero uses `100svh`, the screen with the address bar showing, which does not change as the visitor scrolls. `100dvh` follows the bar as it collapses, which is right for an app shell or a bar pinned to the bottom, and shifts the layout under the reader on a marketing page. Keep the `vh` line first as the fallback. This follows from the units' definitions (CSS Values 4); headless Chromium has no address bar to collapse, so it was not measured here.
9. **A form that collects personal details says what happens to them.** For a name, a phone number, an email or a photo, put a line by the form, in the site's own voice. It says who receives the details and that the visitor can ask for them to be deleted. The facts belong to the site's owner, so draft the line and mark every claim for them to confirm. Do not publish a promise they have not made.
10. **Focus is visible, and never hidden.** Grep the stylesheet: `outline: none` or `outline: 0` with no `:focus-visible` rule giving the focus a replacement is the finding. Measured: with `outline: none` and nothing else, a link focused from the keyboard shows no change at all. A replacement ring is 3:1 against what it sits on, like check 1. Then, in the browser, scroll to the bottom of a long page and **Tab backwards** (Shift+Tab) up through it. Measured: a forward Tab brings each link in from the bottom of the screen and never hid one, but Shift+Tab left links under a 120px sticky header with `scroll-padding-top` at 0 and at 40px, and not at 136px. A focused element hidden by the header fails WCAG 2.4.11. The fix is check 7's: `scroll-padding-top` at least the header's height.
11. **Targets are big enough to hit.** WCAG 2.5.8 asks for 24×24 CSS pixels, with exceptions: a smaller target passes when a 24px circle centred on it does not overlap another target, a link inside running text is exempt, and so is a control the browser draws unstyled. So the finding is a control **under 24px in either direction that is also closer than 24px to another one**, measured with `getBoundingClientRect` at 375px wide. On example 11, two card-title links measured 21px tall and pass because they are spaced. 44×44 is advice for a primary control on touch, not a finding.
12. **A skip link comes first** when a header or nav comes before `<main>`. It is the first thing a keyboard reaches, "Skip to content", visible when it has focus, and it targets the `id` on `<main>` (`<a class="skip-link" href="#main">` and `<main id="main">`). In the browser: the first Tab lands on it, and Enter lands `<main>` clear of any sticky header. The audit's `fragment-missing` already catches a skip link whose target has no `id`.
13. **The current page is marked for everyone.** The current nav link carries `aria-current="page"`, and it differs by more than colour alone (WCAG 1.4.1): a weight, an underline, a background. `{{isActive}}` is a block helper that knows which page is current. Its first argument is the page's own context, `this` at the top of a template or `..` inside an `{{#each}}`, and the attribute goes inside it: `{{#isActive this href=(link "about")}}<a href="{{href}}"{{#if active}} aria-current="page"{{/if}}>About</a>{{/isActive}}`. Example 11's layout does the same for a whole nav from a model. Read the built HTML for the attribute, and compare the current link's computed style with another link's.
14. **Transitions name what they animate.** Grep the stylesheet. `transition: all` animates every property that changes, including ones nobody meant to move, so name them (`transition: color 150ms, background-color 150ms`). A transition on `width`, `height`, `margin` or `padding` makes the browser lay the page out again on every frame, so animate `transform` and `opacity` instead.
15. **A hover that changes the box is kept off touch screens.** On a phone, `:hover` sticks after a tap. Measured: in a touch context, a card with an ungated `:hover { transform: translateY(-4px) }` was still lifted after the tap, while the same rule behind `@media (hover: hover) and (pointer: fine)` left it at rest. Gate a hover that transforms, lifts or changes a background that way. A colour or underline change can stay ungated. Check 5's `:active` stays as it is, because a press is what a tap should show.
16. **Content shows without script, and reduced motion shows the end state.**
    - Load each template with JavaScript off (`javaScriptEnabled: false` in Playwright). Measured: a section that starts at `opacity: 0` until a script adds a class stays invisible. Hide it only under a class the script itself sets on `<html>` (`.js .reveal { opacity: 0 }`), and it shows when the script never runs.
    - Under `prefers-reduced-motion: reduce` (`page.emulateMedia({ reducedMotion: 'reduce' })`), animated content is already in its final place, not running a shorter animation. That is kiss's own rule, stricter than WCAG 2.3.3, which is AAA. Only that the emulation reaches the page was measured.
17. **Nothing is `width: 100vw`.** `100vw` includes the vertical scrollbar, so on a desktop with classic scrollbars the page scrolls sideways by the bar's width. Measured: 15px of overflow at 1280px. Headless Chromium hides scrollbars by default (Playwright launches it with `--hide-scrollbars`), so this one only shows with that flag removed (`ignoreDefaultArgs: ['--hide-scrollbars']`). Use `width: 100%`. Overflow from a long string has its own fix, `overflow-wrap: anywhere` (above): measured, it fixed a flex child and a `1fr` grid track on its own, where `min-width: 0` alone did not.
18. **Text at 200% still fits.** Double the root font size at 1280px wide (`document.documentElement.style.fontSize = '200%'`) and look for text that is clipped or overlaps (WCAG 1.4.4). Measured: a box with `height: 48px` clipped its text, and the same box with `min-height: 3rem` grew with it. Clipping is the finding. Text in `px` that does not grow with the root is not, because full-page zoom also satisfies 1.4.4.
19. **Running text stops at a readable line.** Count the characters a line in the longest paragraph of each template at 1440px, about 45 to 75 being comfortable. `max-width` in `ch` sets it, but measure rather than trust the number: `ch` is the width of "0", wider than an average letter, so measured on example 11, `70ch` came out at 97 characters a line and `54ch` at 60 to 71. Before its cap, that page's posts ran to 115.
20. **A list fed by a model works at 0 and at 1.** A tag, post, news or menu list renders a line saying it is empty when it has nothing, and a correct singular at one ("1 post", not "1 posts"). Check by building a scratch copy of the site with that model cut down, never by editing the site's own models. This is not the same as `kiss-site-new`'s marked placeholder slots: those are for an owner who has not given the items yet. This check is for a list that is genuinely empty when the site builds, such as a new tag with no posts.

What each check can be read from:

- **The stylesheet:** checks 1, 4, 8, 14, 15 and 17, the grep halves of 5 and 10, and 3 for a web font.
- **The templates and scripts:** checks 2, 9, 12, 13 and 20.
- **The browser:** checks 6, 7, 11, 16, 18 and 19, the hover-and-press half of 5, the keyboard half of 10, and 3 on a system-font stack.

A browser does not have to be a tool of the agent's own. A Playwright or Puppeteer install driven from a script through the shell does the job: serve the build folder over HTTP, never `file://`, for the reason given at the start of this step.

**When Anthropic's `webapp-testing` skill is available, it is a recipe for that script** in Python Playwright, which needs `pip install playwright` and `python -m playwright install chromium` first. Use it or write your own script; the browser is what matters. Either way, three of the skill's defaults are wrong for a kiss site:

- **Not `file://`.** Its decision tree sends static HTML to the file itself, and its example opens a `file://` URL. A kiss build is static HTML whose links are root-relative, so this pass is still served over HTTP with the build folder as the root.
- **Not `with_server.py` on Windows.** It stops the shell it started, not the server under it: measured twice, `npm run dev` was still listening after it printed "Server 1 stopped", and the next run failed to bind. Start the server yourself in the background, or any static server in the build folder, and stop that process when the pass is done.
- **Not port 3001 by assumption.** `--dev` listens where the site's `router.js` says, and prints the address when it binds; read it there. Example 11 uses 3011.

**Without a browser, say that this pass did not run.** Do not infer the result from the templates: a layout that looks right in the source is exactly what this pass exists to check.

### 4. Report first, then fix what the operator picks

**Report first.** Before editing anything, put every finding in one table: the audit's, the external-link pass's, the browser pass's, the Markdown copy's and the craft pass's. Give each craft-pass finding its measurement: a contrast ratio, a grep result, a height in pixels.

| Priority | Where | What | Measured | Why it matters | Proposed fix |
| -------- | ----- | ---- | -------- | -------------- | ------------ |

- **P0:** a visitor is blocked. Content is invisible or unreachable, there is a keyboard trap, or a form cannot be sent.
- **P1:** it fails a WCAG 2.2 AA criterion, or it is broken on a common device: overflow at 320px, focus hidden under the header, `viewport-zoom-lock`, a skip link with no target.
- **P2:** a visible flaw that reads as unfinished. For example a word alone on a line, a hover stuck after a tap, a weight that does not render, `href-hash`, or the audit's page checks.
- **P3:** polish.

**One row per cause, not per instance.** "`transition: all` in 7 rules of `site.scss`" is one row with the count in it, because it is one fix. Sort by priority.

Then ask the operator which to fix. Fix those, and **re-run `npx kiss-ssg check` after each fix**. A layout edit changes every page, and the next run says whether it cleared the finding or made new ones.

### 5. The design lift

Offer it once the fixes the operator picked are in, and only then. It is the operator's choice whether to run it at all.

**When Anthropic's `frontend-design` skill is not installed, say so and do not attempt the lift.** Point the operator at `node_modules/kiss-ssg/README.md` § "Optional: Anthropic's `frontend-design` skill for the look" for the install lines. The audit's fixes are the whole of this review without it.

With it installed, `frontend-design` sets the **visual direction** (type, colour, spacing tokens, layout character) inside the frame below, and kiss keeps the **structure**: layouts, partials, the Sass/asset folder, one view per page. Never collapse a page into a single-file page to restyle it.

1. **Decisions first.** The craft pass's rule, applied to the look. Read `BRAND.md`, any design notes in the README, comments in the stylesheet and the site's `AIKB/`. A recorded decision is off the table unless the operator puts it back on.
2. **A one-line design read:** who the site is for, and how bold the lift should be. An existing site is in **preserve** mode unless the operator asks for more: at most one step bolder than it is now, keeping its identity, its navigation labels and its content. A trust-first audience (a trade, a clinic, a public service) sits low; a creative studio or a campaign can go higher.
3. **Preserve, improve, remove.** Sort what is there into three lists:
   - strengths to keep;
   - weak hierarchy, spacing, contrast or craft to improve;
   - clutter or dead patterns to remove.
4. **Two or three proposals.** Each one says:
   - what changes;
   - which files it touches;
   - why it suits the read;
   - before-and-after screenshots at 375 and 1440, from the site served over HTTP.

   Make the "after" in a **scratch copy** of the site and throw the copy away, so the site's own source changes only once the operator has picked.

5. **The protected contract.** A lift does not change:
   - URLs, page ids or anchor ids;
   - form field names or their order;
   - navigation labels, the logo, or legal and pricing copy;
   - the content itself.

   A URL that has to move gets `aliases`. A proposal adds no copy, figure, testimonial or section the owner did not give. The rule against invented facts is `kiss-site-new`'s, and it holds here.

6. **After the pick:** make the change in the site, run `npx kiss-ssg check` again, and re-run the craft checks the change touched.

### 6. A check the site does not want goes in `ignore`, with the reason

Some findings are decisions, not mistakes — a site with no social sharing may not want `og:image`. Put the check id in `config.audit.ignore`, with a comment saying why:

```js
audit: {
  // An internal handbook: never shared on social, so no og:image.
  ignore: ['og-image-missing'],
},
```

The report lists it under `ignored` on every build, so the decision stays visible. Never suppress a finding any other way — not by deleting the page, not with `audit: false` to make a list go away.
