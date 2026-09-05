import Kiss, { utils } from '../lib/kiss.js'
const kiss = new Kiss({
  folders: {
    src: './3-pages',
    build: '../public/3-pages',
    assets: null,
    layouts: null,
    models: null,
    controllers: null,
    partials: null,
  },
  addPagesOnGenerate: false,
  verbose: true,
  dev: true,
  extensionLess: true,
})
  .pages({
    view: 'courses/course.hbs',
    model: 'https://jsonplaceholder.typicode.com/users',
    controller: ({ model }) => {
      // Map the demo API's user shape onto the fields the views expect
      model.title = model.name
      model.introduction = model.company.catchPhrase
      model.slug = utils.toSlug(model.username)
      return {
        slug: model.slug,
        model: model,
      }
    },
    path: 'courses',
  })
  .generate(function (data) {
    // data is an array of models from all promises
    // this.getModelByID is a helper to rehydrate the model on completion
    const courseModel = this.getModelByID(
      'https://jsonplaceholder.typicode.com/users',
      data,
    )
    // It can then be reused for pages such as indexes
    this.page({
      model: courseModel,
      view: 'courses/index.hbs',
      path: '/',
      controller: ({ model }) => {
        return {
          title: 'List of courses',
          model: model,
        }
      },
      slug: 'index',
    }).generate(function () {
      this.scan()
      this.viewStats()
    })
  })
