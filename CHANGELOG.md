# Changelog

Written for people building a site with kiss-ssg, not for people maintaining it.
Newest first. `/branch-close` adds an entry alongside each version bump.

## 2.13.2 — 2026-11-06

A security release, from a review of the whole engine. One fix matters to any site that
uses `config.consent`; the rest keep an API token out of the places a build writes and
prints, and hold two values to the form they are written in.

- **The consent script only ever loads from your own site.** The script kiss puts in every
  page's `<head>` works out where its cached file is from the page's address. On a "not
  found" page, an address written for the purpose could point it at another site, and the
  file it fetched from there ran as part of yours. It now loads from the page's own host
  or not at all. When the host answers "not found" for the address it worked out, it
  tries the site's root. A host that answers every unknown address with a page and
  status 200, as a single-page-app rewrite does, gives it no error to act on, so on a
  wrong address there the consent controls do nothing; sending
  `X-Content-Type-Options: nosniff`, which `securityHeaders: true` does, makes the
  browser refuse that answer and the fallback runs (measured in Chromium 158).
- **A token in `fetch.headers` stays out of what kiss writes.** Each page's copy of the
  config now holds the header names with every value reading `[redacted]`, so
  `{{{stringify this}}}` or a controller that copies `config` cannot put the token into a
  page. A value that is unset or empty is shown as it is, so a missing environment
  variable is visible. The dev `.json` file beside each page and `.viewStats()`'s `debug.json` no longer
  hold `config` at all, and the `verbose` log prints the header values as `[redacted]`.
  The request for a URL model still sends the real headers. A header that cannot be sent,
  such as a token with a line break in it, now fails with a message that names the header;
  Node's own message printed the value.
- **A model URL is recorded without its query values.** In the site map and
  `last-build.json` that `kiss-ssg aikb` writes, in `kiss-ssg check`'s output, in the log
  and in a failed fetch's message, `?access_token=SECRET&type=course` is shown as
  `?access_token=[redacted]&type=[redacted]`, and any `user:pass@` and `#fragment` are
  dropped. A URL that cannot be read as one is shown with nothing before its last `@`,
  or as `https://[redacted]` when a password in it cannot be told from its query. The
  request itself is unchanged. A token belongs in `fetch.headers`, not in the URL
  (GUIDE.md § Remote models).
- **`{{embed}}` takes only an http(s) address for its frame.** A `src=` from page data,
  and a service's own `embed.src` and `embed.watch`, must be an `https://` or `http://`
  URL, a path on your site, or `//host/…`. Anything else, such as `javascript:`, fails
  the page in a build and is left out with a warning under `--dev`.
- **A `{placeholder}` in a service's `inline` script cannot leave its string.** The value
  is URL-encoded as before, and every character that could end the string or the
  `<script>` element is then escaped.

Measured: a real site of 20 pages, built from the packed 2.13.0 and from this release,
gives the same 472 files, byte for byte.

### Upgrading

- **If your site uses `config.consent`, rebuild and redeploy it.** The script is written
  into every page, so the fix reaches a visitor only from a new build. If you send a
  Content-Security-Policy with a hash for that script, take the hash again.
- **`{{embed … src=…}}` with an address that is not http(s) now fails the page.** So do a
  service's `embed.src` and `embed.watch`. An `https://` URL, a root-relative path and
  `//host/…` render as before.
- **`config.fetch.headers` values read `[redacted]` in templates and controllers.** The
  header names are still there, and kiss's own fetch is unaffected. A controller that
  makes its own request reads the token from `process.env`, where it should be kept, not
  from `config`.
- **The dev `.json` file and `debug.json` no longer hold `config`.** Anything that read
  it from there reads the build script instead.
- **A placeholder in an `inline` script is data, never code.** Inside quotes nothing
  changes. An unquoted placeholder whose value holds `'`, `(`, `)`, `!`, `~` or `*` is now
  escaped and becomes a syntax error in the browser: put the placeholder in quotes.
- **If a model URL has a query string and you commit your `AIKB/` folder,** run
  `npx kiss-ssg aikb <script>` and commit the result: the URL's rows are rewritten with
  `[redacted]` values, and no note file moves. If a token was in that URL, it is still in
  your git history, so replace it with a new one at the service and move it to
  `fetch.headers`.
- **A failed model fetch's message is now written by kiss.** Each begins
  `Model fetch failed: <the URL, redacted> →` and then says what happened:
  `404 Not Found`, `ECONNREFUSED 127.0.0.1:8080`,
  `200, but the body is not JSON (text/html)`. Nothing of the server's own status text
  or body, or of Node's error text, is shown, and the error object has no `cause`
  property. A timeout keeps its own sentence. If a script of yours matches the old text
  (`fetch failed`, `Unexpected token`), change it.

## 2.13.1 — 2026-11-06

kiss can now write a light set of security headers for you, and a new `kiss-security`
skill helps you decide on the stronger ones. Both are opt-in: nothing changes for a site
that does not turn them on.

- **`securityHeaders: true`** adds four set-and-forget headers to the host's header
  file, beside kiss's cache headers: `Strict-Transport-Security: max-age=63072000`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`
  and `Permissions-Policy: geolocation=(), camera=(), microphone=()`. `host` picks the
  file: `_headers` for Netlify and Cloudflare Pages, `security-headers.firebase.json`
  to merge into `firebase.json` for Firebase. Off by default (GUIDE.md § Security
  headers).
- **Check for location, camera and microphone first.** `Permissions-Policy` turns them
  off, on the live site only. If your site uses one, set your own `Permissions-Policy`:
  in `src/assets/_headers`, which kiss then leaves alone, or in `firebase.json` on
  Firebase.
- **Your own headers win.** A header your `_headers` sets, on any path, is left out of
  kiss's block, and the build says so.
- **No Content-Security-Policy, framing header or `includeSubDomains`** by default: each
  costs upkeep or can lock visitors out. The `kiss-security` skill explains when to add
  them and what each costs.
- **With `cleanBuild: false`**, the build now warns when the folder still holds kiss's
  header output that this build did not write, such as after you turn
  `securityHeaders` off. Delete it by hand; kiss never deletes it, since another `Kiss`
  instance may share the folder. kiss's cache headers now merge into an existing
  `_headers` rather than replacing it.

### Nothing for a site to change

## 2.13.0 — 2026-11-06

kiss-ssg now needs **Node 22.23.4 or later**, the current Node 22 LTS release, and takes
the first round of dependency updates since Dependabot was switched on.

- **Node `>=22.23.4`** (`engines.node`). The dev watcher's new chokidar needs 22.22, and
  22.23.4 is the Node 22 security release of 2026-10-20.
- **chokidar 6**, under `--dev`. The rewritten watcher confirms each change against the
  file system before reporting it, which its release notes say fixes missed and doubled
  events on Windows. Nothing in your site changes, and a live reload still follows a save.
- **htmlparser2 12**, which kiss uses to convert a page you import (`splitDocument`) and
  to check consent and learning-package markup. Its HTML parsing now follows the browser
  standard. No built page changed in this repository's examples or on a real site
  rebuilt from this release.
- **sass 1.108**, and smaller updates to fs-extra and kiss-ssg's development tools.

Measured: this repository's docs site and all 14 examples build byte-identical before and
after, apart from the pages that state the Node version. A real site built from the
packed release gives the same 7 pages, the same audit and no broken links.

### Upgrading

Update Node first. Check with `node --version`: anything below `v22.23.4` needs the
current Node 22 LTS, or Node 24, from nodejs.org or your version manager. If your
project pins Node in `.nvmrc`, `.node-version` or your host's build settings (Netlify's
`NODE_VERSION`, a GitHub Actions `node-version`), raise it there too, or the host builds
on the old one. Then:

```bash
npx kiss-ssg@latest upgrade
```

On an older Node, npm warns that kiss-ssg needs a newer one and installs it anyway (unless
your npm sets `engine-strict`), so take the warning as the reason to update.

## 2.12.3 — 2026-11-06

A security release: kiss-ssg's own dependencies, with nothing in the API changed.

- **handlebars `^4.7.10`.** Two critical advisories ("JavaScript Injection via AST Type
  Confusion in compile", a bypass of CVE-2026-33937, and "JavaScript Injection via Own Property
  Check Bypass") and one moderate ("Unsafe Inline Embedding of Precompiled Templates") are
  fixed in 4.7.10. kiss
  compiles your templates with it on every build. kiss now requires that version, so a site
  that installs kiss-ssg cannot resolve an older one.
- **glob 14** (from 13), with the patched `minimatch` and `brace-expansion` under it. kiss
  calls it in one place, with fixed patterns, so which files a build picks up is unchanged.
- **`source-map-js` 1.2.2**, through postcss, for a denial-of-service advisory.

Measured: this repository's docs site and all 14 examples build byte-identical before and
after the update.

### Upgrading

Take this release, for the handlebars fix:

```bash
npx kiss-ssg@latest upgrade
```

Nothing in a site changes. `npx kiss-ssg check <script>` should report the same pages, with
no diff against your last record. A site whose own `package.json` pins `handlebars` or `glob`
directly can drop that pin, or raise it to these versions.

## 2.12.2 — 2026-11-05

Page ids and `{{embed}}`, from what two sites on 2.12 asked for.

- **A CommonJS build script can reach `toSlug`.** `require('kiss-ssg')` returns the `Kiss` class,
  and every named export is now a static on it: `Kiss.utils.toSlug(slug)`, `Kiss.renderRedirects`
  and the rest.
- **The audit's new `id-slug-mismatch`** names a page whose explicit `id` was built from its slug
  as the data gave it (`` id: `blog/${slug}` ``), when kiss cleaned that slug up before writing the
  page (a trailing space, a leading `-`). The id is kept as written. Build it from
  `utils.toSlug(slug)` instead.
- **`ids: 'path'` makes a page's default id where it is served**: `c/acute.html` is `c/acute`,
  `courses/index.html` is `courses`, and the home page is `index`. A site whose pages share views,
  such as pagination or a catalog that picks the view per item, then needs no explicit ids. The
  default is still `'view'`. The build report gains `ids`, and the rename finding `moved` pairs
  pages only when the last record used the same setting.
- **`{{embed … poster='img/still.jpg'}}`** shows a still from your own site, drawn by the
  `{{image}}` pipeline, under a dark strip with white text and a play mark on a video, so the box
  looks like a video. Restyle it with `--kiss-embed-poster-scrim` and `--kiss-embed-poster-text`.
  A URL from another site is refused, since fetching it before the click is the request the box
  exists to prevent.
- **A video plays on Load.** A `youtube` or `vimeo` embed's button says "Play video", its
  screen-reader name adds the `title=`, and pressing it starts the video (`autoplay=false` turns
  that off). Measured in desktop Chromium; iOS Safari may still ask for a tap.
- **Embed wording without `config.consent`**: `load=`, `notice=` and `open=` on one embed, or
  `embeds: { text }` in the config for every embed, with the keys `ui.text` uses.

### Upgrading: what a site may notice

Nothing fails, and only an `{{embed 'youtube'}}` or `{{embed 'vimeo'}}` page changes:

- its button now says **Play video** rather than **Load it**, and the video starts on that press.
  Put `autoplay=false` on an embed to keep the old two-press behaviour. A site that translated
  `ui.text.embedLoad` keeps its own word on videos too; set `ui.text.embedPlay` to word them apart.
- Every Load button gains an `aria-label`, `<its words>: <title=>`, so check that each embed's
  `title=` says what it is.
- `AIKB/last-build.json` gains `"ids": "view"` at the next `npx kiss-ssg aikb`. Commit it.

`ids: 'path'` is opt-in. Before switching an existing site to it, read the checklist in GUIDE.md
§ .pages(): links by view route, the `cookies` and `privacy` page ids, and any learning-package
page relying on a default id.

## 2.12.1 — 2026-11-05

The audit's `consent-missing` now reports a Google Maps frame on a site without `config.consent`.
The guide always said it would, but kiss compared only the frame's origin
(`https://www.google.com`) with its tracker list, and the Maps entry there is `www.google.com`
under `/maps`, so it never matched. kiss now matches the frame's whole address. A `www.google.com`
frame outside `/maps`, such as reCAPTCHA, is still not reported, and nor is `{{embed 'google-maps'}}`.

### Upgrading: a raw Google Maps frame now raises `consent-missing`

Only a site with no `config.consent` and an `<iframe>` from `www.google.com/maps` sees anything new:
one advisory `consent-missing` finding per page, naming `https://www.google.com`. Nothing fails.
The fix is to load the map when the visitor asks for it, with
`{{embed 'google-maps' src='…' title='…'}}`, which needs no `config.consent`. A site that already
has `config.consent` is unaffected: there, an ungated frame was already `consent-ungated`.

## 2.12.0 — 2026-11-05

A release about speed. The new `kiss-performance` skill builds and reviews how fast a site loads,
and the engine gained the mechanisms it relies on.

- **`{{image}}` serves a photo responsively.** Write
  `{{image 'img/hero.jpg' alt='…' sizes='(min-width: 60rem) 50vw, 100vw'}}` and kiss writes a
  `<picture>` with AVIF and WebP at the widths the layout needs, plus a resized fallback, `width`
  and `height` read from the file, and lazy loading. `eager=true` marks the first image a visitor
  sees. The photo is turned the right way up, and its GPS and camera data are stripped. On a
  3,800 px, 504 KB photo, a phone gets a 4.9 KB AVIF. The encoder is `sharp`, now a dependency.
- **Encoded images are kept in a cache the site commits**, `.kiss-cache/images`, so a deploy
  copies them rather than encoding them again. `npx kiss-ssg images router.js` fills and prunes that
  cache, and lists original photos that carry a GPS location or are wider than kiss ever serves.
  With `--write` it rewrites those originals in `src/`.
- **Copied CSS and JS are minified** outside dev (`assets.minify`, on by default).
- **`assets.purge` removes the CSS no written page uses** from a framework stylesheet you name,
  such as Bootstrap's, and re-hashes and relinks it. On one site, 100 KB became 30 KB.
- **`host` says where the site is deployed** (`'netlify'`, `'cloudflare'`, `'firebase'`,
  `'vercel'` or `'github-pages'`). kiss then writes that host's redirects file and, on Netlify,
  Cloudflare Pages and Firebase, its header file, so every content-hashed file is cached for a
  year. GitHub Pages cannot be configured, and Vercel's headers are the site's to write.
- **`npx kiss-ssg speed public`** measures a built site with Lighthouse, if the site installs it,
  and compares one run with an earlier one. **`npx kiss-ssg css public`** reports where the site's
  CSS goes: each stylesheet's size, which pages link it, and how much of it no page uses.
- **`{{embed 'soundcloud' id='…'}}`** is a click-to-load SoundCloud player.
- **The audit has nine new checks:** `img-dimensions-missing`, `img-first-lazy`,
  `fetchpriority-excess`, `font-preload-excess`, `script-blocking`, `host-unset`,
  `img-not-responsive`, `image-oversized` and `image-location-metadata`.
- **The link check no longer reports `../` above the site's root as broken**, when the site is
  served at the root. A browser stops there, so `../img/x` from the home page is `/img/x`.

The `kiss-site-review` skill now asks which groups of reviews to run: content and discovery,
interface and usability, legal and compliance, and speed and performance.

### Upgrading

- **Every site's CSS and JS change bytes, and their hashed names change**, because they are
  minified now. Nothing else on the page moves. A file that must stay as it is can be named
  `*.min.js` or `*.min.css`, or the site can set `assets: { minify: false }`. A stylesheet that
  uses native CSS nesting is left unminified, with a warning, because the minifier would drop
  the nested rules.
- **A page that loads its own CSS or JS with an `integrity` attribute now fails the build** if
  minifying or purging changed that file, because a browser would refuse it. The message names the
  page; rename the file `*.min.*`, turn minify off, or take the hash of the file the build writes.
- **Expect new audit findings**, from the nine checks above. Most are one edit in the layout.
  `kiss-site-review` has the fix for each.
- **`sharp` is installed with kiss-ssg** (about 29 MB on Windows), whether or not the site uses
  `{{image}}`.
- **If you use `{{image}}`, commit `.kiss-cache/images`.** A build that had to encode prints a line
  saying so. The cache folder must be a folder of its own: `new Kiss()` refuses one that is the
  project root or overlaps the site's `src`, assets or build folder.
- **If your `.gitignore` ignores the whole of `.kiss-cache/`**, as the old fetch-cache example
  suggested, change it to `.kiss-cache/fetch/` and point `fetch.cache` there, or the image cache is
  never committed.
- **Set `host`** to where the site is deployed. Until you do, a site with hashed files is told so
  once by `host-unset`.

## 2.11.3 — 2026-11-04

`{{consentEmbed}}` is now `{{embed}}`, and it works on any site. On a site with no `config.consent`
it writes a click-to-load box with a notice, a Load button and a link to the video or post on the
provider's own site. Nothing is fetched or stored until the visitor presses Load, so it needs no
cookie banner and nothing in `<head>`. On a site with `config.consent` it works as
`{{consentEmbed}}` did, with Always allow and the stored choice. Write it as
`{{embed 'youtube' id='VIDEO_ID' title='What the video shows'}}`.

A new `instagram` preset embeds a post or a reel by its id. The box holds the space its frame will
take, so a video loads without moving the page. An Instagram post can't do that, because its height
is only known once it loads: the box starts at 600 px and then takes the post's own height (568 px
on a phone and 883 px on a desktop, in the post measured). On a learning package's page, `{{embed}}`
is now allowed, and is always the plain click-to-load box, even on a consent site. An LMS's own
security settings may still block the frame, so press Load inside the LMS before a course goes
live. Each page's Markdown copy shows an embed as its link to the provider.

### Upgrading: rename `{{consentEmbed}}` to `{{embed}}`

- **`{{consentEmbed …}}` no longer exists.** Replace it with `{{embed …}}`, with the same arguments.
  The build fails on the old name until you do.
- **If you hand-built a click-to-load box for a video**, `{{embed}}` can replace it.
- **A `storage` entry can say which kind it is**: `kind: 'local'` (the default, as before),
  `'session'` or `'indexeddb'`. The cookie table names the kind, where every entry used to say
  "Local storage". Withdrawing consent still deletes `local` entries only: a `session` item ends
  when the tab closes, and an `indexeddb` database is listed in the table, not deleted. A `kind` on a `cookies` entry fails the build.
