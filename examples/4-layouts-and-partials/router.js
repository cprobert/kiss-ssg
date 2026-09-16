// Tier 0: one file. Layouts and partials live in their own folders because kiss
// puts them there, not because this router was split — the convention in
// llms.txt § The build script is about what leaves `router.js`, and nothing has.
import Kiss from '../../lib/kiss.js'
import { sharedFolders, site, reportBuildFailure } from '../_shared/site.js'

const dev = process.argv.includes('--dev')

const kiss = new Kiss({
  site,
  nav: [
    { href: 'index.html', label: 'The bar' },
    { href: 'stockists.html', label: 'Stockists' },
  ],
  folders: {
    src: '.',
    build: '../../public/4-layouts-and-partials',
    // Layouts and partials are what this example is about, so it keeps its
    // own and borrows only the shared stylesheet.
    assets: sharedFolders.assets,
  },
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
  await kiss.complete().catch(reportBuildFailure)
}
