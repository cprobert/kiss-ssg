// Whether the module at `filename` is the program node was started with, so
// a script runs its command line only then, and not when a test or another
// script imports it.
//
// `import.meta.filename` is resolved through symlinks and `process.argv[1]`
// is not, so comparing the two as they are said "not main" for a script
// started through a symlinked path: it did nothing and exited 0, which a
// caller that reads empty output as an answer ("no session file", then)
// would act on (code review, round 13). Both sides are compared as real
// paths.
//
//   if (isMain(import.meta.filename)) main()
import fs from 'node:fs'

export function isMain(filename, argv1 = process.argv[1]) {
  if (!argv1) return false
  try {
    return fs.realpathSync(argv1) === fs.realpathSync(filename)
  } catch {
    return false
  }
}