- **The `youtube` preset lists one more item**, the IndexedDB database `YtIdbMeta`, in the cookie
  table. The purposes `version` and the banner hash do not change, so visitors are not asked
  again.
- **The embed box's size is now set inline** on the box and its frame. The consent theme no longer
  styles `.kiss-embed iframe`. If your CSS sizes the box or its iframe, check the embed still looks
  right.

## 2.11.2 — 2026-11-04

The consent settings dialog now names who relies on each choice. Under each category's description
it lists every service in that category as "label (provider)", for example "YouTube (Google)". The
ICO says consent for categories of third-party companies is not specific enough on its own. The
dialog's choices now put Accept all first, as the banner does. The cookie policy and consent history
links move to the dialog's footer, centred under the buttons. Each provider's name, in the dialog
and in the cookie table, links to that company's own privacy policy when the service has one.

The `kiss-branch-close` skill (in the `kiss-memory` plugin) now opens the pull request when it
closes a branch, instead of only when asked. When `gh` is missing or signed out, it says so and
gives the command, and the close still finishes.

### Upgrading: expect new banner hashes, and a fresh banner on sites with YouTube

Only a site with `config.consent` is affected. Its code changes only if a service sets a `policy`
that is not a web address.

- **Every banner hash moves.** The hash is taken over the banner and the dialog, and the dialog now
  holds the service list. With an `endpoint`, records carry the new hashes and
  `consent-banners.json` holds the new text. A provider you change later moves the hash again.
- **The `youtube` preset's provider is now Google.** The provider is part of the purposes
  `version`, so a site that uses the preset gets a new `version`, and its visitors see the banner
  again. That is deliberate: the company named as relying on the consent has changed. To keep the
  old version, set `version` yourself in `config.consent`.
- **The embed's buttons name the service**: "Always allow YouTube" and "Open it on YouTube". The
  notice still names the provider ("hosted by Google"). The default wording now uses a new
  `{service}` placeholder, which holds the service's label. Your own `ui.text` wording with
  `{provider}` works as before.
- **A service's `policy` must be an `http://` or `https://` URL**, the provider's privacy policy.
  It is now a link, so anything else fails the build and names the service. Fix it, or remove it to
  show the provider unlinked.
- **A new `ui.text` key, `servicesLabel`** ("Services"), is the screen-reader name of each service
  list.
- **The inline consent CSS grows by 173 bytes**, from 7,078 to 7,251. If you style the dialog yourself, the
  links are now in `.kiss-consent-dialog__links` inside `.kiss-consent-dialog__foot`, not in
  `.kiss-consent-dialog__body`.

## 2.11.1 — 2026-11-04

The consent manager keeps a history of each visitor's choices, and shows it to them. Every choice
is kept in the visitor's own browser, and with an `endpoint` sent to your server. Each choice now
names every service it allowed and every one it refused, because the services behind a category
change over time and a record has to say what was agreed to then. `{{consentRecord}}` on your
privacy page shows the visitor that history and the consent id to quote in a request for their
data. The client is now split in two: a small part inline in the head, and a file every page loads,
which the browser caches.

### Upgrading: serve one more file, and expect a new record shape

Only a site with `config.consent` is affected.

- **Serve `kiss-consent.<hash>.js`.** The build writes it at the root of the build folder, and
  every consent page loads it, however the page was reached (`/guide`, `/guide/`,
  `/guide/index.html`, under any path prefix, in a preview or on the host). Deploy it with the rest of the build. Its name changes only when
  kiss's client code does, so it can be cached for good. Under a Content Security Policy it needs
  `'self'` in `script-src`.
- **An `endpoint` receives format 2.** Each record is
  `{ format: 2, action, id, version, timestamp, categories, services, bannerHash, page }`.
  `action` is `accept`, `reject`, `save` or `allow`. `services` lists every service you declared
  outside `necessary`, each `true` or `false`. The record is still sent as `text/plain`.
- **To show visitors their history**, put `{{consentRecord}}` on your privacy page and set
  `ui.history` to that page's id. The settings dialog then links to it. An id no page claims
  fails the build, and the audit's new `consent-history-missing` reports a page of that id with
  no `{{consentRecord}}` on it.
- **The cookie table gains a row** for `kiss_consent_log`, the browser's copy of the history.
- **Behind a path prefix** (`siteUrl: 'https://example.com/site/'`), the banner's links and logo
  now carry the prefix. A link that leaves out the prefix is reported broken when it names a page
  you built.
- **Under `links: { trailingSlash: false }`**, the link scan now resolves a relative link from
  the URL the page is served at, not the folder its file is in. A finding that was only ever an
  artefact of the old resolution goes away.

### What changed

- **`{{consentRecord}}`**: a section headed "Your cookie choices", with a table the browser fills
  from its own log. Each row shows when the choice was made, which choice it was, each category
  allowed or refused, the services allowed and refused, and the purposes version. It shows the
  visitor's consent id, an empty state, a note for a browser with JavaScript off, and one for a
  browser that refuses storage. Dates follow the visitor's locale for the page's language. It has
  no delete control. Its wording is in `ui.text`, from `historyTitle` to `historyAllow`.
- **`kiss_consent_log`**: the last 50 choices, in `localStorage`, written before each one is sent
  and before a withdrawal's reload. It needs no endpoint, and withdrawing never deletes it.
- **The consent id is always made**, endpoint or not, so the history and the server records
  carry the same one.
- **`consent-banners.json`**, written beside `sitemap.xml` when an `endpoint` is set. It lists
  each banner hash the pages carry, with the exact text it was hashed from, the categories, and
  each service's label, provider and category. Your server can then show the wording a record's
  visitor saw. It describes one build: keep every copy you receive.
- **Fixed**:
  - a banner click made before the client file arrived now runs in the order it was made, so a
    Reject is never overtaken;
  - a script holding `window.kissConsent` from before the file arrived keeps working;
  - a link inside the settings dialog closes the dialog after the click, and a modified click
    leaves it open;
  - the link check reads a `siteUrl` prefix with encoded characters (`/my%20site/`) correctly.

## 2.11.0 — 2026-11-03

A cookie consent manager, built in. Declare the services that store anything on a visitor's device
once, in `config.consent`, and kiss makes the banner, the settings dialog, the cookie table and the
gating on every page: nothing third-party loads until the visitor allows it, Google Consent Mode v2
is set before any Google tag, and withdrawing deletes the site's own declared cookies and reloads.
The build checks each page's wiring, and the audit reports trackers nothing gates. It replaced
Cookiebot on a real site in a trial, and caught the Vimeo embed Cookiebot missed. Not legal advice.

### Upgrading: two new findings any site may see, one new report key

Nothing breaks, and nothing changes on a site that does not set `config.consent`, apart from these.
The audit stays advisory: it never changes `ok` or the exit code.

- **A site may see new findings** on its next build or `kiss-ssg check`:
  - `consent-missing`: no `config.consent`, and a page loads a known tracker or embed (Google, Meta,
    Clarity, Bing, Hotjar, LinkedIn, Reddit, YouTube, Vimeo, Google Maps, Superchat) or has a GTM or
    gtag loader inline. Add `config.consent`, or load it with a click-to-load facade
    (`kiss-front-end`);
  - `consent-ads-cmp`: AdSense or Ad Manager on a page, with or without a consent manager. Google
    requires a certified consent manager for those, and kiss's is not one.
- **`report().consent`** is a new last key, after `thirdParty`: the purposes version, the banner
  hashes with their pages, and the categories and services, or `null` without a consent manager.
  `AIKB/last-build.json` gains it (as `null` on most sites) at the next `kiss-ssg aikb`: commit that
  diff.
- **Five more checks** apply only once `config.consent` is set: `consent-ungated`,
  `consent-objection-third-party`, `consent-settings-missing`, `consent-google-advanced` and
  `consent-records-missing`.
- **Update the plugin** to get the skills that now use it: `kiss-legal-and-privacy`,
  `kiss-front-end`, `kiss-site-new` and `kiss-site-review`.

### What changed

- **`config.consent`**: categories (`statistics` may be `objection` under the UK's statistics
  exception, per site), services picked by name from presets (`gtm`, `gtag`, `youtube`, `vimeo`,
  `google-maps`) or declared, the cookie, Google Consent Mode, an optional `endpoint` that receives
  each choice as `text/plain` JSON, and `ui` (position, logo, policy page, wording, theme, or your
  own banner partial). An unknown key fails the build and names the valid ones; a service may not
  take a category's name. `GUIDE.md` § Cookie consent.
- **Six helpers**: `{{consentHead}}`, `{{consentBanner}}`, `{{consentScript}}`,
  `{{consentEmbed}}`, `{{consentSettings}}` and `{{consentTable}}`.
- **`window.kissConsent`** in the browser: `has()`, `choice`, `show()`, `when()`, `on()`, and the
  `kiss-consent:ready` and `kiss-consent:change` events.
- **The wiring check**: a page that gates a service with no `{{consentHead}}`, has a script ahead of
  it, or loads one service twice fails the build (and warns under `dev`).
- **`thirdParty` entries** an origin is gated behind gain `services`. `kiss-ssg check` prints
  `! consent banner …` when the banner's wording changed since `AIKB/last-build.json`, so a record
  of the text shown can be committed before it is deployed, and `! consent version …` when every
  visitor will be asked again.
- **The Markdown copies** leave out the consent banner, dialog and embed notices.
- **`examples/14-consent`**, a roastery's site with GTM, a first-party counter and a YouTube video.

## 2.10.0 — 2026-11-02

The build now notices the legal basics a small site most often misses, and a new domain skill,
`kiss-legal-and-privacy`, says what to do about them: a privacy notice written from the law's
checklist and the site's real inventory, storage measured in a browser, unconfirmed facts marked,
each finding sent to the right person (you, the owner, or an adviser), and an owner handout. UK and
EU law, each fact dated and sourced. Not legal advice.

### Upgrading: three new audit findings, one new report key

Nothing breaks. The audit stays advisory: it never changes `ok` or the exit code.

- **A site may see new findings** on its next build or `kiss-ssg check`:
  - `privacy-link-missing`: a form that asks for an email address or phone number, on a page with
    no link to the privacy page;
  - `placeholder-left`: a `<mark>`, or the bracketed text `[to confirm`, left in the copy;
  - `checkbox-prechecked`: a ticked checkbox whose label is about offers, news or marketing.

  Fix them, or ignore one with a comment saying why: `audit: { ignore: ['placeholder-left'] }` (for
  example, a site that uses `<mark>` for highlighting).

- **The privacy page** is the page with id `privacy`, else the one written to `privacy.html` or
  `privacy/index.html`. If yours is elsewhere, set `audit: { privacyPage: '<id>' }`. An id no page
  has is reported as a finding, not thrown.
- **`report().thirdParty`** is a new last key: the origins other than the site's own that each
  page's static markup fetches from (scripts, iframes, images, stylesheets, preloads, form actions),
  `null` on a failed build. An iframe a script injects and a CSS `@import` are not in it, so an
  empty list proves nothing. `kiss-ssg check --summary` prints a `third-party origins` line.
  `AIKB/last-build.json` gains the key at the next `kiss-ssg aikb`: commit that diff.
- **Update the plugin** to get `kiss-legal-and-privacy` and the skills that now call it.
  `kiss-site-new`, `kiss-site-review` and `kiss-page-add` open it when a site gains a form, an
  embed or a third-party script. `kiss-writing-for-the-web`, `kiss-seo` and the review protocol keep
  only a link to it for the legal rules.

### What changed

- **`kiss-legal-and-privacy`**, the seventh domain skill. Method in `SKILL.md`; the law in
  `references/uk.md` and `references/eu.md`; the owner checklist in `references/owner-handout.md`.
- **Three audit checks and `report().thirdParty`**, as above. `GUIDE.md` § Checking a build.
- **`audit.privacyPage`**, a new config key, default `null`.
- **`kiss-front-end`** gains the click-to-load facade for video and maps. A `youtube-nocookie.com`
  embed was measured writing to `localStorage` on load: "privacy-enhanced" is not storage-free.
- **The review protocol** gains legal P1 examples and an accepted-risk record format.

## 2.9.0 — 2026-11-01

`npx kiss-ssg@latest upgrade` installs a release into a site, checks it really landed, and prints
the upgrade notes between the site's version and the new one. Every release's upgrade note now
lives here, under `### Upgrading`, and nowhere else.

### Upgrading: upgrade with the command

Run `npx kiss-ssg@latest upgrade --plan` to read the notes since the site's version without
installing anything, then `npx kiss-ssg@latest upgrade` to install. Name the version (`@latest`, or
`@2.9.0`): a site's own older kiss-ssg has no `upgrade` command.

- **It checks the install landed.** After installing, `node_modules/kiss-ssg` must be the new
  version and not a link to a working tree, `package.json` must allow it, and `package-lock.json`
  must pin it from the registry npm uses. Each check prints an `ok:` or `FAILED:` line with the
  fix, and any `FAILED` exits 1. This is what replaces a `file:` link that a plain `npm install`
  keeps.
- **When it cannot tell where the site started**, which is the case for a site linked to a
  working tree, it prints every note and suggests `--from <version>`, naming the version the tree
  reports. After an `npm update` has already moved the site, `--plan --from <old version>` still
  prints the notes.
