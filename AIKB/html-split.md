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
- `findRegions(nodes)` → `{ regions, wrappedInMain }`. Each region carries `kind`, `tag`, `name`, `classes` and `node`.
- `nameRegions(regions, names)` → the regions with caller names applied and made unique.
- `findExpressions(nodes)` → every `{{…}}` the document carries, as short excerpts.
- `splitDocument(html, { names, layoutName, pageName, escapeExpressions })` → `{ layout, page, partials, assets, regions, expressions, stats }`. Also re-exported from `lib/kiss.js`.
- The `HtmlNode`, `HtmlRegion` and `HtmlSplitResult` typedefs.

## Depends on

Nothing. No imports at all — not even `node:` builtins.

## Depended on by

`lib/kiss.js`, for the re-export only. Nothing in the build pipeline calls it; it is a tool a conversion reaches for, not a step a build runs.

## Non-obvious behavior

- **THE INVARIANT: assembling the layout, the partials and the page view through Handlebars reproduces the document that was split.** `test/unit/html-split.test.js` proves it by actually rendering them through `handlebars-layouts`, the same way `lib/kiss.js` does. Four choices keep it true, and the first two each cost something that looked like an improvement.

  It has **one stated exception**, and stating it is the point: `escapeExpressions: false` on a document containing `{{…}}` does not round-trip, because those braces are then compiled rather than reproduced. A qualified invariant is worth more than an absolute one that is wrong.

  The last two of the four, and the parse fixes under them, exist because a security review of the import branch **measured the invariant false** on five shapes before it ever claimed to be true. The claim was in this file, in `GUIDE.md`, in `llms.txt` and in the module header; the code did not keep it. The lesson is the repo's own rule applied to its own prose — a doc is a claim about the code, and "lossless" is exactly the kind of adjective nothing checks. Each of the five has a test in `test/unit/html-split.test.js` under `losslessness on shapes the first cut got wrong`, every one seen red first.

- **The layout is rebuilt by walking the body in document order**, not by emitting chrome-before, the content block, then chrome-after. A region becomes its partial call, the first section becomes `{{#block "main"}}`, and everything else is serialised where it stood. The positional shape broke three ways at once: a bootstrap `<script>` written as the body's first child was re-emitted last, so it ran after the page it set up; a `<script integrity=…>` inside `<main>` was collected by nothing at all — filtered out of the regions as an asset, invisible to the body-level script sweep — and vanished, subresource integrity and all; and a comment or stray text node between two sections was never looked at, because only elements were. Root-level nodes outside `<html>` and the `<head>`'s own attributes (`<head prefix="og: …">`) are emitted for the same reason.

- **`{{` is escaped as `\{{` by default, everywhere — text, attributes, comments and raw text alike.** What this module emits is `.hbs`, and kiss compiles `.hbs`, so braces in a foreign document are not content, they are code. Unescaped, an Alpine or Vue page — squarely the house style of "a page produced in an AI chat", the stated input — has every interpolation evaluated to empty and erased. And the same mechanism was measured carrying three things from one hostile artifact into a published page: a config dump, a tracking pixel whose query string held a secret, and a file read from outside the site. None of them is visible text or an element, so the comparison the skill prescribes reports the page identical. `\{{` is Handlebars' own escape and renders the literal `{{` the source meant. `escapeExpressions: false` opts out, for a document you wrote and intend kiss to compile; `result.expressions` reports what was found either way, because an Alpine page and a hostile one are indistinguishable at this layer and only the author knows which they have.

- **Two regions can propose the same suffixed name, and the uniquifier has to loop.** `hero`, `hero`, `hero-2` renames the second to `hero-2` — and the third, whose own base is already `hero-2`, took it again under a per-base counter. One filename, two partials, one region's markup gone. The final name goes into the set and the suffix search repeats until it is free.

- **A quote opens an attribute value only when it follows `=`.** `alt=don't` is one unquoted value; skipping to the "matching" quote ran to the end of the document, so the whole page became a single opening tag. **And a raw-text element ends only at a spec-shaped close tag** — `</script` followed by whitespace, `/` or `>`. A JS string containing `"</scriptfoo"` is not one, and treating it as one resumed scanning from inside the script and lost every element after it, silently, with a green build.

- **Attributes are stored as raw text and never re-serialised.** Quoting, ordering and spacing inside a tag survive untouched, so the round trip is byte-comparable rather than approximately right. `attr()` reads out of that text when a name or a class is needed.

