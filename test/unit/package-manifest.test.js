import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { parseDocument, DomUtils } from 'htmlparser2'
import { renderManifest, xmlId } from '../../lib/package-manifest.js'

const members = () => [
  {
    id: 'lessons/one/clinical-science',
    title: 'Tab 1 — Clinical science',
    href: 'tab-1/index.html',
    files: ['tab-1/index.html', 'css/site.css'],
  },
  {
    id: 'lessons/one/clinical-reasoning',
    title: 'Tab 2 — Clinical reasoning',
    href: 'tab-2/index.html',
    files: ['tab-2/index.html'],
  },
]
const pkg = (over = {}) => ({
  id: 'm2-acute',
  title: 'M2 L1 · Acute care',
  format: 'imscp',
  members: members(),
  ...over,
})

const doc = (xml) => parseDocument(xml, { xmlMode: true })
const all = (xml, name) => DomUtils.getElementsByTagName(name, doc(xml), true)
const attr = (el, name) => el.attribs[name]
const text = (el) => DomUtils.textContent(el)
// An element's direct children of one name (getElementsByTagName with recurse false tests the element itself).
const children = (el, name) =>
  DomUtils.getChildren(el).filter((n) => n.name === name)
const NCNAME = /^[A-Za-z_][A-Za-z0-9_.-]*$/

describe('renderManifest', () => {
  for (const format of ['imscp', 'scorm12'])
    describe(format, () => {
      it('is the same text for the same package', () => {
        expect(renderManifest(pkg({ format }))).toBe(
          renderManifest(pkg({ format })),
        )
      })

      it('starts with the UTF-8 declaration and has one organization, the default, titled', () => {
        const xml = renderManifest(pkg({ format }))
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(
          true,
        )
        const orgs = all(xml, 'organization')
        expect(orgs).toHaveLength(1)
        expect(attr(all(xml, 'organizations')[0], 'default')).toBe(
          attr(orgs[0], 'identifier'),
        )
        expect(text(children(orgs[0], 'title')[0])).toBe('M2 L1 · Acute care')
      })

      it('lists the members in the order given, each item pointing at its own resource with its files', () => {
        const xml = renderManifest(pkg({ format }))
        const items = all(xml, 'item')
        const resources = all(xml, 'resource')
        expect(items.map((i) => text(children(i, 'title')[0]))).toEqual([
          'Tab 1 — Clinical science',
          'Tab 2 — Clinical reasoning',
        ])
        expect(items.map((i) => attr(i, 'identifierref'))).toEqual(
          resources.map((r) => attr(r, 'identifier')),
        )
        expect(resources.map((r) => attr(r, 'href'))).toEqual([
          'tab-1/index.html',
          'tab-2/index.html',
        ])
        expect(resources.map((r) => attr(r, 'type'))).toEqual([
          'webcontent',
          'webcontent',
        ])
        expect(
          resources.map((r) => children(r, 'file').map((f) => attr(f, 'href'))),
        ).toEqual([['tab-1/index.html', 'css/site.css'], ['tab-2/index.html']])
      })

      it('gives every identifier a prefix, a valid XML ID, unique in the document', () => {
        const ids = all(renderManifest(pkg({ format })), '*')
          .map((el) => attr(el, 'identifier'))
          .filter(Boolean)
        expect(ids.every((id) => NCNAME.test(id))).toBe(true)
        expect(new Set(ids).size).toBe(ids.length)
        expect(ids.filter((id) => id.startsWith('MANIFEST-'))).toHaveLength(1)
        expect(ids.filter((id) => id.startsWith('ORG-'))).toHaveLength(1)
        expect(ids.filter((id) => id.startsWith('ITEM-'))).toHaveLength(2)
        expect(ids.filter((id) => id.startsWith('RES-'))).toHaveLength(2)
      })

      it('keeps a page’s identifiers when only its path changes, so an LMS keeps its learners’ records', () => {
        const moved = members().map((m) => ({
          ...m,
          href: `moved/${m.href}`,
          files: m.files.map((f) => `moved/${f}`),
        }))
        const ids = (xml) =>
          all(xml, '*')
            .map((el) => attr(el, 'identifier'))
            .filter(Boolean)
        expect(ids(renderManifest(pkg({ format, members: moved })))).toEqual(
          ids(renderManifest(pkg({ format }))),
        )
      })

      it('escapes & < > " and \' in every title', () => {
        const xml = renderManifest(pkg({ format, title: `A & B <C> "D" 'E'` }))
        expect(xml).toContain(
          '<title>A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;</title>',
        )
      })

      it('groups members by section under an item with no resource', () => {
        const sectioned = members().map((m, i) => ({
          ...m,
          section: i === 0 ? 'Lesson 1' : 'Lesson 2',
        }))
        const xml = renderManifest(pkg({ format, members: sectioned }))
        const org = all(xml, 'organization')[0]
        const top = DomUtils.getChildren(org).filter((n) => n.name === 'item')
        expect(top.map((i) => attr(i, 'identifierref'))).toEqual([
          undefined,
          undefined,
        ])
        expect(top.map((i) => text(children(i, 'title')[0]))).toEqual([
          'Lesson 1',
          'Lesson 2',
        ])
        expect(
          top.map(
            (i) =>
              DomUtils.getChildren(i).filter((n) => n.name === 'item').length,
          ),
        ).toEqual([1, 1])
      })

      it('percent-encodes an href that is not plain ASCII, segment by segment', () => {
        const xml = renderManifest(
          pkg({
            format,
            members: [
              {
                id: 'p',
                title: 'P',
                href: 'leçons/a b.html',
                files: ['leçons/a b.html'],
              },
            ],
          }),
        )
        expect(attr(all(xml, 'resource')[0], 'href')).toBe(
          'le%C3%A7ons/a%20b.html',
        )
      })
    })

  it('writes IMS CP 1.1 in its namespace, with version 1.1 and no SCORM', () => {
    const xml = renderManifest(pkg({ format: 'imscp' }))
    const manifest = all(xml, 'manifest')[0]
    expect(attr(manifest, 'xmlns')).toBe(
      'http://www.imsglobal.org/xsd/imscp_v1p1',
    )
    expect(attr(manifest, 'version')).toBe('1.1')
    expect(xml).not.toContain('adlcp')
    expect(all(xml, 'metadata')).toHaveLength(0)
  })

  it('writes SCORM 1.2 in its namespaces, metadata first, every page a SCO', () => {
    const xml = renderManifest(pkg({ format: 'scorm12' }))
    const manifest = all(xml, 'manifest')[0]
    expect(attr(manifest, 'xmlns')).toBe(
      'http://www.imsproject.org/xsd/imscp_rootv1p1p2',
    )
    expect(attr(manifest, 'xmlns:adlcp')).toBe(
      'http://www.adlnet.org/xsd/adlcp_rootv1p2',
    )
    const first = DomUtils.getChildren(manifest).find((n) => n.type === 'tag')
    expect(first.name).toBe('metadata')
    expect(text(children(first, 'schema')[0])).toBe('ADL SCORM')
    expect(text(children(first, 'schemaversion')[0])).toBe('1.2')
    expect(all(xml, 'resource').map((r) => attr(r, 'adlcp:scormtype'))).toEqual(
      ['sco', 'sco'],
    )
  })

  it('refuses a format it does not know', () => {
    expect(() => renderManifest(pkg({ format: 'scorm2004' }))).toThrow(/format/)
  })
})

