// Every custom helper this site adds to the ones kiss ships, composed into the
// single registerHelpers(kiss) that kiss calls. Nothing in router.js imports
// this file: `config.folders.helpers` defaults to `./helpers`, and kiss loads
// this entry and calls the export itself.
//
// One helper is enough to earn this folder (llms.txt § The build script). The
// reason is not tidiness: a helper registered inline in router.js cannot be
// imported, so it cannot be unit-tested, and that is as true of the first one
// as of the fourth. The folder costs one file and one import.
import { registerPartialHelpers } from './partials.js'

// Order within this function does not matter, and neither does when it runs.
// Handlebars resolves a helper from the registry at RENDER time, not when a
// template is compiled, so anything registered before `.generate()` renders is
// in place — in pages and inside partials alike. The opposite was written here,
// and in llms.txt, for a long time; it was measured false, and it is what made
// kiss-side loading look impossible.
export function registerHelpers(kiss) {
  registerPartialHelpers(kiss)
  return kiss
}
