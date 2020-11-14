const connect = require('connect')
// const compiler = require('connect-compiler')
const static = require('serve-static')
const colors = require('colors')
const app = connect()

module.exports = async (httpRoot) => {
  if (!httpRoot) httpRoot = '/public'
  app.use(function (req, res, next) {
    console.log(req.url)
    next()
  })

  app.use(function onerror(err, req, res, next) {
    console.error('Server error'.red)
    console.log(err)
  })

  app.use(
    static(httpRoot, {
      cacheControl: false,
      extensions: ['html', 'htm'],
      index: ['index.html', 'index.htm'],
    })
  )

  console.log(
    `Serving (${httpRoot}): `.grey,
    colors.yellow('http://localhost:3000')
  )
  app.listen(3000)

  const livereload = require('livereload')
  const server = livereload.createServer()
  server.watch(httpRoot)
}
