<div align="center">

<img alt="" src="src/assets/img/logo-mark.png" width="120">

# kiss-ssg

**Sites an agent builds, and a person can still read.**

A small static site generator for brochure sites and documentation sites. If you need a static HTML
site that goes up quickly, is easy to maintain and has best practice built in, this is the
zero-to-sixty tool: nothing to learn before the first page, and it is fun to use.

It is built to be driven by a coding agent. You describe the site; the agent writes it with
kiss-ssg's skills, and every build hands back a verdict the agent can act on (`kiss-ssg check`) and
a memory of what the site is (`kiss-ssg aikb`). Handlebars views, JSON or fetched models, small JS
controllers — nothing hidden from the person who opens it later.

[![CI](https://github.com/cprobert/kiss-ssg/actions/workflows/ci.yml/badge.svg)](https://github.com/cprobert/kiss-ssg/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/kiss-ssg?style=flat&logo=npm&logoColor=white&label=npm)](https://www.npmjs.com/package/kiss-ssg)
[![GitHub stars](https://img.shields.io/github/stars/cprobert/kiss-ssg?style=flat)](https://github.com/cprobert/kiss-ssg/stargazers)
[![Node](https://img.shields.io/node/v/kiss-ssg?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org)

[Website](https://cprobert.github.io/kiss-ssg/) · [Guide](GUIDE.md) · [Examples](examples/) · [Plugins](plugins/) · [Changelog](CHANGELOG.md) · [npm](https://www.npmjs.com/package/kiss-ssg)

</div>

---

## What is kiss-ssg?

Ask a coding agent for a website and you get one. It arrives as a single HTML file with the styles
inline, or as eight pages that are each a copy of the last, and it looks finished. Then you ask for
a change to the nav, the agent edits it eight times and gets one wrong, and nobody can say which
pages exist, which links work, or what the agent decided along the way. The more pages you add, the
more of the site nobody can follow.

kiss-ssg gives the agent a structure to build into and a verdict when it is done. Layouts, partials
and one view per page; the site's facts in models and its logic in small controllers, so the next
person can follow what the agent wrote. Every build checks its own pages, links and assets, and
fails rather than ship a mistake quietly. And when a piece of work closes, `kiss-ssg aikb` writes
down what the site is, so the next session starts from facts rather than guesses.

**Built with it:** [Diploma MSc](https://www.diploma-msc.com/) · [Learna](https://www.learna.ac.uk/) · [A1K9 Training](https://www.a1k9training.co.uk/) · [K9 Solutions](https://k9solutions.uk/) · [Pro Plumbing](https://pro-plumbing.trade/)

---

## Describe the site.

_Three sentences and a host name. The agent takes it from there._

- **[kiss-site-new](plugins/kiss-ssg/skills/kiss-site-new/SKILL.md) →** A site, or a whole section of one, from a description: the pages, the nav, a blog with a paginated index and an RSS feed.
- **[kiss-site-import](plugins/kiss-ssg/skills/kiss-site-import/SKILL.md) →** A page you already have — a Claude or ChatGPT artifact, an exported page — made into a structured site that still looks the same.
- **[kiss-page-add](plugins/kiss-ssg/skills/kiss-page-add/SKILL.md) →** One page on a site that already builds, linked from the nav.
- **[Twelve examples](examples/) →** Runnable sites the agent copies by shape, from one folder of views to a blog, a data-fed site and a converted single-file page. They ship in the package.
- **[Anthropic's `frontend-design` skill](#quick-start) →** kiss decides how a site is built, not what it looks like. Install this beside kiss's skills and it sets the visual direction while kiss keeps the structure.

## Keep it readable.

_Whoever opens the site in two years can follow what the agent wrote._

- **[Views, models, controllers](GUIDE.md#the-build-script) →** One Handlebars view per page, the site's facts in JSON or fetched models, and a small controller only where a page needs logic. No bundler, no build step, nothing hidden.
- **[Conventions, not questions](GUIDE.md#usage) →** Folders, routes, helpers and asset names all have defaults, so an agent has fewer choices to get wrong. Every default is a config key, never a fork.
- **[A file's name says what happens to it](GUIDE.md#usage) →** `.hbs` is a template, `.md` is rendered Markdown, `.html` is HTML, and all three are compiled; `.txt` is the one kiss leaves alone.
- **[Markdown copies for agents](GUIDE.md#markdown-copies-for-agents) →** Every page gets a `.md` beside it, converted from its `<main>`, and `llms.txt` links them, so the next agent reads the site rather than parsing it.
- **[Sass, assets and cache busting](GUIDE.md#assets) →** Styles compile from `src/assets`, an asset is keyed by the name a template asks for, and a content hash or version string is one config key away.

## Check every build.

_A verdict, not a log. Mistakes can't ship quietly._

- **[`kiss-ssg check`](GUIDE.md#checking-a-build) →** A dry run of your build script: one JSON report per site, exit 1 on any failure, and the published output untouched.
- **[Links by identity](GUIDE.md#helpers) →** `{{link "about"}}` turns a page's id into its served path, and a link to a page nobody made fails the build instead of emitting a URL nobody checked.
- **[Broken links and missing assets](GUIDE.md#checking-a-build) →** Every `href` and `src` the build wrote is resolved against the files it wrote, and an `{{asset}}` on a path no copy emitted fails the build.
- **[Launch-readiness audit](GUIDE.md#checking-a-build) →** Pages with no title, description or `og:image`, images with no alt text, a missing favicon or 404 page, a source map shipped by accident. Advisory, and never the exit code.
- **[Sitemap, feed, robots and redirects](GUIDE.md#sitemap) →** Written from the same registry as the pages and from the address you gave, so none of them can disagree with the site — and a host decides whether a folder's URL keeps its trailing slash.
- **[kiss-site-review](plugins/kiss-ssg/skills/kiss-site-review/SKILL.md) →** Is it ready to launch: the audit's findings, a look in a browser at phone and desktop widths, and a report before any fix.

## Remember what it is.

_The next session starts from facts, not guesses._

- **[`kiss-ssg aikb`](GUIDE.md#recording-the-knowledge-base) →** Records what the site is into `AIKB/` from the same staged build, and is the only thing that writes that folder. Commit it with the work.
- **[kiss-site-brief](plugins/kiss-memory/skills/kiss-site-brief/SKILL.md) →** Catch up on a site: what it is, how it's built and what bites, read back to a developer returning after two years.
- **[kiss-branch-open, -pulse and -close](plugins/kiss-memory/) →** Frame a piece of work, steer it against the site's own build output, and close it, moving that baseline only when the close records it. `kiss-memory-consolidate` tidies what the loop accumulates.
- **[kiss-site-migrate](plugins/kiss-ssg/skills/kiss-site-migrate/SKILL.md) →** Move a site across kiss-ssg versions, with the upgrade note each version a site on `^2` receives without asking.
- **[Docs that ship with the engine](llms.txt) →** `llms.txt`, `GUIDE.md`, the examples and the per-module notes all install into `node_modules/kiss-ssg/`, and the skills carry no copy of the API: each reads the docs for the engine you have, so the guidance cannot drift from it.

---

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

`init` installs kiss-ssg, drops a one-page starter site, points `CLAUDE.md` and `AGENTS.md` at the API contract, and adds the build scripts to `package.json`. The three plugin lines install kiss's skills; the last line opens your agent. Once it is open, paste:

> Use the kiss-site-new skill to build me a site for **a small bakery in Leeds: home, menu, about, and a news section for seasonal specials**. It will be served by **Netlify** at **https://kirkgate-bakery.co.uk**. Run the build check when you're done.

Change the bold parts. The host and address matter: kiss writes the sitemap, the feed and every canonical link from the address, and the host decides whether a folder's URL keeps its trailing slash. That's the whole setup. `npm run dev` previews the site with live reload; `npm run build` writes it to `public/`; `npm run check` verifies it.

<details>
<summary><b>How the plugins install, and running <code>init</code> on a site that exists</b></summary>

<br/>

The same two plugins carry kiss-ssg's skills for both agents, from one marketplace. For Claude Code, `init` declares them in the site's `.claude/settings.json`, but declaring a plugin does not install it, so the three `claude plugin` lines do that, at **project scope**. The settings file is committed with the site, so the site says which skills it is built with. For Codex, `init` writes the same declaration to `.codex/config.toml`, which enables the plugins for this site once Codex trusts the folder. But Codex installs plugins **once per user**, and `codex plugin add` also switches them on for every folder, so on a second site you skip the three `codex plugin` lines. `AGENTS.md`, which Codex reads, names the skills and those three lines. `init` prints both sets of commands when it finishes.

Running `init` in a folder that already has a project is safe: it never overwrites a file, merges into `package.json` and `.claude/settings.json` key by key, appends to `.codex/config.toml` only the tables it lacks, and writes the starter only when it finds no project — no `router.js`, no `src/`, no `main` file and no `build` script of its own. Running it twice changes nothing.

</details>

<details>
<summary><b>Optional: Anthropic's skills for the look, and for a browser</b></summary>

<br/>

**Optional: Anthropic's `frontend-design` skill for the look.** kiss decides how a site is built; it has no opinion on what it looks like. If you want a stronger visual direction — type, colour, spacing, layout character — install Anthropic's `frontend-design` skill beside kiss's, from the site's folder:

```sh
claude plugin marketplace add anthropics/skills --scope project
claude plugin install example-skills@anthropic-agent-skills --scope project
```

It arrives inside the `example-skills` plugin, alongside eleven other example skills. `kiss-site-new` and `kiss-site-review` let it set the visual direction while kiss keeps the structure — layouts, partials, the Sass folder, one view per page — so the site never collapses into a single-file page. `init` does not declare it; it is your choice.

**Optional: Anthropic's `webapp-testing` skill for a browser.** The same plugin carries `webapp-testing`, so those two lines install it too. It is a Playwright recipe for Python, and the browser comes from Playwright itself, which it needs installed:

```sh
pip install playwright
python -m playwright install chromium
```

With that installed, your agent can open the pages it builds at phone and desktop widths and in dark mode. `kiss-site-review`'s browser pass and `kiss-site-import`'s side-by-side check need that, and `kiss-site-new` takes a look before it hands over. kiss's skills say how to show a kiss site to that browser, and they overrule three of the skill's defaults that break a kiss site:

- serve the build folder over HTTP, never from `file://`;
- start and stop the server yourself, because its helper left the dev server running on Windows;
- read the site's own port.

What was measured (2026-10-13): in three review runs, agents wrote their own Playwright scripts rather than invoking the skill. The browser was what mattered. One agent with no Playwright at all installed it into a scratch folder and did as well.

</details>

### Prompts to copy

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

### Setting up by hand

If you'd rather not run `init`, or the site already exists, from its folder:

```sh
npm install --save-dev kiss-ssg
```

Then install the plugins for your agent — the three `claude plugin` or the three `codex plugin` lines above — and point the agent at the API contract. For Claude Code, add the line `@node_modules/kiss-ssg/llms.txt` to the project's `CLAUDE.md`, so every session reads it; inside a session that is already running, `/plugin` can install the plugins too (pick project scope if it asks), and you restart `claude` afterwards so their skills load. For Codex, tell it in `AGENTS.md` to read `node_modules/kiss-ssg/llms.txt` before touching the site and to verify every change with `npx kiss-ssg check router.js`; `init` writes exactly that, with the skills and the install lines.

**Other agents** (Cursor, Copilot…): the plugins serve Claude Code and Codex, but everything the skills point at ships in the package. Give the agent the same two instructions in its own instructions file: read `node_modules/kiss-ssg/llms.txt` first, and verify every change with `npx kiss-ssg check router.js`.

---

## Documentation

| I want to…                              | Start here                                                                                                                                                                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Write the build script myself           | [The build script](GUIDE.md#the-build-script) · [`.page()`](GUIDE.md#page) · [`.pages()`](GUIDE.md#pages) · [Controllers](GUIDE.md#controller) · [Remote models](GUIDE.md#remote-models)                               |
| Style it and ship assets                | [Assets](GUIDE.md#assets) · [Markdown options](GUIDE.md#markdown-options) · [Helpers](GUIDE.md#helpers)                                                                                                                |
| Get the URLs right for my host          | [Host URL policy](GUIDE.md#host-url-policy) · [Redirects](GUIDE.md#redirects)                                                                                                                                          |
| Give search engines and agents the site | [`.sitemap()`](GUIDE.md#sitemap) · [`.feed()`](GUIDE.md#feed) · [`.robots()`](GUIDE.md#robots) · [`.llms()`](GUIDE.md#llms) · [Markdown copies](GUIDE.md#markdown-copies-for-agents)                                   |
| Check a build, then record it           | [Checking a build](GUIDE.md#checking-a-build) · [Recording the knowledge base](GUIDE.md#recording-the-knowledge-base)                                                                                                  |
| Convert a page I already have           | [Converting an existing page](GUIDE.md#converting-an-existing-page) · [Example 12](examples/12-from-a-single-file/)                                                                                                    |
| Read what the package ships for agents  | [`llms.txt`](llms.txt) (the API index, `CLAUDE.md` imports it) · [`AIKB/`](AIKB/) (per-module notes) · [`examples/`](examples/) · [`types/`](types/) (declarations your editor reads) · [`CHANGELOG.md`](CHANGELOG.md) |
| Move a site between versions            | [Migrating from v1](GUIDE.md#migrating-from-v1) · [`kiss-site-migrate`](plugins/kiss-ssg/skills/kiss-site-migrate/SKILL.md) · [`CHANGELOG.md`](CHANGELOG.md)                                                           |
| Work on kiss-ssg itself                 | [`CLAUDE.md`](CLAUDE.md) (how the repo is run) · [`AIKB/design.md`](AIKB/design.md) (the design and its lineage) · [`AIKB/testing.md`](AIKB/testing.md)                                                                |

Everything above is in **[GUIDE.md](GUIDE.md)**, and the same guide is on the [website](https://cprobert.github.io/kiss-ssg/guide/), one page per section.

---

## Requirements

Node 22.12 or newer. kiss-ssg is an ES module (`import Kiss from 'kiss-ssg'`); `require('kiss-ssg')` also works on Node ≥22.12.

## Development

```sh
git clone https://github.com/cprobert/kiss-ssg.git && cd kiss-ssg
npm install
npm test             # Vitest, single run
npm run gates        # test, lint, typecheck, format and pack: what CI runs
npm run dev          # the docs site, live at http://127.0.0.1:3001 (Ctrl-C to stop)
```

The engine is `lib/`, one responsibility per file, each with a unit test and a note in `AIKB/`. [`CLAUDE.md`](CLAUDE.md) is how the repo is run: the design philosophy, the branch ritual, and the rules the gates enforce.

## Why kiss?

Convention first, and every convention overridable. kiss asks the author nothing it can answer itself — six folders derive from one, helpers register themselves, a page's id is its route, an asset is keyed by the name a template asks for — and refuses nothing the author insists on, because every default is a config key. A convention nobody can override is a cage; an option with no default is a questionnaire.

And the person matters as much as the agent. The structure an agent produces is opened, read and hand-edited by someone sooner or later, so a convention an agent finds convenient and a human cannot follow is the wrong convention. That is what the name is for.

## License

[Apache 2.0](LICENSE).
