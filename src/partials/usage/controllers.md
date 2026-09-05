## Controllers

The option mapper is really useful for mapping a slug from the model. This is great for dynamic slugs and a necessity when passing an array of models to the .pages() method to generate a series of pages.

```js
import Kiss from 'kiss-ssg'
const kiss = new Kiss({ test: '123' })

kiss
  .page({
    title: 'Page Title',
    view: 'index.hbs',
  })
  .pages({
    view: 'course.hbs',
    model: 'https://{my-cool-api}/courses',
    controller: ({ model }) => {
      return {
        slug: model.slug,
      }
    },
    path: 'courses',
  })
  .generate()
```

A controller must be **pure** — return new values, never mutate `model` (or a nested option such as `config.folders`) in place. `.watch()` replays a page from a shallow snapshot of its original `.page()`/`.pages()` call, so an object model your controller mutated in place is still mutated on the next rebuild: an in-place `array.push(...)` or property assignment accumulates one more change with every save, and the dev server drifts further from what a fresh build would produce.

A controller that throws, a controller file that doesn't exist, or one whose file doesn't export a function fails that page's build — `.complete()` rejects, listing it as a failure — rather than shipping a page built from un-controlled options.

### Other methods

- `.registerPartials()` — re-registers every partial and layout from disk, unregistering any whose file has gone, and returns the registered names. Kiss runs it for you at start-up and on every watch rebuild; call it yourself if you add or remove partial files at runtime without `.watch()`.
- `.viewStats()` — logs how many pages are queued and prepared, and with `verbose: true` writes a `debug.json` into the build folder listing every page as `{ view, buildTo, runCount, options }`. Chainable; handy from a `.generate()` callback to see what the build actually produced.
- `.getModelByID(id, data)` — pulls one entry out of the `[{ id, data }]` array `.generate()`/`.complete()` hand back, returning its `data` (or `{ error }` if no entry has that id). The id is the model's filename or URL.
- `.copyAssets(sourceDir, targetDir)` — compiles every `.scss`/`.sass` under `sourceDir` to a sibling `.css` and copies everything else straight through. Runs automatically at construction for `folders.assets` → `folders.build`; call it again for extra asset directories.

```js
kiss.scan().generate(function (data) {
  this.viewStats()
  console.log(this.getModelByID('index.json', data))
})
```
