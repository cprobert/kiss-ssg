// Where the code is in a Markdown file, for the repo's own readers of
// Markdown: the manifest test's link check and the docs site's guide pages.
// Markdown never makes a link or a heading inside code, so a reader that
// matches `](` or `#### ` has to skip code first, and two readers that each
// guessed where code ends disagreed with CommonMark in different ways
// (2026-10-30: a regex in a fenced block failed the link check).
//
// It follows CommonMark where CommonMark decides what is code. A fenced block
// opens on a run of three or more backticks or tildes, indented at most three
// spaces, and a backtick fence's info string holds no backtick. It closes only
// on a run of the same character at least as long, on a line of its own, or at
// the end of the file. An inline code span is an unescaped backtick run closed
// by a run of exactly the same length. It never crosses a blank line or a
// fence, so a stray backtick hides nothing past its own paragraph. It is not a
// full parser: a fence indented four or more spaces inside a list item is not
// seen as one.

const FENCE_OPEN = /^ {0,3}(?:(`{3,})(?!.*`)|(~{3,}))/
const SPAN = /(?<![`\\])(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?(?<!`)\1(?!`)/g

/**
 * Which lines belong to a fenced code block, its fence lines included.
 *
 * @param {string[]} lines
 * @returns {boolean[]}
 */
export function fencedLines(lines) {
  const inside = []
  /** @type {RegExp | null} */
  let close = null
  for (const line of lines) {
    if (close) {
      if (close.test(line)) close = null
      inside.push(true)
      continue
    }
    const open = FENCE_OPEN.exec(line)
    if (open) {
      const run = open[1] ?? open[2]
      close = new RegExp(`^ {0,3}${run[0]}{${run.length},}\\s*$`)
    }
    inside.push(Boolean(open))
  }
  return inside
}

/**
 * The text with `edit` applied to everything outside code: fenced blocks and
 * inline code spans come back exactly as they were.
 *
 * @param {string} text
 * @param {(prose: string) => string} edit
 * @returns {string}
 */
export function outsideCode(text, edit) {
  const lines = text.split(/\r?\n/)
  const fenced = fencedLines(lines)
  const out = []
  /** @type {string[]} */
  let prose = []
  const flush = () => {
    if (prose.length) out.push(editProse(prose.join('\n'), edit))
    prose = []
  }
  lines.forEach((line, i) => {
    if (fenced[i]) {
      flush()
      out.push(line)
    } else prose.push(line)
  })
  flush()
  return out.join('\n')
}

/**
 * The text with its code removed. A fenced block's lines become blank lines,
 * since a fence ends the paragraph around it, and an inline span is dropped.
 *
 * @param {string} text
 * @returns {string}
 */
export function withoutCode(text) {
  const lines = text.split(/\r?\n/)
  const fenced = fencedLines(lines)
  return lines
    .map((line, i) => (fenced[i] ? '' : line))
    .join('\n')
    .replace(SPAN, '')
}

/**
 * @param {string} text prose with no fenced block in it
 * @param {(prose: string) => string} edit
 */
function editProse(text, edit) {
  let result = ''
  let last = 0
  for (const span of text.matchAll(SPAN)) {
    result += edit(text.slice(last, span.index)) + span[0]
    last = span.index + span[0].length
  }
  return result + edit(text.slice(last))
}
