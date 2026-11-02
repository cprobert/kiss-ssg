import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ArmsUsageError, parseArmsArgs } from '../../scripts/arms/args.mjs'
import {
  ALLOWED_TOOLS,
  BYPASS_FLAGS,
  DENIED_TOOLS,
  assertNoBypass,
  buildClaudeArgv,
  formatCommand,
  shellQuote,
} from '../../scripts/arms/claude-argv.mjs'
import { cmdQuote, realRunner, spawnShape } from '../../scripts/arms/runner.mjs'
import {
  ArmsSetupError,
  isInside,
  setupArm,
} from '../../scripts/arms/setup.mjs'
import {
  buildEvidenceIndex,
  evidenceLines,
  parseTranscript,
  skillOfPath,
  summariseTranscript,
} from '../../scripts/arms/transcript.mjs'
import {
  formatSummary,
  readAnswerKey,
  runArm,
  summariseArm,
} from '../../scripts/arms.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const TRANSCRIPT = path.join(root, 'test/fixtures/arms/transcript.jsonl')
const ANSWER_KEY = path.join(root, 'test/fixtures/legal-answer-key.json')
const WEAK_SITE = path.join(root, 'test/fixtures/legal-weak-site')
const PLUGIN_DIR = path.resolve('/arms/with/plugin-tree/plugins/kiss-ssg')

let tmp
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-arms-'))
})
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('parseArmsArgs', () => {
  const setup = [
    'setup',
    '--site',
    'C:/Code/kiss/a1k9training',
    '--commit',
    '385434a',
    '--arm',
    'with',
    '--plugin-ref',
    'HEAD',
    '--out',
    'C:/scratch/arms',
  ]

  it('parses setup, defaulting the plugin path', () => {
    const { command, options } = parseArmsArgs(setup)
    expect(command).toBe('setup')
    expect(options).toMatchObject({
      site: 'C:/Code/kiss/a1k9training',
      commit: '385434a',
      arm: 'with',
      'plugin-ref': 'HEAD',
      'plugin-path': 'plugins/kiss-ssg',
    })
  })

  it('refuses --plugin <dir>: the plugin comes from a recorded sha', () => {
    expect(() =>
      parseArmsArgs([...setup, '--plugin', 'plugins/kiss-ssg']),
    ).toThrow(/--plugin-ref/)
  })

  it('names every missing required option', () => {
    expect(() => parseArmsArgs(['setup', '--arm', 'x'])).toThrow(
      /--site, --commit, --plugin-ref, --out/,
    )
  })

  it('refuses an arm name that is not a plain folder name', () => {
    const bad = [...setup]
    bad[bad.indexOf('with')] = '../escape'
    expect(() => parseArmsArgs(bad)).toThrow(ArmsUsageError)
  })

  it('refuses an unknown command and an unknown option', () => {
    expect(() => parseArmsArgs(['launch'])).toThrow(/unknown command "launch"/)
    expect(() => parseArmsArgs([])).toThrow(/no command/)
    expect(() =>
      parseArmsArgs([
        'run',
        '--arm-dir',
        'a',
        '--brief',
        'b',
        '--dangerously-skip-permissions',
      ]),
    ).toThrow(ArmsUsageError)
  })

  it('parses run, with the budget as a number', () => {
    const { options } = parseArmsArgs([
      'run',
      '--arm-dir',
      'a',
      '--brief',
      'b',
      '--budget',
      '2.5',
    ])
    expect(options.budget).toBe(2.5)
    expect(options['print-only']).toBe(false)
    expect(
      parseArmsArgs(['run', '--arm-dir', 'a', '--brief', 'b']).options.budget,
    ).toBe(6)
  })

  it('refuses a budget that is not a positive number', () => {
    for (const budget of ['0', '-1', 'lots'])
      expect(() =>
        parseArmsArgs([
          'run',
          '--arm-dir',
          'a',
          '--brief',
          'b',
          '--budget',
          budget,
        ]),
      ).toThrow(/--budget/)
  })

  it('accepts only the two benches for summarise', () => {
    expect(
      parseArmsArgs(['summarise', '--arm-dir', 'a', '--bench', 'fixture'])
        .options.bench,
    ).toBe('fixture')
    expect(() =>
      parseArmsArgs(['summarise', '--arm-dir', 'a', '--bench', 'other']),
    ).toThrow(/--bench/)
  })
})

