// Tier 0: one file — and worth saying why, because this is the helpers example.
// Every helper shown here is one kiss ships, so there is nothing custom to
// extract. The `helpers/` folder in llms.txt § The build script is earned by
// YOUR helpers outgrowing the route table, and a site can use all six built-ins
// without ever writing one.
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
    { href: 'index.html', label: 'Helpers' },
    { href: 'brew-guide.html', label: 'Brew guide' },
  ],
  // No `folders` block: `src: './src'` and `build: './public'` are the
  // defaults, so a site laid out the ordinary way configures nothing.
  verbose: true,
  dev,
  // A second site can run alongside the others as long as both ports differ.
  port: 8080,
  livereloadPort: 35730,
})
  .page({
    view: 'index.hbs',
    title: 'Six built-in helpers',
    model: {
      tastingNotes:
        '**Guji Uraga** — white peach, jasmine, demerara.\n\nRoasted 18 February, best from the 22nd.',
      steps: [
        'Weigh 15 g of coffee, ground like table salt.',
        'Rinse the paper, tip the grounds in, level them.',
        'Bloom with 50 g of water for 40 seconds.',
        'Pour to 250 g in two goes, finishing by 2:15.',
      ],
      // The template does not name this partial; the model does.
      partials: { dynamic: 'grinder-note' },
    },
  })
  .page({
    view: 'brew-guide.hbs',
    title: 'Brew guide',
    model: {
      intro:
        'Three recipes we actually use behind the bar. Scale them, do not agonise over them.',
      recipes: [
        { name: 'V60, one cup', ratio: '15 g : 250 g', time: '2:15' },
        { name: 'Cafetiere, one litre', ratio: '60 g : 1000 g', time: '4:00' },
        { name: 'Espresso, Arch Blend', ratio: '18 g : 38 g', time: '0:28' },
      ],
    },
  })
  .generate(() => {
    console.log('generate: every page has been written')
  })

// `.complete()` rejects once per build — dev and build-and-exit are mutually
// exclusive branches, so each calls it at most once.
if (dev) {
  kiss.complete(() => {
    console.log('complete: the build has finished draining')
  })
} else {
  await kiss
    .complete(() => {
      console.log('complete: the build has finished draining')
    })
    .catch(reportBuildFailure)
}
