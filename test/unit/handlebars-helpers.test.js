import { describe, it, expect, beforeEach } from 'vitest'
import Handlebars from 'handlebars'
import { Remarkable } from 'remarkable'
import { registerHandlebarsHelpers } from '../../lib/handlebars-helpers.js'
import { silentLogger } from '../../lib/logger.js'

let hbs
const render = (src, ctx = {}) => hbs.compile(src)(ctx)

beforeEach(() => {
  hbs = Handlebars.create()
  registerHandlebarsHelpers(
    hbs,
    { dev: false, sass: { includePaths: [] } },
    {
      markdown: new Remarkable({ html: true, xhtmlOut: true, breaks: true }),
      logger: silentLogger,
    },
  )
})

describe('markdown', () => {
  it('renders a block and an inline string', () => {
    expect(render('{{#markdown}}# Hi{{/markdown}}')).toContain('<h1>Hi</h1>')
    expect(render('{{markdown text}}', { text: '**b**' })).toContain(
      '<strong>b</strong>',
    )
  })
})

describe('sass', () => {
  it('compiles an inline block', () => {
    expect(render('{{#sass}}$c: red; a { color: $c }{{/sass}}')).toContain(
      'color: red',
    )
  })
})

describe('offset and stringify', () => {
  it('offset adds one; stringify pretty-prints', () => {
    expect(render('{{offset i}}', { i: 0 })).toBe('1')
    expect(render('{{{stringify o}}}', { o: { a: 1 } })).toBe(
      JSON.stringify({ a: 1 }, null, 3),
    )
  })
})

describe('isActive', () => {
  const tpl = '{{#isActive page href=href}}[{{active}}]{{/isActive}}'
  it('matches the page URL exactly, treating index as /', () => {
    expect(
      render(tpl, { page: { pageURL: 'about.html' }, href: '/about' }),
    ).toBe('[active]')
    expect(render(tpl, { page: { pageURL: 'index.html' }, href: '/' })).toBe(
      '[active]',
    )
    expect(
      render(tpl, { page: { pageURL: 'about.html' }, href: '/contact' }),
    ).toBe('[]')
  })
  it('matches by folder when folderMatch is set', () => {
    const t =
      '{{#isActive page href="/docs" folderMatch=true}}[{{active}}]{{/isActive}}'
    expect(render(t, { page: { pageURL: 'docs/intro.html' } })).toBe('[active]')
  })
})

describe('env', () => {
  it('chooses the branch by config.dev', () => {
    expect(render('{{#env is="prod"}}P{{else}}D{{/env}}')).toBe('P')
    const dev = Handlebars.create()
    registerHandlebarsHelpers(
      dev,
      { dev: true, sass: { includePaths: [] } },
      {
        markdown: new Remarkable(),
        logger: silentLogger,
      },
    )
    expect(dev.compile('{{#env is="dev"}}D{{else}}P{{/env}}')({})).toBe('D')
  })
})
