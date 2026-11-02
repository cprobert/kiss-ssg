import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { formatReport } from '../../lib/build-report.js'

// The privacy checks and `report().thirdParty` against the fixture whose gaps
// were planted for them (test/fixtures/legal-weak-site/, the contract's
// workstream A). Run as a site runs: its own router.js, in a child process,
// under check mode, with the report written as JSON Lines — so the facts are
// extracted from the bytes the real build wrote and decided in the settle
// path, and the staging folder is gone before the report is read.
const ROUTER = path.resolve('test/fixtures/legal-weak-site/router.js')

let temp
let report
let run

beforeAll(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-legal-weak-'))
  const reportFile = path.join(temp, 'report.jsonl')
  run = spawnSync(process.execPath, [ROUTER], {
    cwd: temp,
    encoding: 'utf8',
    env: {
      ...process.env,
      KISS_CHECK: '1',
      KISS_REPORT: reportFile,
      LEGAL_WEAK_SITE_BUILD: path.join(temp, 'public'),
    },
  })
  const lines = fs.existsSync(reportFile)
    ? fs.readFileSync(reportFile, 'utf8').trim().split('\n')
    : []
  report = lines.length === 1 ? JSON.parse(lines[0]) : null
}, 60_000)

afterAll(() => fs.rmSync(temp, { recursive: true, force: true }))

const build = () => path.join(temp, 'public').replaceAll('\\', '/')
const findings = (check) =>
  report.audit.findings
    .filter((finding) => finding.check === check)
    .map(({ page, detail }) => [
      page === null ? null : path.posix.relative(build(), page),
      detail,
    ])

describe('the legal-weak-site fixture', () => {
  it('builds, under check, into one passing report', () => {
    expect(run.status, run.stderr).toBe(0)
    expect(report?.ok).toBe(true)
    expect(report.mode).toBe('check')
  })

  it('reports its three planted privacy findings, and no other finding', () => {
    expect(findings('privacy-link-missing')).toEqual([
      [null, expect.stringMatching(/^no privacy page/)],
      // The email field, not the honeypot before it.
      ['contact.html', 'email'],
    ])
    expect(findings('placeholder-left')).toEqual([
      ['about.html', '[to confirm: two or three years?]'],
    ])
    expect(findings('checkbox-prechecked')).toEqual([
      ['contact.html', 'Send me offers and news'],
    ])
    // Everything else on the fixture is deliberately clean.
    expect(
      new Set(report.audit.findings.map((finding) => finding.check)),
    ).toEqual(
      new Set([
        'privacy-link-missing',
        'placeholder-left',
        'checkbox-prechecked',
      ]),
    )
  })

  it('lists the third-party origins each page fetches from, with kinds', () => {
    const fonts = [
      { origin: 'https://fonts.googleapis.com', kinds: ['stylesheet'] },
      { origin: 'https://fonts.gstatic.com', kinds: ['preconnect'] },
      { origin: 'https://www.googletagmanager.com', kinds: ['script'] },
    ]
    expect(report.thirdParty).toEqual({
      siteUrl: 'https://weak-site.example',
      pages: [
        {
          page: `${build()}/about.html`,
          origins: [
            ...fonts.slice(0, 2),
            { origin: 'https://www.youtube-nocookie.com', kinds: ['iframe'] },
            fonts[2],
          ].sort((a, b) => a.origin.localeCompare(b.origin)),
        },
        { page: `${build()}/contact.html`, origins: fonts },
        { page: `${build()}/index.html`, origins: fonts },
      ],
      origins: [
        'https://fonts.googleapis.com',
        'https://fonts.gstatic.com',
        'https://www.googletagmanager.com',
        'https://www.youtube-nocookie.com',
      ],
    })
    expect(JSON.stringify(report)).not.toContain('kiss-staging')
  })

  it('says all of it in the summary', () => {
    const summary = formatReport(report)
    expect(summary).toContain(
      'audit checkbox-prechecked: "Send me offers and news" on 1 page',
    )
    expect(summary).toContain('audit privacy-link-missing: no privacy page')
    expect(summary).toContain('audit placeholder-left: 1 page')
    expect(summary).toContain(
      'third-party origins (4): https://fonts.googleapis.com, https://fonts.gstatic.com, https://www.googletagmanager.com, https://www.youtube-nocookie.com',
    )
  })
})
