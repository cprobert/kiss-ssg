import { readFileSync } from 'node:fs'

// One page shell, one stylesheet, one set of shared partials for all six
// examples. Each example spreads this into its own `folders` block, where an
// explicit key beats the folder kiss derives from `folders.src`.
export const sharedFolders = {
  layouts: './_shared/layouts',
  partials: './_shared/partials',
  assets: './_shared/assets',
}

// Any extra key on the config object reaches every view as `config.<key>`,
// which is how the shared layout gets the site name and the nav without each
// page having to carry them in its model.
export const site = {
  name: 'Aster & Oak',
  tagline: 'Small-batch coffee, roasted in Bristol',
}

// The demo pages print the very script that built them, read at run time, so
// the code shown on the page can never drift from the code that ran.
export const script = (metaUrl) => ({
  file: `examples/${metaUrl.split('/').pop()}`,
  text: readFileSync(new URL(metaUrl), 'utf8'),
})
