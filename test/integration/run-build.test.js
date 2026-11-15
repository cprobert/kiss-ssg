import { describe, it, expect, afterEach } from 'vitest'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { makeSite } from '../helpers/site.js'

// `kiss-ssg build`, the real bin run as a real child process (spec § 5.1).
const repoRoot = path.resolve(import.meta.dirname, '../..')
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')
const enginePath = path.join(repoRoot, 'lib', 'kiss.js')
const engine = pathToFileURL(enginePath).href

const cli = (root, args) => {
  const env = { ...process.env, NO_COLOR: '1' }
  for (const name of [
    'KISS_CHECK',
    'KISS_AIKB',
    'KISS_REPORT',
    'KISS_IMAGES',
    'KISS_IMAGES_REFRESH',
  ])
    delete env[name]
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    env,
    encoding: 'utf8',
  })
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

const count = (text, needle) => text.split(needle).length - 1

// The script records the arguments it was given where the test can read them.
const ESM = `import fs from 'node:fs'
import Kiss from '${engine}'
fs.writeFileSync('argv.json', JSON.stringify(process.argv.slice(2)))
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().generate()
await kiss.complete()
`

const CJS = `const fs = require('node:fs')
const Kiss = require(${JSON.stringify(enginePath)})
fs.writeFileSync('argv.json', JSON.stringify(process.argv.slice(2)))
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().generate()
kiss.complete().then(() => {})
`

// No reporter and no catch: the rejection is the script's whole error handling.
const FAILING = `import Kiss from '${engine}'
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().generate()
await kiss.complete()
`

const FAILING_CJS = `const Kiss = require(${JSON.stringify(enginePath)})
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().generate()
kiss.complete()
`

const PAGES = {
  'src/pages/index.hbs': '<p>hello</p>',
  'src/pages/about.hbs': '<p>about</p>',
}
const BROKEN = {
  ...PAGES,
  'src/pages/menu.hbs': '<p>{{link "no-such-page"}}</p>',
}

let temp
afterEach(async () => {
  await temp?.cleanup()
  temp = null
})

