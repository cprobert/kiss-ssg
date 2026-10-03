import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import {
  builtAssetPath,
  handleChange,
  reload,
  requestRebuild,
  requestReplay,
  runRebuildQueue,
} from '../../lib/rebuild.js'

const silent = () => ({ info: vi.fn(), notice: vi.fn(), debug: vi.fn() })

describe('the rebuild queue', () => {
  // The queue state, with the run itself stubbed out: these tests are about
  // what is requested, not about rebuilding.
  const queue = () => {
    const kiss = {
      _pendingReplay: false,
      _pendingTargets: new Set(),
      _pendingAssets: new Map(),
      _rebuildInFlight: null,
      _closing: false,
    }
    kiss._runRebuildQueue = vi.fn(() => 'queued')
    return kiss
  }

  it('a replay supersedes every scoped target', () => {
    const kiss = queue()
    kiss._pendingTargets.add('a')
    expect(requestReplay(kiss)).toBe('queued')
    expect(kiss._pendingReplay).toBe(true)
    expect(kiss._pendingTargets.size).toBe(0)
  })

  it('a scoped request is dropped while a replay is pending, and kept otherwise', () => {
    const kiss = queue()
    requestRebuild(kiss, ['a'])
    expect([...kiss._pendingTargets]).toEqual(['a'])
    kiss._pendingReplay = true
    requestRebuild(kiss, ['b'])
    expect([...kiss._pendingTargets]).toEqual(['a'])
  })

  it('hands back the run in flight rather than starting a second', () => {
    const inFlight = Promise.resolve()
    const kiss = { _rebuildInFlight: inFlight, _pendingReplay: true }
    expect(runRebuildQueue(kiss)).toBe(inFlight)
  })

  it('starts nothing once closing, or with nothing pending', async () => {
    const pending = () => ({
      _rebuildInFlight: null,
      _closing: false,
      _pendingReplay: false,
      _pendingTargets: new Set(),
      _pendingAssets: new Map(),
    })
    const closing = { ...pending(), _closing: true, _pendingReplay: true }
    await runRebuildQueue(closing)
    expect(closing._rebuildInFlight).toBe(null)
    const idle = pending()
    await runRebuildQueue(idle)
    expect(idle._rebuildInFlight).toBe(null)
  })
})

describe('handleChange', () => {
  const site = () => {
    const page = {
      view: 'about.hbs',
      buildTo: 'public/about.html',
      page: { view: 'about.hbs' },
    }
    const kiss = {
      config: {
        folders: {
          pages: 'src/pages',
          partials: 'src/partials',
          layouts: 'src/layouts',
          models: 'src/models',
          controllers: 'src/controllers',
          helpers: 'helpers',
        },
      },
      logger: silent(),
      _stack: [page],
      _rebuildInFlight: null,
      _requestReplay: vi.fn(),
      _requestRebuild: vi.fn(),
    }
    return { kiss, page }
  }

  it('replays for anything new, and for a deleted page view', () => {
    const { kiss } = site()
    handleChange(kiss, 'add', 'src/pages/new.hbs')
    handleChange(kiss, 'unlink', 'src/pages/about.hbs')
    expect(kiss._requestReplay).toHaveBeenCalledTimes(2)
    expect(kiss._requestRebuild).not.toHaveBeenCalled()
  })

  it('re-renders only the matching page for an edit to its view', () => {
    const { kiss, page } = site()
    handleChange(kiss, 'change', 'src/pages/about.hbs')
    expect(kiss._requestRebuild).toHaveBeenCalledWith([page])
    expect(kiss._requestReplay).not.toHaveBeenCalled()
  })

  it('replays for a model edit, without asking for a restart', () => {
    const { kiss } = site()
    handleChange(kiss, 'change', 'src/models/about.json')
    expect(kiss._requestReplay).toHaveBeenCalledTimes(1)
    expect(kiss.logger.notice).not.toHaveBeenCalledWith(
      expect.stringMatching(/restart/),
    )
  })

  it('says a module the script imports needs a restart', () => {
    const { kiss } = site()
    handleChange(kiss, 'change', 'src/lib/format.js')
    expect(kiss._requestReplay).toHaveBeenCalledTimes(1)
    expect(kiss.logger.notice).toHaveBeenCalledWith(
      expect.stringMatching(/restart to pick the change up/),
    )
  })
})

describe('builtAssetPath', () => {
  const instance = (lookup = () => undefined) => ({
    _defaultAssetCopy: {
      sourceDir: path.resolve('/site/src/assets'),
      targetDir: path.resolve('/site/public'),
      directory: path.resolve('/site'),
    },
    _assetManifest: { lookup },
  })

  it('names the built file, with a stylesheet compiled to .css', () => {
    expect(builtAssetPath(instance(), 'src/assets/css/site.scss')).toBe(
      path.resolve('/site/public/css/site.css'),
    )
    expect(builtAssetPath(instance(), 'src/assets/img/logo.png')).toBe(
      path.resolve('/site/public/img/logo.png'),
    )
  })

  it('names the hashed file under a renaming policy', () => {
    const kiss = instance((name) =>
      name === 'css/site.css' ? 'css/site.a1b2c3d4.css' : undefined,
    )
    expect(builtAssetPath(kiss, 'src/assets/css/site.scss')).toBe(
      path.resolve('/site/public/css/site.a1b2c3d4.css'),
    )
  })

  it('is the root when there is no asset copy to name', () => {
    expect(
      builtAssetPath({ _defaultAssetCopy: { sourceDir: null } }, 'x.css'),
    ).toBe('/')
  })
})

describe('reload', () => {
  it('does nothing without a dev server, and never throws for a dead socket', () => {
    expect(() => reload({ _devServer: null, logger: silent() })).not.toThrow()
    const refresh = vi.fn(() => {
      throw new Error('socket gone')
    })
    const kiss = { _devServer: { refresh }, logger: silent() }
    expect(() => reload(kiss)).not.toThrow()
    expect(refresh).toHaveBeenCalledWith('/')
    expect(kiss.logger.debug).toHaveBeenCalled()
  })
})