- **When it will not install**, it says why and `--plan` still reads: uncommitted changes to
  `package.json` or the lockfile, a workspace member (install from the workspace's root with `-w`),
  a pnpm, yarn or `npm-shrinkwrap.json` lockfile, or a registry npm cannot name.
- **The `kiss-site-migrate` skill no longer holds release notes.** It is the method for working the
  notes the command prints, and it needs a plugin update to match: an older copy describes the
  manual steps.

### What changed

- **`npx kiss-ssg upgrade`**, as above, with `--plan`, `--from` and `--json`. `GUIDE.md` § Upgrading
  a site.
- **Every upgrade note is in this file, in one shape.** Notes that only the skill held are here
  under their real versions (2.5.0 to 2.8.6), and the older note shapes are `### Upgrading` now.
- **`kiss-site-migrate`** is about a third of its old length: install with the command, check
  before changing anything, work each note, done when the site builds the way it did, and the URL
  decisions an upgrade can raise.
- **`llms.txt`** is about 1,300 characters shorter. The plugin install commands and the full flag
  list moved to `npx kiss-ssg init` and `npx kiss-ssg --help`, and every method, helper, config
  default and trap stays.
- **The documentation site has a Skills page.** It explains kiss as two parts, the engine and the
  skills, each useful alone and best together, and describes every skill in both plugins.

## 2.8.7 — 2026-11-01

Skills only: nothing changes in how a site builds.

- **Every kiss skill's description is 400 characters or fewer**: what the skill does, the phrases
  that call it, and what it is not for. Every session on a kiss site loads these descriptions into
  its skill list, whose budget is about 1% of the context, so the two plugins now cost about 1,750
  est. tokens there instead of about 2,970. The same tasks still reach the same skills: 24
  routing runs on three real sites matched every time.

## 2.8.6 — 2026-11-01

SEO best practice for 2026, built in. Nothing fails, but `sitemap.xml` changes on every site that
calls `.sitemap()`: read the note below.

### Upgrading: the sitemap states only dates a page knows

- **Nothing to do for the file to be correct.** A page with no date loses its `<lastmod>`, which is
  the honest state, and two builds of an unchanged site now write the same `sitemap.xml`.
- **A page whose content changes over time** (a price list, a timetable, a stockists page) can
  carry `updated` in its model, set to the day the content last changed. Never set it from the
  clock in a controller: that is the old behaviour again.
- **`sitemapPriority` and `sitemapChangefreq`** still work, and Google ignores both. Leave them or
  remove them.
- **A `.robots()` that keeps a named agent out of the whole site** (`GPTBot`, `ClaudeBot`, `CCBot`
  and the like) no longer logs "robots.txt disallows the whole site" or sets
  `report().robots.disallowAll`, unless the agent is `*` or a search engine's own crawler. On such
  a site `disallowAll` goes from `true` to `false`, which is the fix, not a regression.

Check it: build, and read `sitemap.xml`. No `<lastmod>` holds the time of the build.

### What changed

- **The sitemap states only dates a page knows.** Every `<url>` used to carry the time of the build
  as its `<lastmod>` and `1.00` as its `<priority>`. Google uses `lastmod` only when it is
  verifiably accurate and ignores `priority`, and Bing warns against the build time, so a date that
  moved on every build taught both to ignore it. A page's `<lastmod>` is now its `sitemapLastmod`,
  else its `updated`, else its `date` (from the page options, then its model), and a page with none
  has no `<lastmod>`. `<priority>` and `<changefreq>` appear only for a page that sets them. Two
  builds of an unchanged site write the same `sitemap.xml`. Give a page whose content changes
  (a price list, a timetable) an `updated` date in its model, set when the content changes.
- **Blocking AI training crawlers no longer says the site has left search.** `robots.txt`'s
  "disallows the whole site" notice and `report().robots.disallowAll` used to fire for a
  `Disallow: /` under any agent. They now fire only for `*` or a search engine's own crawler
  (Googlebot, Bingbot, Applebot, `OAI-SearchBot`, `Claude-SearchBot`, `PerplexityBot` and a few
  more). Every agent kept out of the whole site is listed in the new `report().robots.blocked` and
  one info line. Every crawler is still allowed by default.
- **`llms.txt` and the `.md` copies are described as what they are:** an index for agents and tools
  pointed at the site. No search or answer engine documents reading them, and the docs no longer
  say one does.
- **`kiss-seo` holds what a model gets wrong about SEO in 2026,** in about half the words, as one checklist that a site is built to and reviewed against: AI search is
  ordinary search; which crawlers to block for "stop AI scraping" and which cost search
  visibility; no page per town without the town's own content; the structured data that still
  earns something (a course list needs three courses) and what earns nothing (`FAQPage`, `HowTo`);
  dates that move only with content; and the off-site work only the owner can do. A review reports
  every box. `kiss-writing-for-the-web` asks the owner for the first-hand facts
  only they hold, and never invents an author or a credential.

## 2.8.5 — 2026-10-31

Skills only: nothing changes in how a site builds. The skills were tried on three real sites by
agents that were never told the skills existed, and these are what that showed.

- **A launch review now runs every domain review.** `kiss-site-review` named the six domain skills,
  and the agent following it opened none of them, so its review missed what only their
  measurements find. Each task skill now links the domain skills it hands work to and says to open
  them first. The same review on the same site then found three WCAG failures it had missed. It
  costs more: about $4 to $8 and 6 to 12 minutes, against about $1 and 4 minutes.
- **`kiss-page-add` replicates.** A new page or record copies the nearest existing one faithfully,
  flaws included; anything it would improve goes in its hand-over for `kiss-site-review`, so adding
  a page never quietly changes the site. It opens `kiss-writing-for-the-web` before writing a word
  a visitor will read, and a fact or template slot the owner did not fill becomes a visible
  placeholder.
- **`kiss-site-migrate`'s 2.7.5 note** adds that a site's own scripts that read `llms.txt` change
  answer: a check that compares its links with `sitemap.xml` fails on every page once `llms.txt`
  links the Markdown copies.

## 2.8.4 — 2026-10-31

A sixth domain skill for site structure, a merged step for the branch skills, and the engine now
answers the memory skills' questions itself. **Update the engine and both plugins together**: the
`kiss-memory` skills now run `npx kiss-ssg session` and `npx kiss-ssg base`, and on an older
kiss-ssg they stop and say `unknown command: session`. Nothing fails, and the notes below say
what to check.

- **`kiss-information-architecture`**, a domain skill for how a site is structured: which pages
  exist, how they are grouped and named, the navigation, the URL scheme, breadcrumbs, tags and the
  404 as a way back in. `kiss-site-new`, `kiss-page-add` and `kiss-site-review` call it.
- **`kiss-branch-merged`**, the step after `kiss-branch-close`: once the pull request has merged, it
  confirms the merge and that it holds every local commit, brings the base up to date, checks the
  merged site still builds to its record, then deletes the local branch and removes only the
  worktree the session file names. `kiss-branch-open worktree` opens a branch in its own folder
  beside the repository when this checkout is busy.
- **`npx kiss-ssg session`** finds a branch's session log (`--from-branch` reads it from the
  branch's own commits, `--get <key>` prints one frontmatter value, `--list` lists every log), and
  **`npx kiss-ssg base`** prints the branch the work merges into (`--ref` the ref to diff against,
  `--start` the ref to start from). **`npx kiss-ssg check --subjects`** prints the hashes to stamp
  notes with, and `npx kiss-ssg --version` the version. GUIDE.md § Branches and session logs.
- **Orphan pages.** The link check now lists, as `links.orphans`, every page no other page links
  to, and `--summary` prints one `orphan pages (N, …)` line. It is advisory, like a broken link: a
  campaign landing page may be unlinked on purpose. The home page, `404.html` and a page in a
  learning package are never orphans.
- **`{{@current}}` in `isActive`**: `true` only on the page the link points at, so one call gives a
  nav link both its section's `{{active}}` and `aria-current="page"`. A missing `href` names no
  page, so it marks nothing; `href=""` is still the home page.
- **The skills run commands, not scripts.** No skill carries shell that decides something any more
  (loops, `awk`, `node -e`); anything that has to be exactly right is a `kiss-ssg` command.

### Upgrading: update the engine and both plugins together

The `kiss-memory` skills now run `npx kiss-ssg session` and `npx kiss-ssg base`; on an older
kiss-ssg they stop and say `unknown command: session`.

### Upgrading: `aria-current` on a nav that marks a whole section

Nothing fails, but a layout copied from kiss's examples probably puts `aria-current="page"` on
every page in a section. Inside `{{#isActive}}`, `{{active}}` stays true on every page inside a
section when the call has `folderMatch`, and `aria-current="page"` names only the page itself,
which only the new `{{@current}}` says.

- **Grep the layouts for `aria-current`.** A nav link that sets it inside `{{#if active}}`, in an
  `{{#isActive}}` with `folderMatch`, marks every page in the section. Until this release ten of
  kiss's example layouts (1, 2, 3 and 5 to 11) had that shape and passed each nav item's
  `folderMatch` through, so a site that copied any of them has it, and it shows as soon as one nav
  item sets `folderMatch: true`. Set the attribute inside `{{#if @current}}` and keep the class on
  `{{#if active}}`, as `examples/11-blog/src/layouts/layout.hbs` does. On a page inside the
  section, the section link keeps its class and loses the attribute.
- **A nav that calls `isActive` twice for one link**, once with `folderMatch` for the class and
  once without it for the attribute, can fold the two into one the same way. Optional: the same
  links are marked, though a link's attributes may come out in another order.
- **A nav item with no `href`** (a label or a separator in a data-driven nav) is no longer marked
  on the home page. A call that meant the home page writes `href=""`.

Check it by building before and after and diffing the pages: on any page, at most one nav link
carries `aria-current="page"`, and it points at that page.

## 2.8.3 — 2026-10-30

The `kiss-ssg` plugin now has **domain skills**: five skills that each hold one area of web
expertise, which the task skills call when they build or review a site. No engine change; update the
plugin to get them (`claude plugin update kiss-ssg@kiss-ssg`; in Codex,
`codex plugin marketplace upgrade` and a new session).

- **Five domain skills**, each with a build mode and a review mode:
  - `kiss-writing-for-the-web` — the words on every page, to evidence-based web-writing practice.
    It never invents a fact about the business: a missing price or figure is a visible placeholder.
  - `kiss-seo` — one purpose per page, the title and description a search result shows, `noindex`
    rather than `disallow`, canonical copies, old URLs kept with `aliases`, link previews.
  - `kiss-accessibility` — WCAG 2.2 AA: alt text, labels, the skip link, focus, contrast, targets,
    200% text, motion, content without script.
  - `kiss-front-end` — image sizing, the platform's own controls before any script, the hero height,
    transitions, hover on touch screens, no sideways scroll, external links, lists at 0 and 1.
  - `kiss-design` — the craft under any look, Anthropic's `frontend-design` for the visual
    direction, and the design lift.
- **`kiss-site-new`, `kiss-site-review` and `kiss-page-add` are shorter.** They keep the kiss
  mechanics and name the domain skill for everything else; no rule was dropped, only moved.
  `kiss-site-review` now runs every domain's review and reports them in one table.
- **`llms.txt` names the domain skills**, and has one new habit for agents without plugin skills:
  never invent a fact about the business.
- **GUIDE.md § .page() now says where a page's title comes from:** its `title` option, else its
  model's `title`, else its slug, title-cased. It used to say a title was not a model field, which
  the engine never did. `description` has no fallback: the layout prints it from the page option or
  the model.

## 2.8.2 — 2026-10-26

SCORM pages report their own completion, so resume keeps working in Moodle. Example 13 now shows
how to build a quiz in a SCORM lesson. **A site that uses `{{scormBridge}}` should check its pages
on upgrade**: the note below has the steps.

### Upgrading: a SCORM page reports its own completion

Only a site that puts `{{scormBridge}}` on its pages is affected. Grep for `scormBridge` and for
the layouts that carry it. For each page that uses it with no `complete` (and none passed through
its `{{#extend}}` hash):

- **It calls `bookmark()` or `save()`, or has a point the learner finishes at**: give it a
  `kissScorm.status('completed')` call there. This is the case the change exists for.
- **It keeps no place and nothing marks the end** (a page to read, with no question): pass
  `complete="seen"`, which keeps the old behaviour.

`complete="manual"` is now the default; leave it or remove it. Learners' records already in an
LMS are not changed: a page completed under the old default stays completed, and in Moodle still
opens in review mode for those learners. `kiss-ssg check` reports nothing new, because completion
happens in the browser. Check it in the LMS: launch a page that bookmarks three times, moving
somewhere else each time, and the third launch opens on the second launch's place.

### What changed

- **`{{scormBridge}}` no longer marks a page complete when it loads.** A new attempt now starts as
  `incomplete`, and the page is complete when its own script calls `kissScorm.status('completed')`
  (or `'passed'`/`'failed'`). Completing on load broke resume in Moodle: once an attempt is
  complete, Moodle opens every later launch in review mode, where nothing is saved, while still
  handing back the first launch's place. So a learner reopened where they first left, every time,
  and nothing after that was kept. `{{scormBridge complete="seen"}}` keeps the old behaviour, for a
  page that keeps no place or state. `complete="manual"` is now the default and still works.
- **What to do:** a page that calls `bookmark()` or `save()`, or has a point the learner finishes
  at, needs a `kissScorm.status('completed')` call there. A page with neither, such as one to read
  with no question, can pass `complete="seen"`. Records already in an LMS are not changed.
- **Example 13's milk lesson is the pattern for a quiz in a SCORM lesson**
  (`node_modules/kiss-ssg/examples/13-course-packages`):
  - The questions are model data, drawn by a `question` partial and run by a `quiz-script` partial.
  - The learner tries before being told, and every choice is reported to the LMS as an interaction.
  - Answers come back on the learner's next launch, and never onto a quiz that has since changed.
  - The learner marks the lesson complete in a panel that warns them first.
  - The lesson also resumes on the view the learner was on.
- **GUIDE now says three things it left unsaid:**
  - A page's own `status('completed')` also ends resume in Moodle, so report it when the learner
    has finished.
  - Answers, a score and a status sent before `kissScorm.ready()` are queued, not lost.
  - The resume snippet bookmarks the view the learner is already on when the bridge becomes ready.

## 2.8.1 — 2026-10-26

A fix to `kiss-ssg init` and a documentation trap, with nothing to change on upgrade.

- **`npx kiss-ssg init` now repairs the `"type": "commonjs"` that `npm init -y` writes, when your
  own `router.js` uses `import`.** Node refuses an `import` under an explicit `"commonjs"`, so a
  folder set up with `npm init -y` before its `router.js` built nothing until someone edited
  `package.json`. `init` changed it only when it wrote the starter; it now changes it for your own
  router too, when `router.js` is the only thing the package runs, and prints that it did. Any
  other `.js` file in the folder is then read as an ES module as well. If your `package.json` runs
  anything else (an entry Node would load, such as a `main` or an `index.js`, other than
  `router.js`; a script that is not one of kiss's or npm's placeholder `test`; a `bin`,
  `directories`, `exports` or `workspaces`; or a `server.js` that `npm start` runs by default),
  or any other file Node would read by the package's type could be CommonJS (a test that
  `node --test` finds, a script you run by hand, an extensionless script, any `.ts` file; files
  written only as ES modules, such as kiss helpers using `export`, do not count), `init` keeps
  `"commonjs"` and tells you
  to set `"type": "module"` yourself or rename the router to `router.mjs`. The same check now
  guards the starter: a folder whose scripts already run its own CommonJS files is not switched to
  `"module"` when `init` adds the starter. A
  `router.js` written in CommonJS (`require`), one that does not parse, or a `package.json` with no
  `"type"`, is left alone. Running `init` again on a folder it already set up now writes this
  change too, where before it reported "already set up" and kept the broken value.
- **A `.md` partial is Markdown before it is a template, and the docs now say what that breaks.**
  Markdown escapes `"` and `>` before Handlebars reads them, so a double-quoted argument
  (`{{link "courses/intro"}}`) or any partial call (`{{> nav}}`) in a `.md` partial fails the build
  with a parse error. `{{title}}` and single-quoted arguments still work, but a Markdown link whose
  URL is an expression ships as literal text. If a `.md` partial needs helpers or partials, make it
  a `.hbs` partial and wrap the prose in `{{#markdown}}…{{/markdown}}`. See GUIDE.md, beside the
  list of partial types.

## 2.8.0 — 2026-10-25

kiss can now package pages for a learning management system. Two changes need a look when you
upgrade, and the audit asks three more questions.

### Upgrading: `package` is now a page option

A page's `package` option puts it in a learning package (below), and packaging is on by default.
A site that never sets `package` gets no zips and no change. A site that already had a `package`
key for its own purposes now has its pages packaged instead.

- **Find the key before the first build.** Grep the build script and `controllers/` for `package`:
  a `.page({ package: … })`, a fan-out record with a `package` field, or a controller that spreads
  model fields into the page's options (`{ ...options, ...model }`) where a record carries one.
- **A value that is not a slug fails the build** (`package must be a slug …`). One that is a slug
  is quietly zipped into `packages/<value>.imscp.zip`, and fails as `<packages>` if one of its
  pages has no usable `id`.
- **Rename the site's key** (`packageName`, say) wherever the site reads it. `packages: false`
  also turns packaging off, but the rename is the honest fix: the key means something to kiss now.
  Afterwards `kiss-ssg check` lists no `package:` lines, and the build folder has no `packages/`.

### Upgrading: Markdown copies only when the build calls `.llms()`

Since 2.7.5 every page had a `.md` beside it, linked from nowhere unless the site wrote an
`llms.txt`. Now a copy is written only when the build calls `.llms()` (`markdownCopies.write`
defaults to `'llms'`).

- **A site that calls `.llms()`** sees no change.
- **A site that does not** stops publishing the `.md` files. Grep it for a hand-written link to a
  `.md` page first; if it has one, or wants the copies anyway, set `markdownCopies: true`, which
  now means always. `false` still means never, even with `.llms()`.
- `kiss-ssg check` against a record made before the upgrade shows each page's `markdown` going
  from a path to `null`. Re-record with `npx kiss-ssg aikb router.js` once it builds.
- A deploy step that uploads the build folder without deleting files the build no longer writes
  keeps the old `.md` files on the server; remove them there.

### Upgrading: three more audit checks

The first build after upgrading can report `viewport-zoom-lock`, `href-hash` and
`fragment-missing` findings the site never had (below). They are advisory: `ok` and the exit code
do not move, and the upgrade is done when the site builds the way it did.

- **The record catches up.** The first `npx kiss-ssg aikb` after upgrading records the new
  findings in `AIKB/last-build.json`; that is the record, not a change to the site.
- **A site whose script adds an `id` at runtime** can only ignore all of `fragment-missing`, which
  also stops it checking the skip link. Say that in the `audit.ignore` comment.

### Learning packages: IMS content packages and SCORM 1.2

A page that names a `package` is zipped with the other pages that name it, into
`packages/<id>.imscp.zip`, and `config.packages: { format: 'scorm12' }` (or both formats) makes a
SCORM 1.2 package for Moodle or any LMS. One build can make many packages.

- **A package carries what its pages need, and nothing else.** Stylesheets and what they import,
  images and `srcset`s, icons, embedded pages, and files a page links to for download, such as a PDF
  handout. Only files this build wrote go in. A reference a package cannot carry (root-relative, a
  folder, another page, the wrong case) is reported, with its reason, in `report().packages`.
- **Link a member page's pages with `{{link}}`.** On a page in a package it renders the file,
  relative to the page (`tab-2.html`, `../tab-2/index.html`), because an LMS serves a package's
  files from wherever it unpacks them. Use `{{root}}{{asset …}}` for assets. `relative=` on the call
  overrides it either way.
- **The same pages give the same bytes**, and `kiss-ssg check` lists which packages changed since
  the last record, so you know which to upload again.
- **`{{scormBridge}}`** in a page's `<head>` records completion, answers (`kissScorm.interaction`),
  a score and a status, and keeps the learner's place (`bookmark`, `save`), handed back as
  `kissScorm.resumed` on their next launch. A place or state is committed a couple of seconds after
  it is written, not left to the moment the learner leaves. With no LMS every call does nothing, so
  the same page works on the web too.
- **Read `resumed` inside `kissScorm.ready((scorm) => …)`.** It calls back once the bridge has
  decided, which in an LMS that opens the page inside a page of its own still loading is after
  that page loads; until then `resumed` is `null`. One kiss page records for a SCO, and kiss pages
  it embeds record through it.
- **A multi-select answer key:** `correct: [0, 2]` means every listed choice is required (`{a,c}`).
  For alternatives, use `correct: { anyOf: [1, 3] }`.
- **A pipeline step that writes into the build folder declares the files in `outputs`**, so
  `{{asset}}` names them and a package can carry them.

`examples/13-course-packages` packages a two-lesson course in both formats: one lesson of two pages,
and one lesson on a single page.

### The audit checks zoom and in-page links

- **`viewport-zoom-lock`.** A page whose `<meta name="viewport">` turns off zoom. That means
  `user-scalable=no`, or a `maximum-scale` below 2, short of the 200% people with low vision rely
  on.
- **`href-hash`.** A link to `#`, which goes nowhere. It is usually a control that should be a
  `<button>`.
- **`fragment-missing`.** A `#fragment` that names no `id` on the page it lands on. That covers a
  skip link to an `id`-less `<main>`, a table of contents after a heading was renamed, and a
  `{{link "about"}}#team` to a section that moved. It checks this page and every other page the
  build wrote. It leaves alone what it cannot see: `#top`, text fragments, other sites, assets, and
  ids a script adds at runtime. For those last ones, the trade-off of ignoring the check is in
  `GUIDE.md`.

Each is advisory, like every audit check, and each can be turned off with a reason in
`audit.ignore`. Under `--summary`, `viewport-zoom-lock` and `fragment-missing` print one line per
value, so you see which href to fix.

### `kiss-site-review` runs as two passes: a usability audit, then a design lift

Ask your agent to review a site and it now works in two passes:

- **A usability and best-practice audit.** The build's findings, external links, a browser pass,
  and the craft pass, which has grown from nine checks to twenty:
  - visible focus, including under a sticky header on Shift+Tab;
  - targets of 24px by WCAG 2.5.8's own rule, with its spacing exception;
  - a skip link;
  - `aria-current` on the current nav link;
  - transitions that name their properties;
  - hover kept off touch screens;
  - content that shows with JavaScript off, and reduced motion that shows the end state;
  - no `100vw`;
  - text at 200%;
  - a readable line length;
  - lists that work at 0 and at 1.

  Each was measured in a browser before its wording was written. A full-screen hero is now `100svh`
  (`100dvh` is for an app shell). The report has a P0–P3 priority and one row per cause.

- **A design lift**, offered after the fixes you pick. It reads the site's recorded decisions,
  writes a one-line read of the audience, and stays at most one step bolder than the site is now.
  It shows two or three proposals as before-and-after screenshots made in a scratch copy, and keeps
  the content, URLs, anchor ids and form fields as they are. Without Anthropic's `frontend-design`
  skill it says so and leaves the look alone.

