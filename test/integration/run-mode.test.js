import { describe, it, expect, afterEach } from 'vitest'
import fs from 'fs-extra'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { makeSite, waitFor } from '../helpers/site.js'

// How the mode reaches the engine (spec § 4.2, § 4.3): through the preload's
// request, and through the KISS_* aliases. Each case is a real child process,
// run the way the command runs it, with no alias in the environment unless the
// case sets one.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const engine = pathToFileURL(path.join(repoRoot, 'lib', 'kiss.js')).href
const preload = pathToFileURL(path.join(repoRoot, 'lib', 'run-preload.js')).href
const ALIASES = [
  'KISS_CHECK',
  'KISS_AIKB',
  'KISS_REPORT',
  'KISS_IMAGES',
  'KISS_IMAGES_REFRESH',
]

// The child's environment: ours, with every alias taken out first.
const cleanEnv = (extra = {}) => {
  const env = { ...process.env, NO_COLOR: '1' }
  for (const name of ALIASES) delete env[name]
  return { ...env, ...extra }
}

// `request` null runs the script with no preload, as `node build.js` does.
const run = (root, { script = 'build.js', request = null, env = {} } = {}) => {
  const execArgv = request
    ? [
        '--import',
        `${preload}?run=${encodeURIComponent(
          JSON.stringify({ ...request, owner: process.pid }),
        )}`,
      ]
    : []
  const result = spawnSync(process.execPath, [...execArgv, script], {
    cwd: root,
    env: cleanEnv(env),
    encoding: 'utf8',
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    out: `${result.stdout}${result.stderr}`,
  }
}

const SITE = (dev = '', after = '') => `import Kiss from '${engine}'
const kiss = new Kiss({ folders: { src: './src', build: './public', aikb: './AIKB' }${dev} })
console.log('DEV=' + kiss.config.dev + ' MODE=' + Kiss.mode)
kiss.scan().generate()
await kiss.complete()
${after}`

const lastReport = (file) =>
  JSON.parse(fs.readFileSync(file, 'utf8').trim().split('\n').pop())

let temp
afterEach(async () => {
  await temp?.cleanup()
  temp = null
})

const make = (files = {}) =>
  makeSite({
    'src/pages/index.hbs': '<p>hello</p>',
    'build.js': SITE(),
    ...files,
  })

describe('the request and its aliases, one result', () => {
  it('a check by request stages the build and publishes nothing', async () => {
    temp = await make()
    const report = path.join(temp.root, 'r.jsonl')

    const result = run(temp.root, { request: { mode: 'check', report } })

    expect(result.status).toBe(0)
    expect(result.out).toContain('MODE=check')
    expect(lastReport(report).mode).toBe('check')
    expect(await temp.exists('public')).toBe(false)
  }, 60000)

  it('a check by KISS_CHECK alone, with no preload, is the same check', async () => {
    temp = await make()
    const report = path.join(temp.root, 'r.jsonl')

    const result = run(temp.root, {
      env: { KISS_CHECK: '1', KISS_REPORT: report },
    })

    expect(result.status).toBe(0)
    expect(result.out).toContain('MODE=check')
    expect(lastReport(report).mode).toBe('check')
    expect(await temp.exists('public')).toBe(false)
  }, 60000)

  it('records the knowledge base on the request and on KISS_AIKB alike', async () => {
    temp = await make()
    const byRequest = path.join(temp.root, 'by-request.jsonl')
    const byAlias = path.join(temp.root, 'by-alias.jsonl')

    expect(
      run(temp.root, {
        request: { mode: 'check', aikb: true, report: byRequest },
      }).status,
    ).toBe(0)
    expect(lastReport(byRequest).aikb.written).toBe(true)
    await fs.remove(path.join(temp.root, 'AIKB'))

    expect(
      run(temp.root, {
        env: { KISS_CHECK: '1', KISS_AIKB: '1', KISS_REPORT: byAlias },
      }).status,
    ).toBe(0)
    expect(lastReport(byAlias).aikb.written).toBe(true)
  }, 60000)

  it('a check that does not ask to record writes no knowledge base', async () => {
    temp = await make()
    const report = path.join(temp.root, 'r.jsonl')

    run(temp.root, { request: { mode: 'check', report } })

    expect(lastReport(report).aikb?.written ?? false).toBe(false)
    expect(await temp.exists('AIKB')).toBe(false)
  }, 60000)

  it('reports a build by request, and publishes it', async () => {
    temp = await make()
    const report = path.join(temp.root, 'r.jsonl')

    const result = run(temp.root, { request: { mode: 'build', report } })

    expect(result.status).toBe(0)
    expect(result.out).toContain('MODE=build')
    expect(lastReport(report).mode).toBe('build')
    expect(await temp.exists('public/index.html')).toBe(true)
  }, 60000)

  it('reports a build by KISS_REPORT alone', async () => {
    temp = await make()
    const report = path.join(temp.root, 'r.jsonl')

    const result = run(temp.root, { env: { KISS_REPORT: report } })

    expect(result.status).toBe(0)
    expect(result.out).toContain('MODE=null')
    expect(lastReport(report).mode).toBe('build')
    expect(await temp.exists('public/index.html')).toBe(true)
  }, 60000)

  it('says mode null when nothing asked', async () => {
    temp = await make()
    const result = run(temp.root)
    expect(result.status).toBe(0)
    expect(result.out).toContain('MODE=null')
  }, 60000)

  it('hands the request to the command’s direct child only', async () => {
    temp = await make({
      'child.js': `import Kiss from '${engine}'\nconsole.log('CHILD MODE=' + Kiss.mode)\n`,
      'build.js': SITE(
        '',
        `import { fork } from 'node:child_process'\nawait new Promise((resolve) => fork('child.js').on('exit', resolve))\n`,
      ),
    })

    const result = run(temp.root, {
      request: { mode: 'build', report: path.join(temp.root, 'r.jsonl') },
    })

    expect(result.status).toBe(0)
    expect(result.out).toContain('MODE=build')
    expect(result.out).toContain('CHILD MODE=null')
  }, 60000)
})

// A dev child with a channel, the way `kiss-ssg dev` starts one: this process
// plays the command, answers the `serve` it hears, and collects what the child
// sends. Nothing binds a port: the servers are the command's.
const devChild = (root, { restart = false } = {}) => {
  const request = {
    mode: 'dev',
    owner: process.pid,
    ...(restart && { restart }),
  }
  const child = spawn(
    process.execPath,
    [
      '--import',
      `${preload}?run=${encodeURIComponent(JSON.stringify(request))}`,
      'build.js',
    ],
    { cwd: root, env: cleanEnv(), stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
  )
  const heard = []
  let output = ''
  child.stdout.on('data', (chunk) => (output += chunk))
  child.stderr.on('data', (chunk) => (output += chunk))
  child.on('message', (message) => {
    heard.push(message)
    if (message.serve) child.send({ serving: true, ...message.serve })
  })
  const exited = new Promise((resolve) => child.once('exit', resolve))
  return {
    child,
    heard,
    output: () => output,
    stop: async () => {
      if (child.exitCode === null) child.send({ stop: true })
      await exited
    },
  }
}

describe('a dev child under the command (spec § 5.3)', () => {
  it('asks for its server over the channel and, after a build with no failure, sends one reload', async () => {
    temp = await make()
    const dev = devChild(temp.root)
    try {
      await waitFor(() => dev.heard.some((m) => 'reload' in m), {
        timeout: 30000,
      })
      await new Promise((resolve) => setTimeout(resolve, 300))
    } finally {
      await dev.stop()
    }

    expect(dev.heard.filter((m) => m.serve)).toHaveLength(1)
    expect(dev.heard.filter((m) => 'reload' in m)).toHaveLength(1)
    expect(dev.heard[0].serve).toMatchObject({
      host: '127.0.0.1',
      port: 3001,
      livereloadPort: 35729,
    })
    expect(dev.output()).not.toContain('Dev server could not bind')
  }, 60000)

  it('with one failing page, sends no reload', async () => {
    temp = await make({ 'src/pages/broken.hbs': '{{> "nope"}}' })
    const dev = devChild(temp.root)
    try {
      await waitFor(() => dev.output().includes('nope'), { timeout: 30000 })
      await new Promise((resolve) => setTimeout(resolve, 500))
    } finally {
      await dev.stop()
    }

    expect(dev.heard.filter((m) => m.serve)).toHaveLength(1)
    expect(dev.heard.filter((m) => 'reload' in m)).toEqual([])
  }, 60000)

  it('a restart builds over the folder the last child left, a first start empties it', async () => {
    temp = await make({ 'public/stale.txt': 'old' })

    const restarted = devChild(temp.root, { restart: true })
    try {
      await waitFor(() => restarted.heard.some((m) => 'reload' in m), {
        timeout: 30000,
      })
    } finally {
      await restarted.stop()
    }
    expect(await temp.exists('public/stale.txt')).toBe(true)
    expect(await temp.exists('public/index.html')).toBe(true)

    const first = devChild(temp.root)
    try {
      await waitFor(() => first.heard.some((m) => 'reload' in m), {
        timeout: 30000,
      })
    } finally {
      await first.stop()
    }
    expect(await temp.exists('public/stale.txt')).toBe(false)
  }, 90000)
})

describe('whose dev wins (spec § 4.3)', () => {
  it('build, dev not given: the mode decides', async () => {
    temp = await make()
    const result = run(temp.root, { request: { mode: 'build' } })
    expect(result.status).toBe(0)
    expect(result.out).toContain('DEV=false MODE=build')
  }, 60000)

  it('build, dev: false: agreement', async () => {
    temp = await make({ 'build.js': SITE(', dev: false') })
    const result = run(temp.root, { request: { mode: 'build' } })
    expect(result.status).toBe(0)
    expect(result.out).toContain('DEV=false MODE=build')
    expect(await temp.exists('public/index.html')).toBe(true)
  }, 60000)

  it('build, dev: true: refused, before any folder is touched', async () => {
    temp = await make({ 'build.js': SITE(', dev: true') })

    const result = run(temp.root, { request: { mode: 'build' } })

    expect(result.status).toBe(1)
    expect(result.out).toContain(
      'kiss-ssg build: build.js passes dev: true, so nothing was built.',
    )
    expect(result.out).toContain(
      'Pass the arguments that make it a build (kiss-ssg build build.js production), or run kiss-ssg dev.',
    )
    expect(await temp.exists('public')).toBe(false)
    expect(await temp.exists('AIKB')).toBe(false)
  }, 60000)

  it('dev, dev: false: refused, the same way', async () => {
    temp = await make({ 'build.js': SITE(', dev: false') })

    const result = run(temp.root, { request: { mode: 'dev' } })

    expect(result.status).toBe(1)
    expect(result.out).toContain(
      'kiss-ssg dev: build.js passes dev: false, so no dev server was started over it.',
    )
    expect(result.out).toContain('kiss-ssg dev build.js --dev')
    expect(await temp.exists('public')).toBe(false)
  }, 60000)

  it('check, dev: true: forced off, silently', async () => {
    temp = await make({ 'build.js': SITE(', dev: true') })
    const result = run(temp.root, { request: { mode: 'check' } })
    expect(result.status).toBe(0)
    expect(result.out).toContain('DEV=false MODE=check')
    expect(await temp.exists('public')).toBe(false)
  }, 60000)

  it('no command, dev: false: the script decides, as before', async () => {
    temp = await make({ 'build.js': SITE(', dev: false') })
    const result = run(temp.root)
    expect(result.status).toBe(0)
    expect(result.out).toContain('DEV=false MODE=null')
  }, 60000)
})
