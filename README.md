# kiss-ssg

Kiss Static Site Generator, is an open-source MVC html website builder (for node), that leverages handlebar templates to make quick, simple and blisteringly fast websites.

Kiss-ssg uses [handlebar partials](https://handlebarsjs.com/guide/partials.html#partials) and [handlebar-layouts](https://www.npmjs.com/package/handlebars-layouts) to help you make DRY static websites.

Install with `npm install kiss-ssg --save-dev`.

## Requirements

Node 22.12 or newer. kiss-ssg v2 is an ES module: use `import Kiss from 'kiss-ssg'`. Plain `require('kiss-ssg')` also works on Node ≥22.12.

## Using an AI coding agent?

Everything an agent needs ships in the package, so point it at `node_modules` rather than at this README. In the project's `CLAUDE.md` (or the equivalent for your agent), import the cheat-sheet:

```markdown
@node_modules/kiss-ssg/llms.txt
```

That file is the API contract: the pipeline, every method and option, the helpers, the migration recipes. Beside it sit `node_modules/kiss-ssg/AIKB/` (per-module notes), `node_modules/kiss-ssg/types/` (declarations the agent's editor reads) and `node_modules/kiss-ssg/examples/` (eleven runnable sites with a README each — copy the exemplar whose shape matches).

Give the agent a verdict it can act on: `npx kiss-ssg check router.js` runs your build script as a dry run and prints one JSON report per site built, exit 1 on any failure, without touching the published output (see [Checking a build](#checking-a-build)), and `npx kiss-ssg aikb router.js` records what the site is into `AIKB/`, which the agent reads back next time.

If the agent is Claude Code, this repository is also a plugin marketplace. In Claude Code, run:

```
/plugin marketplace add cprobert/kiss-ssg
/plugin install kiss-ssg@kiss-ssg
/plugin install kiss-memory@kiss-ssg
```

The first line registers this repository as a marketplace; the other two install its two plugins. `kiss-ssg` builds sites; `kiss-memory` remembers them — it reads the `AIKB/` folder `npx kiss-ssg aikb <build-script>` records, and the diff `kiss-ssg check` produces against that record by default, so a developer returning after two years can be briefed on what the site is and what bites (`/kiss-memory:kiss-site-brief`), and a piece of work can be framed, steered and closed against the site's own output (`/kiss-memory:kiss-branch-open`, `kiss-branch-pulse`, `kiss-branch-close`) — the baseline moving only when the close records it. Between pieces of work, `/kiss-memory:kiss-memory-consolidate` tidies what the loop accumulates: it folds the session logs' durable lessons into `AIKB/site.md`, an authored page the build never writes, retires feedback that keeps recurring so it stops being surfaced at every open, and repairs the notes `check` reports as stale, dangling or dead. See [`plugins/kiss-memory/`](plugins/kiss-memory/).

The `kiss-ssg` plugin installs four skills, all named `kiss-<something>` so they're easy to spot alongside skills from other plugins — `/kiss-ssg:kiss-site-new` (build a site from a description, or a whole new section on one), `/kiss-ssg:kiss-page-add` (add or update a single page on a site that's already set up), `/kiss-ssg:kiss-site-migrate` (move a v1 project to v2) and `/kiss-ssg:kiss-build-check` (verify a build and read its report). They carry no copy of the API: each points at the docs installed in `node_modules/kiss-ssg/`, so the guidance cannot drift from the engine you have. You don't have to invoke them by name — each skill's description is written for automatic discovery, so a request like "add a page to this site" or "why is my kiss-ssg build failing" reaches for the matching skill on its own. The plugin source is [`plugins/kiss-ssg/`](plugins/kiss-ssg/).
