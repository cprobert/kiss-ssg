import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs-extra'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { makeSite } from '../helpers/site.js'

// Two copies of kiss-ssg in one run (spec § 4.6): the command is this
// repository's, the engine is a copy of lib/ in the site's node_modules, and
// the two share nothing but the global the run state lives at. The copy's
// dependencies resolve through a junction to this repository's.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')
const preload = pathToFileURL(path.join(repoRoot, 'lib', 'run-preload.js')).href
const WARNING = 'was built without complete()'

const COMPLETES = `import Kiss from 'kiss-ssg'
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
console.log('MODE=' + Kiss.mode)
kiss.scan().generate()
await kiss.complete()
`
const NEVER = `import Kiss from 'kiss-ssg'
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().generate()
`

const env = () => {
  const out = { ...process.env, NO_COLOR: '1' }
  for (const name of [
    'KISS_CHECK',
    'KISS_AIKB',
    'KISS_REPORT',
    'KISS_IMAGES',
    'KISS_IMAGES_REFRESH',
  ])
    delete out[name]
  return out
}

const count = (text, needle) => text.split(needle).length - 1

let temp
beforeAll(async () => {
  temp = await makeSite({
    'package.json': '{"type":"module"}',
    'ok/src/pages/index.hbs': '<p>hello</p>',
    'ok/router.js': COMPLETES,
    'never/src/pages/index.hbs': '<p>hello</p>',
    'never/router.js': NEVER,
    'bad/src/pages/index.hbs': '<p>hello</p>',
    'bad/src/pages/menu.hbs': '<p>{{link "no-such-page"}}</p>',
    'bad/router.js': COMPLETES,
  })
  const copy = path.join(temp.root, 'node_modules', 'kiss-ssg')
  await fs.copy(path.join(repoRoot, 'lib'), path.join(copy, 'lib'))
  await fs.copy(
    path.join(repoRoot, 'package.json'),
    path.join(copy, 'package.json'),
  )
  fs.symlinkSync(
    path.join(repoRoot, 'node_modules'),
    path.join(copy, 'node_modules'),
    'junction',
  )
}, 60000)

afterAll(async () => {
  // The junction first: removing the tree through it would reach the
  // repository's own node_modules.
  fs.unlinkSync(
    path.join(temp.root, 'node_modules', 'kiss-ssg', 'node_modules'),
  )
  await temp.cleanup()
})

const site = (name) => path.join(temp.root, name)

describe('the command from this copy, the engine from another', () => {
  it('stages a check named by the preload alone', async () => {
    const request = { mode: 'check', owner: process.pid }
    const run = spawnSync(
      process.execPath,
      [
        '--import',
        `${preload}?run=${encodeURIComponent(JSON.stringify(request))}`,
        'router.js',
      ],
      { cwd: site('ok'), env: env(), encoding: 'utf8' },
    )
    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toContain('MODE=check')
    expect(await fs.pathExists(path.join(site('ok'), 'public'))).toBe(false)
  }, 60000)

  it('warns exactly once for a script with no complete(), under the command', () => {
    const run = spawnSync(process.execPath, [bin, 'build'], {
      cwd: site('never'),
      env: env(),
      encoding: 'utf8',
    })
    expect(run.status).toBe(1)
    expect(count(`${run.stdout}${run.stderr}`, WARNING)).toBe(1)
    expect(run.stderr).toContain('kiss-ssg 2.')
  }, 60000)

  it('warns exactly once for the same script run directly', () => {
    const run = spawnSync(process.execPath, ['router.js'], {
      cwd: site('never'),
      env: env(),
      encoding: 'utf8',
    })
    expect(run.status).toBe(1)
    expect(count(`${run.stdout}${run.stderr}`, WARNING)).toBe(1)
  }, 60000)

  it('prints no dump for a failed build, and its message once', () => {
    const run = spawnSync(process.execPath, [bin, 'build'], {
      cwd: site('bad'),
      env: env(),
      encoding: 'utf8',
    })
    expect(run.status).toBe(1)
    expect(count(run.stderr, 'no page with id "no-such-page"')).toBe(1)
    expect(run.stderr.split('\n')).toContain('  ./public/menu.html')
    expect(`${run.stdout}${run.stderr}`).not.toContain('AggregateError')
  }, 60000)

  it('lets Kiss.mode in the copy read what this command asked', () => {
    const run = spawnSync(process.execPath, [bin, 'build'], {
      cwd: site('ok'),
      env: env(),
      encoding: 'utf8',
    })
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('MODE=build')
  }, 60000)

  it('a stop sent to the preload closes an instance the other copy made', async () => {
    // This process plays the command. The child's engine asks for a server
    // over the channel (nothing is bound), settles and would then live on
    // behind its watcher: it ends only if the preload's stop reached the
    // instance, which another copy of the engine made.
    const request = { mode: 'dev', owner: process.pid }
    const child = spawn(
      process.execPath,
      [
        '--import',
        `${preload}?run=${encodeURIComponent(JSON.stringify(request))}`,
        'router.js',
      ],
      {
        cwd: site('ok'),
        env: env(),
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      },
    )
    const exited = new Promise((resolve) =>
      child.once('exit', (code, signal) => resolve({ code, signal })),
    )
    try {
      await new Promise((resolve) =>
        child.on('message', (message) => {
          if (!message.serve) return
          child.send({ serving: true, ...message.serve })
          resolve()
        }),
      )
      await new Promise((resolve) => setTimeout(resolve, 1000))
      expect(child.exitCode).toBeNull()
      child.send({ stop: true })
      expect(await exited).toEqual({ code: 0, signal: null })
    } finally {
      child.kill()
    }
  }, 60000)
})