`kiss-site-new` builds a new site to the same floors from the first layout, so the review finds
nothing to fix. These rules came from evaluating six third-party design-skill collections; kiss took
the measurable lessons, not the skills, and recommends no new companion skill.

### The examples: skip links, and a line length for running text

The examples ship as models of good practice, so they now pass the new review checks:

- **Example 11, the blog, works at no posts and at one.** The home page, the listing and the
  tags page show a line saying the journal or the tags are empty, instead of a heading with
  nothing under it. The counts its copy states ("6 posts… 4 tags") come from the posts through
  one `countOf`, singular at one, instead of being typed into the templates. The current page's
  nav link now shows an underline on hover and press.

- **Examples 4 and 12 have a skip link** to `<main id="main">`, as the other examples already
  did. In example 12, the conversion, it is declared in `tools/compare.mjs` as the one element the
  built page has that the original artifact did not. The comparison stays exact about everything
  else.
- **Text in a card stops at a readable line.** The shared stylesheet's `$measure` is the page's
  width, so a blog post ran to 115 characters a line at desktop width. A new `$line-length: 54ch`
  caps paragraphs, list items and quotes in a card at 60–79 characters a line, median 70, across the six posts. The look is
  otherwise unchanged.

  The cap covers all running text in `<main>`, not only cards. A note under a post had run to
  155 characters a line.

  `54ch`, not `70ch`, and that was measured, not assumed: `ch` is the width of "0", so `70ch` came
  out at 97 characters a line.

## 2.7.9 — 2026-10-21

Nothing in your site has to change.

### The README opens with what kiss is for

The first paragraph now says who kiss is for before it says how an agent drives it: a small
generator for brochure and documentation sites, a static HTML site that goes up quickly, is easy
to maintain and has best practice built in. The agent-driven paragraph follows it.

## 2.7.8 — 2026-10-17

Nothing in your site has to change.

### Dev mode: an assets folder that is deleted and re-created is watched again

In `npm run dev`, deleting `src/assets` and then writing a file into a new `src/assets` was
seen only by a slower route (a whole-site rebuild), and on Linux that route could arrive too
late. The assets watcher now watches from the folder's parent, with everything else there
ignored, so the folder's removal and return are ordinary events and the restored file is copied
the way any other asset edit is. One-shot builds were never affected.

### The README sells the site before it sets one up

`README.md` now opens with what kiss-ssg is for and what you get — four short sections on
describing a site, keeping it readable, checking every build and remembering what it is — before
the setup commands, which are unchanged. The long explanation of how the plugins install, and the
optional Anthropic skills, are collapsed under the quick start rather than in its way. A
documentation table keyed by what you want to do replaces the paragraph that pointed at
`GUIDE.md`. The header carries the logo, the CI, npm, stars and Node badges, and a link bar.

## 2.7.7 — 2026-10-13

Nothing in the engine changed, and nothing in your site has to change.

### Optional: Anthropic's `webapp-testing` skill, for a browser

The README and the docs site now recommend it alongside `frontend-design`. It is in the same
`example-skills` plugin, so the same two install lines add it. It is a Playwright recipe for
Python. The browser itself comes from Playwright:

```sh
pip install playwright
python -m playwright install chromium
```

With a browser available:

- `kiss-site-review` uses it for its browser pass;
- `kiss-site-import` uses it for its side-by-side comparison;
- `kiss-site-new` now looks at what it built at 320, 768 and 1440 wide before it hands over.

The three skills overrule three of `webapp-testing`'s defaults, because each one breaks a kiss
site:

- serve the build folder over HTTP, never from `file://`, or every root-relative link resolves
  against the drive;
- start and stop the server yourself, because its helper left the dev server running on Windows;
- read your site's own port rather than assuming 3001.

What was measured: in three review runs, agents wrote their own Playwright scripts rather than
invoking the skill. The installed browser is what mattered.

### The examples: three fixes you may want in your own site

If your site copied the examples' stylesheet or templates, check for these:

- **The hero eyebrow rendered grey and body-sized.** `.hero p` (0,1,1) outranks `.eyebrow`
  (0,1,0), and the eyebrow is a `<p>`. The examples now use `.hero p:not(.eyebrow)`.
- **An anchor jump landed under a two-row sticky header.** Just above the 34rem breakpoint, a
  longer nav wraps the still-sticky header to 114px, against 88px of `scroll-padding-top`.
  `scroll-padding-top: 7.5rem` now covers two rows.
- **"1 posts".** Example 11's tag pages printed `{{count}} posts`. Its tag records now carry
  `postCount` ("1 post", "2 posts"), because Handlebars has no comparison helper to choose the
  word in a template.

## 2.7.6 — 2026-10-13

Nothing in the engine changed, and nothing in your site has to change. This release is about how
good a kiss site looks and how carefully it is checked.

### `kiss-site-review` gains a craft pass

A launch review now measures the finishing details the build's audit cannot see. It starts by
looking for decisions your site has recorded (a `BRAND.md`, a comment in the stylesheet, an
`audit.ignore` entry), so it never "fixes" a choice you made on purpose. Then it checks nine
things:

1. a control's edge is at least 3:1 against what it sits on;
2. a result that changes on screen is announced to screen readers;
3. every font weight the CSS asks for is one that renders;
4. a colour that means something means only that;
5. hover and press give a visible response, and motion respects reduced-motion settings;
6. no heading or paragraph ends on a single word;
7. a sticky header is measured on a phone;
8. phone heights use `100dvh`;
9. a form that collects personal details says what happens to them.

The review also now:

- reads `check`'s `{ reports, diff }` output;
- has a placeholder-copy check;
- tests long text with a string that has no break opportunities.

### `kiss-site-new` keeps a few things whatever the look

- **It never invents a fact about your business.** No made-up figures, prices, testimonials or
  sample posts. Gaps become visible placeholders, listed for you at hand-over.
- **Form fields have visible labels, and images carry their `width` and `height`.**
- **It tells you when `frontend-design` is missing.** When Anthropic's skill is not installed, it
  says so before choosing a look and points you to the install lines in the README. Built from
  the same brief, a site made without it came out in the generic AI look, and two made with it
  did not.

### The examples keep their look, with craft fixes

The eleven Aster & Oak examples look as they did. The shared stylesheet gains the fixes the
review's craft pass found:

- tag chips with edges at 3:1 or more;
- nav weights of 400 and 700, which every system font ships;
- hover and press states on every link;
- headings and paragraphs that avoid a single word on the last line;
- long words and URLs that wrap rather than widening a phone's page;
- a header that stops being sticky on a phone;
- dark-mode colours for the brand mark and the status labels.

Example 11's nav now marks one current page on its tag pages, not two. If you copied an example's
stylesheet into your own site, nothing changes there.

## 2.7.5 — 2026-10-07

### Upgrading: your build folder gains a `.md` copy of every page

**Every HTML page your build writes now gets a Markdown copy beside it**: `about.md` next to
`about.html`, and `courses/index.md` next to `courses/index.html`. It is the
[llmstxt.org](https://llmstxt.org) convention, a clean version of each page for AI agents to read.
It is on by default, so your next build publishes these files with the rest of the site.

- **`llms.txt` now links the copies** (`https://your-site/about.md`) instead of the pages, as the
  llmstxt.org spec asks.
- **Your site's own scripts that read `llms.txt` change answer.** Grep the site's tooling (`qa/`,
  `scripts/`, its tests) for `llms.txt`. A check that compares its links with `sitemap.xml` now
  fails on every page, because the sitemap still lists the pages and `llms.txt` lists the copies.
  Measured on a real site: its SEO check went from passing to 36 failures on the upgrade, and the
  agents that met it blamed an earlier upgrade. Update the check to expect the copies, or set
  `markdownCopies: false`.
- **Each copy is the page's `<main>`**, or its `<body>` when there is no `<main>` (or the `<main>`
  is empty). `<nav>`, `<script>`, `<style>` and `<template>` are dropped. Links are kept as the page
  wrote them.
- **Read one copy after upgrading.** If your layout has no `<main>` around the page's own content,
  its header, footer and any menu not in a `<nav>` are in every copy, and nothing reports it. Wrap
  the content in `<main>`, or set `markdownCopies: { selector: 'article' }` to convert a different
  element.
- **To turn copies off**, set `markdownCopies: false` for the whole site, or
  `config: { markdownCopies: false }` on one page. With copies off, `llms.txt` links the pages as
  before.
- `kiss-ssg check` reports each copy as `pages[].markdown`. Its diff against a recorded knowledge
  base compares the HTML, so no page reads as changed because of a copy. Re-record with
  `npx kiss-ssg aikb router.js` so the record carries the new field.
- If a page's copy cannot be made, the page fails the build, so `llms.txt` never links a missing
  file. A `markdownCopies.selector` that is not valid CSS fails every page with an error naming it.
- **Hosting:** the copies are ordinary files. A host that processes Markdown itself, such as classic
  GitHub Pages publishing from a branch (Jekyll), may turn them back into pages unless the build
  folder has a `.nojekyll` file. This has not been tested on a live site.

Full details: `GUIDE.md` § Markdown copies for agents.

## 2.7.4 — 2026-10-06

### Nothing for a site to change

No change to the engine. **`llms.txt` is an index again: about 13,000 characters, down from
130,000.** `npx kiss-ssg init` imports it into your site's `CLAUDE.md`, so all of it was loaded
into every session of every site. On a site with a large `CLAUDE.md` of its own, that was enough
to push Claude Code past its instruction-file budget. Your `CLAUDE.md` needs no edit: the same
import line now loads the smaller file.

- **`llms.txt`** names what exists, the build-script shape, and the traps nothing reports. For
  each topic it names the section of `node_modules/kiss-ssg/GUIDE.md` that holds the full rules.
- **`GUIDE.md`** now holds everything `llms.txt` used to say: the build-script tiers, "Building
  a site well", the full `.report()` shape, the watch details, and the `isActive` and `asset`
  details.
- **Gaps an agent building a site from scratch had to guess at are now written down:**
  - a page's default id keeps `index` (`menu/index.hbs` is `menu/index`, not `menu`);
  - a helper reads config while the page renders, from `options.data.root.config`;
  - a JSON-LD helper recipe that escapes `</script>`;
  - a file kiss itself writes, such as `/feed.xml`, has no `{{link}}`, so you write its path.

## 2.7.3 — 2026-10-03

### Nothing for a site to change

No change to the engine. Three things around it:

- **The `kiss-site-new` skill now advises on small interactivity.** For a menu, an accordion or a
  dropdown it reaches for native HTML first (`<details>`, `popover`, `<dialog>`), then Alpine.js's
  CSP build only when a component holds state the platform cannot, and never one-off scripts
  scattered across pages. kiss itself knows nothing about Alpine.
- **The docs site's homepage asks which coding agent you use** (Claude Code, Codex or another
  one) and shows just that set-up box. It remembers the choice.
- **`--dev` is documented as best-effort.** If the dev server ever shows something stale and
  stopping it (Ctrl-C) and starting it again fixes it, that is a known limitation rather than a
  broken site. `npm run build` and `npm run check` are what a deploy relies on.

## 2.7.2 — 2026-10-03

### Nothing for a site to change

Under `--dev`, an asset could stay in your build folder after you had deleted it, until you
restarted. It happened when files were removed while kiss was still copying them, for example by a
`git checkout` or deleting a folder of assets. The copy failed partway, the files it had already
written were never recorded, and later runs did not know to remove them. kiss now records each
asset before writing it, so the next copy cleans up whatever a failed one left behind.

A second `--dev` case recovers now too. If you replaced an assets folder with a file of the same
name, or a file with a folder, every rebuild failed until restart, because the copy refused to put
one over the other's leftovers. kiss now clears its own old output out of the way first. It never
removes a file it did not write, so a file of yours in the way still stops the copy, as before. An
empty folder in the way is removed, because kiss leaves those behind itself when a source folder
is deleted, and an empty folder holds nothing to lose.

A production build was never affected: every build there starts from an empty folder. Five real
sites built exactly the same on 2.7.1 and on this version.

## 2.7.1 — 2026-10-03

### Nothing for a site to change

The engine's main file was reorganised: the work it did is now split across five smaller modules,
each with one job. Nothing a site can call, configure or observe has changed. Every page of five
real sites built byte-for-byte the same on 2.7.0 and on this version, and every example in the
package built the same output apart from the timestamps that differ between any two builds.

If you or your agent read the engine's notes in `node_modules/kiss-ssg/AIKB/`, they now follow the
new layout: `staging.md`, `asset-copy.md`, `page-registry.md`, `build-finish.md` and `rebuild.md`
sit beside `kiss.md`, which describes how they fit together.

One thing worth knowing if you run `--dev` on Windows: when an asset is re-copied, the old copy is
removed a moment before the new one is written, so a request in that instant can get a 404. The
next request or reload resolves it. That comes from the copying library kiss uses and is recorded
in `AIKB/upstream.md`.

## 2.7.0 — 2026-10-01

### A page you already have can become a kiss site

Until now kiss had no door for the commonest way a small site starts: somebody
already has a working page. A Claude or ChatGPT artifact, a page exported from
a builder, a hand-written HTML file edited for years. `kiss-site-new` wants a
description of a site, not the site; `kiss-site-migrate` is for moving across
kiss versions. The single-file page appeared in the shipped guidance only as
the shape to avoid.

A new export converts one, and it does the half that can be proved:

```js
import { splitDocument } from 'kiss-ssg'

const { layout, page, partials, assets, regions } = splitDocument(html)
```

`splitDocument` cuts the document into a layout holding `<head>` and the
chrome, one partial per region under `site/` or `sections/`, and a page view
that is a list of partial calls. `parseHtml` and `findTag` come with it, for
inspecting a document without splitting it.

**The stylesheet stays whole, and stays where it was.** Every inline `<style>`
and `<script>` is still in the layout, byte for byte, where the page had it. It
is not split and not renamed `.scss`: Sass reads plain CSS differently in
places — `#{` inside a string is interpolated, a string `@import` becomes a
compile-time import, native nesting is flattened. Lifting them into files is a
separate improvement, because a move reorders the cascade around an external
`<link>`, changes what a relative `url()` resolves against, and with `defer`
changes when a script runs.

**What it guarantees is that it changed nothing.** Assembling the layout,
partials and page view back through Handlebars reproduces the document — every
tag exactly as written, no whitespace added anywhere (a line break appears only
where the page had one, so a minified page stays dense inside its partials),
every body node still in the place it was written (a `<script>` included, so
one before the content still runs before it), `<main>` re-emitted only if it
was there. Measured on a real 21KB page: 118 elements in, 118 out, same order.
The page is read by **htmlparser2**, a new runtime dependency, which reads HTML
the way the spec does without adding tags the page never wrote.

**`{{` in the source is escaped, and it is the one byte a conversion changes
on purpose.** What `splitDocument` writes is `.hbs`, and kiss compiles `.hbs`
— so braces in a document you hand it are not text, they are code. A page
using Alpine or Vue interpolation (ordinary for something written in a chat)
would have every one of them evaluated against kiss's context and erased, and
a page written to attack you would have them evaluated too, including in
attributes, where no body comparison looks. They are emitted as `\{{`, which
renders the literal `{{` the source meant. `result.expressions` lists what was
found, because only you can say which kind of page you have; pass
`escapeExpressions: false` for a document you wrote and mean kiss to compile.

**`warnings` is the list to read before you ship.** It is empty for an
ordinary page. Non-empty means the conversion did something it could not do
losslessly and is telling you which — there are exactly two such things, and
with `escapeExpressions: false` they make three places where assembling does
not give the input back:

- **A `{{` with a backslash already in front of it.** Handlebars has exactly
  one escape, `\{{`, and a preceding backslash eats it; measured across runs
  of nought to five, two or more backslashes emit one fewer and evaluate
  anyway. There is no sequence that yields a literal run followed by a
  literal `{{`, so those braces are emitted as `&#123;&#123;`. The page
  renders the same; the bytes differ, and inside `<script>` or `<style>`,
  where a character reference is not decoded, so does the text.
- **A node written between two sections** — a `<nav>`, an `<aside>`, a
  `<script>`, a comment, stray text — comes out after all of them. Chrome goes
  in the layout so every page gets it, and sections render at a single content
  block, so an interleaved node has nowhere else to go. Move it above the
  first section or below the last if the order matters.

**What it refuses to do is guess.** You name the regions — the proposals come
from `id` and class, which are markup names, so a hero carrying `id="top"` is
proposed as `top`. You decide which words become model fields. Whether to lift
the inline `<style>` and `<script>` into files later is yours too — they are
reported, each with its `attrs`, and left where they were. Those are judgements
nothing could check, and a module that made them would produce field names no
human would
have chosen.

### The `kiss-site-import` skill, and example 12

`/kiss-ssg:kiss-site-import` walks the whole sequence. `kiss-site-new` now
routes you to it when you arrive with a page rather than a description.

`examples/12-from-a-single-file/` is the job done end to end: the artifact it
started from, the conversion script, a comparison tool that proves the page
unchanged, and the site that came out. `npm run eg12`.

The rule it all turns on, if you read nothing else: **convert first, improve
second.** A conversion that also tidies the markup cannot be verified, because
nothing can tell your improvements from your mistakes. Get to "the same page,
in pieces", prove it, then change things as a step with its own name.

### Codex beside Claude Code

kiss-ssg's two plugins now serve **Codex** as well as Claude Code, from the
same marketplace: Codex reads `.claude-plugin/marketplace.json` as it is
(measured with Codex CLI 0.157.1). `npx kiss-ssg init` sets a folder up for
both agents.

- **It writes `.codex/config.toml`**, the counterpart of
  `.claude/settings.json`: the `kiss-ssg` marketplace and both plugins. Once
  Codex trusts the folder, this switches kiss's skills on for that project.
- **It prints the Codex install lines** after the Claude Code ones:

  ```sh
  codex plugin marketplace add cprobert/kiss-ssg
  codex plugin add kiss-ssg@kiss-ssg
  codex plugin add kiss-memory@kiss-ssg
  ```

  Codex installs plugins **per user**, not per project, and adding one also
  switches it on in every folder, so these run once; a second site needs only
  the project file.

- **`AGENTS.md`**, the file Codex reads, now names the kiss skills and those
  three lines.
- **`lib/init.js` exports `CLAUDE_STEPS` and `CODEX_STEPS`**, each agent's
  three plugin lines, which is what `init` prints.

