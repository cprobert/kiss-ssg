// Splitting a stylesheet is the mechanical half of converting a single-file
// site into a kiss one. The judgement half — what a section *is* — belongs to
// the agent doing the conversion, which is why `sections` is an input here
// rather than something this module tries to infer. Given the names, this does
// the part a person should not have to: parse, segment, pretty-print, and
// guarantee the cascade did not move.
//
// Measured motivation (AIKB/css-split.md): the one real precedent for this
// conversion carried its stylesheet across untouched — 14,120 bytes on 20
// lines, longest line 1,803 characters — and two later branches never split it.
// The markup became fifteen partials; the styles stayed a blob.
//
// THE INVARIANT, and the reason for every structural choice below: a segment is
// a CONTIGUOUS RUN of top-level nodes, and the entry `@use`s the partials in
// the order they were cut. Sass emits a module's CSS where it is first loaded,
// so concatenating the partials reproduces the original node order exactly.
// Grouping by selector *across* the file would read better and would silently
// change the cascade — `.btn` defined before `.hero .btn` is not the same
// stylesheet as the reverse. Contiguity is what makes losslessness provable,
// and `test/unit/css-split.test.js` proves it by compiling both and diffing.

/**
 * One top-level item in a stylesheet.
 *
 * `decl` only ever appears inside a block. `at` carries `children: null` for
 * the block-less forms (`@import`, `@charset`), which is what distinguishes
 * `@import url(x);` from `@media print {}`.
 *
 * @typedef {Object} CssNode
 * @property {'rule'|'at'|'decl'|'comment'} type
 * @property {string} [prelude] a rule's selector list, or an at-rule's `@name params`
 * @property {CssNode[]|null} [children] block contents, or `null` for a block-less at-rule
 * @property {string} [prop] a declaration's property
 * @property {string} [value] a declaration's value
 * @property {string} [text] a comment's full text, delimiters included
 */

/**
 * @typedef {Object} CssSegment
 * @property {string} name the partial's name, without the leading underscore
 * @property {CssNode[]} nodes the contiguous run this segment covers
 */

/**
 * @typedef {Object} CssSplitResult
 * @property {{ name: string, content: string }} entry the stylesheet that `@use`s the rest
 * @property {{ name: string, content: string }[]} partials one per segment, `_name.scss`
 * @property {{ nodes: number, segments: number, longestLine: number, bytesIn: number, bytesOut: number }} stats
 */

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------
//
// A hand-rolled scanner rather than a CSS parser dependency. The grammar that
// matters here is small — comments, strings, parens, braces — and the whole
// point of the module is to be auditable by whoever inherits the site. Adding
// postcss to a package whose pitch is "nothing to learn before the first page"
// would buy correctness on CSS nobody in this corpus writes (`@supports`
// selector functions with unbalanced-looking strings) and cost a dependency on
// every install. `AIKB/upstream.md` records the alternative considered.
//
// Strings and comments are skipped atomically because both can contain a brace:
// `content: "}"` and `/* } */` are the two inputs that break every naive
// brace-counter, and the second one appears in minified CSS constantly.

/**
 * Index just past the string literal starting at `i` (which must be the quote).
 *
 * @param {string} src
 * @param {number} i
 * @returns {number}
 */
function skipString(src, i) {
  const quote = src[i]
  let j = i + 1
  while (j < src.length) {
    if (src[j] === '\\') {
      j += 2
      continue
    }
    if (src[j] === quote) return j + 1
    j += 1
  }
  return src.length
}

/**
 * Index just past the `/* … *\/` comment starting at `i`.
 *
 * @param {string} src
 * @param {number} i
 * @returns {number}
 */
function skipComment(src, i) {
  const end = src.indexOf('*/', i + 2)
  return end === -1 ? src.length : end + 2
}

