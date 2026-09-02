import { describe, it, expect, vi } from 'vitest'
import { createLogger, silentLogger } from '../../lib/logger.js'

const METHODS = [
  'banner',
  'info',
  'success',
  'highlight',
  'notice',
  'warn',
  'error',
  'debug',
  'plain',
]

describe('createLogger', () => {
  it('exposes the full interface', () => {
    const logger = createLogger()
    for (const m of METHODS) expect(typeof logger[m]).toBe('function')
  })

  it('writes errors to console.error and info to console.log', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = createLogger()
    logger.info('hello')
    logger.error('bad')
    expect(log).toHaveBeenCalledTimes(1)
    expect(String(log.mock.calls[0][0])).toContain('hello')
    expect(String(error.mock.calls[0][0])).toContain('bad')
    log.mockRestore()
    error.mockRestore()
  })

  it('only emits debug when verbose', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
    createLogger().debug('x')
    expect(debug).not.toHaveBeenCalled()
    createLogger({ verbose: true }).debug('x')
    expect(debug).toHaveBeenCalledTimes(1)
    debug.mockRestore()
  })

  it('silentLogger writes nothing', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    silentLogger.info('x')
    silentLogger.banner('x')
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})
