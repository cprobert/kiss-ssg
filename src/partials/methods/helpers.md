### Helpers

Kiss-ssg registers a few useful helpers by default including a markdown parser.

Kiss exposes the handlebars object so you can register your own helpers, e.g.

```js
//  Extending handlebars
kiss.handlebars.registerHelper('stringify', function (obj) {
  return JSON.stringify(obj, null, 3)
})
```