One smaller fix to the starter: after `npm init -y`, `init` used to keep
npm's `"main": "index.js"`, a file nothing writes; it now points `main` at
`router.js`, as it already did for `"type"`, and says so.

### `check` on a large site: paths the host serves, and every finding once

Two things a real upgrade (a 686-page site) ran into.

**`links.hostServed`.** Some paths are served by the host but written by no
build: a Firebase function rewrite at `/v1/…`, a folder another tool bundles
into after kiss, a file a deploy step adds. The link scan could only call
those broken, and on that site they buried the real findings. Declare them:

```js
new Kiss({
  links: { hostServed: ['/v1/**', '/js/bundle-*.js', '/llms.txt'] },
})
```

Patterns are root-relative: `*` matches within one segment, `**` across
segments, and everything else is literal. A reference the build can't
resolve that matches one is **counted** in `report.links.hostServed`
instead of listed in `links.broken`. Patterns match the path the browser
actually requests: `..` is resolved, and a site whose `siteUrl` has a path
prefix writes its patterns with it (`/docs/api/**`). The default is `[]`, and
a pattern without a leading `/` throws at `new Kiss()`. On that site its patterns took
the findings from 2,738 to 88.

**Every finding once.** `npx kiss-ssg check` sends the build log to stderr
and the report to stdout, and a terminal shows both, so every broken link
and every audit finding printed twice. Under check, the log now gives the
count, `N broken links (listed in the check report)` and
`Audit: N pages, M findings (listed in the check report)`, and the report is
the list. A normal build logs each finding as before.

### Upgrading

Nothing in a site's build changes. To set an existing site up for Codex,
**re-run `npx kiss-ssg init`** in it. It appends the Codex section to an
`AGENTS.md` that lacks it and adds `.codex/config.toml`. An existing
`.codex/config.toml` gains only the tables it does not already define, and a
file that defines them in some other shape (a dotted key, an inline table) is
left exactly as it is, with a note to add the rest by hand. It never rewrites
text that is already there. Codex installs plugins per user: if the owner uses
Codex, they run the three `codex plugin` lines `init` prints once on their
machine, and a second site needs only its project file. Commit the new and
changed files with the upgrade, so the site records which skills it uses for
both agents.

`links.hostServed` is opt-in, with a default of `[]`. The one visible change
is in `check`'s build log, which now counts findings instead of listing them;
the report, `--summary` and the JSON are unchanged. Tooling that read
individual findings from that log should read the report instead.

## 2.6.6 — 2026-09-30

### The dev server no longer rebuilds forever when the script shares a name with the build folder

Running a build script without its extension — `node docs --dev` — makes Node
report the script's path as `docs`, not `docs.js`. The watcher watched that
path to rebuild when the script changed, and when a folder had the same name —
a `docs.js` building into `docs/`, the usual shape for a site published to
GitHub Pages — it was watching the build folder instead. Every page the build
wrote looked like an edit to the script, so the dev server rebuilt in a loop
and the browser kept reloading. The watcher now finds the script file itself
(the path, then with `.js`, `.mjs` or `.cjs`) and never watches a folder.
Nothing to change in your site.

### `kiss-site-review` checks that external links open in a new tab

The review skill has a new step: it lists every link in the built site that
leaves for another address without `target="_blank"`, and fixes it in the
template that writes it, with `rel="noopener noreferrer"` and a hidden
"(opens in a new tab)" for screen-reader users. Links to your own `siteUrl`,
`mailto:` and `tel:` links are left alone.

## 2.6.5 — 2026-09-28

### A locked build folder fails in seconds, and says why

On Windows, a `cleanBuild: 'atomic'` build whose folder another program had
open — VS Code's Live Server, an editor, antivirus — sat silent for a minute or
more and then failed with a bare `EPERM`. It now retries for about a second and
a half and fails with a message you can act on:

```
Could not replace ./public/test: a file in it is open in another program — a
preview server such as VS Code's Live Server, an editor, or antivirus (EPERM).
Close it, or point it at another folder, and build again. Nothing was
published; the previous output is unchanged.
```

The previous output stays exactly as it was, and the staged copy of the site
is now deleted when the swap fails — it used to stay beside your build folder
until the next build swept it. Nothing to change in your site.

## 2.6.4 — 2026-09-28

### Every build now asks whether the site looks finished

A passing build is not the same as a site ready to launch. Every non-dev build
whose pages all succeeded — and every `npx kiss-ssg check` — now runs a
launch-readiness audit over the HTML it wrote and the files in its build
folder, and says what it found:

```
  audit description-duplicate: "Small-batch coffee, roasted in Bristol" on 14 pages (./public/…, …)
  audit heading-skip: 8 pages (./public/blog/index.html, …)
  audit favicon-missing
  audit not-found-missing: 404/index.html exists — hosts serve /404.html
  audit debug-dump: 1 file (./public/debug.json)
```

Per page it checks the `<title>` and meta description (missing, or the same on
several pages), `og:image` (missing, or relative — scrapers never resolve one),
a canonical link when `siteUrl` is set, images with no `alt`, one `<h1>`, and
skipped heading levels. Across the site: a favicon, a `404.html` a host will
actually serve, a `siteUrl` still pointing at localhost or a preview deploy, a
`debug.json` from `viewStats()` published with the site, stray files (`.map`,
`.log`, dotfiles, `.DS_Store`) and `console.log(` in scripts you wrote.

It is **advisory**: `ok` and the exit code never move. The result is
`report().audit` — `{ checked, ignored, skipped, findings: [{ check, page, detail }] }`
— the last key in the report, and in `AIKB/last-build.json` the next time you
record it. A check your site deliberately does not want goes in config, with a
comment saying why:

```js
audit: {
  // Never shared on social, so no og:image.
  ignore: ['og-image-missing'],
},
```

`audit: false` turns it off. An id that is not a check throws when the site
starts, so a typo cannot silently switch nothing off. Under `cleanBuild: false`
the build folder holds other builds' files, so the three checks that walk it are
listed under `skipped` instead of run.

The new **`kiss-site-review`** skill reads these findings, adds a pass in a
browser (widths, long text, consistency, things that look clickable and are
not, the 404 page) and reports before it fixes anything. Anthropic's
`frontend-design` skill is recommended in the README as an optional companion
for the look; kiss keeps the structure.

### Upgrading: the audit's first run

Nothing new fails, but every build says more, and a site on `^2` gets it
without asking. Every non-dev build whose pages all succeeded logs one `info`
line, `Audit: N pages, M findings`, then one `notice` line per check that
fired. Expect them on the first build after upgrading: every shipped example
fired `og-image-missing`, `favicon-missing` and `not-found-missing` the first
time the audit ran over it.

- **The report gains a key.** `audit` is appended last, after `outputs`, on
  `report()`, `err.report` and every `kiss-ssg check` report. Tooling that
  asserts the exact key list needs the new key.
- **So does the record.** `AIKB/last-build.json` is the report, so the first
  `npx kiss-ssg aikb` after upgrading writes an `audit` key the committed
  record never had. That is the new key arriving, not a change to the site.
- **Do not fix findings as part of the upgrade.** The upgrade is done when the
  site builds the way it did; the findings are their own piece of work, for
  the `kiss-site-review` skill.

### Upgrading: a page's default title is its own name

A page that set no `title` used to get the default title `Index`, whatever it
was called — so a layout printing `{{title}}` gave every such page the same
title. It now gets its own slug, title-cased: `about-us.hbs` is `About Us`, the
rule `llms.txt` entries already used. On such a site `kiss-ssg check` shows
those pages as changed, and the `<title>` is the only difference. A page that
should keep a particular title sets `title` explicitly. Relatedly, a page you
explicitly titled `Index` now appears under that title in `llms.txt` and the
feed, rather than its slug.

## 2.6.3 — 2026-09-27

### `check --against` reads check's own output

Once a site has recorded its knowledge base, `npx kiss-ssg check` prints
`{ "reports": [...], "diff": [...] }` rather than a bare array — and handing
that output back as the next run's `--against` used to diff every page as
added. It is now read as the reports it holds, so saving one check's output
and comparing the next build against it works the way it looks like it should:

```sh
npx kiss-ssg check router.js > prev.json
# change something, then:
npx kiss-ssg check --summary --against prev.json router.js
```

## 2.6.2 — 2026-09-27

### A staging folder that will not delete is said out loud

Under `cleanBuild: 'atomic'` (and `kiss-ssg check`), a failed build's staging
folder is removed with a few retries, which clears the brief locks a Windows
antivirus or indexer takes. If it still cannot be removed, kiss now logs one
warning naming the folder — nothing was published from it, so delete it by
hand; the next atomic build sweeps leftovers when it starts. Previously the
failure was silent. `close()` does the same for a staged build that was never
completed.

### `await complete()` in dev too

The `init` starter and every example now end with
`await kiss.complete().catch(reportBuildFailure)` in both modes, instead of
only outside `--dev`. Awaited in dev, it resolves after the first build and
the server keeps serving; behind the old `if (!dev)` guard, a dev server that
could not bind its port exited 0 instead of 1. If your `router.js` came from
an example or the starter, you can drop the guard the same way.

### `kiss-site-new` corrected

The skill's list of **seven decisions** (it said "four habits") is now
distinct from the five working habits in `llms.txt`, and its instructions
match what the examples do: `"type": "module"`, the `check` and `aikb`
scripts, and the unguarded `complete()`.

## 2.6.1 — 2026-09-26

### `npx kiss-ssg init` — an empty folder to a site an agent can grow

```sh
mkdir my-site && cd my-site
npx kiss-ssg@latest init
```

`init` installs kiss-ssg, drops a one-page starter site (`router.js`,
`src/layouts/layout.hbs`, `src/pages/index.hbs`, a `.gitignore`), adds the
`build`, `dev`, `check` and `aikb` scripts to `package.json`, points
`CLAUDE.md` and `AGENTS.md` at `node_modules/kiss-ssg/llms.txt`, and declares
kiss-ssg's two Claude Code plugins in `.claude/settings.json`. It ends by
printing the three commands that install those plugins at project scope —
declaring a plugin does not install it — and a prompt to paste into the agent.

It never overwrites a file. `package.json` and `.claude/settings.json` are
merged key by key, `CLAUDE.md`, `AGENTS.md` and `.gitignore` are only appended
to, and the starter is written only when no project is there yet (no
`router.js`, no `src/`, no `package.json` `main` file or `build` script of its
own). On an existing site `"type"` and `"main"` are left as they are, and a
`kiss-ssg` version your `package.json` already asks for is not replaced — run
`npm install` instead. Running it twice changes nothing. `--no-install` skips
npm; `kiss-ssg init --help` lists exactly what it writes.

### The README is the agent quick start; the reference is `GUIDE.md`

The README now opens with the setup above, prompts to copy for each skill, and
how to set things up by hand or for agents other than Claude Code. Everything
it used to document — every method, option and helper, and migrating from v1 —
moved unchanged to `GUIDE.md`, which ships in the package beside `llms.txt`.

### Plugins install at project scope

Every install instruction — the README, `llms.txt`, both plugin READMEs — is now

```sh
claude plugin marketplace add cprobert/kiss-ssg --scope project
claude plugin install kiss-ssg@kiss-ssg --scope project
claude plugin install kiss-memory@kiss-ssg --scope project
```

so the site's committed `.claude/settings.json` records which skills it is
built with.

## 2.6.0 — 2026-09-23

### Source folders are protected before a build touches disk

Unsafe folder layouts now throw at construction, even with `cleanBuild: false`.
Use a dedicated source directory, normally `./src`: neither source nor output
may be the working project root or a filesystem root. Output cannot contain
configured source folders or sit inside a content folder, including helpers
and AIKB. Symlinks and junctions count as their actual locations. A separate
`src/public` remains valid.

### Upgrading: separate a site's source from its root and its output

Previously accepted unsafe layouts must be separated before building. This is a
compatibility restriction; 2.6.0 is the maintainer's explicit version choice
rather than a claim that every 2.5 layout remains accepted.

Move a project-root `folders.src` (`./`) to a dedicated directory such as
`./src`, and keep the build folder apart from every configured content folder,
including helpers and AIKB; a link or junction counts as the folder it points
at. The error names the setting to change, and `GUIDE.md` § Cleaning the build
folder has the rules. `cleanBuild: false` does not bypass the guard.

### Development rebuilds follow additions, deletions and empty saves

New content is discovered, removed content and assets lose their stale output,
and clearing a partial updates the preview after a bounded empty-save delay.
Configured content outside `src` is watched too. Asset saves retain fast reloads:
one changed Sass output can swap in place, while hashed CSS/JS URL changes
re-render pages. A Sass error retains the last-good stylesheet while reporting
the build failure.

Cleanup respects output ownership. Generated files survive asset reconciliation,
and deleting a page restores an asset it had shadowed. `report().outputs.collisions`
lists conflicting producers and their winner; these findings stay advisory.
Non-dev watch replays refresh link findings after output cleanup.

Build performance at 2,000 pages remains comparable to main after removing the
repeated path-resolution cost exposed during verification. Atomic builds remain
one-shot only; non-dev atomic watch recovery is unsupported.

## 2.5.1 — 2026-09-21

What the fleet upgrade to 2.5.0 taught. Seven sites moved onto the published
package in one morning, no engine defect was found, and everything the run
turned up is here. A patch by the maintainer's decision: it adds a page option
and a report key, which semver would call a minor, but every consumer is his.

### A page can name another URL as its canonical

`canonical: 'https://sister.example/course'` on a page — in its `.page()`
options, or returned by its controller — and `{{canonical}}` renders that URL
verbatim. The page is then left out of `sitemap.xml`, `llms.txt` and the
feed: a page that says another URL is the real one is asking not to be
advertised. `report().pages[].canonical` carries the URL, and
`kiss-ssg check --summary` prints one line: `N pages canonical elsewhere —
not in sitemap.xml, llms.txt or the feed`.

The value must be an absolute `http(s)://` URL with a host. Anything else
fails the page at registration, whether or not its template renders the
helper:

```
canonical must be an absolute http(s) URL, got '/mirror' (mirror.hbs)
```

Before this, a site mirroring a sister catalogue had to keep a hand-rolled
canonical helper — learna-kiss has 104 course pages whose canonical is the same
course on diploma-msc.com. It can drop that helper now.

### `kiss-ssg check` says which kiss-ssg it found

On stderr, before the build, in both output modes:

```
kiss-ssg 2.5.1 from node_modules/kiss-ssg
kiss-ssg 2.5.1 from node_modules/kiss-ssg — a link to C:/Code/kiss-ssg, not the registry package
```

It resolves from the build script's folder, the way Node does, so a script in
a subfolder with its own `node_modules` is reported from there. **Upgrading a
site that used a `file:` link?** Editing `package.json` to `^2.5.1` and
running `npm install` keeps the link — the lockfile's entry still satisfies
the range — so the site reports a registry version while building against the
working tree. Six of six sites hit this. Run
`npm install kiss-ssg@^2.5.1 --save-dev` instead, and read the line.

### Aliases with no `redirects.format` now warn

The message is the same and so is its condition — it fires only when a page
actually carries an alias — but it arrives at `warn` rather than `notice`.
Measured on a real site with fourteen aliases and no format: one cyan line was
all that stood between it and fourteen live 404s on the next deploy.

### The staging folder stays out of `config.folders.build`

Under `kiss-ssg check` and `cleanBuild: 'atomic'`, `this.config.folders.build`
inside a `complete()` callback, and `{{config.folders.build}}` in a template,
are the folder you configured — never `…kiss-staging-<pid>-<random>`. A
site's callback used to print the staging path under `check`, because a check
never promotes and nothing pointed the folder back. The one reader that still
sees the staging path is a pipeline step's `KISS_BUILD`, on purpose: a tool's
output has to land in the build being staged.

### Smaller

- `llms.txt` opens by naming the two Claude Code plugins and how to install
  them, so an agent about to write its first build script is told before it
  starts rather than at the knowledge-base section it never reaches.
- The generated `AIKB/README.md` says what the subject hash is: sha1 of the
  controller file's bytes with line endings normalised to LF, so a Windows
  clone agrees with the Linux clone that wrote the stamps.
- The `kiss-site-migrate` skill carries the `file:` link hazard above;
  `kiss-page-add` carries the canonical option.

## 2.5.0 — 2026-09-20

### Upgrading: three builds that used to pass now fail

Three of the changes below will fail a build that used to pass. That is
deliberate, and it is a minor release on the same reasoning as 2.4.0's redirect
change: the maintainer owns every site consuming this package, so a break is a
migration he schedules rather than a promise made to strangers.

**If you installed this from the registry expecting `^2.4.0` to be safe, these
are the three notes that explain why your build started failing** — and in all
three cases the thing that now fails was already broken, silently, in the
output you were publishing. Treat a new failure as a bug the upgrade surfaced,
not one it caused.

Run `npx kiss-ssg check router.js --summary` before you change anything: it
reports all three against a staged build it then throws away, so you find out
without publishing. Work the `failures` entries first: a page that fails to
render is absent from the output, which makes every `{{link}}` to it a
`broken link:` finding as well, so fixing the failure clears findings
downstream of it.

### Upgrading: a missing asset now fails the build

`{{asset "css/site.css"}}` on a path no `.copyAssets()` emitted used to log a
warning and render the path anyway. Your build passed, `report().ok` stayed
`true`, `kiss-ssg check` said ok — and the site shipped a 404.

It now fails the build, the same way `{{link}}` fails on an id no page claims.
They are the two halves of "never hand-write an internal URL" and they have
been checked to different depths the whole time.

```
asset: 'css/typo.css' is not in the build (asked by index.hbs)
  — no .copyAssets() emitted it. Check the path, or the folder it should
    have been copied from.
```

**Nothing becomes wrong that was not already wrong** — the warning has been in
your log all along. It becomes visible. If a build starts failing here, the
404 was already being published. It is usually one of three things:

- **A typo, or a file that moved.** Fix the path in the template.
- **A real file that kiss never copied**, put there by a bundler, a CSS
  toolchain, or committed into the build folder by hand. kiss only knows what
  a `.copyAssets()` emitted, so add one:
  `kiss.copyAssets('./vendor', './public/vendor')`.
