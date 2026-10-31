# sessions.js

## Responsibility

A site's session logs (`planning/sessions/<date>-<slug>.md`, one per piece of work) and `kiss-ssg session`, the command that finds and lists them. The kiss-memory skills call the command rather than carry their own copy of the rules.

## Public interface

- `SESSIONS` — `'planning/sessions'`, relative to the site's folder.
- `frontmatter(text)` — a log's frontmatter as `{ key: string }`, or `null` when it has none.
- `matching(entries, branch)` — the entries whose `branch:` is exactly `branch`.
- `newestFirst(entries)` — sorted by the date the file name starts with.
- `listLines(entries)` — `--list`'s tab-separated table.
- `branchCommits(branch, exists)` / `commitsOf(branch, cwd)` — the full ref to read a branch's own logs from: the local branch, else origin's.
- `readSessions({ dir, cwd, ref })` — every log under `dir`, subfolders included, from the working tree, or from `ref`'s commits; each `{ file, show, fields }`.
- `runSession(argv, { cwd })` — the whole command: `{ out, err, code }`. `bin/kiss-ssg.js` only prints it.
- `SESSION_HELP` — the command's help text.

## Depends on

`lib/git.js`; `node:fs`, `node:path`, `node:child_process` (one `git cat-file --batch` for a branch's blobs).

## Depended on by

`lib/base.js` (a branch's `base:` line), `bin/kiss-ssg.js` (`kiss-ssg session`), and through the command every `kiss-memory` skill and this repository's own branch skills.

## Non-obvious behavior

Every rule below was a defect in an inline copy before this module existed (code reviews, 2026-10-31):

- **From the branch, the folder's place in the repository comes from git's `--show-prefix` for cwd, never from comparing the folder with `--show-toplevel`.** The two can spell one folder differently: a symlinked checkout, or Windows, where Node's temp folder is `C:/Users/RUNNER~1/…` and git's is `C:/Users/runneradmin/…`. Compared across spellings, the folder lay outside the repository and `--from-branch` found nothing, on `windows-latest` only (CI, PR #47). The test reaches the site through a symlink, which reproduces it on any platform.
- **The branch is read from the frontmatter only, and compared as text.** A log's body may quote another log's frontmatter, and a grep matched `fix/v2.8` against `fix/v2x8`. A frontmatter that is never closed is none.
- **What an editor or a YAML habit adds reads as the plain value:** CRLF endings, a byte-order mark, spaces after `---`, a quoted value, a trailing ` # comment`. A `#` with no space before it is part of the value, as in YAML.
- **An empty branch matches nothing.** On a detached HEAD the current branch is `''`, and a shell copy matched every log that had no `branch:` line.
- **Subfolders are read, and only files:** an archived log counts, while a folder named `old.md` or a symlink to nothing is skipped.
- **Paths are printed from where the caller stands** (`show`), so a path opens where it is read. Read from a branch's commits, a log is printed as `<ref>:<path>`, which `git show` reads as it stands, so a later command needs no shell state.
- **With no `planning/sessions/` under the folder, it says so on stderr** rather than answering with nothing, which a skill would read as "no log": the usual cause is being run outside the site's folder.
- **A branch's logs are read from the local branch, else origin's copy**, by full ref, so a tag of the same name is never read, and a branch opened on another machine is still found. Names are listed with `ls-tree -z`, because git quotes a non-ASCII name otherwise.
- **`--get` refuses rather than guesses:** no log, or more than one, exits 1 and says which; a log without the key prints nothing.
- **Newest first is by file name, not modification time:** a fresh clone gives every file the same time.

## Types

`SessionEntry` `{ file, show, fields }`; `CommandResult` `{ out, err, code }`, shared with `lib/base.js`.
