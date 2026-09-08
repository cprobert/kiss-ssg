import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import { createPipeline, stepName } from '../../lib/pipeline.js'

// Every step is a `node -e` command run through a shell, so the suite needs no
// fixture binary and behaves the same on Windows, macOS and Linux. The path is
// quoted because a real Node install can sit under "Program Files".
const node = `"${process.execPath}"`
const run = (source) => `${node} -e "${source.replace(/"/g, '\\"')}"`

let logger
let dir
let pipeline

beforeEach(async () => {
  logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  dir = (await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-pipeline-'))).replace(
    /\\/g,
    '/',
  )
})

afterEach(async () => {
  if (pipeline) await pipeline.close()
  pipeline = null
  await fs.remove(dir)
})

const lines = (mock) => mock.mock.calls.map(([line]) => line)

describe('stepName', () => {
  it('uses the step name when it has one', () => {
    expect(stepName({ name: 'tailwind', run: 'npx tailwindcss' })).toBe(
      'tailwind',
    )
  })

  it('falls back to the first word of the command', () => {
    expect(stepName({ run: 'npx tailwindcss -i a.css -o b.css' })).toBe('npx')
    expect(stepName({ run: '  sass  src:build ' })).toBe('sass')
  })

  it('never returns an empty name', () => {
    expect(stepName({ run: '' })).toBe('pipeline')
    expect(stepName(undefined)).toBe('pipeline')
  })
})

