## Setup

Kiss is an object so will need to be instantiated. In its simplest form kiss will scan your pages directory and use file based routing to generate the html output.

```js
import Kiss from 'kiss-ssg'
const kiss = new Kiss()
kiss.scan()
kiss.generate()
```

kiss-ssg v2 is an ES module (`import Kiss from 'kiss-ssg'`) and needs Node 22.12 or newer; plain `require('kiss-ssg')` also works on those versions.

**Note**: kiss will generate the default folders for you when you first run the script. You can overwrite the folder locations bay passing a config to the kiss constructor.

The default config options are:

```js
{
  dev: false,
  verbose: false,
  cleanBuild: true,
  extensionLess: false,
  sass: { includePaths: [] },
  fetch: {
    headers: {},
    timeout: 10000,
    retries: 0,
    cache: false
  },
  assets: {
    hash: false,
    version: null
  },
  port: 3001,
  livereloadPort: 35729,
  devHost: '127.0.0.1',
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

| Option         |             Default              |                                                                                                 Purpose                                                                                                  |
| -------------- | :------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| dev            |              false               |                                        Dev mode will start a local live-reload server and rebuild on file change. Model and controller changes are picked up too.                                        |
| verbose        |              false               |                                                                       Enables additional output on the terminal, when set to true                                                                        |
| cleanBuild     |               true               |       `true`, `false` or `'atomic'`. `true` empties the build dir in the constructor, before anything renders; `'atomic'` builds into a staging folder and swaps it in when `complete()` resolves.       |
| extensionLess  |              false               |                                                   When `true`, a non-index page builds to `<path>/<slug>/index.html` instead of `<path>/<slug>.html`.                                                    |
| sass           |      `{ includePaths: [] }`      |                                               `includePaths` is passed to sass as `loadPaths`, so `@use`/`@import` can resolve from those directories too.                                               |
| fetch          |            see below             |   The policy for `http(s)` models: `headers` sent with every request, `timeout` in ms, `retries` after a network error or a 5xx, and `cache` (`false`, or a directory to cache successful bodies in).    |
| assets         | `{ hash: false, version: null }` | Cache busting for the files copied into the build. `hash: true` renames every emitted `.css`/`.js` to carry a content hash; `version: '1.4.5'` renames nothing and makes `\{{asset}}` append `?v=1.4.5`. |
| port           |               3001               |                                                                          The port the dev server listens on (`dev: true` only)                                                                           |
| livereloadPort |              35729               |                                         The port the live-reload server listens on. Give a second site of your own a different value so both can watch at once.                                          |
| devHost        |           '127.0.0.1'            |                             The interface the dev and live-reload servers bind to. Loopback only by default; set `'0.0.0.0'` to preview from another device on your network.                             |
| folders        |            see above             |                                                                              A JSON object of alternative folder locations                                                                               |
| siteUrl        |            undefined             |                                                                        The site's base URL, required by `.sitemap()` (see below)                                                                         |

A config key you pass explicitly as `undefined` still takes its default (`new Kiss({ port: process.env.PORT })` with `PORT` unset gives `3001`); `null` is a real value — it switches a folder off.

Setting `folders.src` re-derives every other folder key from it (`${src}/${key}`), unless you also set that key explicitly — `folders.build` always defaults to `./public` regardless of `src`.

<br />

**Note**: All config settings are available in the view under "this.config". Each page also gets its own copy, so a controller can override settings for just that page via a `config` option (see `.page()` below) without affecting any other page.

### Assets

Any static files you have in the assets directory will be copied to the build directory. `.scss`/`.sass` files are compiled to a sibling `.css` file first; everything else is copied straight through.
