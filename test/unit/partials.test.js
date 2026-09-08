import { describe, it, expect, afterEach } from 'vitest'
import Handlebars from 'handlebars'
import { Remarkable } from 'remarkable'
import layouts from 'handlebars-layouts'
import { registerPartials, partialNameFor } from '../../lib/partials.js'
import { DependencyGraph } from '../../lib/dependency-graph.js'
import { silentLogger } from '../../lib/logger.js'
import fs from 'fs-extra'
import { makeSite } from '../helpers/site.js'

const deps = { markdown: new Remarkable(), logger: silentLogger }

let site
afterEach(async () => {
  if (site) await site.cleanup()
})

describe('registerPartials', () => {
  it('registers hbs, html and md partials by path-derived name, and layouts', async () => {
    site = await makeSite({
      'src/partials/nav.hbs': '<nav/>',
      'src/partials/layout/footer.html': '<footer/>',
      'src/partials/note.md': '# Note',
      'src/layouts/main.hbs': '<main/>',
    })
    const hbs = Handlebars.create()
    const names = registerPartials(
      hbs,
      {
        folders: {
          partials: `${site.src}/partials`,
          layouts: `${site.src}/layouts`,
        },
      },
      deps,
    )
    expect(names.sort()).toEqual(['layout/footer', 'main', 'nav', 'note'])
    expect(hbs.partials['note']({})).toContain('<h1>Note</h1>')
  })

  it('unregisters a name the previous pass produced and this one did not', async () => {
    site = await makeSite({
      'src/partials/keep.hbs': 'K',
      'src/partials/gone.hbs': 'G',
    })
    const hbs = Handlebars.create()
    const config = {
      folders: { partials: `${site.src}/partials`, layouts: null },
    }
    const first = registerPartials(hbs, config, deps)
    expect(first.sort()).toEqual(['gone', 'keep'])

    await fs.remove(`${site.src}/partials/gone.hbs`)
    const second = registerPartials(hbs, config, deps, first)
    expect(second).toEqual(['keep'])
    expect(Object.keys(hbs.partials)).toEqual(['keep'])
  })

  it('leaves every partial registered when nothing changed on disk', async () => {
    site = await makeSite({
      'src/partials/nav.hbs': '<nav/>',
      'src/partials/note.md': '# Note',
      'src/layouts/main.hbs': '<main/>',
    })
    const hbs = Handlebars.create()
    const config = {
      folders: {
        partials: `${site.src}/partials`,
        layouts: `${site.src}/layouts`,
      },
    }
    const first = registerPartials(hbs, config, deps)
    const second = registerPartials(hbs, config, deps, first)
    expect(second.sort()).toEqual(['main', 'nav', 'note'])
    expect(Object.keys(hbs.partials).sort()).toEqual(['main', 'nav', 'note'])
  })

  it('keeps the same collision winner when re-run', async () => {
    // foo.md and foo.hbs derive the same name; the hbs pass runs last and wins.
    // A re-run must not let the unregister sweep drop the surviving winner.
    site = await makeSite({
      'src/partials/foo.md': '# Markdown',
      'src/partials/foo.hbs': 'HBS',
    })
    const hbs = Handlebars.create()
    const config = {
      folders: { partials: `${site.src}/partials`, layouts: null },
    }
    const first = registerPartials(hbs, config, deps)
    expect(first).toEqual(['foo', 'foo'])
    expect(hbs.partials['foo']({})).toBe('HBS')

    const second = registerPartials(hbs, config, deps, first)
    expect(second).toEqual(['foo', 'foo'])
    expect(hbs.partials['foo']({})).toBe('HBS')
  })

  it('skips null folders', () => {
    const hbs = Handlebars.create()
    const names = registerPartials(
      hbs,
      { folders: { partials: null, layouts: null } },
      deps,
    )
    expect(names).toEqual([])
  })
})

// Every partial is registered compiled, which is what keeps a layout from being
// recompiled on every page render: `handlebars-layouts`' `extend` helper reads
// `handlebars.partials[name]` and compiles it when it finds a string, without
// ever writing the result back.
describe('partials are registered compiled', () => {
  const folders = (site) => ({
    folders: {
      partials: `${site.src}/partials`,
      layouts: `${site.src}/layouts`,
    },
  })

  it('registers every partial as a function', async () => {
    site = await makeSite({
      'src/partials/nav.hbs': '<nav/>',
      'src/partials/note.md': '# Note',
      'src/partials/raw.html': '<b>raw</b>',
      'src/layouts/main.hbs': '<main>{{#block "body"}}{{/block}}</main>',
    })
    const hbs = Handlebars.create()
    registerPartials(hbs, folders(site), deps)
    for (const name of ['main', 'nav', 'note', 'raw'])
      expect(typeof hbs.partials[name]).toBe('function')
    // Rendered output is what Handlebars would have produced from the string.
    expect(hbs.compile('{{> nav}}|{{> note}}|{{> raw}}')({})).toBe(
      '<nav/>|<h1>Note</h1>\n|<b>raw</b>',
    )
  })

  it('compiles a layout once however many pages render it', async () => {
    site = await makeSite({
      'src/layouts/main.hbs': '<main>{{name}}</main>',
    })
    const hbs = Handlebars.create()
    let compiles = 0
    const real = hbs.compile.bind(hbs)
    hbs.compile = (...a) => {
      compiles++
      return real(...a)
    }
    registerPartials(hbs, folders(site), deps)
    compiles = 0
    // Rendering through the registered layout many times must not recompile it.
    const layout = hbs.partials['main']
    for (let i = 0; i < 50; i++)
      expect(layout({ name: `p${i}` })).toContain(`p${i}`)
    expect(compiles).toBe(0)
  })

  // `hbs.compile` parses lazily, so registering eagerly moves no failure
  // earlier: a broken layout still registers quietly and still throws at
  // render, against the page that used it, exactly as before.
  it("does not move a broken layout's failure from render to registration", async () => {
    site = await makeSite({ 'src/layouts/broken.hbs': '{{#if}}unclosed' })
    const hbs = Handlebars.create()
    expect(() => registerPartials(hbs, folders(site), deps)).not.toThrow()
    expect(() => hbs.partials['broken']({})).toThrow()
  })
})

