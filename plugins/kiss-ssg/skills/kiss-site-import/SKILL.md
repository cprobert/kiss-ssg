---
name: kiss-site-import
description: Convert an existing single-file web page into a structured kiss-ssg site — a Claude or ChatGPT artifact, an exported page, a hand-written HTML file — keeping what it looks like while giving it a layout, partials, models and Sass. Use when someone arrives with a working page rather than a description, or asks to "turn my artifact into a real site", "convert this HTML to kiss", "make this page maintainable", "I built a site in Claude, now what", "import an existing page", or "get this off a chat and onto a host". For a site described rather than supplied, use kiss-site-new; for moving a site across kiss-ssg versions, use kiss-site-migrate.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Import a single-file page into kiss-ssg

Someone has a page that already works and that they already approved the look of. The job is to keep that look **exactly** and give it the structure a person can maintain: a layout, one partial per section, content in models, styles in Sass.

Two things make this different from building a site:

- **The design is settled. You are not redesigning.** A conversion that also improves the markup cannot be verified, because nothing can tell your improvements from your mistakes. Convert first, verify it renders the same, and only then change anything — as a separate, named step the author agreed to.
- **The engine does the mechanical half for you.** `splitDocument` and `splitStylesheet` ship in the package. They parse, cut, re-indent and guarantee the cascade and the markup did not move. Do not hand-roll any of that; what they deliberately leave to you is everything requiring judgement, and that is where your effort goes.

## Execution instructions

### 1. Confirm the engine, and that it is new enough

`node_modules/kiss-ssg/package.json` must exist; read its `version`. Then feature-test rather than trusting a version number — the splitters are a recent addition:

```sh
grep -c splitDocument node_modules/kiss-ssg/types/kiss.d.ts
```

A non-zero count and you can proceed. `types/` is generated from the engine's real exports and ships in the tarball, so it cannot claim a function the installed package does not export. A zero means the installed kiss is too old: `npm install kiss-ssg@latest --save-dev` first. If the project has no kiss at all, run `npx kiss-ssg@latest init` — it installs the engine, writes the `package.json` scripts and points `CLAUDE.md` at the API contract, and its starter `router.js` is a file to grow rather than one to preserve.

### 2. Get the page onto disk, and keep it

Save the artifact as a real file before touching it — `source/original.html` beside `router.js` is a good home, and commit it.

**This is not housekeeping.** The one real precedent for this conversion never committed its source, so nobody can diff what the conversion did, re-run it against a better importer, or answer "did we lose something?" six months later. Keep the stylesheet too if it is a separate file.

If the page is in a chat rather than a file, ask for the HTML; if it is live, fetch it. Say which you did.

### 3. Read the contract

Read `node_modules/kiss-ssg/llms.txt` — the API contract that ships with the engine. It is long, so read it in sections. For this job you need the entries for `splitDocument` and `splitStylesheet` under `## API`, plus `## Config` (`folders`, `siteUrl`) and `## Helpers` (`asset`, `link`, `canonical`).

Per-module detail is in `node_modules/kiss-ssg/AIKB/html-split.md` and `node_modules/kiss-ssg/AIKB/css-split.md`. Read both before you run anything: they say what each module guarantees and, more usefully, what it deliberately refuses to do.

**Then read `node_modules/kiss-ssg/examples/12-from-a-single-file/` — it is this job, already done.** Not an illustration of a feature: the artifact it started from (`source/original.html`), the conversion that produced the site (`tools/convert.mjs`), the comparison that proved the page unchanged (`tools/compare.mjs`), the `router.js`, the model, the `config/` module and the Sass. Its `README.md` is the shortest complete account of the sequence you are about to follow.

Leaving this out cost a clean-room run four separate mistakes, every one of which that folder answers in a line of working code. Read it before step 4, and copy `tools/compare.mjs` rather than writing your own — step 10 needs it.

### 4. Cut the document, then **name the regions yourself**

Run `splitDocument(html)` once with no names and look at what it found. It proposes a name per region from the element's `id`, then its first class, then its tag — and those are markup names, not meaning. This is the step where you earn your keep.

Rename every region to what it **is** on the page. Measured on a real conversion, the proposals and the right answers differed on three regions out of eleven: the page's own ids gave `help`, `approach` and `enquire` where a person had called the same three `problems`, `method` and `enquiry`. Both are defensible; the point is that only a reader of the page can choose.

Then re-run with the names:

```js
const { layout, page, partials, assets, regions, expressions, stats } =
  splitDocument(html, {
    // One entry per region, BY INDEX, in the order `regions` listed them.
    // `null` keeps a proposal you are happy with. A short list leaves the rest
    // proposed — and puts your fourth name on the fourth region rather than on
    // the one you had in mind, silently. Count them against `regions` first.
    names: ['topbar', 'header', 'hero', 'trust-strip', 'problems', 'services'],
  })
```

Three things to check before moving on:

- **Chrome versus section.** A region under `site/` goes in the layout and appears on every page; one under `sections/` belongs to this page. The split reads `header`, `nav`, `footer`, `aside` and a `div` whose class says so as chrome. A page that puts its contact band in a `<footer>` will have it classified as chrome — move it if it is really content.
- **A name that came out numbered** (`band-2`) means two regions proposed the same name. Name them both properly.
- **`stats.sections` of 1** usually means the page wraps everything in one container the split could not see past. Look at the markup and cut it by hand into the partials you want, rather than shipping a site with one enormous partial.
- **A non-empty `expressions`.** The page you were handed contains `{{…}}`, and what you are writing is `.hbs`, which kiss compiles. `splitDocument` escapes them for you — they are emitted as `\{{` and render as the literal `{{` the source had — so nothing is broken; this is a thing to **read**, not fix. Two reasons it matters. If they are another framework's interpolation (Alpine and Vue both use `{{ }}`, and a page written in a chat often does), the escape is right and the page keeps working. If they name anything about the build — `config`, a helper, a path — treat the document as hostile and tell the operator before you go further: a `{{config.…}}` inside an attribute reaches the built page, and neither `compare.mjs` nor the audit looks at attributes. Only pass `escapeExpressions: false` for a document you wrote yourself and mean kiss to compile; it is the one case where the conversion no longer reproduces its input.

### 5. Write the files where kiss expects them

`layout` → `src/layouts/`, `page` → `src/pages/`, each partial at `src/partials/<its name>` (the names already carry `site/` or `sections/`). Those are `folders.layouts`, `folders.pages` and `folders.partials`; if the project overrides them in `router.js`, follow the override.

### 6. Split the stylesheet with the **same** region names

The CSS is where the handover promise is kept or lost. Pass the region names you just chose, so the Sass partitions line up with the markup partials:

```js
// `classes`, NOT `name`. A region's `name` is what it MEANS — the thing you
// just renamed — and `sections` matches the CLASS NAMES in the selectors. On a
// page whose hero is `<section class="lede">` they differ, and passing the
// names matches nothing: every rule falls into one run and you get a single
// `_base.scss`. There is no error, because "nothing matched" and "one section,
// correctly" are indistinguishable from inside. Measured on a clean-room run:
// nine partials became one.
const sheet = splitStylesheet(css, {
  sections: regions.flatMap((r) => r.classes),
})
```

Write `sheet.entry` to `src/assets/css/site.scss` and each of `sheet.partials` beside it. kiss compiles every non-underscore `.scss` under `folders.assets` and skips `_partials`, so this builds with no config change.

Pitch the names at **page sections**, not elements. Measured: a list pitched at element granularity (`kicker`, `stars`, `field`) cut 14KB into 51 partials, several holding one rule; the same input with section names gave 19 partials and a longest line of 82 characters against the original's 1,803. `minNodes` (default 3) folds runs too short to earn a file, so you do not need to be precise — you need to be at the right altitude.

A section appearing twice gives `_hero.scss` and `_hero-2.scss`. **That is correct and you must not merge them.** The split preserves source order because CSS is cascade-ordered; gathering a section's rules from across the file reads better and silently changes what the page looks like.

### 7. Lift the assets and rewrite what pointed at them

`splitDocument` **reports** inline assets, it does not remove them — `assets.styles` and `assets.scripts` say what is worth lifting while the document stays whole. Doing the lift is yours, because it means choosing filenames:

- The `<style>` block becomes the Sass of step 6. Delete it from the layout and put `<link rel="stylesheet" href="/{{asset "css/site.css"}}">` in its place — `{{asset}}`, never a typed path, so cache busting works.
- An inline `<script>` becomes a file under `src/assets/js/`, referenced with `<script src="/{{asset "js/site.js"}}" defer></script>`.
- A `<script src>` the page already had is left alone; it is in the layout already, ahead of `{{#block "scripts"}}`.
- **Images and fonts the page links are not in the HTML.** Collect them into `src/assets/`, or the converted site builds green and renders broken. Say which ones you could not find rather than leaving a dead `src`.

### 8. Lift the content into models — the judgement half

The partials now hold both structure and words. Move the words out, one model per page: `src/models/index.json`, read in the view as `model.*`.

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

