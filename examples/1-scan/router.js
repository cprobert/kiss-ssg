// Tier 0 of the build-script convention (llms.txt § The build script): one
// file, and at 49 lines that is not a stage to grow out of — it is the right
// answer. Split when the custom helpers pass about a third of the file or there
// are more than about three of them; a `helpers/` folder here would be the cost
// of the convention with none of its benefit.
import Kiss from 'kiss-ssg'

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
  nav: [
    { href: 'index.html', label: 'Home' },
    { href: 'about/us.html', label: 'About us' },
  ],
  // No `folders` block: `src: './src'` and `build: './public'` are the
  // defaults, so a site laid out the ordinary way configures nothing.
  verbose: true,
  dev,
  // A teaching example, not a site: it publishes no share card, favicon or 404
  // page, so the audit's checks for those three are turned off here, by name.
  audit: {
    ignore: ['og-image-missing', 'favicon-missing', 'not-found-missing'],
  },
})
  .scan()
  .generate()

await kiss.complete().catch(reportBuildFailure)
