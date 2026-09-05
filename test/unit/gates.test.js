import { describe, it, expect } from 'vitest'
import {
  REQUIRED_PACKED,
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

describe('missingPackedFiles', () => {
  it('reports nothing when every required path ships', () => {
    expect(missingPackedFiles([...REQUIRED_PACKED, 'README.md'])).toEqual([])
  })

  it('names the paths dropped from the tarball', () => {
    expect(missingPackedFiles(['lib/kiss.js'])).toEqual([
      'llms.txt',
      'AIKB/kiss.md',
    ])
  })

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