**A fact that appears more than once is not model data — it is config.** A phone number in the markup, in a WhatsApp link and in the JSON-LD belongs in `config/site.js`, spread into `new Kiss()`. That is the seam `llms.txt` § The build script describes, and duplication is what earns it, not length.

**In a partial you handed a slice, that is `{{@root.config.…}}`.** The slice replaces the context, so plain `{{config.business.phone}}` resolves to nothing and renders **empty** — no warning, no failed page, `check` still green, `links` and `audit` both clean. Nothing but reading the page catches it. Chrome partials invoked without a slice (`{{> "site/footer"}}`) still use plain `{{config.…}}`, so a converted site legitimately contains both spellings; `examples/12-from-a-single-file/src/partials/` shows each in place.

### 9. Write the build script, then the site decisions

`kiss-site-new` carries the full contract for `router.js`. **It ships from the plugin marketplace rather than in the tarball, so it may not be installed** — the same is true of `kiss-site-review` and `kiss-build-check` named below. When a skill this one points at is not there, the contract is `node_modules/kiss-ssg/llms.txt` § The build script, and `examples/12-from-a-single-file/router.js` is it as working code. Say which you used.

Five things a converted site needs that nothing else will remind you of:

- **`package.json` needs `"type": "module"`** and the four scripts (`build`, `dev`, `check`, `aikb`). `router.js` uses `import` and top-level `await`; without the module type every run prints a `MODULE_TYPELESS_PACKAGE_JSON` warning and works anyway, which is how it ships unnoticed. `npx kiss-ssg init` writes both, but step 1 only sends you there when the project has no kiss at all.
- **`title` and `description` go on `.page()`**, not in the model. A page with neither still builds, titled after its slug — a converted home page ships as `<title>Index</title>`, which nothing catches: the audit only flags an absent title, and a body comparison never looks at `<head>`.
- **`siteUrl`**, which `{{canonical}}`, `.sitemap()` and `.robots()` need. An artifact rarely states its own domain.
- **Chain `.sitemap()`, `.robots()`** and — if the page has dated content — `.feed()`.
- **If the page is replacing something already published, every old URL goes in `aliases`**, and `redirects: { format: … }` must name the host or kiss writes the host-neutral list and no host file.

Two decisions genuinely cannot be read off the code: **which host serves the site** (which sets `links: { trailingSlash: … }`) and **the site's domain** (`siteUrl`). Ask. **When there is nobody to ask — and in an agent run there usually is not — do not guess silently.** Take `trailingSlash: true` (the default, Netlify's) and the most likely domain, write a `TODO` comment on each naming it as unverified, and list both in what you report back. A guess you flagged is a question; a guess you did not is a defect with a green build on top of it.

### 10. Verify it renders the same, then say so

Build it and run the `kiss-build-check` skill (`/kiss-ssg:kiss-build-check`). Do not stop at `ok: true`: this is a conversion, so the bar is that the output **looks like the input**.

Three checks, and the first is the only one a person has to do:

- **Open the built page and the original side by side in a browser.** No gate performs this. If you are an agent and cannot, say so plainly and hand the operator the two paths — do not let the other two checks stand in for it.
- **Compare the bodies programmatically.** Copy `node_modules/kiss-ssg/examples/12-from-a-single-file/tools/compare.mjs`: it diffs element sequence and visible text, decoding entities on both sides. **Declare each difference you accept** in its `ACCEPTED` list rather than loosening the comparison — a comparison that can never fail reports nothing, and that one started out unable to fail.
- **Compare the stylesheet, and check the `<title>`.** The body comparison covers neither. Compiling the original `<style>` with `sass --style=compressed` and diffing it against the built CSS takes two minutes and is the strongest evidence you will have. The `<title>` is outside `<body>`: read it.

Take the comparison baseline **before** adding anything. `broken link:` findings are references the original typed by hand — broken before you arrived, or pointing at an asset step 7 missed. Say which. Then run `kiss-site-review` (if installed) for the launch-readiness findings; an artifact almost never has a favicon, a 404 page or an `og:image`.

Report what moved: regions found, partials written, the stylesheet's longest line before and after, and **every guess you flagged in step 9**. Those are the numbers and the caveats that show the handover promise was kept.

### 11. Record the knowledge base

Once it builds green, `npx kiss-ssg aikb router.js` writes `AIKB/` — `site-map.md`, `site-map.json`, `last-build.json` and a `README.md` explaining them, covering the pages, models, controllers and partials the build actually saw. It prints the full build report to stdout on success, which is expected rather than an error. Commit the folder. For an imported site this matters more than usual: the next person has no history to read, because the site did not exist as files until today.