// `url(` is the one place CSS allows an unquoted value containing characters
// that would otherwise terminate a token — `url(data:image/svg+xml;base64,…)`
// carries a semicolon, and a data URI for an inline SVG carries braces. Paren
// depth is therefore tracked alongside brace depth, and a `;` inside parens
// does not end a declaration.
/**
 * Scans from `i` for the next structural character at depth zero, skipping
 * strings, comments and parenthesised values.
 *
 * A CUSTOM PROPERTY'S VALUE MAY HOLD BRACES. `--x: { a: b }` and
 * `--x: #{1+1}` are both legal CSS — the value is an arbitrary token stream
 * with balanced brackets — so when the text from `i` opens a custom property,
 * `{ }` are counted as part of the value rather than read as a block. Without
 * that, `--x:#{1+1}` was parsed as a rule `--x:#` holding a declaration.
 *
 * @param {string} src
 * @param {number} i
 * @returns {{ index: number, char: string }} the position and the character
 * found (`{`, `;`, `}`), or `src.length` and `''` at the end of input
 */
function scanToStructural(src, i) {
  CUSTOM_PROPERTY.lastIndex = i
  const custom = CUSTOM_PROPERTY.test(src)
  let braces = 0
  let depth = 0
  let j = i
  while (j < src.length) {
    const c = src[j]
    if (c === '"' || c === "'") {
      j = skipString(src, j)
      continue
    }
    if (c === '/' && src[j + 1] === '*') {
      j = skipComment(src, j)
      continue
    }
    // A backslash escapes the next character outside a string too:
    // `.foo\{bar` is the class `foo{bar`, not a block opening.
    if (c === '\\') {
      j += 2
      continue
    }
    if (c === '(') {
      depth += 1
      j += 1
      continue
    }
    if (c === ')') {
      depth -= 1
      j += 1
      continue
    }
    if (custom && c === '{') {
      braces += 1
      j += 1
      continue
    }
    if (custom && c === '}' && braces > 0) {
      braces -= 1
      j += 1
      continue
    }
    if (depth === 0 && braces === 0 && (c === '{' || c === ';' || c === '}'))
      return { index: j, char: c }
    j += 1
  }
  return { index: src.length, char: '' }
}

// `--name:` at the scan position — the start of a custom property.
const CUSTOM_PROPERTY = /--[^\s:;{}]*\s*:/y

/**
 * Index of the `}` closing the block whose `{` is at `open`.
 *
 * @param {string} src
 * @param {number} open
 * @returns {number} the closing index, or `src.length` when unbalanced
 */
function findBlockEnd(src, open) {
  let depth = 0
  let j = open
  while (j < src.length) {
    const c = src[j]
    if (c === '"' || c === "'") {
      j = skipString(src, j)
      continue
    }
    if (c === '/' && src[j + 1] === '*') {
      j = skipComment(src, j)
      continue
    }
    // A backslash escapes the next character outside a string too:
    // `.foo\{bar` is the class `foo{bar`, not a block opening.
    if (c === '\\') {
      j += 2
      continue
    }
    if (c === '{') depth += 1
    else if (c === '}') {
      depth -= 1
      if (depth === 0) return j
    }
    j += 1
  }
  return src.length
}

// A declaration splits on its FIRST colon, not on a regex: `background:
// url(a:b)` and `grid-template-areas: "a:b"` both carry a later colon, and a
// greedy or last-match split silently corrupts the value.
/**
 * @param {string} text the declaration source, without its terminator
 * @returns {CssNode} a `decl`, or a `rule` with no children when there is no
 * colon (a lone `&:hover` fragment, or a stray token in malformed input)
 */
function parseDeclaration(text) {
  const colon = text.indexOf(':')
  if (colon === -1)
    return { type: 'rule', prelude: text.trim(), children: null }
  const prop = text.slice(0, colon).trim()
  // A custom property's value is a token stream CSS preserves verbatim — sass
  // does not normalise the whitespace inside one the way it does a real
  // declaration's. Trimming it here and re-printing `--ink: #111` for an input
  // of `--ink:#111` therefore survives compilation and makes the output differ
  // from the source by a byte. Keeping it raw is what lets the losslessness
  // test assert byte equality rather than something fuzzier.
  if (prop.startsWith('--'))
    return { type: 'decl', prop, value: text.slice(colon + 1) }
  return { type: 'decl', prop, value: text.slice(colon + 1).trim() }
}

