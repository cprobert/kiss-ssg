---
name: kiss-information-architecture
description: Decide and review how a kiss-ssg site is structured — which pages it has and what type each is, how they group into sections and what each group is called, the navigation layers (global, section, utility, related links, footer), how a reader knows where they are, breadcrumbs, the URL scheme, categories and tags, orphan pages, and the 404 page as a way back in. Use when asked about "information architecture", "IA", "site structure", "the pages a site needs", "navigation", "menu structure", "nav labels", "breadcrumbs", "URL structure", "categories", "taxonomy", "tags", "orphan pages" or "restructure the site", or when planning a new site's pages or adding a section. kiss-site-new and kiss-page-add call it to build, and kiss-site-review calls it to review. Not for the wording of a label or a page (kiss-writing-for-the-web), titles, descriptions and search (kiss-seo), aria-current and landmarks (kiss-accessibility), the mobile menu's mechanics (kiss-front-end), or how the nav looks (kiss-design).
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Information architecture

A site's structure decides whether a reader can predict where something is, recognise it when they see it, tell where they are, and move on to the next thing they need. Build it in this order: **the reader's tasks → the pages that serve them → groups named in the reader's words → navigation that shows the groups → URLs that name them.** Never start from the organisation chart.

Four things are easily confused, and each needs its own decision:

- **the structure:** which pages exist, and in what hierarchy;
- **the navigation:** the part of that structure shown on a page;
- **the taxonomy:** the terms that classify content (categories, tags);
- **the content model:** the fields each type of page carries.

## In a kiss site

- **The folder tree under `folders.pages` is the URL tree.** A page's URL is `/{path}/{slug}`, inferred from where its view is filed unless the registration sets `path` and `slug`, and kiss slugifies both (`node_modules/kiss-ssg/GUIDE.md` § .page()). The hierarchy is decided where the views are filed, and moving a view moves its URL.
- **A section of like items is one `.pages()` fan-out** over a model, one record per item (`node_modules/kiss-ssg/GUIDE.md` § .pages()). That model's shape is the content model for that type of page.
- **The nav is data, kept once:** a list of page ids and labels in the config, rendered in the layout with `{{link}}` and `{{#isActive}}`. With `folderMatch`, a section's nav item stays current on every page inside the section (`node_modules/kiss-ssg/GUIDE.md` § Helpers). `node_modules/kiss-ssg/examples/11-blog/router.js` and its `src/layouts/layout.hbs` are the shape to copy.
- **Every internal link goes through `{{link "<id>"}}`** (`node_modules/kiss-ssg/llms.txt` § Building a site well). A link to a page that does not exist fails the build, and a page that moves takes its links with it. A page that moves also keeps its old URL with `aliases` (`node_modules/kiss-ssg/GUIDE.md` § Redirects).
- **The build already reports** broken links (`links`) and a missing 404 page (`not-found-missing`); `kiss-site-review` says the fix for each. **Nothing reports a page that no other page links to.** The review below measures it.

## Build mode

Settle the structure before the first view is written. Filing views into folders is cheap at the start, and every move after launch costs a redirect.

### 1. Start from the reader's tasks

Write down who the site is for and what they come to do or find, most important first. Take it from the brief, and ask the owner where the brief does not say. Never invent a task, any more than a fact (`kiss-writing-for-the-web` has that rule).

To rank the tasks, weigh how many readers need each one, how much it matters to them and to the business, and what it costs when they cannot find it. The top tasks get the prominent routes. Everything else stays reachable, but the main nav is not a list of everything the organisation offers, each item given equal weight.

Name things by what the reader is doing, not by how the organisation is arranged:

| Organisation-centred | Task-centred                 |
| -------------------- | ---------------------------- |
| Registry             | Certificates and transcripts |
| Commercial services  | Room hire                    |
| Customer operations  | Help and support             |
| Learning division    | Courses                      |

### 2. List the pages, and give each a type

Give each task or thing one page. Two pages for one task compete with each other in search and confuse the reader: `kiss-seo` has the rule ("one main purpose per page"). For a site that already exists (an import, a lift, a restructure), list what is there before moving anything. [references/measure-structure.md](references/measure-structure.md) has the table.

Each page type has its own job. Do not force a page into another type's shape:

- **Home:** shows the site's main sections and routes readers to the top tasks. It does not reproduce the whole site map.
- **Section page:** says in a line or two what the section holds, then routes into it. It earns its place when a section has more than a handful of items, or when readers need context before they choose.
- **Item page** (a service, product, course, event or post): every item of the type shows the same fields in the same order, so readers can compare them. That comes from one fan-out's model shape.
- **Landing page:** only for a need no other page serves, or a purposeful route into a journey. Never a second copy of a section page for one campaign or one search phrase.
- **Form journey:** steps in a line, not a hierarchy. It has a step indicator and a way back to earlier steps, and no breadcrumbs.
- **The 404 page:** a way back in (§ 9).

### 3. Group and name

- **A group is a concept the reader recognises.** Groups do not have to be perfectly exclusive, but each one must be clearly different from its neighbours.
- **Name each group in the reader's words.** The name should be specific enough to predict what is inside, with the key word first. Vague or branded names (More, Explore, Resources, Solutions, a team's internal name) give the reader nothing to go on. How a label is worded is `kiss-writing-for-the-web`'s concern.
- **One concept, one name, everywhere.** The nav label, the page's `<h1>`, its breadcrumb and its URL say the same thing. "Prices" in the nav that opens a page headed "Our rates" at `/fees/` is three names for one page. The home page is the one exception: its nav label and first breadcrumb are "Home", whatever its `<h1>` says.

### 4. Choose the depth

Aim for an obvious choice at each step, not the fewest clicks; there is no three-click rule. A level earns its place when it helps the reader choose, such as a section page that explains its options. A level with one child, or a section that is only a heading, costs a click and tells the reader nothing. A flat list of fifty similar links costs more than two clear levels. The deeper the site, the more it needs breadcrumbs (§ 7) and a second way in (§ 5).

### 5. The navigation layers

| Layer      | Holds                                                             | In a kiss site                                         |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------ |
| Global     | The top-level sections, the same on every page                    | The layout's header, from the config's nav list        |
| Section    | The pages inside the current section                              | A partial the section's views include                  |
| Utility    | Contact, search, sign-in, language                                | Beside the header's sections, kept apart from them     |
| Related    | Links in the content to the next thing a reader may need          | Page ids in the item's model, rendered with `{{link}}` |
| Breadcrumb | The page's ancestors                                              | A partial (§ 7)                                        |
| Footer     | Secondary and institutional pages: privacy, accessibility, policy | The layout's footer                                    |

- **Global nav holds only what is global.** A utility action (Contact, Sign in) is not a content section.
- **On a phone, the menu keeps the same sections in the same order,** and the section's own pages stay reachable. How the menu opens is `kiss-front-end`'s.
- **Every page is linked from at least one other page.** A page that only `sitemap.xml` lists is an orphan.
- **Once a site is more than a handful of pages, give it a second way in** besides the nav: related links, a section index, an HTML site-map page, or a search. WCAG 2.2 requires more than one way to find a page in a set (2.4.5 Multiple Ways, AA). A page that is a step in a process is exempt.

### 6. Show the reader where they are

A reader who lands on a deep page from a search engine should be able to tell where they are without visiting the home page. The page's `<h1>` names the page. The global nav marks its section as current (`{{#isActive}}` with `folderMatch`). The section nav shows the page among its neighbours, and a deep page has breadcrumbs. Marking the current link for screen readers (`aria-current`) is `kiss-accessibility`'s.

### 7. Breadcrumbs

