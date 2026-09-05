import { describe, it, expect } from 'vitest'
import {
  REQUIRED_PACKED,
  missingPackedFiles,
  parsePackedFiles,
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
