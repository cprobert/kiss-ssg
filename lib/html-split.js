// The other mechanical half of converting a single-file site. `css-split.js`
// takes the stylesheet; this takes the document — and the division of labour is
// the same one, for the same reason: parsing, cutting and re-indenting are
// things a person should never do by hand, and deciding that a region is called
// `hero` is not. Names are an input here, exactly as `sections` is there.
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
// proves it by actually rendering them. Four choices exist to keep it true:
//
//   1. Attributes are stored as RAW TEXT and never re-serialised, so quoting,
//      ordering and spacing inside a tag survive untouched.
//   2. An element is re-indented only when every child is an element or a
//      comment. The moment significant text is present, the inner HTML is
//      emitted verbatim — because `<span>a</span> <span>b</span>` renders
//      differently from the same thing across two indented lines, and a
//      prettier output that moves text is not a conversion, it is a rewrite.
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
//   6. A tag's name is written as the document wrote it. Case is significant
//      inside `<svg>`, where `<linearGradient>` is not `<lineargradient>`.
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
//   c. A node written BETWEEN two sections — a `<nav>`, a comment, stray
//      text — is emitted after all of them. Chrome belongs to the layout and
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

// Void elements never have a closing tag; treating one as open swallows the
// rest of the document into it. `<img>` and `<br>` inside a hero are the usual
// way that happens.
const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

// Raw-text elements hold text that is not markup. `<script>if (a<b) {}</script>`
// is the canonical break: `<b` is not a tag, and a scanner that thinks it is
// loses everything after it.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title'])

// Whitespace between two INLINE elements is rendered; whitespace between two
// block elements is source formatting. `<em>a</em> <em>b</em>` reads "a b" and
// `<em>a</em><em>b</em>` reads "ab", so an element holding inline children is
// printed verbatim however tidy an indented version would look. Found by the
// assembly round trip, which lost exactly that space on its first run.
const INLINE = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'button',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'i',
  'img',
  'ins',
  'kbd',
  'label',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
])

// A region whose tag is one of these is page furniture rather than content —
// the part that belongs in the layout and is shared by every page, not in the
// page view. `main` is listed because it is unwrapped rather than kept.
const CHROME_TAGS = new Set(['header', 'nav', 'footer', 'aside'])

// …and so is a `div` whose id or class says so. An agent-written page uses
// `<div class="site-header">` about as often as it uses `<header>`.
const CHROME_HINTS =
  /\b(site-)?(header|footer|topbar|navbar|nav|masthead|banner)\b/i

/**
 * @typedef {Object} HtmlNode
 * @property {'element'|'text'|'comment'|'doctype'} type
 * @property {string} [tag] lower-cased tag name — what every decision keys on
 * @property {string} [name] the tag name AS WRITTEN, present only when it differs
 * from `tag`. Case matters inside `<svg>`: `<linearGradient>` is not
 * `<lineargradient>`, and the serialiser emits this
 * @property {string} [attrs] the opening tag's attribute text, exactly as written
 * @property {HtmlNode[]} [children]
 * @property {string} [text] text, comment or doctype content
 * @property {boolean} [raw] set on the single text child of a raw-text element
 * @property {boolean} [selfClosed] written as `<tag/>` and not a void element —
 * the SVG spelling, which has to survive serialisation
 */

/**
 * @typedef {Object} HtmlRegion
 * @property {'chrome'|'section'} kind where the region belongs — the layout, or the page
 * @property {string} tag
 * @property {string} name the proposed partial name
 * @property {string[]} classes the class names on the region's root element, which
 * are what `splitStylesheet`'s `sections` matches on — see `findRegions`
 * @property {HtmlNode} node
 */

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

/**
 * Index just past the opening tag beginning at `i`, respecting quoted attribute
 * values — `<a title="a > b">` is one tag, and splitting on the first `>` cuts
 * it in half.
 *
 * @param {string} src
 * @param {number} i index of the `<`
 * @returns {number}
 */
function endOfTag(src, i) {
  let j = i + 1
  while (j < src.length) {
    const c = src[j]
    // A quote only opens a value when it follows `=` (optionally spaced). An
    // unconditional skip treats the apostrophe in `alt=don't` as an opening
    // quote and runs to the next one — or off the end of the document — which
    // a security review measured swallowing the rest of a page into one
    // partial.
    if (c === '"' || c === "'") {
      const before = src.slice(i, j).replace(/\s+$/, '')
      if (before.endsWith('=')) {
        const close = src.indexOf(c, j + 1)
        j = close === -1 ? src.length : close + 1
        continue
      }
    }
    if (c === '>') return j + 1
    j += 1
  }
  return src.length
}

