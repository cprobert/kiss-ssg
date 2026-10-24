// Tier 0: one file. Learning packages are a page option and one config key,
// not code to lift out. See GUIDE.md § Learning packages.
import Kiss from 'kiss-ssg'

// A failed build must be loud: print each failing page and exit non-zero,
// rather than exiting 0 with a page quietly missing. The recipe llms.txt shows.
function reportBuildFailure(err) {
  console.error(err.message)
  for (const failure of err.failures ?? []) {
    console.error(
      `  ${failure.buildTo || failure.view}: ${failure.error.message}`,
    )
  }
  process.exitCode = 1
}

const kiss = new Kiss({
  site: { name: 'Aster & Oak Barista School' },
  // A learning package is opened by an LMS, never browsed or shared: no link
  // preview card, no favicon in a tab, no 404 page for a URL typed wrong.
  audit: {
    ignore: ['og-image-missing', 'favicon-missing', 'not-found-missing'],
  },
  // Every page that names a `package` is packed; this says how. Both formats
  // from the same pages: an IMS content package (shown, not tracked) and
  // SCORM 1.2 (tracked). The title is what the LMS shows for the package.
  packages: {
    format: ['imscp', 'scorm12'],
    title: (id, pages) => pages[0].model.lesson,
  },
})

// Shape 1, one SCO per page. Each page of the lesson is its own SCO: the LMS
// tracks each one, and its table of contents moves the learner between them.
// So these pages do not link to each other (a link between SCOs would open one
// inside the other, and the package report says so). Each `id` is a promise:
// the LMS keeps a learner's record by the identifier made from it, so it
// stays the same when a page moves.
const espresso = { lesson: 'Espresso basics' }
kiss
  .page({
    view: 'espresso/grind.hbs',
    id: 'espresso-grind',
    title: 'The grind',
    description: 'Why espresso needs a fine, even grind, and how to change it.',
    package: 'espresso-basics',
    model: espresso,
  })
  .page({
    view: 'espresso/extraction.hbs',
    id: 'espresso-extraction',
    title: 'Extraction',
    description: 'A shot as a recipe: dose in, weight out, in a time.',
    package: 'espresso-basics',
    model: espresso,
  })

// Shape 2, one SCO with many views. The whole lesson is one page, whose own
// navigation shows one view at a time from the address: one SCO, one session,
// one attempt in the LMS. Its question records the answer through
// `window.kissScorm`, and the page marks itself complete when it is answered.
kiss.page({
  view: 'milk/index.hbs',
  id: 'milk-texture',
  title: 'Milk texture',
  description: 'Steaming and pouring milk, with one question.',
  package: 'milk-texture',
  model: { lesson: 'Milk texture' },
})

kiss.generate()

try {
  await kiss.complete()
  for (const p of kiss.report().packages ?? []) {
    const n = p.pages.length
    console.log(`${p.file}  ${p.title}  (${n} page${n === 1 ? '' : 's'})`)
    for (const o of p.outside) console.log(`  outside: ${o.href} (${o.reason})`)
  }
} catch (err) {
  reportBuildFailure(err)
}
