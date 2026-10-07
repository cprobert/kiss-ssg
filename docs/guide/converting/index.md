# Converting an existing page

Turning a page you already have — a Claude or ChatGPT artifact, an exported page, a hand-written HTML file — into a structured kiss site that still looks the same.

The other way a site starts: you already have a page. A Claude or ChatGPT artifact, a page exported from a builder, a hand-written HTML file somebody has been editing for years. It works, its look has been approved, and it has nowhere to go — no host, no history, no way for two people to change it, and nothing a web developer could take over without starting again.

kiss exports a function for turning that into a site. It does the mechanical half; the half that needs judgement stays with you, and the split between them is deliberate rather than a gap somebody will close later.

**One rule governs the whole job: convert first, improve second.** A conversion that also tidies the markup cannot be verified, because nothing can tell your improvements from your mistakes. Get to "the same page, in pieces", prove it, and then make changes as a step with its own name. Every instruction below is in that order for that reason.

## What the engine does

`splitDocument(html, options)` cuts the document into the files kiss expects:

```js
import { splitDocument } from 'kiss-ssg'

const { layout, page, partials, assets, regions, stats } = splitDocument(html)
```

-   `layout` — `<head>`, the chrome and `{{#block "main"}}`, for `folders.layouts`.
-   `partials` — one per region, named `site/<name>.hbs` for furniture (`header`, `nav`, `footer`, `aside`, or a `div` whose class says so) and `sections/<name>.hbs` for content.
-   `page` — a page view that is a list of `{{> "sections/…"}}` calls and nothing else.
-   `assets` — `{ styles, scripts }`, the inline `<style>` and `<script>` worth lifting, each with its `attrs` (and a script's `type`), because the attributes decide how — or whether — it can be lifted. **Reported, not removed**: the document you get back is whole, because lifting one means choosing a filename and rewriting the tag that pointed at it, and you are the only party who knows where the site keeps things.
-   `regions` — the named regions, and `stats` — `{ regions, chrome, sections }`.
-   `expressions` — every `{{…}}` the **source** carried. See the note below; a non-empty list is something to read, not something that failed.
-   `warnings` — what the conversion could not do losslessly and did anyway. Empty for an ordinary page. **Read it before you ship.**

**The stylesheet stays whole, and stays where it was.** Every inline `<style>` and `<script>` is still in the layout, byte for byte, where the page had it — the converted state, with nothing about how the page styles or runs changed. It is not split and not renamed `.scss`: Sass reads plain CSS differently in places — `#{` inside a string is interpolated, a string `@import` becomes a compile-time import, native nesting is flattened — and the approved look is the thing being preserved.

**What `splitDocument` guarantees is that it did not change anything.** Assembling the layout, the partials and the page view back through Handlebars reproduces the document: attributes are kept verbatim, a self-closing `<path/>` stays self-closing, no whitespace is added anywhere — a line break appears only where the page had one, and tags it wrote touching stay touching, because whether a gap between two elements shows depends on CSS the markup cannot see (a minified page therefore stays dense inside its partials; format them as a separate step if you want to), every node keeps its place in the body — a `<script>` included, so one written before the content still runs before it — and `<main>` is re-emitted only if it was there.

**`{{` in the source is escaped, and that is the one place a conversion deliberately changes a byte.** What `splitDocument` writes is `.hbs`, and kiss compiles `.hbs`, so braces in the document you hand it are not text — they are code. A page using Alpine or Vue interpolation, which is ordinary for something written in an AI chat, would have every one of them evaluated against kiss's context and erased; a page written to attack you would have them evaluated too, and `{{config…}}` in an attribute reaches the built page without appearing in any body comparison. So `{{` is emitted as `\{{`, Handlebars' own escape, which renders the literal `{{` the source meant — the page is reproduced and nothing is compiled. `result.expressions` lists what was found, because only you can say whether your page's braces were a framework or an injection. If they were yours and you want kiss to compile them, pass `escapeExpressions: false`.

**Three things, and only three, stop the round trip being exact — and two of them tell you.** `escapeExpressions: false` on a page with braces in it, which is you asking for it. A `{{` with a backslash already in front of it: Handlebars has exactly one escape and a preceding backslash eats it, so those braces are emitted as `&#123;&#123;` — the page renders the same, the bytes do not, and inside `<script>` or `<style>` neither does the text. And a node written **between two sections** — a `<nav>`, an `<aside>`, a `<script>`, a comment, stray text — which comes out after all of them, because chrome goes in the layout while sections render at a single content block, so an interleaved node has nowhere else to go. Move it above the first section or below the last if its position matters. The last two are named in `warnings`.

`parseHtml` and `findTag` are exported too, for a caller that wants to inspect a document without splitting it — `findTag(parseHtml(html), 'body')` is how you compare a conversion's output to its input.

## What you do

**Name the regions.** `splitDocument` proposes a name from each element's `id`, then its first class, then its tag, and those are markup names. A hero carrying `id="top"` so the brand link can jump to it is proposed as `top`, which says nothing about what the region is. Read the proposals, correct them, and pass them back:

```js
// By INDEX, one entry per region in the order `regions` lists them. `null`
// keeps a proposal you are happy with, and a short list leaves the rest
// proposed — so count them. Four names on a seven-region page puts the fourth
// on the fourth region, not on the one you had in mind, and nothing says so.
const named = splitDocument(html, {
  names: ['header', 'hero', 'offers', 'beans', 'visit', 'enquiry', 'footer'],
})
```

**Collect the files the page links.** Images and fonts are not in the HTML — collect them into the asset folder, or the converted site builds green and renders broken.

**Lifting the inline `<style>` and `<script>` into files is an improvement, not part of the conversion.** A move changes more than it looks like it does: merged styles land at the first one's position, so an external `<link>` that sat between them now overrides them; a `<style media="print">` merged in applies on screen; a relative `url()` resolves against `css/` instead of the page; `defer` makes an inline script run after parsing instead of where it stood; a CSP nonce stops matching. `assets.styles` and `assets.scripts` carry each block's `attrs` for the day you do it. When you do, use `{{asset}}` rather than a typed path, and verify again afterwards.

**Lift the copy into a model.** The test that settles most cases: _a person should be able to change the copy without opening a `.hbs` file._ Headings, prose, labels, prices and an image's `src`/`alt` go into `src/models/<page>.json`; elements, classes and ARIA stay in the partial; a repeated block becomes an array with one `{{#each}}` over it. Hand each partial its own slice at the call site — `{{> "sections/hero" model.hero}}` — so a section can only read what belongs to it.

The engine does not do this part and will not learn to. `hero: { kicker, heading, intro }` is semantic naming, and nothing could check a guess at it.

**A fact that appears more than once is not model data — it is config.** An address in a Visit section and again in a footer, a phone number in the markup and in a `tel:` link, a business name in the `<title>` and the brand: those go in a `config/` module spread into `new Kiss()`. Duplication is what earns that folder, not file length.

**Inside a partial you handed a model slice, that is `{{@root.config.…}}`.** Giving a partial `model.visit` as its context replaces the context, so plain `{{config.…}}` resolves to nothing and renders **empty** — no warning, no failed page, `check` still green, `links` and `audit` both clean. The only thing that catches it is reading the page. An unsliced partial (chrome invoked as `{{> "site/footer"}}`) still sees plain `{{config.…}}`, which is why both spellings appear in a converted site and why the difference is easy to miss.

Two more things belong in `router.js` rather than in the model, and the second is the quieter of the two:

-   **`siteUrl`**, which `{{canonical}}`, `.sitemap()` and `.robots()` all need. An artifact rarely carries its own domain; if you genuinely cannot establish it, say so rather than inventing one silently, because it is baked into every canonical link.
-   **`title` and `description` are page options**, set on `.page()`, not model fields. A page with neither still builds: `title` falls back to the slug, title-cased, so a converted home page ships as `<title>Index</title>`. That is plausible enough to survive review, and nothing catches it — the audit only flags an absent title, and a body-level comparison never looks at `<head>`.

## Verifying it

A conversion is finished when the built page **looks like the input**, not when it builds. Compare the two bodies by element sequence and by visible text, decoding HTML entities on both sides first — moving copy into a model means Handlebars escapes it, so an apostrophe becomes `&#x27;` in the source and an apostrophe on screen. That is escaping working; reaching for a triple-stache to make the bytes match would turn it off, which is worse than the difference it hides.

Declare any difference you accept rather than loosening the comparison until it stops reporting one. A comparison that can never fail tells you nothing, and a conversion that normalises something — an address a page spelled two ways, say — has still changed the page.

**Compare the stylesheet too, and the `<title>`.** A body comparison covers neither, and the stylesheet is where "keep what it looks like" actually lives. Compiling the original `<style>` block with `sass --style=compressed` and diffing it against the built CSS is a two-minute check that either proves the split lossless on your input or tells you it is not.

Then run `npx kiss-ssg check` (see [Checking a build](../checking/#checking-a-build)) and read the `audit` findings. An artifact almost never has a canonical link, a favicon, an `og:image` or a 404 page, and all four are worth adding — **after** the comparison came back clean.

`examples/12-from-a-single-file/` is the whole sequence as running code: the artifact it started from, the conversion script, the comparison, and the site that came out. For an agent doing this on a real page, the `kiss-site-import` skill walks the same steps.