describe('buildClaudeArgv', () => {
  const argv = buildClaudeArgv({
    pluginDir: PLUGIN_DIR,
    budget: 6,
    model: 'claude-opus-5-5',
  })

  it('carries the isolation, streaming and budget flags', () => {
    const joined = argv.join(' ')
    for (const flag of [
      '-p',
      '--output-format stream-json',
      '--verbose',
      '--setting-sources local',
      '--strict-mcp-config',
      '--no-chrome',
      '--permission-prompts none',
      '--max-budget-usd 6',
      '--model claude-opus-5-5',
    ])
      expect(joined).toContain(flag)
    expect(argv.filter((a) => a === '--plugin-dir')).toHaveLength(1)
    expect(argv[argv.indexOf('--plugin-dir') + 1]).toBe(PLUGIN_DIR)
  })

  it('allows a list of tools and denies commit, push, remote, gh, publish and deploys', () => {
    const allowedAt = argv.indexOf('--allowedTools')
    const deniedAt = argv.indexOf('--disallowedTools')
    expect(argv.slice(allowedAt + 1, deniedAt)).toEqual([...ALLOWED_TOOLS])
    // The variadic options come last, with nothing after them for them to
    // swallow: the brief goes in on stdin.
    expect(argv.slice(deniedAt + 1)).toEqual([...DENIED_TOOLS])
    for (const rule of [
      'Bash(git commit:*)',
      'Bash(git push:*)',
      'Bash(git remote:*)',
      'Bash(gh:*)',
      'Bash(npm publish:*)',
      'Bash(netlify:*)',
      'Bash(firebase:*)',
    ])
      expect(DENIED_TOOLS).toContain(rule)
    // A shell the deny list does not cover is not allowed.
    expect(ALLOWED_TOOLS).not.toContain('PowerShell')
  })

  it('leaves out --model when none is given', () => {
    expect(buildClaudeArgv({ pluginDir: PLUGIN_DIR, budget: 1 })).not.toContain(
      '--model',
    )
  })

  it('can produce no bypass flag, whatever it is given', () => {
    const hostile = [
      ...BYPASS_FLAGS,
      'bypassPermissions',
      '--permission-mode=bypassPermissions',
      '--permission-mode',
      '-x',
      'a b',
      '',
    ]
    const tries = []
    for (const model of [...hostile, null, 'claude-opus-5-5'])
      for (const pluginDir of [...hostile, PLUGIN_DIR])
        for (const budget of [6, 0, -1, Number.NaN, 1e9])
          tries.push({ model, pluginDir, budget })
    let built = 0
    for (const input of tries) {
      let out
      try {
        out = buildClaudeArgv(/** @type {any} */ (input))
      } catch {
        continue
      }
      built++
      for (const arg of out) {
        expect(BYPASS_FLAGS).not.toContain(arg.split('=')[0])
        expect(arg).not.toMatch(/bypassPermissions|dangerously/)
      }
      expect(out[out.indexOf('--permission-mode') + 1]).toBe('acceptEdits')
    }
    expect(built).toBeGreaterThan(0)
  })

  it('assertNoBypass refuses every bypass spelling', () => {
    for (const bad of [
      ['--dangerously-skip-permissions'],
      ['--allow-dangerously-skip-permissions'],
      ['--permission-mode', 'bypassPermissions'],
      ['--permission-mode=bypassPermissions'],
      ['--permission-mode', 'auto'],
      ['--permission-mode'],
    ])
      expect(() => assertNoBypass(bad)).toThrow(/refusing/)
    expect(() =>
      assertNoBypass(['--permission-mode', 'acceptEdits']),
    ).not.toThrow()
  })
})

