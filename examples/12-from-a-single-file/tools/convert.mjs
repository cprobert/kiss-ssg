// The conversion, run ONCE, kept so it can be run again.
//
//   node tools/convert.mjs
//
// It writes into `.converted/`, which is gitignored, and never touches `src/`.
// That separation is the point of the file: the engine does the mechanical
// half — parse, cut, re-indent, split the stylesheet without moving the
// cascade — and then a person does the half it refuses to guess at. `src/` is
// this output after that second pass, so re-running the tool shows you what
// the machine produced without destroying what you added.
//
// Committing this beside `source/original.html` is what makes the conversion
// reproducible. The one real site converted this way kept neither, so nobody
// can now diff what its import produced or re-run it against a better importer.
import fs from 'node:fs/promises'
import path from 'node:path'
import { splitDocument, splitStylesheet } from 'kiss-ssg'

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

// The stylesheet's section names are NOT the region names above. `NAMES` says
// what each region MEANS; `splitStylesheet` matches the CLASS NAMES in the
// selectors, and on this page two of them differ — the chrome is `header` and
// `footer` by meaning and `.site-header` and `.site-footer` in the markup.
//
// So they are derived rather than typed. `splitDocument` puts a `classes`
// array on every region for exactly this, and a derived list cannot drift from
// the markup the way a hand-maintained one can. This file used to carry a
// second literal array here with no explanation of why there were two, and a
// clean-room run following the documented `regions.map((r) => r.name)` on a
// page whose classes were less obliging collapsed nine partials into one,
// silently.
const sectionsFrom = (regions) => regions.flatMap((region) => region.classes)

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
// means choosing a filename and rewriting the tag that pointed at it.
const sheet = splitStylesheet(named.assets.styles.join('\n'), {
  sections: sectionsFrom(named.regions),
  banner: 'Carried over from source/original.html, split by section.',
})
await write(`src/assets/css/${sheet.entry.name}`, sheet.entry.content)
for (const partial of sheet.partials)
  await write(`src/assets/css/${partial.name}`, partial.content)

// Only CLASSIC scripts are lifted. A script's `type` says what its text is:
// `module` needs `type="module"` on the tag that loads it, and JSON-LD or an
// import map is data that has to stay inline. Those stay where they are.
const classic = named.assets.scripts.filter(
  (s) => s.type === '' || s.type === 'text/javascript',
)
for (const [i, script] of classic.entries())
  await write(`src/assets/js/site${i || ''}.js`, `${script.content.trim()}\n`)

const longest = (text) =>
  text.split('\n').reduce((max, line) => Math.max(max, line.length), 0)

console.log(
  `\nWrote ${named.partials.length + sheet.partials.length + 2} files to .converted/`,
)
console.log(
  `  markup    ${named.stats.chrome} chrome + ${named.stats.sections} sections`,
)
console.log(`  stylesheet ${sheet.stats.segments} partials`)
console.log(
  `  longest CSS line ${longest(html)} chars in, ${sheet.stats.longestLine} out`,
)
console.log(`\nStill to do by hand, and only by hand:`)
console.log(`  - lift the copy out of the partials into src/models/index.json`)
console.log(`  - move the facts said twice into config/site.js`)
console.log(
  `  - swap the inline <style>/<script> in the layout for {{asset}} links`,
)
