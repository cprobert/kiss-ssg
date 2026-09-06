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
    { href: 'index.html', label: 'Helpers' },
    { href: 'brew-guide.html', label: 'Brew guide' },
  ],
  folders: {
    src: './5-helpers',
    build: '../public/5-helpers',
    // Partials stay local — two of them are here to be pulled in by the
    // markdown and dynamic-partial demos.
    layouts: sharedFolders.layouts,
    assets: sharedFolders.assets,
  },
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
