import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  REQUIRED_PACKED,
  FORBIDDEN_PACKED,
  changedFiles,
  forbiddenPackedFiles,
  formatGate,
  missingPackedFiles,
  parsePackedFiles,
  spawnResult,
} from '../../scripts/gates.mjs'

describe('parsePackedFiles', () => {
  it('flattens the file paths out of npm pack --json', () => {
    const stdout = JSON.stringify([
      { files: [{ path: 'lib/kiss.js' }, { path: 'llms.txt' }] },
    ])
    expect(parsePackedFiles(stdout)).toEqual(['lib/kiss.js', 'llms.txt'])
  })

  it('accepts a bare object as well as an array', () => {
    expect(
      parsePackedFiles(JSON.stringify({ files: [{ path: 'llms.txt' }] })),
    ).toEqual(['llms.txt'])
  })

  it('tolerates an entry with no files array', () => {
    expect(parsePackedFiles(JSON.stringify([{ name: 'kiss-ssg' }]))).toEqual([])
  })

  it('finds the JSON behind npm lifecycle-script banners', () => {
    const stdout = [
      '> kiss-ssg@2.0.0-alpha.0 prepare',
      '> git config core.hooksPath .githooks || exit 0',
      '',
      JSON.stringify([{ files: [{ path: 'llms.txt' }] }]),
    ].join('\n')
    expect(parsePackedFiles(stdout)).toEqual(['llms.txt'])
  })

  it('returns null when there is no JSON at all, so the gate can fail loudly', () => {
    expect(parsePackedFiles('npm error code ENOENT\n')).toBeNull()
  })
})

// The whitelist overrides .gitignore, so a gitignored build folder inside a
// whitelisted one ships anyway. `examples/*/public/` did exactly that — 75
// files of generated output in a tarball CLAUDE.md says never ships — and the
// gate could not see it, because it only ever asked what was MISSING.
describe('forbiddenPackedFiles', () => {
  it('names example build output that slipped into the tarball', () => {
    expect(
      forbiddenPackedFiles([
        'lib/kiss.js',
        'examples/1-scan/router.js',
        'examples/1-scan/public/index.html',
        'examples/11-blog/public/css/site.css',
      ]),
    ).toEqual([
      'examples/1-scan/public/index.html',
      'examples/11-blog/public/css/site.css',
    ])
  })

  it('names a scratch conversion folder too', () => {
    // The same shape as `public/`, found when example 12 added a second
    // gitignored folder inside a whitelisted one. It does not ship today, and
    // "does not ship today" is what was true of `public/` for 75 files.
    expect(
      forbiddenPackedFiles([
        'examples/12-from-a-single-file/router.js',
        'examples/12-from-a-single-file/source/original.html',
        'examples/12-from-a-single-file/.converted/src/layouts/layout.hbs',
      ]),
    ).toEqual([
      'examples/12-from-a-single-file/.converted/src/layouts/layout.hbs',
    ])
  })

  it("leaves an example's own source alone", () => {
    expect(
      forbiddenPackedFiles([
        'examples/1-scan/router.js',
        'examples/1-scan/src/pages/index.hbs',
        'examples/README.md',
      ]),
    ).toEqual([])
  })

  it('accepts a windows-style path the way missingPackedFiles does', () => {
    expect(
      forbiddenPackedFiles(['examples\\1-scan\\public\\index.html']),
    ).toEqual(['examples/1-scan/public/index.html'])
  })

  it('is declared, so the gate has something to check against', () => {
    expect(FORBIDDEN_PACKED.length).toBeGreaterThan(0)
  })
})

