# markdown-copy.js

## Responsibility

Turns a page the build has written into its Markdown copy — the [llmstxt.org](https://llmstxt.org) convention that "pages with information that agents might need provide a clean markdown version of those pages at the same URL as the original page". It names where the copy goes and converts the HTML. It writes nothing itself: `KissPage.generate()` calls it and writes the result beside the page.

## Public interface

- `markdownCopyPath(htmlPath)` → `string|null`. The page's output path with a trailing `.html`/`.htm` swapped for `.md` (`about.html` → `about.md`, `courses/index.html` → `courses/index.md`, the spec's spelling for a directory index). Anything else — an `ext: 'json'`/`'xml'` page, an existing `.md` — is not an HTML page and gets `null`. Only the trailing extension is swapped, so a folder named `html` is left alone.
- `async toMarkdown(html, { selector = 'main' } = {})` → `Promise<string>`. Parses the HTML, takes the first element `selector` matches (or `<body>` when nothing does), removes every `script`, `style`, `nav` and `template` inside it, and converts what is left with turndown. ATX headings (`#`), fenced code blocks, `-` bullets, `_` emphasis, GFM tables. The result is trimmed and ends in exactly one newline; a page with nothing to say is `'\n'`.

## Depends on

`turndown` (the converter), `turndown-plugin-gfm` (tables, strikethrough, task lists) and `@mixmark-io/domino` (the DOM turndown parses with in Node, and the one this module selects the element from). All three are loaded on the first conversion, not at import.

## Depended on by

`lib/kiss-page.js` (`markdownCopyPath` for `markdownTo`, `toMarkdown` in `generate()`); `lib/rebuild.js` (`markdownCopyPath`, to sweep a dropped page's copy beside its HTML).

## Non-obvious behavior

- **It converts the written HTML, never the page's sources.** A page is a `.hbs` view, partials, a layout and a model, and only the rendered bytes say what a reader is shown. It also means every href in a copy is one the page itself wrote — which the broken-link scan (`lib/links.js`) has already resolved against the same folder. That is half of why the copy sits **beside** the page rather than in a tree of its own: a relative link resolves from `about/index.md` exactly as it does from `about/index.html`. The scan does not read the copies, and does not read `llms.txt`'s links to them; those are correct by construction (`markdownTo` is derived from the same `buildTo` the page writes to), not by a check.
- **Hrefs are kept, not byte-for-byte.** Turndown escapes a parenthesis in a link destination (`https://x.org/a(b)` → `https://x.org/a\(b\)`), which is the Markdown spelling of the same URL; a test that compared raw strings had to learn that.
- **`<nav>` is dropped even inside `<main>`.** A docs layout's table of contents usually sits inside its `<main>` (this repo's own docs site does), and it is the way around the site rather than the page. `<noscript>` is **kept**: an agent runs no script, so the fallback is exactly what that reader gets.
- **`selector` falls back to `<body>`, never to nothing — and so does an empty match.** A site whose layout has no `<main>` still gets the whole page; a selector that matches on some pages and not others degrades per page rather than writing empty copies. The chosen element is converted first and `<body>` is converted only when that comes out empty: a JS-rendered shell's `<main id="app">`, or content a layout writes outside its `<main>`, would otherwise give every page a `'\n'` copy that `llms.txt` still links (found by the adversarial read before the first commit, 2026-10-07).
- **An invalid selector is rethrown naming the setting.** domino's own error is `Invalid selector.`, thrown inside every page's render; `toMarkdown` rethrows it as `config.markdownCopies.selector "<value>" is not a valid CSS selector`, with the original as `cause`. `resolveMarkdownCopies` does not validate CSS at config time: domino is loaded lazily, and config resolution is synchronous.
- **The loader caches the promise**, the `loadMinifier` stance in `lib/kiss-page.js`: every page's render starts concurrently, and one shared promise means one load. `lib/kiss.js` imports this module eagerly through `KissPage`, so a process that renders nothing never pays for turndown and domino.
- **domino's specifier is a variable** (`const DOMINO = '@mixmark-io/domino'`), so `tsc --checkJs` does not resolve it: domino 2.2.0's `index.d.ts` declares an ambient module named `'domino'` rather than being a module, and the typecheck refuses the import. Recorded in `AIKB/upstream.md`.
- Per page, whether to convert at all is decided by `KissPage.markdownCopy`, which the page registry sets from the page's own resolved `config.markdownCopies` (`lib/config.js`'s `resolveMarkdownCopies`) — one page can opt out with `config: { markdownCopies: false }`.
