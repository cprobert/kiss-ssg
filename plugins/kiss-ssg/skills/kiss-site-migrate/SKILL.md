---
name: kiss-site-migrate
description: Upgrade a kiss-ssg site across versions — install it with `npx kiss-ssg@latest upgrade`, work the notes it prints, and prove the site builds the way it did. Use when a build script targets an older kiss-ssg, an upgrade fails with an AggregateError or empty output, or for "upgrade kiss", "migrate to kiss-ssg v2", "update kiss-ssg", "my kiss site broke after the upgrade".
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Upgrade a kiss site

An upgrade fails silently. A release can change what a folder or a default _means_ without changing any signature, so nothing fails at install time and the site keeps building — differently. This skill is the method; what each release changed is in `CHANGELOG.md`, under `### Upgrading` in that version's entry, and `kiss-ssg upgrade` prints exactly the notes between the site's version and the new one. Work from those notes, never from memory.

## Execution instructions

### 1. Install with the command, and read the notes first

Run it by version, so npx fetches the release you mean rather than the site's own older copy, which has no `upgrade` command:

```bash
npx kiss-ssg@latest upgrade --plan
npx kiss-ssg@latest upgrade
```

The first installs nothing: it prints where the site is, where it is going, what it would run, and every note in between, oldest first. Read them before going on. The second installs `kiss-ssg@<version>` into whichever section of `package.json` already holds it, replacing a `file:` link, a URL or a git dependency, and then checks the install really landed: `node_modules/kiss-ssg` is that version and not a link, `package.json` allows it, and `package-lock.json` pins it from the registry. A plain `npm install` keeps a `file:` link to a working tree even after its spec is edited, so a line such as `FAILED: node_modules/kiss-ssg is still a link` is the command doing its job: run the fix it prints, never work past it.

