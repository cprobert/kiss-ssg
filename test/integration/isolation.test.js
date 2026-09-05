import { describe, it, expect, afterEach } from 'vitest'
import Kiss from '../helpers/kiss.js'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'

const sites = []
afterEach(async () => {
  while (sites.length) await sites.pop().cleanup()
})

describe('per-instance Handlebars', () => {
  it('does not leak partials or helpers between Kiss instances', async () => {
    const a = await makeSite({
      'src/partials/p.hbs': 'A',
      'src/pages/index.hbs': '{{> p}}',
    })
    const b = await makeSite({ 'src/pages/index.hbs': '{{> p}}' })
    sites.push(a, b)
    const ka = new Kiss({ folders: a.folders, logger: silentLogger })
    ka.handlebars.registerHelper('only', () => 'x')
    const kb = new Kiss({ folders: b.folders, logger: silentLogger })
    expect(ka.handlebars).not.toBe(kb.handlebars)
    expect(kb.handlebars.partials['p']).toBeUndefined()
    expect(kb.handlebars.helpers['only']).toBeUndefined()
    expect(typeof kb.handlebars.helpers['extend']).toBe('function') // handlebars-layouts applied per instance
    await ka.scan().generate().complete()
    expect(await a.read('public/index.html')).toBe('A')
  })
})