describe('kiss-ssg build', () => {
  it('runs an ES module site, hands it its arguments, and exits 0 with one verdict line', async () => {
    temp = await makeSite({ ...PAGES, 'build.mjs': ESM })

    const run = cli(temp.root, ['build', 'build.mjs', 'production', '--flag'])

    expect(run.status).toBe(0)
    expect(JSON.parse(await temp.read('argv.json'))).toEqual([
      'production',
      '--flag',
    ])
    expect(await temp.exists('public/index.html')).toBe(true)
    expect(run.stdout).not.toContain('ok ./public')
    expect(count(run.stderr, 'ok ./public (build)')).toBe(1)
    expect(run.stderr).toMatch(/^ok \.\/public \(build\) — 2 pages, 0 failed/m)
  }, 60000)

  it('runs a CommonJS site the same way', async () => {
    temp = await makeSite({ ...PAGES, 'build.cjs': CJS })

    const run = cli(temp.root, ['build', 'build.cjs', 'production'])

    expect(run.status).toBe(0)
    expect(JSON.parse(await temp.read('argv.json'))).toEqual(['production'])
    expect(count(run.stderr, 'ok ./public (build)')).toBe(1)
  }, 60000)

  it('names no script: router.js', async () => {
    temp = await makeSite({ ...PAGES, 'router.js': ESM })

    const run = cli(temp.root, ['build'])

    expect(run.status).toBe(0)
    expect(JSON.parse(await temp.read('argv.json'))).toEqual([])
    expect(await temp.exists('public/index.html')).toBe(true)
  }, 60000)

  it('exits 1 for a failing page, with its message once and its path once, and no dump', async () => {
    temp = await makeSite({ ...BROKEN, 'build.mjs': FAILING })

    const run = cli(temp.root, ['build', 'build.mjs'])

    expect(run.status).toBe(1)
    expect(count(run.stderr, 'no page with id "no-such-page"')).toBe(1)
    expect(run.stderr).toMatch(
      /^FAIL \.\/public \(build\) — 3 pages, 1 failed/m,
    )
    expect(run.stderr.split('\n')).toContain('  ./public/menu.html')
    expect(`${run.stdout}${run.stderr}`).not.toContain('AggregateError')
  }, 60000)

  it('does the same for a CommonJS script whose rejection nobody caught', async () => {
    temp = await makeSite({ ...BROKEN, 'build.cjs': FAILING_CJS })

    const run = cli(temp.root, ['build', 'build.cjs'])

    expect(run.status).toBe(1)
    expect(count(run.stderr, 'no page with id "no-such-page"')).toBe(1)
    expect(run.stderr.split('\n')).toContain('  ./public/menu.html')
    expect(`${run.stdout}${run.stderr}`).not.toContain('AggregateError')
  }, 60000)

  it('treats a word before the script as the script, not an argument', async () => {
    temp = await makeSite({ ...PAGES, 'router.js': ESM })

    const run = cli(temp.root, ['build', 'production'])

    expect(run.status).toBe(1)
    expect(run.stderr).toContain(
      'no script named production (looked for production, production.js, .mjs, .cjs). The script comes first: `kiss-ssg build router.js production`',
    )
    expect(await temp.exists('public')).toBe(false)
    expect(await temp.exists('argv.json')).toBe(false)
  }, 60000)

  it('refuses an option before the script and says to name the script', async () => {
    temp = await makeSite({ ...PAGES, 'router.js': ESM })

    const run = cli(temp.root, ['build', '--atomic'])

    expect(run.status).toBe(1)
    expect(run.stderr).toContain('unknown option: --atomic')
    expect(run.stderr).toContain('kiss-ssg build router.js --atomic')
    expect(await temp.exists('public')).toBe(false)
  }, 60000)

  it('refuses an engine that cannot read the request, before anything runs', async () => {
    temp = await makeSite({
      ...PAGES,
      'router.js': ESM,
      'node_modules/kiss-ssg/package.json': {
        name: 'kiss-ssg',
        version: '2.17.1',
      },
    })

    const run = cli(temp.root, ['build'])

    expect(run.status).toBe(1)
    expect(run.stderr).toContain(
      'kiss-ssg build: the kiss-ssg this site resolves',
    )
    expect(run.stderr).toContain('2.17.1')
    expect(await temp.exists('public')).toBe(false)
    expect(await temp.exists('argv.json')).toBe(false)
  }, 60000)

  it('lets an engine that holds the preload through', async () => {
    temp = await makeSite({
      ...PAGES,
      'router.js': ESM,
      'node_modules/kiss-ssg/package.json': {
        name: 'kiss-ssg',
        version: '2.18.0',
      },
      'node_modules/kiss-ssg/lib/run-preload.js': '',
    })

    const run = cli(temp.root, ['build'])

    expect(run.status).toBe(0)
    expect(run.stderr).toContain('kiss-ssg 2.18.0 from node_modules/kiss-ssg')
  }, 60000)

  it('says when a script exits 0 having settled nothing', async () => {
    temp = await makeSite({
      ...PAGES,
      'router.js': `import Kiss from '${engine}'
new Kiss({ folders: { src: './src', build: './public' } })
process.exit(0)
`,
    })

    const run = cli(temp.root, ['build'])

    expect(run.status).toBe(1)
    expect(run.stderr).toContain(
      'kiss-ssg: the script exited without settling a build',
    )
  }, 60000)

  it('exits non-zero when the script does, and adds no line of its own', async () => {
    temp = await makeSite({
      ...PAGES,
      'router.js': 'process.exit(3)\n',
    })

    const run = cli(temp.root, ['build'])

    expect(run.status).toBe(1)
    expect(run.stderr).not.toContain('without settling')
  }, 60000)

  // A live handle the script left open (a timer, a socket, a tool it spawned)
  // must not keep a failed build alive: without the preload Node exits 1 on the
  // rejection, and the command's child has to end the same way. The safety
  // timer ends a hung child at 10 s with code 9, so a regression is slow and
  // visible, never a leaked process.
  const HANG = (head, tail) => `${head}
setInterval(() => {}, 1000)
setTimeout(() => process.exit(9), 10000)
${tail}`
  const OPEN_HANDLE = {
    esm: HANG(
      `import Kiss from '${engine}'
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().generate()`,
      'await kiss.complete()',
    ),
    cjs: HANG(
      `const Kiss = require(${JSON.stringify(enginePath)})
const kiss = new Kiss({ folders: { src: './src', build: './public' } })
kiss.scan().generate()`,
      'kiss.complete()',
    ),
  }

  it.each([
    ['build', 'esm', 'build.mjs'],
    ['build', 'cjs', 'build.cjs'],
    ['check', 'esm', 'build.mjs'],
    ['check', 'cjs', 'build.cjs'],
  ])(
    'ends a failed %s with an open handle (%s) at exit 1, not after the handle',
    async (command, kind, script) => {
      temp = await makeSite({ ...BROKEN, [script]: OPEN_HANDLE[kind] })

      const started = Date.now()
      const run = cli(temp.root, [command, script])
      const took = Date.now() - started

      expect(run.status).toBe(1)
      expect(took).toBeLessThan(8000)
      expect(count(run.stderr, 'no page with id "no-such-page"')).toBe(1)
    },
    60000,
  )

  it('prints --help and exits 0', async () => {
    temp = await makeSite({})
    const run = cli(temp.root, ['build', '--help'])
    expect(run.status).toBe(0)
    expect(run.stdout).toContain('build [script]')
  }, 60000)
})
