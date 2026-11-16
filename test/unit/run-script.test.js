import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { makeSite, waitFor } from '../helpers/site.js'
import {
  engineGate,
  resolveScript,
  runScript,
  spawnPlan,
} from '../../lib/run-script.js'

const requestOf = (plan) =>
  JSON.parse(
    decodeURIComponent(new URL(plan.execArgv[1]).searchParams.get('run')),
  )

describe('resolveScript', () => {
  let dir
  afterEach(() => fs.remove(dir))

  it('resolves a name the way node resolves an entry point', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-run-'))
    await fs.outputFile(path.join(dir, 'router.js'), '')
    await fs.outputFile(path.join(dir, 'make.mjs'), '')
    await fs.outputFile(path.join(dir, 'bare'), '')

    expect(resolveScript('router.js', dir)).toEqual({
      file: path.join(dir, 'router.js'),
      error: null,
    })
    expect(resolveScript('make', dir).file).toBe(path.join(dir, 'make.mjs'))
    expect(resolveScript('bare', dir).file).toBe(path.join(dir, 'bare'))
  })

  it('says where the script goes when the name is not one', async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-run-'))

    const { file, error } = resolveScript('production', dir)

    expect(file).toBeNull()
    expect(error).toBe(
      'no script named production (looked for production, production.js, .mjs, .cjs). The script comes first: `kiss-ssg build router.js production`',
    )
    expect(resolveScript('x', dir, 'check').error).toContain(
      '`kiss-ssg check router.js x`',
    )
  })
})

describe('engineGate', () => {
  const engine = { version: '2.17.1', dir: 'node_modules/kiss-ssg' }

  it('goes ahead when no engine was found', () => {
    expect(engineGate(null, { cwd: '/site' })).toBeNull()
  })

  it('goes ahead when the engine holds the preload, looking in its folder', () => {
    const seen = []
    const result = engineGate(engine, {
      cwd: '/site',
      exists: (file) => {
        seen.push(file.replace(/\\/g, '/'))
        return true
      },
    })
    expect(result).toBeNull()
    expect(seen).toEqual(['/site/node_modules/kiss-ssg/lib/run-preload.js'])
  })

  it('refuses an engine without it, by capability and not by version', () => {
    const result = engineGate(
      { ...engine, version: '99.0.0' },
      { cwd: '/site', exists: () => false },
    )
    expect(result).toContain('cannot read the command')
    expect(result).toContain('99.0.0')
    expect(result).toContain('kiss-ssg build:')
  })
})

describe('spawnPlan', () => {
  const base = {
    script: '/site/router.js',
    args: ['production'],
    reportFile: '/tmp/r.jsonl',
    owner: 41,
    preload: 'file:///kiss/lib/run-preload.js',
  }

  it('build: the request alone, none of the five aliases, inherited stdio', () => {
    const plan = spawnPlan({
      ...base,
      command: 'build',
      env: {
        PATH: 'x',
        KISS_CHECK: '1',
        KISS_AIKB: '1',
        KISS_REPORT: 'old',
        KISS_IMAGES: 'old',
        KISS_IMAGES_REFRESH: '1',
        KISS_BUILD: 'keep',
        KISS_ASSETS: 'keep',
        KISS_DEV: 'keep',
      },
    })
    expect(plan.execArgv[0]).toBe('--import')
    expect(plan.execArgv[1].startsWith(`${base.preload}?run=`)).toBe(true)
    expect(requestOf(plan)).toEqual({
      mode: 'build',
      report: '/tmp/r.jsonl',
      owner: 41,
    })
    expect(plan.args).toEqual(['/site/router.js', 'production'])
    expect(plan.env).toEqual({
      PATH: 'x',
      KISS_BUILD: 'keep',
      KISS_ASSETS: 'keep',
      KISS_DEV: 'keep',
    })
    expect(plan.stdio).toBe('inherit')
  })

  it('dev: the build request with a channel, no aliases, and restart only when asked', () => {
    const env = { PATH: 'x', KISS_CHECK: '1', KISS_BUILD: 'keep' }
    const first = spawnPlan({ ...base, command: 'dev', env })
    expect(requestOf(first)).toEqual({
      mode: 'dev',
      report: '/tmp/r.jsonl',
      owner: 41,
    })
    expect(first.stdio).toEqual(['inherit', 'inherit', 'inherit', 'ipc'])
    expect(first.env).toEqual({ PATH: 'x', KISS_BUILD: 'keep' })

    const again = spawnPlan({ ...base, command: 'dev', env, restart: true })
    expect(requestOf(again)).toMatchObject({ mode: 'dev', restart: true })
    expect(
      requestOf(spawnPlan({ ...base, command: 'build', env, restart: true }))
        .restart,
    ).toBeUndefined()
  })

  it('check: mode check, the aliases beside it, the log on stderr', () => {
    const plan = spawnPlan({ ...base, command: 'check', env: { PATH: 'x' } })
    expect(requestOf(plan)).toEqual({
      mode: 'check',
      report: '/tmp/r.jsonl',
      owner: 41,
    })
    expect(plan.env).toEqual({
      PATH: 'x',
      KISS_CHECK: '1',
      KISS_REPORT: '/tmp/r.jsonl',
    })
    expect(plan.stdio).toEqual([0, 2, 2])
  })

  it('aikb: records, and says so in both forms', () => {
    const plan = spawnPlan({ ...base, command: 'aikb', env: {} })
    expect(requestOf(plan).aikb).toBe(true)
    expect(plan.env.KISS_AIKB).toBe('1')
  })

  it('images: the sweep file, and refresh only when asked', () => {
    const plain = spawnPlan({
      ...base,
      command: 'images',
      imagesFile: '/tmp/i.jsonl',
      env: {},
    })
    expect(requestOf(plain)).toMatchObject({
      mode: 'check',
      images: '/tmp/i.jsonl',
    })
    expect(requestOf(plain).imagesRefresh).toBeUndefined()
    expect(plain.env.KISS_IMAGES).toBe('/tmp/i.jsonl')
    expect(plain.env.KISS_IMAGES_REFRESH).toBeUndefined()

    const refresh = spawnPlan({
      ...base,
      command: 'images',
      imagesFile: '/tmp/i.jsonl',
      refresh: true,
      env: {},
    })
    expect(requestOf(refresh).imagesRefresh).toBe(true)
    expect(refresh.env.KISS_IMAGES_REFRESH).toBe('1')
  })

  it('names this copy’s preload by default, with this process as owner', () => {
    const plan = spawnPlan({ command: 'build', script: 's.js', env: {} })
    expect(plan.execArgv[1]).toMatch(/\/lib\/run-preload\.js\?run=/)
    expect(requestOf(plan).owner).toBe(process.pid)
  })

  it('does not change the environment it was given', () => {
    const env = { KISS_CHECK: '1' }
    spawnPlan({ ...base, command: 'build', env })
    expect(env).toEqual({ KISS_CHECK: '1' })
  })
})

