import Kiss from '../lib/kiss.js'
import { sharedFolders, site, script } from './_shared/site.js'

new Kiss({
  site,
  script: script(import.meta.url),
  nav: [
    { href: 'index.html', label: 'Home' },
    { href: 'about/us.html', label: 'About us' },
  ],
  folders: {
    src: './1-scan',
    build: '../public/1-scan',
    // Explicit folders beat the ones derived from `src`, so pages, models and
    // controllers stay local while the look comes from _shared.
    ...sharedFolders,
  },
  verbose: true,
  dev: true,
})
  .scan()
  .generate()
