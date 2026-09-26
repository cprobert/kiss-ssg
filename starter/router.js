// Started by `npx kiss-ssg init` — the smallest site kiss's conventions
// produce. Grow it rather than replace it. The API contract is
// node_modules/kiss-ssg/llms.txt; whole sites to copy by shape are in
// node_modules/kiss-ssg/examples/.
import Kiss from 'kiss-ssg'

// A failed build must be loud: print each failing page and exit non-zero,
// rather than exiting 0 with a page quietly missing.
function reportBuildFailure(err) {
  console.error(err.message)
  for (const failure of err.failures ?? []) {
    console.error(
      `  ${failure.buildTo || failure.view}: ${failure.error.message}`,
    )
  }
  process.exitCode = 1
}

const dev = process.argv.includes('--dev')

// No `folders` block: `src: './src'` and `build: './public'` are the defaults.
// Any extra key reaches every view as `config.<key>`.
const kiss = new Kiss({
  site: { name: 'My kiss site' },
  dev,
})
  .scan()
  .generate()

if (!dev) {
  await kiss.complete().catch(reportBuildFailure)
}
