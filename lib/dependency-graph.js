// Which pages rendered which partials, learned by watching renders happen.
//
// A partial is registered as a function that records "page X invoked me"
// (lib/partials.js) before delegating to the compiled template, and a page
// clears its own edges before each render (lib/kiss-page.js). So after any
// build the graph says, for every partial a page actually reached — through
// nesting, `{{> (lookup …)}}`, or a layout's `{{#extend}}` — which pages must
// be re-rendered when that partial changes. Nothing here parses a template:
// a dynamic partial name cannot be resolved statically, and this never tries.
//
// Two answers are deliberately different. `dependentsOf` returns `null` for a
// partial no page has ever recorded — the caller re-renders everything, because
// "never seen" usually means "not rendered yet" — and `[]` for one that was
// recorded and has since lost every page, which is a real answer: an edit to
// a partial no page uses changes no output.

export class DependencyGraph {
  /** @type {Map<string, Set<string>>} partial name → page keys @private */
  _dependents = new Map()
  /** @type {Map<string, Set<string>>} page key → partial names @private */
  _uses = new Map()

  /**
   * @param {string} page the page's key — its `buildTo`
   * @param {string} partial the partial's registered name
   */
  record(page, partial) {
    if (!this._dependents.has(partial)) this._dependents.set(partial, new Set())
    this._dependents.get(partial)?.add(page)
    if (!this._uses.has(page)) this._uses.set(page, new Set())
    this._uses.get(page)?.add(partial)
  }

  /** @param {string} page */
  clearPage(page) {
    for (const partial of this._uses.get(page) ?? [])
      this._dependents.get(partial)?.delete(page)
    this._uses.delete(page)
  }

  clear() {
    this._dependents.clear()
    this._uses.clear()
  }

  /**
   * @param {string} partial
   * @returns {string[] | null} sorted page keys, or `null` if never recorded
   */
  dependentsOf(partial) {
    const pages = this._dependents.get(partial)
    return pages ? [...pages].sort() : null
  }

  /**
   * @param {string} page
   * @returns {string[]} sorted partial names
   */
  usesOf(page) {
    return [...(this._uses.get(page) ?? [])].sort()
  }

  /** @returns {number} how many partials are known */
  get size() {
    return this._dependents.size
  }

  /** @returns {Record<string, string[]>} `{ [partial]: pages }`, both sorted */
  toJSON() {
    return Object.fromEntries(
      [...this._dependents.keys()]
        .sort()
        .map((partial) => [partial, this.dependentsOf(partial) ?? []]),
    )
  }
}
