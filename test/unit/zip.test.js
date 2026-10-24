import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import zlib from 'node:zlib'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zip } from '../../lib/zip.js'

const ZIP_URL = pathToFileURL(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../lib/zip.js',
  ),
).href

const entries = () => [
  { name: 'tab-2/index.html', bytes: '<p>two</p>' },
  {
    name: 'imsmanifest.xml',
    bytes: '<?xml version="1.0" encoding="UTF-8"?><manifest/>',
  },
  { name: 'tab-1/index.html', bytes: Buffer.from('<p>one</p>') },
]

// Reads the zip's own structures back, so each field the format promises can be checked.
function readZip(buf) {
  const eocd = buf.length - 22
  expect(buf.readUInt32LE(eocd)).toBe(0x06054b50)
  const count = buf.readUInt16LE(eocd + 10)
  const cdSize = buf.readUInt32LE(eocd + 12)
  const cdOffset = buf.readUInt32LE(eocd + 16)
  const out = {
    count,
    cdSize,
    cdOffset,
    commentLength: buf.readUInt16LE(eocd + 20),
    central: [],
    local: [],
  }
  let at = cdOffset
  for (let i = 0; i < count; i++) {
    const nameLength = buf.readUInt16LE(at + 28)
    const c = {
      signature: buf.readUInt32LE(at),
      madeBy: buf.readUInt16LE(at + 4),
      needed: buf.readUInt16LE(at + 6),
      flags: buf.readUInt16LE(at + 8),
      method: buf.readUInt16LE(at + 10),
      time: buf.readUInt16LE(at + 12),
      date: buf.readUInt16LE(at + 14),
      crc: buf.readUInt32LE(at + 16),
      compressed: buf.readUInt32LE(at + 20),
      size: buf.readUInt32LE(at + 24),
      extra: buf.readUInt16LE(at + 30),
      comment: buf.readUInt16LE(at + 32),
      internal: buf.readUInt16LE(at + 36),
      external: buf.readUInt32LE(at + 38),
      offset: buf.readUInt32LE(at + 42),
      name: buf.subarray(at + 46, at + 46 + nameLength).toString('utf8'),
    }
    out.central.push(c)
    const l = c.offset
    const localNameLength = buf.readUInt16LE(l + 26)
    const localExtra = buf.readUInt16LE(l + 28)
    const dataStart = l + 30 + localNameLength + localExtra
    out.local.push({
      signature: buf.readUInt32LE(l),
      needed: buf.readUInt16LE(l + 4),
      flags: buf.readUInt16LE(l + 6),
      method: buf.readUInt16LE(l + 8),
      time: buf.readUInt16LE(l + 10),
      date: buf.readUInt16LE(l + 12),
      crc: buf.readUInt32LE(l + 14),
      compressed: buf.readUInt32LE(l + 18),
      size: buf.readUInt32LE(l + 22),
      extra: localExtra,
      name: buf.subarray(l + 30, l + 30 + localNameLength).toString('utf8'),
      data: buf.subarray(dataStart, dataStart + buf.readUInt32LE(l + 18)),
    })
    at += 46 + nameLength + c.extra + c.comment
  }
  return out
}