- **Not a path into this build at all**, which is fine (see below). If one of
  those is failing, you are on 2.5.0 before that was fixed; upgrade.

Details worth knowing:

- **`dev: true` still warns and carries on**, because the file you are about to
  add legitimately is not there yet. It now renders the path **as you wrote
  it**; it used to strip a leading slash first, so `{{asset "/missing.css"}}`
  became `missing.css` — a different URL on a nested page.
- If the file is genuinely put in the build by something other than kiss, copy
  it in with an extra `.copyAssets()` so the manifest knows about it.
- **A `?query` or `#fragment` is fine**, and so is anything with a scheme or a
  protocol-relative `//host/…`. `{{asset "img/logo.svg#symbol"}}` resolves the
  sprite and keeps the fragment; `data:` URIs and `https://` pass straight
  through. Only the path itself has to be in the build — and when it is not,
  the message names the reference you wrote **and** the path it looked up
  underneath it, so a stripped slash or a split-off fragment never leaves you
  searching your templates for a string you never typed.

### Upgrading: a stylesheet that will not compile now fails the build

A Sass syntax error used to be logged in red and then dropped: the build
resolved, `report().ok` stayed `true`, and the site shipped with no CSS. It is
a build failure now, named `<sass: css/site.scss>`, in the same shape as a
failing page. One broken stylesheet still does not stop the others or the copy.

```
1 build failure: <sass: css/site.scss>
```

Fix the stylesheet. If the site has been shipping without that CSS for a
while, expect the first successful compile to change the rendered page, and
compare it before you deploy.

### Upgrading: Sass partials are no longer compiled on their own

A leading underscore is the Sass convention for "this is a partial, do not
compile me standalone", and dart-sass never compiles one. kiss did — so
`_buttons.scss` was emitting a `_buttons.css` nobody asked for, and the most
ordinary Sass layout there is (a `main.scss` that defines variables and
`@import`s a `_buttons.scss` reading them) could not build once the rule above
made a compile error fatal.

**If you were serving one of those emitted files, it will 404 after this
upgrade.** One `info` line per build names the set that was skipped:

```
Skipped 1 Sass partial (a leading underscore means "do not compile standalone"): css/_vendor.scss
```

Grep the templates and stylesheets for a `_<name>.css` reference to see
whether anything asks for one. If a file genuinely needs compiling on its own,
rename it without the underscore and update whatever `@use`s or `@import`s it.
If nothing references it, the emitted file was dead weight.

### Upgrading: a `helpers/` folder you already had is now imported

kiss now imports `config.folders.helpers` (default `./helpers`) and calls its
`registerHelpers` export itself (below). A site that already had a root
`helpers/` folder with an `index.js` for something else now has it imported on
every build. If it is **not** a kiss registrar, point `folders.helpers`
somewhere else, move the folder, or leave it: kiss warns and carries on when it
defaulted to a folder whose entry exports no registrar, and fails the build
only when you named the folder yourself. If it **is** a registrar that the
build script also calls by hand, drop the manual call: it now runs twice.

### Upgrading: a dev build's `report()` now shows a failing page

Under `.watch()`, a page that starts failing mid-edit now moves `report().ok`
to `false` until the next save, where it used to be absent from the report.
Nothing to fix, but tooling that reads `report()` during a dev session will
see failures it did not see before, and they are real ones.

### Custom helpers register themselves

kiss now loads `config.folders.helpers` (default `./helpers`, beside your build
script) and calls its `registerHelpers` export itself. Your router needs no
line for it:

```js
// helpers/index.js
export function registerHelpers(kiss) {
  kiss.handlebars.registerHelper('shout', (s) => String(s).toUpperCase())
}
```

- **If your router already calls `registerHelpers(kiss)` by hand**, it now runs
  twice. Harmless, and a `notice` tells you the line is redundant so you can
  delete it.
- **If you already had an unrelated root `helpers/` folder**, kiss says so and
  carries on without site helpers rather than failing your build — it guessed
  the folder, so it does not get to break you over it. Point
  `folders.helpers` somewhere else, or set it to `null`.
- **It is watched in dev.** Editing the entry re-imports and re-renders. A
  helper the edited file no longer registers is unregistered. Editing a
  _sibling module_ the entry imports cannot take effect — ESM has no
  cache-invalidation API — so kiss prints a restart notice and does **not**
  rebuild, rather than reloading the page and implying your edit landed.

### `report()` tells the truth between builds under `.watch()`

`report()` is the machine verdict, and in watch mode it used to lag: breaking a
stylesheet, or a page, put the failure in the log immediately while
`report().ok` went on saying `true` until the next whole-site rebuild.

- An asset re-copy, a helpers reload, a scoped page re-render and a callback
  running after an earlier settle all refresh the verdict now.
- **A page that starts failing under `.watch()` is recorded** — it used to be
  loud in the console and absent from both `failures` and `report()`. The cost
  is that a transient mid-edit render error moves `ok` to `false` until your
  next save.
- `duration` is frozen at the settle, so a session left open does not report an
  hour-long build. A refresh returns a **new object**, so a reference you kept
  is a snapshot of when you took it.

### Smaller fixes you may have hit

- An indented `{{> "snippet"}}` calling a `.txt` partial threw, and the page
  wrote nothing. Fixed.
- The "two sources, one emitted file" warning was dead under
  `assets.hash` — the one configuration a production site builds with.
- A Sass **write** failure (a directory in the way, a read-only target) said
  `Error parsing sass file`. It now names the write.
- `registerPartials()` was typed `any[]` in the published `types/`.
- `{{root}}` is documented as what it is: a value **your** page or layout
  supplies (the climb back to the build root), not a kiss helper. An undefined
  `{{root}}` renders empty and says nothing.

### Packaging

- `examples/*/public/` no longer ships — 75 files of example build output were
  in the tarball.
- `CHANGELOG.md` now does, so an agent working in `node_modules/kiss-ssg/` can
  read what changed between the version a site was written against and the one
  it has.
- Every example is a self-contained project you can copy:
  `examples/<n>-<name>/router.js`, run from its own folder.

## 2.4.0 — 2026-09-16

### Upgrading: read this first if your site uses `aliases`

**Your `_redirects` file will stop being written unless you ask for it.** Until
now every build with page `aliases` wrote `<build>/_redirects` automatically.
It no longer does: kiss writes the host-neutral `<build>/redirects.json` and
leaves the host encoding to you.

```js
new Kiss({ redirects: { format: 'netlify' } }) // what you used to get for free
```

A build that has aliases and no `format` prints a notice saying exactly that,
so you will see it the first time you build rather than the first time someone
follows an old link. This is a behaviour change in a minor release — a
deliberate call by the maintainer, who owns the consuming sites — but if you
installed this from the registry expecting `^2.3.0` to be safe, this is the
paragraph that explains why your redirects went missing. Set `format` and
you are back to exactly the 2.3 output, byte for byte.

### Redirects are portable now, and can target more than one host

An alias is a fact about your site; `_redirects` was one vendor's encoding of
it. Firebase ignores that file entirely and reads `firebase.json`; Vercel reads
`vercel.json`. Those sites used to get a file no host reads while the build
reported the redirects as written.

- `<build>/redirects.json` — `{ version, rules: [{ from, to, status }] }` — is
  written on every build that has an alias, whatever else you configure.
  `report().redirects.rules` carries the same list.
- `redirects: { format }` names the host encodings to write beside it:
  `'netlify'` (`_redirects`), `'firebase'`, `'vercel'`, `'htaccess'`, `'none'`,
  or a function. **It takes a list**, so `['netlify', 'firebase']` emits both
  from one build — for a site with Netlify previews and Firebase production.
- Firebase, Vercel and Apache get a **fragment to merge**
  (`redirects.firebase.json`, `redirects.vercel.json`, `redirects.htaccess`) —
  never your real config file, which holds hosting targets, headers, rewrites
  and often years of hand-maintained history.
- A custom writer is `(rules, { buildDir, config }) => [{ file, contents }]`.
  It can build on a shipped encoder rather than reinventing one: every renderer
  is now a named export — `import { renderRedirects } from 'kiss-ssg'`.
- A misspelled format throws at `new Kiss()`; a writer that throws fails the
  build. Neither silently writes nothing.

Every redirect is still a permanent `301`. There is no way to ask for a `302`,
`308` or `410`, and no forced or wildcard rules.

### `links: { trailingSlash }` — the trailing slash is your host's, not ours

A directory index used to always canonicalise as `/courses/`. That is right on
Netlify, which 301s the bare `/courses`; it is exactly wrong on Firebase with
`cleanUrls` + `trailingSlash: false`, which 301s the slashed form instead. Both
measured on live sites. The default is unchanged, so nothing moves unless you
say so:

```js
new Kiss({ links: { trailingSlash: false } }) // /courses, not /courses/
```

It moves **every URL the build derives for a page together** — `{{canonical}}`,
`{{link}}`, `<loc>`, the `llms.txt` entry, the feed `<link>` and every alias
target — because a page advertised at one spelling and linked at the other
ships a redirect hop on every internal click. It deliberately does not touch
`{{isActive}}` (page identity is not a host policy), a trailing slash you wrote
yourself, or the site root, which stays `/` either way.

See **Host URL policy** in the README for the measured per-host table.

### `.robots()` — robots.txt, and a `Sitemap:` line that cannot drift

```js
kiss.page({ view: 'index.hbs' }).sitemap().robots().generate()
```

The crawler blocks are boilerplate you have probably hand-written. The point is
the last line: it is built by the same join as every `<loc>`, so it names the
sitemap this build actually wrote, and it is only emitted when you called
`.sitemap()` — advertising one that does not exist is a fetch error in every
crawler that reads it.

`examples/6-sitemap` and `examples/11-blog` both call it. The static
`robots.txt` that six examples used to copy from `_shared/assets/` is gone: it
was two lines that never mentioned the sitemap those examples generate, which
is the gap this method exists to close.

`agents`, or the `userAgent`/`allow`/`disallow` shorthand, set the blocks;
`sitemap` overrides what is advertised; `overwrite: false` leaves a `robots.txt`
you keep in `src/assets/` alone. `report().robots` carries
`{ file, agents, disallowAll, sitemaps }`.

**`disallow: '/'` removes your site from search**, and is one character from the
bare `Disallow:` that means the opposite — so it logs a notice on every build
that emits it and sets `disallowAll`, which means a staging crawl policy that
reaches production shows up in a `kiss-ssg check` diff. kiss never infers a
`Disallow` for you; in particular `ignoreSitemap` does **not** imply one,
because blocking a crawler stops it seeing a `noindex` and can leave the URL
indexed with no snippet.

### Also

- `report().redirects` gains `rules`, `json`, `formats` and `files`;
  `redirects.format` (a string) is now `redirects.formats` (a list), and
  `redirects.file` is the **first** host file with `files` authoritative.
- `report()` gains `robots`, appended after `feed`.

## 2.3.0 — 2026-09-16

### A page can opt out of `extensionLess`

`config: { extensionLess: false }` on one page is now honoured. It was accepted
and silently ignored, because the output path was resolved from the instance's
config rather than the page's own. That matters most for the 404: Netlify and
Cloudflare Pages look for a literal `404.html` at the publish root and will not
fall back to `404/index.html`, so an otherwise `extensionLess` site had no way to
give them one.

```js
.page({ view: '404.hbs', slug: '404', config: { extensionLess: false } })
```

### `isActive`'s block can see the surrounding context

The block now renders with the surrounding context **plus** the hash, the hash
winning on a clash. Previously it saw the hash alone, so the natural data-driven
nav rendered an empty label for every item — on a green build, with nothing able
to warn:

```hbs
{{#each nav}}{{#isActive ../page href=href}}{{label}}{{/isActive}}{{/each}}
```

`active`, `href`, `folderMatch` and `pageURL` are still always the helper's own.
If your templates already passed everything the block needed, nothing changes.

### Fewer false findings from the knowledge base

`kiss-ssg check` no longer reports a note as **dangling** for citing a page id
(`shelf/index` — the name the rest of your site links that page by) or for
mentioning a bare file extension in a sentence. Both were the correct way to
write a note, and both were reported as broken references.

Note lookup is also case-tolerant now: a controller named `jobList.js` can have
its note at `jobList.md`, which the generated README's own rule told you to
write, rather than being reported missing and dead at the same time.

### The build script has a documented shape

`llms.txt` gains a **The build script** section: call it `router.js`, keep it a
route table, and extract `helpers/` the moment you write your first custom
helper, `config/` the moment one fact appears in both your markup and your
structured data. The two triggers are independent, and file length is not one.

The eleven examples now each live in their own folder with their own
`router.js`, run the way a real site is run (`cd examples/3-pages && node
router`), and each states which shape it is and why.

## 2.2.2 — 2026-09-15

**Two silent Tailwind traps documented, one new link option, and `check` now names the asset that moved**

**Added: `links: { canonical: true }`.** If your host serves `/about` and
301s `/about.html` to it, every bare `{{link}}` was shipping a redirect
hop unless you wrote `canonical=true` on each call — a rule nothing
enforces, and forgetting it once is invisible in dev and wrong only on
the deployed site. Set the config key once instead. It is **off by
default**, so nothing about your existing links changes; a per-call
`canonical=false` still opts one link back out, and `canonical` and
`absolute` now compose, so `{{link "about" canonical=true
absolute=true}}` gives `https://example.com/about` where it previously
ignored `absolute` and gave `/about`.

**Changed: `kiss-ssg check` names the assets whose filename moved.**
Under `assets: { hash: true }` a stylesheet's filename is the hash of its
bytes, so changing one asset rewrites the `<link href>` of every page
that references it — and the diff said `~ <every page>, = 0 unchanged`
with nothing in any page source to explain it. The diff now opens with
one row per moved asset, above the page list it explains:

```
  ~ asset css/site.css -> css/site.136acc63.css (was css/site.e7abc083.css)
  ~ ./public/index.html
  ~ ./public/about.html
  = 0 unchanged
```

`diff[].assets` carries the same rows as `{ source, from, to }`.

**Docs: two ways a Tailwind pipeline step silently builds the wrong
stylesheet.** Both verified on Tailwind 4.3.3, and both exit 0 while
writing a plausible file. First, `@source` **adds** to Tailwind's
automatic walk of your whole project rather than replacing it — so a
site that writes an explicit `@source` list is still scanning its own
markdown, and with `assets.hash` an ordinary English word typed into a
`.md` compiles a utility, renames the stylesheet and changes every
page's `<link href>`. It is intermittent, which is what makes it
expensive: `capitalize` in prose compiles a rule, `capitalize.` does
not. Use `@import 'tailwindcss' source(none)` and list your template
folders — remembering that an `@source` path resolves against the
stylesheet's own folder, not the working directory. Second, omitting
`-i` does not lose a few rules: the entry stylesheet is never read at
all, so every `@layer components` class, `@theme` token, `@font-face`
and plugin import goes with it.

**Docs: `markdown.breaks` changed during the v2 prereleases.** It was
`true` in `2.0.0-alpha.5` and has been `false` since `2.0.0-beta.1`. If
you pinned an alpha you may still be carrying a
`kiss.remarkable.set({ breaks: false })` + `kiss.registerPartials()`
workaround for a default that no longer exists — the migration notes now
say so.

## 2.2.1 — 2026-09-12

**Three hardening fixes to 2.2.0's redirects and feed, from an adversarial review**

**Fixed: a `_redirects` that cannot be written now fails the build.** It
used to be logged and swallowed, like a sitemap write failure — but a site
published without its redirects is a site whose old URLs 404, which is the
loss `aliases` exist to prevent. The failure is reported as `<redirects>`
in `err.failures`, and under `cleanBuild: 'atomic'` the staging folder is
discarded so the previous deployment stays live.

**Fixed: an alias is one path.** An alias with a space or a line break
inside it (`'/old post'`) is dropped rather than written, because the
`_redirects` format is space-separated columns and one rule per line, and
such an alias would have produced more than the one rule it stands for.
Leading and trailing whitespace is still trimmed as before.

**Fixed: `.feed({ filename })` cannot write outside the build folder.** A
name that resolves outside it (`'../x.xml'`) is refused with
`Refusing to write outside the build folder`, the same check every page
write already made. It matters most under `kiss-ssg check` and
`cleanBuild: 'atomic'`, where the build folder is a staging sibling that
was promised to be the only thing written.

## 2.2.0 — 2026-09-12

**Your site can now tell you what you broke and what you lost, and link to itself by name**

**Added: broken internal links.** Every settled build gathers the `href`,
`src` and `srcset` references each page writes and resolves them against
the files the build wrote, the pages it registered (including directory
indexes and extension-less URLs) and the asset manifest. Schemes,
protocol-relative URLs, fragments and empties are skipped; same-origin
absolute URLs are checked as internal. The result is
`report().links = { checked, broken: [{ page, href }] }`, printed by
`check --summary` as `broken link: <page> -> <href>` lines. It runs in
check mode too, is `null` in dev, and `config.links = { check: false }`
switches it off. Exit codes are unchanged.

**Added: page identity and `{{link}}`.** Every page carries an `id`, by
default its view's route without the extension (`about`,
`blog/index`), and a fan-out item `<registration id or view route>/<slug>`.
Set `id` on `.page()` to name a page yourself; two explicit pages claiming
one id fail the build, an explicit id beats a default one, and two
default ids that collide are both withdrawn with a notice. Templates then
write `{{link "about"}}`, `{{link "blog/post" slug=post.slug}}`,
`{{link "about" absolute=true}}` or `canonical=true` and get the served
path (`/`, `/about.html`, `/blog/x/`), so a page can move and every link
to it follows. An id no page claims fails that render in a build
(`link: no page with id "…" (asked by <view> / <served path>)`) and
renders `#` with a warning in dev. `id` appears on the report and in the
site map.

**Added: `aliases` and `_redirects`.** Give a page `aliases: ['/old.html']`
and every build writes `<build>/_redirects` (`/old.html /new 301`), the
server-side format Netlify and Cloudflare Pages read. No meta-refresh is
ever written. On a recorded site the report also carries
`redirects.removed` (a page in `AIKB/last-build.json` that is gone with no
alias covering its URL), `redirects.moved` (the same id now served from a
different URL, with no alias for the old one) and
`redirects.collisions` (an alias that points at a live page), printed by
`check --summary` as `removed without redirect:`,
`moved without redirect: <from> -> <to> (<id>)` and
`alias collides with a page:` lines. The alias you paste to silence a
finding may use either the canonical or the served spelling.