describe('runScript', () => {
  const plan = {
    execArgv: ['--import', 'x'],
    args: ['s.js'],
    env: {},
    stdio: 'inherit',
  }

  // A child the test ends by hand with `child.end()`, which emits `close`
  // exactly once however often it is called.
  const fakeSpawn = (calls) => (command, args, options) => {
    const child = new EventEmitter()
    child.pid = 4242
    let ended = false
    child.end = (code, signal) => {
      if (ended) return
      ended = true
      setImmediate(() => child.emit('close', code, signal))
    }
    child.kill = (signal) => child.end(null, signal)
    calls.push([command, args, options])
    return child
  }

  it('resolves with the child’s status', async () => {
    const calls = []
    const signals = new EventEmitter()
    const spawn = (...args) => {
      const child = fakeSpawn(calls)(...args)
      setImmediate(() => child.emit('close', 3, null))
      return child
    }
    const result = await runScript(plan, { spawn, cwd: '/site', signals })
    expect(result).toEqual({ status: 3, signal: null, error: null })
    expect(calls[0][0]).toBe(process.execPath)
    expect(calls[0][1]).toEqual(['--import', 'x', 's.js'])
    expect(calls[0][2]).toMatchObject({ cwd: '/site', stdio: 'inherit' })
    expect(signals.listenerCount('SIGINT')).toBe(0)
    expect(signals.listenerCount('SIGTERM')).toBe(0)
  })

  it('resolves with the error when the child cannot start', async () => {
    const signals = new EventEmitter()
    const spawn = () => {
      const child = new EventEmitter()
      setImmediate(() => child.emit('error', new Error('ENOENT')))
      return child
    }
    const result = await runScript(plan, { spawn, signals })
    expect(result.status).toBeNull()
    expect(result.error.message).toBe('ENOENT')
  })

  it('ends the child on SIGINT and resolves non-zero, with SIGTERM on POSIX', async () => {
    const calls = []
    const signals = new EventEmitter()
    let child
    const spawn = (...args) => (child = fakeSpawn(calls)(...args))
    // The child's pid alone, and never a real signal from a unit test.
    const kill = (pid, signal) => {
      calls.push(['kill', pid, signal])
      child.end(null, signal)
    }
    const run = runScript(plan, { spawn, signals, kill, platform: 'linux' })
    signals.emit('SIGINT')
    const result = await run
    expect(calls).toContainEqual(['kill', 4242, 'SIGTERM'])
    expect(calls[0][2].detached).toBeUndefined()
    expect(result.status).not.toBe(0)
    expect(result.signal).toBeTruthy()
    expect(signals.listenerCount('SIGINT')).toBe(0)
  })

  it('ends the tree with taskkill on Windows', async () => {
    const calls = []
    const signals = new EventEmitter()
    const spawn = (command, args, options) => {
      const child = fakeSpawn(calls)(command, args, options)
      if (command === 'taskkill') mainChild.end(null, null)
      else mainChild = child
      return child
    }
    let mainChild
    const run = runScript(plan, { spawn, signals, platform: 'win32' })
    signals.emit('SIGTERM')
    const result = await run
    const kill = calls.find((c) => c[0] === 'taskkill')
    expect(kill[1]).toEqual(['/pid', '4242', '/T', '/F'])
    expect(result.status).toBe(1)
  })

  it('escalates to SIGKILL on the child when SIGTERM is not enough', async () => {
    const calls = []
    const signals = new EventEmitter()
    let child
    const spawn = (...args) => (child = fakeSpawn(calls)(...args))
    // Ignores SIGTERM; only SIGKILL ends it.
    const kill = (pid, signal) => {
      calls.push(['kill', pid, signal])
      if (signal === 'SIGKILL') child.end(null, signal)
    }
    const run = runScript(plan, {
      spawn,
      signals,
      kill,
      platform: 'linux',
      grace: 20,
    })
    signals.emit('SIGTERM')
    await run
    const sent = calls.filter((c) => c[0] === 'kill').map((c) => c[2])
    expect(sent).toEqual(['SIGTERM', 'SIGKILL'])
    expect(
      calls.filter((c) => c[0] === 'kill').every((c) => c[1] === 4242),
    ).toBe(true)
  })

  it('counts an interrupted child that exited 0 as failed', async () => {
    const signals = new EventEmitter()
    let child
    const spawn = (...args) => (child = fakeSpawn([])(...args))
    const kill = () => child.end(0, null)
    const run = runScript(plan, { spawn, signals, kill, platform: 'linux' })
    signals.emit('SIGINT')
    expect((await run).status).toBe(1)
  })
})

