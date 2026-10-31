// lib/sessions.js: the one implementation of "which session log is this
// branch's", which `kiss-ssg session` runs and the kiss-memory skills call.
// The shapes below are the ones earlier copies of the rule got wrong, one
// review at a time (2026-10-31); here each is pinned once.
import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  frontmatter,
  listLines,
  matching,
  newestFirst,
  runSession,
} from '../../lib/sessions.js'

describe('frontmatter', () => {
  it.each([
    ['---\nbranch: fix/v2.8\n---\n', 'fix/v2.8'],
    ['---\r\nbranch: fix/v2.8\r\n---\r\n', 'fix/v2.8'],
    ['\uFEFF---\nbranch: feat/x\n---\n', 'feat/x'],
    ['---  \nbranch:   feat/x  \n---\t\n', 'feat/x'],
    ['---\nbranch: "feat/x"\n---\n', 'feat/x'],
    ["---\nbranch: 'feat/x'\n---\n", 'feat/x'],
    ['---\nbranch: feat/x # the IA work\n---\n', 'feat/x'],
    // YAML starts a comment only after a space: `#` in a name is the name.
    ['---\nbranch: feat/x#2\n---\n', 'feat/x#2'],
    ['---\nbranch: a\nbranch: b\n---\n', 'a'],
  ])('%j has the branch %j', (text, branch) => {
    expect(frontmatter(text)?.branch).toBe(branch)
  })

  it.each([
    ['no frontmatter\nbranch: feat/x\n'],
    ['---\nstatus: open\nbody\nbranch: feat/x\n'],
    ['  ---\nbranch: feat/x\n---\n'],
    ['x---\nbranch: feat/x\n---\n'],
  ])('%j has no frontmatter', (text) => {
    expect(frontmatter(text)).toBe(null)
  })

  it('reads only the frontmatter, not a branch quoted in the body', () => {
    expect(frontmatter('---\ntitle: t\n---\nbranch: feat/x\n')).toEqual({
      title: 't',
    })
  })

  it('reads every key by the same rule', () => {
    expect(
      frontmatter(
        '---\nbranch: b\nbase: "release" # the line\nworktree: /w\n---\n',
      ),
    ).toEqual({ branch: 'b', base: 'release', worktree: '/w' })
  })
})

describe('matching', () => {
  const entry = (file, branch) => ({ file, show: file, fields: { branch } })
  it('compares names as text, never as a pattern or a prefix', () => {
    const entries = [
      entry('a.md', 'fix/v2.8'),
      entry('b.md', 'fix/v2x8'),
      entry('c.md', 'fix/v2.8-more'),
    ]
    expect(matching(entries, 'fix/v2.8').map((e) => e.file)).toEqual(['a.md'])
  })

  it('matches nothing for an empty branch (a detached HEAD)', () => {
    expect(matching([{ file: 'x.md', show: 'x.md', fields: {} }], '')).toEqual(
      [],
    )
  })
})

describe('newestFirst and listLines', () => {
  const entries = [
    {
      file: '2026-01-02-a.md',
      show: 'p/2026-01-02-a.md',
      fields: { branch: 'a', status: 'closed', consolidated: '2026-02-01' },
    },
    {
      file: 'archive/2026-03-01-b.md',
      show: 'p/archive/2026-03-01-b.md',
      fields: { branch: 'b', status: 'open' },
    },
    { file: '2025-12-31-c.md', show: 'p/2025-12-31-c.md', fields: {} },
  ]
  it('orders by the date in the name, subfolders included', () => {
    expect(newestFirst(entries).map((e) => e.file)).toEqual([
      'archive/2026-03-01-b.md',
      '2026-01-02-a.md',
      '2025-12-31-c.md',
    ])
  })
  it('lists path, branch, status and consolidated under a header', () => {
    expect(listLines(entries).split('\n')).toEqual([
      'path\tbranch\tstatus\tconsolidated',
      'p/archive/2026-03-01-b.md\tb\topen\t-',
      'p/2026-01-02-a.md\ta\tclosed\t2026-02-01',
      'p/2025-12-31-c.md\t-\t-\t-',
    ])
  })
})

