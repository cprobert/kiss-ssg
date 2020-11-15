# kiss-ssg

Kiss Static Site Generator, is an open-source MVC html website builder (for node), that leverages handlebar templates to make quick, simple and blisteringly fast websites.

Kiss-ssg uses [handlebar partials](https://handlebarsjs.com/guide/partials.html#partials) and [handlebar-layouts](https://www.npmjs.com/package/handlebars-layouts) to help you make DRY static websites.

Install with `npm install kiss-ssg --save-dev`, or just drop [kiss-ssg.js](https://github.com/cprobert/kiss-ssg/blob/main/kiss-ssg.js) somewhere.

## Usage

kiss-ssg has 3 methods

- .page()
- .pages()
- .scan()

The simplest usage is to use .scan() to scan your 'pages directory' for \*.hbs files and outputs them to the 'build folder'.

```js
const Kiss = require('kiss-ssg')
const kiss = new Kiss()
kiss.scan()
kiss.generate()
```

**Note**: kiss will generate the default folders for you when you first run the script. You can overwrite the folder locations bay passing a config to the kiss constructor.

The default config options are:

```js
{
  dev: false,
  verbose: false,
  cleanBuild: true,
  folders: {
    src: './src',
    build: './public',
    assets: './src/assets',
    layouts: './src/layouts',
    pages: './src/pages',
    partials: './src/partials',
    models: './src/models',
    controllers: './src/controllers'
  }
}
```

Partials: Cam be a .hbs, a .html file or a .md file, Note: .md files are automatically parsed

| Option     |  Default  |                                  Purpose                                   |
| ---------- | :-------: | :------------------------------------------------------------------------: |
| dev        |   false   | Dev mode will start a local live-reload server and rebuild on file change. |
| verbose    |   false   |        Enables additional output on the terminal, when set to true         |
| cleanBuild |   true    |          Removed all files from the build dir before generating.           |
| folders    | see above |               A JSON object of alternative folder locations                |

<br />

**Note**: All config settings are available in the view under "this.config"

### Assets

Any static files you have in the assets directory will be copied to the build directory

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

### Controller

The option mapper is really useful for mapping a slug from the model. This is great for dynamic slugs and a necessity when passing an array of models to the .pages() method to generate a series of pages.

```js
const Kiss = require('kiss-ssg')
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

### Helpers

Kiss-ssg registers a few useful helpers by default including:

You can parse markdown like this:

```handlebars
<div>
{{#markdown}}
# Heading

> this is markdown

foo bar baz
{{/markdown}}

or

{{markdown model.introduction}}
</div>
```

If you want to take a peek at whats properties you have available to to in a handlebars file you can use this helper:

```handlebars
{{{stringify this}}}
```

Kiss exposes the handlebars object so you can register your own helpers, e.g.

```js
kiss.handlebars.registerHelper('stringify', function (obj) {
  return JSON.stringify(obj, null, 3)
})
```