describe('missingPackedFiles', () => {
  // Each case drops one path from the full list rather than spelling the list
  // out, so adding a required path is one line in scripts/gates.mjs and not an
  // edit to every case here.
  const allBut = (path) => REQUIRED_PACKED.filter((f) => f !== path)

  it('reports nothing when every required path ships', () => {
    expect(missingPackedFiles([...REQUIRED_PACKED, 'README.md'])).toEqual([])
  })

  it('names the paths dropped from the tarball', () => {
    expect(missingPackedFiles(['lib/kiss.js'])).toEqual(allBut('lib/kiss.js'))
  })

  // The declarations are only useful to a consumer if they are in the tarball:
  // `types`/`exports` point at a path npm would otherwise not ship.
  it('requires the generated declarations entry', () => {
    expect(REQUIRED_PACKED).toContain('types/kiss.d.ts')
    expect(missingPackedFiles(allBut('types/kiss.d.ts'))).toEqual([
      'types/kiss.d.ts',
    ])
  })

  // `npx kiss-ssg check` is only reachable if the bin ships: package.json's
  // `bin` entry points at a path `files` could drop silently.
  it('requires the check bin', () => {
    expect(REQUIRED_PACKED).toContain('bin/kiss-ssg.js')
    expect(missingPackedFiles(allBut('bin/kiss-ssg.js'))).toEqual([
      'bin/kiss-ssg.js',
    ])
  })

  // Proves the examples actually ship: `files` in package.json could drop
  // `examples` silently otherwise, and the tarball is the only place that
  // would show up.
  it('requires the examples README', () => {
    expect(REQUIRED_PACKED).toContain('examples/README.md')
    expect(missingPackedFiles(allBut('examples/README.md'))).toEqual([
      'examples/README.md',
    ])
  })

  // `npx kiss-ssg init` copies starter/ and the README links GUIDE.md: both are
  // top-level entries in `files`, and `gitignore` is the file npm would drop
  // if it were spelled with its dot.
  it.each(['starter/router.js', 'starter/gitignore', 'GUIDE.md'])(
    'requires %s',
    (path) => {
      expect(REQUIRED_PACKED).toContain(path)
      expect(missingPackedFiles(allBut(path))).toEqual([path])
    },
  )

  it('normalises Windows separators before comparing', () => {
    expect(missingPackedFiles(['lib\\kiss.js'], ['lib/kiss.js'])).toEqual([])
  })
})

describe('spawnResult', () => {
  it('merges stdout and stderr for a run that completed', () => {
    expect(
      spawnResult({ status: 0, stdout: 'checked 3 files\n', stderr: 'warn\n' }),
    ).toEqual({
      ok: true,
      stdout: 'checked 3 files',
      output: 'checked 3 files\nwarn',
    })
  })

  it('surfaces a spawn-level error so a missing binary is diagnosable', () => {
    const result = spawnResult({
      status: null,
      error: new Error('spawnSync npx ENOENT'),
      stdout: '',
      stderr: '',
    })
    expect(result.ok).toBe(false)
    expect(result.output).toContain('ENOENT')
  })
})

