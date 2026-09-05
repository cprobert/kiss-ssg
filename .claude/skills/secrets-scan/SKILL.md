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

kiss-ssg is a published package with no CI and no pre-commit hook, so nothing else looks. And a secret committed here does not just leak into a repository — the next `npm publish` puts whatever is inside `lib/`, `llms.txt` or `AIKB/` into a public tarball.

Two operations, always in this order:

1. **Cheap scan** — regex scan of the branch diff for key-shaped strings. Always runs.
2. **Semantic review** — `/security-review` (built-in). Judgment call for security-relevant branches only.

---

## Execution instructions

### Step 1 — Cheap secrets scan

Scan only committed diff lines (lines beginning with `+`) — not the working tree. Exclude known-safe paths:

```bash
BASE=$(node scripts/base-branch.mjs)
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
git diff --name-only "$BASE...HEAD" | grep -E '(lib/(model-resolver|controller-resolver|dev-server|watcher|assets|utils|kiss-page)\.js|package\.json)'
```

Why each one:

| Path | The concern |
|---|---|
| `lib/model-resolver.js` | Fetches models over `http(s)` and reads arbitrary JSON off disk — remote input reaching the render path |
| `lib/controller-resolver.js` | Imports and executes a JS file resolved from page options — arbitrary code execution by path |
| `lib/dev-server.js` | Binds a port and serves the build directory |
| `lib/watcher.js` | Watches and re-reads files, and re-imports controllers on change |
| `lib/assets.js`, `lib/kiss-page.js`, `lib/utils.js` | Compute output paths from user-supplied `slug` / `path` and write files there — the path-traversal surface (`sanitizePath`) |
| `package.json` | A new or bumped dependency, or a changed `files` whitelist that could publish something unintended |

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

| Gate | When |
|---|---|
| `/secrets-scan` | Secrets Scan step of `/branch-close` (always runs) |
| `/security-review` | Judgment call within `/secrets-scan` for security-relevant branches |
| `npm run gates` → pack | Gates step of `/branch-close` — proves what the published tarball contains |
