// `scripts/base-branch.mjs` exits 1 with nothing on stdout when it cannot
// name a base: no integration branch, a branch with no commit, an override
// that is no branch. A skill that captures it with `BASE=$(…)` and carries
// on runs `git diff "...HEAD"`, an empty diff that exits 0, and reports a
// clean secrets scan or no untested module (code review, round 16; the exit
// was added in round 13). So every capture stops when the script fails.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const skillFiles = (dir) =>
  fs
    .readdirSync(path.join(root, dir), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.md'))
    .map((f) => path.join(dir, f))

const CAPTURE = /^\s*\w+=\$\(node scripts\/base-branch\.mjs[^)]*\)(.*)$/

describe('every skill that captures the base stops when it cannot be named', () => {
  const captures = ['.claude/skills', 'plugins']
    .flatMap(skillFiles)
    .flatMap((file) =>
      fs
        .readFileSync(path.join(root, file), 'utf8')
        .split(/\r?\n/)
        .map((line, i) => [`${file}:${i + 1}`, CAPTURE.exec(line)])
        .filter(([, m]) => m),
    )

  it('finds the captures, so a broken pattern cannot pass silently', () => {
    expect(captures.length).toBeGreaterThan(5)
  })

  it.each(captures.map(([where, m]) => [where, m[1]]))('%s', (where, rest) => {
    expect(rest.trim()).toMatch(/^(&&|\|\| exit 1\b)/)
  })
})
