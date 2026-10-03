# kiss-ssg

A static site generator built to be driven by a coding agent. You describe the site; the agent writes it with kiss-ssg's skills, and every build hands back a verdict the agent can act on (`kiss-ssg check`) and a memory of what the site is (`kiss-ssg aikb`). Handlebars views, JSON or fetched models, small JS controllers — nothing to learn before the first page, and nothing hidden from the person who opens it later.

**[See the website →](https://cprobert.github.io/kiss-ssg/)** Pick your coding agent for the set-up steps, see sites built with kiss-ssg, and read the guide.

## Quick start

You need [Node 22.12+](https://nodejs.org) and a coding agent: [Claude Code](https://claude.com/claude-code) or [Codex](https://github.com/openai/codex), each with its own account. Pick the block for the one you use.

**Claude Code**

```sh
mkdir my-site && cd my-site
npx kiss-ssg@latest init
claude plugin marketplace add cprobert/kiss-ssg --scope project
claude plugin install kiss-ssg@kiss-ssg --scope project
claude plugin install kiss-memory@kiss-ssg --scope project
claude
```

**Codex**

```sh
mkdir my-site && cd my-site
npx kiss-ssg@latest init
codex plugin marketplace add cprobert/kiss-ssg
codex plugin add kiss-ssg@kiss-ssg
codex plugin add kiss-memory@kiss-ssg
codex
```

`init` installs kiss-ssg, drops a one-page starter site, points `CLAUDE.md` and `AGENTS.md` at the API contract, and adds the build scripts to `package.json`. The same two plugins carry kiss-ssg's skills for both agents, from one marketplace. For Claude Code, `init` declares them in the site's `.claude/settings.json`, but declaring a plugin does not install it, so the three `claude plugin` lines do that, at **project scope**. The settings file is committed with the site, so the site says which skills it is built with. For Codex, `init` writes the same declaration to `.codex/config.toml`, which enables the plugins for this site once Codex trusts the folder. But Codex installs plugins **once per user**, and `codex plugin add` also switches them on for every folder, so on a second site you skip the three `codex plugin` lines. `AGENTS.md`, which Codex reads, names the skills and those three lines. `init` prints both sets of commands when it finishes. Once the agent is open, paste:

> Use the kiss-site-new skill to build me a site for **a small bakery in Leeds: home, menu, about, and a news section for seasonal specials**. It will be served by **Netlify** at **https://kirkgate-bakery.co.uk**. Run the build check when you're done.

Change the bold parts. The host and address matter: kiss writes the sitemap, the feed and every canonical link from the address, and the host decides whether a folder's URL keeps its trailing slash. That's the whole setup. `npm run dev` previews the site with live reload; `npm run build` writes it to `public/`; `npm run check` verifies it.

Running `init` in a folder that already has a project is safe: it never overwrites a file, merges into `package.json` and `.claude/settings.json` key by key, appends to `.codex/config.toml` only the tables it lacks, and writes the starter only when it finds no project — no `router.js`, no `src/`, no `main` file and no `build` script of its own. Running it twice changes nothing.

**Optional: Anthropic's `frontend-design` skill for the look.** kiss decides how a site is built; it has no opinion on what it looks like. If you want a stronger visual direction — type, colour, spacing, layout character — install Anthropic's `frontend-design` skill beside kiss's, from the site's folder:

```sh
claude plugin marketplace add anthropics/skills --scope project
claude plugin install example-skills@anthropic-agent-skills --scope project
```

It arrives inside the `example-skills` plugin, alongside eleven other example skills. `kiss-site-new` and `kiss-site-review` let it set the visual direction while kiss keeps the structure — layouts, partials, the Sass folder, one view per page — so the site never collapses into a single-file page. `init` does not declare it; it is your choice.

## Prompts to copy

You don't have to name the skills — each one's description is written so the agent reaches for it on its own — but naming one makes the first run predictable.

| You want to…                                              | Paste                                                                                                | Skill it reaches                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Start a site                                              | Use the kiss-site-new skill to build me a site for …                                                 | `kiss-site-new`                          |
| Turn a site you made in Claude or ChatGPT into a real one | Here's the link to a site I built in Claude: <link>. Turn it into a real site, keeping how it looks. | `kiss-site-import`                       |
| Add a whole section                                       | Add a blog section to this site: posts from Markdown files, a paginated index and an RSS feed.       | `kiss-site-new`                          |
| Add or change one page                                    | Add a Contact page with our address and opening hours, linked from the nav.                          | `kiss-page-add`                          |
| Find out why a build fails                                | The kiss build is failing — run the check and fix what it reports.                                   | `kiss-build-check`                       |
| Get a site ready to launch                                | Is this site ready to launch? Review it and show me what's unfinished before fixing anything.        | `kiss-site-review`                       |
| Catch up on a site                                        | Catch me up on this site: what it is, how it's built and what bites.                                 | `kiss-site-brief`                        |
| Upgrade kiss-ssg                                          | Upgrade this site to the latest kiss-ssg and tell me what changed.                                   | `kiss-site-migrate`                      |
| Frame, steer, finish a change                             | Open a branch for … / Pulse this branch / We're done, close the branch.                              | `kiss-branch-open` / `-pulse` / `-close` |

## What you just installed

**The `kiss-ssg` plugin builds sites.** `kiss-site-new` (a site or a whole section from a description), `kiss-site-import` (a page you already have — a Claude or ChatGPT artifact, an exported page — made into a structured site that still looks the same), `kiss-page-add` (one page on a site that already builds), `kiss-build-check` (verify a build and read its report), `kiss-site-review` (is it ready to launch: the audit's findings, a look in a browser, a report before any fix) and `kiss-site-migrate` (move a site across kiss-ssg versions). The skills carry no copy of the API — each reads the docs installed in `node_modules/kiss-ssg/`, so the guidance cannot drift from the engine you have. See [`plugins/kiss-ssg/`](https://github.com/cprobert/kiss-ssg/tree/main/plugins/kiss-ssg).

**The `kiss-memory` plugin remembers them.** `npx kiss-ssg aikb router.js` records what the site is into `AIKB/`; `kiss-site-brief` reads it back to a developer returning after two years, and `kiss-branch-open`, `kiss-branch-pulse` and `kiss-branch-close` frame, steer and close a piece of work against the site's own build output, moving that baseline only when the close records it. `kiss-memory-consolidate` tidies what the loop accumulates, between pieces of work. See [`plugins/kiss-memory/`](https://github.com/cprobert/kiss-ssg/tree/main/plugins/kiss-memory).

**In `node_modules/kiss-ssg/`**, for any agent: `llms.txt` (the API contract — `CLAUDE.md` imports it), `examples/` (twelve runnable sites to copy by shape), `AIKB/` (per-module notes), `GUIDE.md` (the full reference), `types/` (declarations your editor reads) and `CHANGELOG.md`.

**The verdict.** `npx kiss-ssg check router.js` runs your build as a dry run and prints one JSON report per site, exit 1 on any failure, without touching the published output — see [Checking a build](GUIDE.md#checking-a-build). The report also says whether the site looks finished: `audit` lists pages with no title, description or `og:image`, images with no alt text, a missing favicon or 404 page, a source map or `debug.json` shipped by accident. Those findings are advisory and never change the exit code; `config.audit.ignore` takes the check ids a site deliberately does without, and `audit: false` turns the pass off.

## Setting up by hand

If you'd rather not run `init`, or the site already exists, from its folder:

```sh
npm install --save-dev kiss-ssg
```

Then install the plugins for your agent — the three `claude plugin` or the three `codex plugin` lines from the [Quick start](#quick-start) — and point the agent at the API contract. For Claude Code, add the line `@node_modules/kiss-ssg/llms.txt` to the project's `CLAUDE.md`, so every session reads it; inside a session that is already running, `/plugin` can install the plugins too (pick project scope if it asks), and you restart `claude` afterwards so their skills load. For Codex, tell it in `AGENTS.md` to read `node_modules/kiss-ssg/llms.txt` before touching the site and to verify every change with `npx kiss-ssg check router.js`; `init` writes exactly that, with the skills and the install lines.

**Other agents** (Cursor, Copilot…): the plugins serve Claude Code and Codex, but everything the skills point at ships in the package. Give the agent the same two instructions in its own instructions file: read `node_modules/kiss-ssg/llms.txt` first, and verify every change with `npx kiss-ssg check router.js`.

## Requirements

Node 22.12 or newer. kiss-ssg is an ES module (`import Kiss from 'kiss-ssg'`); `require('kiss-ssg')` also works on Node ≥22.12.

## Using the library directly

Every method, option and helper — the build script, `.page()` / `.pages()` / `.scan()`, controllers, assets and cache busting, the sitemap, `llms.txt`, RSS and `robots.txt`, redirects, host URL policy, [converting a page you already have](GUIDE.md#converting-an-existing-page), checking and recording a build, the launch-readiness audit and its check ids, the helpers, and migrating from v1 — is in **[GUIDE.md](GUIDE.md)**.
