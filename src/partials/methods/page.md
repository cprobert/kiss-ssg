### .page()

Instead (in in conjunction) of using the .scan() method you can pass a model to the view using the .page() method. This allows you to name the view and pass a model to that view. The model is then available in the handlebar template under the model property, e.g. {{model.name}}

```js
const Kiss = require('kiss-ssg')
const kiss = new Kiss({ dev: true })
kiss
  .page({
    view: 'index.hbs',
    model: 'index.json',
    controller: 'index.js',
    title: 'My Page Title',
  })
  .generate()
```

**Note**: The file locations of the models, views, and controllers are relative to the folder locations defined in the kiss configuration. Alternatively, instead of passing a file location you can pass a native object for that setting.

Views: can se a .hbs file or a string
Models: can be a .json file, a http api endpoint, or a JSON object
Controllers: can be a .js file or a function that returns a page option JSON to be merged into the page options

The options that you can pass to .page() & pages() are:

```js
  {
    view: 'index.hbs',
    model: {}
    controller: ({model})=>{return {model: model}},
    title: 'Page Title',
    description: 'A description of the page (useful for meta data)'
    path: '/',
    slug: 'index',
  }
```

These options are both used internally by kiss and are available in view.

- view = A handlebars view.
- model = A json object, the name of the json file relative to the models folder or a URL for an API endpoint.
- controller = A function that returns a page options object - used for manipulating data in the model.
- title = The page title
- path = the folder path to the page
- slug = the name of the file without the extension

page and path create the url, i.e. /{path}/{slug}.html

_Note:_ If you don't pass a path or a slug they will be inferred from the view

### .pages()

In addition to passing page options you can also pass a option mapper to act as a controllers to the .page() and .pages() methods:

```js
const Kiss = require('kiss-ssg')

const kiss = new Kiss()
kiss
  .page({
    title: 'My Team Page',
    view: 'about/index.hbs',
    model: 'departments.json',
    controller: ({ model }) => {
      return {
        model: model.sort(
          (a, b) => parseInt(a.sort_order) - parseInt(b.sort_order)
        ),
      }
    },
  })
  .generate()
```
