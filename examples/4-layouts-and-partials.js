import Kiss from '../lib/kiss.js'
import { sharedFolders, site, script } from './_shared/site.js'

new Kiss({
  site,
  script: script(import.meta.url),
  nav: [
    { href: 'index.html', label: 'The bar' },
    { href: 'stockists.html', label: 'Stockists' },
  ],
  folders: {
    src: './4-layouts-and-partials',
    build: '../public/4-layouts-and-partials',
    // Layouts and partials are what this example is about, so it keeps its
    // own and borrows only the shared stylesheet.
    assets: sharedFolders.assets,
  },
  verbose: true,
  dev: true,
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
