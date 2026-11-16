// Started by `npx kiss-ssg init` — the smallest site kiss's conventions
// produce. Grow it rather than replace it. The API contract is
// node_modules/kiss-ssg/llms.txt; whole sites to copy by shape are in
// node_modules/kiss-ssg/examples/.
import Kiss from 'kiss-ssg'

// `npx kiss-ssg build` sets the exit code if a page fails; `npx kiss-ssg dev`
// previews the site and rebuilds on every edit.

// No `folders` block: `src: './src'` and `build: './public'` are the defaults.
// Any extra key reaches every view as `config.<key>`.
const kiss = new Kiss({
  site: {
    name: 'My kiss site',
    description: 'A site built with kiss-ssg.',
  },
})
  .scan()
  .generate()

await kiss.complete()
