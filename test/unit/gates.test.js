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

  it('returns null on unparsable output so the gate reports rather than fails', () => {
    expect(parsePackedFiles('npm warn something\n')).toBeNull()
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
