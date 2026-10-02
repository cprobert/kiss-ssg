// The conversion, run ONCE, kept so it can be run again.
//
//   node tools/convert.mjs
//
// It writes into `.converted/`, which is gitignored, and never touches `src/`.
// That separation is the point of the file: the engine does the mechanical
// half — parse and cut the markup without changing the page — and then a
// person does the half it refuses to guess at. `src/` is
// this output after that second pass, so re-running the tool shows you what
// the machine produced without destroying what you added.
//
// Committing this beside `source/original.html` is what makes the conversion
// reproducible. The one real site converted this way kept neither, so nobody
// can now diff what its import produced or re-run it against a better importer.
import fs from 'node:fs/promises'
import path from 'node:path'
import { splitDocument } from 'kiss-ssg'

const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, '.converted')

// The names. `splitDocument` proposes one per region from the element's `id`,
// then its first class, then its tag — and those are markup names, not
// meaning. The hero is the case to look at: it carries `id="top"` for the
// brand link to jump to, so the proposal is `top`, which says nothing about
// what the region is. Only a reader of the page can fix that, which is why the
// names are an argument rather than something the engine guesses.
const NAMES = [
  'header', // proposed `site-header`
  'hero', // proposed `top`      ← the one that matters
  'offers',
  'beans',
  'visit',
  'enquiry',
  'footer', // proposed `site-footer`
]

const write = async (rel, content) => {
  const target = path.join(out, rel)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, content)
}

const html = await fs.readFile(path.join(root, 'source/original.html'), 'utf8')

const doc = splitDocument(html)
console.log('Regions found, with the name each one proposed:')
for (const region of doc.regions)
  console.log(
    `  ${region.kind.padEnd(8)} <${region.tag}>`.padEnd(24),
    region.name,
  )

const named = splitDocument(html, { names: NAMES })
await write(`src/layouts/${named.layout.name}`, named.layout.content)
await write(`src/pages/${named.page.name}`, named.page.content)
for (const partial of named.partials)
  await write(`src/partials/${partial.name}`, partial.content)

// The `<style>` block is REPORTED by splitDocument, not removed — the document
// it gives back is whole. Lifting it is this script's job, because lifting
// means choosing a filename and rewriting the tag that pointed at it. It is
// lifted WHOLE, as plain `.css`: kiss serves a `.css` asset unchanged, so the
// stylesheet the browser gets is the one the artifact had. Passing it through
// Sass would not be — SCSS reads plain CSS differently in places (`#{`, a
// string `@import`, native nesting).
//
// Only when EVERY `<style>` is unconditional. One with an attribute —
// `media="print"`, `title`, `nonce` — means something a merged file cannot
// say, and lifting the others around it would reorder the cascade, so then
// none are lifted and they all stay inline where the page had them.
const conditional = named.assets.styles.filter((s) => s.attrs.trim() !== '')
if (conditional.length === 0)
  await write(
    'src/assets/css/site.css',
    `${named.assets.styles
      .map((s) => s.content)
      .join('\n')
      .trim()}\n`,
  )
else
  console.log(
    `\n${conditional.length} <style> block(s) carry attributes, so no stylesheet was lifted: they stay inline in the layout.`,
  )

// Only CLASSIC scripts are lifted. A script's `type` says what its text is:
// `module` needs `type="module"` on the tag that loads it, and JSON-LD or an
// import map is data that has to stay inline. Those stay where they are.
const classic = named.assets.scripts.filter(
  (s) => s.type === '' || s.type === 'text/javascript',
)
for (const [i, script] of classic.entries())
  await write(`src/assets/js/site${i || ''}.js`, `${script.content.trim()}\n`)

console.log(
  `\nWrote ${named.partials.length + 3 + classic.length} files to .converted/`,
)
console.log(
  `  markup     ${named.stats.chrome} chrome + ${named.stats.sections} sections`,
)
console.log(`  stylesheet site.css, whole`)
console.log(`\nStill to do by hand, and only by hand:`)
console.log(`  - lift the copy out of the partials into src/models/index.json`)
console.log(`  - move the facts said twice into config/site.js`)
console.log(
  `  - swap the inline <style>/<script> in the layout for {{asset}} links`,
)
