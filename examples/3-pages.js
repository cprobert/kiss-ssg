import Kiss, { utils } from '../lib/kiss.js'
import { sharedFolders, site, script } from './_shared/site.js'

const kiss = new Kiss({
  site,
  script: script(import.meta.url),
  nav: [
    { href: 'index.html', label: 'Home' },
    { href: 'roasts/index.html', label: 'Roasts', folderMatch: true },
  ],
  folders: { src: './3-pages', build: '../public/3-pages', ...sharedFolders },
  verbose: true,
  dev: true,
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
