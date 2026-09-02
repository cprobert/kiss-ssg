import connect from 'connect'
import serveStatic from 'serve-static'
import colors from 'colors'

export default async (httpRoot, port) => {
  if (!httpRoot) httpRoot = '/public'
  if (!port) port = 3000
  const app = connect()
  app.use(function (req, res, next) {
    console.log(req.url)
    next()
  })
  app.use(
    serveStatic(httpRoot, {
      cacheControl: false,
      extensions: ['html', 'htm'],
      index: ['index.html', 'index.htm'],
    })
  )
  console.log(
    `Serving (${httpRoot}): `.grey,
    colors.yellow('http://localhost:' + port)
  )
  app.listen(port)
  const { default: livereload } = await import('livereload')
  const server = livereload.createServer()
  server.watch(httpRoot)
}
