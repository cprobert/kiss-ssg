const Kiss = require('../kiss-ssg')
const kiss = new Kiss({
  folders: {
    src: './3-pages',
    build: '../public/3-pages',
  },
  dev: true,
})
  .pages({
    view: 'courses.hbs',
    model: 'https://learna-cms.herokuapp.com/courses',
    controller: ({ model }) => {
      return {
        model: model,
      }
    },
  })
  .complete(function (data) {
    // console.log(data)
    const courseModel = this.getModelByID(
      'https://learna-cms.herokuapp.com/courses',
      data
    )
    console.log(courseModel.data[0].title)
    this.viewState()
  })
