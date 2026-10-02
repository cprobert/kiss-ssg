// The mechanical half of converting a single-file site: this cuts the
// document, and leaves its inline stylesheet and scripts whole, where they
// were. The division
// of labour is the point: parsing and cutting are things a person should
// never do by hand, and deciding that a region is called `hero` is not.
// Names are an input here.
//
// What it produces is the shape the one real precedent arrived at by hand
// (`AIKB/html-split.md`): a layout holding `<head>` and the chrome, one partial
// per region, and a page view that is nothing but a list of partial calls. The
// model — which words become JSON — is deliberately NOT produced. That is the
// judgement half, and a module that guessed at it would produce field names no
// human would have chosen and that nothing could check.
//
// THE INVARIANT: assembling the layout, the partials and the page view through
// Handlebars reproduces the original document. `test/unit/html-split.test.js`
// proves it by actually rendering them. Seven choices exist to keep it true:
//
//   1. Every tag is its SOURCE TEXT and is never re-serialised, so quoting,
//      ordering, case and spacing inside a tag survive untouched — and every
//      source byte belongs to exactly one node. See `parseHtml`.
//   2. The printer never adds whitespace. A line break is written only where
//      the source had one, and tags the source wrote touching stay touching —
//      because whether whitespace between two elements renders depends on
//      their CSS `display`, which the markup cannot say. See `serializeNodes`.
//   3. The layout is rebuilt by WALKING the body in document order, so every
//      node is emitted exactly once rather than only the elements — a
//      `<script>` keeps its position relative to the content, and a comment
//      or stray text node survives instead of vanishing for not being an
//      element. Note (c) below: surviving and keeping its position are not
//      the same thing, and between two sections only the first is true.
//   4. `{{` is escaped as `\{{` by default, which renders back as a literal
//      `{{`. Without that the source's own braces are not reproduced at all:
//      they are COMPILED, which is both a data loss (an Alpine or Vue page
//      evaluates to empty) and the module's one injection surface.
//   5. `<html>`'s children are walked too, not looked up by name — the same
//      rule as 3, one level up, because reaching for `head` and `body` and
//      emitting a skeleton around them deleted everything else they sat
//      beside.
//   6. The document is tokenized by htmlparser2, which reads it the way the
//      HTML spec does: `<` opens a tag only before a letter, `/>` closes only
//      inside `<svg>` or `<math>`, and a close tag the document never wrote
//      is never written back.
//   7. Every partial call is written so Handlebars adds nothing around it —
//      see `LineWriter`.
//
// And because every review round found another surface the escape in (4)
// had missed, the output is CHECKED for live expressions before it is
// returned (`assertInert`) rather than trusted to have none.
//
// And the THREE things that make it false. They are listed because a
// qualified invariant is worth more than an absolute one that is wrong, and
// every one of them is reported rather than left to be discovered:
//
//   a. `escapeExpressions: false` on a document containing `{{…}}` — the
//      opt-out for a document you wrote and mean kiss to compile. It trades
//      the round trip away knowingly.
//   b. `{{` with a backslash already in front of it. Handlebars has exactly
//      one escape and a preceding backslash eats it, so the braces go out as
//      `&#123;&#123;`: the page renders the same, the bytes do not. Reported
//      in `warnings`.
//   c. A node written BETWEEN two sections — a `<nav>`, a `<script>`, a
//      comment, stray text — is emitted after all of them. Chrome belongs to the layout and
//      sections render at one content block, so an interleaved node has
//      nowhere else to go. Also reported in `warnings`.
//
// (c) is not a regression and never was fixed: it has done this since the
// module was written. Only its silence was fixed — a comment there used to
// be dropped outright, and the first round of fixes made it survive in the
// wrong place while the commit message said "in place".
//
// The first two choices were design. Everything after them came from two
// security reviews measuring this invariant FALSE — fourteen shapes between
// them, a `<script integrity=…>` inside `<main>` deleted outright among them,
// and four ways past the escape that the first round's own commit message
// had called complete. "Lossless" is a claim about the code, so it is written
// here as the list of things that keep it so and the list of things that do
// not, never as an adjective.

import { Parser } from 'htmlparser2'

// Raw-text elements hold text that is not markup, so whitespace in them is
// never a gap to reshape. The tokenizer knows them too; this list is only for
// marking their text `raw`.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title'])

// The elements that can be cut out as a REGION: block-level by default, every
// one. A region becomes a partial call on a line of its own, which is the one
// place this module puts a line break the source may not have had — and a
// line break beside a block box renders nothing. An ALLOWLIST, because the
// denylist it replaced (no `<span>`, no `<script>`…) was missing a member
// every review round: two `<svg>`s or two `<input>`s side by side came back
// with a gap between them (Codex review, 2026-10-01). Anything not listed —
// inline elements, replaced elements, assets, custom elements, whose default
// display is inline — stays in the layout where it was written.
const BLOCK_REGION = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'div',
  'dl',
  'fieldset',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hgroup',
  'hr',
  'main',
  'menu',
  'nav',
  'ol',
  'p',
  'pre',
  'search',
  'section',
  'table',
  'ul',
])

// A region whose tag is one of these is page furniture rather than content —
// the part that belongs in the layout and is shared by every page, not in the
// page view. `main` is listed because it is unwrapped rather than kept.
const CHROME_TAGS = new Set(['header', 'nav', 'footer', 'aside'])

// …and so is a `div` whose id or class says so. An agent-written page uses
// `<div class="site-header">` about as often as it uses `<header>`.
//
// Matched against WHOLE id and class tokens, never with `\b`. `\b` treats `-`
// as a boundary, so `hero-banner`, `cta-banner`, `page-header`, `card-header`
// and `nav-tabs` all read as chrome and were moved into the layout — every
// page then rendered this page's hero. A chrome word is chrome when it is the
// whole token, or the whole token behind a site-wide prefix. Bare `banner` is
// not on the list: it is as often a promotion as a masthead, and the masthead
// says so unambiguously with `role="banner"`, which is read below.
const CHROME_HINTS =
  /^((site|main|global|primary|top)-?)?(header|footer|topbar|navbar|nav|navigation|masthead)$/i
const CHROME_ROLES = new Set(['banner', 'navigation', 'contentinfo'])

/**
 * Whether an element can be cut out as a region at all — see `BLOCK_REGION`.
 *
 * @param {HtmlNode} node
 * @returns {boolean}
 */
const canBeRegion = (node) =>
  node.type === 'element' && BLOCK_REGION.has(node.tag)

