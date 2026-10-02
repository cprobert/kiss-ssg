# 12 — From a single file

**Copy this when you already have a page and want a site.** A Claude or ChatGPT artifact, a page exported from a builder, a hand-written HTML file somebody has been editing for years — anything that works, that the author has already approved the look of, and that has nowhere to go.

```sh
cd examples/12-from-a-single-file
node router.js
```

Builds and exits. `node router.js --dev` serves it with live reload on <http://localhost:3000> and does **not** exit — Ctrl-C to stop.

## What is here

| Path                   | What it is                                                                     |
| ---------------------- | ------------------------------------------------------------------------------ |
| `source/original.html` | The artifact, exactly as it arrived. **Committed on purpose** — see below      |
| `tools/convert.mjs`    | The conversion, run once, kept so it can be run again. Writes to `.converted/` |
| `tools/compare.mjs`    | Did the conversion change the page? Run it after a build                       |
| `src/`                 | `.converted/` after the hand pass — the site this example actually builds      |
| `config/site.js`       | The facts the artifact stated more than once                                   |

## The division of labour, which is the whole point

The engine does what can be proved and nothing else:

- **`splitDocument`** cuts the document into a layout, chrome partials and one partial per section. Assembling them back through Handlebars reproduces the input — attributes kept verbatim, `<path/>` still self-closing, no whitespace added anywhere, `<main>` re-emitted only if it was there.
- **The stylesheet is copied in whole**, as `src/assets/css/site.css`. kiss serves a `.css` asset unchanged, so the browser gets the stylesheet the artifact had. It is not split and not run through Sass: SCSS reads plain CSS differently in places, and a split stylesheet bought nothing the page needed.

Everything else is judgement, and `tools/convert.mjs` prints the list when it finishes:

- **Naming the regions.** `splitDocument` proposes a name from each element's `id`, then its first class, then its tag. Look at the hero here: it carries `id="top"` so the brand link can jump to it, so the proposal is `top` — a name that says nothing about what the region is. The names in `convert.mjs` are the hand-corrected list.
- **Lifting the copy into `src/models/index.json`.** The test that settles most cases: _a person should be able to change the copy without opening a `.hbs` file._ Three near-identical `<article>`s became one block over an array; four `.field` divs became one.
- **The `config/` seam.** Which brings us to the interesting part.

## The artifact contradicted itself, and that is the argument

`source/original.html` spells its own address two ways, 47 lines apart:

```
line 113    Unit 4, Mill Lane          ← the Visit section
line 160    Unit 4 Mill Lane           ← the footer
```

Nobody did that on purpose. It is what happens when one fact is typed in two places, and it is the reason `config/site.js` exists — the address, the email and the phone each appeared twice, and all three now have one spelling that both places read.

It also means **the conversion changed one character of the page**, and `tools/compare.mjs` reports it rather than hiding it behind a looser comparison. A conversion that silently normalises a contradiction has still changed the page, and you should know which.

## Verifying it

`node tools/compare.mjs` compares the artifact's `<body>` against the built page's, by element sequence and by visible text:

```
Element sequence: identical
Visible text: DIFFERENT
  ^ expected: the artifact contradicted itself about its own address
```

**118 elements in, 118 out, in the same order.** Entities are decoded on both sides before comparing text, because moving copy into a model means Handlebars escapes it — an apostrophe becomes `&#x27;` in the source and an apostrophe on screen. That is escaping doing its job. Reaching for a triple-stache to make the bytes match would turn it off, which is a different and much worse thing.

That check is not the build and it is not a gate. The real bar is opening both files in a browser, which nothing here can do for you.

## Convert first, improve second

The artifact had no canonical link, no favicon, no `og:image` and no 404 page — `npx kiss-ssg check router.js` named all four. They are in now, and every one was added **after** `compare.mjs` reported the structure identical, never during the conversion.

That order is not fastidiousness. A conversion that also improves the markup cannot be verified, because nothing can tell your improvements from your mistakes. Get it to "the same page, in pieces", prove it, then change things as a step with its own name.

## What this example does not do

- **It does not record a knowledge base.** `npx kiss-ssg aikb router.js` is the right next step on a real imported site — more so than usual, because the site has no history for the next person to read. Examples 9 and 11 ship a recorded `AIKB/` to look at; this one leaves it out to keep the example about the conversion.
- **It does not redirect anything.** A one-page artifact has no old URLs yet. The moment it grows a second page, `aliases` and `redirects: { format: … }` are the pair to reach for — example 11 runs them.
- **It does not wire the form up.** It posted nowhere in the artifact and it posts nowhere here. Pointing it at a host's form handler is a decision for whoever deploys it, not something a conversion should invent.

## The skill

`/kiss-ssg:kiss-site-import` walks this whole sequence against a real page, including the parts this example has already done. It is the one to run; this is the output to recognise.