- **Use them where pages sit two or more levels below home** and readers arrive straight from search. This is a judgement, not a researched threshold. Do not use them on a flat site, and never use them as a progress indicator in a form journey.
- **They show the hierarchy, not the reader's history:** Home › Courses › Bread making, whichever way the reader came in.
- **Every crumb except the last is a real page**, linked with `{{link}}`, so a crumb to a page that does not exist fails the build. Each label is that page's own name (§ 3).
- **The markup** is a `<nav aria-label="Breadcrumb">` holding an ordered list, with the current page last (W3C's breadcrumb pattern). `kiss-accessibility` reviews how it is marked.
- **kiss has no breadcrumb helper.** A partial over the page's ancestors is enough, with the ancestors kept in the page's model or set by its controller. The `BreadcrumbList` JSON-LD for search is `kiss-seo`'s.
- **On a phone, a long trail may shorten to the nearest parent,** but never drop it.

### 8. URLs

Readers and search engines both read a URL, so it is part of the structure.

- **Readable words, lower case, hyphenated,** with no ids or query strings. kiss slugifies `path` and `slug` already. Choose the words; do not leave them to a title someone will edit later.
- **Name the lasting concept:** `/courses/bread-making/`. Not `/spring-offer/` (a campaign), not `/learning-division/programmes/` (an org chart that will change), not `/course.php?id=184` (a technology). A date belongs only where the date is the content, as on a news post.
- **Follow the hierarchy where it is stable:** prefer `/courses/bread-making/` to `/bread-making/` when Courses is a real section.
- **One page, one URL.** A deliberate copy names its original with `canonical` (`kiss-seo`).
- **Settle a URL before it is published.** One that moves later keeps its old URL in `aliases` for good.

### 9. Categories, tags and the 404 page

An item has one place in the hierarchy, but it can carry several terms, one for each attribute: subject, level, format, location. Those terms drive tag pages, filters and related links.

- **Each idea gets one term, spelled one way.** "Beginner", "beginners" and "Starter" become three tag pages for one idea.
- **Where terms drive the navigation or a filter,** or more than one person writes them, keep the permitted terms in one model, and have the controller throw on a term that is not in it. A controller that throws fails that one page and the build's verdict with it (`node_modules/kiss-ssg/GUIDE.md` § Waiting for the build); `node_modules/kiss-ssg/examples/8-data-fed-site/` validates its records that way. On a small blog, tags typed onto each post are fine (`node_modules/kiss-ssg/examples/11-blog/` derives its tag pages that way), as long as the review checks for variants.
- **A filter describes an attribute** (Level, Format, Start month). It never repeats the navigation ("Popular", "More courses").
- **The 404 page is a way back in.** It renders inside the site's layout, so the global nav is there. What it says and which routes it offers are `kiss-writing-for-the-web`'s, and `not-found-missing` is `kiss-site-review`'s.

## Review mode

Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, each with its priority and its measurement, one row per cause. A choice the site records is not a finding. A record whose own reason a measurement now contradicts is marked **ask**; the protocol has the rule. Look at the site in a browser as the [browser pass](../kiss-site-review/browser-pass.md) says. Without a browser, the browser checks did not run, and the report says so.

**Measure first.** [references/measure-structure.md](references/measure-structure.md) has a script that reads the build folder and prints, for each page, how many other pages link to it and how deep it sits. Then check:

1. **Orphans.** A page with no links in is reachable only from a search engine. Name each one, and the page that should link to it.
2. **The global nav's labels.** Quote each one. Flag a team's internal name, a brand name, a vague label (More, Explore, Resources, Solutions), and a utility action listed among the content sections.
3. **One concept, one name.** For each global nav item, put its label beside its page's `<h1>` and its URL. Quote each mismatch. "Home" for the home page is not one.
4. **Depth.** Take the deepest pages from the script's output. Does each have breadcrumbs, and does the section nav show it? Flag a level with one child, and a page that lists many similar links with nothing to tell them apart (give the count).
5. **Where am I?** Open a page two levels down. Is its section marked current in the global nav? Does the `<h1>` name the page? Are breadcrumbs there, where § 7 calls for them?
6. **Breadcrumbs.** Every crumb is a real page. The trail matches the URL's hierarchy. None appear in a form journey.
7. **URLs.** Read every `<loc>` in `sitemap.xml`. Flag capitals, underscores, ids or query strings, campaign words, a date on content that is not dated, and an organisation name.
8. **Terms.** List the distinct values of each term field across a fan-out's records. Flag two spellings of one idea, and a filter that repeats the navigation.
9. **A second way in.** On a site beyond a handful of pages, is there a way to find a page other than the global nav?
10. **The 404 page** renders inside the layout, with the global nav.

Leave competing and moved pages to `kiss-seo`'s review, a label's wording to `kiss-writing-for-the-web`'s, and `aria-current` to `kiss-accessibility`'s, so that no finding is reported twice.

## Sources

The guidance behind these rules is listed in [references/sources.md](references/sources.md).
