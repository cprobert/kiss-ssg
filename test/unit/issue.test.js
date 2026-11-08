import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  BUG_HEADINGS,
  FEATURE_HEADINGS,
  buildSummary,
  createCommand,
  draftIssue,
  findTokens,
  fixesLink,
  issueNumber,
  issueRepo,
  parseFiled,
  parseIssueArgs,
  runIssue,
  shippedIn,
} from '../../lib/issue.js'

const REPO = 'cprobert/kiss-ssg'

// The feedback loop (planning/plans/2026-11-08-feedback-loop.md): a site
// drafts an issue, the operator files it, and the site later asks whether
// the kiss it has installed shipped the fix.

describe('issueRepo', () => {
  it("reads this package's own bugs.url", () => {
    expect(issueRepo()).toBe(REPO)
  })
})

describe('findTokens', () => {
  it.each([
    ['a GitHub token', `token: ghp_${'a1'.repeat(15)}`],
    ['a GitHub token', `github_pat_${'A1_'.repeat(10)}`],
    ['an npm token', `//registry.npmjs.org/:_authToken=npm_${'b2'.repeat(15)}`],
    ['a Slack token', 'xoxb-1234567890-abcdefghij'],
    ['an AWS access key', 'AKIAIOSFODNN7EXAMPLE'],
    ['an API key (sk-)', `sk-ant-${'c3'.repeat(15)}`],
    ['a private key', '-----BEGIN OPENSSH PRIVATE KEY-----'],
    [
      'a secret assigned to a name',
      'Authorization: "Bearer abc123def456ghi789jkl012"',
    ],
    ['a secret assigned to a name', 'MY_SECRET=q7Zx9Lp2Rt5Vw8Ny3Kd6'],
  ])('finds %s', (kind, line) => {
    expect(findTokens(`intro\n${line}`)).toEqual([{ line: 2, kind }])
  })

  // The critique (2026-11-08): the first rule refused the very config
  // excerpt a bug report about `fetch.headers` would carry.
  it.each([
    'authorization: process.env.API_TOKEN',
    "headers: { Authorization: 'Bearer ' + token }",
    'token: env.TOKEN',
    'API_TOKEN_FOR_THE_STAGING_SERVER=see the host settings',
    'the password field must be 8 characters',
  ])('passes an honest line: %s', (line) => {
    expect(findTokens(line)).toEqual([])
  })
})

describe('issueNumber and parseFiled', () => {
  it('reads a URL, #n or n, and never takes 78 for 7', () => {
    expect(issueNumber(`https://github.com/${REPO}/issues/78`, REPO)).toBe(78)
    expect(issueNumber(`https://github.com/${REPO}/issues/7`, REPO)).toBe(7)
    expect(issueNumber('#12', REPO)).toBe(12)
    expect(issueNumber('12', REPO)).toBe(12)
    expect(issueNumber('soon', REPO)).toBe(null)
  })

  // The fifth review (2026-11-08): another project's issue URL was read as a
  // kiss-ssg issue, so --status answered for an unrelated number.
  it('takes a URL only into this repository', () => {
    expect(
      issueNumber(
        'https://github.com/handlebars-lang/handlebars.js/issues/1234',
        REPO,
      ),
    ).toBe(null)
  })

  it('finds every filed: URL into this repository, trailing punctuation dropped, and nothing else', () => {
    const text = [
      '- The purge removed Tailwind classes. filed: https://github.com/cprobert/kiss-ssg/issues/78.',
      '- Widths. Filed: https://github.com/cprobert/kiss-ssg/issues/80',
      '- Partials. filed: https://github.com/handlebars-lang/handlebars.js/issues/1234',
      '- Bugs filed: 2',
      '- skipped: not kiss',
    ].join('\n')
    expect(parseFiled(text, REPO).map((f) => f.number)).toEqual([78, 80])
  })
})

