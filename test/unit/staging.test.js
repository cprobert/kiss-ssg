import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  removeStaging,
  renameForPromote,
  stagedPath,
  stagingSiblings,
  sweepStaleSiblings,
  toReportedPath,
  writeConfig,
  writeRoot,
} from '../../lib/staging.js'

const logger = () => ({
  error: vi.fn(),
  notice: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
})

let temp
afterEach(async () => {
  vi.restoreAllMocks()
  if (temp) await fs.remove(temp)
  temp = null
})

describe('stagingSiblings', () => {
  it('names both siblings with one suffix carrying this pid', () => {
    const { stagingDir, oldDir } = stagingSiblings('out/public')
    const staged = stagingDir.match(/^out\/public\.kiss-staging-(.+)$/)
    const old = oldDir.match(/^out\/public\.kiss-old-(.+)$/)
    expect(staged?.[1]).toBe(old?.[1])
    expect(staged?.[1]).toMatch(new RegExp(`^${process.pid}-[a-z0-9]+$`))
  })
})

describe('writeRoot and writeConfig', () => {
  const config = { folders: { src: 'src', build: 'public' } }

  it('are the author folder and the same config object when nothing is staged', () => {
    const kiss = { config, _stagingDir: null }
    expect(writeRoot(kiss)).toBe('public')
    expect(writeConfig(kiss)).toBe(config)
  })

  it('point at the staging folder without repointing config', () => {
    const kiss = { config, _stagingDir: 'public.kiss-staging-1-a' }
    expect(writeRoot(kiss)).toBe('public.kiss-staging-1-a')
    expect(writeConfig(kiss).folders).toEqual({
      src: 'src',
      build: 'public.kiss-staging-1-a',
    })
    expect(config.folders.build).toBe('public')
  })
})

describe('stagedPath', () => {
  const kiss = {
    _stagingDir: '/site/public.kiss-staging',
    _buildTarget: '/site/public',
  }

  it('moves a target inside the build folder into staging', () => {
    expect(stagedPath(kiss, '/site/public/css')).toBe(
      path.join('/site/public.kiss-staging', 'css'),
    )
    expect(stagedPath(kiss, '/site/public')).toBe(
      path.join('/site/public.kiss-staging'),
    )
  })

  it('leaves a target outside the build folder, or a sibling that shares its prefix, alone', () => {
    expect(stagedPath(kiss, '/site/elsewhere')).toBe('/site/elsewhere')
    expect(stagedPath(kiss, '/site/public-old/x')).toBe('/site/public-old/x')
  })

  it('changes nothing when no build is staged', () => {
    expect(stagedPath({ _stagingDir: null }, '/site/public/css')).toBe(
      '/site/public/css',
    )
  })
})

describe('toReportedPath', () => {
  const kiss = {
    _stagingDir: 'public.kiss-staging-1-a',
    _buildTarget: 'public',
  }

  it('names a staged file where the operator will look for it', () => {
    expect(toReportedPath(kiss, 'public.kiss-staging-1-a/about.html')).toBe(
      'public/about.html',
    )
  })

  it('passes anything else through', () => {
    expect(toReportedPath(kiss, 'src/pages/about.hbs')).toBe(
      'src/pages/about.hbs',
    )
    expect(toReportedPath(kiss, undefined)).toBe(undefined)
    expect(toReportedPath({ _stagingDir: null }, 'x/y.html')).toBe('x/y.html')
  })
})

describe('renameForPromote', () => {
  const locked = () => Object.assign(new Error('locked'), { code: 'EPERM' })

  it('retries a lock that clears', async () => {
    const rename = vi
      .spyOn(fsp, 'rename')
      .mockRejectedValueOnce(locked())
      .mockResolvedValueOnce(undefined)
    await renameForPromote('a', 'b', 'public')
    expect(rename).toHaveBeenCalledTimes(2)
  })

  it('rethrows anything that is not a lock at once', async () => {
    const rename = vi
      .spyOn(fsp, 'rename')
      .mockRejectedValue(Object.assign(new Error('gone'), { code: 'ENOENT' }))
    await expect(renameForPromote('a', 'b', 'public')).rejects.toThrow('gone')
    expect(rename).toHaveBeenCalledTimes(1)
  })

  it('names the folder and the likely holder when the lock does not clear', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(fsp, 'rename').mockRejectedValue(locked())
      const done = renameForPromote('a', 'b', 'public').catch((e) => e)
      await vi.runAllTimersAsync()
      const error = await done
      expect(error.message).toMatch(
        /^Could not replace public: .*open in another program/,
      )
      expect(error.code).toBe('EPERM')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('sweepStaleSiblings', () => {
  it("removes a crashed run's siblings and keeps this process's own", async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-staging-'))
    const target = path.join(temp, 'public')
    const names = [
      'public.kiss-staging-1-dead',
      'public.kiss-old-1-dead',
      `public.kiss-staging-${process.pid}-live`,
      'public-unrelated',
    ]
    for (const name of names) await fs.ensureDir(path.join(temp, name))
    const kiss = { _buildTarget: target, logger: logger() }

    sweepStaleSiblings(kiss)

    expect((await fs.readdir(temp)).sort()).toEqual(
      [`public.kiss-staging-${process.pid}-live`, 'public-unrelated'].sort(),
    )
    // One notice naming both; their order is the directory listing's.
    expect(kiss.logger.notice).toHaveBeenCalledTimes(1)
    const [notice] = kiss.logger.notice.mock.calls[0]
    expect(notice).toMatch(/^Removed leftovers of an interrupted build: /)
    expect(notice).toContain('public.kiss-staging-1-dead')
    expect(notice).toContain('public.kiss-old-1-dead')
  })

  it('says nothing when the parent folder does not exist yet', () => {
    const kiss = {
      _buildTarget: path.join(os.tmpdir(), 'kiss-no-such-parent', 'public'),
      logger: logger(),
    }
    sweepStaleSiblings(kiss)
    expect(kiss.logger.notice).not.toHaveBeenCalled()
  })
})

describe('removeStaging', () => {
  it('warns rather than throws when the folder will not go', async () => {
    vi.spyOn(fs, 'rm').mockRejectedValue(
      Object.assign(new Error('busy'), { code: 'EBUSY' }),
    )
    const kiss = { logger: logger() }
    await removeStaging(kiss, 'public.kiss-staging-1-a', 'discarded')
    expect(kiss.logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Could not remove the discarded staging folder public\.kiss-staging-1-a \(EBUSY\)/,
      ),
    )
  })
})