/**
 * Parses stylesheet source into a node tree. Pure, and recursive through
 * blocks, so a rule inside `@media` is a `rule` node like any other.
 *
 * @param {string} src
 * @returns {CssNode[]}
 */
export function parseStylesheet(src) {
  /** @type {CssNode[]} */
  const nodes = []
  let i = 0
  while (i < src.length) {
    // Leading whitespace between nodes carries no meaning once we re-print.
    while (i < src.length && /\s/.test(src[i])) i += 1
    if (i >= src.length) break

    if (src[i] === '/' && src[i + 1] === '*') {
      const end = skipComment(src, i)
      nodes.push({ type: 'comment', text: src.slice(i, end) })
      i = end
      continue
    }

    const { index, char } = scanToStructural(src, i)
    const prelude = src.slice(i, index).trim()

    if (char === '{') {
      const close = findBlockEnd(src, index)
      const body = src.slice(index + 1, close)
      nodes.push({
        type: prelude.startsWith('@') ? 'at' : 'rule',
        prelude,
        children: parseStylesheet(body),
      })
      i = close + 1
      continue
    }

    if (char === ';') {
      if (prelude)
        nodes.push(
          prelude.startsWith('@')
            ? { type: 'at', prelude, children: null }
            : parseDeclaration(prelude),
        )
      i = index + 1
      continue
    }

    // `}` at this level, or end of input: a block body's final declaration is
    // allowed to omit its semicolon, so whatever is left is still a node.
    if (prelude) nodes.push(parseDeclaration(prelude))
    i = index + 1
  }
  return nodes
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

/**
 * A selector list cut at its TOP-LEVEL commas only.
 *
 * A comma inside a string, `( )` or `[ ]` separates nothing. A bare
 * `.split(',')` put a newline inside `a[title="x, y"]` — an unescaped newline
 * in a CSS string is a bad-string token, so the rule was dropped or failed to
 * compile — and re-spaced `:is(.a, .b)`. Each piece is trimmed only at the
 * cut; nothing inside it is touched.
 *
 * @param {string} prelude
 * @returns {string[]}
 */
function splitSelectorList(prelude) {
  const out = []
  let depth = 0
  let quote = ''
  let from = 0
  for (let i = 0; i < prelude.length; i += 1) {
    const c = prelude[i]
    if (c === '\\') {
      i += 1
      continue
    }
    if (quote) {
      if (c === quote) quote = ''
      continue
    }
    if (c === '"' || c === "'") quote = c
    else if (c === '(' || c === '[') depth += 1
    else if ((c === ')' || c === ']') && depth > 0) depth -= 1
    else if (c === ',' && depth === 0) {
      out.push(prelude.slice(from, i).trim())
      from = i + 1
    }
  }
  out.push(prelude.slice(from).trim())
  return out.filter(Boolean)
}

/**
 * Renders nodes back to readable stylesheet source.
 *
 * A selector list is broken one-per-line because minified CSS routinely puts
 * eight selectors on one line, and a reviewer reading a diff needs to see which
 * one changed.
 *
 * @param {CssNode[]} nodes
 * @param {number} [depth] indentation level
 * @returns {string} newline-terminated when non-empty
 */
export function formatNodes(nodes, depth = 0) {
  const pad = '  '.repeat(depth)
  const out = []
  for (const node of nodes) {
    if (node.type === 'comment') {
      out.push(`${pad}${node.text}`)
      continue
    }
    if (node.type === 'decl') {
      // Custom properties are re-emitted exactly as written; see
      // `parseDeclaration`. Everything else gets the one canonical space.
      out.push(
        node.prop?.startsWith('--')
          ? `${pad}${node.prop}:${node.value};`
          : `${pad}${node.prop}: ${node.value};`,
      )
      continue
    }
    if (node.children === null) {
      out.push(`${pad}${node.prelude};`)
      continue
    }
    const selectors = splitSelectorList(node.prelude ?? '')
    const head =
      node.type === 'rule' && selectors.length > 1
        ? selectors.map((s) => `${pad}${s}`).join(',\n')
        : `${pad}${node.prelude}`
    out.push(`${head} {`)
    const inner = formatNodes(node.children ?? [], depth + 1)
    if (inner) out.push(inner.replace(/\n$/, ''))
    out.push(`${pad}}`)
  }
  return out.length ? `${out.join('\n')}\n` : ''
}

// ---------------------------------------------------------------------------
// Segmenting
// ---------------------------------------------------------------------------

/**
 * The class names a selector list mentions, in source order.
 *
 * @param {string} selector
 * @returns {string[]} without the leading dot
 */
export function classNames(selector) {
  return [...selector.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])
}

