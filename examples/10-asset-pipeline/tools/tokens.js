// A stand-in for Tailwind, sass, esbuild — any tool with a command line. It
// compiles styles/tokens.json into a stylesheet in the assets folder, and with
// --watch it stays up and recompiles whenever that file changes. Deliberately
// dependency-free (and deliberately not a kiss module): the whole point of
// `config.assets.pipeline` is that kiss knows nothing about the tool.
//
//   node 10-asset-pipeline/tools/tokens.js            # one shot: the `run` step
//   node 10-asset-pipeline/tools/tokens.js --watch    # stays up: the `watch` step
//
// Paths are resolved against this file, never against the cwd, so the same
// command works from `examples/` and from the repo root. `KISS_ASSETS` — which
// kiss hands every step — is used when it is set, so the tool writes where the
// site says its assets live rather than where the tool guessed.

import fs from 'node:fs'
import path from 'node:path'

const here = import.meta.dirname
const site = path.resolve(here, '..')
const source = path.join(site, 'styles/tokens.json')
const assets = process.env.KISS_ASSETS
  ? path.resolve(process.cwd(), process.env.KISS_ASSETS)
  : path.join(site, 'assets')
const target = path.join(assets, 'css/generated.css')

function compile() {
  const tokens = JSON.parse(fs.readFileSync(source, 'utf8'))
  const css = `/* generated from styles/tokens.json at ${new Date().toISOString()} — do not edit */
:root {
  --accent: ${tokens.accent};
  --accent-ink: ${tokens.accentInk};
  --rule: ${tokens.rule};
}
.token-card {
  border: 1px solid var(--rule);
  border-left: 6px solid var(--accent);
  padding: 1rem 1.25rem;
  border-radius: 6px;
}
.token-badge {
  background: var(--accent);
  color: var(--accent-ink);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.85em;
}
`
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, css)
  // stdout, so it arrives in kiss's log as `[tokens] …` like any other tool's.
  console.log(`tokens.json -> ${path.relative(site, target)}`)
}

compile()

if (process.argv.includes('--watch')) {
  console.log('watching styles/tokens.json')
  // Debounced, because an editor's save can fire several events for one write
  // — the same reason kiss's own watcher waits for a file to settle.
  let pending = null
  fs.watch(source, () => {
    clearTimeout(pending)
    pending = setTimeout(() => {
      try {
        compile()
      } catch (err) {
        // A half-written JSON file is a normal mid-save state, not a reason to
        // take the watch process down: the next event compiles it properly.
        console.error(`tokens: ${err.message}`)
      }
    }, 50)
  })
}