describe('xmlId', () => {
  it('keeps a raw id that is already a valid XML ID, after its prefix', () => {
    expect(xmlId('ITEM-', 'clinical-science')).toBe('ITEM-clinical-science')
    expect(xmlId('RES-', 'l1_tab.2')).toBe('RES-l1_tab.2')
  })

  it('cleans any other raw id, and adds a hash of the raw id', () => {
    expect(xmlId('ITEM-', 'lessons/one/clinical-science')).toMatch(
      /^ITEM-lessons-one-clinical-science-[0-9a-f]{8}$/,
    )
    for (const raw of ['café crème', '-edge-', '/', ''])
      expect(xmlId('RES-', raw)).toMatch(NCNAME)
  })

  it('gives each raw id one identifier, whatever other ids there are and in whatever order', () => {
    const raws = ['a/b', 'a-b', 'a b', 'a_b', 'a//b']
    const alone = raws.map((r) => xmlId('ITEM-', r))
    expect(new Set(alone).size).toBe(raws.length)
    const used = new Set()
    const reversed = [...raws].reverse().map((r) => xmlId('ITEM-', r, used))
    expect(reversed.reverse()).toEqual(alone)
    // Removing one leaves the others as they were.
    const fewer = new Set()
    expect(raws.slice(1).map((r) => xmlId('ITEM-', r, fewer))).toEqual(
      alone.slice(1),
    )
  })
})

// A strict parser: Python's xml.etree refuses malformed XML and resolves the namespaces.
const python = ['python3', 'python'].find(
  (cmd) => spawnSync(cmd, ['--version']).status === 0,
)

describe.skipIf(!python)('renderManifest, read by a strict XML parser', () => {
  for (const format of ['imscp', 'scorm12'])
    it(`is well-formed ${format}, its elements in the right namespaces`, () => {
      const xml = renderManifest(pkg({ format, title: `A & B <C>` }))
      const read = spawnSync(
        python,
        [
          '-c',
          [
            'import json, sys, xml.etree.ElementTree as ET',
            'root = ET.fromstring(sys.stdin.buffer.read())',
            'print(json.dumps({"root": root.tag, "tags": sorted({e.tag for e in root.iter()})}))',
          ].join('\n'),
        ],
        { input: xml, encoding: 'utf8' },
      )
      expect(read.status, read.stderr).toBe(0)
      const ns =
        format === 'imscp'
          ? '{http://www.imsglobal.org/xsd/imscp_v1p1}'
          : '{http://www.imsproject.org/xsd/imscp_rootv1p1p2}'
      const { root, tags } = JSON.parse(read.stdout)
      expect(root).toBe(`${ns}manifest`)
      expect(tags.every((t) => t.startsWith(ns))).toBe(true)
    })
})
