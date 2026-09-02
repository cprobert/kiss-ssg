import connect from 'connect'
import serveStatic from 'serve-static'
import { createLogger } from './lib/logger.js'

export default async (httpRoot, port, logger = createLogger()) => {
  if (!httpRoot) httpRoot = '/public'
  if (!port) port = 3000
  const app = connect()
  app.use(function (req, res, next) {
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
  logger.info(`Serving (${httpRoot}): `, 'http://localhost:' + port)
  app.listen(port)
  const { default: livereload } = await import('livereload')
  const server = livereload.createServer()
  server.watch(httpRoot)
}
