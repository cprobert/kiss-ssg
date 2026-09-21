import { describe, it, expect, afterEach } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  HELP,
  defaultBaseline,
  describeEngine,
  diffReports,
  engineLine,
  exitCodeFor,
  formatDiff,
  parseArgs,
  readReports,
  readReportsFile,
  recordedLine,
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

// The asset manifest as `diffReports` reads it: what each template-facing path
// actually resolved to on disk once cache busting had renamed it.
const withAssets = (report, assets) => ({
  ...report,
  assets: Object.entries(assets).map(([source, target]) => ({
    source,
    target,
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

  it('parses the aikb command exactly as it parses check', () => {
    expect(parseArgs(['aikb', 'site.js', '2026-spring'])).toEqual({
      command: 'aikb',
      script: 'site.js',
      args: ['2026-spring'],
      summary: false,
      against: null,
      error: null,
    })
  })

  it('takes both options under aikb too', () => {
    expect(
      parseArgs(['aikb', '--summary', '--against', 'last.json', 'site.js']),
    ).toMatchObject({
      command: 'aikb',
      summary: true,
      against: 'last.json',
      script: 'site.js',
      error: null,
    })
    // ...and --summary is still read after the script, without being passed on.
    expect(parseArgs(['aikb', 'site.js', '--summary'])).toMatchObject({
      command: 'aikb',
      summary: true,
      args: [],
    })
  })

  it('names the command it could not complete in its usage errors', () => {
    expect(parseArgs(['aikb']).error).toBe(
      "aikb needs the site's build script: kiss-ssg aikb <script>",
    )
    expect(parseArgs(['aikb', '--against']).error).toContain(
      'kiss-ssg aikb --against <file> <script>',
    )
  })

  it('documents both commands it parses', () => {
    expect(HELP).toContain('check <script>')
    expect(HELP).toContain('aikb <script>')
    expect(HELP).toContain('--summary')
    expect(HELP).toContain('--against <file>')
  })
})

describe('defaultBaseline', () => {
  const recorded = (folder) => ({
    ok: true,
    buildDir: './public',
    aikb: { folder, written: true },
  })

  it('is the last-build.json of the first folder a report names', () => {
    expect(defaultBaseline([recorded('AIKB')])).toBe('AIKB/last-build.json')
  })

  it('skips the sites that recorded nothing and takes the first that did', () => {
    expect(
      defaultBaseline([
        { ok: true, aikb: null },
        recorded('site/AIKB'),
        recorded('other/AIKB'),
      ]),
    ).toBe('site/AIKB/last-build.json')
  })

  it('is null when no site has a knowledge base at all', () => {
    expect(defaultBaseline([{ ok: true, aikb: null }])).toBeNull()
    expect(defaultBaseline([])).toBeNull()
    expect(defaultBaseline()).toBeNull()
  })
})

describe('recordedLine', () => {
  it('names the folder a record wrote', () => {
    expect(
      recordedLine({ ok: true, aikb: { folder: 'AIKB', written: true } }),
    ).toBe('  recorded AIKB')
  })

  it('says the build failed, which is the reason that outranks the others', () => {
    expect(
      recordedLine({ ok: false, aikb: { folder: 'AIKB', written: false } }),
    ).toBe('  not recorded — build failed')
  })

  it('says the folder is switched off when there is none to write', () => {
    expect(recordedLine({ ok: true, aikb: null })).toBe(
      '  not recorded — folders.aikb is null',
    )
  })

  it('falls back to the bare verdict when nothing else explains it', () => {
    expect(
      recordedLine({ ok: true, aikb: { folder: 'AIKB', written: false } }),
    ).toBe('  not recorded')
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
        assets: [],
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
        assets: [],
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

  it('names the assets whose emitted file changed name', () => {
    const before = withAssets(built('./public', { './public/i.html': 'aaa' }), {
      'css/site.css': 'css/site.e7abc083.css',
      'js/app.js': 'js/app.11111111.js',
    })
    const after = withAssets(built('./public', { './public/i.html': 'AAA' }), {
      'css/site.css': 'css/site.136acc63.css',
      'js/app.js': 'js/app.11111111.js',
    })

    expect(diffReports([before], [after])[0].assets).toEqual([
      {
        source: 'css/site.css',
        from: 'css/site.e7abc083.css',
        to: 'css/site.136acc63.css',
      },
    ])
  })

  it('reports no assets when neither side carries a manifest', () => {
    const pages = { './public/i.html': 'aaa' }
    const [diff] = diffReports(
      [built('./public', pages)],
      [built('./public', pages)],
    )
    expect(diff.assets).toEqual([])
  })

  it('ignores an asset only one of the two builds emitted', () => {
    const before = withAssets(built('./public', { './public/i.html': 'a' }), {
      'css/site.css': 'css/site.aaaaaaaa.css',
    })
    const after = withAssets(built('./public', { './public/i.html': 'b' }), {
      'css/site.css': 'css/site.aaaaaaaa.css',
      'js/new.js': 'js/new.bbbbbbbb.js',
    })
    expect(diffReports([before], [after])[0].assets).toEqual([])
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

  it('names the assets that moved, above the page lines they explain', () => {
    const lines = formatDiff({
      buildDir: './public',
      added: [],
      removed: [],
      changed: ['./public/index.html', './public/about.html'],
      unchanged: 0,
      assets: [
        {
          source: 'css/site.css',
          from: 'css/site.e7abc083.css',
          to: 'css/site.136acc63.css',
        },
      ],
    }).split('\n')

    expect(lines).toEqual([
      '  ~ asset css/site.css -> css/site.136acc63.css (was css/site.e7abc083.css)',
      '  ~ ./public/index.html',
      '  ~ ./public/about.html',
      '  = 0 unchanged',
    ])
  })

  it('says nothing about assets when no page moved', () => {
    expect(
      formatDiff({
        buildDir: './public',
        added: [],
        removed: [],
        changed: [],
        unchanged: 3,
        assets: [
          { source: 'css/site.css', from: 'css/a.css', to: 'css/b.css' },
        ],
      }),
    ).toBe('  = 3 unchanged')
  })

  it('caps the asset list and counts the rest', () => {
    const assets = Array.from({ length: 13 }, (_, i) => ({
      source: `css/s${i}.css`,
      from: `css/s${i}.aaaaaaaa.css`,
      to: `css/s${i}.bbbbbbbb.css`,
    }))
    const lines = formatDiff({
      buildDir: './public',
      added: [],
      removed: [],
      changed: ['./public/index.html'],
      unchanged: 0,
      assets,
    }).split('\n')

    expect(lines.filter((l) => l.startsWith('  ~ asset'))).toHaveLength(10)
    // The cap line closes the asset block, which sits above the page rows.
    expect(lines[10]).toBe('  … and 3 more assets changed')
    expect(lines[11]).toBe('  ~ ./public/index.html')
    expect(lines.at(-1)).toBe('  = 0 unchanged')
  })

  it('survives a diff from before assets were recorded', () => {
    expect(
      formatDiff({
        buildDir: './public',
        added: [],
        removed: [],
        changed: ['./public/i.html'],
        unchanged: 0,
      }),
    ).toBe('  ~ ./public/i.html\n  = 0 unchanged')
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

describe('describeEngine', () => {
  // The upgrade hazard the 2.5.0 fleet run hit on six of six sites: after
  // `file:../../kiss-ssg` is edited to `^2.5.0`, a plain `npm install` keeps
  // the link because the lockfile's entry still satisfies the range — so the
  // site reports a registry version while building against a working tree.
  // `check` is the one command every upgrade runs, so it says which it found.
  const repos = []
  afterEach(() => {
    while (repos.length) rmSync(repos.pop(), { recursive: true, force: true })
  })
  const consumer = () => {
    const root = mkdtempSync(join(tmpdir(), 'kiss-engine-'))
    repos.push(root)
    return root
  }
  const engineAt = (dir, version) => {
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'kiss-ssg', version }),
    )
  }

  it('names the version and folder of a package installed from the registry', () => {
    const root = consumer()
    engineAt(join(root, 'node_modules', 'kiss-ssg'), '2.5.0')
    const engine = describeEngine({ cwd: root })
    expect(engine).toMatchObject({ version: '2.5.0', linked: false })
    expect(engineLine(engine)).toBe('kiss-ssg 2.5.0 from node_modules/kiss-ssg')
  })

  it('says so when node_modules/kiss-ssg is a link, and where it points', () => {
    const root = consumer()
    const tree = join(root, 'working-tree')
    engineAt(tree, '2.6.0-alpha.1')
    mkdirSync(join(root, 'node_modules'))
    symlinkSync(tree, join(root, 'node_modules', 'kiss-ssg'), 'junction')
    const engine = describeEngine({ cwd: root })
    expect(engine).toMatchObject({ version: '2.6.0-alpha.1', linked: true })
    expect(engineLine(engine)).toBe(
      `kiss-ssg 2.6.0-alpha.1 from node_modules/kiss-ssg — a link to ${tree.replace(/\\/g, '/')}, not the registry package`,
    )
  })

  it('walks up to the nearest node_modules, the way Node resolves', () => {
    const root = consumer()
    engineAt(join(root, 'node_modules', 'kiss-ssg'), '2.5.0')
    const nested = join(root, 'sites', 'one')
    mkdirSync(nested, { recursive: true })
    expect(describeEngine({ cwd: nested }).version).toBe('2.5.0')
  })

  it('is honest when no kiss-ssg is installed at all', () => {
    const root = consumer()
    expect(describeEngine({ cwd: root })).toBeNull()
    expect(engineLine(null)).toBe(
      'kiss-ssg: no node_modules/kiss-ssg found from here — the script resolves the package some other way',
    )
  })
})
