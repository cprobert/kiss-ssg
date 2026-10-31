// lib/git.js: the git questions `kiss-ssg session` and `kiss-ssg base` ask,
// asked one way. The rules worth pinning are the ones review rounds found:
// a ref is checked by its exact full name, never resolved as a revision
// (round 16), a tag that shares a branch's short name is never read as the
// branch (rounds 5, 6, 19), and a git that refuses says so in one line,
// never as a stack trace a caller cannot tell from "nothing found" (round 11).
import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { GitError, git, tryGit, refExists, branchRefs } from '../../lib/git.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-git-'))
const emptyConfig = path.join(root, 'empty.gitconfig')
fs.writeFileSync(emptyConfig, '')
for (const key of Object.keys(process.env))
  if (key.startsWith('GIT_')) delete process.env[key]
process.env.GIT_CONFIG_GLOBAL = emptyConfig
process.env.GIT_CONFIG_NOSYSTEM = '1'
process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 't'
process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 't@e'
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

// A repository with a branch `v2` and a tag `v2` on different commits.
const repo = path.join(root, 'repo')
fs.mkdirSync(repo)
const run = (...args) =>
  execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
run('init', '-q', '-b', 'main')
run('commit', '-q', '--allow-empty', '-m', 'one')
run('tag', 'v2')
run('commit', '-q', '--allow-empty', '-m', 'two')
run('branch', 'v2')
const outside = path.join(root, 'not-a-repo')
fs.mkdirSync(outside)

describe('git', () => {
  it("returns git's stdout", () => {
    expect(git(['branch', '--show-current'], { cwd: repo })).toBe('main\n')
  })

  it('passes input on stdin', () => {
    const sha = git(['rev-parse', 'refs/heads/main'], { cwd: repo }).trim()
    expect(
      git(['cat-file', '--batch-check'], { cwd: repo, input: `${sha}\n` }),
    ).toBe(
      `${sha} commit ${git(['cat-file', '-s', sha], { cwd: repo }).trim()}\n`,
    )
  })

  it("throws a GitError carrying git's first line when git refuses", () => {
    let thrown
    try {
      git(['status'], { cwd: outside })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(GitError)
    expect(thrown.message).toMatch(/^fatal: not a git repository/)
    expect(thrown.message).not.toContain('\n')
  })
})

describe('tryGit', () => {
  it('returns trimmed stdout, or null when git refuses', () => {
    expect(tryGit(['branch', '--show-current'], repo)).toBe('main')
    expect(tryGit(['status'], outside)).toBeNull()
  })
})

describe('refExists', () => {
  it('answers for an exact full ref name', () => {
    expect(refExists('refs/heads/main', repo)).toBe(true)
    expect(refExists('refs/heads/v2', repo)).toBe(true)
    expect(refExists('refs/tags/v2', repo)).toBe(true)
    expect(refExists('refs/heads/nope', repo)).toBe(false)
  })

  it('never resolves a revision expression as a ref', () => {
    expect(refExists('refs/heads/main~1', repo)).toBe(false)
    expect(refExists('refs/tags/v2^{}', repo)).toBe(false)
  })

  it('never reads a short name, which a tag would shadow', () => {
    expect(refExists('v2', repo)).toBe(false)
  })

  it('asks the runner it is given', () => {
    const asked = []
    const answer = (args) => {
      asked.push(args)
      return null
    }
    expect(refExists('refs/heads/x', repo, answer)).toBe(false)
    expect(asked).toEqual([['show-ref', '--verify', 'refs/heads/x']])
  })
})

describe('branchRefs', () => {
  it('lists the local branch first, then origin, by full name', () => {
    expect(branchRefs('x', () => true)).toEqual([
      { full: 'refs/heads/x', short: 'x' },
      { full: 'refs/remotes/origin/x', short: 'origin/x' },
    ])
  })

  it('keeps only the refs that exist', () => {
    expect(branchRefs('x', (full) => full.startsWith('refs/remotes/'))).toEqual(
      [{ full: 'refs/remotes/origin/x', short: 'origin/x' }],
    )
    expect(branchRefs('x', () => false)).toEqual([])
  })
})
