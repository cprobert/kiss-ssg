// The published types are generated, not written, so they can go stale in two
// directions: a JSDoc edit nobody regenerated, and a declaration that no longer
// says what a consumer needs. Both are checked here — the first by regenerating
// and byte-comparing, the second by type-checking a plain-JS fixture site
// against the checked-in declarations exactly as a consumer would.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { emitTypes } from '../../scripts/emit-types.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const checkedIn = path.join(root, 'types')
const declarations = (dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.d.ts'))
    .sort()

describe('types/ is what `npm run types` emits', () => {
  let temp
  let fresh

  beforeAll(() => {
    temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-types-'))
    fresh = emitTypes({ outDir: temp })
  })

  afterAll(() => fs.rmSync(temp, { recursive: true, force: true }))

  it('emits one declaration per lib module', () => {
    const modules = fs
      .readdirSync(path.join(root, 'lib'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => f.replace(/\.js$/, '.d.ts'))
      .sort()
    expect(fresh.files).toEqual(modules)
    expect(declarations(checkedIn)).toEqual(modules)
  })

  it.each(declarations(checkedIn))(
    'types/%s is byte-identical to a fresh emit',
    (file) => {
      expect(
        fs.readFileSync(path.join(checkedIn, file), 'utf8'),
        `types/${file} is stale: run \`npm run types\` and commit the result`,
      ).toBe(fs.readFileSync(path.join(temp, file), 'utf8'))
    },
  )
})

describe('the entry declaration keeps its load-bearing exports', () => {
  const entry = fs.readFileSync(path.join(checkedIn, 'kiss.d.ts'), 'utf8')

  it('keeps the default export', () => {
    expect(entry).toContain('export default Kiss;')
  })

  // tsc drops the quotes when it emits this from a .js source, which is a
  // syntax error — see `quoteStringExportNames` in scripts/emit-types.mjs. It
  // is the line that makes `require('kiss-ssg')` return the class.
  it("keeps the quoted 'module.exports' export, and the utils re-export", () => {
    expect(entry).toContain("export { Kiss as 'module.exports', utils };")
    expect(entry).toContain("import utils from './utils.js';")
  })

  it.each([
    'KissConfig',
    'KissConfigInput',
    'KissFolders',
    'PageOptions',
    'PagesOptions',
    'PageOptionsPatch',
    'KissController',
    'BuildData',
    'BuildFailure',
    'BuildError',
    'SitemapOptions',
    'WatchOptions',
  ])('exports %s as a named type', (name) => {
    expect(entry).toContain(`export type ${name} `)
  })

  it('keeps every private member out of the documented surface', () => {
    expect(entry).not.toMatch(/^ {4}_[A-Za-z]+[:(]/m)
  })
})

const typeCheck = (project) =>
  spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
      '-p',
      path.join(root, project),
    ],
    { cwd: root, encoding: 'utf8' },
  )

// `file.js(12,6): error TS2339: Property 'buildIt' does not exist …`
const reported = (result) =>
  [
    ...`${result.stdout ?? ''}`.matchAll(
      /([\w.-]+\.js)\((\d+),\d+\): error (TS\d+): ([^\n]*)/g,
    ),
  ].map(([, file, line, code, message]) => ({
    file,
    line: Number(line),
    code,
    message,
  }))

describe('a plain-JS consumer type-checks against the shipped declarations', () => {
  it('site.js is clean', () => {
    const result = typeCheck('test/fixtures/consumer/tsconfig.json')
    expect(reported(result)).toEqual([])
    expect(result.status).toBe(0)
  })

  it('bad.js reports exactly the three deliberate mistakes', () => {
    const errors = reported(
      typeCheck('test/fixtures/consumer/tsconfig.bad.json'),
    )
    expect(errors.map(({ line, code }) => `${line}:${code}`)).toEqual([
      '8:TS2322', // cleanBuild: 1
      '9:TS2561', // folders: { biuld }
      '12:TS2339', // kiss.buildIt()
    ])
    expect(errors[0].message).toContain(
      `not assignable to type 'boolean | "atomic"`,
    )
    expect(errors[1].message).toContain("'biuld' does not exist")
    expect(errors[2].message).toContain("Property 'buildIt' does not exist")
  })
})
