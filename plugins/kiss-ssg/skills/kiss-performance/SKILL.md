---
name: kiss-performance
description: Build and review how fast a kiss-ssg site loads and how still it stays — the first image, image sizes and lazy loading, fonts, blocking scripts, third parties and cache headers. Use for "performance", "speed", "Lighthouse", "Core Web Vitals", "LCP", "CLS", "layout shift", "caching", or when writing a layout. Not for markup behaviour (kiss-front-end), the look or the words.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Performance

A fast page shows its main content quickly, does not move while it loads, and answers a tap at once. A static site starts well ahead: there is no server work, so nearly everything that makes one slow is something the page asks the browser to fetch, and in what order. Each check says how it is measured, and says so where it was not.

The targets, at the 75th percentile of real visits on phones:

| Measure                         | Good     | Poor     |
| ------------------------------- | -------- | -------- |
| Largest Contentful Paint (LCP)  | ≤ 2.5 s  | > 4 s    |
| Cumulative Layout Shift (CLS)   | ≤ 0.1    | > 0.25   |
| Interaction to Next Paint (INP) | ≤ 200 ms | > 500 ms |

## In a kiss site

Most of these rules are one edit in one shared file:

- the `<head>` (the stylesheet, fonts, scripts and hints) lives in the layout (`src/layouts/`);
- an image's `src`, `alt`, `width` and `height` come from the model beside it, so a page never guesses them;
- a stylesheet or script gets a content-hashed name with `assets: { hash: true }` (`node_modules/kiss-ssg/GUIDE.md` § Assets), which is what lets the host cache it for a year;
- image encoding is not kiss's: run the site's image tool as a step in `config.assets.pipeline` (GUIDE.md § An asset pipeline), writing into the asset folder before the copy;
- the audit reports `img-dimensions-missing`, `img-first-lazy`, `fetchpriority-excess`, `font-preload-excess`, `script-blocking` and `host-unset`; `kiss-site-review` has the kiss fix for each.

## Measure first, and last

Speed work is judged by numbers, so take them before the first edit and again after the last, the same way both times.

1. **Before anything is edited**, build the site and measure one page of each distinct template (the home page, a list, an article):

   ```bash
   npm run build
   npx kiss-ssg speed public --page / --page /blog/ --out <temp>/speed-before.json
   ```

   `public` is the site's `folders.build`. Put the file in the system's temp folder, never in the site. If it exits 2 asking for `npm install -D lighthouse`, ask the owner before installing it. It is a development dependency that needs Node 22.19+ and a Chrome. If they decline, review without the numbers and say so in the report.

2. **After the fixes**, build again and measure the same pages against the first run:

   ```bash
   npm run build
   npx kiss-ssg speed public --page / --page /blog/ --against <temp>/speed-before.json
   ```

   Put its table in the report as the result: before, after, and which changes are larger than the noise. It is a lab measurement on this machine, never the site's verdict.

## Build mode

### The image seen first

- **Never `loading="lazy"` on the first image a visitor sees**, usually the hero. It waits for the layout before it even starts to download.
- **Give that one image `fetchpriority="high"`.** One image on a page, two at most: when everything is high, nothing is.
- **Put it in the HTML as an `<img>`**, not as a CSS background or an image a script inserts. The browser finds an `<img>` as soon as the HTML arrives.

### Every image

- **`width` and `height` on every `<img>` and `<video>`**, from the model, so the browser keeps the space before the file arrives. The values are the image's own pixel size; CSS still decides the displayed size (`max-width: 100%; height: auto`).
- **Every candidate in a `srcset` has the same shape** (aspect ratio). An image that changes shape between phone and desktop is a `<picture>` with `width` and `height` on each `<source>` as well as on the `<img>`.
- **`loading="lazy"` on images below the first screen**, and on iframes below it. A lazy image uses `sizes="auto, <your sizes>"` when it has a `srcset`: the browsers that understand `auto` work the size out from the layout, and the others read the value after it. Never a bare `sizes="auto"`, and never `auto` on an eager image.
- **Encoded small, in a modern format.** AVIF or WebP, through a pipeline step, with a JPEG or PNG fallback in a `<picture>` only when the site has a reason to serve old browsers. An image is never wider than twice the widest it is shown at; list the widths it needs in `srcset`, from the model.
- **kiss's own consent banner logo** is kiss's markup, not the site's, and is outside these rules.

### Where CSS goes

Every stylesheet in `<head>` blocks the first paint until it arrives, so a page should download the rules it uses and few it does not. A second or third stylesheet costs nothing measurable on HTTP/2 and HTTP/3; an unused rule costs every page that downloads it. So CSS goes in three tiers, chosen by **who uses it**:

1. **The site stylesheet**: the layout, type, nav, footer, and every component more than one page type uses. One file, linked from the layout, hashed, and cached for the whole visit.
2. **A stylesheet per page type**, when a `.pages()` type (a blog post, a course, a product) has a substantial amount of styling of its own and many pages. The type's view links it through the layout's head slot: `{{#content "head"}}<link rel="stylesheet" href="/{{asset "css/types/course.css"}}">{{/content}}`. A type with a handful of rules keeps them in the site stylesheet. A component two types share moves up to the site stylesheet, never into both type files.
3. **Inline, for one page's own styling**: a small `<style>` block in that page's view, written with `{{#sass}}…{{/sass}}` so it can use the site's variables and is compiled and compressed. No request, and only that page pays for it. It is downloaded again on every visit to the page, so it stays short. A block that appears on two pages moves up a tier.

- **Never a stylesheet for one page**: it costs a request and is shared with nothing. That page's CSS is inline, or belongs in its type's file.
- **Never `style=""` attributes** for this: a `<style>` block keeps the rules readable and in one place.
- **A strict Content Security Policy blocks inline CSS.** When the site's `_headers` sets `style-src` (or `default-src`) without `'unsafe-inline'`, page CSS goes in the type stylesheet instead.
- **`npx kiss-ssg css public` checks all of this**, from the built site, the same way every time: a stylesheet one page links, an inline block on several pages, a rule duplicated across stylesheets, inline CSS a CSP blocks, and how much of each stylesheet no page uses.
- **No `@import` inside it.** Each one is a second request that starts only after the first file has arrived. Sass `@use` is compiled away; a plain-CSS `@import` is not.
- **Inlining "critical CSS" and loading the rest later is not the default.** It is hard to keep right and breaks quietly; reach for it only when a measurement shows the stylesheet is what holds the first paint back.

### Fonts

The copyable steps are in [the font recipes](references/fonts.md). Open them before adding or changing a font.

- **Self-hosted**, as `woff2` files, never from a font service. A Google font comes from its Fontsource package, copied into a folder named with the package version. Open [`kiss-legal-and-privacy`](../kiss-legal-and-privacy/SKILL.md), which covers why a font service is also a privacy finding.
- **A system font stack when the design allows it**: nothing to download.
- **Only the weights, styles and scripts the design uses.** Each is a file. A family used in three or more weights is one variable font.
- **`font-display: swap`, with a fallback that matches the font's size**: a second `@font-face` for a local font (Arial, Times New Roman) with `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override`, generated by Capsize, never guessed. Then the text does not jump when the font arrives.
- **Preload at most two fonts**, the ones the first screen uses, in one format: `<link rel="preload" href="…" as="font" type="font/woff2" crossorigin>`. The `crossorigin` is needed even on the site's own origin.

### Scripts

