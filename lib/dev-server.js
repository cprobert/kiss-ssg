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
  let listening = false
  const ready = new Promise((resolve, reject) => {
    server.once('listening', () => {
      listening = true
      // Announced on the bind, not before it: a "Serving" line printed above a
      // bind failure sent a consumer hunting for a server that never existed.
      logger.info(`Serving (${httpRoot}): `, `http://${host}:${port}`)
      resolve()
    })
    // An unheard 'error' on an EventEmitter throws, so this stays attached for
    // the life of the server. A bind failure is not logged here — `ready`
    // carries the whole message so its owner reports the fault exactly once.
    server.on('error', (err) => {
      if (listening) return logger.error('Dev server error', err.message)
      reject(
        new Error(
          `Dev server could not bind ${host}:${port} (${err.code ?? err.message}): the site is not being served`,
          { cause: err },
        ),
      )
    })
  })
  const lr = livereload.createServer({
    port: livereloadPort,
    host,
    // livereload refreshes on the watcher's first 'add', and fs.outputFile
    // creates a file before filling it — without a settle the browser can
    // fetch a half-written page. 100ms matches the source watcher.
    delay: 100,
    // Added to livereload's defaults, which omit them. Deliberately not json
    // or xml: the dev-mode .json debug siblings and sitemap.xml are rewritten
    // on every build, so watching them would reload on every build.
    extraExts: ['svg', 'webp', 'avif', 'ico', 'woff', 'woff2'],
  })
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