- **An element is re-indented only when nothing is at stake.** With significant text among the children, or any _inline_ element child, the inner HTML is emitted verbatim on one line. The inline rule is the subtle half: `<em>a</em> <em>b</em>` reads "a b" and the indented version reads "ab", so whitespace between inline elements is content. The first version of the printer only guarded against non-empty text and silently lost that space; the round trip caught it.

- **A self-closing tag is recorded as self-closing.** Inside `<svg>` the document is foreign content, where `<path d="…"/>` is the ordinary spelling. Normalising it to `<path></path>` changes the serialisation of every icon in an artifact, and did until the round trip failed on one.

- **`<main>` is re-emitted only when the document had one.** Adding it is a semantic improvement and it also means the conversion does not give back what it was given — and once that is true of one tag nobody can trust it about the rest. A missing landmark is the agent's to raise with the author.

- **`<main>` is unwrapped when it _is_ present.** A page that wraps its content in one would otherwise have a single region, which defeats the cut; the layout emits `<main>` around the content block instead, which is where it belongs on every page rather than on this one.

- **Inline `<style>` and `<script>` are reported, not removed.** `assets.styles` and `assets.scripts` say what is worth lifting; the document keeps them. Removing them was the first shape of this and it was wrong twice: it broke the invariant, and it did so silently — the live round trip against `k9solutions.uk` lost both the page's `<script src>` tags outright. Lifting an asset is not a structural move either: it means choosing a filename, writing the file and rewriting the tag that points at it. The caller is already doing that work, because the CSS has to go through `splitStylesheet` anyway, and it is the only party that knows where the site keeps things.

- **`<script>` tags in the body go into the layout at the position they were written**, and the per-page `{{#block "scripts"}}` sits after all of them. Every page needs them, so they are furniture — which is the shape the precedent's hand-written layout arrived at independently — but _where_ in the body is the page's statement, not this module's: a bootstrap script before the content and an analytics tag after it are different pages.

- **It is not a conforming parser and does not try to be.** No implied tags, no mis-nesting repair, no invented `<tbody>`. The input it exists for is machine-written — a Claude or ChatGPT artifact, an exported page — which is well-formed and explicitly closed. A close tag for something that is not open pops nothing, so malformed input degrades into a flatter cut rather than a wrong one. Void elements and raw-text elements (`script`, `style`, `textarea`, `title`) are handled, because `<img>` treated as open swallows the rest of the document and `if (a<b)` inside a script is not a tag.

- **A region carries both what it MEANS and what its markup is called**, because two different things read them. `name` names the partial and is the one a caller renames; `classes` is the class list on the region's root element, and is what `splitStylesheet`'s `sections` matches selectors against.

  The field exists because leaving it out cost a clean-room run its stylesheet split. Every document used to tell a caller to map the regions to their **names** and pass those as `sections` — correct only while a page's class names happen to be semantic. On a page whose `hero`, `services` and `testimonials` were `.lede`, `.craft` and `.proof`, it matched nothing and collapsed nine partials into one. That spelling is now banned outright in `test/unit/skill-coverage.test.js`'s `CONTRADICTIONS`, rather than merely corrected, because it looks right and fails silently — which is also why this paragraph describes it instead of quoting it. Deriving a selector from markup is mechanical, so the engine owes it rather than leaving every caller to keep a parallel list in step by hand — which is what `examples/12-from-a-single-file/tools/convert.mjs` had been doing with two separate arrays and no explanation of why there were two.

- **Chrome is detected by tag _and_ by class.** `header`, `nav`, `footer` and `aside` are furniture; so is a `div` whose id or class matches `CHROME_HINTS` (`topbar`, `site-header`, `masthead`, …), because an agent-written page uses `<div class="site-header">` about as often as it uses `<header>`.

## Measured against the precedent

Run against the live `k9solutions.uk` home page — 21,213 bytes, minified, longest line 17,405 characters — the cut finds **11 regions**: `topbar`, `site-header` and `footer` as chrome, and `hero`, `trust-strip`, `help`, `services`, `location`, `approach`, `reviews`, `enquire` as sections. That is, allowing for the live page's class names differing from the partial filenames, the same structure the hand conversion chose: `src/partials/site/{topbar,header,footer}.hbs` and `src/partials/sections/{hero,trust-strip,problems,services,location,method,reviews,enquiry}.hbs`. The assembly round trip reproduces the page exactly.
