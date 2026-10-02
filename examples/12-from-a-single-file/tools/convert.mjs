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

// The inline `<style>` and `<script>` are REPORTED by splitDocument, not
// removed, and this conversion leaves them where they are: in the layout,
// byte for byte, the stylesheet whole. Lifting them into files is an
// improvement, not part of the conversion — a move can reorder the cascade
// around an external `<link>`, change what a relative `url()` resolves
// against, and with `defer` change when a script runs. This site's
// `css/site.css` and `js/site.js` were lifted afterwards, by hand, once
// `compare.mjs` had passed; `assets` says what there is to lift.
const { styles, scripts } = named.assets

console.log(`\nWrote ${named.partials.length + 2} files to .converted/`)
console.log(
  `  markup     ${named.stats.chrome} chrome + ${named.stats.sections} sections`,
)
console.log(
  `  inline     ${styles.length} <style>, ${scripts.length} <script> — left in the layout, whole`,
)
console.log(`\nStill to do by hand, and only by hand:`)
console.log(`  - lift the copy out of the partials into src/models/index.json`)
console.log(`  - move the facts said twice into config/site.js`)
console.log(
  `  - then, as an improvement once compare.mjs passes: lift the <style>/<script> into {{asset}} files`,
)
