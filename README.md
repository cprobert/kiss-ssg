# kiss-ssg

Kiss Static Site Generator, is an open-source MVC html website builder (for node), that leverages handlebar templates to make quick, simple and blisteringly fast websites.

- Create a .hbs view
- Specify a data source (JSON object, JSON file on file system, or URL)
- Optionally map data from the model to the page options in the controller (option mapper)

In addition you can use reusable handlebar partials (components) and handlebar-layouts (themes) to

Install with `npm install kiss-ssg`, or just drop [kiss-ssg.js](https://github.com/cprobert/kiss-ssg/blob/main/kiss-ssg.js) somewhere.

## Usage

kiss-ssg has 3 methods

- .page()
- .pages()
- .scan()

The simplest usage is to use .scan() to scan your 'pages directory' for \*.hbs files and outputs them to the 'build folder'.

```js
const Kiss = require('kiss-ssg')
const kiss = new Kiss({
  folders: {
    pages: './src/pages',
    build: './public',
  },
})
kiss.scan()
```

Alternatively you can pass a model to the view using the .page() method. The model is then available in the handlebar template {{model.name}}

```js
const Kiss = require('kiss-ssg')
const kiss = new Kiss() // accept default folder locations
kiss.page({
  title: 'My Page Title',
  view: 'index.hbs',
  model: {
    name: 'Courtenay Probert',
  },
})
```

## Todo

Document:

- Setup options
- Page Options
- Other models: File system, URL
- Adding a controller to manipulate model, map to page options
- .pages() and using the controller to set a 'slug'
