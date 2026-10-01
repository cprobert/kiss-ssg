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
// proves it by actually rendering them. Two choices exist to keep it true:
//
//   1. Attributes are stored as RAW TEXT and never re-serialised, so quoting,
//      ordering and spacing inside a tag survive untouched.
//   2. An element is re-indented only when every child is an element or a
//      comment. The moment significant text is present, the inner HTML is
//      emitted verbatim — because `<span>a</span> <span>b</span>` renders
//      differently from the same thing across two indented lines, and a
//      prettier output that moves text is not a conversion, it is a rewrite.

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
 * @property {string} [tag] lower-cased tag name
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
    if (c === '"' || c === "'") {
      const close = src.indexOf(c, j + 1)
      j = close === -1 ? src.length : close + 1
      continue
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
  const pushText = (text) => {
    if (text) push({ type: 'text', text })
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
    const tag = (space === -1 ? body : body.slice(0, space)).toLowerCase()
    const attrs = space === -1 ? '' : body.slice(space)

    if (VOID.has(tag) || selfClosing) {
      // `selfClosed` is recorded rather than normalised away: inside `<svg>`
      // the document is foreign content, where `<path d="…"/>` is the ordinary
      // spelling and `<path></path>` is a different serialisation of it. An
      // artifact's icons are full of them.
      push({
        type: 'element',
        tag,
        attrs,
        children: [],
        ...(selfClosing && !VOID.has(tag) ? { selfClosed: true } : {}),
      })
      i = stop
      continue
    }

    if (RAW_TEXT.has(tag)) {
      const closeTag = `</${tag}`
      const close = src.toLowerCase().indexOf(closeTag, stop)
      const end = close === -1 ? src.length : close
      const text = src.slice(stop, end)
      push({
        type: 'element',
        tag,
        attrs,
        children: text ? [{ type: 'text', text, raw: true }] : [],
      })
      i = close === -1 ? src.length : endOfTag(src, close)
      continue
    }

    const node = { type: 'element', tag, attrs, children: [] }
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
 * @returns {string}
 */
export function serializeNodes(nodes, depth = 0) {
  const pad = '  '.repeat(depth)
  const out = []
  for (const node of nodes) {
    if (node.type === 'text') {
      if (node.raw) out.push(node.text)
      else if (node.text.trim()) out.push(pad + node.text.trim())
      continue
    }
    if (node.type === 'comment' || node.type === 'doctype') {
      out.push(pad + node.text)
      continue
    }
    const openTag = openingTag(node)
    if (VOID.has(node.tag) || node.selfClosed) {
      out.push(pad + openTag)
      continue
    }
    const children = node.children ?? []
    if (children.length === 0) {
      out.push(`${pad}${openTag}</${node.tag}>`)
      continue
    }
    if (mustStayVerbatim(children)) {
      out.push(`${pad}${openTag}${serializeInline(children)}</${node.tag}>`)
      continue
    }
    out.push(pad + openTag)
    out.push(serializeNodes(children, depth + 1))
    out.push(`${pad}</${node.tag}>`)
  }
  return out.filter((line) => line !== '').join('\n')
}

/**
 * Children emitted with no whitespace added or removed — the verbatim path.
 *
 * @param {HtmlNode[]} nodes
 * @returns {string}
 */
function serializeInline(nodes) {
  return nodes
    .map((node) => {
      if (node.type === 'text') return node.text
      if (node.type === 'comment' || node.type === 'doctype') return node.text
      const openTag = openingTag(node)
      if (VOID.has(node.tag) || node.selfClosed) return openTag
      return `${openTag}${serializeInline(node.children ?? [])}</${node.tag}>`
    })
    .join('')
}

/**
 * @param {HtmlNode} node
 * @returns {string} the opening tag, self-closed where it was written that way
 */
const openingTag = (node) =>
  node.selfClosed
    ? `<${node.tag}${node.attrs ?? ''}/>`
    : `<${node.tag}${node.attrs ?? ''}>`

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
 * @returns {{ regions: HtmlRegion[], wrappedInMain: boolean }}
 */
export function findRegions(nodes) {
  const body = findTag(nodes, 'body')
  const top = elementsOf(body ? (body.children ?? []) : nodes)
  const main = top.find((n) => n.tag === 'main')
  const expanded = main
    ? top.flatMap((n) => (n === main ? elementsOf(n.children ?? []) : n))
    : top
  const regions = expanded
    // A trailing `<script>` is an asset, not a region; it is collected
    // separately and re-emitted by the layout.
    .filter((n) => n.tag !== 'script')
    .map((node) => ({
      kind: regionKind(node),
      tag: node.tag,
      name: suggestName(node),
      node,
    }))
  return { regions, wrappedInMain: Boolean(main) }
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
  const seen = new Map()
  return regions.map((region, index) => {
    const supplied = Array.isArray(names) ? names[index] : names[index]
    const base = toName(supplied || region.name)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { ...region, name: n === 1 ? base : `${base}-${n}` }
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
 * @returns {HtmlSplitResult}
 */
export function splitDocument(html, options = {}) {
  const { names = [], layoutName = 'layout', pageName = 'index' } = options
  const doc = parseHtml(html)
  const { regions: found, wrappedInMain } = findRegions(doc)
  const regions = nameRegions(found, names)
  // `<main>` is re-emitted only when the document had one. Adding it would be a
  // semantic improvement and it would also mean the conversion does not give
  // back what it was given — and the moment that is true of one tag, nobody can
  // trust it about the rest. A missing landmark is the agent's to raise with
  // the author, not this module's to insert silently.
  const mainEl = findTag(doc, 'main')

  const head = findTag(doc, 'head')
  const bodyEl = findTag(doc, 'body')
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

  // Body-level `<script>` tags are page furniture: every page needs them, so
  // they belong in the layout, ahead of the per-page `scripts` block. They are
  // emitted verbatim — a `<script src>` already points at a file.
  const bodyScripts = elementsOf(bodyEl?.children ?? []).filter(
    (n) => n.tag === 'script',
  )

  const chromeBefore = []
  const chromeAfter = []
  let seenSection = false
  for (const region of regions) {
    if (region.kind === 'section') {
      seenSection = true
      continue
    }
    ;(seenSection ? chromeAfter : chromeBefore).push(region)
  }

  const partialRef = (region) =>
    `  {{> "${region.kind === 'chrome' ? 'site' : 'sections'}/${region.name}"}}`

  const headInner = head ? serializeNodes(head.children ?? [], 1) : ''

  const layout = [
    doctype ? doctype.text : '<!doctype html>',
    `<html${htmlEl?.attrs ?? ''}>`,
    '<head>',
    headInner,
    '</head>',
    `<body${bodyEl?.attrs ?? ''}>`,
    ...chromeBefore.map(partialRef),
    ...(wrappedInMain
      ? [
          `  <main${mainEl?.attrs ?? ''}>`,
          '    {{#block "main"}}{{/block}}',
          '  </main>',
        ]
      : ['  {{#block "main"}}{{/block}}']),
    ...chromeAfter.map(partialRef),
    ...bodyScripts.map((node) => serializeNodes([node], 1)),
    '  {{#block "scripts"}}{{/block}}',
    '</body>',
    '</html>',
  ]
    .filter((line) => line !== '')
    .join('\n')

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
      content: `${serializeNodes([region.node], 0)}\n`,
    })),
    assets: { styles, scripts },
    regions,
    stats: {
      regions: regions.length,
      chrome: regions.filter((r) => r.kind === 'chrome').length,
      sections: sections.length,
    },
  }
}
