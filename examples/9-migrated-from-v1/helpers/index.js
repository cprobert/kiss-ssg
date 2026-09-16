// Every custom helper this site adds to the ones kiss ships, composed into the
// single registerHelpers(kiss) that router.js calls.
//
// One helper is enough to earn this folder (llms.txt § The build script). The
// reason is not tidiness: a helper registered inline in router.js cannot be
// imported, so it cannot be unit-tested, and that is as true of the first one
// as of the fourth. The folder costs one file and one import.
import { registerPartialHelpers } from './partials.js'

// Order within this function does not matter; WHEN it is called does. Partials
// are compiled at construction, so a helper registered after `new Kiss()` has
// returned is not there when they render.
export function registerHelpers(kiss) {
  registerPartialHelpers(kiss)
  return kiss
}