describe('shippedIn', () => {
  const changelog = [
    '# Changelog',
    '',
    '## 2.14.0 — 2026-11-09',
    '',
    `- **Purge.** Fixes [#78](https://github.com/${REPO}/issues/78).`,
    `- Mentions [#79](https://github.com/${REPO}/issues/79) as still open.`,
    '',
    '## 2.13.3 — 2026-11-07',
    '',
    `- Fixes [#7](https://github.com/${REPO}/issues/7).`,
  ].join('\n')

  it('names the version whose entry has the Fixes link', () => {
    expect(shippedIn(changelog, 78, REPO)).toBe('2.14.0')
    expect(shippedIn(changelog, 7, REPO)).toBe('2.13.3')
  })

  it('does not count a bare mention, or another number that starts the same', () => {
    expect(shippedIn(changelog, 79, REPO)).toBe(null)
    expect(shippedIn(changelog, 780, REPO)).toBe(null)
    expect(
      shippedIn(
        `## 1.0.0\n\nFixes [#7](https://github.com/${REPO}/issues/78)`,
        7,
        REPO,
      ),
    ).toBe(null)
  })

  it('exposes the one link shape', () => {
    expect([
      ...`Fixes [#3](https://github.com/${REPO}/issues/3)`.matchAll(
        fixesLink(REPO),
      ),
    ]).toHaveLength(1)
  })
})

describe('buildSummary', () => {
  it('says what a failing check found, and where it came from', () => {
    const text = buildSummary(
      [
        {
          ok: false,
          mode: 'check',
          pages: [{}, {}],
          failures: [{ view: 'pages/about.hbs' }],
          audit: {
            findings: [
              { check: 'image-oversized' },
              { check: 'image-oversized' },
            ],
          },
        },
      ],
      'report.json',
    )
    expect(text).toContain('From report.json:')
    expect(text).toContain('- failed, check: 2 pages, 1 failure')
    expect(text).toContain('failed: pages/about.hbs')
    expect(text).toContain('audit: image-oversized 2')
  })

  it('says so when there is no report', () => {
    expect(buildSummary([], 'nothing')).toBe('No report given (nothing).')
  })
})