**Added: `.feed(options)`.** Writes an RSS 2.0 `feed.xml` from the same
registry as the sitemap: `{ title, description?, section?, limit = 20,
filename = 'feed.xml', dateField = 'date' }`. Dated pages only, newest
first, `lastBuildDate` equal to the newest item, URLs identical to the
sitemap's, byte-stable across identical builds; requires `siteUrl`. Pages
can opt out with `ignoreFeed`. `report().feed` names the file.

**Added: example 11, a blog.** Pagination, tag pages built by fan-out,
one aliased post, a feed, a sitemap, identity links throughout and a
recorded `AIKB/` with two stamped notes. `npm run eg11`; `-- --broken`
plants one bad link so you can see what a `broken link:` finding looks
like. The Claude Code skills in `plugins/` teach all of the above, and a
test now fails if a public feature is missing from the skill that should
mention it.

## 2.1.1 — 2026-09-12

**Your site can now remember itself, and only when you ask it to**

**Added: `npx kiss-ssg aikb <script>`**, a sibling of `check`. It runs your
build script staged and discarded, publishing nothing, and if the build
passed writes the site's knowledge base into `folders.aikb` (default
`./AIKB`, a new folders key): `README.md` once, then `site-map.md` and
`site-map.json` (every page with its view, model source, controller source
and the partials it rendered; the partial index; models, controllers,
pipeline steps; and a `subjects` list with a content hash per controller
file and pipeline step) and `last-build.json` (that build's report minus
its timings). Every file is byte-stable across identical records, so the
folder belongs in git. Nothing else writes it — not a build, a dev server, a
watch rebuild or a `check` — and a failed build is refused with
`not recorded — build failed`. A site is opted in once it has recorded.

Notes are yours: a controller file, a URL model or a pipeline step wants a
note under `AIKB/notes/` at a path derived from its id, optionally stamped
with `subject-hash: <sha1>` copied from the report. Every build of a
recorded site reports four findings on `report().aikb.notes` — **missing**,
**dead**, **stale** (the subject changed under a stamped note) and
**dangling** (a backticked file reference that resolves to nothing, in a
note or in the authored `AIKB/site.md`) — printed by `check --summary` as
`note …:` lines. None fails a build or changes an exit code.

**Added: `kiss-ssg check --against <report>`** and page hashes. Each page
in a report carries `hash`, the sha1 of the bytes it wrote. `check` diffs
this build against an earlier report — a `KISS_REPORT` file, the array
`check` prints, or a single report — and prints which pages were added,
removed or changed; a recorded site is diffed against its own
`AIKB/last-build.json` with no flag. Under `--summary` the diff prints under
the site's line; otherwise stdout becomes `{ reports, diff }` whenever there
is a diff to print. The exit code is unchanged by any of it. `report()`
gains `aikb` (`null` unless the site has recorded) and `pages[].hash`.

**Added: the `kiss-memory` Claude Code plugin** in the same marketplace
(`/plugin install kiss-memory@kiss-ssg`): `kiss-site-brief` briefs a
returning developer from the recorded folder, `kiss-branch-open`,
`kiss-branch-pulse` and `kiss-branch-close` run a piece of work on a site
against the `check` diff with the close as the only moment the record
moves, and `kiss-memory-consolidate` folds session logs into `AIKB/site.md`
and repairs the notes `check` flags. The `kiss-ssg` plugin's skills are
renamed to the same thing-action shape: `kiss-site-new`, `kiss-page-add`,
`kiss-site-migrate`, `kiss-build-check`.

**Fixed:** after a successful `cleanBuild: 'atomic'` promotion, `report()`'s
`sitemap` and `llms` named the discarded staging folder rather than the
real one.

Example 9 ships a recorded `examples/9-migrated-from-v1/AIKB/` with one
stamped note as the exemplar.

## 2.1.0 — 2026-09-10

**`.llms()` writes your site's llms.txt**

**Added: `kiss.llms({ title, summary, notes?, sections? })`**, a sibling of
`.sitemap()`. It writes `llms.txt` — the [llmstxt.org](https://llmstxt.org)
index an answer engine reads before it crawls — into the build folder from
the pages you already registered: an `# title`, a `> summary` blockquote,
one `##` section per top-level `path` and one `- [title](url): description`
line per page, plus an optional `## Notes` section. `summary` and `notes`
take inline text or a path to a `.md`/`.txt` file, and `sections` maps a
path segment to a heading. Every URL is the same string as that page's
`{{canonical}}` and its `<loc>` in `sitemap.xml`, built by the same code, so
the three can never disagree. Call it before or after `.generate()`; a
whole-site `watch` rebuild re-runs it.

Per page: `ignoreLlms: true` keeps a page out, `llmsSection: 'Name'` moves
it to another heading, and a page with `ignoreSitemap: true` or
`generate: false` is left out automatically. `report()` gains an additive
`llms` field naming the file written, or `null`. Example 6 now writes one
beside its sitemap, and `llms.txt` has a worked snippet under
**Writing llms.txt**.

## 2.0.0 — 2026-09-09

**v2 is stable.** No engine changes since `2.0.0-beta.2` — this release just drops the
prerelease tag and moves the npm `latest` dist-tag onto the v2 line, so a bare
`npm install kiss-ssg` now installs v2 by default. A `^1` install keeps getting v1;
pin `kiss-ssg@^1` explicitly if you are not ready to move yet. See **Migrating from v1**
in `README.md` and `llms.txt` before upgrading an existing site.

Verified against four real, previously-v1 production sites before this cut — each
rebuilt end to end against this exact code and diffed against its v1 output: no
`generate.js`/`export.js`/controller changes were needed for any of them to build, and
output was unchanged bar one already-known slug-generation fix and cosmetic minifier
differences. One of the four also surfaced and fixed a real v1 bug: `kiss-ssg@1.x`'s
`.pages()` fan-out reused one options object across the whole loop, so a field one
model item's controller set could silently leak into the next item that didn't set it
— v2's per-item isolation turns that into a correctly-reported build failure instead of
silently wrong output.

## 2.0.0-beta.2 — 2026-09-08

**Editing a partial rebuilds the pages that use it, not the whole site**

**Changed: under `watch()`, saving a partial or layout re-renders only the pages
that rendered it.** kiss learns which pages use which partials as they render —
a partial reached through another partial, chosen with `{{> (lookup …)}}`, or
used as a layout all count — so a save to a partial four pages use re-renders
four pages. A partial nothing has rendered yet re-renders every page and logs a
notice naming it. Measured on a 654-page site: a save to a narrowly used
partial went from 1247ms to 388ms; a layout every page extends is unchanged,
because every page really does need re-rendering. Output is byte-identical
either way. With `verbose: true` a dev build also writes `dependency-graph.json`
(partial → the pages that rendered it) beside `debug.json`, and each page's
`.json` sibling lists the `partials` it used.

**Changed: every entry of `kiss.handlebars.partials` is a function.** It was a
string until the partial's first render anyway (Handlebars compiles it and
writes the function back), so a helper that reads one has always had to handle
both shapes. If you render a partial by name in your own helper, pass your
helper's `options.data` through — that is how kiss records the page as using the
partial:

```js
const p = kiss.handlebars.partials[name]
return new kiss.handlebars.SafeString(
  typeof p === 'function'
    ? p(ctx, { data: options.data })
    : kiss.handlebars.compile(p)(ctx, { data: options.data }),
)
```

A bare `p(ctx)` still renders correctly, but that page will not be re-rendered
when the partial changes under `watch()`. `examples/9-migrated-from-v1.js`
shows the shape.

**Fixed: a page with `generate: false` no longer claims its output path.** A
skipped page used to make a real page registered later fail with
`Page already processed`; it also appeared in `sitemap.xml` and logged a
"Removed stale output" line on every rebuild. It now does none of those.

**Fixed: two registrations sharing one CommonJS controller no longer fail every
watch rebuild.** Their fresh re-imports raced, and Node threw
`ERR_INTERNAL_ASSERTION` for both pages on every replay; the in-flight import
is now shared.

**Tooling:** `npm run bench --site=<path> --dev="<script> [args]"` times a
page, a partial and a model save on a real site under watch.

## 2.0.0-beta.1 — 2026-09-08

**Markdown options are configuration, and hard-wrapped prose renders correctly**

**Changed: `.md` partials no longer break at every wrap point.** kiss renders
Markdown with `breaks: false` again — the value published v1 used. Since
`2.0.0-alpha.1` it had been `true`, which turns every newline inside a paragraph
into a `<br />`: a paragraph you hard-wrapped in your editor rendered with a line
break at each of the source's wrap points, mid-sentence. If your `.md` partials
are wrapped at a column, their output changes in this release — that is the fix.
If you actually want a newline to mean a line break, set
`markdown: { breaks: true }`.

**New: `config.markdown`** is handed to the Remarkable instance behind both
`.md` partials and the `{{markdown}}` helper, so the two can never disagree:

```js
new Kiss({
  markdown: { breaks: true, typographer: true },
})
```

The defaults are `html: true`, `xhtmlOut: true`, `breaks: false`. Those are the
keys kiss has an opinion about, not the keys it accepts — the block is passed
through as-is, so any other Remarkable option reaches the renderer. It merges one
level deep, like `sass`, `fetch` and `assets`, so setting one key keeps the rest.

Prefer it to reaching for `kiss.remarkable` after construction: `.md` partials are
rendered to HTML **when they are registered**, which happens in the constructor,
so a later mutation reaches the `{{markdown}}` helper but silently misses every
partial unless you also call `kiss.registerPartials()`. Set in config, it lands
before partials are registered and both paths agree.

## 2.0.0-beta.0 — 2026-09-08

**An asset pipeline, and canonical URLs that don't redirect**

First beta. The v2 surface is settled enough to build against.

**New: `config.assets.pipeline`** runs your own tools as part of the build — a
CSS toolchain, an icon sprite, anything with a command line. Each step is
`{ name?, run, watch?, cwd? }`, and every `run` executes through a shell, in
order, before the asset copy — so a tool that writes into your assets folder has
its output copied, hashed and served like any other asset. It runs on the first
build and again on every whole-site `watch` rebuild. A non-zero exit fails the
build: `complete()` rejects and the step is named `<pipeline: name>` in
`err.failures` and in `report()`, which gains a `pipeline` field. In `dev: true`
a step's `watch` command is started once after its `run` succeeds and is ended by
`close()` — note that a watch child has no stdin, so a tool like Tailwind needs
its keep-alive flag (`--watch=always`). `kiss-ssg check` runs the pipeline too.
See `examples/10-asset-pipeline.js`.

**Changed: a page built to a directory index now canonicalises with a trailing
slash.** `courses/index.html` was emitting `https://example.com/courses` in both
`{{canonical}}` and its `sitemap.xml` `<loc>`. Netlify, GitHub Pages and nginx
all answer that URL with a 301 to `/courses/`, so every canonical link and every
section-index sitemap entry pointed at a redirect rather than at a URL returning 200. Both now emit `https://example.com/courses/`.

This changes bytes in your built output. **Under `extensionLess: true` it affects
every page but the home page**, since each one builds to `<path>/<slug>/index.html`.
Page identity is untouched: `isActive` still matches `/about`, `/about/` and
`about/index.html` as one page, so navigation highlighting behaves exactly as
before. If you were post-processing `sitemap.xml` to add these slashes yourself,
you can stop.

## 2.0.0-alpha.5 — 2026-09-06

**Faster, and safer under watch**

Nothing about your site's output changes. Three follow-ups to the previous
release's speed work, each measured on the same machine against the release
before it:

- **A template edit is always picked up under `watch`.** The compiled-template
  cache now checks the view's content rather than its timestamp, so a save that
  lands inside the same clock tick as the last one on a coarse-timestamp
  filesystem (exFAT, some network and WSL2 mounts) no longer serves the old
  template until your next save. A save that changes nothing no longer forces a
  recompile either.
- **A slow save no longer triggers a failed rebuild.** An editor that truncates
  a file and writes it a moment later used to reach the watcher as an empty
  file, fail the page with a spurious error, and then rebuild correctly. The
  empty event is now ignored and only the real content rebuilds. The one trade:
  a file you create empty is picked up once it has content.
- **Larger production builds start a little sooner.** The HTML minifier now
  starts loading as soon as `new Kiss()` runs rather than at the first page,
  so its load overlaps model resolution. Around 5–11% off the build phase at 500
  pages; no measurable change at 50, where there is too little work to hide it
  behind. Dev builds never load it.

## 2.0.0-alpha.4 — 2026-09-06

**Faster**

Nothing about your site changes — same methods, same config, same output
bytes — but builds and the dev loop got materially quicker. Measured on a
generated 500-page fixture, against the same machine before the change:

- **Your dev loop.** Saving a template now shows up in the browser in about
  35ms instead of ~108ms. Editing a model or a controller — which rebuilds the
  whole site — dropped from 455ms to 172ms on a 500-page site with Sass.
- **Layouts are compiled once, not once per page.** `handlebars-layouts`
  recompiles a layout on every `{{#extend}}` and never caches it, so every page
  in your site was recompiling the whole layout from source. Builds that fan
  many pages out of a few views gain the most: a 500-page fan-out builds 69%
  faster.
- **Stylesheets compiled by the `{{sass}}` helper are cached.** The helper runs
  per render, so a stylesheet named in a partial used to be recompiled once per
  page that included it — identical bytes every time. On a real 111-page course
  catalogue that was ~8 seconds of every build.
- **Starting up costs a fraction of what it did.** `sass`,
  `html-minifier-terser` and the dev-server packages now load when something
  actually uses them, so a build with no `.scss` and no dev server never pays
  for them at all. Importing kiss went from ~490ms to ~63ms; `npx kiss-ssg
check` feels it too.
- **Dev builds skip minification entirely** rather than running the minifier
  with its options turned off. Dev output now keeps its comments and
  whitespace, which is easier to read anyway. Production minification is
  unchanged.

**Note if you read `kiss.handlebars.partials` yourself**

Layouts are now registered as compiled template _functions_; every other
partial is still a source string. If your own helper pulls a partial out of
that object, handle both shapes:

```js
typeof p === 'function' ? p(ctx) : hbs.compile(p)(ctx)
```

## 2.0.0-alpha.3 — 2026-09-06

**Added**

- **A Claude Code plugin** lives in the repository: `/plugin marketplace add cprobert/kiss-ssg` then `/plugin install kiss-ssg@kiss-ssg` gives Claude three skills — build a new site, migrate a v1 site, check a build — each pointing at the docs installed in `node_modules/kiss-ssg/`; the first two also make sure the project's `CLAUDE.md` imports `@node_modules/kiss-ssg/llms.txt`, so later sessions read the contract unprompted. The README's new "Using an AI coding agent?" section says how to point any agent at the package.
- **`npx kiss-ssg check <script>`** — a dry run of your own build script. It
  builds the site into a staging folder, tells you whether it worked, and then
  throws the staging folder away: your build folder is neither emptied nor
  written, so you can check a site whose output is already published. You get a
  JSON array with one report per `Kiss` instance the script created — the pages
  it built, anything that failed and why, the assets it emitted — and exit code
  1 if anything failed, if your script exited non-zero, or if it never settled a
  build at all. `--summary` prints one line per site instead. Arguments after
  the script are passed through to it, so a site that takes a season or a cohort
  is checked the way it is run.
- **`kiss.report()`** — the last settled build as data: `{ ok, mode, buildDir,
duration, pages, failures, assets, sitemap }`, every value JSON-safe, so a
  deploy script can decide what to do without parsing log output. The same
  object rides on the rejection as `err.report`. `complete()` itself is
  unchanged: it still resolves with the data array and still rejects with the
  `AggregateError`.
- **`KISS_CHECK=1` and `KISS_REPORT=<file>`** for driving the same thing from a
  harness of your own: the first turns any build into a check, the second
  appends each settled build's report to a file as JSON Lines. Neither changes
  your script's exit code.
- **TypeScript declarations ship with the package**, generated from the engine's
  own JSDoc. Put `// @ts-check` at the top of your build script and your editor
  knows every config key, every page option and every method — with no
  TypeScript in your project and no `@types/` package to install. Annotate with
  `/** @type {import('kiss-ssg').KissConfigInput} */` on your config,
  `PageOptions` / `PagesOptions` on page options, `KissController` on a
  controller, and `BuildError` on the error `complete()` rejects with, so
  `err.failures` is typed. A misspelled key inside `folders` is now an error you
  see while typing rather than a build that quietly used the default folder;
  keys of your own on the config and on page options stay allowed, because they
  reach your templates.
- `package.json` gains a `types` field and an `exports` map. `import` and
  `require` both still resolve to `lib/kiss.js`, so nothing about the supported
  way of loading kiss-ssg changes. One thing does: the map has a single entry,
  so a deep path into the package — `kiss-ssg/lib/utils.js`, or v1's
  `kiss-ssg/libs/utils.js` — now fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`
  instead of half-working. Everything public is reachable from `'kiss-ssg'`
  itself; `utils` is the named export `import { utils } from 'kiss-ssg'`.
- **`examples/` now ships in the package**, each of the two tiers with its own
  README, so `node_modules/kiss-ssg/examples/README.md` is a copy you can run
  without cloning the repo.
- Two new exemplar examples: `examples/8-data-fed-site.js` (`npm run eg8`), a
  site built from a folder of records where one is broken, and
  `examples/9-migrated-from-v1.js` (`npm run eg9`), every v1 → v2 migration
  recipe from `llms.txt` as running code in a site that builds clean.

## 2.0.0-alpha.2 — 2026-09-06

_Still a prerelease of the v2 line, now on `main`. The v1 → v2 migration notes
live in [`llms.txt`](llms.txt) § Migrating from v1 and in the README, and will
become this file's `## 2.0.0` entry when the line is released._

**Added**

- A documented pattern — "Building more than one site from one source tree"
  (README, `llms.txt`) — for building several versioned outputs (per-intake
  handbooks, a menu rebuilt each season) from one shared `src/`: one `Kiss`
  instance per output, `folders.build` as the discriminator, an arbitrary
  config key carried into views, `folders.assets: null` + explicit
  `copyAssets` when an output must own its assets, and `cleanBuild: 'atomic'`
  so a re-run can never destroy one already published. Runnable example:
  `examples/7-versioned-outputs.js` (`npm run eg7`).

