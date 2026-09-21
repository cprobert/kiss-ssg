// Tier 0: one file. A fan-out does not by itself earn a seam — what earns one
// is helpers outgrowing the route table, or a fact appearing in both the markup
// and the structured data. Neither has happened here.
import Kiss, { utils } from 'kiss-ssg'

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
    { href: 'roasts/index.html', label: 'Roasts', folderMatch: true },
  ],
  verbose: true,
  dev,
})

// Every roast is one JSON file in models/roasts. Naming the folder as the
// model hands .pages() the whole array, and it fans out one page per entry.
kiss
  .page({ view: 'index.hbs' })
  .pages({
    view: 'roasts/roast.hbs',
    model: 'roasts',
    // .pages() takes the output folder from `path`; unlike .page() it does
    // not infer one from the view's location.
    path: 'roasts',
    controller: ({ model }) => ({
      // Without a slug of its own each page would be roast-0, roast-1, …
      slug: utils.toSlug(model.name),
      model,
    }),
  })
  .generate(function (data) {
    // The fan-out already resolved the folder; getModelByID pulls that same
    // array back out of the build data to build the index from it.
    const roasts = this.getModelByID('roasts', data)
    this.page({
      view: 'roasts/index.hbs',
      title: 'Every roast',
      model: roasts,
      controller: ({ model }) => ({
        model: model.map((roast) => ({
          ...roast,
          slug: utils.toSlug(roast.name),
        })),
      }),
    }).generate(function () {
      this.viewStats()
    })
  })

if (!dev) {
  await kiss.complete().catch(reportBuildFailure)
}
