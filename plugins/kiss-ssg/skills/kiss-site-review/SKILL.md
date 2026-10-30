---
name: kiss-site-review
description: Review a kiss-ssg site for launch — the build's launch-readiness audit, then each domain skill's review (accessibility, front end, design, SEO, the words) in one prioritised report before anything is fixed, then an optional design lift. Use when asked to "review the site", "is this site ready to launch", "is it ready to go live", "does this look finished", "run a launch checklist", "do a polish pass", "usability audit", or when a kiss build passes but the site still looks rough. For a build that fails, use kiss-build-check first.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Review a kiss-ssg site for launch

The question is whether the site is **ready to launch** — whether a visitor, a search engine or a link preview meets a finished site. It is not about hiding how the site was built. Most of what makes a site read as "generated" is the same list as what makes it read as unfinished: no titles, one description on every page, a broken heading outline, no favicon, no 404 page, a debug file in the build.

It runs as **two passes**, in this order:

1. **The audit and the domain reviews** (steps 1–4): what is missing, broken or hard to use, each finding measured by the skill that owns it, reported before anything is fixed.
2. **The design lift** (step 5): `kiss-design`'s, optional and offered after the audit's fixes, never folded into them. A lift on a page that still overflows or hides its focus measures the wrong thing.

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
| `title-duplicate`       | The layout is printing a site-wide string. Print the page's own title with the site name after it — `{{title}} · {{config.site.name}}`. Then give every page a real title of its own, in its `title` option or its model's `title` (`node_modules/kiss-ssg/GUIDE.md` § .page()); a slug title-cased is the fallback, not a title, and what each title says is `kiss-seo`'s                                                                                                             |
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

### 2. Run each domain skill's review mode

The expertise lives in the domain skills; this skill runs them and merges what they find. Run each in its review mode, on the built site:

- **`kiss-accessibility`** — labels, focus, the skip link, the current page, contrast, targets, zoom, motion, content without script.
- **`kiss-front-end`** — long strings and sideways scroll, the hero height, transitions, hover on touch, `100vw`, lists at 0 and 1, external links.
- **`kiss-design`** — consistency, things that look clickable, weights, colour meaning, hover and press, lines ending on one word, line length.
- **`kiss-seo`** — titles, descriptions, headings, robots.txt, competing and moved pages, structured data.
- **`kiss-information-architecture`** — orphan pages, nav labels, one name per concept, depth, where-am-I, breadcrumbs, URLs, tag variants.
- **`kiss-writing-for-the-web`** — the words: demo and placeholder copy, invented facts, links and buttons, the 404 page, empty states, the line about personal details.

Each reports to the same [review protocol](./review-protocol.md) and looks at the site through the same [browser pass](./browser-pass.md), so their rows join one table.

### 3. What only a kiss site has

Two checks are about how kiss builds a site, so they stay here:

- **The 404 page helps, and is out of the sitemap** — open `/404.html` itself (the `--dev` preview answers a missing URL with a bare `Cannot GET`, so judge the page, not the preview). Does it give someone who is lost the site's nav, a way home, a search or the main sections, from the same layout as every other page? And is it excluded with `ignoreSitemap: true`? The audit checks neither. What it says is `kiss-writing-for-the-web`'s.
- **One page's Markdown copy** — the `.md` beside the HTML (`about.md`, `courses/index.md`), which agents read and `llms.txt` links. This one needs no browser. Is it the page's content alone? A header, footer or menu in it means the layout has no `<main>` around the content, or a menu that is not a `<nav>`. The audit does not check it.

### 4. Report first, then fix what the operator picks

Report to the [review protocol](./review-protocol.md): every finding in one table before anything is edited, with its P0–P3 priority and its measurement, one row per cause; then the operator picks what to fix, and `npx kiss-ssg check` runs again after each fix. The table holds the audit's findings, each domain skill's, and step 3's.

### 5. The design lift

Offer it once the fixes the operator picked are in, and only then. It is the operator's choice whether to run it at all, and the `kiss-design` skill runs it.

### 6. A check the site does not want goes in `ignore`, with the reason

Some findings are decisions, not mistakes — a site with no social sharing may not want `og:image`. Put the check id in `config.audit.ignore`, with a comment saying why:

```js
audit: {
  // An internal handbook: never shared on social, so no og:image.
  ignore: ['og-image-missing'],
},
```

The report lists it under `ignored` on every build, so the decision stays visible. Never suppress a finding any other way — not by deleting the page, not with `audit: false` to make a list go away.
