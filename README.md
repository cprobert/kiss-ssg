# kiss-ssg

Kiss Static Site Generator, is an open-source MVC html website builder (for node), that leverages handlebar templates to make quick, simple and blisteringly fast websites.

- Create a .hbs view
- Specify a data source (JSON object, JSON file on file system, or URL)
- Optionally map data from the model to the page options in the controller (option mapper)

In addition you can use reusable [handlebar partials](https://handlebarsjs.com/guide/partials.html#partials) (components) and [handlebar-layouts](https://www.npmjs.com/package/handlebars-layouts) (themes) to

Install with `npm install kiss-ssg`, or just drop [kiss-ssg.js](https://github.com/cprobert/kiss-ssg/blob/main/kiss-ssg.js) somewhere.

## Usage

kiss-ssg has 3 methods

- .page()
- .pages()
- .scan()

The simplest usage is to use .scan() to scan your 'pages directory' for \*.hbs files and outputs them to the 'build folder'.

```js
const Kiss = require('kiss-ssg')
const kiss = new Kiss() // accept default folder locations
kiss.scan()
```

Note: kiss will generate the default folders for you wnen you first run the script.

You can overwrite the folder locations bay passing a config to the kiss constructor. The config options are:

```js
{
  folders: {
    src: './src',
    assets: './src/assets',
    layouts: './src/layouts',
    pages: './src/pages',
    components: './src/components',
    models: './src/models',
    build: './public',
  }
}
```

### Assets

Any statif files you have in the assets directory will be copied to the build directory

### .page()

Instead (in in conjunction) of using the .scan() method you can pass a model to the view using the .page() method. This allows you to name the view and pass a model to that view. The model is then available in the handlebar template under the model property, e.g. {{model.name}}

```js
const Kiss = require('kiss-ssg')
const kiss = new Kiss({ dev: true }) // export model with .html
kiss.page({
  view: 'index.hbs',
  title: 'My Page Title',
  model: {
    name: 'Courtenay Probert',
  },
})
```

The config options that you can pass to .page() & pages() are:

```js
  {
    view: 'index.hbs',
    title: 'Page Title',
    path: '/',
    slug: 'index',
    model: {}
  }
```

These options are both used internally by kiss and are available in view.

- view = the name of the handlebars file relative to the pages folder
- title = The page title
- path = the folder path to the page
- slug = the name of the file without the extension
- model = a json object, the name of the json file relative to the models folder or a URL for an API endpoint

page and path create the url, i.e. /{path}/{slug}.html

_Note:_ If you don't pass a path or a slug they will be inferred from the view

### .pages()

In addition to passing page options you can also pass a option mapper to act as a controllers to the .page() and .pages() methods:

```js
const Kiss = require('kiss-ssg')

const kiss = new Kiss()
kiss.page(
  {
    title: 'My Team Page',
    view: 'about/index.hbs',
    model: 'departments.json',
  },
  ({ model }) => {
    return {
      model: model.sort(
        (a, b) => parseInt(a.sort_order) - parseInt(b.sort_order)
      ),
    }
  }
)
```

### Controller

The option mapper is really useful for mapping a slug from the model. This is great for dynamic slugs and a necessity when passing an array of models to the .pages() method to generate a series of pages.

```js
const Kiss = require('kiss-ssg')
const kiss = new Kiss({ test: '123' })

kiss
  .page({
    title: 'Page Title',
    view: 'index.hbs',
    },
  })
  .pages(
    {
      path: 'courses',
      view: 'course.hbs',
      model: 'https://{my-cool-api}/courses',
    },
    ({ model }) => {
      return {
        slug: model.slug,
      }
    }
  )
```

### Markdown

You can also parse markdown like this:

```handlebars
<div>
{{#markdown}}
# Heading

> this is markdown

foo bar baz
{{/markdown}}
</div>
```

If you want to take a peek at whats properties you have available to to in a handlebars file you can use this helper:

```handlebars
{{{stringify this}}}
```
