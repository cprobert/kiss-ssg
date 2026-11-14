// The links and images in a markdown-it parse, for the repo's two readers of
// Markdown links: the manifest test, which checks a skill's links resolve, and
// the docs site's guide pages, which rewrite GUIDE.md's links. One walk, so
// the two cannot disagree on what counts as a link: a `link_open` or an
// `image` token, at any depth. Code and raw HTML are not tokens of either
// kind, so they are never in the list.

/**
 * Every link and image token in a parse, in document order. The tokens are
 * the parser's own, so a caller may set the target attribute (`targetAttr`)
 * and render them.
 *
 * @param {any[]} tokens what markdown-it's `parse` returns
 * @returns {any[]}
 */
export function linkTokens(tokens) {
  const found = []
  const walk = (list) => {
    for (const token of list) {
      if (token.type === 'link_open' || token.type === 'image')
        found.push(token)
      if (token.children) walk(token.children)
    }
  }
  walk(tokens)
  return found
}

/**
 * The attribute holding a token's target: `src` for an image, `href` for a
 * link.
 *
 * @param {any} token a `link_open` or `image` token
 * @returns {'src' | 'href'}
 */
export const targetAttr = (token) => (token.type === 'image' ? 'src' : 'href')

/**
 * A token's target as the file name it points at: a parser percent-encodes
 * the destination (`<two words.md>` becomes `two%20words.md`), and a file on
 * disk has the space. A target that does not decode is returned as written.
 *
 * @param {any} token a `link_open` or `image` token
 * @returns {string}
 */
export function targetPath(token) {
  const target = token.attrGet(targetAttr(token))
  try {
    return decodeURI(target)
  } catch {
    return target
  }
}
