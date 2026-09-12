import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { aikbStaleness } from '../../.claude/skills/corpse-collector/scripts/scan.mjs'

// The check reads real git history, and this repo's history changes under the
// test every time someone commits — so each test builds its own throwaway
// repository and drives the exported function over that instead.
const repos = []

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'kiss-corpse-'))
  repos.push(root)
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, stdio: 'ignore' })
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Corpse Collector Test')
  git('config', 'commit.gpgsign', 'false')
  mkdirSync(join(root, 'lib'))
  mkdirSync(join(root, 'AIKB'))
  return {
    root,
    write(rel, text) {
      writeFileSync(join(root, rel), text)
    },
    commit(message) {
      git('add', '-A')
      git('commit', '-q', '-m', message)
    },
  }
}

afterEach(() => {
  while (repos.length) rmSync(repos.pop(), { recursive: true, force: true })
})

describe('aikbStaleness', () => {
  it('counts the commits touching a module since its doc last changed', () => {
    const repo = makeRepo()
    repo.write('lib/x.js', 'export const x = 1\n')
    repo.write('AIKB/x.md', '# x\n')
    repo.commit('add x and its doc')
    repo.write('lib/x.js', 'export const x = 2\n')
    repo.commit('change x')
    repo.write('lib/x.js', 'export const x = 3\n')
    repo.commit('change x again')

    const rows = aikbStaleness(repo.root)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      module: 'lib/x.js',
      doc: 'AIKB/x.md',
      behind: 2,
    })
    expect(rows[0].docSha).toMatch(/^[0-9a-f]{7,40}$/)
    expect(rows[0].docDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('clears the row once the doc is touched again', () => {
    const repo = makeRepo()
    repo.write('lib/x.js', 'export const x = 1\n')
    repo.write('AIKB/x.md', '# x\n')
    repo.commit('add x and its doc')
    repo.write('lib/x.js', 'export const x = 2\n')
    repo.commit('change x')
    repo.write('lib/x.js', 'export const x = 3\n')
    repo.commit('change x again')
    expect(aikbStaleness(repo.root)).toHaveLength(1)

    repo.write('AIKB/x.md', '# x\n\nNow describes x = 3.\n')
    repo.commit('bring the doc up to date')
    expect(aikbStaleness(repo.root)).toEqual([])
  })

  it('stays quiet below the threshold, and reports it when asked', () => {
    const repo = makeRepo()
    repo.write('lib/x.js', 'export const x = 1\n')
    repo.write('AIKB/x.md', '# x\n')
    repo.commit('add x and its doc')
    repo.write('lib/x.js', 'export const x = 2\n')
    repo.commit('change x')

    expect(aikbStaleness(repo.root)).toEqual([])
    expect(aikbStaleness(repo.root, { minCommits: 1 })).toMatchObject([
      { module: 'lib/x.js', behind: 1 },
    ])
  })

  it('ignores a module with no doc, and a doc git has never seen', () => {
    const repo = makeRepo()
    repo.write('lib/x.js', 'export const x = 1\n')
    repo.write('AIKB/x.md', '# x\n')
    // y has no doc at all; z's doc exists on disk but was never committed.
    repo.write('lib/y.js', 'export const y = 1\n')
    repo.write('lib/z.js', 'export const z = 1\n')
    repo.commit('add three modules and one doc')
    for (const n of [2, 3]) {
      repo.write('lib/x.js', `export const x = ${n}\n`)
      repo.write('lib/y.js', `export const y = ${n}\n`)
      repo.write('lib/z.js', `export const z = ${n}\n`)
      repo.commit(`change all three (${n})`)
    }
    repo.write('AIKB/z.md', '# z\n')

    expect(aikbStaleness(repo.root).map((r) => r.doc)).toEqual(['AIKB/x.md'])
  })

  it('returns nothing when there is no lib/ to scan', () => {
    const root = mkdtempSync(join(tmpdir(), 'kiss-corpse-'))
    repos.push(root)
    expect(aikbStaleness(root)).toEqual([])
  })
})
