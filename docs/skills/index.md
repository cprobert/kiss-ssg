# Skills

kiss comes in two parts: the kiss-ssg engine, and the skills a coding agent follows to use it well. Each part is useful on its own. Together, your agent builds the site, checks it, reviews it and remembers it.

## Two parts

-   ### The engine
    
    From npm: kiss-ssg.
    
    A static site generator for Node. It turns Handlebars views, JSON models and small JavaScript controllers into a site you can host anywhere. It checks every build before it goes live, records what the site is made of, and upgrades a site from one version to the next. Any coding agent can drive it: the package ships its own short API guide, llms.txt, for the agent to read.
    
    -   `npx kiss-ssg check` builds the site without publishing it and reports every failed page and broken link
    -   `npx kiss-ssg aikb` records the site's knowledge base, so later work can see what changed
    -   `npx kiss-ssg@latest upgrade` installs a new version, checks it really landed, and prints what changed
-   ### The skills
    
    From this repository's plugin marketplace, for Claude Code and Codex.
    
    Step-by-step recipes and web know-how that a coding agent follows: how to start a site, add a page or review one for launch, and how to get the words, structure, search, accessibility, front end and design right. They install on their own, from this repository rather than from npm, and they work in Claude Code and Codex alike.
    

## How they work together

A skill holds the judgement, and the engine does the mechanical part. A skill never guesses whether a build worked or what changed: it runs one of the engine's commands and acts on the report.

The task skills do a job on a site, such as building it, adding a page or upgrading it. When a job needs web expertise, the task skill opens the domain skill that holds it, so each area is written down in one place an expert can review.

The memory skills keep a site's history. Each piece of work starts with what it is meant to do, is checked against that as it goes, and ends with a short reflection. The next session, or the next developer, reads that record instead of starting cold.

## The kiss-ssg plugin

Building, checking, reviewing and upgrading a site, and the web expertise those jobs call on.

### Task skills

Each does one job on a site.

-   #### [kiss-site-new (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-site-new/SKILL.md)
    
    Builds a new site from a description, or adds a whole new section to one.
    
-   #### [kiss-site-import (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-site-import/SKILL.md)
    
    Turns a page you already have into a site and keeps its look: a Claude or ChatGPT artifact, a live page, an HTML file.
    
-   #### [kiss-page-add (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-page-add/SKILL.md)
    
    Adds or updates a page on a site that is already set up, following the page most like it.
    
-   #### [kiss-build-check (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-build-check/SKILL.md)
    
    Checks that the site builds without publishing it, and reads the report: failed pages, broken links, the launch audit.
    
-   #### [kiss-site-review (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-site-review/SKILL.md)
    
    Reviews a site for launch: the build's audit, then every domain skill's review, in one report by priority, before anything is fixed.
    
-   #### [kiss-site-migrate (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-site-migrate/SKILL.md)
    
    Upgrades a site to a new kiss-ssg version: installs it with the upgrade command, works through each change it lists, and proves the site still builds the way it did.
    

### Domain skills

Each holds one area of web expertise. The task skills open them when a job needs them; you can also ask for one by name.

-   #### [kiss-writing-for-the-web (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-writing-for-the-web/SKILL.md)
    
    The words on the site: page copy, headings, links and buttons, form labels and errors, titles and descriptions. Never invents a fact about the business.
    
-   #### [kiss-information-architecture (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-information-architecture/SKILL.md)
    
    How the site is organised: which pages exist, how they are grouped and named, the navigation, breadcrumbs and URLs.
    
-   #### [kiss-seo (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-seo/SKILL.md)
    
    Being found in Google and AI search: titles and descriptions, robots.txt and AI crawlers, structured data, sitemap dates, and the work only the owner can do.
    
-   #### [kiss-accessibility (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-accessibility/SKILL.md)
    
    Building and reviewing to WCAG 2.2 AA: labels, the skip link, keyboard focus, contrast, target size, zoom and motion.
    
-   #### [kiss-front-end (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-front-end/SKILL.md)
    
    The markup, CSS and scripts the site ships: image sizes, built-in browser features before script, phones, touch, and sideways scrolling.
    
-   #### [kiss-design (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-ssg/skills/kiss-design/SKILL.md)
    
    The look of the site and the craft under it, including a design lift for a site that looks generated or unfinished.
    

## The kiss-memory plugin

A memory for a site: what it is, what each piece of work was for, and what was learned.

### Memory skills

They work on the knowledge base the engine records, and on one short session log per piece of work.

-   #### [kiss-site-brief (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-memory/skills/kiss-site-brief/SKILL.md)
    
    Catches you up on a site: what it is, how it is built, what changed lately, what is still open and what to watch out for.
    
-   #### [kiss-branch-open (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-memory/skills/kiss-branch-open/SKILL.md)
    
    Writes down what a change is meant to do before any of it is done, then starts the branch for it.
    
-   #### [kiss-branch-pulse (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-memory/skills/kiss-branch-pulse/SKILL.md)
    
    A checkpoint during the work: checks the build, compares the changes with what was planned, and decides whether to go on, adjust or finish.
    
-   #### [kiss-branch-close (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-memory/skills/kiss-branch-close/SKILL.md)
    
    Finishes a piece of work: checks the build against the plan, records the knowledge base, writes the reflection and pushes.
    
-   #### [kiss-branch-merged (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-memory/skills/kiss-branch-merged/SKILL.md)
    
    Tidies up after the pull request merges: confirms the merge, brings the base branch up to date, and removes only what this piece of work created.
    
-   #### [kiss-memory-consolidate (opens in a new tab)](https://github.com/cprobert/kiss-ssg/blob/main/plugins/kiss-memory/skills/kiss-memory-consolidate/SKILL.md)
    
    Between pieces of work, folds the lessons that keep coming back into the site's own notes, and fixes notes that have gone stale.
    

## Install them

The skills install from this repository's marketplace, not from npm. The commands for Claude Code and Codex are in the [quick start on the home page](https://cprobert.github.io/kiss-ssg/#how), and `npx kiss-ssg init` prints them too. A site that only declares the plugins does not have them until those commands run. With any other agent, the engine still works: point the agent at `node_modules/kiss-ssg/llms.txt`.
