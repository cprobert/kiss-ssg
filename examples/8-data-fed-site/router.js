// Tier 0: one file. The validation that makes this example what it is lives in
// a controller, which is where kiss already puts it — not a seam this convention
// adds. See llms.txt § The build script.
import Kiss from 'kiss-ssg'
import { missingFields, slugFor } from './src/controllers/stockist.js'

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

// `'atomic'` is what a publishing pipeline wants — and it is why this run,
// which fails one page on purpose, would publish nothing at all: a failed
// build discards the staging folder and leaves the last good output untouched.
// Pass --atomic to watch that happen. The default is a plain clean build so
// the five good pages are on disk to look at after the failure.
const cleanBuild = process.argv.includes('--atomic') ? 'atomic' : true

const kiss = new Kiss({
  site,
  nav: [{ href: 'index.html', label: 'Where to buy' }],
  // No `folders` block: `src: './src'` and `build: './public'` are the
  // defaults, so a site laid out the ordinary way configures nothing.
  siteUrl: 'https://asterandoak.example',
  // The layout asks for `css/site.css`; the config decides it ships as
  // css/site.<hash>.css. No template changes when the policy does.
  assets: { hash: true },
  cleanBuild,
  verbose: true,
  dev,
  port: 3008,
  livereloadPort: 35738,
})

kiss
  // The fan-out: one JSON file per stockist in models/stockists, one page each
  // from a single view. Adding the seventh shop means writing the seventh file.
  .pages({
    view: 'stockists/stockist.hbs',
    model: 'stockists',
    // .pages() takes the output folder from `path`; it does not infer one.
    path: 'stockists',
    // A controller file, resolved by name from folders.controllers. It
    // validates the record and derives the slug — the two jobs a feed-fed
    // fan-out always has. One bad record fails only its own page, and
    // complete() names it `stockists/stockist.hbs [item N: <slug>]`.
    controller: 'stockist.js',
  })
  // The index reads the same folder and reports against the same validator, so
  // it can say which record is broken instead of quietly omitting it.
  .page({
    view: 'index.hbs',
    title: 'Where to buy',
    model: 'stockists',
    controller: ({ model }) => ({
      model: {
        stocked: model
          .filter((record) => missingFields(record).length === 0)
          .map((record) => ({ ...record, slug: slugFor(record) })),
        incomplete: model
          .filter((record) => missingFields(record).length > 0)
          .map((record) => ({
            name: record.name ?? '(unnamed)',
            key: record.slug ?? '(no slug)',
            missing: missingFields(record).join(', '),
          })),
      },
    }),
  })
  .generate()
  .sitemap()

if (!dev) {
  // Without this await a broken feed exits 0 and ships a site with a hole in
  // it. reportBuildFailure prints each failure and sets the exit code.
  await kiss.complete().catch(reportBuildFailure)
}
