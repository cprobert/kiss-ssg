---
name: kiss-site-review
description: Review a kiss-ssg site for launch readiness — read the build's launch-readiness audit, then look at the built pages in a browser — and report what is unfinished before fixing anything. Use when asked to "review the site", "is this site ready to launch", "is it ready to go live", "does this look finished", "run a launch checklist", "do a polish pass", "why does this look AI-generated", "why does this look templated", or when a kiss build passes but the site still looks rough. For a build that fails, use kiss-build-check first.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Review a kiss-ssg site for launch

The question is whether the site is **ready to launch** — whether a visitor, a search engine or a link preview meets a finished site. It is not about hiding how the site was built. Most of what makes a site read as "generated" is the same list as what makes it read as unfinished: no titles, one description on every page, a broken heading outline, no favicon, no 404 page, a debug file in the build.

The skill carries no copy of the API. `node_modules/kiss-ssg/llms.txt` § Checking a build (**Launch-readiness audit**) is the contract for what each check means; read it rather than trusting the summary below.

## Execution instructions

### 1. Run the check and read `audit`

```bash
npx kiss-ssg check <site-script> --summary
```

If the summary's first line does not start `ok` (the JSON's `ok` is not `true`), stop and use the `kiss-build-check` skill: a build with any failure reports `audit: null`, because the site-wide findings would be false. Then read the JSON report (`npx kiss-ssg check <site-script>` without `--summary`) and take two keys:

- `audit` — `{ checked, ignored, skipped, findings: [{ check, page, detail }] }`. The summary prints one `audit <check>: …` line per check that fired, naming up to three pages; a duplicate check gets one line per shared value, `audit title-duplicate: "<the title>" on 6 pages (…)`, because a duplicate is only fixable once you know what is duplicated.
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
| `favicon-missing`       | `<link rel="icon" href="{{asset …}}">` in the layout, or a `favicon.ico` copied to the build root                                                                                                                                                                                                                                                                                                                                                                                      |
| `not-found-missing`     | A `404` view, excluded from the sitemap with `ignoreSitemap: true`. **The `extensionLess` trap:** on an `extensionLess` site that view builds to `404/index.html`, which hosts do not serve, and the detail says so — register it with `config: { extensionLess: false }` and `slug: '404'` so it lands at `404.html`. A site that finds its pages with `.scan()` does this with a `.page({ view: '404.hbs', … })` earlier in the chain than `.scan()` — the earlier registration wins |
| `site-url-local`        | `siteUrl` is a `localhost`, loopback, `.local`/`.test`/`.invalid` or preview-deploy address. Set the production address — the sitemap, the feed and every canonical are built from it                                                                                                                                                                                                                                                                                                  |
| `debug-dump`            | `viewStats()` under `verbose: true` wrote `debug.json` — every page's options and models — into the build. Call `viewStats()` only under `--dev`                                                                                                                                                                                                                                                                                                                                       |
| `stray-file`            | A `.map`, `.log`, `.bak`, dotfile or OS file in the build, almost always from an asset folder copied whole. Remove it from the asset folder, or stop the pipeline step emitting source maps for production                                                                                                                                                                                                                                                                             |
| `console-log`           | `console.log(` left in a script you wrote. Remove it; a third-party file belongs under `vendor/` or as `*.min.js`, which the check skips                                                                                                                                                                                                                                                                                                                                               |

### 2. The judgement pass, in a browser

The audit reads markup. Whether the site looks finished needs eyes. `check` publishes nothing, so there is nothing on disk to look at yet: build the site for real first (`npm run build` on a site set up by `init`, or `node <site-script>`). That writes the build folder — including anything the audit flagged, such as a `debug.json` — so say in the report that you did, and remove it afterwards if it was not there when you started. With a browser tool available, look at the built site **served with the build folder as the site root**: the site's own `--dev` preview (`npm run dev`), or any static server started in the build folder (`public/` by default). Never a server rooted above it — VS Code Live Server opened on the repo is the usual one — because every root-relative `{{link}}` then resolves outside the site and reads as broken when it is not.

Then, on every distinct page template (not every page):

- **Widths** 320, 768 and 1440, and one odd width (say 1023) where breakpoints meet.
- **Long text and unbroken strings** — a long title, a long URL or email, a big number. Does anything overflow its box or push the page sideways?
- **Consistency across templates** — spacing, type scale, border radius, button styles. One page with its own idea of a button is the most common tell of a site assembled page by page.
- **Things that look clickable and are not** — underlined text, cards with hover styles, icons with no link.
- **The 404 page** — open `/404.html` itself. What a URL that does not exist shows depends on the server: a host serves `404.html`, but the `--dev` preview answers with a bare `Cannot GET`, so judge the page, not the preview. Does it help someone who is lost: the nav, a way home, a search or the main sections? And is it kept out of `sitemap.xml` (`ignoreSitemap: true`)? — the audit does not check that.

**Without a browser, say that this pass did not run.** Do not infer the result from the templates: a layout that looks right in the source is exactly what this pass exists to check.

When Anthropic's `frontend-design` skill is available and the look itself needs work, it sets the **visual direction** — type, colour, spacing tokens, layout character — and kiss keeps the **structure**: layouts, partials, the Sass/asset folder, one view per page. Never collapse a page into a single-file page to restyle it.

### 3. Report first, then fix what the operator picks

**Report first.** Before editing anything, put every finding — the audit's and the browser pass's — in one table:

| Where | What | Why it matters | Proposed fix |
| ----- | ---- | -------------- | ------------ |

Then ask the operator which to fix. Fix those, and **re-run `npx kiss-ssg check` after each fix** — a layout edit changes every page, and the next run says whether it cleared the finding or made new ones.

### 4. A check the site does not want goes in `ignore`, with the reason

Some findings are decisions, not mistakes — a site with no social sharing may not want `og:image`. Put the check id in `config.audit.ignore`, with a comment saying why:

```js
audit: {
  // An internal handbook: never shared on social, so no og:image.
  ignore: ['og-image-missing'],
},
```

The report lists it under `ignored` on every build, so the decision stays visible. Never suppress a finding any other way — not by deleting the page, not with `audit: false` to make a list go away.
