import { describe, it, expect } from 'vitest'
import { HELP, exitCodeFor, parseArgs, readReports } from '../../lib/check.js'

const report = (ok) => ({ ok, mode: 'check', buildDir: './public' })

describe('parseArgs', () => {
  it('reads the script and everything after it', () => {
    expect(parseArgs(['check', 'site.js', '2026-spring', '--verbose'])).toEqual(
      {
        command: 'check',
        script: 'site.js',
        args: ['2026-spring', '--verbose'],
        summary: false,
        error: null,
      },
    )
  })

  it('takes --summary before the script', () => {
    const parsed = parseArgs(['check', '--summary', 'site.js'])
    expect(parsed.summary).toBe(true)
    expect(parsed.script).toBe('site.js')
    expect(parsed.args).toEqual([])
  })

  it('takes --summary after the script too, without passing it on', () => {
    const parsed = parseArgs(['check', 'site.js', '2026-spring', '--summary'])
    expect(parsed.summary).toBe(true)
    expect(parsed.args).toEqual(['2026-spring'])
  })

  it('hands --summary to the script when it comes after --', () => {
    const parsed = parseArgs(['check', 'site.js', '--', '--summary'])
    expect(parsed.summary).toBe(false)
    expect(parsed.args).toEqual(['--summary'])
  })

  it('accepts -- before the script as the end of its own options', () => {
    const parsed = parseArgs(['check', '--summary', '--', '-weird-name.js'])
    expect(parsed.summary).toBe(true)
    expect(parsed.script).toBe('-weird-name.js')
  })

  it('passes an unknown flag after the script to the script', () => {
    const parsed = parseArgs(['check', 'site.js', '--verbose'])
    expect(parsed.error).toBeNull()
    expect(parsed.args).toEqual(['--verbose'])
  })

  it('asks for help with no arguments at all', () => {
    const parsed = parseArgs([])
    expect(parsed.command).toBe('help')
    expect(parsed.error).toBe('nothing to do')
  })

  it.each(['--help', '-h', 'help'])('%s is help, not an error', (flag) => {
    expect(parseArgs([flag])).toMatchObject({ command: 'help', error: null })
  })

  it('refuses an unknown command', () => {
    expect(parseArgs(['build', 'site.js']).error).toBe('unknown command: build')
  })

  it('refuses an unknown option rather than passing it to the script', () => {
    expect(parseArgs(['check', '--json', 'site.js']).error).toBe(
      'unknown option: --json',
    )
  })

  it('says what is missing when no script is named', () => {
    const parsed = parseArgs(['check'])
    expect(parsed.command).toBe('check')
    expect(parsed.script).toBeNull()
    expect(parsed.error).toContain('build script')
  })

  it('documents the command it parses', () => {
    expect(HELP).toContain('kiss-ssg check <script>')
    expect(HELP).toContain('--summary')
  })
})

describe('readReports', () => {
  it('reads one report per line, trailing newline and all', () => {
    const text = `${JSON.stringify(report(true))}\n${JSON.stringify(report(false))}\n`
    expect(readReports(text)).toEqual([report(true), report(false)])
  })

  it('reads an empty file as no reports', () => {
    expect(readReports('')).toEqual([])
    expect(readReports('\n\n')).toEqual([])
    expect(readReports()).toEqual([])
  })

  it('throws on a line it cannot parse, rather than dropping it', () => {
    expect(() => readReports('{"ok":true}\n{half a report')).toThrow()
  })
})

describe('exitCodeFor', () => {
  it('passes only when every report is ok and the script exited 0', () => {
    expect(exitCodeFor([report(true), report(true)], 0)).toBe(0)
  })

  it('fails when any report failed', () => {
    expect(exitCodeFor([report(true), report(false)], 0)).toBe(1)
  })

  it('fails when the script itself exited non-zero', () => {
    expect(exitCodeFor([report(true)], 1)).toBe(1)
  })

  it('fails when the script was killed and has no exit code', () => {
    expect(exitCodeFor([report(true)], null)).toBe(1)
  })

  it('fails when nothing reported a build at all', () => {
    expect(exitCodeFor([], 0)).toBe(1)
  })

  it('fails on a report with no ok at all', () => {
    expect(exitCodeFor([{ mode: 'check' }], 0)).toBe(1)
  })
})
