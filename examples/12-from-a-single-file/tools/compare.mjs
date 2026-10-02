// Did the conversion change the page?
//
//   node router.js && node tools/compare.mjs
//
// The bar for a conversion is not "it builds" — it is "it looks like the
// input". This compares the artifact's <body> against the built page's by
// element sequence and by visible text, which is as close to that as anything
// short of opening both in a browser. It exits 1 on a difference, so it can go
// in a CI step; it is not part of the build.
//
// Run it BEFORE improving anything. Once the 404, the canonical and the
// og:image are in, a difference means something, and you want the baseline
// taken while the only edits were structural.
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseHtml, findTag } from 'kiss-ssg'

const root = path.resolve(import.meta.dirname, '..')
const original = await fs.readFile(
  path.join(root, 'source/original.html'),
  'utf8',
)
const built = await fs.readFile(path.join(root, 'public/index.html'), 'utf8')

// The script is inline in the artifact and an asset in the built site, and
// this comparison is about what a reader sees, so it is dropped from both.
const bodyOf = (html) => {
  const body = findTag(parseHtml(html), 'body')
  const keep = (nodes) =>
    nodes
      .filter((n) => !(n.type === 'element' && n.tag === 'script'))
      .map((n) => (n.children ? { ...n, children: keep(n.children) } : n))
  return keep(body?.children ?? [])
}

const tags = (nodes, out = []) => {
  for (const node of nodes) {
    if (node.type !== 'element') continue
    out.push(node.tag)
    tags(node.children ?? [], out)
  }
  return out
}

const text = (nodes, out = []) => {
  for (const node of nodes) {
    if (node.type === 'text' && node.text.trim()) out.push(node.text.trim())
    if (node.children) text(node.children, out)
  }
  return out
}

// Entities are decoded on both sides. Moving copy into a model means
// Handlebars escapes it on the way out — an apostrophe becomes `&#x27;` in the
// source and an apostrophe on screen — so comparing raw bytes would report a
// difference no reader can see. Decoding is the honest comparison. Reaching
// for a triple-stache to make the bytes match instead would turn escaping off,
// which is a different and much worse thing.
const decode = (s) =>
  s
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')

// The differences this conversion is KNOWN to introduce, declared one by one.
//
// Without this list the text comparison is useless: it would always report a
// difference (the address, below), so it could never exit non-zero, so a
// conversion that also mangled a paragraph would look exactly like a clean
// one. Naming each accepted difference is what turns "they differ" into "they
// differ in exactly the ways we chose", which is the only version worth
// running.
const ACCEPTED = [
  {
    why: 'the artifact spelled its own address two ways — "Unit 4, Mill Lane" in the Visit section, "Unit 4 Mill Lane" in the footer, 47 lines apart. Both read config.business now, so the built page says one of them twice.',
    apply: (s) => s.replace(/Unit 4,? Mill Lane/g, 'Unit 4 Mill Lane'),
  },
]

const flatten = (nodes) => {
  let out = decode(text(nodes).join(' ')).replace(/\s+/g, ' ')
  for (const { apply } of ACCEPTED) out = apply(out)
  return out
}

const before = bodyOf(original)
const after = bodyOf(built)
const [tagsBefore, tagsAfter] = [tags(before).join(','), tags(after).join(',')]
const [textBefore, textAfter] = [flatten(before), flatten(after)]

const report = (label, a, b, unit) => {
  const same = a === b
  console.log(`${label}: ${same ? 'identical' : 'DIFFERENT'}`)
  if (same) return true
  for (let i = 0; i < Math.max(a.length, b.length); i += 1)
    if (a[i] !== b[i]) {
      console.log(`  first difference at ${unit} ${i}`)
      console.log(`    artifact: …${a.slice(Math.max(0, i - 70), i + 70)}…`)
      console.log(`    built:    …${b.slice(Math.max(0, i - 70), i + 70)}…`)
      break
    }
  return false
}

const structureOk = report('Element sequence', tagsBefore, tagsAfter, 'element')
const textOk = report('Visible text', textBefore, textAfter, 'char')

console.log('\nAccepted differences, applied before comparing:')
for (const { why } of ACCEPTED) console.log(`  - ${why}`)

// Both must hold. A text difference is a failure like any other now that the
// expected one is declared above — which is the point of declaring it.
if (!structureOk || !textOk) process.exitCode = 1
