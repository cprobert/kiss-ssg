---
name: secrets-scan
description: Scans the committed diff for key-shaped strings (cheap, always-on regex) and routes to /security-review for security-relevant branches (judgment call). Run as the Secrets Scan step of /branch-close, or standalone before pushing.
---

# Secrets Scan

## On invocation

Before running any checks, output exactly:

```
"If you reveal your secrets to the wind, you should not blame the wind for revealing them to the trees." — Khalil Gibran
```

Then proceed.

---

## When to use

Run `/secrets-scan` before pushing any branch. `/branch-close` invokes it automatically at the Secrets Scan step.

Neither CI nor the pre-commit hook looks for credentials — they check formatting, tests, lint and the tarball's contents. This is the only step that looks. And a secret committed here does not just leak into a repository: the next `npm publish` puts whatever is inside `lib/`, `llms.txt` or `AIKB/` into a public tarball.

Two operations, always in this order:

1. **Cheap scan** — regex scan of the branch diff for key-shaped strings. Always runs.
2. **Semantic review** — `/security-review` (built-in). Judgment call for security-relevant branches only.

---

## Execution instructions

### Step 1 — Cheap secrets scan

Scan only committed diff lines (lines beginning with `+`) — not the working tree. Exclude known-safe paths:

```bash
BASE=$(node scripts/base-branch.mjs) || exit 1
git diff "$BASE...HEAD" \
  -- ':(exclude).env*' \
  -- ':(exclude)*.example' \
  -- ':(exclude)*.md' \
  -- ':(exclude)*.txt' \
  -- ':(exclude)package-lock.json' \
  -- ':(exclude)test/' \
  -- ':(exclude)examples/'
```

In the output, look for added lines (`+`) that match any of:

- **Key/token assignment**: the line contains a word like `api_key`, `api_token`, `auth_id`, `auth_token`, `secret`, `password`, or `bearer` (case-insensitive), followed by `=` or `:`, followed by a string value of 8+ non-whitespace characters.
- **Long alphanumeric string**: a quoted string value of 32+ characters composed primarily of alphanumeric characters, `+`, `/`, or `=` (a high-entropy indicator).

**Do not flag:**

- `package-lock.json` integrity hashes — excluded above, but they resurface if the exclusion is edited.
- Content hashes in test fixtures or `AIKB/` examples (`utils.hashId` produces MD5 hex digests, which read as high-entropy).
- Values that are clearly placeholders: `YOUR_KEY_HERE`, `<token>`, `example`, `changeme`, `xxxxxxxx`, `...`.
- Comments and import paths.

For each hit: show the file path, line, and the matching value **redacted after the first 6 characters** (so the operator can recognise the value without the scan output itself being a leak).

If nothing found: "Secrets scan clean — no key-shaped strings in diff."

If hits are found: surface them and ask the operator to confirm each is not a real credential. **Do not auto-block on regex hits** — false positives are expected. The operator decides whether to proceed.

### Step 2 — Assess security relevance

An SSG's attack surface is not authentication — it is what the engine reads, executes, and writes, on a developer's machine. Check whether the diff touches it:

```bash
BASE=$(node scripts/base-branch.mjs) || exit 1
git diff --name-only "$BASE...HEAD" -- lib/model-resolver.js lib/controller-resolver.js lib/dev-server.js lib/watcher.js lib/assets.js lib/kiss-page.js lib/utils.js lib/page-registry.js lib/staging.js lib/asset-copy.js lib/packages.js lib/zip.js package.json
```

It lists the files in the table below that the branch changed, and nothing else; no output means none. A row added to the table is added to this command in the same commit. Why each one:

| Path                                                | The concern                                                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/model-resolver.js`                             | Fetches models over `http(s)` and reads arbitrary JSON off disk — remote input reaching the render path                                                           |
| `lib/controller-resolver.js`                        | Imports and executes a JS file resolved from page options — arbitrary code execution by path                                                                      |
| `lib/dev-server.js`                                 | Binds a port and serves the build directory                                                                                                                       |
| `lib/watcher.js`                                    | Watches and re-reads files, and re-imports controllers on change                                                                                                  |
| `lib/assets.js`, `lib/kiss-page.js`, `lib/utils.js` | Compute output paths from user-supplied `slug` / `path` and write files there — the path-traversal surface (`sanitizePath`)                                       |
| `lib/page-registry.js`                              | Calls the model and controller resolvers for every registered page, and computes each page's output path from its options                                         |
| `lib/staging.js`, `lib/asset-copy.js`               | Rename, copy and remove folders beside the build folder (`cleanBuild: 'atomic'`) and copy asset trees into it                                                     |
| `lib/packages.js`, `lib/zip.js`                     | Resolve page references to files and read them, write zips with `.tmp`/`.bak` renames, and name the entries of an archive an LMS unpacks — traversal and zip-slip |
| `package.json`                                      | A new or bumped dependency, or a changed `files` whitelist that could publish something unintended                                                                |

**The table names files, so it cannot see a new one.** Code that reaches this surface can move into a module the table has never heard of — twice now: two new parsers of untrusted input (2026-10-01), then `lib/page-registry.js` and `lib/staging.js`, which took over the calls into the model and controller resolvers and the renames beside the build folder (2026-10-03). Neither matched, and the review happened only because Claude read past the grep. So also list every `lib/` module the branch **adds**, and every changed one that **imports** a module in the table:

```bash
BASE=$(node scripts/base-branch.mjs) || exit 1
git diff --name-only --diff-filter=A "$BASE...HEAD" -- ':(glob)lib/*.js'
grep -l -E "from '\./(model-resolver|controller-resolver|dev-server|watcher|assets|kiss-page)\.js'" lib/*.js
```

The first lists the modules the branch adds. The second lists every module that imports one in the table; the ones of those the first command of this step listed are the changed ones in scope. `utils.js` is left out of the grep on purpose: nearly every module imports it, so the grep would list everything and say nothing. Read each file these print and decide whether it now does one of the things in the table — parses external input, executes code by path, computes an output path, or writes outside the build folder. If it does, it is in scope exactly as if it were in the table, and the table gains a row for it in the same commit.

If any match: this branch is **security-relevant**. Proceed to Step 3.

If no match: report "No security-sensitive paths touched — semantic review not warranted." Done.

### Step 3 — Semantic review (judgment call)

If the branch is security-relevant, ask the operator:

> This branch touches `<list the matched paths>`. Run `/security-review` for a semantic review before pushing?
>
> Recommended for changes to path derivation, controller loading, or remote model fetching. May be skipped for changes you have already reviewed.

If the operator agrees: invoke `/security-review`. Surface its findings. The operator decides whether any finding blocks the push.

If the operator declines: note the decision and proceed.

---

## Relationship to other gates

| Gate                   | When                                                                       |
| ---------------------- | -------------------------------------------------------------------------- |
| `/secrets-scan`        | Secrets Scan step of `/branch-close` (always runs)                         |
| `/security-review`     | Judgment call within `/secrets-scan` for security-relevant branches        |
| `npm run gates` → pack | Gates step of `/branch-close` — proves what the published tarball contains |