/**
 * Parses an HTML document or fragment into a node tree.
 *
 * Deliberately not a conforming parser: it does not imply omitted tags, fix
 * mis-nesting or build a `<tbody>` nobody wrote. The input this exists for is
 * machine-written — a Claude or ChatGPT artifact, an exported page — which is
 * well-formed and explicitly closed. A stray close tag is dropped rather than
 * restructuring the tree around it, so malformed input degrades into a flatter
 * cut rather than a wrong one.
 *
 * @param {string} src
 * @returns {HtmlNode[]}
 */
export function parseHtml(src) {
  /** @type {HtmlNode[]} */
  const root = []
  /** @type {HtmlNode[][]} */
  const stack = [root]
  /** @type {string[]} */
  const open = []
  let i = 0

  const push = (node) => stack[stack.length - 1].push(node)
  // ADJACENT TEXT IS ONE NODE. A dropped stray close tag leaves the text on
  // either side of it as two siblings, and the printer joins siblings with
  // nothing — so `Pricing{</span>{sass '…'}}` came back out as a live
  // `{{sass '…'}}`, assembled by the serialiser out of two halves that were
  // each harmless. Nothing caught it: the source contains no `{{`, so the
  // escape had nothing to escape and `findExpressions` reported an empty
  // list while the emitted partial was executable. Merging on the way in
  // means the escape sees the braces the output will have.
  const pushText = (text) => {
    if (!text) return
    const list = stack[stack.length - 1]
    const last = list[list.length - 1]
    if (last && last.type === 'text' && !last.raw) last.text += text
    else push({ type: 'text', text })
  }

  while (i < src.length) {
    const lt = src.indexOf('<', i)
    if (lt === -1) {
      pushText(src.slice(i))
      break
    }
    pushText(src.slice(i, lt))

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4)
      const stop = end === -1 ? src.length : end + 3
      push({ type: 'comment', text: src.slice(lt, stop) })
      i = stop
      continue
    }
    if (src.startsWith('<!', lt)) {
      const stop = endOfTag(src, lt)
      push({ type: 'doctype', text: src.slice(lt, stop) })
      i = stop
      continue
    }

    const stop = endOfTag(src, lt)
    const inner = src.slice(lt + 1, stop - 1)

    if (inner.startsWith('/')) {
      const tag = inner.slice(1).trim().toLowerCase()
      // Only unwind to a tag that is actually open. A close tag for something
      // that is not pops nothing, which keeps a stray `</div>` from closing the
      // document's real structure.
      const at = open.lastIndexOf(tag)
      if (at !== -1) {
        while (open.length > at) {
          open.pop()
          stack.pop()
        }
      }
      i = stop
      continue
    }

    const selfClosing = inner.endsWith('/')
    const body = selfClosing ? inner.slice(0, -1) : inner
    const space = body.search(/[\s]/)
    // `tag` is lower-cased because every decision keyed on it — void,
    // raw-text, inline, chrome — is case-insensitive in HTML. `name` is the
    // spelling the document used, and it is kept because inside `<svg>` the
    // document is foreign content where case is significant:
    // `<linearGradient>` and `<clipPath>` are not `<lineargradient>` and
    // `<clippath>`. A browser case-corrects them, so nothing renders wrong —
    // but the bytes differ, and "the bytes are the same" is the claim this
    // module makes.
    const written = space === -1 ? body : body.slice(0, space)
    const tag = written.toLowerCase()
    const attrs = space === -1 ? '' : body.slice(space)
    const name = written === tag ? {} : { name: written }

    if (VOID.has(tag) || selfClosing) {
      // `selfClosed` is recorded rather than normalised away: inside `<svg>`
      // the document is foreign content, where `<path d="…"/>` is the ordinary
      // spelling and `<path></path>` is a different serialisation of it. An
      // artifact's icons are full of them.
      push({
        type: 'element',
        tag,
        ...name,
        attrs,
        children: [],
        ...(selfClosing && !VOID.has(tag) ? { selfClosed: true } : {}),
      })
      i = stop
      continue
    }

    if (RAW_TEXT.has(tag)) {
      // The spec terminator, not a bare `indexOf('</script')`: the close tag
      // must be followed by whitespace, `/` or `>`, which is what a browser
      // requires. A JS string containing `"</scriptfoo"` is NOT a close tag,
      // and treating it as one ended the element early and then scanned from
      // inside it — measured losing every element after the script, silently,
      // with a green build.
      const closeAt = new RegExp(`</${tag}(?=[\\s/>])`, 'i').exec(
        src.slice(stop),
      )
      const close = closeAt === null ? -1 : stop + closeAt.index
      const end = close === -1 ? src.length : close
      const text = src.slice(stop, end)
      push({
        type: 'element',
        tag,
        ...name,
        attrs,
        children: text ? [{ type: 'text', text, raw: true }] : [],
      })
      i = close === -1 ? src.length : endOfTag(src, close)
      continue
    }

    const node = { type: 'element', tag, ...name, attrs, children: [] }
    push(node)
    stack.push(node.children)
    open.push(tag)
    i = stop
  }

  return root
}

