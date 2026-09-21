// Tier 0: one file. Layouts and partials live in their own folders because kiss
// puts them there, not because this router was split — the convention in
// llms.txt § The build script is about what leaves `router.js`, and nothing has.
//
// Note what is NOT here: a `folders` block. `src: './src'` and `build:
// './public'` are the defaults, so a site laid out the ordinary way configures
// nothing. That is the point of the convention — see CLAUDE.md § Design
// philosophy — and every example in this folder is shaped the way a real
// project is, so you can copy one wholesale.
import Kiss from 'kiss-ssg'

const dev = process.argv.includes('--dev')

// Facts the site states more than once. Any extra key on the config reaches
// every view as `config.<key>`, which is how the layout gets the site name
// without each page carrying it in a model.
const site = {
  name: 'Aster & Oak',
  tagline: 'Small-batch coffee, roasted in Bristol',
}

const kiss = new Kiss({
  site,
  nav: [
    { href: 'index.html', label: 'The bar' },
    { href: 'stockists.html', label: 'Stockists' },
  ],
  verbose: true,
  dev,
})
  .page({
    view: 'index.hbs',
    title: 'The bar',
    model: {
      buyer: 'Tom',
      // The name of the partial to drop in — chosen by the model, resolved
      // by the template at render time.
      partials: { board: 'boards/espresso' },
    },
  })
  .page({
    view: 'stockists.hbs',
    title: 'Stockists',
    model: {
      buyer: 'Priya',
      partials: { board: 'boards/filter' },
    },
  })
  .generate()

if (!dev) {
  // A failed build must be loud: print each failing page and exit non-zero,
  // rather than exiting 0 with a page missing. The recipe llms.txt shows.
  await kiss.complete().catch((err) => {
    console.error(err.message)
    for (const failure of err.failures ?? []) {
      console.error(
        `  ${failure.buildTo || failure.view}: ${failure.error.message}`,
      )
    }
    process.exitCode = 1
  })
}
