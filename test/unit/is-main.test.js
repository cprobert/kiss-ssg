// Every script in scripts/ runs its command line only when it is the program
// node was started with. The guard compared `import.meta.filename`, which
// node resolves through symlinks, with `process.argv[1]`, which it does not,
// so a script started through a symlinked path did nothing and exited 0
// (code review, round 13). For session-file.mjs an empty answer means "no
// session file", and a skill would act on it.
import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from '../../scripts/is-main.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))

describe('isMain', () => {
  it('is false for a module node was not started with', () => {
    expect(isMain(fileURLToPath(import.meta.url))).toBe(false)
  })
})

describe('a script started through a symlinked path', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-symlink-'))
  const linked = path.join(root, 'repo')
  fs.symlinkSync(repo, linked, 'junction')
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it.skipIf(process.platform === 'win32')('still runs its command line', () => {
    const run = (dir) =>
      spawnSync('node', [path.join(dir, 'scripts/base-branch.mjs'), '--name'], {
        cwd: repo,
        encoding: 'utf8',
      })
    const direct = run(repo)
    const viaLink = run(linked)
    expect(direct.stdout).not.toBe('')
    expect(viaLink.stdout).toBe(direct.stdout)
    expect(viaLink.status).toBe(direct.status)
  })
})
