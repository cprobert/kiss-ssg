# kiss-ssg

A static site generator built to be driven by a coding agent. You describe the site; the agent writes it with kiss-ssg's skills, and every build hands back a verdict the agent can act on (`kiss-ssg check`) and a memory of what the site is (`kiss-ssg aikb`). Handlebars views, JSON or fetched models, small JS controllers — nothing to learn before the first page, and nothing hidden from the person who opens it later.

## Quick start

You need [Node 22.12+](https://nodejs.org) and [Claude Code](https://claude.com/claude-code).

```sh
mkdir my-site && cd my-site
npx kiss-ssg@latest init
claude plugin marketplace add cprobert/kiss-ssg --scope project
claude plugin install kiss-ssg@kiss-ssg --scope project
claude plugin install kiss-memory@kiss-ssg --scope project
claude
```

`init` installs kiss-ssg, drops a one-page starter site, points `CLAUDE.md` and `AGENTS.md` at the API contract, and adds the build scripts to `package.json`. It also declares kiss-ssg's two plugins in the site's `.claude/settings.json` — but declaring a plugin does not install it, so the three `claude plugin` lines do that, at **project scope**. The settings file is committed with the site, so the site says which skills it is built with; `init` prints the same three commands when it finishes. Once `claude` is open, paste:

> Use the kiss-site-new skill to build me a site for **a small bakery in Leeds: home, menu, about, and a news section for seasonal specials**. It will be served by **Netlify** at **https://kirkgate-bakery.co.uk**. Run the build check when you're done.

Change the bold parts. The host and address matter: kiss writes the sitemap, the feed and every canonical link from the address, and the host decides whether a folder's URL keeps its trailing slash. That's the whole setup. `npm run dev` previews the site with live reload; `npm run build` writes it to `public/`; `npm run check` verifies it.

Running `init` in a folder that already has a site is safe: it never overwrites a file, merges into `package.json` and `.claude/settings.json` key by key, and leaves an existing `router.js` or `src/` alone. Running it twice changes nothing.

## Prompts to copy

You don't have to name the skills — each one's description is written so Claude reaches for it on its own — but naming one makes the first run predictable.

| You want to…                  | Paste                                                                                          | Skill it reaches                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Start a site                  | Use the kiss-site-new skill to build me a site for …                                           | `kiss-site-new`                          |
| Add a whole section           | Add a blog section to this site: posts from Markdown files, a paginated index and an RSS feed. | `kiss-site-new`                          |
| Add or change one page        | Add a Contact page with our address and opening hours, linked from the nav.                    | `kiss-page-add`                          |
| Find out why a build fails    | The kiss build is failing — run the check and fix what it reports.                             | `kiss-build-check`                       |
| Catch up on a site            | Catch me up on this site: what it is, how it's built and what bites.                           | `kiss-site-brief`                        |
| Upgrade kiss-ssg              | Upgrade this site to the latest kiss-ssg and tell me what changed.                             | `kiss-site-migrate`                      |
| Frame, steer, finish a change | Open a branch for … / Pulse this branch / We're done, close the branch.                        | `kiss-branch-open` / `-pulse` / `-close` |

## What you just installed

**The `kiss-ssg` plugin builds sites.** `kiss-site-new` (a site or a whole section from a description), `kiss-page-add` (one page on a site that already builds), `kiss-build-check` (verify a build and read its report) and `kiss-site-migrate` (move a site across kiss-ssg versions). The skills carry no copy of the API — each reads the docs installed in `node_modules/kiss-ssg/`, so the guidance cannot drift from the engine you have. See [`plugins/kiss-ssg/`](plugins/kiss-ssg/).

**The `kiss-memory` plugin remembers them.** `npx kiss-ssg aikb router.js` records what the site is into `AIKB/`; `kiss-site-brief` reads it back to a developer returning after two years, and `kiss-branch-open`, `kiss-branch-pulse` and `kiss-branch-close` frame, steer and close a piece of work against the site's own build output, moving that baseline only when the close records it. `kiss-memory-consolidate` tidies what the loop accumulates, between pieces of work. See [`plugins/kiss-memory/`](plugins/kiss-memory/).

**In `node_modules/kiss-ssg/`**, for any agent: `llms.txt` (the API contract — `CLAUDE.md` imports it), `examples/` (eleven runnable sites to copy by shape), `AIKB/` (per-module notes), `GUIDE.md` (the full reference), `types/` (declarations your editor reads) and `CHANGELOG.md`.

**The verdict.** `npx kiss-ssg check router.js` runs your build as a dry run and prints one JSON report per site, exit 1 on any failure, without touching the published output — see [Checking a build](GUIDE.md#checking-a-build).

## Setting up by hand

If you'd rather not run `init`, or the site already exists, from its folder:

```sh
npm install --save-dev kiss-ssg
claude plugin marketplace add cprobert/kiss-ssg --scope project
claude plugin install kiss-ssg@kiss-ssg --scope project
claude plugin install kiss-memory@kiss-ssg --scope project
```

Then add the line `@node_modules/kiss-ssg/llms.txt` to the project's `CLAUDE.md`, so every session reads the API contract. Inside a session that is already running, `/plugin` can install them too (pick project scope if it asks); restart `claude` afterwards so their skills load.

**Other agents** (Codex, Cursor, Copilot…): the plugins are Claude Code's, but everything they point at ships in the package. Tell the agent, in its own instructions file (`AGENTS.md` for Codex — `init` writes one), to read `node_modules/kiss-ssg/llms.txt` before touching the site and to verify every change with `npx kiss-ssg check router.js`.

## Requirements

Node 22.12 or newer. kiss-ssg is an ES module (`import Kiss from 'kiss-ssg'`); `require('kiss-ssg')` also works on Node ≥22.12.

## Using the library directly

Every method, option and helper — the build script, `.page()` / `.pages()` / `.scan()`, controllers, assets and cache busting, the sitemap, `llms.txt`, RSS and `robots.txt`, redirects, host URL policy, checking and recording a build, the helpers, and migrating from v1 — is in **[GUIDE.md](GUIDE.md)**.