// Longest-first so `trust-strip` wins over `trust` when both are offered: a
// section list from a real conversion contains both `hero` and `hero-banner`
// shapes, and the shorter one matching first would swallow the longer one's
// rules.
/**
 * The section a selector belongs to, or `null`.
 *
 * A selector matches a section when any class it mentions equals the section
 * name or begins with it followed by `-` — `.hero`, `.hero-copy` and
 * `.hero-photo` all belong to `hero`, which is how a hand-written stylesheet
 * for a componentised page is actually named.
 *
 * @param {string} selector
 * @param {string[]} sections
 * @returns {string|null}
 */
export function sectionFor(selector, sections) {
  const names = classNames(selector)
  const ordered = [...sections].sort((a, b) => b.length - a.length)
  for (const section of ordered)
    if (names.some((n) => n === section || n.startsWith(`${section}-`)))
      return section
  return null
}

/**
 * Every section a node's subtree mentions. Used to decide whether a top-level
 * `@media` block belongs to one section or spans the page.
 *
 * @param {CssNode} node
 * @param {string[]} sections
 * @returns {Set<string>}
 */
function sectionsWithin(node, sections) {
  const found = new Set()
  const walk = (n) => {
    if (n.type === 'rule' && n.prelude) {
      const hit = sectionFor(n.prelude, sections)
      if (hit) found.add(hit)
    }
    for (const child of n.children ?? []) walk(child)
  }
  walk(node)
  return found
}

const BASE = 'base'
const RESPONSIVE = 'responsive'
const FONTS = 'fonts'

/**
 * The partial a single top-level node belongs to, given the current run.
 *
 * `current` is what makes the result contiguous: a node that matches nothing —
 * a bare `h1`, a comment, a `@keyframes` — stays with whatever section is
 * already open rather than starting a file of its own. That is why a stylesheet
 * split this way has no one-rule partials.
 *
 * @param {CssNode} node
 * @param {string[]} sections
 * @param {string} current the name of the run in progress
 * @returns {string}
 */
