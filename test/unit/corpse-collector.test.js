import { describe, it, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  aikbStaleness,
  formerSkillNames,
  isConsumerSitePath,
  isTemplateConfigRead,
  isUrlProse,
} from '../../.claude/skills/corpse-collector/scripts/scan.mjs'

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

// ── Check 1 and Check 3 exclusions ───────────────────────────────────────────
// Two false-positive families recurred on every run: paths inside a CONSUMING
// site's folders (its `AIKB/`, its `src/`) cited by the published surfaces, and
// URL paths (`/about`, `/courses/`) read as slash commands. Each is now a
// decision the scanner makes, and each decision is pinned here.

describe('isConsumerSitePath', () => {
  it('treats the recorded knowledge-base files as the consuming site’s, wherever cited', () => {
    for (const p of [
      'AIKB/site.md',
      'AIKB/README.md',
      'AIKB/last-build.json',
      'AIKB/dependency-graph.json',
      'AIKB/notes/controllers/stockist.md',
    ]) {
      expect(isConsumerSitePath(p, 'README.md'), p).toBe(true)
      expect(isConsumerSitePath(p, 'AIKB/build-report.md'), p).toBe(true)
      expect(isConsumerSitePath(p, 'CLAUDE.md'), p).toBe(true)
    }
  })

  it('keeps checking this repo’s own module docs', () => {
    expect(isConsumerSitePath('AIKB/kiss.md', 'README.md')).toBe(false)
    expect(isConsumerSitePath('AIKB/no-such-module.md', 'CLAUDE.md')).toBe(
      false,
    )
  })

  it('reads src/ as the consuming site’s in the published surfaces only', () => {
    const p = 'src/assets/css/site.css'
    expect(isConsumerSitePath(p, 'llms.txt')).toBe(true)
    expect(isConsumerSitePath(p, 'README.md')).toBe(true)
    expect(isConsumerSitePath(p, 'AIKB/assets.md')).toBe(true)
    // CLAUDE.md and the repo's own skills talk about THIS repo's src/.
    expect(isConsumerSitePath(p, 'CLAUDE.md')).toBe(false)
    expect(isConsumerSitePath(p, '.claude/skills/docs-sweep/SKILL.md')).toBe(
      false,
    )
  })

  it('never excuses a path under any other root', () => {
    expect(isConsumerSitePath('examples/1-scan/router.js', 'README.md')).toBe(
      false,
    )
    expect(isConsumerSitePath('lib/kiss.js', 'llms.txt')).toBe(false)
  })
})

describe('isUrlProse', () => {
  it('recognises the shapes the host-policy and redirect prose take', () => {
    for (const line of [
      '`canonical: true` makes a bare `{{link}}` emit `/about` rather than `/about.html`',
      '| **Netlify** | **200**; bare `/courses` 301s here | **200**; `/about/` 301s here |',
      'a page advertised at `/courses` but linked as `/courses/` ships a redirect hop',
      '`about.html` and `about/index.html` are both served at `/about`',
      'An alias is a fact about your site — "this page used to answer `/old`" — every alias is a permanent redirect',
      'the same string that page’s `{{canonical}}` renders and its `<loc>` carries — `/`, `/courses/`, `/about`',
      'so the same `href="/about"` matches whether the page built to `about.html`',
      'whether a directory index keeps its slash (`/courses/`, the default) or loses it (`/courses`)',
    ]) {
      expect(isUrlProse(line), line).toBe(true)
    }
  })

  it('does not mistake a sentence about a command for one about a URL', () => {
    for (const line of [
      '- **`/branch-open`** (Frame) — run on the base branch.',
      '`/branch-close` also bumps the version in `package.json` and adds a `CHANGELOG.md` entry',
      '**Never run `/branch-close` or create a PR unless explicitly asked.**',
      'Supporting skills, all invocable on their own: `/docs-sweep` (holistic doc staleness)',
      'Run `/retrospective` before pushing.',
    ]) {
      expect(isUrlProse(line), line).toBe(false)
    }
  })
})

describe('formerSkillNames', () => {
  it('lists every skill folder git has seen renamed or deleted, and none that is current', () => {
    const repo = makeRepo()
    const git = (...args) =>
      execFileSync('git', args, { cwd: repo.root, stdio: 'ignore' })
    mkdirSync(join(repo.root, '.claude/skills/retrospective'), {
      recursive: true,
    })
    repo.write(
      '.claude/skills/retrospective/SKILL.md',
      '---\nname: retrospective\n---\n',
    )
    mkdirSync(join(repo.root, '.claude/skills/gone'), { recursive: true })
    repo.write('.claude/skills/gone/SKILL.md', '---\nname: gone\n---\n')
    mkdirSync(join(repo.root, 'plugins/p/skills/kiss-check'), {
      recursive: true,
    })
    repo.write(
      'plugins/p/skills/kiss-check/SKILL.md',
      '---\nname: kiss-check\n---\n',
    )
    mkdirSync(join(repo.root, '.claude/skills/kept'), { recursive: true })
    repo.write('.claude/skills/kept/SKILL.md', '---\nname: kept\n---\n')
    repo.commit('skills')

    git('mv', '.claude/skills/retrospective', '.claude/skills/session-reflect')
    git(
      'mv',
      'plugins/p/skills/kiss-check',
      'plugins/p/skills/kiss-build-check',
    )
    rmSync(join(repo.root, '.claude/skills/gone'), { recursive: true })
    repo.commit('rename two, delete one')

    const former = formerSkillNames(repo.root)
    expect([...former].sort()).toEqual(['gone', 'kiss-check', 'retrospective'])
    expect(former.has('session-reflect')).toBe(false)
    expect(former.has('kept')).toBe(false)
  })

  it('is empty outside a repository rather than throwing', () => {
    const root = mkdtempSync(join(tmpdir(), 'kiss-corpse-'))
    repos.push(root)
    expect(formerSkillNames(root)).toEqual(new Set())
  })
})

describe('isTemplateConfigRead', () => {
  it('sees an arbitrary key read inside a mustache as the convention, not a promise', () => {
    expect(
      isTemplateConfigRead('<h1>The {{config.season}} menu</h1>', 'season'),
    ).toBe(true)
    expect(isTemplateConfigRead('{{#each config.nav}}', 'nav')).toBe(true)
    expect(
      isTemplateConfigRead(
        '`{{config.business.telephone}}` in a template',
        'business',
      ),
    ).toBe(true)
  })

  it('still reports a key the prose says kiss reads', () => {
    expect(
      isTemplateConfigRead('set `config.season` to pick the menu', 'season'),
    ).toBe(false)
    expect(
      isTemplateConfigRead('{{title}} and then config.season', 'season'),
    ).toBe(false)
  })
})