describe('formatCommand', () => {
  it('is one bash line: cd, env, claude, stdin from the brief, stdout to the transcript', () => {
    const line = formatCommand({
      cwd: 'C:\\arms\\with\\site',
      argv: [
        '-p',
        '--plugin-dir',
        'C:\\arms\\with\\plugin tree',
        '--allowedTools',
        'Bash(git commit:*)',
      ],
      stdin: 'C:\\arms\\with\\brief.txt',
      stdout: 'C:\\arms\\with\\transcript.jsonl',
      stderr: 'C:\\arms\\with\\stderr.txt',
      env: { npm_config_cache: 'C:\\arms\\with\\npm-cache' },
    })
    expect(line).toBe(
      "cd C:/arms/with/site && npm_config_cache=C:/arms/with/npm-cache claude -p --plugin-dir 'C:/arms/with/plugin tree' --allowedTools 'Bash(git commit:*)' < C:/arms/with/brief.txt > C:/arms/with/transcript.jsonl 2> C:/arms/with/stderr.txt",
    )
  })

  it('quotes for a POSIX shell', () => {
    expect(shellQuote('plain/path-1.txt')).toBe('plain/path-1.txt')
    expect(shellQuote("it's")).toBe(`'it'\\''s'`)
    expect(shellQuote('')).toBe("''")
    expect(shellQuote('$(rm -rf /)')).toBe("'$(rm -rf /)'")
  })
})

