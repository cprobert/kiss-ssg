import Kiss from '../lib/kiss.js'
import { sharedFolders, site, script } from './_shared/site.js'

new Kiss({
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
  verbose: true,
  dev: true,
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