/**
 * @typedef {Object} HtmlNode
 * @property {'element'|'text'|'comment'|'doctype'} type
 * @property {string} [tag] lower-cased tag name — what every decision keys on
 * @property {string} [name] the tag name AS WRITTEN, present only when it differs
 * from `tag`. Case matters inside `<svg>`: `<linearGradient>` is not
 * `<lineargradient>`
 * @property {string} [open] the opening tag exactly as the source wrote it,
 * `<` to `>` — empty for an element a stray close tag implied
 * @property {string} [close] the closing tag exactly as written, or empty when
 * the source wrote none: a void element, a self-closed one inside `<svg>`, or
 * one closed by its parent or by the end of the document
 * @property {Record<string, string>} [attribs] the attributes, as the parser
 * read them — names lower-cased, values undecoded. Read with `attr()`; never
 * printed, because `open` is
 * @property {HtmlNode[]} [children]
 * @property {string} [text] text, comment or doctype source, exactly as written
 * @property {boolean} [raw] set on text inside a raw-text element, where it is
 * not markup and whitespace is never a gap
 */

/**
 * @typedef {Object} HtmlRegion
 * @property {'chrome'|'section'} kind where the region belongs — the layout, or the page
 * @property {string} tag
 * @property {string} name the proposed partial name
 * @property {HtmlNode} node
 */

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parses an HTML document or fragment into a node tree.
 *
 * THE TOKENIZER IS htmlparser2's, AND THE TREE IS MADE OF SOURCE SLICES. Until
 * 2026-10-02 this was a hand-rolled scanner, and roughly half of what five
 * review rounds found was that scanner's reading of HTML differing from a
 * browser's: a `<` before a non-letter, `/>` on an HTML element, an apostrophe
 * in an unquoted value, attributes read by a regex that matched text inside
 * another attribute's quotes. htmlparser2 is a maintained tokenizer that
 * reads those the way the HTML spec does, and — unlike parse5 — never adds an
 * `<html>`, `<body>` or `<tbody>` the page did not write, which is what a
 * conversion that gives back what it was given needs. Recorded in
 * `AIKB/upstream.md`.
 *
 * Two choices make the tree lossless whatever the tokenizer decides:
 *
 *   1. Every tag is kept as the exact source text that spelled it (`open`,
 *      `close`), and printed from there. Quoting, attribute order, case, a
 *      trailing `/`, a malformed close tag — all of it is the source's own
 *      bytes, never re-serialised.
 *   2. Any source the tokenizer reports no event for is kept as text. It does
 *      drop malformed input silently — `</ x>`, a trailing unfinished `<b` —
 *      so every gap between two events is filled from the source. Each byte of
 *      the document belongs to exactly one node, by construction.
 *
 * What the tokenizer still decides is the STRUCTURE: which element a node
 * sits in. It closes a `<p>` at the next `<div>` and an `<li>` at the next
 * `<li>`, as a browser does; such an element simply has no `close`.
 *
 * @param {string} src
 * @returns {HtmlNode[]}
 */
export function parseHtml(src) {
  /** @type {HtmlNode[]} */
  const root = []
  /** @type {HtmlNode[]} the open elements, innermost last */
  const open = []
  let cursor = 0
  const children = () =>
    open.length === 0 ? root : (open[open.length - 1].children ?? [])

  // ADJACENT TEXT IS ONE NODE. A dropped stray close tag used to leave the
  // text either side of it as two siblings, and the printer joins siblings
  // with nothing — so `Pricing{</span>{sass '…'}}` came back out as a live
  // `{{sass '…'}}`, assembled out of two halves that were each harmless, with
  // `findExpressions` reporting an empty list. Merging on the way in means the
  // escape sees the braces the output will have.
  const pushText = (text) => {
    if (!text) return
    const list = children()
    const parent = open[open.length - 1]
    const raw = Boolean(parent && RAW_TEXT.has(parent.tag ?? ''))
    const last = list[list.length - 1]
    if (last && last.type === 'text' && Boolean(last.raw) === raw)
      last.text += text
    else list.push({ type: 'text', text, ...(raw ? { raw: true } : {}) })
  }
  /** Keeps whatever source lies between the last event and `upTo` as text. */
  const fill = (upTo) => {
    if (upTo > cursor) pushText(src.slice(cursor, upTo))
    cursor = Math.max(cursor, upTo)
  }
  /** The source of the current event, and the cursor moved past it. */
  const take = () => {
    fill(parser.startIndex)
    const text = src.slice(parser.startIndex, parser.endIndex + 1)
    cursor = Math.max(cursor, parser.endIndex + 1)
    return text
  }

  const parser = new Parser(
    {
      onopentag(tag, attribs, implied) {
        // An implied open is a stray close tag (`</p>` with nothing open)
        // that a browser turns into an empty element. Its only source is the
        // close tag, which `onclosetag` takes next.
        const text = implied ? '' : take()
        const written = /^<([^\s/>]*)/.exec(text)?.[1] ?? tag
        /** @type {HtmlNode} */
        const node = {
          type: 'element',
          tag,
          ...(written !== tag && written ? { name: written } : {}),
          open: text,
          close: '',
          attribs,
          children: [],
        }
        children().push(node)
        open.push(node)
      },
      onclosetag(_tag, implied) {
        // Implied: a void element, one self-closed inside `<svg>`, or one a
        // later tag or the end of the document closed. The source wrote no
        // close tag, so the node has none.
        //
        // The fill comes BEFORE the pop. Source the tokenizer reported
        // nothing for — a stray `</span>` — sits inside the element being
        // closed, and filling after the pop moved it outside: the corpus
        // caught `<body>x</span></body>` coming back as `…</body></span>`.
        const text = implied ? '' : take()
        const node = open.pop()
        if (node && !implied) node.close = text
      },
      ontext() {
        pushText(take())
      },
      oncomment() {
        const text = take()
        children().push({ type: 'comment', text })
      },
      onprocessinginstruction() {
        const text = take()
        children().push({ type: 'doctype', text })
      },
    },
    {
      decodeEntities: false,
      // Lower-cased so the tokenizer recognises `<IMG>` as void and
      // `<SCRIPT>` as raw text — with case kept it did neither, and nested a
      // `<P>` inside an `<IMG>`. The spelling survives in `open` and `close`.
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
    },
  )
  parser.write(src)
  parser.end()
  fill(src.length)
  return root
}

/**
 * The value of one attribute on a node, as the parser read it — so a
 * `class='site-header'` written INSIDE another attribute's quoted value is
 * text, not an attribute. The regex this replaced matched it, and classed a
 * hero as page furniture (Codex review, 2026-10-02).
 *
 * @param {HtmlNode} node
 * @param {string} name
 * @returns {string} empty when absent
 */
