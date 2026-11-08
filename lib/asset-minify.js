import fs from 'fs-extra'
import path from 'node:path'
import { minify as terser } from 'terser'
import CleanCSS from 'clean-css'
import postcss from 'postcss'

// Minifies a stylesheet or script the asset copy wrote, in place, before it is
// hashed: the same two minifiers the page minifier already loads for inline
// CSS and JS (`html-minifier-terser` → terser and clean-css), so a production
// build ships its copied `.css` and `.js` the way it ships its HTML.
//
// Measured on the fleet (planning/research/2026-11-04-static-site-performance.md
// § Measured — CSS and JS): an unminified file is about 17% smaller after
// Brotli once minified, an already-minified one about 1–2%. Cheap, and never
// worse, so it is on by default and skipped where it cannot help.

const MINIFIED = /\.min\.(?:css|m?js)$/i
const SCRIPT = /\.m?js$/i
const STYLE = /\.css$/i

/**
 * Whether a copied file is one this module minifies: a `.css`, `.js` or
 * `.mjs` that is not already `*.min.*`.
 *
 * @param {string} relative the file's build-relative name
 * @returns {boolean}
 */
export function shouldMinify(relative) {
  if (MINIFIED.test(relative)) return false
  return SCRIPT.test(relative) || STYLE.test(relative)
}

/**
 * A stylesheet with its formatting taken out: the whitespace PostCSS keeps
 * between nodes, and every comment between rules and declarations but a `/*!`
 * licence one (a comment inside a selector, value or params stays). No selector,
 * at-rule parameter or value is touched, so nothing a browser reads changes.
 * It is what a stylesheet clean-css cannot read gets instead: clean-css 5
 * does not understand native nesting, which Tailwind v4 writes, and PostCSS
 * does (the clean room, 2026-11-08: a purged Tailwind sheet shipped at
 * 10,613 bytes; compacted, 8,492, with no computed-style difference).
 *
 * @param {string} text
 * @returns {string}
 * @throws when PostCSS cannot parse it either
 */
export function compactCss(text) {
  const root = postcss.parse(text)
  root.walkComments((comment) => {
    if (!comment.text.startsWith('!')) comment.remove()
  })
  root.walk((node) => {
    node.raws.before = ''
    if (node.type === 'decl') {
      node.raws.between = ':'
      if (node.important) node.raws.important = '!important'
    } else if (node.type === 'rule' || node.type === 'atrule') {
      node.raws.between = ''
      node.raws.after = ''
      node.raws.semicolon = false
      // `@media(x)` needs no space, and adding one grows the file.
      if (node.type === 'atrule')
        node.raws.afterName =
          node.params && !node.params.startsWith('(') ? ' ' : ''
    }
  })
  root.raws.after = ''
  root.raws.semicolon = false
  return root.toString()
}

/**
 * One file's bytes, minified. A script is an ES module when it is `.mjs` or
 * when terser cannot read it as a classic script, so `import`/`export` and a
 * top-level `await` survive.
 *
 * @param {string} relative the file's name, which decides CSS or JS
 * @param {string} text
 * @returns {Promise<string>}
 * @throws when the minifier cannot parse the file
 */
export async function minifyText(relative, text) {
  if (STYLE.test(relative)) {
    const out = new CleanCSS({ level: 1, returnPromise: false }).minify(text)
    // An error, or a warning, means clean-css could not read all of it, and
    // a warning can mean most of the file is wrong: version 5 does not
    // understand native CSS nesting, so `.child { … }` inside a rule vanished
    // and `&:hover` was hoisted out of its parent, with seven warnings and no
    // error (Codex at the close, 2026-11-05). Its output is never used then:
    // the stylesheet is compacted instead, which only removes formatting.
    if (out.errors.length > 0 || out.warnings.length > 0) {
      try {
        return compactCss(text)
      } catch (error) {
        throw new Error(
          `left unminified, neither minifier could read all of it (${out.errors[0] ?? out.warnings[0]}; ${/** @type {Error} */ (error).message})`,
          { cause: error },
        )
      }
    }
    return out.styles
  }
  const options = { compress: true, mangle: true, format: { comments: false } }
  const asModule = /\.mjs$/i.test(relative)
  try {
    return (await terser(text, { ...options, module: asModule })).code ?? text
  } catch (error) {
    if (asModule) throw error
    return (await terser(text, { ...options, module: true })).code ?? text
  }
}

/**
 * Minifies `file` in place. Never fails the build: a file the minifier cannot
 * read is left exactly as it was, and the caller is told why.
 *
 * @param {string} file the path on disk
 * @param {string} relative its build-relative name
 * @returns {Promise<{ ok: true, before: number, after: number } | { ok: false, error: string }>}
 */
export async function minifyFile(file, relative) {
  try {
    const text = await fs.readFile(file, 'utf8')
    const out = await minifyText(relative, text)
    // A minifier that grows a file (a tiny one with a licence banner) is
    // worse than none: keep the original.
    if (Buffer.byteLength(out) >= Buffer.byteLength(text))
      return { ok: true, before: text.length, after: text.length }
    await fs.writeFile(file, out)
    return {
      ok: true,
      before: Buffer.byteLength(text),
      after: Buffer.byteLength(out),
    }
  } catch (error) {
    return {
      ok: false,
      error: `${path.posix.basename(relative)}: ${/** @type {Error} */ (error).message}`,
    }
  }
}
