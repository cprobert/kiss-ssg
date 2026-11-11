import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// The package as published, not the working tree: `npm pack` makes the tarball,
// it is unpacked into a temp project's node_modules/kiss-ssg, and only the names
// in package.json's `dependencies` are linked beside it. A module that lib/ or
// bin/ imports without declaring it then fails to resolve, which is the point.
// No network: the links point at this repo's own node_modules.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const pkg = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
)
// node_modules here may itself be a junction (a git worktree borrows the main
// checkout's), so every link is made to the real folder.
const repoModules = fs.realpathSync(path.join(repoRoot, 'node_modules'))

let temp // everything this file makes lives under here
let project // the temp site
const links = [] // every link made, so cleanup can remove them before anything recursive

const run = (cwd, args) =>
  spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 60_000 })

function link(name) {
  const target = fs.realpathSync(path.join(repoModules, name))
  const at = path.join(project, 'node_modules', name)
  fs.mkdirSync(path.dirname(at), { recursive: true })
  // A junction needs no elevation on Windows.
  fs.symlinkSync(target, at, 'junction')
  links.push(at)
}

beforeAll(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-packed-'))
  project = path.join(temp, 'site')
  const packDir = path.join(temp, 'pack')
  fs.mkdirSync(packDir)
  fs.mkdirSync(path.join(project, 'node_modules', 'kiss-ssg'), {
    recursive: true,
  })

  // --ignore-scripts: `prepare` and `prepack` are the repo's own tooling.
  // npm is a .cmd shim on Windows, which only a shell can start.
  const pack = spawnSync(
    `npm pack --ignore-scripts --json --pack-destination "${packDir}"`,
    { cwd: repoRoot, encoding: 'utf8', shell: true, timeout: 110_000 },
  )
  if (pack.status !== 0) throw new Error(`npm pack failed: ${pack.stderr}`)
  const tarball = JSON.parse(pack.stdout)[0].filename

  // Relative names and a cwd: GNU tar on a Windows PATH reads `C:` as a host.
  fs.mkdirSync(path.join(temp, 'x'))
  const tar = spawnSync('tar', ['-xzf', tarball, '-C', '../x'], {
    cwd: packDir,
    encoding: 'utf8',
  })
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`)
  fs.cpSync(
    path.join(temp, 'x', 'package'),
    path.join(project, 'node_modules', 'kiss-ssg'),
    { recursive: true },
  )

  for (const name of Object.keys(pkg.dependencies)) link(name)

  fs.writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({ name: 'packed-site', private: true, type: 'module' }),
  )
  fs.cpSync(
    path.join(project, 'node_modules', 'kiss-ssg', 'starter', 'src'),
    path.join(project, 'src'),
    { recursive: true },
  )
  fs.copyFileSync(
    path.join(project, 'node_modules', 'kiss-ssg', 'starter', 'router.js'),
    path.join(project, 'router.js'),
  )
}, 120_000)

afterAll(() => {
  // Unlink every junction first: a recursive delete that followed one would
  // empty the real node_modules it points at.
  for (const at of links) fs.unlinkSync(at)
  if (temp) fs.rmSync(temp, { recursive: true, force: true })
})

describe('the packed package', () => {
  it('imports as a class from ESM and from CommonJS', () => {
    const esm = run(project, [
      '--input-type=module',
      '-e',
      "import('kiss-ssg').then(m => console.log(typeof m.default, m.default.name))",
    ])
    expect(esm.status, esm.stderr).toBe(0)
    expect(esm.stdout.trim()).toBe('function Kiss')

    fs.writeFileSync(
      path.join(project, 'cjs.cjs'),
      "const K = require('kiss-ssg'); console.log(typeof K, K.name)\n",
    )
    const cjs = run(project, ['cjs.cjs'])
    expect(cjs.status, cjs.stderr).toBe(0)
    expect(cjs.stdout.trim()).toBe('function Kiss')
  })

  it('builds the starter site', () => {
    const build = run(project, ['router.js'])
    expect(build.status, build.stderr).toBe(0)
    expect(fs.existsSync(path.join(project, 'public', 'index.html'))).toBe(true)
  })

  // The starter build only reaches the packages lib/ imports at the top, and
  // the ones its own features load. Several load lazily, inside a feature
  // (turndown for .llms(), sharp for {{image}}, purgecss for assets.purge),
  // so a build can pass with one undeclared. Every bare specifier lib/ and
  // bin/ name, static or dynamic, must resolve from the install instead.
  it('resolves every package lib/ and bin/ import, eager or lazy', () => {
    const installed = path.join(project, 'node_modules', 'kiss-ssg')
    const specifiers = new Set()
    for (const dir of ['lib', 'bin']) {
      for (const file of fs.readdirSync(path.join(installed, dir))) {
        if (!/\.m?js$/.test(file)) continue
        // Comment lines (// and JSDoc) name imports in prose and types.
        const text = fs
          .readFileSync(path.join(installed, dir, file), 'utf8')
          .split('\n')
          .filter((line) => !/^\s*(\/\/|\/?\*)/.test(line))
          .join('\n')
        const statements = [
          // import … from 'x' / export … from 'x', on one line or closing a list
          /^\s*(?:(?:import|export)\b[^;'"]*?|\}\s*)\bfrom\s*['"]([^'"]+)['"]/gm,
          /^\s*import\s*['"]([^'"]+)['"]/gm, // import 'x'
          /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g, // import('x')
        ]
        for (const pattern of statements)
          for (const [, spec] of text.matchAll(pattern)) specifiers.add(spec)
        // import(NAME), where NAME is a string constant in the same file
        for (const [, name] of text.matchAll(/\bimport\(\s*([A-Z_]+)\s*\)/g)) {
          const value = new RegExp(`const ${name} = ['"]([^'"]+)['"]`).exec(
            text,
          )
          if (value) specifiers.add(value[1])
        }
      }
    }
    const optional = Object.keys(pkg.peerDependenciesMeta ?? {})
    const bare = [...specifiers].filter(
      (spec) =>
        !/^(\.|\/|node:)/.test(spec) &&
        !optional.some((name) => spec === name || spec.startsWith(`${name}/`)),
    )
    // The packed set must include the lazy ones this test exists for.
    expect(bare).toEqual(expect.arrayContaining(['turndown', 'sharp']))
    fs.writeFileSync(
      path.join(installed, 'resolve-all.mjs'),
      [
        `const failed = []`,
        `for (const spec of ${JSON.stringify(bare)}) {`,
        `  try { import.meta.resolve(spec) } catch { failed.push(spec) }`,
        `}`,
        `console.log(JSON.stringify(failed))`,
      ].join('\n'),
    )
    const resolved = run(installed, ['resolve-all.mjs'])
    expect(resolved.status, resolved.stderr).toBe(0)
    expect(JSON.parse(resolved.stdout)).toEqual([])
  })

  it('runs check over the starter', () => {
    const check = run(project, [
      path.join('node_modules', 'kiss-ssg', 'bin', 'kiss-ssg.js'),
      'check',
      'router.js',
    ])
    expect(check.status, check.stderr).toBe(0)
  })
})
