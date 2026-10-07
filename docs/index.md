# Build a professional website with AI — or upgrade the one you made in Claude or ChatGPT

kiss-ssg turns a description, or a site you already have, into a website you can host anywhere, edit yourself and hand to a developer. It checks every build before it goes live. Free and open source.

`npx kiss-ssg@latest init` Copy

[Read the guide](https://cprobert.github.io/kiss-ssg/guide/)

## What you need to build a website with AI

Install the first two before you start. The other two keep your work safe and put it online — free plans are plenty for a small site.

-   [Node.js (opens in a new tab)](https://nodejs.org) Required
    
    Runs kiss and builds your site. Version 22.12 or later — the LTS download is fine.
    
-   Claude Code or Codex Required
    
    The coding agent that writes the site for you: Anthropic's Claude Code or OpenAI's Codex. Either works with kiss's skills, and each needs its own account — a Claude account for Claude Code, a ChatGPT account for Codex.
    
    -   [Claude Code (opens in a new tab)](https://claude.com/claude-code)
    -   [Codex (opens in a new tab)](https://learn.chatgpt.com/docs/codex/cli)
    
-   [Git (opens in a new tab)](https://git-scm.com) Recommended
    
    Keeps every version of your site, so any change can be undone. Push it to GitHub, GitLab or Bitbucket to keep a copy online — the hosts below publish straight from GitHub, and most from GitLab or Bitbucket too.
    
    -   [GitHub (opens in a new tab)](https://github.com)
    -   [GitLab (opens in a new tab)](https://gitlab.com)
    -   [Bitbucket (opens in a new tab)](https://bitbucket.org)
    
-   A host To go live
    
    Puts the finished site on the web. Each builds it from your repository with npm run build and publishes the public folder; each link is that host's own guide to doing it.
    
    -   [GitHub Pages (opens in a new tab)](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
    -   [Netlify (opens in a new tab)](https://docs.netlify.com/configure-builds/overview/)
    -   [Cloudflare Pages (opens in a new tab)](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)
    -   [Vercel (opens in a new tab)](https://vercel.com/docs/builds/configure-a-build)
    -   [Firebase Hosting (opens in a new tab)](https://firebase.google.com/docs/hosting/quickstart)
    

## From nothing to a live website in six commands

With Node.js and Claude Code or Codex installed, these do the rest.

1.  ### Set it up, in a new folder
    
    init installs kiss-ssg, adds a starter site and the build scripts, and points your agent at the API contract. For Claude Code and Codex, the three plugin lines install kiss's skills and the last line opens your agent. Pick the agent you use.
    
    Your coding agent Claude CodeCodexOther agent
    
    #### Claude Code
    
    Copy
    
    ```bash
    mkdir my-site && cd my-site
    npx kiss-ssg@latest init
    claude plugin marketplace add cprobert/kiss-ssg --scope project
    claude plugin install kiss-ssg@kiss-ssg --scope project
    claude plugin install kiss-memory@kiss-ssg --scope project
    claude
    ```
    
    The plugins install for this folder. init declares them in the site's settings, but a declared plugin is not installed until these lines run.
    
    #### Codex
    
    Copy
    
    ```bash
    mkdir my-site && cd my-site
    npx kiss-ssg@latest init
    codex plugin marketplace add cprobert/kiss-ssg
    codex plugin add kiss-ssg@kiss-ssg
    codex plugin add kiss-memory@kiss-ssg
    codex
    ```
    
    init enables the plugins for this folder in .codex/config.toml, but Codex installs them once, for your user, and that also switches them on in every folder: your next site needs only the first two lines and codex.
    
    #### Other agent
    
    Copy
    
    ```bash
    mkdir my-site && cd my-site
    npx kiss-ssg@latest init
    ```
    
    For Cursor, Copilot and any other agent: kiss's skills install through Claude Code's and Codex's plugin systems, so yours will not have them — leave the skill names out of the prompts below. init writes AGENTS.md, which points your agent at node\_modules/kiss-ssg/llms.txt; if yours does not read AGENTS.md, ask it to read that file first. Then open your agent in this folder, describe the site, and have it run npm run check.
    
2.  ### Say what you want
    
    In your agent, paste one of these.
    
    -   A new site
        
        Change the business, the host and the address: kiss writes the sitemap, the feed and every canonical link from them.
        
        Use the kiss-site-new skill to build me a site for a small bakery in Leeds: home, menu, about, and a news section for seasonal specials. It will be served by Netlify at https://kirkgate-bakery.co.uk. Run the build check when you're done.
        
    -   A site you made in Claude or ChatGPT
        
        kiss is its upgrade path. Paste the link to the published artifact or share in place of the one below — or, if you have it as an HTML file, put it in the folder and name the file instead.
        
        Use the kiss-site-import skill to turn https://claude.ai/public/artifacts/… into a real site, keeping exactly how it looks. Run the build check when you're done.
        
3.  ### See it, and check it
    
    npm run dev serves the site with live reload at the address it prints (localhost:3001 by default) and keeps running — Ctrl-C to stop. npm run check reports every page, broken link and missing launch detail, and publishes nothing: exit 0 means it's right. npm run build writes the site to public/ to deploy.
    
    ```bash
    npm run dev
    npm run check
    ```
    

kiss is the upgrade path for a site you made in Claude or ChatGPT: converting keeps it looking exactly the same and gives it a layout, partials and content a web developer could take over: [how converting works](https://cprobert.github.io/kiss-ssg/guide/converting/).

## Why kiss-ssg suits AI coding agents

-   ### Conventions, not questions
    
    Folders, routes, helpers and asset names all have defaults, so an agent has fewer choices to get wrong, and every default can be overridden.
    
-   ### A verdict, not a log
    
    A failed page or a link to a page that doesn't exist fails the build. Mistakes can't ship quietly.
    
-   ### Readable by the next person
    
    Handlebars views, JSON models and small controllers. Whoever opens the site in two years can follow what the agent wrote.
    
-   ### A memory of the site
    
    npx kiss-ssg aikb records what the site is, so the next session starts from facts rather than guesses.
    

## Websites built with kiss-ssg

-   ![Diploma MSc's home page: a banner reading Online Postgraduate Qualifications For Healthcare Professionals with a course search, above the University of South Wales and University of Buckingham logos.](https://cprobert.github.io/kiss-ssg/img/sites/diploma-msc.webp)
    
    ### [Diploma MSc (opens in a new tab)](https://www.diploma-msc.com/)
    
    Online postgraduate certificates, diplomas, MScs and MBAs for healthcare professionals, delivered with university partners including the University of Buckingham.
    
-   ![A1K9 Training's home page: a woman hugging a pale dog behind the heading A well behaved dog is a joy to live with, under a dark green navigation bar.](https://cprobert.github.io/kiss-ssg/img/sites/a1k9-training.webp)
    
    ### [A1K9 Training (opens in a new tab)](https://www.a1k9training.co.uk/)
    
    Gaynor Probert's dog behaviour and training academy: weekend group courses at Pontarddulais, and behaviour consultations at the academy or at home.
    
-   ![Pro Plumbing's home page: the heading Local plumber in Aberdare with a WhatsApp Greg button and Google reviews, beside a photo of a fitted grey bathroom with a lit round mirror.](https://cprobert.github.io/kiss-ssg/img/sites/pro-plumbing.webp)
    
    ### [Pro Plumbing (opens in a new tab)](https://pro-plumbing.trade/)
    
    Greg Probert's plumbing business in Aberdare and the Cynon Valley: small jobs and bigger installs, booked by WhatsApp or a call-back.
    
-   ![K9 Solutions' home page: the heading Better walks start here in white on black, beside a photo of two German Shepherds lying in front of Cyfarthfa Castle.](https://cprobert.github.io/kiss-ssg/img/sites/k9-solutions.webp)
    
    ### [K9 Solutions (opens in a new tab)](https://k9solutions.uk/)
    
    One-to-one dog training in Merthyr Tydfil: practical coaching for puppies, family dogs and problem behaviour, at Cyfarthfa Park, at home or remotely.
    
-   ![Learna's home page: a navy banner reading Welcome to Learna with a course search box, above Medical School and Business School course tiles.](https://cprobert.github.io/kiss-ssg/img/sites/learna.webp)
    
    ### [Learna (opens in a new tab)](https://www.learna.ac.uk/)
    
    Online postgraduate education for medical and business professionals: PGDips, MScs, exam revision and an eMBA, across a medical school and a business school.
    

Writing it yourself instead? The [guide](https://cprobert.github.io/kiss-ssg/guide/) covers every method, option and helper.
