// A Markdown copy of a written page, for agents — the llmstxt.org convention:
// "pages with information that agents might need provide a clean markdown
// version of those pages at the same URL as the original page", `page.md` for
// `page.html` and `index.md` for a directory index.
//
// Converted from the HTML the build WROTE, never from the page's sources. The
// sources are a `.hbs` view, partials, a layout and a model, and only the
// rendered bytes say what a reader is actually shown; converting them also
// means every href in the copy is one the page itself wrote, which the
// broken-link scan has already checked against the same folder the copy
// lands in. That is why the copy sits BESIDE its page rather than in a tree of
// its own: a relative link resolves from `about/index.md` exactly as it does
// from `about/index.html`.
//
// The converter is turndown, with its GFM plugin for tables. Both, and the
// DOM turndown parses with in Node (domino, a direct dependency here because
// this module calls it), are loaded on first use rather than at import, the
// `loadMinifier` stance in `lib/kiss-page.js`: `lib/kiss.js` imports this
// module eagerly, and a process that renders nothing should not pay for it.

// Named through a variable so `tsc` does not resolve it: domino 2.2.0 ships an
// `index.d.ts` that declares the ambient module `'domino'`, not a module, and
// `tsc --checkJs` refuses the import outright (AIKB/upstream.md).
const DOMINO = '@mixmark-io/domino'

/** @type {Promise<{ domino: any, service: any }>|null} */
let converterLoad = null
const loadConverter = () =>
  (converterLoad ??= Promise.all([
    import(DOMINO),
    import('turndown'),
    import('turndown-plugin-gfm'),
  ]).then(([domino, turndown, gfm]) => {
    const TurndownService = turndown.default
    const service = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
      emDelimiter: '_',
    })
    service.use((gfm.default ?? gfm).gfm)
    return { domino: domino.default ?? domino, service }
  }))

// Never part of what a page says, whichever element holds the content: a
// `<nav>` is the way around the site rather than the page, and the others are
// not text a reader is shown. Dropped inside the chosen element too, because a
// docs layout's table of contents usually sits inside its `<main>`. A
// `<noscript>` is kept: an agent runs no script, so its fallback is exactly
// what that reader gets.
const DROPPED = 'script, style, nav, template'

/**
 * The Markdown copy's path for a page's output path: the trailing `.html` (or
 * `.htm`) swapped for `.md`. Anything else is not an HTML page and has no copy.
 *
 * @param {string} htmlPath a page's output path, build-relative or absolute
 * @returns {string|null}
 */
export function markdownCopyPath(htmlPath) {
  return /\.html?$/i.test(htmlPath)
    ? htmlPath.replace(/\.html?$/i, '.md')
    : null
}

/**
 * Converts a written page to Markdown: the element `selector` matches (the
 * page's `<main>` by default), or `<body>` when nothing matches or the match
 * converts to nothing, with navigation, scripts and styles removed. Every href
 * is kept as the page wrote it.
 *
 * @param {string} html the page's bytes, as written
 * @param {{ selector?: string }} [options]
 * @returns {Promise<string>} the Markdown, ending in exactly one newline
 * @throws naming `config.markdownCopies.selector` when it is not valid CSS
 */
export async function toMarkdown(html, { selector = 'main' } = {}) {
  const { domino, service } = await loadConverter()
  const document = domino.createDocument(html)
  const convert = (element) => {
    for (const dropped of element.querySelectorAll(DROPPED)) dropped.remove()
    return service.turndown(element).trim()
  }
  let chosen
  try {
    chosen = document.querySelector(selector)
  } catch (error) {
    // domino's own message is `Invalid selector.`, on every page, with no
    // word of where the selector came from.
    throw new Error(
      `config.markdownCopies.selector ${JSON.stringify(selector)} is not a valid CSS selector`,
      { cause: error },
    )
  }
  // An empty match is no better than no match: a JS-rendered shell's
  // `<main id="app">`, or content a layout writes outside its `<main>`, would
  // otherwise give every page an empty copy that `llms.txt` still links.
  const fromChosen = chosen ? convert(chosen) : ''
  if (fromChosen) return `${fromChosen}\n`
  return document.body ? `${convert(document.body)}\n` : '\n'
}