describe('zip', () => {
  it('gives the same bytes for the same entries, in any order', () => {
    const a = zip(entries())
    const b = zip(entries().reverse())
    expect(Buffer.compare(a, b)).toBe(0)
  })

  it('gives the same bytes in a second process', () => {
    const script = `import { zip } from ${JSON.stringify(ZIP_URL)}
import { createHash } from 'node:crypto'
const b = zip(${JSON.stringify(entries().map((e) => ({ name: e.name, bytes: String(e.bytes) })))})
process.stdout.write(createHash('sha1').update(b).digest('hex'))`
    const run = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', script],
      { encoding: 'utf8' },
    )
    expect(run.status, run.stderr).toBe(0)
    expect(run.stdout).toBe(
      createHash('sha1').update(zip(entries())).digest('hex'),
    )
  })

  it('stores every entry, in name order, with the fixed fields the format promises', () => {
    const z = readZip(zip(entries()))
    expect(z.count).toBe(3)
    expect(z.commentLength).toBe(0)
    expect(z.central.map((c) => c.name)).toEqual([
      'imsmanifest.xml',
      'tab-1/index.html',
      'tab-2/index.html',
    ])
    for (const [i, c] of z.central.entries()) {
      const l = z.local[i]
      const bytes = Buffer.from(
        String(entries().find((e) => e.name === c.name).bytes),
      )
      expect(c.signature).toBe(0x02014b50)
      expect(l.signature).toBe(0x04034b50)
      // "Version made by": host 0 (MS-DOS) in the high byte, so external attributes 0 mean nothing to Unix.
      expect(c.madeBy >> 8).toBe(0)
      expect([c.needed, l.needed]).toEqual([10, 10])
      expect([c.flags, l.flags]).toEqual([0x0800, 0x0800])
      expect([c.method, l.method]).toEqual([0, 0])
      expect([c.time, l.time]).toEqual([0, 0])
      expect([c.date, l.date]).toEqual([0x0021, 0x0021])
      expect([c.extra, l.extra, c.comment, c.internal, c.external]).toEqual([
        0, 0, 0, 0, 0,
      ])
      expect(c.crc).toBe(zlib.crc32(bytes))
      expect(l.crc).toBe(c.crc)
      expect([c.size, c.compressed, l.size, l.compressed]).toEqual(
        Array(4).fill(bytes.length),
      )
      expect(l.name).toBe(c.name)
      expect(Buffer.compare(l.data, bytes)).toBe(0)
    }
  })

  it('writes names as UTF-8 and has no directory entries', () => {
    const z = readZip(zip([{ name: 'leçons/café.html', bytes: 'x' }]))
    expect(z.central.map((c) => c.name)).toEqual(['leçons/café.html'])
  })

  it('writes an empty zip as its end record alone', () => {
    const b = zip([])
    expect(b.length).toBe(22)
    expect(readZip(b).count).toBe(0)
  })

  it('refuses a name that could escape the folder it is extracted into, or two entries with one name', () => {
    for (const name of [
      '',
      '/abs.html',
      'a\\b.html',
      '../up.html',
      'a/../b.html',
      'a//b.html',
      'dir/',
    ])
      expect(() => zip([{ name, bytes: 'x' }]), name).toThrow(/name/)
    expect(() =>
      zip([
        { name: 'a.html', bytes: 'x' },
        { name: 'a.html', bytes: 'y' },
      ]),
    ).toThrow(/twice/)
  })
})

// An independent reader: Python's zipfile checks every CRC (testzip) and reads every entry back.
const python = ['python3', 'python'].find(
  (cmd) => spawnSync(cmd, ['--version']).status === 0,
)

describe.skipIf(!python)('zip, read by an independent reader', () => {
  it('is read back entry for entry by Python’s zipfile, every CRC checked', () => {
    const file = path.join(os.tmpdir(), `kiss-zip-${randomUUID()}.zip`)
    fs.writeFileSync(
      file,
      zip([...entries(), { name: 'leçons/café.html', bytes: 'é' }]),
    )
    try {
      const read = spawnSync(
        python,
        [
          '-c',
          [
            'import json, sys, zipfile',
            'z = zipfile.ZipFile(sys.argv[1])',
            'assert z.testzip() is None',
            'print(json.dumps({i.filename: z.read(i).decode("utf-8") for i in z.infolist()}))',
          ].join('\n'),
          file,
        ],
        { encoding: 'utf8' },
      )
      expect(read.status, read.stderr).toBe(0)
      expect(JSON.parse(read.stdout)).toEqual({
        'imsmanifest.xml': '<?xml version="1.0" encoding="UTF-8"?><manifest/>',
        'leçons/café.html': 'é',
        'tab-1/index.html': '<p>one</p>',
        'tab-2/index.html': '<p>two</p>',
      })
    } finally {
      fs.rmSync(file, { force: true })
    }
  })
})