**When it cannot tell where the site started**, it says so and prints every note up to the new version. That is the normal case on a site whose `node_modules/kiss-ssg` is a junction to a working tree. Tell it the version the site was last built against (the site's `AIKB/last-build.json` record, its committed lockfile, or the owner):

```bash
npx kiss-ssg@latest upgrade --plan --from 2.6.2
```

**When the site was already upgraded some other way** (`npm update`, Dependabot) and the build broke, the installed version already equals the new one. `--plan --from <old version>` still prints the notes, even with the lockfile uncommitted.

**When it refuses**, it says why and writes nothing. Uncommitted changes to `package.json` or the lockfile: commit or revert them, so the upgrade is the only change in those files. pnpm, yarn or an `npm-shrinkwrap.json`: install with the command it names, then use `--plan --from` for the notes.

If `npx kiss-ssg@latest upgrade --help` answers `unknown command`, npx ran a kiss-ssg from before the command existed: name a version instead (`npx kiss-ssg@2.9.0 upgrade`).

### 2. Check before changing anything

```bash
npx kiss-ssg check router.js --summary
```

It builds staged and discards the result, so nothing published is touched. If the first line does not start `ok`, work the `failures` entries first, with the `kiss-build-check` skill: a page that fails to render is absent from the output, so it also turns every `{{link}}` to it into a `broken link:` finding, and fixing the failure clears those. Treat a new failure as a bug the upgrade surfaced, not one it caused: the notes say which releases made an old mistake fatal, and in each case the published output was already wrong.

### 3. Work each note

Go note by note, against the site's own build script, controllers, layouts and tooling, and record for each: applies / does not apply. Most will not apply; knowing that is the point. A note that says to grep for something means grep, not recall. The notes are the contract — this skill holds no copy of them, so a note it does not mention is not a note to skip.

### 4. Done when it builds the way it did

The upgrade is done when the site builds the way it did, not when it builds better. `check` diffs against the site's recorded `AIKB/last-build.json` when it has one, and names every page added (`+`), removed (`-`) or changed (`~`). A difference is a finding to explain: either a change a note names (a default title, a sitemap date), or a regression you have not found yet. Without a record, compare the page list and the page bodies with the committed build output.

New audit findings, broken-link lines a release has just started reporting, and anything else that makes the site _better_ are not the upgrade. Offer them as their own piece of work, with the `kiss-site-review` skill.

### 5. Record, and commit the upgrade on its own

```bash
npx kiss-ssg aikb router.js
```

It records the knowledge base from a passing build, so the next `check` diffs against the new version's output. Commit `package.json`, the lockfile, `AIKB/` and the fixes the notes asked for as one upgrade, apart from any other work.

Make sure the project's `CLAUDE.md` carries `@node_modules/kiss-ssg/llms.txt` (create the file if there is none), so every later session reads the installed version's contract instead of remembering an older one. Say whether you added the line or found it.

### 6. When an upgrade moves a URL

Most upgrades move none. When one does — turning on `extensionLess`, a slug rule that normalises differently, a v1 site's hand-written hrefs meeting v2's paths — three decisions belong to the site's host, so make them before the cutover, not after:

- **`aliases`.** The old URL goes in that page's `aliases`, and that list is the redirect plan. `check` reports `moved without redirect:` and `removed without redirect:` against the last record; the fix is the old path pasted into `aliases`, or saying out loud that it is meant to be gone. Take the old paths from the committed output: every path in it the new build no longer writes is a page you have lost or an alias you owe.
- **`redirects: { format: … }`.** There is no default host: unset writes `<build>/redirects.json` alone and logs a notice. `'netlify'` (also Cloudflare Pages) writes `_redirects`, which Firebase and Vercel do not read at all; `'firebase'`, `'vercel'` and `'htaccess'` write a fragment to merge into the host's own config; a list writes several. The wrong format leaves every old URL 404ing while the build reports the redirects as written.
- **`links: { trailingSlash: … }`.** With `extensionLess`, every page is a directory index. Netlify serves `/about/` and 301s `/about`; Firebase with `cleanUrls: true` and `trailingSlash: false` serves `/about` and 301s `/about/`. The default `true` is Netlify's. Set it to match the host, and the canonical, sitemap, `{{link}}`, `llms.txt` and feed all name URLs that return 200.

If the old site served pretty URLs and the new one is not `extensionLess`, set `links: { canonical: true }` rather than `canonical=true` on every `{{link}}` call. And `check`'s `broken link:` lines are the proof every internal link still points somewhere; they are advisory, so read them rather than trusting the exit code.

### 7. From v1

A v1 → v2 migration is the same method with one more source. Node ≥22.12 first. Then read `node_modules/kiss-ssg/GUIDE.md` § Migrating from v1, every recipe including its "unchanged in v2" list, and `node_modules/kiss-ssg/examples/9-migrated-from-v1/`, whose README maps each v1 idiom to its replacement. Go recipe by recipe against the site, recording applies / does not apply. The goal for a content-only migration is byte-identical output against the v1 build's committed output; one real consumer got an empty diff.

Two v1 shapes to replace while you are there: helpers registered by hand on a global Handlebars move to `config.folders.helpers` (default `./helpers`, whose `registerHelpers(kiss)` kiss calls itself), and the build script becomes `router.js` at the project root (`node_modules/kiss-ssg/llms.txt` § The build script). Renaming it breaks references nothing reports, so grep the whole repo for the old basename and fix every hit before you build: `package.json`'s `main` and scripts, the host's build command and CI, a CSS toolchain's source globs (a Tailwind v4 `@source` that matches nothing is scanned in silence, so classes used only in the script stop compiling), `kiss-ssg check` and `aikb` invocations, and the project's docs. Do the rename as its own commit, so the diff that proves the migration is not also carrying it.

Converting v1's hand-written hrefs to `{{link "<id>"}}` is optional and usually wrong in the migration itself: it rewrites bytes, and byte-identical output is the evidence. Offer it afterwards; `node_modules/kiss-ssg/examples/11-blog/` is the shape to copy.
