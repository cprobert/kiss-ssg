import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawnSync } from 'node:child_process'

// The real bin in a real empty folder, then the real check over what it wrote:
// the only proof that the starter `init` drops actually builds.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')

const dirs = []
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true })
})

function emptySite() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-init-'))
  dirs.push(dir)
  // The engine as a consuming site resolves it; a junction needs no admin on Windows.
  fs.mkdirSync(path.join(dir, 'node_modules'))
  fs.symlinkSync(
    repoRoot,
    path.join(dir, 'node_modules', 'kiss-ssg'),
    'junction',
  )
  return dir
}

const run = (cwd, ...args) =>
  spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8' })

function snapshot(dir) {
  const out = {}
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), {
      withFileTypes: true,
    })) {
      const p = path.posix.join(rel, e.name)
      if (e.name === 'node_modules' || e.name === 'public') continue
      if (e.isDirectory()) walk(p)
      else
        out[p] = crypto
          .createHash('sha1')
          .update(fs.readFileSync(path.join(dir, p)))
          .digest('hex')
    }
  }
  walk('')
  return out
}

describe('kiss-ssg init', () => {
  it('turns an empty folder into a site that passes check', () => {
    const dir = emptySite()
    const init = run(dir, 'init', '--no-install')
    expect(init.status, init.stderr).toBe(0)
    expect(init.stdout).toMatch(/create\s+router\.js/)
    expect(init.stdout).toContain('Next:')
    for (const f of [
      'package.json',
      'router.js',
      '.gitignore',
      'CLAUDE.md',
      'AGENTS.md',
      '.claude/settings.json',
      'src/pages/index.hbs',
    ])
      expect(fs.existsSync(path.join(dir, f)), f).toBe(true)
    const check = run(dir, 'check', '--summary', 'router.js')
    expect(check.status, check.stderr).toBe(0)
  })

  it('changes nothing when run a second time', () => {
    const dir = emptySite()
    run(dir, 'init', '--no-install')
    const before = snapshot(dir)
    const again = run(dir, 'init', '--no-install')
    expect(again.status).toBe(0)
    expect(again.stdout).not.toMatch(/^\s+(create|merge|append)\b/m)
    expect(snapshot(dir)).toEqual(before)
  })

  it('rejects an argument with the help', () => {
    const res = run(emptySite(), 'init', 'router.js')
    expect(res.status).toBe(1)
    expect(res.stderr).toContain('kiss-ssg init [--no-install]')
  })
})
