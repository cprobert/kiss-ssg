import Kiss from '../lib/kiss.js'
import { sharedFolders, site, script } from './_shared/site.js'

new Kiss({
  site,
  script: script(import.meta.url),
  nav: [
    { href: 'index.html', label: 'Today on the shelf' },
    { href: 'about.html', label: 'The roastery' },
  ],
  folders: { src: './2-page', build: '../public/2-page', ...sharedFolders },
  verbose: true,
  dev: true,
})
  // View only. models/index.json and controllers/index.js are picked up
  // because their filenames match the view's.
  .page({ view: 'index.hbs' })

  // The same three parts, named explicitly rather than matched.
  .page({
    view: 'about.hbs',
    model: 'about.json',
    controller: 'about.js',
  })

  // Not every page is HTML: an object model, a controller written inline, and
  // `ext` to land the output at feed.xml instead of feed.html.
  .page({
    view: 'feed.hbs',
    ext: 'xml',
    model: {
      updated: '2026-02-19',
      items: [
        { title: 'Guji Uraga landed', note: 'Peach, jasmine, a lot of it.' },
        {
          title: 'Last of the Kenya',
          note: 'Nine bags left, then it is gone.',
        },
      ],
    },
    controller: ({ model }) => ({
      title: 'Roast notes',
      model: { ...model, count: model.items.length },
    }),
  })

  // A view can also be the template itself. A template string has no file path
  // to infer from, so it gets its slug spelled out.
  .page({
    view: `<!doctype html><html lang="en"><head><meta charset="utf-8">
      <title>{{model.name}}</title><link rel="stylesheet" href="css/site.css"></head>
      <body><main class="wrap"><h1>{{model.name}}</h1><p>{{model.note}}</p>
      <p><a href="index.html">Back to the shop</a></p></main></body></html>`,
    model: {
      name: 'Hello from a template string',
      note: 'No .hbs file was read to build this page — the view was the markup itself.',
    },
    slug: 'hello-snippet',
  })

  .generate(function () {
    this.viewStats()
  })