// Prettier reads the working tree, so the gate lists what the branch changed
// as the working tree has it. Listed from the commits alone, a file renamed or
// deleted and not yet committed failed the gate with "No files matching the
// pattern", and a renamed file's new name was never checked (twice on
// 2026-10-31).
describe('changedFiles', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-gates-'))
  const emptyConfig = path.join(root, 'empty.gitconfig')
  fs.writeFileSync(emptyConfig, '')
  const env = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    ),
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: '1',
  }
  const repo = path.join(root, 'repo')
  fs.mkdirSync(repo)
  const git = (...args) =>
    execFileSync('git', args, { cwd: repo, env, stdio: 'ignore' })
  const commit = (message) =>
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@example.com',
      'commit',
      '-q',
      '-m',
      message,
    )
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  it('lists the working tree: a staged rename by its new name, a deletion not at all', () => {
    git('init', '-q', '-b', 'main')
    fs.writeFileSync(path.join(repo, 'base.js'), 'x\n')
    git('add', '.')
    commit('base')
    git('checkout', '-q', '-b', 'feat')
    fs.writeFileSync(path.join(repo, 'old.js'), 'x\n')
    fs.writeFileSync(path.join(repo, 'gone.js'), 'x\n')
    git('add', '.')
    commit('work')
    git('mv', 'old.js', 'new.js')
    git('rm', '-q', 'gone.js')
    // A file made on the branch and not yet added is about to be committed
    // too (round 6); an ignored one is not, and stays out.
    fs.writeFileSync(path.join(repo, '.gitignore'), 'scratch/\n')
    fs.mkdirSync(path.join(repo, 'scratch'))
    fs.writeFileSync(path.join(repo, 'scratch/tmp.js'), 'x\n')
    fs.writeFileSync(path.join(repo, 'brand-new.js'), 'x\n')
    expect(changedFiles('main', repo, env)).toEqual({
      files: ['.gitignore', 'brand-new.js', 'new.js'],
    })
  })

  // On the base branch itself the branch has no changes of its own, and the
  // gate checks the whole repository: a dirty tree or a stray untracked file
  // there must not shrink that to the stray file (round 7, a regression of
  // round 5's working-tree list).
  it('lists nothing on the base branch, dirty or not, so the gate checks everything', () => {
    git('checkout', '-q', '-f', 'main')
    fs.writeFileSync(path.join(repo, 'stray.js'), 'x\n')
    fs.writeFileSync(path.join(repo, 'base.js'), 'edited\n')
    expect(changedFiles('main', repo, env)).toEqual({ files: [] })
  })

  it('reports git refusing the base as an error, not as no changes', () => {
    expect(changedFiles('no-such-base', repo, env).error).toBeTruthy()
  })
})

describe('formatGate', () => {
  const spy = () => {
    const calls = []
    return {
      calls,
      run: (cmd, args) => {
        calls.push({ cmd, args })
        return { ok: true, stdout: '', output: '' }
      },
    }
  }

  it('checks only the changed files when the diff is non-empty', () => {
    const { calls, run } = spy()
    const result = formatGate(
      'origin/v2',
      { files: ['lib/kiss.js', 'README.md'] },
      run,
    )
    expect(calls).toEqual([
      {
        cmd: 'npx',
        args: [
          'prettier',
          '--check',
          '--ignore-unknown',
          'lib/kiss.js',
          'README.md',
        ],
      },
    ])
    expect(result.ok).toBe(true)
    expect(result.note).toBe('2 changed files')
  })

  it('checks the whole repo when nothing changed against the base', () => {
    const { calls, run } = spy()
    const result = formatGate('origin/v2', { files: [] }, run)
    expect(calls).toEqual([
      { cmd: 'npx', args: ['prettier', '--check', '--ignore-unknown', '.'] },
    ])
    expect(result.ok).toBe(true)
    expect(result.note).toBe('whole repo (no diff against origin/v2)')
  })

  // Windows' cmd.exe answers a command line over 8191 characters with "The
  // syntax of the command is incorrect", and this branch's own diff — 202
  // files, 8117 characters of paths — is what found that: `windows-latest`
  // failed the format gate while `ubuntu-latest` passed it. The whole-tree
  // fallback is the answer the empty-diff case already gives, and it asks a
  // superset of the question. The budget is one number on every platform, so
  // the two CI legs never check different things.
  it('checks the whole repo when the changed files would overflow a command line', () => {
    const { calls, run } = spy()
    const files = Array.from(
      { length: 200 },
      (_, i) => `lib/a-module-with-a-fairly-long-name-${i}.js`,
    )
    const result = formatGate('origin/v2', { files }, run)
    expect(calls).toEqual([
      { cmd: 'npx', args: ['prettier', '--check', '--ignore-unknown', '.'] },
    ])
    expect(result.ok).toBe(true)
    expect(result.note).toBe(
      'whole repo (200 changed files overflow one command line)',
    )
  })

  it('fails with the git error when the diff could not be taken', () => {
    const { calls, run } = spy()
    const result = formatGate(
      'origin/v2',
      { error: "fatal: bad revision 'origin/v2...HEAD'" },
      run,
    )
    expect(result.ok).toBe(false)
    expect(result.output).toContain('fatal: bad revision')
    expect(calls).toEqual([])
  })
})
