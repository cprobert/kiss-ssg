import Kiss from '../lib/kiss.js'
import {
  sharedFolders,
  site,
  script,
  reportBuildFailure,
} from './_shared/site.js'

const dev = process.argv.includes('--dev')

const kiss = new Kiss({
  site,
  script: script(import.meta.url),
  nav: [
    { href: 'index.html', label: 'Home' },
    { href: 'about/index.html', label: 'About' },
    { href: 'stockists/index.html', label: 'Stockists' },
  ],
  folders: {
    src: './6-sitemap',
    build: '../public/6-sitemap',
    ...sharedFolders,
  },
  // The sitemap needs to know where the site will live; without it kiss logs
  // an error and skips the file rather than guessing.
  siteUrl: 'https://asterandoak.example',
  // Pages build to <slug>/index.html, so every URL in the sitemap is a folder.
  extensionLess: true,
  // The only example that turns cache busting on: the shared layout's
  // `{{asset 'css/site.css'}}` renders a hashed filename here and the plain
  // path in the other five, from the same line.
  assets: { hash: true },
  verbose: true,
  dev,
})
  .page({ view: 'index.hbs' })
  .page({ view: 'about.hbs' })

  // Linked from nowhere and deliberately left out of the sitemap.
  .page({ view: 'rota.hbs', ignoreSitemap: true })

  // Changes weekly and matters less than the front page, so it says so.
  .page({
    view: 'stockists.hbs',
    sitemapPriority: '0.5',
    sitemapChangefreq: 'weekly',
  })
  .generate()
  .sitemap({}, function (urls) {
    console.log('sitemap.xml lists:', urls)
  })

  // The sitemap's sibling: llms.txt, the llmstxt.org index an answer engine
  // reads first. Same registry, same URLs — `rota` is out of both, because a
  // page kept out of the sitemap is kept out of this too. The summary is
  // inline here; a path to a `.md` file would be read instead.
  .llms({
    title: 'Aster & Oak',
    summary:
      'A small-batch coffee roastery in Bristol. Beans, brewing notes and the shops that stock us.',
    sections: { root: 'Pages' },
    notes: 'Prices and opening hours change seasonally.',
  })

if (!dev) {
  await kiss.complete().catch(reportBuildFailure)
}
