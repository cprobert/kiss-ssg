---
name: kiss-site-import
description: Convert an existing web page into a structured kiss-ssg site — a Claude or ChatGPT artifact (often given as a link to the published artifact or share), a page that is already live, an exported page, a hand-written HTML file — keeping what it looks like while giving it a layout, partials and models. Use when someone arrives with a working page rather than a description, or asks to "turn my artifact into a real site", "convert this HTML to kiss", "make this page maintainable", "I built a site in Claude, now what", "here's the link to my artifact", "import an existing page", or "get this off a chat and onto a host". For a site described rather than supplied, use kiss-site-new; for moving a site across kiss-ssg versions, use kiss-site-migrate.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Import an existing page into kiss-ssg

Someone has a page that already works and that they already approved the look of. The job is to keep that look **exactly** and give it the structure a person can maintain: a layout, one partial per section, content in models, the stylesheet as it was.

Two things make this different from building a site:

- **The design is settled. You are not redesigning.** A conversion that also improves the markup cannot be verified, because nothing can tell your improvements from your mistakes. Convert first, verify it renders the same, and only then change anything — as a separate, named step the author agreed to.
- **The engine does the mechanical half for you.** `splitDocument` ships in the package. It parses and cuts the markup and guarantees the page did not change. The stylesheet needs no tool: it stays whole, inline in the layout where the page had it, or as the linked file it already was. `splitDocument` never adds whitespace, so a partial cut from a **minified** page is as dense as the page was; if you format it for legibility, do it as a separate, deliberate step and re-run the comparison after, because a formatter that puts a line break between two inline-block elements opens a visible gap. Do not hand-roll any of that; what it deliberately leaves to you is everything requiring judgement, and that is where your effort goes.

## Execution instructions

### 1. Confirm the engine, and that it is new enough

`node_modules/kiss-ssg/package.json` must exist; read its `version`. Then feature-test rather than trusting a version number — the splitter is a recent addition:

```sh
grep -c splitDocument node_modules/kiss-ssg/types/kiss.d.ts
```

A non-zero count and you can proceed. `types/` is generated from the engine's real exports and ships in the tarball, so it cannot claim a function the installed package does not export. A zero means the installed kiss is too old: `npm install kiss-ssg@latest --save-dev` first. If the project has no kiss at all, run `npx kiss-ssg@latest init` — it installs the engine, writes the `package.json` scripts and points `CLAUDE.md` at the API contract.

Then check the module type, whatever `init` did: `node -p "require('./package.json').type"` must print `module`. `router.js` uses `import`; under `"commonjs"` the build fails with `Cannot use import statement outside a module`.

### 2. Get the page onto disk, and keep it

Save the page as a real file before touching it — `source/original.html` beside `router.js` is a good home — and commit it. If the folder is not a git repository yet, `git init` first: nothing else in this sequence creates one.

**This is not housekeeping.** The one real precedent for this conversion never committed its source, so nobody can diff what the conversion did, re-run it against a better importer, or answer "did we lose something?" six months later.

**Most often you are given a link, not a file** — a published Claude artifact, a ChatGPT share, a page somebody put live. kiss is the upgrade path for exactly those sites. Fetch the raw HTML, never through a tool that converts the page to Markdown (that throws the HTML away), and keep the response headers:

```sh
mkdir -p source
curl -sSL -D source/headers.txt <url> -o source/as-served.html
```

Then **look at what you got before going further**. It is one of three things, and each needs something different:

- **A loader shell.** A share page often renders the site in the browser with JavaScript, so the download is a few kilobytes, a `<script>` bundle, and none of the page's own words or `<style>`. Do not rebuild the page from what you can see, from a screenshot or from memory: that is a rewrite, and nothing could verify it. Ask the person for the page's own code — artifacts and ChatGPT canvases both let you copy or download the code behind the preview — and save that as `source/original.html`.
- **The page itself, as one self-contained file** — an artifact's code, an exported page. Copy `as-served.html` to `original.html` and carry on.
- **A page served by a live site.** It is real HTML, but it is a host's **build output**, and three things follow from that:
  - **The host may have added to it, or changed it.** Netlify injects a deploy-preview drawer (`<div data-netlify-deploy-id…><script src="/.netlify/scripts/cdp">`) before `</body>` and rewrites a Netlify form, removing `data-netlify` and re-quoting its attributes; Cloudflare injects email-obfuscation and beacon scripts; analytics snippets are often added at the edge. **Strip the injections** into `source/original.html` and keep `as-served.html` untouched beside it: left in, a single injected `<div>` beside `<main>` stopped the split unwrapping it and produced one giant region plus a false "between two sections" warning. **Restore what the host took** — a form that posted to Netlify Forms needs `data-netlify="true"` back, or the redeployed site has no form and every check stays green — as its own named step, and say it is an inference.
  - **It may be a preview, not the approved page.** A deploy-preview URL can differ from production. If the page names a canonical or production address, fetch that too and ask which one is the approved design.
  - **It is probably one page of a larger site, and that site may already have a source.** Tells: links to sibling pages, `data-vcs` on an injected element, a generator `<meta>`, Handlebars-style entities (`&#x27;`, `&#x3D;`). **Ask first whether a source repository exists** — if it does, that is the thing to import, not its output. If not, ask which pages to bring across; this skill converts one at a time.

If the page is pasted into the chat instead, save exactly what was pasted. Either way, say where the HTML came from, and keep the link beside it in `source/SOURCE.md` — with the `Server:` header, which answers the host question step 9 cannot read off the code.

### 3. Read the contract

Read `node_modules/kiss-ssg/llms.txt` whole. It is the short index of the API that ships with the engine, and it points at the `node_modules/kiss-ssg/GUIDE.md` section that holds each rule. For this job, read `GUIDE.md` § Converting an existing page (`splitDocument`, `findTag`), § Cleaning the build folder (`folders`) and § Helpers (`asset`, `link`, `canonical`).

Per-module detail is in `node_modules/kiss-ssg/AIKB/html-split.md`. Read it before you run anything: it says what the module guarantees and, more usefully, what it deliberately refuses to do.

**Then read `node_modules/kiss-ssg/examples/12-from-a-single-file/` — it is this job, already done.** Not an illustration of a feature: the artifact it started from (`source/original.html`), the conversion that produced the site (`tools/convert.mjs`), the comparison that proved the page unchanged (`tools/compare.mjs`), the `router.js`, the model, the `config/` module and the stylesheet. Its `README.md` is the shortest complete account of the sequence you are about to follow.

Leaving this out cost a clean-room run four separate mistakes, every one of which that folder answers in a line of working code. Read it before step 4.

### 4. Cut the document, then **name the regions yourself**

Run `splitDocument(html)` once with no names and look at what it found. It proposes a name per region from the element's `id`, then its first class, then its tag — and those are markup names, not meaning. This is the step where you earn your keep.

Rename every region to what it **is** on the page. Measured on a real conversion, the proposals and the right answers differed on three regions out of eleven: the page's own ids gave `help`, `approach` and `enquire` where a person had called the same three `problems`, `method` and `enquiry`. Both are defensible; the point is that only a reader of the page can choose.

Then re-run with the names — and, for any page that is not the home page, its **`pageName`**, which becomes the view's filename and so its URL:

```js
const {
  layout,
  page,
  partials,
  assets,
  regions,
  expressions,
  warnings,
  stats,
} = splitDocument(html, {
  // One entry per region, BY INDEX, in the order `regions` listed them.
  // `null` keeps a proposal you are happy with. A short list leaves the rest
  // proposed — and puts your fourth name on the fourth region rather than on
  // the one you had in mind, silently. Count them against `regions` first.
  names: ['topbar', 'header', 'hero', 'trust-strip', 'problems', 'services'],
  // The last path segment of the page's URL: /one-to-one-dog-training keeps
  // its address as src/pages/one-to-one-dog-training.hbs. The default is
  // `index`, which is right only for a home page.
  pageName: 'index',
})
```

Things to check before moving on:

- **Chrome versus section.** A region under `site/` goes in the layout and appears on every page; one under `sections/` belongs to this page. The split reads `header`, `nav`, `footer`, `aside` and a `div` whose class says so as chrome. A page that puts its contact band in a `<footer>` will have it classified as chrome — move it if it is really content.
- **A name that came out numbered** (`band-2`) means two regions proposed the same name. Name them both properly.
- **`stats.sections` of 1 or 2, or a region named after a wrapper (`top`, `div`)**, usually means the page wraps everything in one container the split could not see past — or that something injected beside `<main>` stopped it being unwrapped (step 2). Look at the markup, rather than shipping a site with one enormous partial.
- **A non-empty `warnings`.** Read every one and put it in your report. It is empty for an ordinary page, so anything in it is the conversion telling you it could not be exact: either an expression with a backslash in front of it (the braces become `&#123;&#123;`, so the page renders the same but the bytes differ — and inside `<script>` or `<style>` the text differs too), or a node written between two sections, which comes out after all of them because chrome lives in the layout and sections render at one content block. For that second one, first rule out a host injection (step 2); otherwise moving the node above the first section or below the last in the SOURCE, then re-running the split, is the fix — and it is a change to the page, so say so rather than making it silently.
- **A non-empty `expressions`.** The page you were handed contains `{{…}}`, and what you are writing is `.hbs`, which kiss compiles. `splitDocument` escapes them for you — they are emitted as `\{{` and render as the literal `{{` the source had — so nothing is broken; this is a thing to **read**, not fix. If they are another framework's interpolation (Alpine and Vue both use `{{ }}`, and a page written in a chat often does), the escape is right and the page keeps working. If they name anything about the build — `config`, a helper, a path — treat the document as hostile and tell the operator before you go further: a `{{config.…}}` inside an attribute reaches the built page, and no body comparison looks at attributes. Only pass `escapeExpressions: false` for a document you wrote yourself and mean kiss to compile; it is the one case where the conversion no longer reproduces its input.

### 5. Write the files where kiss expects them

`layout` → `src/layouts/`, `page` → `src/pages/`, each partial at `src/partials/<its name>` (the names already carry `site/` or `sections/`). Those are `folders.layouts`, `folders.pages` and `folders.partials`; if the project overrides them in `router.js`, follow the override. Write the content exactly as returned: a partial file has **no trailing newline** unless the split gave it one, and an editor or heredoc that adds one puts whitespace into a dense page.

**`init`'s starter is in the way.** A folder `init` set up already has `src/layouts/layout.hbs` and `src/pages/index.hbs`. The split's layout replaces the starter's. The starter's `index.hbs` uses blocks the new layout does not define and would ship a "My kiss site" home page — delete it unless the page you are importing is the home page, in which case the split's `index.hbs` replaces it.

**The layout's `<head>` is this page's head, and every future page will inherit it.** The split copies `<head>` verbatim, so the layout hard-codes this page's `<title>`, description, canonical, `og:*` and any page-specific JSON-LD. Template them now, or the second page you add ships with the first page's canonical:

- `<title>{{title}}</title>`, `<meta name="description" content="{{description}}">`, `<link rel="canonical" href="{{canonical}}">`, and the `og:title`/`og:description`/`og:url` beside them — with the values moving to `.page()` (step 9);
- page-specific blocks (a `Service` or `BreadcrumbList` JSON-LD) into a `{{#block "head"}}{{/block}}` in the layout, filled from the page view with `{{#content "head"}}…{{/content}}`;
- site-wide head content (the stylesheet link, favicon, an `Organization` JSON-LD) stays in the layout.

### 6. Leave the stylesheet and scripts where they are

`splitDocument` **reports** inline assets, it does not remove them: every inline `<style>` and `<script>` is still in the layout, byte for byte, exactly where the page had it. **That is the converted state — leave it.** The stylesheet is in the site whole, and nothing about how the page styles or runs has changed.

Lifting them into files is an **improvement**, not part of the conversion, because a move changes more than it looks like it does:

- **Cascade order.** Two `<style>` blocks merged into one file land at the first one's position; an external `<link rel="stylesheet">` that sat between them now overrides rules that used to follow it.
- **Conditions.** A `<style media="print">`, `title` or `nonce` means something a merged file cannot say; a print sheet merged in applies on screen.
- **Relative URLs.** A `url(img/x.png)` inside an inline `<style>` resolves against the page; in `css/site.css` it resolves against `css/`, and every background image and font breaks.
- **Script timing.** An inline classic script runs the moment it is parsed. `<script src defer>` runs after parsing; a script that sets up configuration for a later `<script src>` then runs too late. A `type="module"` script is deferred by nature and must keep its `type`; JSON-LD and import maps are data and must stay inline.
- **Content-Security-Policy.** A `nonce` or hash that allowed the inline block does not allow a file.