/**
 * The value of one attribute on a node, read from the raw attribute text.
 *
 * @param {HtmlNode} node
 * @param {string} name
 * @returns {string} empty when absent
 */
export function attr(node, name) {
  const match = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  ).exec(node.attrs ?? '')
  return match ? (match[1] ?? match[2] ?? match[3] ?? '') : ''
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

const hasSignificantText = (nodes) =>
  nodes.some((n) => n.type === 'text' && !n.raw && n.text.trim() !== '')

// An inline child means an inline formatting context, where the whitespace
// between children is part of what the page says.
const hasInlineChild = (nodes) =>
  nodes.some((n) => n.type === 'element' && INLINE.has(n.tag))

/** Whether this element's children must be emitted exactly as they were. */
const mustStayVerbatim = (children) =>
  hasSignificantText(children) ||
  hasInlineChild(children) ||
  children.some((c) => c.raw)

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
 * Re-indents only where it cannot change rendering: an element whose children
 * are all elements or comments. With any significant text among them the
 * children are emitted verbatim on one line, because collapsing or inserting
 * whitespace around inline content changes what the page looks like. That is
 * why the output of a conversion is structured at the block level and untouched
 * inside a paragraph — which is also how a person would have done it.
 *
 * @param {HtmlNode[]} nodes
 * @param {number} [depth]
 * @param {{ escapeExpressions?: boolean }} [options] `escapeExpressions`
 * defaults to **true**: `{{` is rewritten as `\{{` everywhere it is emitted —
 * text, attributes, comments and raw text alike, because Handlebars compiles
 * the whole file. Pass `false` only for a document you wrote and intend to
 * carry template syntax.
 * @returns {string}
 */
export function serializeNodes(nodes, depth = 0, options = {}) {
  const pad = '  '.repeat(depth)
  const out = []
  for (const node of nodes) {
    if (node.type === 'text') {
      if (node.raw) out.push(emit(node.text, options))
      else if (node.text.trim()) out.push(pad + emit(node.text.trim(), options))
      continue
    }
    if (node.type === 'comment' || node.type === 'doctype') {
      out.push(pad + emit(node.text, options))
      continue
    }
    const openTag = openingTag(node, options)
    if (VOID.has(node.tag) || node.selfClosed) {
      out.push(pad + openTag)
      continue
    }
    const children = node.children ?? []
    if (children.length === 0) {
      out.push(`${pad}${openTag}</${tagName(node)}>`)
      continue
    }
    if (mustStayVerbatim(children)) {
      out.push(
        `${pad}${openTag}${serializeInline(children, options)}</${tagName(node)}>`,
      )
      continue
    }
    out.push(pad + openTag)
    out.push(serializeNodes(children, depth + 1, options))
    out.push(`${pad}</${tagName(node)}>`)
  }
  return out.filter((line) => line !== '').join('\n')
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
      const openTag = openingTag(node, options)
      if (VOID.has(node.tag) || node.selfClosed) return openTag
      return `${openTag}${serializeInline(node.children ?? [], options)}</${tagName(node)}>`
    })
    .join('')
}

/**
 * @param {HtmlNode} node
 * @param {{ escapeExpressions?: boolean }} [options]
 * @returns {string} the opening tag, self-closed where it was written that way
 */
