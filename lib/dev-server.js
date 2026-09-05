import connect from 'connect'
import serveStatic from 'serve-static'
import livereload from 'livereload'

export function startDevServer(
  httpRoot,
  port,
  { logger, livereloadPort, host },
) {
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
  const server = app.listen(port, host)
  const ready = new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  server.on('error', (err) => logger.error('Dev server error', err.message))
  logger.info(`Serving (${httpRoot}): `, `http://${host}:${port}`)
  const lr = livereload.createServer({ port: livereloadPort, host })
  // Livereload re-emits its listen failures on the server object, and an
  // unheard 'error' on an EventEmitter throws — an EADDRINUSE here (two sites
  // sharing the livereload port) used to kill the whole dev process. Live
  // reload is optional; the site must keep being served without it.
  lr.on('error', (err) =>
    logger.error(
      `Live reload unavailable on port ${livereloadPort}: `,
      err.message,
    ),
  )
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