describe('realRunner().stream', () => {
  // Codex review (2026-11-02): a command that cannot be spawned emits
  // `error` and then `close`; both closed the descriptors, and the second
  // closeSync threw EBADF instead of reporting the launch failure.
  it('reports a command that cannot start, once, without throwing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arms-runner-'))
    try {
      const stdinFile = path.join(dir, 'in.txt')
      fs.writeFileSync(stdinFile, '')
      const uncaught = []
      const onUncaught = (e) => uncaught.push(e)
      process.on('uncaughtException', onUncaught)
      const result = await realRunner().stream(
        'kiss-arms-no-such-command-zz',
        [],
        {
          cwd: dir,
          stdinFile,
          stdoutFile: path.join(dir, 'out.txt'),
          stderrFile: path.join(dir, 'err.txt'),
        },
      )
      await new Promise((r) => setTimeout(r, 200))
      process.off('uncaughtException', onUncaught)
      expect(uncaught).toEqual([])
      expect(result.status).not.toBe(0)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('spawnShape', () => {
  it('runs npm through a shell on Windows, with its arguments quoted for cmd.exe', () => {
    expect(spawnShape('npm', ['install', 'C:\\a b\\x.tgz'], 'win32')).toEqual({
      cmd: 'npm',
      args: ['install', '"C:\\a b\\x.tgz"'],
      shell: true,
    })
    expect(spawnShape('npm', ['ci'], 'linux')).toEqual({
      cmd: 'npm',
      args: ['ci'],
      shell: false,
    })
  })

  it('never puts claude, git or tar behind a shell', () => {
    for (const cmd of ['claude', 'git', 'tar'])
      expect(spawnShape(cmd, ['a b'], 'win32')).toEqual({
        cmd,
        args: ['a b'],
        shell: false,
      })
  })

  it('cmdQuote doubles an embedded quote and leaves a plain word bare', () => {
    expect(cmdQuote('plain')).toBe('plain')
    expect(cmdQuote('say "hi"')).toBe('"say ""hi"""')
    expect(cmdQuote('a&b')).toBe('"a&b"')
  })
})

describe('the transcript', () => {
  const t = parseTranscript(fs.readFileSync(TRANSCRIPT, 'utf8'))
  const s = summariseTranscript(t)

  it('reads cost, duration, model and version from the transcript itself', () => {
    expect(s).toMatchObject({
      model: 'claude-opus-5-5',
      claudeCodeVersion: '2.1.316',
      permissionMode: 'acceptEdits',
      costUsd: 1.2345,
      durationMs: 125000,
      numTurns: 7,
      isError: false,
      complete: true,
      plugins: ['kiss-ssg@2.10.0'],
      mcpServers: [],
    })
  })

  it('names each Skill call and each SKILL.md read, by skill', () => {
    expect(s.skillCalls).toEqual([
      { line: 2, skill: 'kiss-ssg:kiss-site-review' },
    ])
    expect(s.skillReads.map((r) => r.skill)).toEqual(['kiss-legal-and-privacy'])
    expect(s.skillFileReads).toEqual([
      { line: 4, skill: 'kiss-legal-and-privacy', file: 'references/uk.md' },
    ])
  })

  it('counts tool calls by kind', () => {
    expect(s.toolCounts).toEqual({ Skill: 1, Read: 2, Bash: 2, Edit: 1 })
  })

  it('reports a commit attempt however it is spelled, and the denial', () => {
    expect(s.commitAttempts).toEqual([
      { line: 10, command: 'git -C . commit -am "privacy line"' },
    ])
    expect(s.permissionDenials).toEqual([
      {
        tool: 'Bash',
        input: { command: 'git -C . commit -am "privacy line"' },
      },
    ])
  })

  it('keeps the final message and the lines it could not parse', () => {
    expect(s.finalMessage).toMatch(/^Fixed: the contact form/)
    expect(s.parseErrors).toEqual([8])
  })

  it('reports an interrupted run as incomplete rather than guessing', () => {
    const cut = fs
      .readFileSync(TRANSCRIPT, 'utf8')
      .split('\n')
      .slice(0, 4)
      .join('\n')
    const partial = summariseTranscript(parseTranscript(cut))
    expect(partial.complete).toBe(false)
    expect(partial.costUsd).toBeNull()
  })

  it('skillOfPath tells a SKILL.md from a skill reference, on either slash', () => {
    expect(skillOfPath('C:\\p\\skills\\kiss-seo\\SKILL.md')).toEqual({
      skill: 'kiss-seo',
      file: null,
    })
    expect(skillOfPath('/p/skills/kiss-seo/references/x.md')).toEqual({
      skill: 'kiss-seo',
      file: 'references/x.md',
    })
    expect(skillOfPath('/p/src/pages/SKILL.md')).toBeNull()
  })
})

describe('the evidence index', () => {
  const t = parseTranscript(fs.readFileSync(TRANSCRIPT, 'utf8'))
  const diff = [
    'diff --git a/src/pages/contact.hbs b/src/pages/contact.hbs',
    '--- a/src/pages/contact.hbs',
    '+++ b/src/pages/contact.hbs',
    '@@ -1 +1,2 @@',
    '+<p>See our <a href="/privacy.html">privacy notice</a>.</p>',
    '-<input id="offers" checked>',
  ].join('\n')
  const lines = evidenceLines(t, diff, summariseTranscript(t).finalMessage)
  const key = readAnswerKey(ANSWER_KEY)

  it('collects lines from tool calls, added diff lines and the final message', () => {
    expect(new Set(lines.map((l) => l.source))).toEqual(
      new Set(['tool', 'diff', 'final']),
    )
    expect(lines.find((l) => l.source === 'diff')).toEqual({
      source: 'diff',
      ref: 'src/pages/contact.hbs',
      text: '<p>See our <a href="/privacy.html">privacy notice</a>.</p>',
    })
    // A removed line is not evidence of what the arm wrote.
    expect(
      lines.some((l) => l.text.includes('<input id="offers" checked>')),
    ).toBe(false)
  })

  it('gives each item its candidate lines and leaves the mark to a person', () => {
    const index = buildEvidenceIndex(key, lines, { bench: 'fixture' })
    expect(index.every((i) => i.bench === 'fixture')).toBe(true)
    const privacy = index.find((i) => i.id === 'fixture-01')
    expect(new Set(privacy.candidates.map((c) => c.source))).toEqual(
      new Set(['tool', 'diff', 'final']),
    )
    expect(index.every((i) => i.mark === null)).toBe(true)
  })

  it('marks an a1k9 item not visible at the bench commit as not applicable, with no candidates', () => {
    const index = buildEvidenceIndex(key, lines, { bench: 'a1k9' })
    const notVisible = index.filter((i) => i.notApplicable)
    expect(notVisible.map((i) => i.id)).toEqual(['a1k9-04', 'a1k9-08'])
    expect(notVisible.every((i) => i.candidates.length === 0)).toBe(true)
  })

  it('caps the candidates and says how many more there were', () => {
    const many = Array.from({ length: 30 }, (_, n) => ({
      source: /** @type {const} */ ('tool'),
      ref: `transcript:${n}`,
      text: `privacy ${n}`,
    }))
    const [item] = buildEvidenceIndex(
      [{ id: 'x', bench: 'fixture', cues: ['privacy'] }],
      many,
    )
    expect(item.candidates).toHaveLength(12)
    expect(item.more).toBe(18)
  })
})

describe('the answer key', () => {
  const items = readAnswerKey(ANSWER_KEY)
  const LANES = ['page-wording', 'owner-habit', 'owner-decision', 'adviser']
  const SCORED = [
    'fixed-on-site',
    'listed-as-question',
    'in-handout',
    'accepted-risk',
    'flagged-to-adviser',
  ]

  it('has the 18 a1k9 findings and the fixture gaps, each id once', () => {
    expect(items.filter((i) => i.bench === 'a1k9')).toHaveLength(18)
    expect(
      items.filter((i) => i.bench === 'fixture').length,
    ).toBeGreaterThanOrEqual(7)
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length)
  })

  it('gives every item a lane, a scoring, a visibility and cues that compile', () => {
    for (const item of items) {
      expect(LANES, item.id).toContain(item.lane)
      expect(SCORED, item.id).toContain(item.howScored)
      expect(typeof item.finding, item.id).toBe('string')
      expect(typeof item.evidence, item.id).toBe('string')
      if (item.bench === 'a1k9')
        expect(typeof item.visibleAt385434a, item.id).toBe('boolean')
      else expect(item.visibleAt385434a, item.id).toBeNull()
      expect(item.cues.length, item.id).toBeGreaterThan(0)
      for (const cue of item.cues)
        expect(() => new RegExp(cue, 'i')).not.toThrow()
    }
  })

  it("names fixture evidence that exists in the fixture's sources", () => {
    for (const item of items.filter((i) => i.bench === 'fixture')) {
      const file = /test\/fixtures\/legal-weak-site\/\S+\.hbs/.exec(
        item.evidence,
      )[0]
      expect(fs.existsSync(path.join(root, file)), item.id).toBe(true)
    }
  })
})

describe('the legal-weak-site fixture', () => {
  // The templates' own comments name the gaps; what a page ships is the rest.
  const read = (rel) =>
    fs
      .readFileSync(path.join(WEAK_SITE, 'src', rel), 'utf8')
      .replace(/\{\{!--[\s\S]*?--\}\}/g, '')

  it('carries every planted gap and nothing that would close one', () => {
    const contact = read('pages/contact.hbs')
    const about = read('pages/about.hbs')
    const layout = read('layouts/layout.hbs')
    expect(contact).toMatch(/type="email"/)
    expect(contact).toMatch(/type="tel"/)
    expect(contact).toMatch(/type="checkbox"[^>]*checked/)
    expect(contact).toMatch(/Send me offers and news/)
    expect(contact).toMatch(/name="bot-field"/)
    expect(about).toMatch(/<mark>\[to confirm:/)
    expect(about).toMatch(/youtube-nocookie\.com/)
    expect(layout).toMatch(/fonts\.googleapis\.com/)
    expect(layout).toMatch(
      /rel="preconnect" href="https:\/\/fonts\.gstatic\.com"/,
    )
    expect(layout).toMatch(
      /<script async src="https:\/\/www\.googletagmanager\.com/,
    )
    const all = contact + about + layout + read('pages/index.hbs')
    expect(all).not.toMatch(/privacy/i)
    expect(all).not.toMatch(/mailto:|@[a-z0-9-]+\.[a-z]/i)
  })
})

// A fake runner: records every command in order, and does the little the next
// step needs (files an archive would have extracted, the tarball npm pack
// would have written).
function fakeRunner({ lockfile = true } = {}) {
  const calls = []
  const ok = (stdout = '') => ({ status: 0, stdout, stderr: '' })
  return {
    calls,
    async exec(cmd, args, opts = {}) {
      calls.push({ kind: 'exec', cmd, args, opts })
      if (cmd === 'claude') return ok('2.1.316 (Claude Code)')
      if (cmd === 'git' && args.includes('rev-parse')) return ok('a'.repeat(40))
      if (cmd === 'git' && args.includes('status')) return ok('')
      if (cmd === 'git' && args.includes('init'))
        fs.mkdirSync(path.join(args[1], '.git', 'info'), { recursive: true })
      if (cmd === 'npm' && args[0] === 'pack') {
        const dest = args[args.indexOf('--pack-destination') + 1]
        fs.writeFileSync(path.join(dest, 'kiss-ssg-9.9.9.tgz'), 'tarball')
        return ok(`> lifecycle noise\n[{"filename":"kiss-ssg-9.9.9.tgz"}]`)
      }
      return ok()
    },
    async pipe(from, to) {
      calls.push({
        kind: 'pipe',
        cmd: `${from.cmd} | ${to.cmd}`,
        args: from.args,
        opts: to,
      })
      if (from.args.includes('--') /* the plugin */) {
        const dir = path.join(to.cwd, 'plugins', 'kiss-ssg')
        fs.mkdirSync(dir, { recursive: true })
      } else {
        fs.writeFileSync(path.join(to.cwd, 'package.json'), '{}')
        if (lockfile)
          fs.writeFileSync(path.join(to.cwd, 'package-lock.json'), '{}')
      }
      return { status: 0, stderr: '' }
    },
    async stream(cmd, args, opts) {
      calls.push({ kind: 'stream', cmd, args, opts })
      fs.copyFileSync(TRANSCRIPT, opts.stdoutFile)
      return { status: 0 }
    },
  }
}

const label = (c) =>
  c.kind === 'pipe'
    ? c.args.includes('--')
      ? 'archive plugin'
      : 'archive site'
    : c.cmd === 'git'
      ? `git ${c.args.find((a) => ['rev-parse', 'status', 'init', 'add', 'commit'].includes(a))}`
      : `${c.cmd} ${c.args[0]}`

describe('setupArm', () => {
  const site = path.join(os.tmpdir(), 'kiss-arms-site-repo')

  it('copies from git, makes a baseline, installs the site, then the engine, and records it', async () => {
    const runner = fakeRunner()
    const record = await setupArm({
      site,
      commit: '385434a',
      arm: 'with',
      pluginRef: 'HEAD',
      out: tmp,
      repo: root,
      runner,
      model: 'claude-opus-5-5',
      now: () => new Date('2026-11-02T12:00:00Z'),
    })
    expect(runner.calls.map(label)).toEqual([
      'git rev-parse',
      'git rev-parse',
      'git status',
      'git status',
      'claude --version',
      'archive site',
      'archive plugin',
      'git init',
      'git add',
      'git commit',
      'git rev-parse',
      'npm ci',
      'npm pack',
      'npm install',
    ])
    const armDir = path.join(tmp, 'with')
    const tarball = path.join(armDir, 'kiss-ssg-9.9.9.tgz')
    // The archive is of the resolved sha, and tar extracts in the copy with no
    // path argument of its own.
    const archive = runner.calls.find((c) => c.kind === 'pipe')
    expect(archive.args).toEqual([
      '-C',
      path.resolve(site),
      'archive',
      '--format=tar',
      'a'.repeat(40),
    ])
    expect(archive.opts).toEqual({
      cmd: 'tar',
      args: ['-xf', '-'],
      cwd: path.join(armDir, 'site'),
    })
    const install = runner.calls.at(-1)
    expect(install.args).toEqual(['install', tarball, '--no-save'])
    for (const npm of runner.calls.filter((c) => c.cmd === 'npm'))
      expect(npm.opts.env).toEqual({
        npm_config_cache: path.join(armDir, 'npm-cache'),
      })
    expect(
      fs.readFileSync(
        path.join(armDir, 'site', '.git', 'info', 'exclude'),
        'utf8',
      ),
    ).toMatch(/node_modules\//)
    const onDisk = JSON.parse(
      fs.readFileSync(path.join(armDir, 'arm.json'), 'utf8'),
    )
    expect(onDisk).toEqual(record)
    expect(record).toMatchObject({
      arm: 'with',
      createdAt: '2026-11-02T12:00:00.000Z',
      site: { commitRequested: '385434a', commit: 'a'.repeat(40) },
      baseline: 'a'.repeat(40),
      plugin: {
        ref: 'HEAD',
        sha: 'a'.repeat(40),
        dirty: false,
        dir: path.join(armDir, 'plugin-tree', 'plugins', 'kiss-ssg'),
      },
      engine: { tarball, packedFrom: root, packedTreeDirty: false },
      deps: { lockfile: 'package-lock.json', command: 'npm ci' },
      claudeCodeVersion: '2.1.316 (Claude Code)',
      model: 'claude-opus-5-5',
      browser: { playwright: false },
    })
    expect(record.engine.sha512).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/)
  })

  it('installs from package.json without a lockfile, writing nothing back', async () => {
    const runner = fakeRunner({ lockfile: false })
    await setupArm({
      site,
      commit: 'x',
      arm: 'a',
      pluginRef: 'HEAD',
      out: tmp,
      repo: root,
      runner,
    })
    expect(runner.calls.find((c) => c.cmd === 'npm').args).toEqual([
      'install',
      '--no-save',
      '--no-package-lock',
    ])
  })

  it('uses a given engine tarball and packs nothing', async () => {
    const tgz = path.join(tmp, 'engine.tgz')
    fs.writeFileSync(tgz, 'x')
    const runner = fakeRunner()
    const record = await setupArm({
      site,
      commit: 'x',
      arm: 'a',
      pluginRef: 'HEAD',
      engine: tgz,
      out: path.join(tmp, 'out'),
      repo: root,
      runner,
    })
    expect(
      runner.calls.some((c) => c.cmd === 'npm' && c.args[0] === 'pack'),
    ).toBe(false)
    expect(record.engine).toMatchObject({ tarball: tgz, packedFrom: null })
  })

  it('refuses to put an arm inside the site, inside this repository, or over an earlier arm', async () => {
    const runner = fakeRunner()
    const base = {
      commit: 'x',
      arm: 'a',
      pluginRef: 'HEAD',
      repo: root,
      runner,
    }
    await expect(
      setupArm({ ...base, site: tmp, out: path.join(tmp, 'arms') }),
    ).rejects.toThrow(/inside the site/)
    await expect(
      setupArm({ ...base, site, out: path.join(root, '.arms') }),
    ).rejects.toThrow(/inside this repository/)
    fs.mkdirSync(path.join(tmp, 'a'))
    fs.writeFileSync(path.join(tmp, 'a', 'arm.json'), '{}')
    await expect(setupArm({ ...base, site, out: tmp })).rejects.toThrow(
      ArmsSetupError,
    )
    expect(runner.calls).toEqual([])
  })

  it('isInside compares whole segments', () => {
    expect(isInside('/a/b', '/a/b/c')).toBe(true)
    expect(isInside('/a/b', '/a/b')).toBe(true)
    expect(isInside('/a/b', '/a/bc')).toBe(false)
  })
})

function writeArm(dir) {
  const copy = path.join(dir, 'site')
  fs.mkdirSync(copy, { recursive: true })
  const arm = {
    arm: 'with',
    site: { repo: 'C:/Code/kiss/a1k9training', commit: 'b'.repeat(40), copy },
    baseline: 'c'.repeat(40),
    plugin: { ref: 'HEAD', sha: 'd'.repeat(40), dirty: true, dir: PLUGIN_DIR },
    engine: {
      tarball: path.join(dir, 'kiss-ssg-9.9.9.tgz'),
      sha512: 'sha512-x',
    },
    npmCache: path.join(dir, 'npm-cache'),
    model: 'claude-opus-5-5',
  }
  fs.writeFileSync(path.join(dir, 'arm.json'), JSON.stringify(arm))
  return arm
}

describe('runArm', () => {
  it('prints the command, then streams claude into transcript.jsonl with the brief on stdin', async () => {
    const arm = writeArm(tmp)
    const brief = path.join(tmp, 'brief-source.txt')
    fs.writeFileSync(brief, 'Review this site.')
    const runner = fakeRunner()
    const logged = []
    const { status, command } = await runArm({
      armDir: tmp,
      brief,
      budget: 3,
      runner,
      log: (l) => logged.push(l),
    })
    expect(status).toBe(0)
    expect(logged[0]).toBe(command)
    // A path is single-quoted when it needs it: Windows CI's temp folder is
    // the 8.3 short path `C:/Users/RUNNER~1/…`, and `~` is quoted.
    expect(command).toMatch(
      / claude -p .* < '?[^ ]*brief\.txt'? > '?[^ ]*transcript\.jsonl'? 2> '?[^ ]*stderr\.txt'?$/,
    )
    const [call] = runner.calls
    expect(call).toMatchObject({
      kind: 'stream',
      cmd: 'claude',
      opts: {
        cwd: arm.site.copy,
        stdinFile: path.join(tmp, 'brief.txt'),
        stdoutFile: path.join(tmp, 'transcript.jsonl'),
        env: { npm_config_cache: arm.npmCache },
      },
    })
    expect(call.args).toEqual(
      buildClaudeArgv({
        pluginDir: PLUGIN_DIR,
        budget: 3,
        model: 'claude-opus-5-5',
      }),
    )
    expect(fs.readFileSync(path.join(tmp, 'brief.txt'), 'utf8')).toBe(
      'Review this site.',
    )
    expect(
      JSON.parse(fs.readFileSync(path.join(tmp, 'run.json'), 'utf8')),
    ).toMatchObject({
      exitCode: 0,
      budget: 3,
    })
  })

  it('with --print-only starts nothing', async () => {
    writeArm(tmp)
    const brief = path.join(tmp, 'b.txt')
    fs.writeFileSync(brief, 'x')
    const runner = fakeRunner()
    const { status } = await runArm({
      armDir: tmp,
      brief,
      budget: 1,
      printOnly: true,
      runner,
    })
    expect(status).toBeNull()
    expect(runner.calls).toEqual([])
  })

  it('refuses to run an arm twice', async () => {
    writeArm(tmp)
    const brief = path.join(tmp, 'b.txt')
    fs.writeFileSync(brief, 'x')
    fs.writeFileSync(path.join(tmp, 'transcript.jsonl'), '')
    await expect(
      runArm({ armDir: tmp, brief, budget: 1, runner: fakeRunner() }),
    ).rejects.toThrow(/runs once/)
  })
})

describe('summariseArm', () => {
  it('reports the transcript, the diff against the baseline and commits made after it', async () => {
    const arm = writeArm(tmp)
    fs.copyFileSync(TRANSCRIPT, path.join(tmp, 'transcript.jsonl'))
    fs.writeFileSync(
      path.join(arm.site.copy, 'privacy.hbs'),
      '<h1>Privacy notice</h1>\n',
    )
    const gitCalls = []
    const runner = {
      ...fakeRunner(),
      async exec(cmd, args) {
        gitCalls.push(args.slice(2))
        const sub = args[2]
        const out =
          sub === 'diff' && args[3] === '--stat'
            ? ' src/pages/contact.hbs | 1 +\n'
            : sub === 'diff' && args[3] === '--name-status'
              ? 'M\tsrc/pages/contact.hbs\n'
              : sub === 'diff'
                ? '+++ b/src/pages/contact.hbs\n+<a href="/privacy.html">privacy</a>\n'
                : sub === 'ls-files'
                  ? 'privacy.hbs\n'
                  : sub === 'rev-list'
                    ? '1\n'
                    : ''
        return { status: 0, stdout: out, stderr: '' }
      },
    }
    const report = await summariseArm({
      armDir: tmp,
      answerKey: ANSWER_KEY,
      bench: 'fixture',
      runner,
    })
    expect(gitCalls).toContainEqual(['diff', '--stat', arm.baseline])
    expect(gitCalls).toContainEqual([
      'rev-list',
      '--count',
      `${arm.baseline}..HEAD`,
    ])
    expect(report.git).toEqual({
      diffStat: ' src/pages/contact.hbs | 1 +',
      changed: ['M\tsrc/pages/contact.hbs'],
      untracked: ['privacy.hbs'],
      commitsAfterBaseline: 1,
    })
    const privacy = report.evidence.find((i) => i.id === 'fixture-01')
    expect(privacy.candidates).toContainEqual({
      source: 'diff',
      ref: 'privacy.hbs',
      text: '<h1>Privacy notice</h1>',
    })
    expect(fs.existsSync(path.join(tmp, 'summary.json'))).toBe(true)
    const text = formatSummary(report)
    expect(text).toMatch(/SKILL\.md reads \(1\): kiss-legal-and-privacy/)
    expect(text).toMatch(
      /commit attempts: 1; .* commits after baseline: 1; permission denials: 1/,
    )
    expect(text).toMatch(/fixture-01 \[page-wording; scored as fixed-on-site\]/)
  })
})
