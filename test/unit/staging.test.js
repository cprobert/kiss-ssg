import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  removeStaging,
  renameForPromote,
  stagedPath,
  stagingLogger,
  stagingSiblings,
  sweepStaleSiblings,
  toReportedPath,
  unstageText,
  writeConfig,
  writeRoot,
} from '../../lib/staging.js'
import { reportedPath } from '../../lib/build-report.js'

// a1k9training's build log printed `./docs.kiss-staging-41508-olwws7/_redirects`:
// every writer logs the file it wrote, and under staging that is the sibling.
describe('unstageText and stagingLogger', () => {
  const build = './docs'
  const { stagingDir } = stagingSiblings(build)

  it.each([
    ['as stagingSiblings made it', `${stagingDir}/_redirects`],
    ['as path.join writes it', path.join(stagingDir, 'sitemap.xml')],
    ['absolute', path.resolve(stagingDir, 'robots.txt')],
  ])('writes the build folder back, %s', (_label, file) => {
    const out = unstageText(`wrote ${file}`, stagingDir, build)
    expect(out).not.toContain('kiss-staging')
    expect(out.startsWith('wrote ./docs')).toBe(true)
  })

  it('leaves a longer sibling name and other text alone', () => {
    const text = `${stagingDir}x/a and docs/b`
    expect(unstageText(text, stagingDir, build)).toBe(text)
  })

  it('leaves the staging folder named on its own, for a message about it', () => {
    const text = `Could not remove ${path.resolve(stagingDir)} (EBUSY) — delete it by hand`
    expect(unstageText(text, stagingDir, build)).toBe(text)
  })

  it('writes a build folder holding $& or $$ as text', () => {
    const odd = './$&-$$'
    const { stagingDir: oddStaging } = stagingSiblings(odd)
    expect(unstageText(path.join(oddStaging, 'css'), oddStaging, odd)).toBe(
      `${odd}/css`,
    )
  })

  // The second review (2026-11-08): the log and the report named one file
  // two ways (`./docs\x\y.html` against `./docs/x/y.html`).
  it('names a file exactly as the report does, in every spelling', () => {
    for (const file of [
      path.join(stagingDir, 'x', 'y.html'),
      path.resolve(stagingDir, 'x', 'y.html'),
      `${stagingDir}/x/y.html`,
    ])
      expect(unstageText(`wrote ${file}`, stagingDir, build)).toBe(
        `wrote ${reportedPath(file, build, stagingDir)}`,
      )
    expect(
      unstageText(path.join(stagingDir, 'x', 'y.html'), stagingDir, build),
    ).toBe('./docs/x/y.html')
  })

  it.skipIf(process.platform === 'win32')(
    'leaves a \\ after the folder alone where it is a file name character',
    () => {
      const text = `${stagingDir}\\notes`
      expect(unstageText(text, stagingDir, build)).toBe(text)
    },
  )

  it('maps success and info only: warn, error and debug keep the real path', () => {
    const base = { info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
    const kiss = { _stagingDir: stagingDir, _buildTarget: build }
    const log = stagingLogger(base, kiss)
    const file = path.join(stagingDir, 'images')
    log.info(file)
    log.warn(`could not remove ${file}`)
    log.debug(`ENOTEMPTY ${file}`)
    expect(base.info).toHaveBeenLastCalledWith('./docs/images')
    expect(base.warn).toHaveBeenLastCalledWith(`could not remove ${file}`)
    expect(base.debug).toHaveBeenLastCalledWith(`ENOTEMPTY ${file}`)
    expect(log.info).toBe(log.info)
    expect(log.warn).toBe(log.warn)
  })

  it('runs every method on the site logger itself, so private fields work', () => {
    class Logger {
      #lines = []
      warn(m) {
        this.#lines.push(m)
      }
      info(m) {
        this.#lines.push(m)
      }
      get lines() {
        return this.#lines
      }
    }
    const site = new Logger()
    const log = stagingLogger(site, {
      _stagingDir: stagingDir,
      _buildTarget: build,
    })
    log.warn('w')
    log.info(path.join(stagingDir, 'a'))
    expect(site.lines).toEqual(['w', './docs/a'])
  })

  // The third review (2026-11-08): a Proxy's get must return a read-only,
  // non-configurable property's own value, so a frozen logger threw on its
  // first call.
  // A Proxy must return a frozen method as it is, so a frozen logger works
  // but is not mapped: the cost of keeping the Proxy over the logger itself,
  // which the fourth review showed spies and Object.keys depend on.
  it('works with a frozen logger, passing its lines through as written', () => {
    const lines = []
    const site = Object.freeze({
      info: (m) => lines.push(m),
      warn: (m) => lines.push(m),
    })
    const log = stagingLogger(site, {
      _stagingDir: stagingDir,
      _buildTarget: build,
    })
    log.info(path.join(stagingDir, 'a'))
    log.warn('w')
    expect(lines).toEqual([path.join(stagingDir, 'a'), 'w'])
  })

  // The fourth review: over an empty object, the Proxy ignored a spy and
  // hid the logger's own keys and class.
  it('looks like the site logger: a spy is reached, keys and class are its own', () => {
    class SiteLogger {
      info() {}
      warn() {}
    }
    const site = new SiteLogger()
    const log = stagingLogger(site, {
      _stagingDir: stagingDir,
      _buildTarget: build,
    })
    const spy = vi.spyOn(log, 'warn')
    log.warn('w')
    expect(spy).toHaveBeenCalledWith('w')
    expect(log instanceof SiteLogger).toBe(true)
    const plain = { info() {}, warn() {} }
    expect(Object.keys(stagingLogger(plain, {}))).toEqual(['info', 'warn'])
  })

  it('leaves the staging folder named with a trailing separator alone', () => {
    for (const sep of ['/', path.sep]) {
      const text = `could not remove ${stagingDir}${sep}, delete it by hand`
      expect(unstageText(text, stagingDir, build)).toBe(text)
    }
  })

  // The fourth review: a build folder configured as `docs` (no `./`) and a
  // writer that logs `./<path>` left the staging name in the log.
  it('maps a ./ spelling of a folder configured without one', () => {
    const { stagingDir: bare } = stagingSiblings('docs')
    expect(unstageText(`wrote ./${bare}/x.html`, bare, 'docs')).toBe(
      'wrote docs/x.html',
    )
  })

  it('never maps a match that starts partway through a longer path', () => {
    const text = `/elsewhere/${path.basename(stagingDir)}/x.html`
    expect(unstageText(text, stagingDir, build)).toBe(text)
  })

  it.runIf(process.platform === 'win32')(
    'reads a Windows path in any case, as Windows does',
    () => {
      const abs = path.resolve(stagingDir, 'x.html')
      const lower = abs[0].toLowerCase() + abs.slice(1)
      expect(unstageText(`wrote ${lower}`, stagingDir, build)).toBe(
        'wrote ./docs/x.html',
      )
    },
  )

  it('maps strings only while a build is staged', () => {
    const base = { success: vi.fn(), level: 3 }
    const kiss = { _stagingDir: stagingDir, _buildTarget: build }
    const log = stagingLogger(base, kiss)
    log.success(path.join(stagingDir, '_redirects'), 42)
    expect(base.success).toHaveBeenLastCalledWith('./docs/_redirects', 42)
    expect(log.level).toBe(3)
    kiss._stagingDir = null
    log.success(path.join(stagingDir, '_redirects'))
    expect(base.success).toHaveBeenLastCalledWith(
      path.join(stagingDir, '_redirects'),
    )
  })
})

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

  // The third review: one rule for "inside the build folder", the one
  // reportedPath uses, so on Windows a target in another case still follows
  // the build into staging rather than being lost at the promotion.
  it.runIf(process.platform === 'win32')(
    'moves a target spelled in another case on Windows',
    () => {
      const win = {
        _stagingDir: 'C:\\site\\public.kiss-staging',
        _buildTarget: 'C:\\site\\public',
      }
      expect(stagedPath(win, 'c:\\SITE\\public\\css')).toBe(
        path.join('C:\\site\\public.kiss-staging', 'css'),
      )
    },
  )

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
