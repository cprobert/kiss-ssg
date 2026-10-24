# zip.js

## Responsibility

A zip archive from a list of entries, byte-identical for the same entries on every machine. It is the container of a learning package (`planning/plans/2026-10-24-learning-packages.md`): an LMS such as Moodle imports one zip per lesson, and a course uploads only the packages whose bytes changed, so the bytes must depend on nothing but the files in them.

That rules out what makes most zips differ from run to run: the clock, the entry order a directory walk gives, the operating system's file attributes, and the compressor. So every entry is **stored**, not deflated. Node bundles Chromium's zlib, and raw deflate output is not promised to stay the same across zlib versions or CPU features; a stored entry is its own bytes. A lesson's pages are small, and an LMS unpacks the zip on upload, so the lost compression costs nothing a learner sees.

The module is pure: it takes entries and returns a `Buffer`. It reads no files, writes none, and knows nothing about pages, packages or manifests.

## Public interface

- `zip(entries)` → `Buffer`. Each entry is `{ name, bytes }`: `name` a relative path inside the archive with forward slashes, `bytes` a string (written as UTF-8) or a `Uint8Array`/`Buffer`.
  - Entries are written in the **byte order of their UTF-8 names**, whatever order they were given in.
  - Every entry has the same fixed fields: method 0 (stored), DOS date `0x0021` (1980-01-01) and time 0, general-purpose flags bit 11 alone (UTF-8 names), version needed 10, "version made by" 20 with host 0 (MS-DOS) in the high byte, internal and external attributes 0, no extra field, no comment, no data descriptor. The archive has no comment.
  - There are **no directory entries**: a reader makes the folders a file's path names.
  - It **throws** for a name that is not a relative file path (empty, absolute, a backslash, an empty, `.` or `..` segment, or a trailing `/`), for a name given twice, and for an archive that would need Zip64 (more than 65,535 entries, or a size or offset of 4 GiB or more). A learning package is far below every limit.
- The `ZipEntry` typedef.

## Depends on

`node:zlib` for `crc32` alone (in Node since 22.2; `engines` is `>=22.12`). Nothing else.

## Depended on by

The learning-package writer (to come, `planning/plans/2026-10-24-learning-packages.md`), which builds each package's entries (its pages, the files they need, and `imsmanifest.xml`) and writes the returned bytes. `test/unit/zip.test.js` covers it, including a read-back by Python's `zipfile` with every CRC checked, skipped where no Python is installed.

## Non-obvious behavior

- **The date is `0x0021`, not 0.** A DOS date packs the day, month and year since 1980 into 16 bits, and 0 means month 0 and day 0, which some readers refuse. `0x0021` is 1980-01-01, the earliest valid date.
- **Host 0, not host 3 (Unix).** With a Unix host byte, Info-ZIP reads the external attributes as a file mode, and 0 extracts as mode `000`: unreadable files. Host 0 with attributes 0 extracts as an ordinary file everywhere.
- **No Zip64, on purpose.** A Zip64 record adds structure every reader must handle for a size no learning package reaches; the module refuses an archive that would need it rather than writing a broken one.
- **The name check is the zip-slip guard.** A name with `..` or an absolute path would let the archive write outside the folder it is extracted into. An LMS unpacks uploads on its server, so a package must never carry such a name, even from a page path a site made by mistake.
