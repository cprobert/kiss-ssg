import { createRequire } from 'node:module'

// Required on the first dev-server start, not at import. `connect`,
// `serve-static` and `livereload` cost ~160ms to load between them, and a
// one-shot build — which is every production build, every CI run and every
// `kiss-ssg check` — never starts a server at all. As static imports they were
// paid by `lib/kiss.js` unconditionally, because `kiss.js` imports this module
// to have `startDevServer` available for the branch it usually does not take.
//
// A synchronous `require` rather than `await import()` so `startDevServer`
// keeps its signature: it is called from the Kiss constructor, which cannot
// await, and it must return its `{ ready, refresh, close }` handle in the same
// tick. All three packages are CJS, so a require resolves them.
const require = createRequire(import.meta.url)

export function startDevServer(
  httpRoot,
  port,
  { logger, livereloadPort, host },
) {
  const connect = require('connect')
  const serveStatic = require('serve-static')
  const livereload = require('livereload')
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
  // Deliberately not watching httpRoot: a file watcher on the build folder
  // sends one reload per file written, so a whole-site rebuild reaches the
  // browser while it is still writing pages (review finding F-E4). Kiss knows
  // when a rebuild has settled, and calls `refresh` once when it has.
  return {
    server,
    livereload: lr,
    // `path` names what changed, so livereload can swap a stylesheet in place
    // instead of reloading the page; anything else reloads the page.
    refresh: (path) => lr.refresh(path),
    ready,
    close: () =>
      new Promise((resolve) => {
        lr.close()
        server.close(() => resolve())
      }),
  }
}