describe('createPipeline().run()', () => {
  it('runs a step and reports it as ok, with a duration', async () => {
    pipeline = createPipeline({
      steps: [{ name: 'greet', run: run("process.stdout.write('hello')") }],
      logger,
    })

    const results = await pipeline.run()

    expect(results).toEqual([
      { name: 'greet', ok: true, duration: expect.any(Number) },
    ])
    expect(lines(logger.info)).toContain('[greet] hello')
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('resolves to an empty list when there are no steps, spawning nothing', async () => {
    pipeline = createPipeline({ logger })
    expect(await pipeline.run()).toEqual([])
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('runs the steps in order, each awaited before the next starts', async () => {
    const file = `${dir}/order.txt`
    const append = (mark) =>
      run(`require('fs').appendFileSync('${file}', '${mark}')`)
    pipeline = createPipeline({
      steps: [
        { name: 'first', run: append('1') },
        { name: 'second', run: append('2') },
        { name: 'third', run: append('3') },
      ],
      logger,
    })

    const results = await pipeline.run()

    expect(results.map((r) => r.name)).toEqual(['first', 'second', 'third'])
    expect(await fs.readFile(file, 'utf8')).toBe('123')
  })

  it('reports a non-zero exit as a failed step, carrying an error', async () => {
    pipeline = createPipeline({
      steps: [{ name: 'broken', run: run('process.exit(3)') }],
      logger,
    })

    const [result] = await pipeline.run()

    expect(result.ok).toBe(false)
    expect(result.error).toBeInstanceOf(Error)
    expect(result.error.message).toContain('"broken"')
    expect(result.error.message).toContain('exit code 3')
    expect(logger.error).toHaveBeenCalledWith(result.error.message)
  })

  it('attempts every step, so a report names each failure and not only the first', async () => {
    pipeline = createPipeline({
      steps: [
        { name: 'a', run: run('process.exit(1)') },
        { name: 'b', run: run('process.exit(2)') },
        { name: 'c', run: run('process.exit(0)') },
      ],
      logger,
    })

    const results = await pipeline.run()

    expect(results.map((r) => `${r.name}:${r.ok}`)).toEqual([
      'a:false',
      'b:false',
      'c:true',
    ])
  })

  it('reports a command that cannot be spawned at all', async () => {
    pipeline = createPipeline({
      steps: [{ name: 'nowhere', run: run('1'), cwd: `${dir}/does-not-exist` }],
      logger,
    })

    const [result] = await pipeline.run()

    expect(result.ok).toBe(false)
    expect(result.error.message).toContain('"nowhere"')
    // The whole point of catching it: a spawn failure is a result, never a
    // rejection the caller has to guard the asset queue against.
    expect(result.duration).toEqual(expect.any(Number))
  })

  it('never rejects, whatever the step does', async () => {
    pipeline = createPipeline({
      steps: [{ run: run('process.exit(9)') }],
      logger,
    })
    await expect(pipeline.run()).resolves.toHaveLength(1)
  })

  it('passes the given env on top of process.env', async () => {
    pipeline = createPipeline({
      steps: [
        {
          name: 'env',
          run: run(
            "process.stdout.write(process.env.KISS_BUILD + '|' + process.env.KISS_DEV + '|' + (process.env.PATH ? 'inherited' : 'lost'))",
          ),
        },
      ],
      logger,
    })

    await pipeline.run({ KISS_BUILD: './public', KISS_DEV: '0' })

    expect(lines(logger.info)).toContain('[env] ./public|0|inherited')
  })

  it('runs the command in the step cwd', async () => {
    pipeline = createPipeline({
      steps: [
        {
          name: 'write',
          run: run("require('fs').writeFileSync('made-here.txt', 'x')"),
          cwd: dir,
        },
      ],
      logger,
    })

    const [result] = await pipeline.run()

    expect(result.ok).toBe(true)
    expect(await fs.pathExists(`${dir}/made-here.txt`)).toBe(true)
  })

  it('sends stdout to info and stderr to warn, line by line', async () => {
    pipeline = createPipeline({
      steps: [
        {
          name: 'noisy',
          run: run(
            "process.stdout.write('one\\ntwo\\n'); process.stderr.write('rebuilding')",
          ),
        },
      ],
      logger,
    })

    await pipeline.run()

    expect(lines(logger.info)).toEqual(
      expect.arrayContaining(['[noisy] one', '[noisy] two']),
    )
    expect(lines(logger.warn)).toEqual(['[noisy] rebuilding'])
  })
})

describe('createPipeline() watch processes', () => {
  const forever = run('setInterval(() => {}, 1000)')

  it('starts no watch process outside dev mode', async () => {
    pipeline = createPipeline({
      steps: [{ name: 'w', run: run('1'), watch: forever }],
      logger,
    })

    await pipeline.run()

    expect(pipeline.watching()).toEqual([])
  })

  it('starts one in dev mode and close() ends it', async () => {
    pipeline = createPipeline({
      steps: [{ name: 'w', run: run('1'), watch: forever }],
      logger,
      dev: true,
    })

    await pipeline.run()
    expect(pipeline.watching()).toEqual(['w'])

    await pipeline.close()

    expect(pipeline.watching()).toEqual([])
    // Nothing about a deliberate teardown is an error worth logging.
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('really ends the tool, not just the shell that started it', async () => {
    // The shell may fork rather than exec (dash does, for a command carrying
    // quotes), so killing the child alone leaves the real tool orphaned. The
    // command reports its own pid, and close() has to have ended *that*.
    const file = `${dir}/watch.pid`
    pipeline = createPipeline({
      steps: [
        {
          name: 'w',
          run: run('1'),
          watch: run(
            `require('fs').writeFileSync('${file}', String(process.pid)); setInterval(() => {}, 1000)`,
          ),
        },
      ],
      logger,
      dev: true,
    })

    await pipeline.run()
    await vi.waitFor(() => expect(fs.existsSync(file)).toBe(true))
    const pid = Number(await fs.readFile(file, 'utf8'))
    expect(pid).toBeGreaterThan(0)
    // Not this process's own child: the shell it started is.
    expect(pid).not.toBe(process.pid)

    const startedAt = Date.now()
    await pipeline.close()

    // `close()` waits for the child's `'close'`, which only fires once every
    // pipe is closed — and an orphaned tool holds them open. Signalling the
    // shell alone therefore hung here for ever before the process group went
    // in; the SIGKILL fallback is 2s behind SIGTERM, so anything under a
    // second is the group having gone down together, on the first signal.
    expect(Date.now() - startedAt).toBeLessThan(1000)
  })

  it('listens for a terminal signal only while something is being watched', async () => {
    // A detached watch process no longer dies with the terminal, so the
    // handler is what stops a Ctrl-C leaving a --watch compiler behind.
    const before = process.listenerCount('SIGINT')
    pipeline = createPipeline({
      steps: [{ name: 'w', run: run('1'), watch: forever }],
      logger,
      dev: true,
    })

    await pipeline.run()
    expect(process.listenerCount('SIGINT')).toBe(before + 1)
    expect(process.listenerCount('SIGTERM')).toBeGreaterThan(0)

    await pipeline.close()

    expect(process.listenerCount('SIGINT')).toBe(before)
  })

  it('does not start a watch process for a step whose run failed', async () => {
    pipeline = createPipeline({
      steps: [{ name: 'w', run: run('process.exit(1)'), watch: forever }],
      logger,
      dev: true,
    })

    await pipeline.run()

    expect(pipeline.watching()).toEqual([])
  })

  it('starts it once, however many times the steps are run again', async () => {
    pipeline = createPipeline({
      steps: [{ name: 'w', run: run('1'), watch: forever }],
      logger,
      dev: true,
    })

    await pipeline.run()
    const [first] = pipeline.watching()
    await pipeline.run()
    await pipeline.run()

    expect(pipeline.watching()).toEqual([first])
    expect(
      lines(logger.info).filter((line) =>
        line.startsWith('pipeline: watching'),
      ),
    ).toHaveLength(1)
  })

  it('logs a watch process that exits by itself, without failing anything', async () => {
    pipeline = createPipeline({
      steps: [{ name: 'w', run: run('1'), watch: run('process.exit(4)') }],
      logger,
      dev: true,
    })

    const results = await pipeline.run()
    // The exit is asynchronous — run() does not wait for a watch process.
    await vi.waitFor(() => expect(pipeline.watching()).toEqual([]))

    expect(results[0].ok).toBe(true)
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('pipeline watch "w" exited'),
    )
  })

  it('starts no watch process after close()', async () => {
    pipeline = createPipeline({
      steps: [{ name: 'w', run: run('1'), watch: forever }],
      logger,
      dev: true,
    })

    await pipeline.close()
    await pipeline.run()

    expect(pipeline.watching()).toEqual([])
  })
})