- **`defer` on every script**, or `type="module"`, which defers by itself. Never a bare `<script src>` in `<head>`: it stops the page being read until the script has downloaded and run.
- **`async` only for a script that must start early and depends on nothing else**, such as an analytics tag. Async scripts run in whatever order they arrive.
- **A consent manager that insists on loading first** (a third-party banner such as Cookiebot's `uc.js`) blocks every page by design, so `defer` is not its fix. kiss's own consent manager loads nothing from another site before a choice. Whether to switch is the owner's decision with [`kiss-legal-and-privacy`](../kiss-legal-and-privacy/SKILL.md), never a speed edit made alone.
- **The platform before a script** (`kiss-front-end` has the order), and no script at all for anything the HTML and CSS can do.

### Ship less CSS and JS

Unused code is the largest saving after third parties, and it is the site's own to remove. The copyable steps are in [the pipeline recipes](references/pipeline-recipes.md). Open them before adding one.

- **Minifying is kiss's.** Every copied `.css` and `.js` is minified outside dev (`assets.minify`, on by default). Add no minify step, and never turn it off to "fix" a file: name a vendor file `*.min.js` and it is left as it is.
- **A framework stylesheet copied whole is purged** with `assets: { purge: { files: ['css/bootstrap.css'], safelist: [...] } }`. kiss removes every rule no written page or script uses, re-hashes the file and relinks the pages (GUIDE.md § Purged CSS). The safelist holds the classes its JavaScript builds at run time; open every interactive component after turning it on, in a production build served from the build folder, because `--dev` skips the purge. Bootstrap's full CSS on one measured site was 94% unused. Tailwind needs no purge, because it scans its content itself.
- **A library is the last resort.** Replace jQuery and a framework's JavaScript with the platform when the page can do without them. A library the site needs is imported by name as an ES module and bundled with esbuild, which keeps only what is imported.
- **Bundle for the import chain, not the request count.** Scripts that `import` each other are bundled, because each nested import is fetched only after its parent. A handful of separate files costs nothing measurable on HTTP/2 and HTTP/3, so never concatenate just to have fewer. Keep each bundle under about 100 kB, and split by page beyond that.

### Third parties

- **Every other origin costs a connection and main-thread time.** Count them: the build report's `thirdParty` lists the origins each page's markup loads from.
- **A video, a map or a social post is `{{embed}}`**, which loads the real player only when the visitor asks for it. Open [`kiss-front-end`](../kiss-front-end/SKILL.md) for how.
- **`preconnect` only to an origin the page uses straight away**, one or two at most. Never to an origin a consent service gates, and never to a font service: the connection hands the visitor's address over before they have chosen anything.

### Moving between pages

- **Speculation rules are optional, and `prefetch` is the default.** One `<script type="speculationrules">` in the layout, document rules with `"eagerness": "moderate"` or `"conservative"`, never `immediate` for the whole site. `prerender` is only for a site with no third-party script, because a prerendered page runs its scripts for a visit that may never happen. Browsers that do not understand it ignore it.

```html
<script type="speculationrules">
  {
    "prefetch": [
      {
        "where": { "href_matches": "/*" },
        "eagerness": "moderate"
      }
    ]
  }
</script>
```

### Caching

- **Hashed files are cached for a year; everything else revalidates.** Turn on `assets: { hash: true }` and set `host` to where the site is deployed (GUIDE.md § Cache headers). kiss then writes the host's header file for every hashed file: `_headers` on Netlify and Cloudflare Pages, a fragment to merge into `firebase.json` on Firebase. A `_headers` the site keeps in `src/assets/` keeps every line, with kiss's block added after it.
- **Never `immutable`, or a year, on a file that is not hashed.** A photograph replaced under the same name would stay stale in returning visitors' browsers for that long. An image or font that changes now and then gets a day, `public, max-age=86400, stale-while-revalidate=604800`, in the site's own `_headers` or `firebase.json`. A font in a folder named with its package version is the one exception: an upgrade changes the folder, so the name changes with the bytes, and it gets the year ([the font recipes](references/fonts.md)).
- **GitHub Pages cannot be configured.** It sends `max-age=600` on everything; set `host: 'github-pages'` so the audit knows it was decided.

## Review mode

Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, with its priority and its measurement, one row per cause. Look at the site in a browser as the [browser pass](../kiss-site-review/browser-pass.md) says; without a browser, the browser checks did not run, and the report says so.

**A browser run is a lab measurement, never the site's verdict.** It runs once, with an empty cache, on this machine. Report each number with how it was taken, and never say the site passes or fails the targets from it: that comes from the site's real-visitor data (Search Console's Core Web Vitals report, or the owner's analytics), if it has any.

1. **The audit's performance checks** — from the build report, grouped by check. Each is one edit in the layout or the model.
2. **Where the CSS goes, from the build.** No browser needed, and the same answer every run:

   ```bash
   npx kiss-ssg css public --out <temp>/css-before.json
   ```

   It lists each stylesheet with its compressed size, how many pages link it, and how much of it no page uses (the same purge `assets.purge` runs). It also lists each inline `<style>` block and the pages it is on, and gives four findings:
   - `stylesheet-one-page`: make it inline, or move it to its type's file;
   - `inline-style-repeated`: move it to the type or site stylesheet;
   - `rule-duplicated`: keep the rule once, in the tier every page that uses it shares;
   - `inline-style-blocked-by-csp`: move the block to a stylesheet.

   A stylesheet whose removable share is large is a framework to purge, or a type's rules sitting in the site file. Run it again after the fixes, and put the before and after in the report.

3. **The image seen first, in the browser.** On each distinct template, at 320 and 1440 wide, find the LCP element by running this in the page after it has loaded:

   ```js
   new Promise((resolve) => {
     new PerformanceObserver((list) => {
       const last = list.getEntries().at(-1)
       resolve({
         ms: Math.round(last.startTime),
         tag: last.element?.tagName ?? null,
         src: last.url || null,
       })
     }).observe({ type: 'largest-contentful-paint', buffered: true })
   })
   ```

   It is right when the element is an `<img>` in the HTML, not lazy, with `fetchpriority="high"`, or is text. Report the time with the width and whether the network was throttled.

4. **Layout shift, in the browser.** Load each template, scroll to the bottom slowly, and add up the `layout-shift` entries that had no recent input (`buffered: true`, as above, summing `value` where `hadRecentInput` is false). Anything over 0.1 is a finding; name what moved (`entry.sources[0].node`).
5. **What each page downloads, and how much of it runs.** In the browser's network log: the stylesheet's size, every font file, every script, and every request to another origin, including the ones a script adds after load, which the build's `thirdParty` list cannot see. Then the browser's code coverage (DevTools Coverage, or Playwright's `page.coverage`) after a load and a scroll gives how much of each CSS and JS file the page used. A font over two weights, a script with no `defer`, a third party that is not an `{{embed}}`, or a whole framework mostly unused is a finding. Coverage counts code that runs only on a click as unused, so open the page's controls before calling a file dead.
6. **The headers the live site sends**, when it is deployed. Fetch the home page, one hashed file and one unhashed image, and read `cache-control` and `content-encoding`:

   ```bash
   curl -sI https://example.com/
   curl -sI https://example.com/css/site.a1b2c3d4.css
   ```

   A hashed file is right at `max-age=31536000, immutable`; an unhashed one with a year, or with `immutable`, is a P1; HTML should revalidate (`max-age=0, must-revalidate`, or `no-cache`). No `br` or `gzip` on HTML, CSS or JS is a finding for the host, not the site.

What each check can be read from:

- **The build report:** check 1.
- **The built folder, with `kiss-ssg css`:** check 2.
- **The browser:** checks 3, 4 and 5.
- **The live site:** check 6.
