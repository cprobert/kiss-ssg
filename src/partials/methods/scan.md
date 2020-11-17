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
