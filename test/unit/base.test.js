// lib/base.js: which branch a site's work merges into, and which ref to diff
// against or start from. `kiss-ssg base` runs it; the kiss-memory skills used
// to ask git these questions in shell, and each review found another case
// the shell missed (2026-10-31). Here each case is pinned once.
import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  chooseDiffRef,
  chooseStart,
  parseLsRemote,
  runBase,
} from '../../lib/base.js'

describe('parseLsRemote', () => {
  it('reads the branch origin HEAD points at', () => {
    expect(parseLsRemote('ref: refs/heads/trunk\tHEAD\nabc123\tHEAD\n')).toBe(
      'trunk',
    )
  })
  it('is null for no answer', () => {
    expect(parseLsRemote(null)).toBe(null)
    expect(parseLsRemote('abc123\tHEAD\n')).toBe(null)
  })
})

describe('chooseDiffRef', () => {
  const local = { full: 'refs/heads/main' }
  const origin = { full: 'refs/remotes/origin/main' }
  it('picks the one with fewer commits to HEAD; a tie keeps local', () => {
    const behind = (n) => (full) => (full === local.full ? n[0] : n[1])
    expect(chooseDiffRef([local, origin], behind([5, 1]))).toBe(origin.full)
    expect(chooseDiffRef([local, origin], behind([1, 5]))).toBe(local.full)
    expect(chooseDiffRef([local, origin], behind([2, 2]))).toBe(local.full)
  })
  it('takes the only one, or none', () => {
    expect(chooseDiffRef([origin], () => 0)).toBe(origin.full)
    expect(chooseDiffRef([], () => 0)).toBe(null)
  })
})

describe('chooseStart', () => {
  const start = (facts) => chooseStart(facts, 'main').ref
  it.each([
    [
      { local: false, origin: true, localOnly: 0, originOnly: 0 },
      'refs/remotes/origin/main',
    ],
    [
      { local: true, origin: false, localOnly: 0, originOnly: 0 },
      'refs/heads/main',
    ],
    [
      { local: true, origin: true, localOnly: 0, originOnly: 3 },
      'refs/remotes/origin/main',
    ],
    [
      { local: true, origin: true, localOnly: 0, originOnly: 0 },
      'refs/remotes/origin/main',
    ],
    [
      { local: true, origin: true, localOnly: 2, originOnly: 0 },
      'refs/heads/main',
    ],
    [{ local: true, origin: true, localOnly: 2, originOnly: 3 }, null],
    [{ local: false, origin: false, localOnly: 0, originOnly: 0 }, null],
  ])('%j starts from %s', (facts, ref) => {
    expect(start(facts)).toBe(ref)
  })
  it('says why when there is no start', () => {
    expect(
      chooseStart(
        { local: true, origin: true, localOnly: 2, originOnly: 3 },
        'main',
      ).reason,
    ).toContain('have diverged')
  })
})

