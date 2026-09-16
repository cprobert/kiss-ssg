// Tier 0 of the build-script convention (llms.txt § The build script): one
// file, and at 27 lines that is not a stage to grow out of — it is the right
// answer. Split when the custom helpers pass about a third of the file or there
// are more than about three of them; a `helpers/` folder here would be the cost
// of the convention with none of its benefit.
import Kiss from '../../lib/kiss.js'
import { sharedFolders, site, reportBuildFailure } from '../_shared/site.js'

const dev = process.argv.includes('--dev')

const kiss = new Kiss({
  site,
  nav: [
    { href: 'index.html', label: 'Home' },
    { href: 'about/us.html', label: 'About us' },
  ],
  folders: {
    src: '.',
    build: '../../public/1-scan',
    // Explicit folders beat the ones derived from `src`, so pages, models and
    // controllers stay local while the look comes from _shared.
    ...sharedFolders,
  },
  verbose: true,
  dev,
})
  .scan()
  .generate()

if (!dev) {
  await kiss.complete().catch(reportBuildFailure)
}
