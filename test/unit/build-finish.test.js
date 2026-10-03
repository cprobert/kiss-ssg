import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'
import {
  lastBuildRecord,
  refreshReport,
  reportInputs,
  runAudit,
  runLinkCheck,
} from '../../lib/build-finish.js'

let temp
afterEach(async () => {
  if (temp) await fs.remove(temp)
  temp = null
})

const logger = () => ({ debug: vi.fn(), info: vi.fn(), notice: vi.fn() })

describe('reportInputs', () => {
  const instance = (fields) => ({
    config: { folders: { build: 'public' } },
    _stackForRecord: () => ['the stack as recorded'],
    _failures: [],
    _assetManifest: {},
    _outputs: { snapshot: () => [] },
    _checkMode: false,
    ...fields,
  })

  it('names the folder the author asked for, and the staging folder a promotion left', () => {
    const inputs = reportInputs(
      instance({
        _buildTarget: 'out',
        _stagingDir: null,
        _promotedFrom: 'out.kiss-staging-1-a',
      }),
    )
    expect(inputs.buildDir).toBe('out')
    expect(inputs.stagingDir).toBe('out.kiss-staging-1-a')
    expect(inputs.stack).toEqual(['the stack as recorded'])
  })

  it('falls back to config.folders.build and says which mode ran', () => {
    const inputs = reportInputs(instance({ _checkMode: true }))
    expect(inputs.buildDir).toBe('public')
    expect(inputs.mode).toBe('check')
  })
})

describe('refreshReport', () => {
  it('does nothing before a build has settled', () => {
    const kiss = { _report: null, _reportInputs: vi.fn() }
    refreshReport(kiss)
    expect(kiss._report).toBe(null)
    expect(kiss._reportInputs).not.toHaveBeenCalled()
  })
})

describe('runLinkCheck', () => {
  it('is skipped in dev and when config.links.check is off', () => {
    expect(
      runLinkCheck({
        _links: null,
        config: { dev: true, links: { check: true } },
      }),
    ).toBe(null)
    expect(
      runLinkCheck({
        _links: null,
        config: { dev: false, links: { check: false } },
      }),
    ).toBe(null)
  })

  it('returns the latched result rather than scanning twice', () => {
    const settled = { checked: 3, broken: [] }
    expect(runLinkCheck({ _links: settled, config: {} })).toBe(settled)
  })
})

describe('runAudit', () => {
  it('does not audit a failed build', () => {
    expect(
      runAudit({
        _audit: null,
        _failures: [{ view: 'x.hbs' }],
        config: { dev: false, audit: { check: true } },
      }),
    ).toBe(null)
  })
})

describe('lastBuildRecord', () => {
  it('is null with no knowledge-base folder, and with no record in it', async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-build-finish-'))
    expect(
      lastBuildRecord({
        config: { folders: { aikb: null } },
        logger: logger(),
      }),
    ).toBe(null)
    expect(
      lastBuildRecord({
        config: { folders: { aikb: temp } },
        logger: logger(),
      }),
    ).toBe(null)
  })

  it('is no baseline, rather than a failure, when the record cannot be read', async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-build-finish-'))
    await fs.outputFile(path.join(temp, 'last-build.json'), '{ not json')
    const kiss = { config: { folders: { aikb: temp } }, logger: logger() }
    expect(lastBuildRecord(kiss)).toBe(null)
    expect(kiss.logger.debug).toHaveBeenCalledWith(
      expect.stringMatching(/^Unreadable .*last-build\.json: /),
    )
  })

  it('reads the record the last aikb run wrote', async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-build-finish-'))
    const record = { ok: true, buildDir: 'public', pages: [] }
    await fs.outputJson(path.join(temp, 'last-build.json'), record)
    expect(
      lastBuildRecord({
        config: { folders: { aikb: temp } },
        logger: logger(),
      }),
    ).toEqual(record)
  })
})
