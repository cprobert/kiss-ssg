const fs = require("fs");
const glob = require("glob");
const rimraf = require("rimraf");
const colors = require("colors");
const handlebars = require("handlebars"); // https://handlebarsjs.com/
const layouts = require("handlebars-layouts");
const fetch = require("node-fetch");

handlebars.registerHelper(layouts(handlebars));

const fileSystem = {
  mkDir(dir) {
    dir = dir.toLowerCase();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
  },
  exists(dir) {
    return fs.existsSync(dir);
  },
};

class Page {
  _path = "";
  _slug = "index";
  _title = "Kiss page";

  view = null;
  model = {};

  buildDir = "./public";
  pageDir = "./src/pages";

  constructor(view) {
    this.view = view;

    this._path = view.substring(0, view.lastIndexOf("/"));
    this._slug = view
      .substring(view.lastIndexOf("/") + 1, view.length)
      .replace(".hbs", "");
    this._title = this._slug;
  }

  set title(title) {
    if (title) this._title = title;
  }

  set path(path) {
    if (path) {
      if (path.startsWith("/")) path = path.substring(1, path.length);
      if (path.endsWith("/")) path = path.substring(0, path.length - 1);
      this._path = path;
    }
  }

  get slug() {
    return this._slug;
  }
  set slug(slug) {
    if (slug) this._slug = slug;
  }

  getTemplate(view) {
    return handlebars.compile(
      fs.readFileSync(`${this.pageDir}/${view}`, "utf8")
    );
  }

  generate() {
    let filePath = this.buildDir;
    if (this._path) {
      filePath = `${this.buildDir}/${this._path}`;
      fileSystem.mkDir(filePath);
    }

    const template = this.getTemplate(this.view);
    const output = template({
      title: this._title,
      path: this._path,
      slug: this._slug,
      model: this.model,
    });

    const generate = `${filePath}/${this._slug}.html`;
    console.log(generate.green);
    fs.writeFileSync(generate, output);
    if (this.model) {
      fs.writeFileSync(
        generate.replace(".html", ".json"),
        JSON.stringify(this.model, null, 1)
      );
    }
  }
}

module.exports = (config) => {
  console.log(colors.white("Starting Kiss", config));

  let folders = {
    src: "./src",
    layouts: `./src/layouts`,
    pages: `./src/pages`,
    components: `./src/components`,
    models: `./src/content`,
    build: "./public",
  };
  console.debug("folders: ".grey, folders);

  let state = {
    pages: [],
    views: [],
  };

  function generate(options, optionMapper) {
    if (typeof optionMapper === "function") {
      let mappedOptions = optionMapper(options);
      options = {
        ...options,
        ...mappedOptions,
      };
    }
    // console.debug('options:'.grey, options)
    const kissPage = new Page(options.view);
    kissPage.buildDir = folders.build;
    kissPage.pageDir = folders.pages;
    kissPage.title = options.title;
    kissPage.slug = options.slug;
    kissPage.path = options.path;
    kissPage.model = options.model;
    kissPage.generate();
    // console.debug(kissPage)
    state.pages.push(kissPage);
  }

  function generateDynamic(options, data, optionMapper) {
    let i = 1;
    const slug = options.slug;
    if (Array.isArray(data)) {
      data.forEach((model) => {
        options.slug = slug + "-" + i;
        options.model = model;
        generate(options, optionMapper);
        i++;
      });
    } else {
      console.error("Data in dynamic model must be an array".red);
    }
  }

  function registerPartials(folder) {
    console.log("Registering partials: ".yellow);
    const hbs = glob.sync(`${folder}/**/*.hbs`);
    hbs.forEach((path) => {
      const source = fs.readFileSync(path, "utf8");
      const reStart = new RegExp(`^${folder}`, "g");
      const reEnd = new RegExp(`\.hbs$`, "g");
      let name = path.replace(reStart, "").replace(reEnd, "");
      if (name.startsWith("/")) {
        name = name.substring(1, name.length);
      }
      handlebars.registerPartial(name, source);
      console.log(name.blue);
    });
  }

  function readModel(file) {
    const model = `${folders.models}/${file}`;
    if (fileSystem.exists(model)) {
      return JSON.parse(fs.readFileSync(model, "utf8"));
    }
    console.error("Can not find model on file system".red, model);
    return {};
  }

  const kiss = {
    page(options, optionMapper) {
      if (!options.view) {
        console.error("No view specified", red, options);
        return this;
      }

      if (typeof options.model === "string") {
        if (options.model.startsWith("http")) {
          const url = options.model;
          fetch(url)
            .then((response) => response.json())
            .then((data) => {
              if (options.dynamic) {
                generateDynamic(options, data, optionMapper);
              } else {
                options.model = data;
                generate(options, optionMapper);
              }
            });
        } else if (options.model.endsWith(".json")) {
          const data = readModel(options.model);
          if (options.dynamic) {
            generateDynamic(options, data, optionMapper);
          } else {
            options.model = data;
            generate(options, optionMapper);
          }
        } else {
          console.error("Invalid model".red);
        }
      } else {
        generate(options, optionMapper);
      }

      state.views.push(options.view);
      return this;
    },
    pages(options, optionMapper) {
      options.dynamic = true;
      this.page(options, optionMapper);
      state.views.push(options.view);
      return this;
    },
    async auto() {
      const pages = glob.sync(`${folders.pages}/**/*.hbs`);
      pages.forEach((pagePath) => {
        const view = pagePath.replace(
          new RegExp(`^${folders.pages}/`, "g"),
          ""
        );
        if (!state.views.some((v) => v === view)) {
          console.log(`Auto added:`.grey, view.blue);
          this.page({
            view: view,
          });
        }
      });
    },
  };

  try {
    rimraf.sync(folders.build);
  } catch (err) {
    console.log(colors.red(err.message));
  }
  fileSystem.mkDir(folders.build);

  registerPartials(folders.layouts);
  registerPartials(folders.components);

  return {
    page: kiss.page,
    pages: kiss.pages,
    auto: kiss.auto,
  };
};