describe('runBase, in real repositories', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-base-'))
  const emptyConfig = path.join(root, 'empty.gitconfig')
  fs.writeFileSync(emptyConfig, '')
  for (const key of Object.keys(process.env))
    if (key.startsWith('GIT_')) delete process.env[key]
  process.env.GIT_CONFIG_GLOBAL = emptyConfig
  process.env.GIT_CONFIG_NOSYSTEM = '1'
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 't'
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 't@e'
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  const at =
    (dir) =>
    (...args) =>
      execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  const commit = (dir, m) => at(dir)('commit', '-q', '--allow-empty', '-m', m)

  // A remote whose default is `trunk`, with a `v2` branch and a `v2` tag.
  const remote = path.join(root, 'remote.git')
  const seed = path.join(root, 'seed')
  execFileSync('git', ['init', '-q', '--bare', '-b', 'trunk', remote], {
    stdio: 'ignore',
  })
  fs.mkdirSync(seed)
  at(seed)('init', '-q', '-b', 'trunk')
  commit(seed, 'one')
  at(seed)('branch', 'v2')
  at(seed)('tag', 'v2')
  at(seed)(
    'push',
    '-q',
    remote,
    'refs/heads/*:refs/heads/*',
    'refs/tags/*:refs/tags/*',
  )
  const clone = path.join(root, 'clone')
  execFileSync('git', ['clone', '-q', remote, clone], { stdio: 'ignore' })
  const git = at(clone)
  const run = (argv) => runBase(argv, { cwd: clone })

  it("names the remote's default when no session log names a base", () => {
    git('checkout', '-q', '-b', 'feat/a')
    expect(run([])).toMatchObject({ out: 'trunk', code: 0 })
    expect(run([]).err).toContain("origin's default branch")
  })

  it('asks origin when the clone never recorded its default', () => {
    git('remote', 'set-head', 'origin', '--delete')
    expect(run([])).toMatchObject({ out: 'trunk', code: 0 })
    expect(run([]).err).toContain('asked of origin')
  })

  it("prefers the session log's base: line", () => {
    const logs = path.join(clone, 'planning/sessions')
    fs.mkdirSync(logs, { recursive: true })
    fs.writeFileSync(
      path.join(logs, '2026-01-01-a.md'),
      '---\nbranch: feat/a\nbase: "v2" # the line\n---\n',
    )
    expect(run([])).toMatchObject({ out: 'v2', code: 0 })
    fs.rmSync(path.join(clone, 'planning'), { recursive: true })
  })

  it('names refs in full, so a tag of the same name is never read', () => {
    fs.mkdirSync(path.join(clone, 'planning/sessions'), { recursive: true })
    fs.writeFileSync(
      path.join(clone, 'planning/sessions/2026-01-01-a.md'),
      '---\nbranch: feat/a\nbase: v2\n---\n',
    )
    expect(run(['--ref']).out).toBe('refs/remotes/origin/v2')
    expect(run(['--start']).out).toBe('refs/remotes/origin/v2')
    fs.rmSync(path.join(clone, 'planning'), { recursive: true })
  })

  it('takes the base as given with --base, for work whose session log is not written yet', () => {
    expect(run(['--base', 'v2'])).toMatchObject({ out: 'v2', code: 0 })
    expect(run(['--base', 'v2']).err).toContain('named with --base')
    expect(run(['--base', 'v2', '--start']).out).toBe('refs/remotes/origin/v2')
    expect(run(['--base']).code).toBe(1)
    expect(run(['--base', 'v2', '--from-branch']).code).toBe(1)
  })

  it('diffs against origin when the local base is stale, local when it has unpushed work', () => {
    git('branch', '-f', 'trunk', 'refs/remotes/origin/trunk')
    commit(seed, 'newer')
    at(seed)('push', '-q', remote, 'refs/heads/trunk:refs/heads/trunk')
    git('fetch', '-q', 'origin')
    git('checkout', '-q', '-b', 'feat/b', 'refs/remotes/origin/trunk')
    expect(run(['--ref']).out).toBe('refs/remotes/origin/trunk')
    git('checkout', '-q', '-B', 'trunk', 'refs/remotes/origin/trunk')
    commit(clone, 'local only')
    git('checkout', '-q', '-b', 'feat/c', 'refs/heads/trunk')
    expect(run(['--ref']).out).toBe('refs/heads/trunk')
    expect(run(['--start']).out).toBe('refs/heads/trunk')
  })

  it('refuses to start from a base that has diverged', () => {
    commit(seed, 'newest')
    at(seed)('push', '-q', remote, 'refs/heads/trunk:refs/heads/trunk')
    git('fetch', '-q', 'origin')
    const result = run(['--start'])
    expect(result.code).toBe(1)
    expect(result.err).toContain('have diverged')
  })

  // Code review at the close, finding 1: --ref counted to the checkout's
  // HEAD, so a named branch was measured from wherever this checkout stood.
  it('measures --ref from the named branch, not from the checkout', () => {
    at(seed)('branch', 'rel')
    at(seed)('push', '-q', remote, 'refs/heads/rel:refs/heads/rel')
    git('fetch', '-q', 'origin')
    git('branch', '-f', 'rel', 'refs/remotes/origin/rel')
    at(seed)('checkout', '-q', 'rel')
    commit(seed, "another person's commit")
    at(seed)('push', '-q', remote, 'refs/heads/rel:refs/heads/rel')
    at(seed)('checkout', '-q', 'trunk')
    git('fetch', '-q', 'origin')
    git('checkout', '-q', '-b', 'feat/z', 'refs/remotes/origin/rel')
    fs.mkdirSync(path.join(clone, 'planning/sessions'), { recursive: true })
    fs.writeFileSync(
      path.join(clone, 'planning/sessions/2026-01-02-z.md'),
      '---\nbranch: feat/z\nbase: rel\n---\n',
    )
    expect(run(['--ref']).out).toBe('refs/remotes/origin/rel')
    git('checkout', '-q', '-b', 'elsewhere', 'refs/heads/rel')
    expect(run(['feat/z', '--ref']).out).toBe('refs/remotes/origin/rel')
    expect(run(['nowhere', '--base', 'rel', '--ref']).code).toBe(1)
    fs.rmSync(path.join(clone, 'planning'), { recursive: true })
  })

  it('says so when there is no base to name', () => {
    const lone = path.join(root, 'lone')
    fs.mkdirSync(lone)
    at(lone)('init', '-q', '-b', 'main')
    commit(lone, 'x')
    const result = runBase([], { cwd: lone })
    expect(result.code).toBe(1)
    expect(result.err).toContain('Ask which branch the work merges into')
  })
})
