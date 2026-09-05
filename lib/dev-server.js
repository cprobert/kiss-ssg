import connect from 'connect'
import serveStatic from 'serve-static'
import livereload from 'livereload'

export function startDevServer(httpRoot = 'public', port = 3000, { logger }) {
  const app = connect()
  app.use((req, res, next) => {
    logger.plain(req.url)
    next()
  })
  app.use(
    serveStatic(httpRoot, {
      cacheControl: false,
      extensions: ['html', 'htm'],
      index: ['index.html', 'index.htm'],
    }),
  )
  const server = app.listen(port)
  const ready = new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  server.on('error', (err) => logger.error('Dev server error', err.message))
  logger.info(`Serving (${httpRoot}): `, `http://localhost:${port}`)
  const lr = livereload.createServer()
  lr.watch(httpRoot)
  return {
    server,
    livereload: lr,
    ready,
    close: () =>
      new Promise((resolve) => {
        lr.close()
        server.close(() => resolve())
      }),
  }
}