describe('runSession, in a real repository', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-sessions-'))
  const emptyConfig = path.join(root, 'empty.gitconfig')
  fs.writeFileSync(emptyConfig, '')
  // No global or system git config, no GIT_* from the caller.
  for (const key of Object.keys(process.env))
    if (key.startsWith('GIT_')) delete process.env[key]
  process.env.GIT_CONFIG_GLOBAL = emptyConfig
  process.env.GIT_CONFIG_NOSYSTEM = '1'
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 't'
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 't@e'
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  const repo = path.join(root, 'repo')
  // A site in a subfolder of its repository, as kiss-memory supports.
  const site = path.join(repo, 'site')
  const remote = path.join(root, 'remote.git')
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, stdio: 'ignore' })
  const write = (file, text) => {
    const full = path.join(site, 'planning/sessions', file)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, text)
  }
  fs.mkdirSync(site, { recursive: true })
  git('init', '-q', '-b', 'main')
  git('commit', '-q', '--allow-empty', '-m', 'root')
  // A tag sharing a branch's name, on a commit with no logs: a lookup that
  // read the tag would find nothing.
  git('tag', 'feat/x')
  write(
    '2026-01-01-x.md',
    '---\r\nbranch: feat/x\r\nbase: main\r\nworktree: /tmp/wt\r\n---\r\n',
  )
  write('archive/2025-06-01-old.md', '---\nbranch: main\nstatus: closed\n---\n')
  write('2026-02-01-café.md', '---\nbranch: feat/cafe\n---\n')
  write('2026-03-01-twice-a.md', '---\nbranch: feat/twice\n---\n')
  write('2026-03-02-twice-b.md', '---\nbranch: feat/twice\n---\n')
  fs.mkdirSync(path.join(site, 'planning/sessions/folder.md'))
  git('add', '.')
  git('commit', '-q', '-m', 'logs')
  for (const b of ['feat/x', 'feat/cafe', 'feat/twice', 'feat/remote-only'])
    git('branch', b)
  execFileSync('git', ['init', '-q', '--bare', remote], { stdio: 'ignore' })
  git('remote', 'add', 'origin', remote)
  git('push', '-q', 'origin', 'refs/heads/*:refs/heads/*')
  git('fetch', '-q', 'origin')
  git('branch', '-D', 'feat/remote-only')

  const run = (argv, cwd = site) => runSession(argv, { cwd })

  it('finds the current branch’s log, from where you stand', () => {
    git('checkout', '-q', 'feat/x')
    expect(run([])).toEqual({
      out: 'planning/sessions/2026-01-01-x.md',
      err: '',
      code: 0,
    })
    // From anywhere but the site's folder there is no planning/sessions:
    // said, not left as an empty answer a skill would read as "no log".
    const elsewhere = run([], path.join(site, 'planning'))
    expect(elsewhere.out).toBe('')
    expect(elsewhere.err).toContain('this is not the site')
    git('checkout', '-q', 'main')
  })

  it('reads a key from the frontmatter of the branch’s log', () => {
    expect(run(['feat/x', '--get', 'base']).out).toBe('main')
    expect(run(['feat/x', '--get', 'worktree']).out).toBe('/tmp/wt')
    expect(run(['feat/x', '--get', 'nothing'])).toEqual({
      out: '',
      err: '',
      code: 0,
    })
  })

  it('reads a branch’s own commits, by full ref, not a tag of its name', () => {
    expect(run(['feat/x', '--from-branch']).out).toBe(
      'refs/heads/feat/x:site/planning/sessions/2026-01-01-x.md',
    )
  })

  it('reads origin’s copy when there is no local branch', () => {
    expect(run(['feat/remote-only', '--from-branch']).out).toBe('')
    expect(run(['feat/remote-only', '--from-branch']).code).toBe(0)
    expect(run(['main', '--from-branch', '--get', 'status']).out).toBe('closed')
  })

  it('finds a log whose name has an accent, from either source', () => {
    expect(run(['feat/cafe']).out).toBe('planning/sessions/2026-02-01-café.md')
    expect(run(['feat/cafe', '--from-branch']).out).toBe(
      'refs/heads/feat/cafe:site/planning/sessions/2026-02-01-café.md',
    )
  })

  it('reads subfolders, and skips a folder named like a log', () => {
    expect(run(['main']).out).toBe(
      'planning/sessions/archive/2025-06-01-old.md',
    )
  })

  it('prints both when a name was used twice, and --get refuses', () => {
    expect(run(['feat/twice']).out.split('\n')).toHaveLength(2)
    const get = run(['feat/twice', '--get', 'base'])
    expect(get.code).toBe(1)
    expect(get.err).toContain(
      'more than one session log names branch feat/twice',
    )
  })

  it('lists every log, newest first', () => {
    const lines = run(['--list']).out.split('\n')
    expect(lines[0]).toBe('path\tbranch\tstatus\tconsolidated')
    expect(lines.slice(1).map((l) => l.split('\t')[0])).toEqual([
      'planning/sessions/2026-03-02-twice-b.md',
      'planning/sessions/2026-03-01-twice-a.md',
      'planning/sessions/2026-02-01-café.md',
      'planning/sessions/2026-01-01-x.md',
      'planning/sessions/archive/2025-06-01-old.md',
    ])
  })

  it('says why, in one line, when it cannot answer', () => {
    expect(run(['nowhere', '--from-branch'])).toEqual({
      out: '',
      err: 'kiss-ssg session: there is no branch nowhere here or on origin',
      code: 1,
    })
    expect(run(['nowhere', '--get', 'base']).err).toBe(
      'kiss-ssg session: no session log names branch nowhere',
    )
    git('checkout', '-q', '--detach', 'main')
    expect(run([]).err).toContain('not on a branch (a detached HEAD)')
    git('checkout', '-q', 'main')
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-no-git-'))
    const refused = run([], outside)
    fs.rmSync(outside, { recursive: true, force: true })
    expect(refused.code).toBe(1)
    expect(refused.err).toMatch(/^kiss-ssg session: git could not answer: /)
  })

  it('refuses a mistyped option rather than guessing', () => {
    expect(run(['--form-branch']).err).toBe(
      'kiss-ssg session: unknown option: --form-branch',
    )
  })
})