describe('tracing', () => {
  const folders = (site) => ({
    folders: {
      partials: `${site.src}/partials`,
      layouts: `${site.src}/layouts`,
    },
  })

  it('records the invoking page for direct, nested, dynamic and layout partials', async () => {
    site = await makeSite({
      'src/partials/inner.hbs': 'inner',
      'src/partials/outer.hbs': 'outer[{{> inner}}]',
      'src/layouts/main.hbs': '<L>{{#block "body"}}{{/block}}</L>',
    })
    const hbs = Handlebars.create()
    layouts.register(hbs)
    const graph = new DependencyGraph()
    registerPartials(hbs, folders(site), { ...deps, graph })
    const page = hbs.compile(
      '{{#extend "main"}}{{#content "body"}}{{> outer}} {{> (lookup this "dyn")}}{{#*inline "inl"}}i{{/inline}}{{> inl}}{{/content}}{{/extend}}',
    )
    const out = page({ dyn: 'inner' }, { data: { kissPage: 'about.html' } })
    expect(out).toBe('<L>outer[inner] inneri</L>')
    expect(graph.dependentsOf('main')).toEqual(['about.html'])
    expect(graph.dependentsOf('outer')).toEqual(['about.html'])
    expect(graph.dependentsOf('inner')).toEqual(['about.html'])
    expect(graph.dependentsOf('inl')).toBeNull()
  })

  it('records nothing, and still renders, without a graph or without a page id', async () => {
    site = await makeSite({ 'src/partials/nav.hbs': '<nav/>' })
    const hbs = Handlebars.create()
    registerPartials(hbs, folders(site), deps)
    expect(hbs.compile('{{> nav}}')({})).toBe('<nav/>')
    const graph = new DependencyGraph()
    registerPartials(hbs, folders(site), { ...deps, graph })
    expect(hbs.compile('{{> nav}}')({})).toBe('<nav/>')
    expect(graph.size).toBe(0)
  })

  it('records through a consumer helper only when it passes its data frame on', async () => {
    site = await makeSite({ 'src/partials/nav.hbs': '<nav/>' })
    const hbs = Handlebars.create()
    const graph = new DependencyGraph()
    registerPartials(hbs, folders(site), { ...deps, graph })
    hbs.registerHelper('render', function (name, ctx, options) {
      return new hbs.SafeString(hbs.partials[name](ctx, { data: options.data }))
    })
    hbs.registerHelper('renderBare', function (name, ctx) {
      return new hbs.SafeString(hbs.partials[name](ctx))
    })

    expect(
      hbs.compile('{{render "nav" this}}')(
        {},
        { data: { kissPage: 'a.html' } },
      ),
    ).toBe('<nav/>')
    expect(graph.dependentsOf('nav')).toEqual(['a.html'])

    expect(
      hbs.compile('{{renderBare "nav" this}}')(
        {},
        { data: { kissPage: 'b.html' } },
      ),
    ).toBe('<nav/>')
    expect(graph.dependentsOf('nav')).toEqual(['a.html'])
  })

  it('a throwing recorder never reaches the render', async () => {
    site = await makeSite({ 'src/partials/nav.hbs': '<nav/>' })
    const hbs = Handlebars.create()
    const graph = {
      record() {
        throw new Error('boom')
      },
    }
    registerPartials(hbs, folders(site), { ...deps, graph })
    expect(hbs.compile('{{> nav}}')({}, { data: { kissPage: 'x.html' } })).toBe(
      '<nav/>',
    )
  })
})

describe('partialNameFor', () => {
  const folders = {
    partials: '/site/src/partials',
    layouts: '/site/src/layouts',
  }

  it('derives the registered name from a file under the partials folder', () => {
    expect(partialNameFor('/site/src/partials/nav.hbs', folders)).toBe('nav')
    expect(partialNameFor('/site/src/partials/a/b.md', folders)).toBe('a/b')
    expect(partialNameFor('/site/src/partials/raw.html', folders)).toBe('raw')
  })

  it('derives a layout name the same way', () => {
    expect(partialNameFor('/site/src/layouts/main.hbs', folders)).toBe('main')
  })

  it('accepts a Windows path', () => {
    expect(partialNameFor('\\site\\src\\partials\\a\\b.hbs', folders)).toBe(
      'a/b',
    )
  })

  it('is null outside both folders, or when a folder is null', () => {
    expect(partialNameFor('/site/src/pages/x.hbs', folders)).toBeNull()
    expect(
      partialNameFor('/site/src/partials/nav.hbs', {
        partials: null,
        layouts: null,
      }),
    ).toBeNull()
  })
})
