// The kiss-memory plugin cannot call scripts/session-file.mjs: a plugin's
// install path differs between Claude Code and Codex, so each of its three
// branch skills carries the lookup inline, as shell. Three copies drift, as
// six did before the script (2026-10-31), so this runs each copy exactly as
// its SKILL.md ships it, on the same session files, and fails when one finds
// a different file from the script or the three `awk` programs stop being
// one text. A fix to one copy that misses the others turns this red.
//
// The copies are POSIX shell, run on the Linux leg of CI; on Windows, `bash`
// on the PATH may be WSL's rather than Git's, so this leg skips.
import { describe, it, expect, afterAll } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const skills = path.join(here, '../../plugins/kiss-memory/skills')
const script = path.join(here, '../../scripts/session-file.mjs')

// The one fenced bash block in a skill that reads session files.
function lookupBlock(skill) {
  const text = fs
    .readFileSync(path.join(skills, skill, 'SKILL.md'), 'utf8')
    .replace(/\r\n/g, '\n')
  const blocks = [...text.matchAll(/^```bash\n([\s\S]*?)^```$/gm)]
    .map((m) => m[1])
    .filter((block) => block.includes('/^branch:/'))
  expect(blocks, `${skill}: one lookup block`).toHaveLength(1)
  return blocks[0]
}

// The awk that reads a file's frontmatter (a block may hold other awks).
const awkProgram = (block) =>
  [...block.matchAll(/awk '([^']*)'/g)]
    .map((m) => m[1])
    .find((program) => program.includes('/^branch:/'))

const LOCAL = ['kiss-branch-close', 'kiss-branch-pulse']
const MERGED = 'kiss-branch-merged'

describe('the plugin skills read session files with one rule', () => {
  it('ships the same awk program in all three skills', () => {
    const programs = [...LOCAL, MERGED].map((s) => awkProgram(lookupBlock(s)))
    expect(new Set(programs).size).toBe(1)
  })
})

describe.skipIf(process.platform === 'win32')(
  'the plugin lookups, run as shipped, agree with session-file.mjs',
  () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-lookups-'))
    const emptyConfig = path.join(root, 'empty.gitconfig')
    fs.writeFileSync(emptyConfig, '')
    const env = {
      ...Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
      ),
      GIT_CONFIG_GLOBAL: emptyConfig,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    }
    const repo = path.join(root, 'repo')
    const remote = path.join(root, 'remote.git')
    const git = (...args) =>
      execFileSync('git', args, { cwd: repo, env, stdio: 'ignore' })

    // Every shape a session file's frontmatter has been seen to take, or
    // that an editor writes, and the near-misses that must not match.
    const sessions = {
      'crlf.md': '---\r\nbranch: feat/x\r\nworktree: /tmp/wt\r\n---\r\n',
      'bom.md': '\uFEFF---\nbranch: feat/bom\n---\n',
      'spaces.md': '---  \nbranch:   feat/sp  \n---\t\n',
      'double.md': '---\nbranch: "feat/q"\n---\n',
      'single.md': "---\nbranch: 'feat/q1'\n---\n",
      'comment.md': '---\nbranch: feat/c # the IA work\n---\n',
      'hash.md': '---\nbranch: feat/h#2\n---\n',
      'dot.md': '---\nbranch: fix/v2.8\n---\n',
      'not-dot.md': '---\nbranch: fix/v2x8\n---\n',
      'body-only.md': '---\ntitle: none\n---\nbranch: feat/x\n',
      // Never closed: no frontmatter at all, so the body's line is no branch.
      'unclosed.md': '---\nstatus: open\nbody\nbranch: feat/x\n',
      // No `branch:` line: on a detached HEAD the branch is empty, and an
      // empty value must not count as a match (round 9).
      'no-branch.md': '---\ntitle: none\n---\n',
      'no-frontmatter.md': 'branch: feat/x\n',
      'archive/old.md': '---\nbranch: main\n---\n',
    }
    const branches = [
      'feat/x',
      'feat/bom',
      'feat/sp',
      'feat/q',
      'feat/q1',
      'feat/c',
      'feat/h#2',
      'fix/v2.8',
      'main',
    ]

    fs.mkdirSync(repo)
    git('init', '-q', '-b', 'main')
    git('commit', '-q', '--allow-empty', '-m', 'root')
    // A tag that shares a branch's name, on a commit with no session files:
    // a lookup that reads the tag finds nothing.
    git('tag', 'feat/c')
    for (const [file, text] of Object.entries(sessions)) {
      const full = path.join(repo, 'planning/sessions', file)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, text)
    }
    git('add', '.')
    git('commit', '-q', '-m', 'sessions')
    for (const b of branches.filter((b) => b !== 'main')) git('branch', b)
    execFileSync('git', ['init', '-q', '--bare', remote], {
      env,
      stdio: 'ignore',
    })
    git('remote', 'add', 'origin', remote)
    git('push', '-q', 'origin', '--all')
    git('fetch', '-q', 'origin')
    // A branch opened on another machine: only origin has it.
    git('branch', '-D', 'feat/q')

    afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

    const bash = (block) =>
      spawnSync('bash', ['-c', block], { cwd: repo, env, encoding: 'utf8' })
    const expected = (...args) =>
      spawnSync('node', [script, ...args], { cwd: repo, env, encoding: 'utf8' })
        .stdout

    it.each(LOCAL)(
      '%s finds the current branch’s file, for every shape',
      (skill) => {
        const block = lookupBlock(skill)
        for (const b of branches.filter((b) => b !== 'feat/q')) {
          git('checkout', '-q', b)
          const found = bash(block)
            .stdout.split('\n')
            .filter((line) => line.startsWith('planning/'))
            .join('\n')
          expect(found, `${skill} on ${b}`).toBe(expected().trim())
          expect(found, `${skill} on ${b} finds one file`).toMatch(/^\S+$/)
        }
        git('checkout', '-q', 'main')
      },
    )

    it.each(LOCAL)(
      '%s finds nothing on a detached HEAD, and says so',
      (skill) => {
        git('checkout', '-q', '--detach', 'main')
        const out = bash(lookupBlock(skill)).stdout
        git('checkout', '-q', 'main')
        expect(
          out.split('\n').filter((l) => l.startsWith('planning/')),
        ).toEqual([])
        expect(out).toContain('not on a branch (a detached HEAD)')
      },
    )

    it(`${MERGED} finds a named branch’s file from its commits, here or on origin`, () => {
      const block = lookupBlock(MERGED)
      expect(block).toContain('B=<branch>\n')
      for (const b of branches) {
        const named = block.replace('B=<branch>\n', `B='${b}'\n`)
        const found = bash(named)
          .stdout.split('\n')
          .filter((line) => line.includes(':planning/'))
          .join('\n')
        expect(found, `${MERGED} for ${b}`).toBe(
          expected(b, '--from-branch').trim(),
        )
        expect(found, `${MERGED} for ${b} finds one file`).toMatch(/^\S+$/)
      }
    })

    it(`${MERGED} says when the branch is nowhere`, () => {
      const block = lookupBlock(MERGED).replace('B=<branch>\n', "B='nowhere'\n")
      expect(bash(block).stdout).toContain(
        'there is no branch nowhere here or on origin',
      )
    })
  },
)
