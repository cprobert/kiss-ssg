# html-split.js

## Responsibility

Cuts a single-file HTML document into a kiss layout, a page view and one partial per region. Pure — no fs, no config, no logger, no knowledge of `Kiss`. The caller decides where the files go.

The other mechanical half of converting a single-file site; `AIKB/css-split.md` takes the stylesheet. The division of labour is the same, for the same reason: parsing, cutting and re-indenting are things a person should never do by hand, and deciding that a region is called `hero` is not. Names are an input here exactly as `sections` is there.

**What it deliberately does not produce is the model.** The precedent's `src/models/index.json` has `hero: { kicker, heading, intro, primary, secondary, image }` — semantic field names chosen by whoever did the conversion. A module that guessed at those would emit names no human would have picked, and nothing could check them. The structural cut is mechanical; lifting words into JSON is not.

## Public interface

- `parseHtml(src)` → `HtmlNode[]`. Also re-exported from `lib/kiss.js`.
- `serializeNodes(nodes, depth)` → HTML, re-indented only where that cannot change rendering.
- `attr(node, name)` → one attribute's value, read out of the raw attribute text.
- `findTag(nodes, tag)` → the first matching descendant, breadth-first, or `null`.
- `suggestName(node)` → a kebab-case name from `id`, else the first class, else the tag.
- `regionKind(node)` → `'chrome'` or `'section'`.
- `findRegions(nodes)` → `{ regions, wrappedInMain }`.
- `nameRegions(regions, names)` → the regions with caller names applied and made unique.
- `splitDocument(html, { names, layoutName, pageName })` → `{ layout, page, partials, assets, regions, stats }`. Also re-exported from `lib/kiss.js`.
- The `HtmlNode`, `HtmlRegion` and `HtmlSplitResult` typedefs.

## Depends on

Nothing. No imports at all — not even `node:` builtins.

## Depended on by

`lib/kiss.js`, for the re-export only. Nothing in the build pipeline calls it; it is a tool a conversion reaches for, not a step a build runs.

## Non-obvious behavior

- **THE INVARIANT: assembling the layout, the partials and the page view through Handlebars reproduces the document that was split.** `test/unit/html-split.test.js` proves it by actually rendering them through `handlebars-layouts`, the same way `lib/kiss.js` does. Two choices keep it true, and both cost something that looked like an improvement.

- **Attributes are stored as raw text and never re-serialised.** Quoting, ordering and spacing inside a tag survive untouched, so the round trip is byte-comparable rather than approximately right. `attr()` reads out of that text when a name or a class is needed.

- **An element is re-indented only when nothing is at stake.** With significant text among the children, or any _inline_ element child, the inner HTML is emitted verbatim on one line. The inline rule is the subtle half: `<em>a</em> <em>b</em>` reads "a b" and the indented version reads "ab", so whitespace between inline elements is content. The first version of the printer only guarded against non-empty text and silently lost that space; the round trip caught it.

- **A self-closing tag is recorded as self-closing.** Inside `<svg>` the document is foreign content, where `<path d="…"/>` is the ordinary spelling. Normalising it to `<path></path>` changes the serialisation of every icon in an artifact, and did until the round trip failed on one.

- **`<main>` is re-emitted only when the document had one.** Adding it is a semantic improvement and it also means the conversion does not give back what it was given — and once that is true of one tag nobody can trust it about the rest. A missing landmark is the agent's to raise with the author.

- **`<main>` is unwrapped when it _is_ present.** A page that wraps its content in one would otherwise have a single region, which defeats the cut; the layout emits `<main>` around the content block instead, which is where it belongs on every page rather than on this one.

- **Inline `<style>` and `<script>` are reported, not removed.** `assets.styles` and `assets.scripts` say what is worth lifting; the document keeps them. Removing them was the first shape of this and it was wrong twice: it broke the invariant, and it did so silently — the live round trip against `k9solutions.uk` lost both the page's `<script src>` tags outright. Lifting an asset is not a structural move either: it means choosing a filename, writing the file and rewriting the tag that points at it. The caller is already doing that work, because the CSS has to go through `splitStylesheet` anyway, and it is the only party that knows where the site keeps things.

- **Body-level `<script>` tags go into the layout, ahead of the `scripts` block.** Every page needs them, so they are furniture; the per-page `{{#block "scripts"}}` sits after. This is the shape the precedent's hand-written layout arrived at independently.

- **It is not a conforming parser and does not try to be.** No implied tags, no mis-nesting repair, no invented `<tbody>`. The input it exists for is machine-written — a Claude or ChatGPT artifact, an exported page — which is well-formed and explicitly closed. A close tag for something that is not open pops nothing, so malformed input degrades into a flatter cut rather than a wrong one. Void elements and raw-text elements (`script`, `style`, `textarea`, `title`) are handled, because `<img>` treated as open swallows the rest of the document and `if (a<b)` inside a script is not a tag.

- **Chrome is detected by tag _and_ by class.** `header`, `nav`, `footer` and `aside` are furniture; so is a `div` whose id or class matches `CHROME_HINTS` (`topbar`, `site-header`, `masthead`, …), because an agent-written page uses `<div class="site-header">` about as often as it uses `<header>`.

## Measured against the precedent

Run against the live `k9solutions.uk` home page — 21,213 bytes, minified, longest line 17,405 characters — the cut finds **11 regions**: `topbar`, `site-header` and `footer` as chrome, and `hero`, `trust-strip`, `help`, `services`, `location`, `approach`, `reviews`, `enquire` as sections. That is, allowing for the live page's class names differing from the partial filenames, the same structure the hand conversion chose: `src/partials/site/{topbar,header,footer}.hbs` and `src/partials/sections/{hero,trust-strip,problems,services,location,method,reviews,enquiry}.hbs`. The assembly round trip reproduces the page exactly.
