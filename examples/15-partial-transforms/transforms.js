// The site's own partial types, handed to `config.transforms` in router.js.
// Each key there is a file extension, and each value says what kiss does to a
// partial of that type every time a page uses it (GUIDE.md § Partial
// transforms).
//
// They live in a module beside the router, not inside it, for the reason
// GUIDE.md § The build script gives for helpers: a function written inside
// router.js cannot be imported, so it cannot be tested. Nothing here imports
// kiss; each one is a plain function from text to HTML.

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** @param {string} text */
export const escapeHtml = (text) => text.replace(/[&<>"']/g, (c) => ENTITIES[c])

/**
 * Splits CSV into rows of cells: commas between cells, double quotes around a
 * cell that holds a comma, and `""` for a quote inside one. Blank lines are
 * skipped.
 *
 * @param {string} text
 * @returns {string[][]}
 */
export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  const endRow = () => {
    row.push(cell)
    if (row.some((value) => value.trim() !== '')) rows.push(row)
    row = []
    cell = ''
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      endRow()
    } else cell += c
  }
  endRow()
  return rows
}

/**
 * `.csv`: a table. The first row is the column headings, and the first cell of
 * every other row heads its row.
 *
 * `compile: false`, because a price list is data rather than a template: kiss
 * hands `render` the file exactly as written, so a brace in a cell stays a
 * brace. Every cell is escaped, because what `render` returns is inserted into
 * the page as it is.
 *
 * The caption comes from the call: `{{> "prices/bar" caption="At the bar"}}`
 * arrives as `hash.caption`.
 */
export const csv = {
  compile: false,
  render(output, { hash }) {
    const [head = [], ...rows] = parseCsv(output)
    const caption = hash.caption
      ? `<caption>${escapeHtml(String(hash.caption))}</caption>`
      : ''
    const headings = head
      .map((cell) => `<th scope="col">${escapeHtml(cell.trim())}</th>`)
      .join('')
    const body = rows
      .map(
        ([first = '', ...rest]) =>
          `<tr><th scope="row">${escapeHtml(first.trim())}</th>${rest
            .map((cell) => `<td>${escapeHtml(cell.trim())}</td>`)
            .join('')}</tr>`,
      )
      .join('')
    return `<table>${caption}<thead><tr>${headings}</tr></thead><tbody>${body}</tbody></table>`
  },
}

/**
 * Splits a recipe into its facts (`key: value` lines, up to the first blank
 * line) and its steps (one per line after it).
 *
 * @param {string} text
 * @returns {{ facts: [string, string][], steps: string[] }}
 */
export function parseRecipe(text) {
  const lines = text.trim().split(/\r?\n/)
  const gap = lines.findIndex((line) => line.trim() === '')
  const factLines = gap === -1 ? lines : lines.slice(0, gap)
  const stepLines = gap === -1 ? [] : lines.slice(gap + 1)
  const facts = factLines.map((line) => {
    const colon = line.indexOf(':')
    return colon === -1
      ? ['', line.trim()]
      : [line.slice(0, colon).trim(), line.slice(colon + 1).trim()]
  })
  const steps = stepLines.map((line) => line.trim()).filter(Boolean)
  return { facts, steps }
}

/**
 * `.recipe`: a brew recipe, as a card with its facts and its numbered steps.
 *
 * No `compile` key, so it is compiled as a template first, like an `.html`
 * partial: a step can say `<a href="{{link "prices"}}">…</a>` and the link is
 * checked like any other. What the template writes is the author's HTML, so it
 * is not escaped. The card's id comes from the partial's name
 * (`recipes/v60` is `recipe-v60`), so a page can link to one recipe.
 */
export const recipe = {
  render(output, { name }) {
    const { facts, steps } = parseRecipe(output)
    const title = facts.find(([key]) => key === 'title')?.[1] ?? name
    const details = facts
      .filter(([key]) => key !== 'title')
      .map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`)
      .join('')
    const list = steps.map((step) => `<li>${step}</li>`).join('')
    const id = `recipe-${name.split('/').pop()}`
    return `<article class="card" id="${id}"><h2>${title}</h2><dl class="recipe-facts">${details}</dl><ol>${list}</ol></article>`
  },
}