function nameFor(node, sections, current) {
  if (node.type === 'at') {
    const keyword = (node.prelude ?? '')
      .slice(1)
      .split(/[\s({]/)[0]
      .toLowerCase()
    // Block-less at-rules are load instructions and must stay at the top of the
    // entry, never inside a partial that gets `@use`d after something else.
    if (node.children === null) return BASE
    if (keyword === 'font-face') return FONTS
    if (
      keyword === 'media' ||
      keyword === 'supports' ||
      keyword === 'container'
    ) {
      const spanned = sectionsWithin(node, sections)
      // One section's breakpoints belong beside that section. A block touching
      // several is the page's responsive layer and splitting it would reorder
      // the cascade, so it is kept whole.
      if (spanned.size === 1) return [...spanned][0]
      if (spanned.size > 1) return RESPONSIVE
      return current || RESPONSIVE
    }
    return current || BASE
  }
  if (node.type === 'rule' && node.prelude) {
    const hit = sectionFor(node.prelude, sections)
    if (hit) return hit
  }
  return current || BASE
}

/**
 * Cuts the node list into contiguous, named segments.
 *
 * Order is never changed: segment _n_ holds nodes that appeared before every
 * node in segment _n+1_. A section whose rules appear in two separate places
 * yields two segments with the same base name, which `splitStylesheet`
 * disambiguates — that is a true report of how the stylesheet is written, not a
 * defect to paper over by merging them and moving the cascade.
 *
 * @param {CssNode[]} nodes
 * @param {string[]} [sections]
 * @param {number} [minNodes] runs smaller than this are folded into the
 * neighbouring segment; merging ADJACENT segments is the only reshaping that
 * cannot move the cascade, which is why this is the one knob offered
 * @returns {CssSegment[]}
 */
export function segmentNodes(nodes, sections = [], minNodes = 1) {
  /** @type {CssSegment[]} */
  const raw = []
  let current = ''
  for (const node of nodes) {
    const name = nameFor(node, sections, current)
    if (name !== current || raw.length === 0) {
      raw.push({ name, nodes: [node] })
      current = name
    } else {
      raw[raw.length - 1].nodes.push(node)
    }
  }

  // Measured on the precedent (AIKB/css-split.md): a section list pitched at
  // element granularity — `kicker`, `stars`, `field` offered as if they were
  // sections — cut 14KB into 51 partials, several holding one rule. That is a
  // different way of being unreadable, not a fix for the first one. Folding a
  // run into its neighbour is safe where nothing else is: the two are already
  // adjacent, so the concatenation order does not change.
  /** @type {CssSegment[]} */
  const segments = []
  for (const segment of raw) {
    const prev = segments[segments.length - 1]
    if (prev && segment.nodes.length < minNodes)
      prev.nodes.push(...segment.nodes)
    else segments.push({ name: segment.name, nodes: [...segment.nodes] })
  }
  // A small leading run has no predecessor to fold into, so it takes the name
  // of what follows rather than leaving a one-rule `_base.scss` at the top.
  if (segments.length > 1 && segments[0].nodes.length < minNodes) {
    segments[1].nodes.unshift(...segments[0].nodes)
    segments.shift()
  }
  // A comment-only run is a banner for whatever follows it, not a file.
  //
  // Merging same-named runs here instead — the output everyone asks for the
  // first time they read this — was tried and watched fail three tests,
  // `preserves cascade order` among them. It is the one change to never make.
  return segments.reduce((acc, segment) => {
    const onlyComments = segment.nodes.every((n) => n.type === 'comment')
    if (onlyComments && acc.length)
      acc[acc.length - 1].nodes.push(...segment.nodes)
    else acc.push(segment)
    return acc
  }, /** @type {CssSegment[]} */ ([]))
}

// ---------------------------------------------------------------------------
// The split
// ---------------------------------------------------------------------------

// THE PARTIALS ARE SCSS, AND SCSS READS TWO THINGS IN PLAIN CSS DIFFERENTLY.
// `toScss` translates the parsed nodes so the compiled output is the CSS the
// browser was given. Both were found by Codex review (2026-10-01), and both
// passed the tests until those compiled the original as plain CSS rather than
// as SCSS too.
//
// 1. `#{…}` is interpolated everywhere — a quoted string, a custom property,
//    a `url()`, a comment — where CSS treats it as text: `content:"#{1+1}"`
//    compiled to `content:"2"`. It is written `#{"#"}{`, an interpolation
//    evaluating to `#` followed by a literal `{`, which dart-sass was measured
//    compiling back to exactly `#{` in every one of those positions. (`#\{`
//    works in a string and is a parse error in a custom property; plain-CSS
//    syntax is no way out, since dart-sass refuses `#{` there too.) Outside a
//    comment, a `#{` behind an ODD run of backslashes is already escaped —
//    CSS and Sass agree on that — and is left alone: shielding it put the
//    source's backslash in front of the shield's own `#`. Inside a comment
//    Sass interpolates regardless of backslashes, so there it always is.
// 2. `@import "x"` is a browser request in CSS and a compile-time import in
//    SCSS, which failed to find `x` or would have inlined a local file of
//    that name. It is written `@import url("x")`, which Sass passes through.

/** @param {string} text */
const shieldAll = (text) => text.replaceAll('#{', '#{"#"}{')

/** @param {string} text */
const shieldUnescaped = (text) =>
  text.replace(/(\\*)#\{/g, (match, slashes) =>
    slashes.length % 2 === 1 ? match : `${slashes}#{"#"}{`,
  )

const STRING_IMPORT = /^@import\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/i

/**
 * @param {CssNode[]} nodes
 * @returns {CssNode[]} new nodes; the input is not touched
 */
function toScss(nodes) {
  return nodes.map((node) => {
    if (node.type === 'comment') return { ...node, text: shieldAll(node.text) }
    const out = { ...node }
    if (node.prelude !== undefined) {
      const prelude = node.prelude.replace(
        STRING_IMPORT,
        (_, url) => `@import url(${url})`,
      )
      out.prelude = shieldUnescaped(prelude)
    }
    if (node.prop !== undefined) out.prop = shieldUnescaped(node.prop)
    if (node.value !== undefined) out.value = shieldUnescaped(node.value)
    if (Array.isArray(node.children)) out.children = toScss(node.children)
    return out
  })
}

/**
 * Splits a stylesheet into a Sass entry plus one partial per segment.
 *
 * The entry is nothing but `@use` lines, in cut order. kiss compiles every
 * non-underscore `.scss` under `folders.assets` and skips partials
 * (`lib/assets.js`), so the output drops into `src/assets/css/` and builds with
 * no config change.
 *
 * @param {string} css the stylesheet source
 * @param {Object} [options]
 * @param {string[]} [options.sections] section names from the HTML decomposition
 * @param {string} [options.entryName] the entry's basename, default `site`
 * @param {string} [options.banner] a comment placed at the top of the entry
 * @param {number} [options.minNodes] smallest run that earns its own file,
 * default 3 — see `segmentNodes`
 * @returns {CssSplitResult}
 */
export function splitStylesheet(css, options = {}) {
  const { sections = [], entryName = 'site', banner, minNodes = 3 } = options
  const nodes = parseStylesheet(css)
  const segments = segmentNodes(nodes, sections, minNodes)

  // Two runs of the same section become `hero` and `hero-2`. Numbering only the
  // repeats keeps the common case clean while still never merging across a gap.
  //
  // A suffix must not take a name some section already HAS. With sections
  // `hero`, `other`, `hero`, `hero-2`, a per-base counter gave the second hero
  // run `hero-2` and then the real `hero-2` the same name: one file
  // overwritten on disk, and a duplicate `@use` that Sass refuses. Every
  // section's own name is reserved up front, so the real `hero-2` keeps it and
  // the repeat goes to `hero-3`; the search loops, as `nameRegions` does.
  //
  // The entry's own name is taken too. `site.scss` beside `_site.scss` makes
  // `@use 'site'` ambiguous — Sass finds both and refuses — so a section
  // called `site` is written as `_site-2.scss`.
  const reserved = new Set(segments.map((s) => s.name))
  const used = new Set([entryName])
  const partials = segments.map((segment) => {
    let name = segment.name
    let n = 1
    while (used.has(name) || (name !== segment.name && reserved.has(name))) {
      n += 1
      name = `${segment.name}-${n}`
    }
    used.add(name)
    return { name, content: formatNodes(toScss(segment.nodes)) }
  })

  const head = banner ? `// ${banner}\n\n` : ''
  const entry =
    head + partials.map((p) => `@use '${p.name}';`).join('\n') + '\n'

  const longestLine = partials.reduce(
    (max, p) =>
      p.content.split('\n').reduce((m, line) => Math.max(m, line.length), max),
    0,
  )

  return {
    entry: { name: `${entryName}.scss`, content: entry },
    partials: partials.map((p) => ({
      name: `_${p.name}.scss`,
      content: p.content,
    })),
    stats: {
      nodes: nodes.length,
      segments: partials.length,
      longestLine,
      bytesIn: Buffer.byteLength(css),
      bytesOut:
        Buffer.byteLength(entry) +
        partials.reduce((sum, p) => sum + Buffer.byteLength(p.content), 0),
    },
  }
}
