# kiss-ssg

Kiss Static Site Generator, is an open-source MVC html website builder (for node), that leverages handlebar templates to make quick, simple and blisteringly fast websites.

- Create a .hbs view
- Specify a data source (JSON object, JSON file on file system, or URL)
- Optionally map data from the model to the page options in the controler (option mapper)

In addition you can use reusable handlebar partials (components) and handlebar-layouts (themes) to

Install with `npm install kiss-ssg`, or just drop [kiss-ssg.js](https://github.com/cprobert/kiss-ssg/blob/main/kiss-ssg.js) somewhere.

## Usage

The simplest usage is to use .auto() to scan your pages folder. This is usefull if you

```js
const kiss = new require("kiss-ssg")({
  folders: {
    layouts: `./src/layouts`,
    pages: `./src/pages`,
    components: `./src/components`,
    build: "./public",
  },
});

kiss.auto(); // Scans 'pages directory' for *.hbs files and generates them to the 'build folder'
```

Alternativly you can pass a model to the view using the .page() method. The model is then available in the handlebar template {{model.name}}

```js
const kiss = new require("kiss-ssg")();

kiss.page({
  title: "My Page Title",
  view: "index.hbs",
  model: {
    name: "Courtenay Probert",
  },
});
```

## Todo

Document:

- Setup options
- Page Options
- Other models: File system, URL
- Adding a controler to manupilate model, map to page options
- .pages() and using the cotroler to set a 'slug'