export function attr(node, name) {
  return node.attribs?.[name.toLowerCase()] ?? ''
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

/**
 * The tag name to WRITE — the document's own spelling where it had one.
 *
 * @param {HtmlNode} node
 * @returns {string}
 */
const tagName = (node) => node.name ?? node.tag

/**
 * A node named the way a warning should name it — short, and recognisable in
 * the source document.
 *
 * @param {HtmlNode} node
 * @returns {string}
 */
const describeNode = (node) =>
  node.type === 'element'
    ? `<${tagName(node)}>`
    : node.type === 'comment'
      ? 'a comment'
      : 'stray text'

/**
 * A whitespace-only text node — the only thing the printer is free to
 * reshape, and only into other whitespace.
 *
 * @param {HtmlNode} node
 * @returns {boolean}
 */
const isGap = (node) =>
  node.type === 'text' && !node.raw && HTML_WHITESPACE_ONLY.test(node.text)

// HTML's whitespace is space, tab, LF, FF and CR — and nothing else. `trim()`
// also strips U+00A0, which is CONTENT in HTML: a non-breaking space beside a
// line break was read as a disposable gap and reshaped into a plain newline,
// changing the spacing and where the line may wrap (Codex review, 2026-10-02).
const HTML_WHITESPACE_ONLY = /^[ \t\n\f\r]*$/

// Elements whose own whitespace renders, so even a gap inside them is
// emitted exactly. `<pre>   \n   </pre>` lost its whitespace and
// `<text><tspan>A</tspan><tspan>B</tspan></text>` rendered "A B" before this
// existed (Codex review, 2026-10-01). `text`, `tspan` and `textpath` are
// SVG's text elements, lower-cased the way `tag` is.
const PRESERVES_WHITESPACE = new Set([
  'pre',
  'listing',
  'xmp',
  'plaintext',
  'text',
  'tspan',
  'textpath',
])

/**
 * Whether whitespace inside this element renders. The tag decides it, or an
 * inline `style` that says so. A class whose stylesheet sets `white-space`
 * cannot be seen from the markup — a stated limit, in `AIKB/html-split.md`.
 *
 * @param {HtmlNode|null|undefined} node
 * @returns {boolean}
 */
const keepsWhitespace = (node) =>
  Boolean(node) &&
  (PRESERVES_WHITESPACE.has(node.tag) ||
    /white-space(-collapse)?\s*:\s*(pre|break-spaces|preserve)/i.test(
      attr(node, 'style'),
    ))

// `{{` in a source document becomes LIVE TEMPLATE SYNTAX, because what this
// module emits is `.hbs` and kiss compiles `.hbs`. A security review measured
// three things reaching a published page from one hostile artifact:
// `{{stringify config}}` dumping the whole resolved config; a tracking-pixel
// `<img src="…?k={{config.secrets.apiKey}}">` putting a secret on the wire for
// every visitor; and `{{sass '/abs/path'}}` inlining a file from outside the
// site. None of those is visible text or an element, so the comparison tool
// the skill prescribes reports the page identical.
//
// It also breaks honest input. `{{ }}` is Alpine.js and Vue interpolation,
// which is squarely the house style of "a page produced in an AI chat" — the
// stated input. Unescaped, every one evaluates to empty and is erased.
//
// So escaping is the default and the opt-out is explicit. `\{{` is Handlebars'
// own escape and renders a literal `{{`, which is what the source meant.
//
// A BACKSLASH ALREADY IN THE SOURCE DEFEATS `\{{`, and nothing else can be
// put in its place. A bare `.replace(/\{\{/g, '\\{{')` turns a source `\{{x}}`
// into `\\{{x}}`, which Handlebars evaluates — so one backslash walked
// straight through the guard; measured, `k=\{{config.secrets.apiKey}}` in an
// `<img src>` rendered the live key.
//
// Doubling the run does not fix it. Handlebars' rule, measured across runs of
// 0–5: exactly ONE backslash escapes, and N ≥ 2 emits N−1 backslashes and
// evaluates anyway. So there is no sequence of backslashes that yields "a
// literal run followed by a literal `{{`", and `\{\{` is not an escape either
// — it renders as written.
//
// The braces therefore go out as a character reference when anything precedes
// them that would eat the escape. `&#123;&#123;` is inert to Handlebars by
// construction: there are no braces left for it to see. A browser renders it
// as `{{`, so the page still says what the source said, and `compare.mjs`
// decodes entities on both sides, so the conversion still verifies.
//
// What it costs is byte-fidelity on that one sequence, and in `<script>` or
// `<style>` — where a character reference is not decoded — it also changes
// the text. That is the right trade and not a close one: `\{{` is not a shape
// honest Alpine, Vue or JavaScript produces, and the alternative is emitting
// an executable template expression built out of somebody else's document.
// `splitDocument` reports every occurrence in `warnings` rather than letting
// it pass unremarked.
const BRACE_ENTITY = '&#123;&#123;'
const escapeExpr = (text) =>
  text.replace(/(\\*)\{\{/g, (_, slashes) =>
    slashes === '' ? '\\{{' : `${slashes}${BRACE_ENTITY}`,
  )
const emit = (text, options) =>
  options.escapeExpressions === false ? text : escapeExpr(text)

/**
 * Renders nodes back to HTML.
 *
 * THE PRINTER NEVER ADDS WHITESPACE. A line break and indent are written only
 * where the source already had whitespace between two nodes; where it had
 * none, the nodes stay touching on one line. Collapsible whitespace renders
 * the same however much of it there is, so swapping one run of it for a
 * newline and an indent cannot change the page — but putting whitespace
 * where there was none can, for any element CSS makes inline-level, and the
 * markup cannot say which those are. Every earlier rule here tried to say:
 * "re-indent unless the children are inline", with a list of inline elements
 * that each review round found incomplete (`<svg>`, `<input>`, SVG `<text>`,
 * an inline-block `<li>` nobody had flagged yet). The operator chose
 * construction over the list (2026-10-01).
 *
 * Text is emitted exactly as written, and so is everything inside an element
 * whose whitespace renders (`keepsWhitespace`) — there even a gap is content.
 *
 * What it costs: a minified source stays dense. Its structure is still cut
 * into a layout, partials and a page view; inside a partial, a formatter is
 * the caller's deliberate, separate step.
 *
 * @param {HtmlNode[]} nodes
 * @param {number} [depth]
 * @param {{ escapeExpressions?: boolean }} [options] `escapeExpressions`
 * defaults to **true**: `{{` is rewritten as `\{{` everywhere it is emitted —
 * text, attributes, comments and raw text alike, because Handlebars compiles
 * the whole file. Pass `false` only for a document you wrote and intend to
 * carry template syntax.
 * @returns {string} the first line indented to `depth`
 */
export function serializeNodes(nodes, depth = 0, options = {}) {
  const { text } = printStream(nodes, depth, options)
  return text === '' ? '' : '  '.repeat(depth) + text
}

/**
 * A source gap, reshaped. One that held a line break becomes a line break and
 * this module's indent — the source's own formatting, normalised. One that
 * held only spaces is kept exactly: it is almost always the space between two
 * words or two inline elements, and moving it onto a new line would render
 * the same and read worse. Minified input has no line breaks, so it is never
 * re-indented at all.
 *
 * @param {string} gap the whitespace the source had
 * @param {string} pad the indent for the line that follows
 * @returns {string}
 */
const reshape = (gap, pad) => (gap.includes('\n') ? `\n${pad}` : gap)

/**
 * A run of siblings, broken onto new lines only at the source's own gaps.
 *
 * @param {HtmlNode[]} nodes
 * @param {number} depth
 * @param {{ escapeExpressions?: boolean }} options
 * @returns {{ text: string, lead: string, trail: string }} `text` has no
 * indent on its first line; `lead` and `trail` are the gaps the run began and
 * ended with (`''` for none), which the enclosing element reshapes
 */
function printStream(nodes, depth, options) {
  const pad = '  '.repeat(depth)
  let text = ''
  let gap = ''
  for (const node of nodes) {
    if (isGap(node)) {
      gap = node.text
      continue
    }
    const piece = printNode(node, depth, options)
    text += text === '' ? piece : reshape(gap, pad) + piece
    gap = ''
  }
  const first = nodes[0]
  const last = nodes[nodes.length - 1]
  return {
    text,
    lead: first && isGap(first) ? first.text : '',
    trail: last && isGap(last) ? last.text : '',
  }
}

/**
 * One node, with no indent on its first line.
 *
 * @param {HtmlNode} node
 * @param {number} depth
 * @param {{ escapeExpressions?: boolean }} options
 * @returns {string}
 */
function printNode(node, depth, options) {
  if (node.type !== 'element') return emit(node.text, options)
  // A void or self-closed element has no children and no `close`, so the
  // general case below prints it as its opening tag alone.
  const openTag = openingTag(node, options)
  const closeTag = closingTag(node, options)
  const children = node.children ?? []
  if (keepsWhitespace(node))
    return `${openTag}${serializeInline(children, options)}${closeTag}`
  const inner = printStream(children, depth + 1, options)
  // Nothing but a gap: one gap, reshaped to sit before the close tag.
  if (inner.text === '')
    return `${openTag}${reshape(inner.lead, '  '.repeat(depth))}${closeTag}`
  const lead = reshape(inner.lead, '  '.repeat(depth + 1))
  const trail = reshape(inner.trail, '  '.repeat(depth))
  return `${openTag}${lead}${inner.text}${trail}${closeTag}`
}

/**
 * Children emitted with no whitespace added or removed — the verbatim path.
 *
 * @param {HtmlNode[]} nodes
 * @param {{ escapeExpressions?: boolean }} [options]
 * @returns {string}
 */
function serializeInline(nodes, options = {}) {
  return nodes
    .map((node) => {
      if (node.type === 'text') return emit(node.text, options)
      if (node.type === 'comment' || node.type === 'doctype')
        return emit(node.text, options)
      return `${openingTag(node, options)}${serializeInline(node.children ?? [], options)}${closingTag(node, options)}`
    })
    .join('')
}

// THE WHOLE TAG GOES THROUGH THE ESCAPE, NAME INCLUDED. A tag name can hold
// braces — `<x{{stringify config}}>` is a legal start tag — and the name was
// once written raw beside escaped attributes, emitting a live expression with
// `expressions` reporting nothing. A tag is now its source text, escaped
// whole, which also covers the split form `<x{{lookup config 'k'}}>`.

/**
 * @param {HtmlNode} node
 * @param {{ escapeExpressions?: boolean }} [options]
 * @returns {string} the opening tag exactly as the source wrote it
 */
const openingTag = (node, options = {}) => emit(node.open ?? '', options)

/**
 * @param {HtmlNode} node
 * @param {{ escapeExpressions?: boolean }} [options]
 * @returns {string} the close tag as written, or nothing when there was none
 */
const closingTag = (node, options = {}) => emit(node.close ?? '', options)

/**
 * Every `{{…}}` the source document carries, as short excerpts. Reported on
 * the split so a caller cannot escape them without being told they were there
 * — an Alpine page and a hostile one look identical at this layer, and only
 * the author knows which they have.
 *
 * @param {HtmlNode[]} nodes
 * @returns {string[]}
 */
export function findExpressions(nodes) {
  const found = []
  const scan = (text) => {
    for (const m of String(text ?? '').matchAll(/\{\{[^}]{0,80}\}?\}?/g))
      found.push(m[0].replace(/\s+/g, ' ').trim())
  }
  const walk = (list) => {
    for (const node of list) {
      // The name too: it can hold braces, and it is emitted.
      if (node.type === 'element') scan(`${node.open ?? ''}${node.close ?? ''}`)
      else scan(node.text)
      if (node.children) walk(node.children)
    }
  }
  walk(nodes)
  return found
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

const elementsOf = (nodes) => nodes.filter((n) => n.type === 'element')

/**
 * Finds a descendant element by tag, breadth-first.
 *
 * @param {HtmlNode[]} nodes
 * @param {string} tag
 * @returns {HtmlNode|null}
 */
export function findTag(nodes, tag) {
  const queue = [...nodes]
  while (queue.length) {
    const node = queue.shift()
    if (node.type === 'element' && node.tag === tag) return node
    if (node.children) queue.push(...node.children)
  }
  return null
}

/**
 * A kebab-case partial name for a region: its `id`, else its first class, else
 * its tag. The proposal is what a caller renames rather than what it must
 * accept — `nameRegions` is exported so a skill can read the suggestions,
 * correct the ones that read like markup rather than meaning, and hand them
 * back through `splitDocument`'s `names`.
 *
 * @param {HtmlNode} node
 * @returns {string}
 */
export function suggestName(node) {
  const id = attr(node, 'id')
  if (id) return toName(id)
  const first = attr(node, 'class').trim().split(/\s+/)[0]
  if (first) return toName(first)
  return node.tag
}

const toName = (value) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'section'

/**
 * Whether a region is page furniture (goes in the layout) or content (goes in
 * the page view).
 *
 * @param {HtmlNode} node
 * @returns {'chrome'|'section'}
 */
export function regionKind(node) {
  if (CHROME_TAGS.has(node.tag)) return 'chrome'
  if (CHROME_ROLES.has(attr(node, 'role').trim().toLowerCase())) return 'chrome'
  const tokens = `${attr(node, 'id')} ${attr(node, 'class')}`
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.some((t) => CHROME_HINTS.test(t))) return 'chrome'
  return 'section'
}

/**
 * The body's top-level regions, in order.
 *
 * `<main>` is unwrapped rather than kept as one region: a page that wraps its
 * content in `<main>` has exactly one region otherwise, which is the whole
 * point of the cut defeated. The layout emits `<main>` around the content block
 * instead, which is where it belongs on every page rather than on this one.
 *
 * @param {HtmlNode[]} nodes a parsed document
 * @returns {{ regions: HtmlRegion[], wrappedInMain: boolean, container:
 * HtmlNode[], main: HtmlNode|undefined, body: HtmlNode|null }} `container` is
 * the stream the body's children stand in (see `bodyNodesOf`) and `main` is
 * the single `<main>` that was unwrapped, if there was exactly one. Both are
 * returned rather than recomputed by the caller: `splitDocument` has to walk
 * the same stream and unwrap the same element, and deriving them twice is how
 * a `<script>` inside `<main>` came to be deleted.
 */
export function findRegions(nodes) {
  const body = findTag(nodes, 'body')
  const container = bodyNodesOf(nodes)
  const top = elementsOf(container)
  // Unwrapped only when there is EXACTLY ONE. With two, the first was
  // unwrapped and the second became an ordinary region — which renders at the
  // content block, i.e. *inside* the `<main>` the layout rebuilt around it.
  // Measured: `<main>A</main><main>B</main>` came back as one `<main>` with
  // the other nested in it. Two is already a malformed document; nesting them
  // is this module's own invention on top of it.
  //
  // And only when every section is INSIDE it. Sections render at one content
  // block, so unwrapping `<main>` while another section sat beside it moved
  // sections across the boundary: `<section>Before</section><main>…</main>`
  // came back with both before an empty `<main>`, and the reverse pulled an
  // outside section into it — a different landmark and a different
  // `main > section`, with no warning. Then `<main>` stays whole as a region of
  // its own: a coarser cut, but one that changes nothing.
  //
  // And never when its own whitespace renders (`white-space: pre` on it):
  // unwrapping puts its tags and its regions on lines of their own, and under
  // `pre` those line breaks are text (Codex review, 2026-10-01). Kept whole,
  // it is printed exactly.
  const mains = top.filter((n) => n.tag === 'main')
  const sectionOutside = top.some(
    (n) => n.tag !== 'main' && canBeRegion(n) && regionKind(n) === 'section',
  )
  const main =
    mains.length === 1 && !sectionOutside && !keepsWhitespace(mains[0])
      ? mains[0]
      : undefined
  const expanded = main
    ? top.flatMap((n) => (n === main ? elementsOf(n.children ?? []) : n))
    : top
  const regions = expanded
    // Only block-level content is a region — see `BLOCK_REGION`. A `<script>`
    // or `<style>` is an asset, reported in `assets` and left in the layout
    // where it was written; a top-level `<style>` used to become
    // `sections/style.hbs`. `<head>` reaches this list only in the
    // no-`<body>` case, where the document's own children stand in for the
    // body's.
    .filter(canBeRegion)
    .map((node) => ({
      kind: regionKind(node),
      tag: node.tag,
      name: suggestName(node),
      node,
    }))
  // `container` and `main` are returned, not just derived, because
  // `splitDocument` has to walk the SAME stream and unwrap the SAME element.
  // Computing them twice is how a `<script>` inside `<main>` got deleted:
  // two functions each had their own idea of what the body's children were.
  return { regions, wrappedInMain: Boolean(main), container, main, body }
}

/**
 * The nodes that stand for the body's children.
 *
 * `<body>` is optional in HTML and `parseHtml` does not imply one, so a
 * document can put its content straight inside `<html>` — or, as a fragment,
 * at the top level. Reaching for `findTag(nodes, 'body')` and falling back to
 * the document root broke both: with no `<body>`, the root's only element is
 * `<html>` itself, so the whole document became a single region and the
 * layout wrapped a second copy of it (doctype included) inside a synthesised
 * `<body>`. Falling through `<html>` instead is what a browser does.
 *
 * @param {HtmlNode[]} nodes a parsed document
 * @returns {HtmlNode[]}
 */
export function bodyNodesOf(nodes) {
  const body = findTag(nodes, 'body')
  if (body) return body.children ?? []
  const htmlEl = findTag(nodes, 'html')
  const head = findTag(nodes, 'head')
  const level = htmlEl ? (htmlEl.children ?? []) : nodes
  // Only what comes AFTER the head stands in for the body. Whitespace or a
  // comment before `<head>` belongs before it; counting it as body content
  // placed the whole body ahead of the head, moving the head's scripts after
  // the content (Codex review, 2026-10-02).
  const at = head ? level.indexOf(head) : -1
  return level.slice(at + 1).filter((n) => n !== head && n.type !== 'doctype')
}

/**
 * Applies caller-supplied names over the proposals, and makes the result
 * unique — two `<section class="band">` elements would otherwise overwrite one
 * partial with the other.
 *
 * @param {HtmlRegion[]} regions
 * @param {(string|null)[]|Record<number, string>} [names] by index; `null` or a
 * missing entry keeps the proposal
 * @returns {HtmlRegion[]}
 */
export function nameRegions(regions, names = []) {
  // The FINAL name is what goes in the set, and the suffix search loops. A
  // per-base counter is not enough: `hero`, `hero`, `hero-2` gives the second
  // region the name `hero-2`, and the third — whose own base is already
  // `hero-2` — gets it again, because nothing had recorded that the suffixed
  // spelling was taken. Both are written to `sections/hero-2.hbs`, the page
  // view calls that partial twice, and one region's markup is gone.
  const seen = new Set()
  return regions.map((region, index) => {
    const base = toName(names[index] || region.name)
    let name = base
    let n = 1
    while (seen.has(name)) {
      n += 1
      name = `${base}-${n}`
    }
    seen.add(name)
    return { ...region, name }
  })
}

// ---------------------------------------------------------------------------
// The split
// ---------------------------------------------------------------------------

/**
 * Writes the layout's body and the page view's content block: a stream of
 * pieces that puts whitespace only where the source had it.
 *
 * Two kinds of piece. Plain markup is written at its indent when it starts a
 * line, or straight after what came before when the source had no gap. A
 * PARTIAL CALL is written so Handlebars adds nothing around it, which takes
 * two rules, both about Handlebars' handling of a call standing alone on a
 * line (`AIKB/upstream.md`):
 *
 *   - a call that starts a line is written at column 0, because a standalone
 *     call indents every line of the partial by its own indentation — two
 *     spaces in every line of a multi-line `<pre>`;
 *   - a line break after a call is written twice, because a standalone call
 *     swallows its own line's newline. When the call is not standalone the
 *     second is merely one more line break where the source had one, which
 *     renders the same.
 *
 * A gap with a line break in it becomes a line break; a gap of spaces is
 * kept exactly; no gap is no whitespace. That is the printer's rule
 * (`reshape`), applied across region boundaries too.
 *
 * And the source's own characters must not combine with the generated `{{`
 * and `}}` into different template syntax (Codex review, 2026-10-02):
 *
 *   - a backslash run before generated syntax would escape it, so one more
 *     backslash is written — Handlebars emits N−1 of N ≥ 2 and still
 *     evaluates, so the page gets the source's own run back exactly;
 *   - a `{` before it would make `{{{`, and a `}` after it `}}}`. No
 *     Handlebars spelling puts a raw brace there — the lexer always reads a
 *     triple — so that one character is written as its character reference,
 *     `&#123;` or `&#125;`. It is body-level text by construction (only text
 *     can touch a region), where a character reference renders the same. The
 *     bytes differ by that one character; it is the one place they do.
 */
class LineWriter {
  constructor() {
    this.out = ''
    this.pending = ''
    this.lastWasCall = false
    this.lastWasGenerated = false
  }

  /** @param {string} text whitespace the source had here */
  gap(text) {
    this.pending += text
  }

  /** @param {string} text @param {string} pad its indent, when it starts a line */
  piece(text, pad) {
    this.write(text, pad, 'markup')
    this.lastWasCall = false
    this.lastWasGenerated = false
  }

  /** @param {string} text a block helper this module writes, like the content block */
  block(text, pad) {
    this.write(text, pad, 'block')
    this.lastWasCall = false
    this.lastWasGenerated = true
  }

  /** @param {string} text a partial call — never indented */
  call(text) {
    this.write(text, '', 'call')
    this.lastWasCall = true
    this.lastWasGenerated = true
  }

  /**
   * @param {string} text
   * @param {string} pad
   * @param {'markup'|'block'|'call'} kind
   */
  write(text, pad, kind) {
    const isCall = kind === 'call'
    if (this.out === '') this.out = pad
    else if (this.pending.includes('\n'))
      this.out += `${this.lastWasCall ? '\n\n' : '\n'}${isCall ? '' : pad}`
    else this.out += this.pending
    if (kind !== 'markup') {
      // The escape's own `\{{` (a source `{{`) is the case to take first:
      // replacing only its last brace left `\{&#123;`, and a backslash not
      // followed by `{{` is printed — the page gained a `\` (the corpus,
      // round 6). Both braces become references and the escape goes.
      if (/\\\{\{$/.test(this.out))
        this.out = this.out.replace(/\\\{\{$/, '&#123;&#123;')
      else if (/\\$/.test(this.out)) this.out += '\\'
      else this.out = this.out.replace(/\{$/, '&#123;')
    } else if (this.lastWasGenerated) {
      text = text.replace(/^\}/, '&#125;')
    }
    // The source's line break can also arrive INSIDE a text node rather than
    // as a gap of its own — `"\n    text"` after a call, `"text\n    "`
    // before one. The first leaves the call alone on its line, and its
    // newline is swallowed; the second indents it. So a call never follows
    // spaces at the start of a line (they go — the line break before them
    // renders the same without them), and a text starting with a line break
    // after a call gets the extra one.
    if (isCall) this.out = this.out.replace(/\n[ \t]+$/, '\n')
    else if (this.lastWasCall && /^[ \t]*\r?\n/.test(text)) this.out += '\n'
    this.out += text
    this.pending = ''
  }

  /** @returns {string} */
  text() {
    return this.out
  }
}

// The `{{…}}` this module writes itself: partial calls (names are already
// through `toName`, so `[a-z0-9-]`) and the two blocks the layout declares.
const OWN_EXPRESSIONS =
  /\{\{> "(site|sections)\/[a-z0-9-]+"\}\}|\{\{#block "(main|scripts)"\}\}\{\{\/block\}\}/g

/**
 * The last line of defence, checked on the OUTPUT rather than trusted from
 * the code that produced it. Every review round of this module found another
 * way a `{{` from the source reached a `.hbs` file live, each one a surface
 * the escape had not been applied to — the container tags, the doctype, a
 * backslash, two text nodes joining, a tag name. Every one was silent. This
 * makes the next one a
 * thrown error instead: with the module's own expressions removed, every `{{`
 * left must be preceded by exactly one backslash, which is the only shape
 * Handlebars does not evaluate.
 *
 * @param {string} text
 * @param {string} where
 */
function assertInert(text, where) {
  const rest = text.replace(OWN_EXPRESSIONS, '')
  for (const m of rest.matchAll(/(\\*)\{\{/g))
    if (m[1].length !== 1)
      throw new Error(
        `html-split: ${where} would carry a live template expression near "${rest.slice(m.index, m.index + 40)}". This is a bug in lib/html-split.js — the escape missed a surface. Nothing was written.`,
      )
}

/**
 * @typedef {Object} HtmlSplitResult
 * @property {{ name: string, content: string }} layout
 * @property {{ name: string, content: string }} page
 * @property {{ name: string, content: string }[]} partials paths relative to `folders.partials`
 * @property {{ styles: { attrs: string, content: string }[], scripts: { attrs: string, type: string, content: string }[] }} assets
 * every inline `<style>` with its raw attribute text — one with any attribute
 * (`media`, `title`, `nonce`, `type`) is conditional and is not merged into an
 * unconditional stylesheet — and every src-less `<script>` with its raw
 * attribute text and its lower-cased `type` (`''` for a classic script):
 * `module`, `application/ld+json` and `importmap` are not lifted the same way
 * @property {HtmlRegion[]} regions the named regions, for a caller that wants to report them
 * @property {string[]} warnings things the conversion could not do losslessly
 * and did anyway, each a whole sentence. Empty for every ordinary document;
 * non-empty means read it before shipping
 * @property {string[]} expressions every `{{…}}` the SOURCE document carried, as
 * excerpts — see `findExpressions`. Non-empty means the input contains template
 * syntax, which is either another framework's interpolation or an injection;
 * only the author can tell which, so it is reported rather than judged
 * @property {{ regions: number, chrome: number, sections: number }} stats
 */

/**
 * Splits a single-file document into a kiss layout, page view and partials.
 *
 * @param {string} html
 * @param {Object} [options]
 * @param {(string|null)[]} [options.names] per-region names overriding the proposals
 * @param {string} [options.layoutName] default `layout`
 * @param {string} [options.pageName] default `index`
 * @param {boolean} [options.escapeExpressions] default `true` — see
 * `serializeNodes`. Leave it on unless you wrote the document yourself and mean
 * its `{{…}}` to be compiled by kiss.
 * @returns {HtmlSplitResult}
 */
export function splitDocument(html, options = {}) {
  const {
    names = [],
    layoutName = 'layout',
    pageName = 'index',
    escapeExpressions = true,
  } = options
  const print = { escapeExpressions }
  const doc = parseHtml(html)
  // `container` and `main` come back from the same call that chose the
  // regions, rather than being re-derived here. `<main>` is re-emitted only
  // when the document had exactly one: adding one would be a semantic
  // improvement and it would also mean the conversion does not give back what
  // it was given — and the moment that is true of one tag, nobody can trust it
  // about the rest. A missing landmark is the agent's to raise with the
  // author, not this module's to insert silently.
  const {
    regions: found,
    container,
    main: mainEl,
    body: bodyEl,
  } = findRegions(doc)
  const regions = nameRegions(found, names)

  const head = findTag(doc, 'head')
  const htmlEl = findTag(doc, 'html')
  const doctype = doc.find((n) => n.type === 'doctype')

  // Inline `<style>` and `<script>` are REPORTED, not removed.
  //
  // Removing them was the first shape of this and it was wrong twice over. It
  // broke the one promise the module makes — assembling gives back what was
  // split — and it did so silently, which the round trip against the live K9
  // page caught by losing both its `<script src>` tags outright. And lifting an
  // asset is not a structural move: it means choosing a filename, writing the
  // file, and rewriting the tag that pointed at it — and the caller is the only
  // party that knows where the site keeps things.
  //
  // So the document stays whole and this says what is in it worth lifting.
  //
  // The WHOLE document is walked, not `<head>` and `<body>` by name. Walking
  // `<body>` found nothing in a document that has none — `<body>` is optional
  // — and nothing after `</body>` in one that does: the same "two functions
  // with their own idea of the body" mistake `findRegions` documents.
  //
  // Both kinds are reported with their attributes, because the attributes
  // decide what the text IS. A script's `type="module"` lifted into a classic
  // `<script src>` fails on its first `import`, and JSON-LD or an import map is
  // not JavaScript at all. A style's `media="print"` merged into one
  // unconditional stylesheet applied print rules on screen (Codex review,
  // 2026-10-02) — and `title`, `nonce` or a non-CSS `type` change it too.
  /** @param {HtmlNode} node the opening tag's text after its name, as written */
  const attrsOf = (node) =>
    (node.open ?? '').replace(/^<[^\s/>]*/, '').replace(/>$/, '')
  /** @type {{ attrs: string, content: string }[]} */
  const styles = []
  /** @type {{ attrs: string, type: string, content: string }[]} */
  const scripts = []
  const collect = (list) => {
    for (const child of list) {
      if (child.type === 'element' && child.tag === 'style') {
        styles.push({
          attrs: attrsOf(child),
          content: child.children?.[0]?.text ?? '',
        })
        continue
      }
      if (child.type === 'element' && child.tag === 'script') {
        const content = child.children?.[0]?.text ?? ''
        if (!attr(child, 'src') && content.trim())
          scripts.push({
            attrs: attrsOf(child),
            type: attr(child, 'type').trim().toLowerCase(),
            content,
          })
        continue
      }
      collect(child.children ?? [])
    }
  }
  collect(doc)

  const byNode = new Map(regions.map((region) => [region.node, region]))
  // Where a call stands, and what whitespace surrounds it, is `LineWriter`'s.
  const partialRef = (region) =>
    `{{> "${region.kind === 'chrome' ? 'site' : 'sections'}/${region.name}"}}`

  // The layout is rebuilt by WALKING the body in document order, not by
  // emitting chrome-before, the content block, then chrome-after. Order is
  // most of what the invariant promises, and the positional shape broke it
  // three ways, each measured:
  //
  //   - a bootstrap `<script>` written as the body's first child was collected
  //     separately and re-emitted last, so it ran after the page instead of
  //     before it;
  //   - a `<script integrity=…>` sitting inside `<main>` was collected by
  //     nothing at all — filtered out of the regions, invisible to the
  //     body-level script sweep — and simply vanished, SRI and all;
  //   - a top-level comment or stray text node between two sections was never
  //     looked at, because only elements were.
  //
  // Walking the stream emits every node exactly once, where it was. A region
  // becomes its partial call; the first section becomes the content block;
  // everything else is serialised verbatim.
  //
  // The printer's rule holds here too, and at the region boundaries as well:
  // no whitespace is added between two nodes the source wrote touching — not
  // between two plain nodes, and not where a region's partial call or the
  // content block stands in for it. Codex measured the boundary case: two
  // `display:inline-block` sections came back with a newline between them,
  // because every partial call used to stand on a line of its own. The
  // `LineWriter`s carry the gaps instead. Between sections the gap goes into
  // the page view, between the calls; before the first and after the last it
  // stays in the layout, either side of the content block.
  const layoutWriter = new LineWriter()
  const pageWriter = new LineWriter()
  const sectionList = regions
    .filter((r) => r.kind === 'section')
    .map((r) => r.node)
  let contentEmitted = false
  let sectionsLeft = sectionList.length
  const walk = (list, depth) => {
    const pad = '  '.repeat(depth)
    for (const node of list) {
      // Between the first section and the last, a gap belongs to the page
      // view; anywhere else, to the layout.
      const inRun = contentEmitted && sectionsLeft > 0
      if (isGap(node)) {
        ;(inRun ? pageWriter : layoutWriter).gap(node.text)
        continue
      }
      const region = byNode.get(node)
      if (region && region.kind === 'section') {
        if (!contentEmitted) {
          layoutWriter.block('{{#block "main"}}{{/block}}', pad)
          contentEmitted = true
        }
        pageWriter.call(`{{> "sections/${region.name}"}}`)
        sectionsLeft -= 1
        continue
      }
      // A node written between two sections is emitted in the layout, after
      // the content block: the stated exception, reported in `warnings`.
      if (inRun) layoutWriter.gap('\n')
      if (region) {
        layoutWriter.call(partialRef(region))
        continue
      }
      if (node === mainEl) {
        layoutWriter.piece(openingTag(node, print), pad)
        walk(node.children ?? [], depth + 1)
        const close = closingTag(node, print)
        if (close) layoutWriter.piece(close, pad)
        continue
      }
      layoutWriter.piece(printNode(node, depth, print), pad)
    }
  }
  walk(container, 1)
  // A document that is all chrome still needs somewhere for a page's content
  // to land, or every page extending this layout renders nothing.
  if (!contentEmitted) {
    layoutWriter.gap('\n')
    layoutWriter.block('{{#block "main"}}{{/block}}', '  ')
  }
  const bodyLines = [layoutWriter.text()].filter((line) => line !== '')

  const headInner = head ? serializeNodes(head.children ?? [], 1, print) : ''

  // THE CONTAINER TAGS GO THROUGH THE ESCAPE LIKE EVERYTHING ELSE. They were
  // once interpolated raw — so `<body data-x="{{sass '/etc/…'}}">` walked
  // straight past the guard the rest of the module exists to apply. Each is
  // its source opening tag, through `openingTag`, or the bare tag when the
  // document wrote none.
  /** @param {HtmlNode|null|undefined} node @param {string} fallback */
  const tagOf = (node, fallback) =>
    node && node.open ? openingTag(node, print) : fallback

  // A DOCUMENT GETS BACK THE STRUCTURE IT WROTE, AND NO MORE. A doctype, a
  // `<head>` or a `<body>` the source left out is not added, and a close tag
  // it omitted is not written: an added doctype switches the browser out of
  // quirks mode (Codex review, 2026-10-02), and the rest is the same promise.
  // Only a bare fragment — none of `<html>`, `<head>`, `<body>` — gets the
  // skeleton, because it is not a document yet.
  const fragment = !htmlEl && !head && !bodyEl
  /** The close tag the source wrote, or `fallback` for the fragment skeleton. */
  const closeOf = (node, fallback) =>
    node ? closingTag(node, print) : fragment ? fallback : ''
  const headBlock = head
    ? [tagOf(head, '<head>'), headInner, closeOf(head, '</head>')]
    : fragment
      ? ['<head>', '</head>']
      : []
  const bodyBlock = [
    bodyEl ? tagOf(bodyEl, '<body>') : fragment ? '<body>' : '',
    ...bodyLines,
    '  {{#block "scripts"}}{{/block}}',
    closeOf(bodyEl, '</body>'),
  ]

  // THE DOCUMENT IS WALKED AT EVERY LEVEL, NOT LOOKED UP BY NAME. Reaching for
  // `head` and `body` and emitting a fixed skeleton around them deleted
  // everything else they sat beside — a `<script src integrity>` after
  // `</body>`, a build-marker comment between `</head>` and `<body>` — first
  // inside `<html>`, and then, after that was fixed, in a document with no
  // `<html>`, which took a separate branch that still emitted the skeleton.
  // `<html>`, `<head>` and `<body>` are all optional, so one walk handles
  // whichever of them the document wrote: `<head>` becomes the head block,
  // `<body>` the body block, everything else is emitted where it stood, and
  // the root-level doctype goes through `serializeNodes` so it is escaped
  // like anything else (`<!DOCTYPE html SYSTEM "{{…}}">` is legal).
  //
  // With no `<body>`, the nodes standing in for its children (`container`)
  // are wrapped in one at the first of them, which is what a browser does.
  // `<html>` is never added to a document that did not write it. Only a bare
  // fragment — no `<html>`, `<head>` or `<body>` at all — gets the skeleton
  // this module has always wrapped one in, because it is not a document yet.
  const standIns = new Set(bodyEl ? [] : container)
  let bodyDone = false
  const placeBody = (lines) => {
    if (bodyDone) return
    lines.push(...bodyBlock)
    bodyDone = true
  }
  const level = (list) => {
    const lines = []
    for (const node of list) {
      if (node === htmlEl) {
        lines.push(tagOf(node, '<html>'), ...level(node.children ?? []))
        placeBody(lines)
        lines.push(closeOf(node, '</html>'))
        continue
      }
      if (node === head) {
        lines.push(...headBlock)
        continue
      }
      if (node === bodyEl || standIns.has(node)) {
        placeBody(lines)
        continue
      }
      const text = serializeNodes([node], 0, print)
      if (text !== '') lines.push(text)
    }
    return lines
  }

  const layoutLines = []
  if (fragment) {
    layoutLines.push(
      doctype ? serializeNodes([doctype], 0, print) : '<!doctype html>',
      '<html>',
      ...headBlock,
      ...bodyBlock,
      '</html>',
    )
  } else {
    layoutLines.push(...level(doc))
    placeBody(layoutLines)
  }
  const layout = layoutLines.filter((line) => line !== '').join('\n')

  const expressions = findExpressions(doc)
  const warnings = []
  // The one lossy case, and it is never silent. Counted off the SOURCE, so
  // the number is what the document had rather than what survived.
  const braced = (html.match(/\\+\{\{/g) ?? []).length
  if (braced > 0 && escapeExpressions !== false)
    warnings.push(
      `${braced} ${braced === 1 ? 'expression is' : 'expressions are'} preceded by a backslash, which defeats Handlebars' only escape — the braces are emitted as the character reference &#123;&#123; instead. The page renders the same; the bytes differ, and inside <script> or <style> so does the text.`,
    )

  // THE SECOND STATED EXCEPTION TO THE INVARIANT, and the reason it is a
  // warning rather than a fix: chrome belongs to the layout and sections
  // render at one `{{#block "main"}}`, so a node written BETWEEN two sections
  // has nowhere to go but after them. `<section>A</section><nav>N</nav>
  // <section>B</section>` comes back as A, B, N.
  //
  // It is not new — it has done this since the module was written, and the
  // only thing that changed is that a comment or stray text used to be
  // dropped there outright and is now merely moved. Preserving the order
  // means the page view, not the layout, emitting the interleaved run, which
  // makes a `<nav>` between two sections page-scoped rather than shared
  // furniture. That is a bigger change to every converted site's shape than
  // this earns, so the behaviour stands and the conversion says what it did.
  const flow = mainEl
    ? container.flatMap((n) => (n === mainEl ? (n.children ?? []) : [n]))
    : container
  const sectionNodes = new Set(
    regions.filter((r) => r.kind === 'section').map((r) => r.node),
  )
  // `findLastIndex` is Node 22 but not in this repo's `tsconfig` lib target,
  // and bumping that for one call is a wider change than the call is worth.
  const at = flow.flatMap((n, i) => (sectionNodes.has(n) ? [i] : []))
  const first = at.length === 0 ? -1 : at[0]
  const last = at.length === 0 ? -1 : at[at.length - 1]
  const moved =
    first === -1
      ? []
      : flow
          .slice(first + 1, last)
          // Scripts included. They were left out of this list, and they are
          // the nodes whose position changes behaviour: a script written
          // before the second section now runs after it exists.
          .filter(
            (n) => !sectionNodes.has(n) && serializeNodes([n], 0, print) !== '',
          )
  if (moved.length > 0)
    warnings.push(
      `${moved.length} ${moved.length === 1 ? 'node sits' : 'nodes sit'} between two sections and ${moved.length === 1 ? 'is' : 'are'} emitted after all of them instead of in place (${moved.map(describeNode).join(', ')}). Chrome goes in the layout and sections render at one content block, so an interleaved node cannot keep its position. Move it above the first section or below the last if the order matters.`,
    )

  // A `<body>` whose whitespace renders cannot be kept whole the way a
  // `<main>` is: the layout has to put the content block somewhere, on lines
  // of its own, and under `white-space: pre` those line breaks are text. Rare
  // enough to report rather than engineer around.
  if (keepsWhitespace(bodyEl))
    warnings.push(
      `<body> is styled white-space: pre, so the line breaks the layout puts around its partials and content block render as text. Move the style to an element inside <body> if the page depends on it.`,
    )

  const sections = regions.filter((r) => r.kind === 'section')
  // The content block's tags sit on the same line as the calls they enclose,
  // so the block holds exactly the sections and the gaps between them —
  // nothing Handlebars would turn into a leading or trailing newline.
  const page = `{{#extend "${layoutName}"}}{{#content "main"}}${pageWriter.text()}{{/content}}{{/extend}}`

  // No trailing newline: a partial's file is exactly its region's bytes, so a
  // call adds nothing the source did not have.
  const partials = regions.map((region) => ({
    name: `${region.kind === 'chrome' ? 'site' : 'sections'}/${region.name}.hbs`,
    content: serializeNodes([region.node], 0, print),
  }))
  if (escapeExpressions !== false) {
    assertInert(layout, 'the layout')
    for (const partial of partials) assertInert(partial.content, partial.name)
  }

  return {
    layout: { name: `${layoutName}.hbs`, content: `${layout}\n` },
    page: { name: `${pageName}.hbs`, content: `${page}\n` },
    partials,
    assets: { styles, scripts },
    regions,
    expressions,
    warnings,
    stats: {
      regions: regions.length,
      chrome: regions.filter((r) => r.kind === 'chrome').length,
      sections: sections.length,
    },
  }
}