// Real processes and real signals. The child starts a grandchild (a tool the
// script spawned), records its pid, and can ignore SIGTERM. Both processes end
// themselves after 30 s, so a failure here cannot leak them for long. On POSIX
// the command ends the child alone; on Windows `taskkill /T` ends the tree.
describe('runScript, a real child stopped by the command', () => {
  const CHILD = `const fs = require('node:fs')
const { spawn } = require('node:child_process')
if (process.env.IGNORE_TERM) process.on('SIGTERM', () => {})
const g = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' })
fs.writeFileSync(process.argv[2], String(g.pid))
setInterval(() => {}, 1000)
setTimeout(() => process.exit(9), 30000)
`
  const alive = (pid) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
  let site
  afterEach(async () => {
    await site?.cleanup()
    site = null
  })

  // Starts the child, waits until its grandchild exists, sends the signal on a
  // private emitter and races the run against a bound.
  const stopWith = async (signal, env = {}, grace = 400) => {
    site = await makeSite({ 'child.cjs': CHILD })
    const pidFile = path.join(site.root, 'grandchild.pid')
    const signals = new EventEmitter()
    const run = runScript(
      {
        execArgv: [],
        args: [path.join(site.root, 'child.cjs'), pidFile],
        env: { ...process.env, ...env },
        stdio: 'ignore',
      },
      { signals, grace },
    )
    await waitFor(() => fs.pathExists(pidFile), { timeout: 10000 })
    const grandchild = Number(await fs.readFile(pidFile, 'utf8'))
    signals.emit(signal)
    const result = await Promise.race([
      run,
      new Promise((resolve) => setTimeout(() => resolve('hung'), 8000)),
    ])
    return { result, grandchild }
  }

  const gone = async (pid) => {
    await waitFor(() => !alive(pid), { timeout: 5000 }).catch(() => {})
    return !alive(pid)
  }

  it.skipIf(process.platform === 'win32')(
    'ends a child that ignores SIGTERM, within the grace and no longer',
    async () => {
      const { result, grandchild } = await stopWith('SIGTERM', {
        IGNORE_TERM: '1',
      })
      // The child only: what the script spawned is the script's, and a forced
      // kill can orphan it, so it is cleaned up here rather than asserted on.
      try {
        process.kill(grandchild, 'SIGKILL')
      } catch {
        /* already gone */
      }
      expect(result).not.toBe('hung')
      expect(result.status).not.toBe(0)
    },
    60000,
  )

  it.skipIf(process.platform !== 'win32')(
    'ends the whole tree with taskkill',
    async () => {
      const { result, grandchild } = await stopWith('SIGTERM')
      expect(result).not.toBe('hung')
      expect(result.status).toBe(1)
      expect(await gone(grandchild)).toBe(true)
    },
    60000,
  )
})