const openingTag = (node, options = {}) => {
  // Attributes go through the same escape as text. An injection in an
  // attribute is the one the comparison tool cannot see, so it is the one that
  // matters most.
  const attrs = emit(node.attrs ?? '', options)
  const tag = tagName(node)
  return node.selfClosed ? `<${tag}${attrs}/>` : `<${tag}${attrs}>`
}

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
      if (node.type === 'element') scan(node.attrs)
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
  const hint = `${attr(node, 'id')} ${attr(node, 'class')}`
  if (CHROME_HINTS.test(hint)) return 'chrome'
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
  const mains = top.filter((n) => n.tag === 'main')
  const main = mains.length === 1 ? mains[0] : undefined
  const expanded = main
    ? top.flatMap((n) => (n === main ? elementsOf(n.children ?? []) : n))
    : top
  const regions = expanded
    // A trailing `<script>` is an asset, not a region; it is collected
    // separately and re-emitted by the layout. `<head>` is not a region
    // either — it reaches this list only in the no-`<body>` case below, where
    // the document's own children stand in for the body's.
    .filter((n) => n.tag !== 'script' && n.tag !== 'head')
    .map((node) => ({
      kind: regionKind(node),
      tag: node.tag,
      name: suggestName(node),
      // `name` is what the region MEANS and `classes` is what its markup is
      // called, and a conversion needs both because they are read by different
      // things: `name` names the partial, `classes` is what `splitStylesheet`
      // matches selectors against.
      //
      // They are the same word often enough to hide the difference, which is
      // exactly how it bit. A clean-room run converted a page whose sections
      // were `.lede`, `.craft` and `.proof` while their meanings were `hero`,
      // `services` and `testimonials`; the documented
      // `sections: regions.map((r) => r.name)` matched nothing and collapsed a
      // nine-partial stylesheet into one 2.7KB `_base.scss`, silently.
      // `regions.flatMap((r) => r.classes)` is the correct spelling, and
      // surfacing the classes here is what makes it available: deriving a
      // selector from markup is mechanical, so the engine owes it rather than
      // leaving every caller to maintain a parallel list by hand.
      classes: attr(node, 'class').trim().split(/\s+/).filter(Boolean),
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
  return (htmlEl ? (htmlEl.children ?? []) : nodes).filter(
    (n) => n !== head && n.type !== 'doctype',
  )
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
 * @typedef {Object} HtmlSplitResult
 * @property {{ name: string, content: string }} layout
 * @property {{ name: string, content: string }} page
 * @property {{ name: string, content: string }[]} partials paths relative to `folders.partials`
 * @property {{ styles: string[], scripts: { src: string, content: string }[] }} assets
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
  // file, and rewriting the tag that pointed at it. The caller is already doing
  // that work, because the CSS has to go through `splitStylesheet` anyway, and
  // it is the only party that knows where the site keeps things.
  //
  // So the document stays whole and this says what is in it worth lifting.
  const styles = []
  const scripts = []
  const collect = (node) => {
    for (const child of node.children ?? []) {
      if (child.type === 'element' && child.tag === 'style') {
        styles.push(child.children?.[0]?.text ?? '')
        continue
      }
      if (child.type === 'element' && child.tag === 'script') {
        const src = attr(child, 'src')
        const content = child.children?.[0]?.text ?? ''
        if (!src && content.trim()) scripts.push({ src, content })
        continue
      }
      collect(child)
    }
  }
  if (head) collect(head)
  if (bodyEl) collect(bodyEl)

  const byNode = new Map(regions.map((region) => [region.node, region]))
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
  let contentEmitted = false
  const bodyLines = []
  const walk = (list, depth) => {
    const pad = '  '.repeat(depth)
    for (const node of list) {
      if (node === mainEl) {
        bodyLines.push(`${pad}<main${emit(node.attrs ?? '', print)}>`)
        walk(node.children ?? [], depth + 1)
        bodyLines.push(`${pad}</main>`)
        continue
      }
      const region = byNode.get(node)
      if (region) {
        if (region.kind !== 'section') {
          bodyLines.push(pad + partialRef(region))
          continue
        }
        if (!contentEmitted) {
          bodyLines.push(`${pad}{{#block "main"}}{{/block}}`)
          contentEmitted = true
        }
        continue
      }
      const text = serializeNodes([node], depth, print)
      if (text !== '') bodyLines.push(text)
    }
  }
  walk(container, 1)
  // A document that is all chrome still needs somewhere for a page's content
  // to land, or every page extending this layout renders nothing.
  if (!contentEmitted) bodyLines.push('  {{#block "main"}}{{/block}}')

  const headInner = head ? serializeNodes(head.children ?? [], 1, print) : ''

  // THE CONTAINER TAGS GO THROUGH THE ESCAPE LIKE EVERYTHING ELSE. These four
  // attribute strings are the only ones not emitted by `openingTag`, and they
  // were interpolated raw — so `<body data-x="{{sass '/etc/…'}}">` walked
  // straight past the guard that the rest of the module exists to apply, on
  // exactly the surface its own comment calls the one that matters most.
  const esc = (attrs) => emit(attrs ?? '', print)

  const headBlock = [`<head${esc(head?.attrs)}>`, headInner, '</head>']
  const bodyBlock = [
    `<body${esc(bodyEl?.attrs)}>`,
    ...bodyLines,
    '  {{#block "scripts"}}{{/block}}',
    '</body>',
  ]

  // `<html>`'s children are WALKED, not looked up by name. Reaching for
  // `head` and `body` and emitting a fixed skeleton around them deleted
  // everything else `<html>` held — a `<script src integrity>` after
  // `</body>`, a build-marker comment between `</head>` and `<body>` — which
  // is the same silent deletion this module had already been fixed for once,
  // one level up the tree. A document with no `<body>` has its remaining
  // children wrapped in one, which is what a browser does with it.
  const htmlInner = []
  if (htmlEl) {
    const kids = htmlEl.children ?? []
    if (head) htmlInner.push(...headBlock)
    else htmlInner.push('<head>', '</head>')
    if (bodyEl) {
      for (const node of kids) {
        if (node === head) continue
        if (node === bodyEl) {
          htmlInner.push(...bodyBlock)
          continue
        }
        const text = serializeNodes([node], 0, print)
        if (text !== '') htmlInner.push(text)
      }
    } else {
      htmlInner.push(...bodyBlock)
    }
  } else {
    htmlInner.push(...(head ? headBlock : ['<head>', '</head>']), ...bodyBlock)
  }
  const htmlBlock = [`<html${esc(htmlEl?.attrs)}>`, ...htmlInner, '</html>']

  // Root-level nodes outside `<html>` — the doctype, and the conditional
  // comments and build markers that sit beside it — are emitted where they
  // were, through `serializeNodes` so the doctype is escaped like anything
  // else (`<!DOCTYPE html SYSTEM "{{…}}">` is a legal doctype and was the one
  // place a raw `.text` still went out). A document with no `<html>` at all is
  // a fragment, and gets the skeleton this module has always wrapped one in.
  const layoutLines = []
  if (htmlEl) {
    if (!doctype) layoutLines.push('<!doctype html>')
    for (const node of doc) {
      if (node === htmlEl) {
        layoutLines.push(...htmlBlock)
        continue
      }
      const text = serializeNodes([node], 0, print)
      if (text !== '') layoutLines.push(text)
    }
  } else {
    layoutLines.push(
      doctype ? serializeNodes([doctype], 0, print) : '<!doctype html>',
      ...htmlBlock,
    )
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
          .filter(
            (n) =>
              !sectionNodes.has(n) &&
              serializeNodes([n], 0, print) !== '' &&
              !(n.type === 'element' && n.tag === 'script'),
          )
  if (moved.length > 0)
    warnings.push(
      `${moved.length} ${moved.length === 1 ? 'node sits' : 'nodes sit'} between two sections and ${moved.length === 1 ? 'is' : 'are'} emitted after all of them instead of in place (${moved.map(describeNode).join(', ')}). Chrome goes in the layout and sections render at one content block, so an interleaved node cannot keep its position. Move it above the first section or below the last if the order matters.`,
    )

  const sections = regions.filter((r) => r.kind === 'section')
  const page = [
    `{{#extend "${layoutName}"}}`,
    '{{#content "main"}}',
    ...sections.map((r) => `  {{> "sections/${r.name}"}}`),
    '{{/content}}',
    '{{/extend}}',
  ].join('\n')

  return {
    layout: { name: `${layoutName}.hbs`, content: `${layout}\n` },
    page: { name: `${pageName}.hbs`, content: `${page}\n` },
    partials: regions.map((region) => ({
      name: `${region.kind === 'chrome' ? 'site' : 'sections'}/${region.name}.hbs`,
      content: `${serializeNodes([region.node], 0, print)}\n`,
    })),
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