- A fetch policy for models you load from a URL, so `model: 'https://…'` works
  against a real API. `config.fetch` takes `headers` (sent with every
  URL-model request — this is where an API token goes), `timeout` in
  milliseconds, `retries` (extra attempts after a network error or a 5xx; a
  4xx is never retried, and the error tells you how many attempts were made)
  and `cache`. Set `cache` to a directory and every successful response is
  saved there, keyed by the URL and the headers you sent, so the next build —
  including every `dev`-mode rebuild, which until now re-fetched every remote
  model on every save — reads the file instead of the network, and an offline
  build still works. An error response is never cached. There is no expiry:
  delete the directory when you want fresh data, and add it to your
  `.gitignore`.

- Cache-busting asset URLs, so a caching policy stops being something your
  templates spell out. Link a file with `href="/{{asset "css/site.css"}}"` and set
  `assets: { hash: true }` on your config: every `.css` and `.js` copied into
  the build is renamed to carry a hash of its contents
  (`css/site.a1b2c3d4.css`), the helper renders that name, and the file it
  replaces is deleted — so a changed stylesheet is a URL no cache has seen and
  an unchanged one keeps its URL for ever. `assets: { version: '1.4.5' }` is
  the alternative: nothing is renamed and the helper appends `?v=1.4.5`
  instead. With neither set your build emits exactly the files it does today
  and the helper renders the plain path, so the same template line works under
  all three. The path comes back without a leading slash, so you pick the base:
  `/{{asset …}}`, `{{root}}{{asset …}}`, or `{{absUrl (asset …)}}`. Only `.css` and `.js` are renamed — an image, a font or
  `robots.txt` is reached by URLs kiss does not rewrite — but `{{asset}}`
  resolves any file in your assets folder, and wrapping it
  (`{{absUrl (asset "css/site.css")}}`) gives you the absolute URL.

- Two helpers for absolute URLs, so you stop hardcoding your domain in your
  templates. `{{canonical}}` is the current page's full URL — put it in
  `<link rel="canonical" href="{{canonical}}">` — and `{{absUrl '/img/card.png'}}`
  turns any path of yours into one, for `og:image`, a feed or an RSS link. Both
  read `siteUrl` from your config, the same key `.sitemap()` already needs, and
  `{{canonical}}` is built by the same code as `sitemap.xml`, so a page's
  canonical link and its `<loc>` can never disagree: `/about/index.html`
  collapses to `https://example.com/about`, the home page is your `siteUrl` with
  one trailing slash, and it reads the same whether `extensionLess` is on or
  off. Without a `siteUrl` they render nothing and log one warning per page
  instead of failing your build.

- A safe way to rebuild a folder you have already published:
  `cleanBuild: 'atomic'`. The build goes into a staging folder beside your
  build folder and is swapped into place in one step when
  `await kiss.complete()` resolves — so until that moment your previous output is
  untouched, and if any page fails the staging folder is deleted and the old
  output is still there, byte for byte. The swap is two renames — your old
  output aside, the new build in — so it is never half-applied, and a build
  killed mid-flight leaves a folder beside your build folder that the next run
  clears up. Pages, assets and `sitemap.xml` all follow it. Use it wherever `folders.build` holds output people are already
  reading: with the default `cleanBuild: true` that folder is emptied in the
  `Kiss` constructor, before anything renders, and a build that then fails
  leaves it empty or half-built. It is for one-shot builds — in `dev: true` it
  behaves as `true` and tells you so — and only `complete()` promotes, so a
  chain that ends at `.generate()` swaps nothing in. `cleanBuild` now also
  rejects any value other than `true`, `false` or `'atomic'`, rather than
  quietly treating it as "don't clean".

**Changed**

- The v1 → v2 migration notes (`llms.txt` § Migrating from v1, README) now
  carry the recipes learned from two real migrations: the Node floor as the
  first thing to check, a `complete()`-rejection catch you can copy, how to
  dedupe slugs if you relied on v1's duplicate-path skip, and a list of what
  is unchanged in v2 so you don't waste time re-verifying it.

- kiss now refuses to build into a folder that would swallow your source: if
  `folders.build` is `folders.src`, contains it, or is `'.'` or `'/'`,
  `new Kiss(...)` throws instead of emptying it. It is a floor, not a licence
  — if your build folder comes from a variable (`./handbooks/${cohort}`),
  validate it before you construct, because an empty value resolves to the
  parent folder and `cleanBuild: true` would empty that.

- URL models now time out. `config.fetch.timeout` defaults to 10 seconds, where
  before there was no limit at all — an API that accepted the connection and
  then said nothing could hang a build for ever. If 10 seconds is too tight for
  your API, raise it (`fetch: { timeout: 30000 }`); everything else about the
  new `fetch` block is off by default, so a site that sets nothing behaves as
  it did.

**Fixed**

- One bad item in a `.pages()` fan-out no longer takes the rest of the fan-out
  with it. A controller that threw for a single item abandoned every item after
  it — those pages were never built and never mentioned, so a 64-page fan-out
  could report one error and quietly lose 63 pages. Each bad item is now
  reported on its own (named `<view> [item N: <slug>]`) and every good item is
  still built; the build still fails.
- Live reload now works when you preview the site from another device. With
  `devHost: '0.0.0.0'`, a page opened on a phone or tablet asked that device's
  own `localhost` for the reload script, so edits never reached it; the page now
  reloads from whatever host it was loaded from.
- A reload no longer races the file write, and editing an asset of any type
  reloads the page. The browser could previously be told to reload while a page
  was still being written, and editing an `.svg`, `.webp`, `.avif`, `.ico`,
  `.woff` or `.woff2` did not reload at all. Both are now covered by the
  once-per-rebuild reload under **Changed** below, which replaced the
  write-settle and the watched-extension list this entry first described.
- A trailing slash on a folder you configure is now tolerated. Previously
  `folders: { assets: './src/assets/' }` wrote the compiled CSS next to your
  build folder — `./publicmain.css` at the project root — and logged it as a
  success, so the deployed site had no stylesheet.
- A trailing slash on `folders.models` no longer breaks a `.pages()` fan-out.
  `folders: { models: './src/models/' }` made every model in the folder
  unreadable and failed the build with `Invalid model <folder>`, an error that
  blamed the folder name.
- A project folder whose name contains `[`, `*` or another glob character (for
  example `site[old]`) now builds. Previously `.scan()` found no pages, no Sass
  was compiled, and the build finished reporting success with an empty output
  folder.
- A page whose view file is missing or misspelled now fails the build instead of
  writing the filename into the output. Previously `.page({ view: 'abuot.hbs' })`
  produced `public/abuot.html` containing the text `abuot.hbs`, and the build
  reported success.
- Deleting a page template while watching now rebuilds the whole site, instead of
  re-rendering the deleted page over its own output. If `.scan()` found that
  page, it is dropped from the site and its output file is deleted; a page you
  registered by name with `.page()` keeps failing the build until you remove the
  call.
- Deleting a partial or layout while watching now removes it from the site.
  Previously it kept rendering its last-known content until you restarted, so
  the dev server and a fresh production build disagreed; a page that still
  references the deleted partial now fails the rebuild instead.
- Creating a partial or layout while watching now registers it straight away.
  Previously new files were invisible until you restarted, and the next edit to
  a page referencing one failed silently, leaving that page's output frozen.
- Creating a page template while watching now builds it, on a site that uses
  `.scan()`. Previously it needed a restart, because a rebuild replayed the
  pages the first scan found rather than scanning again.
- `.scan()` no longer registers a view a second time when you called `.page()`
  for it earlier in the same chain — that produced a `Page already processed`
  error on the build.
- `await kiss.close()` no longer returns while a rebuild is still writing. A
  rebuild requested just before you closed kept running afterwards, so a clean
  or deploy step that ran once `close()` resolved raced files still being
  written — and could see the build folder recreated after it deleted it.
- A page queued after the last `.generate()` call is now built instead of being
  silently dropped from a build that reports success. `.complete()` renders
  anything no `generate()` pass reached — the pages a callback's `.scan()`
  discovers, or a page whose model resolved after `generate()` had already
  started, which made the outcome depend on how fast that model loaded.
- `.complete()` now waits for pages queued by an `async` `generate` callback
  after an `await`, as the docs always claimed. Previously it resolved before
  those pages were written, so a deploy or CI step could run against a site that
  was still being built.
- A view passed as a template string no longer builds into a folder named after
  its own markup. `.page({ view: '<p>hi</p>', slug: 'ok' })` wrote
  `public/-p-hi-/ok.html` — the folder came from the last `/` in the template,
  so any closing tag produced one — and the sitemap carried the same wrong URL.
  Such a page now builds to `public/ok.html`.
- A page's `ext` can no longer write outside your build folder. It was the one
  page option that was never sanitised, so `ext: './../../../escaped/x.html'` —
  reachable from model data through the usual "controller derives the page's
  options" pattern — wrote above the build folder, where nothing cleans it up.
  It is now slugified like `path` and `slug` (`.xml` still means `.xml`), and a
  page that would still resolve outside the build folder fails the build.
- Pages whose titles are not written in the Latin alphabet no longer collide.
  Every Japanese, Korean or Cyrillic title slugified to `-`, so a `.pages()`
  fan-out over such a model built one file and quietly lost the rest. Accented
  Latin is now transliterated (`Über uns` → `uber-uns`) and a title with no
  Latin equivalent falls back to a short stable hash (`p-9736ca69`), so every
  page gets its own file. Slugs also no longer keep a trailing `-` when the
  title ends in punctuation: `Hello World!` is now `hello-world`, not
  `hello-world-`.
- A controller that changes `options.config` no longer changes the whole site.
  Every page shared the one live config object, so a controller setting
  `options.config.siteUrl` for its own page rewrote `kiss.config`, changed every
  other page — including ones already prepared — and changed every `<loc>` in
  `sitemap.xml`. Each page now renders with its own copy.
- A `model` URL that answers with an error status now fails that page instead of
  publishing the error. A `500` (or any non-2xx) whose body is the usual JSON
  error envelope became the page's model, so the page rendered empty or garbage
  content and the build reported success.
- The `{{sass "path"}}` helper now accepts an absolute path. It used to join
  every path onto the working directory, so a path a controller had resolved
  became `<cwd>/abs/path/main.scss` and failed the build with
  `no such file or directory`.
- `{{#isActive page href="/blog" folderMatch=true}}` now matches whole path
  segments instead of any substring of the URL. A `/blog` nav item lit up on
  `my-blog-post.html`, `/docs` on `news/docs-archive.html`, `/product` on
  `products/index.html` — and with `href` left off, every item in the nav was
  active on every page. An `href` of `""` under `folderMatch` now matches the
  home page only.
- The same `href` now works whether or not `extensionLess` is on. `href="/about"`
  matched your about page with the flag off and nothing with it on (only
  `href="/about/"` worked), so turning the flag on silently lost every nav
  highlight but the home page. `/about` and `/about/` are now the same page
  under either setting.
- `{{#isActive}}` no longer fails the build over a template mistake. A
  data-driven nav whose model has no `href` key, a page context without a
  `pageURL`, or a forgotten page argument each threw and dropped the page from
  the build; the block now renders as not-active and the reason is logged.
- `{{markdown}}` no longer fails the build when the model field it is given is
  `null`, an object or an array — one `null` field removed the whole page. It
  logs the unexpected value and renders nothing, as it already did for a missing
  field. `{{#env is=…}}` given something that is not a string does the same
  instead of throwing.
- Running a second site in dev mode no longer kills the process. Both sites'
  live reload servers wanted the same port (35729) and the resulting
  `EADDRINUSE` was an uncaught exception that took the whole dev process down —
  even though `port` exists precisely so two sites can run side by side. A clash
  is now logged, live reload is switched off for that site, and its dev server
  keeps serving. Give the second site its own `livereloadPort` to get live
  reload back on both.
- A config key you pass explicitly as `undefined` now takes its default instead
  of blanking it. `new Kiss({ port: process.env.PORT })` with `PORT` unset left
  the dev server on a random port logged as `http://localhost:undefined`, and
  `{ cleanBuild: opts.clean }` with the flag absent quietly stopped emptying
  your build folder. The same applies inside `folders` and `sass`. `null` is
  still a real value — it is how you switch a folder off.

**Removed**

- `folders.root` is gone. It was in the documented default config but no part of
  the engine ever read it, so setting it changed nothing and it was never even
  created on disk. Delete it from your config; leaving it in is harmless.
- `folders.static` is gone, for the same reason. It was in the documented
  default config and re-derived from `folders.src`, but no part of the engine
  ever read it and it was never created on disk — static files are copied from
  `folders.assets`. Delete it from your config; leaving it in is harmless.

**Changed**

- Your browser is now reloaded once per rebuild, once that rebuild has written
  every page — not once per file it wrote. On a big site the first of those
  per-file reloads reached the browser within a second of your edit, while the
  rebuild was still writing, so the page could reload onto output that had not
  been re-rendered yet and then sit on stale content until your next save. One
  save is now one reload, sent when the rebuild has finished. Editing a
  stylesheet still reloads just that stylesheet, leaving the page where it was,
  and the first build reloads a tab you left open across a restart.

- A dynamic partial whose key is missing now names the key. `{{> (lookup . 'moodleAccess')}}`
  with no `moodleAccess` in the data failed with only `The partial undefined
could not be found`, which told you neither the key nor the page; you now also
  get `lookup: 'moodleAccess' is undefined in handbooks/uob.hbs`, once per page.
  The build still fails exactly as it did.

- A dev server that cannot start now fails the build instead of leaving you with
  a site nobody is serving. If `port` is already taken, the run used to print
  `Serving … http://127.0.0.1:3001`, log the clash twice — one of those as
  `Error running live reload server`, the wrong server — then finish the build
  and sit there answering nothing. You now get one line naming the port and what
  it costs you:

  ```
  Dev server could not bind 127.0.0.1:3001 (EADDRINUSE): the site is not being served
  ```

  The watcher and live reload stop with it and `complete()` rejects with a
  `<dev server>` failure, so the process can exit. A clash on `livereloadPort` is
  unchanged: live reload is optional, so it is logged once and the site keeps
  being served.

- `utils.globFiles` now takes the directory and the pattern separately —
  `globFiles(dir, pattern)` instead of `globFiles(pattern)`. The directory is
  escaped, so a folder name containing a glob character is matched literally.
- A controller that throws, a controller file that is missing, a controller
  module that does not export a function, and a `controller` option of an
  unrecognised type now fail the build. Previously each was logged and ignored,
  and the page was built and shipped from un-controlled options — no derived
  slug, no reshaped model — with the build reporting success.
- An error thrown by a `generate()` or `sitemap()` callback now fails the build
  too, and is reported as `<generate callback>` / `<sitemap callback>` in
  `err.failures`. Previously it was logged as "Error generating site" (or, more
  misleadingly, "Error creating sitemap.xml" after the file had been written
  correctly) and `complete()` still resolved, so a build that lost pages exited 0.
  A callback that returns a promise is covered too: `complete()` waits for that
  promise, so an `async` callback's rejection is reported by the same build.
- `complete()` now reports a build's failures once. A second `complete()` call
  in the same build resolves instead of rejecting again — the documented
  "`complete()` from inside a `generate` callback" pattern makes two calls race
  one failure, and the second rejection had nothing attached to it, so it took
  the process down after the first had already been handled and reported.
- Two pages that resolve to the same output path now fail the build. One of
  them was dropped with a `Page already processed` log and the build reported
  success, so a page you asked for was simply missing from the site — most
  often in a `.pages()` fan-out whose controller derives the slug from model
  data. `complete()` now rejects and names the path.
- Editing a partial or a layout while watching now re-renders every page without
  re-reading your models, re-running your controllers or re-fetching a model
  from a URL — the slow half of a rebuild, and none of it can be affected by a
  partial. Every other non-page change is still a whole-site rebuild.
- The shipped helper docs are now complete: `llms.txt` gains a `## Helpers`
  section and README's `### Helpers` gains entries for `sass`, `offset`,
  `isActive` and `env` (previously only `markdown` and `stringify` were
  documented). Both also now state that the `generate`/`complete` `data` array
  includes the automatic asset-copy result as its first entry, that a
  controller must be pure because watch-mode replays a shallow snapshot of the
  page's options, and precisely which `folders.*` keys `folders.src`
  re-derives (`build` is not one of them).

**Added**

- Pass `config` in a page's options to override config settings for that page
  alone, e.g. `.page({ view: 'de.hbs', config: { siteUrl: 'https://de.example' } })`.
  Previously the option was silently discarded.
- `.registerPartials()`, `.viewStats()` and `.getModelByID(id, data)` are now
  documented in the README and `llms.txt`. They were always public — two of them
  are used in the shipped examples — but neither doc mentioned them.
- `livereloadPort` (default `35729`) — the port the live reload server listens
  on, and the one injected into the dev-mode reload `<script>`. Set it per site
  so two sites can watch at once without fighting over the port, or pointing
  each other's browsers at the wrong reload server.
- `devHost` (default `'127.0.0.1'`) — the interface the dev and live reload
  servers bind to. **Behaviour change:** dev mode used to bind every interface,
  so the unbuilt site was reachable from anyone on your network even though the
  log line said `localhost`; it is now loopback only. If you preview on your
  phone or another machine, set `devHost: '0.0.0.0'`.

## 2.0.0-alpha.1 — 2026-09-05

**Fixed**

- `.pages()` gave every page in a fan-out the first item's value for any page
  option derived from the model — `{{title}}` was the one you would notice,
  while `{{model.title}}` looked correct. Each fanned-out page now gets its own
  options.
- In watch mode, saving a file under your assets folder rebuilt the whole site
  as well as recopying the assets. It now only recopies the assets.

**Changed**

- Pages, partials and sitemap entries are discovered in a stable sorted order,
  so two builds of the same site produce the same output regardless of the
  machine.
- Dependencies brought up to date (glob, chokidar, fs-extra, serve-static and
  friends). No change to how you configure or call kiss-ssg, and the Node floor
  is still 22.12.

**Added**

- `utils.posixPath(path)` and `utils.globFiles(pattern)` on the `utils` export.
