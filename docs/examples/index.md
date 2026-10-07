# Examples

Twelve runnable sites ship inside the package, in `node_modules/kiss-ssg/examples/`. Each is a standalone project: copy the folder, run it, change it.

## Whole sites to copy

Start from the one whose situation matches yours rather than assembling a site from the feature examples.

-   ### [From a single file (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/12-from-a-single-file)
    
    A one-page artifact converted into a site that still looks the same: the original kept beside it, the conversion script, a tool that proves the page unchanged, and the site that came out.
    
    Copy this when you already have a page — an AI artifact, an export, a hand-written HTML file — and want a site a web developer could take over.
    
    `cd examples/12-from-a-single-file && node router`
    
-   ### [Blog (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/11-blog)
    
    Posts as a fan-out, pagination, tag pages, an RSS feed, a rename kept alive with aliases, and every internal link written with {{link}}.
    
    Copy this when the site has posts in it: a blog, a news section, a changelog.
    
    `cd examples/11-blog && node router`
    
-   ### [Data-fed site (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/8-data-fed-site)
    
    A site built from a folder of records, each validated in its controller. One record is broken on purpose, so the build fails and says which.
    
    Copy this when the content comes from data you don't control.
    
    `cd examples/8-data-fed-site && node router`
    
-   ### [Versioned outputs (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/7-versioned-outputs)
    
    One build per season into its own folder, published atomically, with an archive index beside them.
    
    Copy this when you publish a new edition beside the old ones.
    
    `cd examples/7-versioned-outputs && node router`
    
-   ### [Migrated from v1 (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/9-migrated-from-v1)
    
    Every v1 to v2 migration recipe as running code, in a site that builds clean and ships a recorded knowledge base.
    
    Copy this when you're moving a v1 project across.
    
    `cd examples/9-migrated-from-v1 && node router`
    

## One feature each

Short scripts that answer a narrower question: which call, which option, which helper.

-   ### [Scan (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/1-scan)
    
    .scan() registers every view in pages/, matching models and controllers by filename.
    
-   ### [Page (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/2-page)
    
    .page() four ways: matched, explicit, an object model with its own extension, and a template string.
    
-   ### [Pages (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/3-pages)
    
    .pages() fans out one page per JSON file, and the index reuses the same array.
    
-   ### [Layouts and partials (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/4-layouts-and-partials)
    
    One layout with blocks, nested .hbs, .html and .md partials, and a partial chosen at render time.
    
-   ### [Helpers (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/5-helpers)
    
    The built-in helpers on one page, plus custom dev-server ports.
    
-   ### [Sitemap and llms.txt (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/6-sitemap)
    
    .sitemap() and .llms() with a siteUrl, per-page tuning, extension-less URLs and hashed assets.
    
-   ### [Asset pipeline (opens in a new tab)](https://github.com/cprobert/kiss-ssg/tree/main/examples/10-asset-pipeline)
    
    An external tool run before the asset copy, kept watching in dev mode, and the four shapes {{asset}} takes.