`assets.styles` (`{ attrs, content }`) and `assets.scripts` (`{ attrs, type, content }`) say what is there, for the day you make that improvement.

**Do not rename the stylesheet `.scss`, and do not split it.** Sass reads plain CSS differently in places — `#{` inside a string is interpolated, a string `@import` becomes a compile-time import, native CSS nesting is flattened — so a stylesheet passed through Sass is no longer guaranteed to be the one that was approved.

### 7. Collect the files the page links

**The files a page links are not in its HTML** — a linked stylesheet, scripts, images, the favicon, fonts. Collect them into `src/assets/` **at the same path**, so the page's own root-relative references (`/css/site.css`, `/images/hero.webp`) still resolve after the build without a single tag changing. From a live page:

```sh
for p in /css/site.css /js/nav.js /images/hero.webp /favicon.svg; do
  mkdir -p "src/assets$(dirname "$p")"
  curl -sSf "<origin>$p" -o "src/assets$p"
done
```

Then open each **stylesheet** you downloaded: its `url(…)`, `@import` and `@font-face` name more files, relative to the stylesheet. An absolute URL on another origin (an `og:image` on the production domain) is not yours to copy unless it is the same site; say which you fetched and from where. Say which files you could not find rather than leaving a dead reference. A `<script src>` or `<link rel="stylesheet" href>` the page already had stays where it is, in the layout, ahead of `{{#block "scripts"}}`.

### 8. Lift the content into models — the judgement half

The partials now hold both structure and words. Move the words out, one model per page, named after the page view: `src/models/<pageName>.json`, read in the view as `model.*`.

The test to apply, and it settles most cases: **a person should be able to change the copy without opening a `.hbs` file.**

| Goes in the model                                    | Stays in the partial                   |
| ---------------------------------------------------- | -------------------------------------- |
| Headings, prose, button labels, prices, dates        | Elements, classes, ARIA, the structure |
| An image's `src`, `alt`, width and height            | The `<img>` tag itself                 |
| A repeated block (cards, list items) as an **array** | The `{{#each}}` that renders it        |

Give fields names that mean something — `hero: { kicker, heading, intro, primary: { label, href } }`. Nothing can check a bad name, which is exactly why the engine refuses to guess at them and you are doing this by hand.

Hand each section partial its own slice at the call site, so a partial only sees what it needs:

```handlebars
{{> "sections/hero" model.hero}}
```

**Keep every partial call flush left**, as the split wrote it. Handlebars indents each line a standalone partial outputs by the call's own indentation, which is invisible in ordinary markup and adds spaces inside a multi-line `<pre>` or `<textarea>`.

**A fact that appears more than once is not model data — it is config.** A phone number in the markup, in a WhatsApp link and in the JSON-LD belongs in `config/site.js`, spread into `new Kiss()`. That is the seam `llms.txt` § The build script describes, and duplication is what earns it, not length.

**In a partial you handed a slice, that is `{{@root.config.…}}`.** The slice replaces the context, so plain `{{config.business.phone}}` resolves to nothing and renders **empty** — no warning, no failed page, `check` still green, `links` and `audit` both clean. Nothing but reading the page catches it. Chrome partials invoked without a slice (`{{> "site/footer"}}`) still use plain `{{config.…}}`, so a converted site legitimately contains both spellings; `examples/12-from-a-single-file/src/partials/` shows each in place.

**Inside `<script type="application/ld+json">` a value needs `{{{ }}}`, and nowhere else does.** Everywhere in HTML, `{{ }}` escaping is right and a triple-stash is a hole. But script content is never entity-decoded, so `{{url}}` writes a URL's `&` as `&amp;` and `=` as `&#x3D;` into the JSON — wrong data with a green build. Use `{{{ }}}` only there, only for values from your own model or config, and never for anything a visitor could have supplied.

### 9. Write the build script, then the site decisions

`kiss-site-new` carries the full contract for `router.js`. **It ships from the plugin marketplace rather than in the tarball, so it may not be installed** — the same is true of `kiss-site-review` and `kiss-build-check` named below. When a skill this one points at is not there, the contract is `node_modules/kiss-ssg/llms.txt` § The build script, and `examples/12-from-a-single-file/router.js` is it as working code. Say which you used.

Things a converted site needs that nothing else will remind you of:

- **`package.json` needs `"type": "module"`** and the four scripts (`build`, `dev`, `check`, `aikb`). `router.js` uses `import` and top-level `await`; with no type at all every run prints a `MODULE_TYPELESS_PACKAGE_JSON` warning and works anyway, which is how it ships unnoticed, and with `"commonjs"` it does not run. Step 1 checked it; check again if you rewrote `package.json`.
- **`title` and `description` go on `.page()`**, not in the model — and the layout reads them (step 5). A page with neither still builds, titled after its slug — a converted home page ships as `<title>Index</title>`, which nothing catches: the audit only flags an absent title, and a body comparison never looks at `<head>`.
- **`siteUrl`**, which `{{canonical}}`, `.sitemap()` and `.robots()` need. A live page usually states it: its `<link rel="canonical">` and `og:url`. An artifact rarely does.
- **Chain `.sitemap()`, `.robots()`** and — if the page has dated content — `.feed()`.
- **If the page is replacing something already published, every old URL goes in `aliases`**, and `redirects: { format: … }` must name the host or kiss writes the host-neutral list and no host file.
- **Links to pages you have not imported yet stay hand-written** (`href="/puppy-training"`), not `{{link}}`, which fails the build for an id no page claims. `llms.txt` says never to hand-write an internal URL; that rule is for pages the site has. Note each one in `source/SOURCE.md` and swap it for `{{link}}` when its page arrives.

Two decisions genuinely cannot be read off the code: **which host serves the site** (which sets `links: { trailingSlash: … }`) and **the site's domain** (`siteUrl`). The `Server:` header kept in step 2 and a canonical link are strong hints, not answers. Ask. **When there is nobody to ask — and in an agent run there usually is not — do not guess silently.** Take the most likely host (`trailingSlash: true` is the default, Netlify's) and domain, write a `TODO` comment on each naming it as unverified, and list both in what you report back. A guess you flagged is a question; a guess you did not is a defect with a green build on top of it.

### 10. Verify it renders the same, then say so

Build it and run the `kiss-build-check` skill (`/kiss-ssg:kiss-build-check`), or `npm run check -- --summary` if it is not installed. Do not stop at `ok`: this is a conversion, so the bar is that the output **looks like the input**.

Take the comparison baseline **before** adding anything, then four checks. The first is the only one a person has to do:

- **Open the built page and the original side by side in a browser.** No gate performs this. If you are an agent and cannot, say so plainly and hand the operator the two paths (the built page needs serving from `public/` when its paths are root-relative) — do not let the other checks stand in for it.
- **Compare the whole document.** Split both at `><` and diff them after normalising whitespace between tags. That covers `<head>`, attributes, JSON-LD and scripts — all things a body comparison skips — and on a minified page it is the strongest evidence you will have. Expect two kinds of difference and no others: the build's minifier normalising attribute quotes, and the changes you made on purpose. Name each.
- **Compare the bodies.** Copy `node_modules/kiss-ssg/examples/12-from-a-single-file/tools/compare.mjs` and edit two things: the built page's path (it reads `public/index.html`) and its `ACCEPTED` list, which carries example 12's own address fix — empty it, then **declare each difference you accept** rather than loosening the comparison. A comparison that can never fail reports nothing, and that one started out unable to fail.
- **Compare the assets, and check the `<title>`.** `cmp` each downloaded file against its copy in `public/`; an inline `<style>` is covered by the whole-document diff. Read the built `<title>`: nothing else will.

`broken link:` findings come in three kinds — say which each one is: a reference the original already got wrong, an asset step 7 missed, or **a page of the larger site that this import does not include yet** (expected, and listed in `source/SOURCE.md`). Then run `kiss-site-review` (if installed) for the launch-readiness findings; an artifact almost never has a favicon, a 404 page or an `og:image`, and a one-page import has no 404.

Report what moved: regions found, partials written, what you stripped and restored in step 2, and **every guess you flagged in step 9**. Those are the numbers and the caveats that show the handover promise was kept.

### 11. Record the knowledge base

Once it builds green, `npx kiss-ssg aikb router.js` writes `AIKB/` — `site-map.md`, `site-map.json`, `last-build.json` and a `README.md` explaining them, covering the pages, models, controllers and partials the build actually saw. It prints the full build report to stdout on success, which is expected rather than an error. Commit the folder. For an imported site this matters more than usual: the next person has no history to read, because the site did not exist as files until today.