describe('draftIssue', () => {
  const facts = {
    version: '2.14.0',
    node: 'v22.23.4',
    os: 'linux 6.1',
    site: 'a1k9training',
    siteUrl: 'https://a1k9training.co.uk',
    build: 'No report given (x).',
  }

  it('writes the bug form’s headings in order, notes under theirs', () => {
    const body = draftIssue({
      kind: 'bug',
      facts,
      notes:
        'The hero lost its height.\n\n### Reproduction\n\nBuild with purge.\n\n### Config excerpt\n\npurge: { files: [...] }',
    })
    const headings = [...body.matchAll(/^### (.+)$/gm)].map((m) => m[1])
    expect(headings).toEqual([...BUG_HEADINGS])
    expect(body).toMatch(/### What happened\n\nThe hero lost its height\./)
    expect(body).toMatch(/### Reproduction\n\nBuild with purge\./)
    expect(body).toContain('a1k9training (https://a1k9training.co.uk)')
    expect(body).toMatch(/### What was expected\n\n_No response_/)
  })

  it('writes the feature form’s headings, and leaves the site out when asked', () => {
    const body = draftIssue({ kind: 'feature', facts, anonymous: true })
    expect([...body.matchAll(/^### (.+)$/gm)].map((m) => m[1])).toEqual([
      ...FEATURE_HEADINGS,
    ])
    expect(body).not.toContain('a1k9training')
  })
})

describe('createCommand, in any shell', () => {
  // The fifth review: an agent's curly apostrophe (’) ends a PowerShell
  // single-quoted string, and on Windows `!` may run in Git Bash, where ''
  // is no escape. Every quote-like character in the title becomes ʼ
  // (U+02BC), a letter, so one single-quoted form is safe in both shells.
  it.each(['linux', 'win32'])(
    'on %s, quotes nothing a shell reads as a quote',
    (platform) => {
      const command = createCommand({
        repo: REPO,
        title: "Purge drops a site’s and a page's ‘classes’ ‚x‛",
        file: '/t/x.md',
        platform,
      })
      expect(command).toBe(
        `! gh issue create --repo ${REPO} --title 'Purge drops a siteʼs and a pageʼs ʼclassesʼ ʼxʼ' --body-file '/t/x.md'`,
      )
    },
  )
})

describe('parseIssueArgs', () => {
  it('needs a kind and a title for a draft', () => {
    expect(parseIssueArgs(['--title', 'x']).error).toMatch(/bug or feature/)
    expect(parseIssueArgs(['bug']).error).toMatch(/--title/)
    expect(parseIssueArgs(['bug', '--title', '  ']).error).toMatch(/--title/)
    expect(parseIssueArgs(['bug', '--title', 'x', '--zap']).error).toMatch(
      /unknown option/,
    )
  })
})

describe('runIssue', () => {
  let site
  /** @type {string[][]} */
  let calls
  const gh =
    (answers = {}) =>
    (args) => {
      calls.push(args)
      const key = `${args[0]} ${args[1]}`
      return key in answers
        ? { ok: true, stdout: answers[key] }
        : { ok: false, stdout: '' }
    }
  beforeEach(() => {
    site = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-issue-'))
    fs.writeFileSync(
      path.join(site, 'package.json'),
      JSON.stringify({ name: 'my-site' }),
    )
    calls = []
  })
  afterEach(() => fs.rmSync(site, { recursive: true, force: true }))

  const run = (argv, extra = {}) =>
    runIssue(argv, {
      cwd: site,
      gh: gh(extra.answers),
      tmpdir: site,
      repo: REPO,
      platform: 'linux',
      ...extra,
    })

  it('drafts outside --out only where asked, searches, and prints the command without running it', () => {
    const result = run(['bug', '--title', 'Purge drops classes'], {
      answers: {
        'issue list': JSON.stringify([
          { number: 3, title: 'Old', state: 'CLOSED', url: 'u3' },
          {
            number: 78,
            title: 'Purge drops classes',
            state: 'OPEN',
            url: 'u78',
          },
        ]),
      },
    })
    expect(result.code).toBe(0)
    const drafted = /Drafted a bug report: (.+)$/m.exec(result.out)?.[1]
    expect(drafted && fs.readFileSync(drafted, 'utf8')).toMatch(
      /### Site\n\nmy-site/,
    )
    expect(result.out.indexOf('#78 open')).toBeLessThan(
      result.out.indexOf('#3 closed'),
    )
    expect(result.out).toMatch(
      /^! gh issue create --repo cprobert\/kiss-ssg --title 'Purge drops classes'/m,
    )
    expect(calls.every((args) => args[1] !== 'create')).toBe(true)
  })

  it('carries on without gh', () => {
    const result = run(['feature', '--title', 'More widths'])
    expect(result.code).toBe(0)
    expect(result.out).toMatch(/Could not search for duplicates/)
  })

  it('refuses a token in the notes or the title, naming the line and never the value, and writes nothing', () => {
    const secret = `ghp_${'z9'.repeat(15)}`
    fs.writeFileSync(
      path.join(site, 'notes.md'),
      `It failed.\n\nGH_TOKEN=${secret}`,
    )
    const written = []
    const result = run(['bug', '--title', 'x', '--notes', 'notes.md'], {
      write: (f) => written.push(f),
    })
    expect(result.code).toBe(1)
    expect(result.err).toMatch(/a GitHub token/)
    expect(result.err).not.toContain(secret)
    expect(written).toEqual([])
    expect(
      run(['bug', '--title', `oops ${secret}`], {
        write: (f) => written.push(f),
      }).err,
    ).toMatch(/the title: a GitHub token/)
    expect(calls).toEqual([])
  })

  it('describes the build from --report, and from the record otherwise', () => {
    fs.writeFileSync(
      path.join(site, 'report.json'),
      JSON.stringify([
        {
          ok: false,
          mode: 'check',
          pages: [],
          failures: [{ view: 'v.hbs' }],
          thirdParty: { siteUrl: null },
        },
      ]),
    )
    const out = run([
      'bug',
      '--title',
      'x',
      '--report',
      'report.json',
      '--no-search',
      '--out',
      'd.md',
    ])
    expect(out.code).toBe(0)
    expect(fs.readFileSync(path.join(site, 'd.md'), 'utf8')).toMatch(
      /failed: v\.hbs/,
    )
    fs.mkdirSync(path.join(site, 'AIKB'))
    fs.writeFileSync(
      path.join(site, 'AIKB', 'last-build.json'),
      JSON.stringify({
        ok: true,
        mode: 'build',
        pages: [{}],
        failures: [],
        thirdParty: { siteUrl: 'https://my.site' },
      }),
    )
    run(['bug', '--title', 'x', '--no-search', '--out', 'e.md'])
    const body = fs.readFileSync(path.join(site, 'e.md'), 'utf8')
    expect(body).toMatch(/last recorded passing build/)
    expect(body).toContain('my-site (https://my.site)')
  })

  it('answers --status from the installed CHANGELOG', () => {
    const kiss = path.join(site, 'node_modules', 'kiss-ssg')
    fs.mkdirSync(kiss, { recursive: true })
    fs.writeFileSync(
      path.join(kiss, 'package.json'),
      JSON.stringify({ version: '2.14.0' }),
    )
    fs.writeFileSync(
      path.join(kiss, 'CHANGELOG.md'),
      `## 2.14.0 — x\n\nFixes [#78](https://github.com/${REPO}/issues/78).\n`,
    )
    expect(run(['--status', `https://github.com/${REPO}/issues/78`]).out).toBe(
      '#78: shipped in 2.14.0',
    )
    expect(
      run(['--status', '#7'], { answers: { 'issue view': 'OPEN\n' } }).out,
    ).toBe('#7: not in the installed kiss-ssg (2.14.0), open on GitHub')
  })

  it('lists every filed issue in the logs and site.md with --filed', () => {
    const logs = path.join(site, 'planning', 'sessions')
    fs.mkdirSync(logs, { recursive: true })
    fs.writeFileSync(
      path.join(logs, '2026-11-01-a.md'),
      `---\nbranch: a\n---\n- x. filed: https://github.com/${REPO}/issues/78\n- y. filed: #79, which is not a URL\n`,
    )
    fs.mkdirSync(path.join(site, 'AIKB'))
    fs.writeFileSync(
      path.join(site, 'AIKB', 'site.md'),
      `- y. filed: https://github.com/${REPO}/issues/80\n`,
    )
    const out = run(['--filed']).out.split('\n')
    expect(out).toHaveLength(2)
    expect(out[0]).toMatch(
      /^#78: not in the installed kiss-ssg .* \(filed in planning\/sessions\/2026-11-01-a\.md\)$/,
    )
    expect(out[1]).toMatch(/^#80: .*\(filed in AIKB\/site\.md\)$/)
  })

  it('exits 2 on usage', () => {
    expect(run(['bug']).code).toBe(2)
    expect(run(['--status', 'soon']).code).toBe(2)
  })

  // The fifth review: these threw, and the bin printed a stack trace and
  // exited 1, which means "refused for a token".
  it('says what it could not do, with exit 2, for an --out folder that is not there or a broken package.json', () => {
    const missing = run(
      ['bug', '--title', 'x', '--no-search', '--out', 'no/such/d.md'],
      {
        write: (f) => fs.writeFileSync(f, ''),
      },
    )
    expect(missing.code).toBe(2)
    expect(missing.err).toMatch(/could not write the draft/)
    fs.writeFileSync(path.join(site, 'package.json'), '{ "name": "x", }')
    const broken = run(['bug', '--title', 'x', '--no-search', '--out', 'd.md'])
    expect(broken.code).toBe(0)
    expect(fs.readFileSync(path.join(site, 'd.md'), 'utf8')).toMatch(
      new RegExp(`### Site\\n\\n${path.basename(site)}`),
    )
  })

  // The fifth review: --anonymous left the failing views' paths, which can
  // name the client, in the build summary.
  it('leaves the failing views out under --anonymous, keeping the counts', () => {
    fs.writeFileSync(
      path.join(site, 'report.json'),
      JSON.stringify([
        {
          ok: false,
          mode: 'check',
          pages: [],
          failures: [{ view: 'views/clients/acme/pricing.hbs' }],
        },
      ]),
    )
    run([
      'bug',
      '--title',
      'x',
      '--report',
      'report.json',
      '--anonymous',
      '--no-search',
      '--out',
      'a.md',
    ])
    const body = fs.readFileSync(path.join(site, 'a.md'), 'utf8')
    expect(body).not.toContain('acme')
    expect(body).toContain('1 failure')
  })
})
