import { describe, it, expect, afterEach } from 'vitest'
import utils from '../../lib/utils.js'
import { makeSite } from '../helpers/site.js'

let site
afterEach(async () => {
  if (site) await site.cleanup()
  site = null
})

describe('utils.toSlug', () => {
  it('lower-cases and replaces runs of non-word characters with a dash', () => {
    expect(utils.toSlug('  Hello World! ')).toBe('hello-world')
  })

  it('trims leading and trailing dashes', () => {
    expect(utils.toSlug('  --hello--  ')).toBe('hello')
  })

  it('transliterates accented Latin instead of dropping it', () => {
    expect(utils.toSlug('Über uns')).toBe('uber-uns')
  })

  it('falls back to a stable hash for scripts with no Latin mapping', () => {
    const jp = utils.toSlug('日本語のページ')
    const ko = utils.toSlug('안녕하세요')
    expect(jp).toBeTruthy()
    expect(ko).toBeTruthy()
    expect(jp).not.toBe('-')
    expect(jp).not.toBe(ko)
    expect(jp).toBe(utils.toSlug('日本語のページ'))
  })

  it('keeps an empty input empty rather than hashing it', () => {
    expect(utils.toSlug('')).toBe('')
    expect(utils.toSlug('   ')).toBe('')
  })
})

describe('utils.sanitizePath', () => {
  it('trims surrounding slashes and slugifies each segment', () => {
    expect(utils.sanitizePath('/About Us/Our Team/')).toBe('about-us/our-team')
  })

  it('cannot escape upwards', () => {
    expect(utils.sanitizePath('../../etc')).not.toContain('..')
  })
})

describe('utils.hashId', () => {
  it('hashes strings and objects deterministically, and objects by content', () => {
    expect(utils.hashId('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(utils.hashId({ a: 1 })).toBe(utils.hashId({ a: 1 }))
    expect(utils.hashId({ a: 1 })).not.toBe(utils.hashId({ a: 2 }))
  })
})

describe('utils.globFiles', () => {
  it('finds files under a directory, sorted and posix', async () => {
    site = await makeSite({ 'v/b.hbs': 'b', 'v/a/c.hbs': 'c' })
    expect(utils.globFiles(`${site.root}/v`, '**/*.hbs')).toEqual([
      `${site.root}/v/a/c.hbs`,
      `${site.root}/v/b.hbs`,
    ])
  })

  it('treats glob metacharacters in the directory as literal characters', async () => {
    site = await makeSite({ 'site[old]/a.hbs': 'a', 'site[old]/b.hbs': 'b' })
    expect(utils.globFiles(`${site.root}/site[old]`, '*.hbs')).toEqual([
      `${site.root}/site[old]/a.hbs`,
      `${site.root}/site[old]/b.hbs`,
    ])
  })
})
