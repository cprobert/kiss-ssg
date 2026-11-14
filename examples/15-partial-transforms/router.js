// Tier 0, plus one module beside it: `transforms.js` holds the site's own
// partial types, because a function written inside this file cannot be
// imported, and so cannot be tested. There are no custom helpers, so no
// `helpers/` folder (llms.txt § The build script).
import Kiss from 'kiss-ssg'
import { csv, recipe } from './transforms.js'

// Facts the site states more than once. Any extra key on the config reaches
// every view as `config.<key>`, which is how the layout gets the site name
// without each page carrying it in a model.
const site = {
  name: 'Aster & Oak',
  tagline: 'Small-batch coffee, roasted in Bristol',
}

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

const dev = process.argv.includes('--dev')

const kiss = new Kiss({
  site,
  // Pages named by id, never by path: the layout turns each into a URL with
  // `{{link}}`, which fails the build if no page has that id.
  nav: [
    { id: 'index', label: 'This week' },
    { id: 'prices', label: 'Prices' },
    { id: 'brewing', label: 'Brew guide' },
  ],
  // The site's own partial types, by extension. With these two, a `.csv` or
  // `.recipe` file in `src/partials/` is a partial like any other: a page
  // calls `{{> "prices/bar"}}`, and kiss hands the file to `render`.
  // `.md`, `.txt`, `.html` and `.hbs` need no entry: kiss knows them.
  transforms: { csv, recipe },
  dev,
  // A teaching example, not a site: it publishes no share card, favicon or 404
  // page, so the audit's checks for those three are turned off here, by name.
  audit: {
    ignore: ['og-image-missing', 'favicon-missing', 'not-found-missing'],
  },
})
  .page({
    view: 'index.hbs',
    title: 'This week at the bar',
    description:
      'The guest espresso, the roast day and where to find the price list.',
    // The `.md` partial on this page reads it, as any template can.
    model: {
      guest: 'Guji Uraga',
      notes: 'white peach, jasmine and demerara',
    },
  })
  .page({
    view: 'prices.hbs',
    title: 'Prices',
    description: 'What a drink at the bar and a bag to take home cost.',
  })
  .page({
    view: 'brewing.hbs',
    title: 'Brew guide',
    description: 'How we brew our coffee at home: V60 and cafetiere.',
  })
  .generate()

await kiss.complete().catch(reportBuildFailure)
