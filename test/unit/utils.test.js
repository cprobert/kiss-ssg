import { describe, it, expect } from 'vitest'
import utils from '../../lib/utils.js'

describe('utils.toSlug', () => {
  it('lower-cases and replaces runs of non-word characters with a dash', () => {
    expect(utils.toSlug('  Hello World! ')).toBe('hello-world-')
  })
})

describe('utils.sanitizePath', () => {
  it('trims surrounding slashes and slugifies each segment', () => {
    expect(utils.sanitizePath('/About Us/Our Team/')).toBe('about-us/our-team')
  })
})

describe('utils.hashId', () => {
  it('hashes strings and objects deterministically, and objects by content', () => {
    expect(utils.hashId('a')).toBe('0cc175b9c0f1b6a831c399e269772661')
    expect(utils.hashId({ a: 1 })).toBe(utils.hashId({ a: 1 }))
    expect(utils.hashId({ a: 1 })).not.toBe(utils.hashId({ a: 2 }))
  })
})
