// The only module allowed to import `colors`. It extends String.prototype as
// a side effect; nothing else in lib/ may rely on that.
import colors from 'colors'

const paint = (color, args) =>
  args.map((a) => (typeof a === 'string' ? colors[color](a) : a))

export function createLogger({ verbose = false, silent = false } = {}) {
  const out =
    (fn, color) =>
    (...args) => {
      if (!silent) fn(...paint(color, args))
    }
  return {
    verbose,
    banner: out(console.log, 'zebra'),
    info: out(console.log, 'grey'),
    success: out(console.log, 'green'),
    highlight: out(console.log, 'blue'),
    notice: out(console.log, 'cyan'),
    warn: out(console.warn, 'yellow'),
    error: out(console.error, 'red'),
    debug: (...args) => {
      if (!silent && verbose) console.debug(...paint('grey', args))
    },
    plain: (...args) => {
      if (!silent) console.log(...args)
    },
  }
}

export const silentLogger = createLogger({ silent: true })
export default createLogger()
