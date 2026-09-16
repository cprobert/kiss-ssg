// One page shell, one stylesheet, one set of shared partials for every
// example. Each example spreads this into its own `folders` block, where an
// explicit key beats the folder kiss derives from `folders.src`.
// Each example is run from its OWN folder (`cd examples/3-pages && node router`),
// the way a real site is run from its project root — so the shared shell is one
// level up from wherever the router sits.
export const sharedFolders = {
  layouts: '../_shared/layouts',
  partials: '../_shared/partials',
  assets: '../_shared/assets',
}

// Any extra key on the config object reaches every view as `config.<key>`,
// which is how the shared layout gets the site name and the nav without each
// page having to carry them in its model.
export const site = {
  name: 'Aster & Oak',
  tagline: 'Small-batch coffee, roasted in Bristol',
}

// Shared by every example's `complete().catch()`: prints each failing page
// and sets a non-zero exit code, so a broken example is loud to an agent
// running `npm run egN` instead of silently exiting 0 — the recipe
// llms.txt's "Migrating" section shows.
export function reportBuildFailure(err) {
  console.error(err.message)
  for (const failure of err.failures ?? []) {
    console.error(
      `  ${failure.buildTo || failure.view}: ${failure.error.message}`,
    )
  }
  process.exitCode = 1
}
