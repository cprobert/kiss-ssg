// The docs-sweep skill's scope script resolves the base branch first, and
// `base-branch.mjs` throws `BaseBranchError` when there is nothing to diff
// against (a branch with no commit yet). gates.mjs and the base-branch CLI
// report that in one line; the scope script crashed with a stack trace
// (code review, round 12).
import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(
  new URL('../../.claude/skills/docs-sweep/scripts/scope.mjs', import.meta.url),
)

describe('docs-sweep scope', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-scope-'))
  const emptyConfig = path.join(root, 'empty.gitconfig')
  fs.writeFileSync(emptyConfig, '')
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    ),
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: '1',
  }
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it('says in one line that a base with no commit has nothing to diff', () => {
    const repo = path.join(root, 'unborn')
    fs.mkdirSync(path.join(repo, 'lib'), { recursive: true })
    fs.writeFileSync(path.join(repo, 'CLAUDE.md'), '# x\n')
    execFileSync('git', ['init', '-q', '-b', 'main'], {
      cwd: repo,
      env,
      stdio: 'ignore',
    })
    const result = spawnSync('node', [script], {
      cwd: repo,
      env,
      encoding: 'utf8',
    })
    expect(result.status).toBe(2)
    expect(result.stderr).toBe(
      'docs-sweep: base-branch: main has no commit here or on origin yet, so there is nothing to diff against\n',
    )
  })
})
