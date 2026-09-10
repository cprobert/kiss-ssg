import { describe, it, expect } from 'vitest'
import {
  HELP,
  diffReports,
  exitCodeFor,
  formatDiff,
  parseArgs,
  readReports,
  readReportsFile,
} from '../../lib/check.js'

const report = (ok) => ({ ok, mode: 'check', buildDir: './public' })

// A report as `diffReports` reads it: a build folder and the pages under it,
// each with the hash of the bytes it wrote.
const built = (buildDir, pages) => ({
  ok: true,
  mode: 'build',
  buildDir,
  pages: Object.entries(pages).map(([buildTo, hash]) => ({
    view: 'v.hbs',
    buildTo,
    ok: hash !== null,
    hash,
  })),
})

describe('parseArgs', () => {
  it('reads the script and everything after it', () => {
    expect(parseArgs(['check', 'site.js', '2026-spring', '--verbose'])).toEqual(
      {
        command: 'check',
        script: 'site.js',
        args: ['2026-spring', '--verbose'],
        summary: false,
        against: null,
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

  it('takes --against with its file before the script', () => {
    const parsed = parseArgs(['check', '--against', 'last.json', 'site.js'])
    expect(parsed.against).toBe('last.json')
    expect(parsed.script).toBe('site.js')
    expect(parsed.args).toEqual([])
    expect(parsed.error).toBeNull()
  })

  it('reads --against beside --summary, in either order', () => {
    expect(
      parseArgs(['check', '--summary', '--against', 'last.json', 'site.js']),
    ).toMatchObject({ summary: true, against: 'last.json', script: 'site.js' })
    expect(
      parseArgs(['check', '--against', 'last.json', '--summary', 'site.js']),
    ).toMatchObject({ summary: true, against: 'last.json', script: 'site.js' })
  })

  it('leaves against null when the flag is not given', () => {
    expect(parseArgs(['check', 'site.js']).against).toBeNull()
  })

  it('refuses --against with no file at all', () => {
    expect(parseArgs(['check', '--against']).error).toContain(
      '--against needs a report file',
    )
  })

  it('refuses --against whose file would be the end-of-options marker', () => {
    // `check --against -- site.js` is a typo, not a request to diff against a
    // file called `--`; taking it would silently check the site against itself.
    expect(parseArgs(['check', '--against', '--', 'site.js']).error).toContain(
      '--against needs a report file',
    )
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
    expect(HELP).toContain('--against <file>')
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

describe('readReportsFile', () => {
  it('reads the JSON Lines a KISS_REPORT file collects', () => {
    const text = `${JSON.stringify(report(true))}\n${JSON.stringify(report(false))}\n`
    expect(readReportsFile(text)).toEqual([report(true), report(false)])
  })

  it('reads the JSON array check itself prints', () => {
    const text = JSON.stringify([report(true), report(false)], null, 2)
    expect(readReportsFile(text)).toEqual([report(true), report(false)])
  })

  it('reads a single report object as one report', () => {
    expect(readReportsFile(JSON.stringify(report(true), null, 2))).toEqual([
      report(true),
    ])
  })

  it('reads an empty file as no reports', () => {
    expect(readReportsFile('')).toEqual([])
    expect(readReportsFile('\n\n')).toEqual([])
    expect(readReportsFile()).toEqual([])
  })

  it('throws on a file it cannot read either way', () => {
    expect(() => readReportsFile('{"ok":true}\n{half a report')).toThrow()
    expect(() => readReportsFile('not json at all')).toThrow()
  })
})

describe('diffReports', () => {
  it('sorts every page into added, removed, changed or unchanged', () => {
    const before = built('./public', {
      './public/index.html': 'aaa',
      './public/about.html': 'bbb',
      './public/gone.html': 'ccc',
    })
    const after = built('./public', {
      './public/index.html': 'aaa',
      './public/about.html': 'BBB',
      './public/new.html': 'ddd',
    })

    expect(diffReports([before], [after])).toEqual([
      {
        buildDir: './public',
        added: ['./public/new.html'],
        removed: ['./public/gone.html'],
        changed: ['./public/about.html'],
        unchanged: 1,
      },
    ])
  })

  it('sorts each list by path rather than by registration order', () => {
    const after = built('./public', {
      './public/z.html': 'z',
      './public/a.html': 'a',
    })
    const [diff] = diffReports([], [after])
    expect(diff.added).toEqual(['./public/a.html', './public/z.html'])
  })

  it('counts a null hash on either side as changed, never as unchanged', () => {
    const before = built('./public', {
      './public/failed.html': null,
      './public/skipped.html': 'aaa',
      './public/same.html': 'bbb',
    })
    const after = built('./public', {
      './public/failed.html': 'aaa',
      './public/skipped.html': null,
      './public/same.html': 'bbb',
    })

    const [diff] = diffReports([before], [after])
    expect(diff.changed).toEqual([
      './public/failed.html',
      './public/skipped.html',
    ])
    expect(diff.unchanged).toBe(1)
  })

  it('diffs a build folder the old file never saw as all added', () => {
    const before = built('./public/a', { './public/a/index.html': 'aaa' })
    const after = built('./public/b', { './public/b/index.html': 'bbb' })

    expect(diffReports([before], [after])).toEqual([
      {
        buildDir: './public/b',
        added: ['./public/b/index.html'],
        removed: [],
        changed: [],
        unchanged: 0,
      },
    ])
  })

  it('takes the newest report for a folder when the before file holds several', () => {
    // A KISS_REPORT file is appended to across builds: the baseline a
    // developer means by "since the last build" is the last line, not the first.
    const before = [
      built('./public', { './public/index.html': 'old' }),
      built('./public', { './public/index.html': 'new' }),
    ]
    const after = [built('./public', { './public/index.html': 'new' })]

    expect(diffReports(before, after)[0]).toMatchObject({
      changed: [],
      unchanged: 1,
    })
  })

  it('ignores a before report this run did not build again', () => {
    const before = [
      built('./public/a', { './public/a/index.html': 'aaa' }),
      built('./public/b', { './public/b/index.html': 'bbb' }),
    ]
    const after = [built('./public/a', { './public/a/index.html': 'aaa' })]

    const diff = diffReports(before, after)
    expect(diff).toHaveLength(1)
    expect(diff[0]).toMatchObject({ buildDir: './public/a', unchanged: 1 })
  })

  it('pairs each site by build folder and answers in after order', () => {
    const before = [
      built('./public/a', { './public/a/index.html': 'aaa' }),
      built('./public/b', { './public/b/index.html': 'bbb' }),
    ]
    const after = [
      built('./public/b', { './public/b/index.html': 'BBB' }),
      built('./public/a', { './public/a/index.html': 'aaa' }),
    ]

    expect(diffReports(before, after).map((d) => d.buildDir)).toEqual([
      './public/b',
      './public/a',
    ])
    expect(diffReports(before, after)[0].changed).toEqual([
      './public/b/index.html',
    ])
  })

  it('leaves a page with no output path out of the diff entirely', () => {
    const after = {
      buildDir: './public',
      pages: [
        { view: 'item.hbs [item 3: x]', buildTo: null, ok: false, hash: null },
        {
          view: 'index.hbs',
          buildTo: './public/index.html',
          ok: true,
          hash: 'a',
        },
      ],
    }
    const [diff] = diffReports([], [after])
    expect(diff.added).toEqual(['./public/index.html'])
  })

  it('reads two empty sides as no diff at all', () => {
    expect(diffReports()).toEqual([])
    expect(diffReports([], [])).toEqual([])
  })
})

describe('formatDiff', () => {
  it('prints one indented line per page and the unchanged count last', () => {
    const lines = formatDiff({
      buildDir: './public',
      added: ['./public/new.html'],
      removed: ['./public/gone.html'],
      changed: ['./public/about.html'],
      unchanged: 4,
    }).split('\n')

    expect(lines).toEqual([
      '  + ./public/new.html',
      '  - ./public/gone.html',
      '  ~ ./public/about.html',
      '  = 4 unchanged',
    ])
  })

  it('still says how many were unchanged when nothing moved', () => {
    expect(
      formatDiff({
        buildDir: './public',
        added: [],
        removed: [],
        changed: [],
        unchanged: 6,
      }),
    ).toBe('  = 6 unchanged')
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
