# Contract: consent management built into kiss (2.11.0)

This is the contract every workstream on `feat/consent-manager` builds against. It is amended **in place**, with a dated section at the end, and never forked. The intent and the success criteria live in `planning/sessions/2026-11-02-consent-manager.md`. The research is in `planning/reviews/2026-11-02-consent-research.md`, and the Cookiebot baseline is in `planning/reviews/2026-11-02-cookiebot-baseline.md`. The browser spike behind every behavioural decision is Appendix A, measured on 2026-11-03.

**Operator decisions** (2026-11-02/03, in conversation):

- built into the engine, not a plugin system;
- services declared once in config;
- explicit gating, no auto-blocking;
- a first-party cookie;
- an optional log endpoint in v1;
- basic Consent Mode by default;
- theme from config plus an override partial;
- the bottom bar is the default position, top is an option;
- a service's name picks its preset;
- unknown keys inside `consent` fail the build;
- the statistics opt-out category is opt-in per site;
- Chromium is installed in CI;
- proof by example 14, a diploma-msc trial and a clean room.

## 1. What a site writes

### The minimum

```js
new Kiss({
  siteUrl: 'https://example.com',
  consent: {
    services: {
      gtm: { id: 'GTM-XXXX' },
      youtube: {},
    },
  },
})
```

```hbs
<head>{{consentHead}} …</head>
<body>{{consentBanner}}
  …
  {{consentScript 'gtm'}}
  …
  {{consentEmbed 'youtube' id='VIDEO_ID' title='…'}}
  …
  <footer>{{consentSettings}}</footer></body>
```

The cookie page uses `{{consentTable}}`.

### Full shape and defaults

Defaults live in `lib/consent.js` as frozen objects, the same as `DEFAULT_*` in `lib/config.js`.

```js
consent: {
  version: undefined,   // default: purposesVersion(resolved), 12 hex (inputs: see "Version" below). Set it to force asking again.
  categories: {         // 'necessary' is implicit: always on, locked, never stored
    preferences: { label: 'Preferences', description: '…', mode: 'consent' },
    statistics:  { label: 'Statistics',  description: '…', mode: 'consent' }, // 'objection' = UK Sch. A1 para 5
    marketing:   { label: 'Marketing',   description: '…', mode: 'consent' },
  },
  services: {
    <name>: {
      preset,       // default: the name, when a preset of that name exists; false = none
      category,     // 'necessary' | 'preferences' | 'statistics' | 'marketing'; required without a preset
      label, provider, description, policy /* url */,
      src,          // may contain {param} placeholders, filled from {{consentScript}}'s hash, then this object
      partial,      // the name of a site partial whose <script>s are gated as this service
      embed,        // { src, title, watch } for {{consentEmbed}}; src and watch may contain {param}; watch is optional
      origins,      // extra third-party origins it loads (audit, table)
      cookies,      // [{ name /* trailing * = prefix */, duration, description, domain }]
      storage,      // localStorage keys it writes (cleared on withdrawal)
      google,       // true = a Google tag: Consent Mode applies
      <param>,      // any other key is a placeholder value, e.g. id
    },
  },
  cookie:   { name: 'kiss_consent', days: 182, domain: null },
  google:   { mode: 'basic', waitForUpdate: 500, adsDataRedaction: true, urlPassthrough: false,
              map: { statistics: ['analytics_storage'],
                     marketing:  ['ad_storage', 'ad_user_data', 'ad_personalization'],
                     preferences: ['functionality_storage', 'personalization_storage'] } },
              // security_storage is always granted
  endpoint: null,       // 'https://…' or '/path'; never through toAbsoluteUrl (it is not a page)
  ui: {
    policy: 'cookies',  // a page id; the banner links it through servedPathFor with links.trailingSlash;
                        // a page id no page claims fails the render, as {{link}} does
    position: 'bottom', // 'bottom' (fixed bar) | 'top' (inline, first in <body>)
    logo: null,         // a site asset path, resolved through the asset manifest like {{asset}}
    partial: 'consent-banner', // a site partial of this name replaces the default banner markup
    text: { title, body, accept: 'Accept all', reject: 'Reject all', choose: 'Choose cookies',
            save: 'Save choices', close: 'Close', settings: 'Cookie settings',
            confirmation: 'Your cookie choice is saved.', hide: 'Hide', embedNotice, embedLoad, embedAllow, embedWatch },
    theme: { background, text, accent, accentText, border, radius, font }, // → --kiss-consent-* properties
  },
}
```

### Presets

Presets are frozen in `lib/consent.js` and picked by the service's name. A site's own keys win over the preset.

| Name          | Category                | Fills                                                                                                                                                                                                                      |
| ------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gtm`         | `marketing` (see below) | `src: https://www.googletagmanager.com/gtm.js?id={id}`, a gated inline `gtm.start` push before it, `google: true`, origins, the `_ga`/`_ga_*`/`_gcl_au` cookies. `id` is required.                                         |
| `gtag`        | `statistics`            | `src: https://www.googletagmanager.com/gtag/js?id={id}` and the inline `gtag('js')`/`config` call. `google: true`. `id` is required.                                                                                       |
| `youtube`     | `marketing`             | `embed.src: https://www.youtube-nocookie.com/embed/{id}`, `watch: https://www.youtube.com/watch?v={id}`, origins, the `localStorage` keys measured on 2026-11-02 (`yt-icons-last-purged`, `ytidb::LAST_RESULT_ENTRY_KEY`). |
| `vimeo`       | `marketing`             | `embed.src: https://player.vimeo.com/video/{id}?dnt=1`, `watch: https://vimeo.com/{id}`, origins, the `vuid` and `player` cookies (baseline).                                                                              |
| `google-maps` | `marketing`             | `embed.src` taken from `{{consentEmbed src=}}`, origins. No `watch` link: the fallback link is omitted when a service has none.                                                                                            |

**Precedence.** A `src=` passed to `{{consentEmbed}}` (or `{{consentScript}}`) wins over the preset's `embed.src` (or `src`). Placeholders are filled from the helper's hash first, then the service config.

**Cookies a preset declares** carry a `party: 'first' | 'third'` derived from their domain. Third-party cookies appear in `{{consentTable}}` but are never in the withdrawal deletion list, because a page cannot delete them. Withdrawal clears first-party cookies and storage only, and the guide says so.

**Why `gtm` defaults to `marketing`** (measured, Appendix A, S1b): Consent Mode governs Google's own tags only. In diploma-msc's real container, a statistics-only grant loaded Bing UET, ActiveCampaign and OpenAI scripts. Under `marketing`, GTM loads only when marketing is granted. A site whose container gives every non-Google tag a consent check may set `category: 'statistics'`. `GUIDE.md` says so and names the measurement.

### Categories in use, and the version

**Categories in use** are decided once, per site, in `resolveConsent`: the categories that at least one declared service belongs to (`necessary` aside). Every page's banner, dialog and cookie hold the same set, whichever services a page actually loads. A site with no non-necessary service has no categories in use, and `{{consentBanner}}` then renders nothing (a finding is not needed: nothing can be refused).

**`purposesVersion(resolved)`** is `sha256` of a canonical JSON (keys sorted, arrays in declared order) of exactly:

- each category in use: its name and its `mode`;
- each non-necessary service: its name, its category, its `provider`, and the sorted union of its `origins` and the origins of its `src` and `embed.src`.

It **excludes** text, theme, logo, position, cookie settings, endpoint, `cookies`/`storage` lists and preset descriptions. So a colour or wording change, or a kiss upgrade that adds a cookie name to a preset, asks nobody again (ICO: "should not repeatedly ask"), while a new service, a new third party, or a category changing mode asks everyone (ICO: ask again when the purposes change). A test pins both directions.

### Validation

`resolveConsent` throws `config.consent… must be …` errors, the same as `lib/config.js`.

- **Unknown keys** at every level of `consent` throw, and the error names the valid keys. This applies except under `services.<name>`, where an unknown key is a placeholder value.
- **Absent or `false`** resolves to `null`. Every helper then throws `config.consent is not set ({{name}} in <view>)`, and in dev logs a warning and returns `''`.
- **Errors named in the contract:**
  - a service name not matching `^[a-z][a-z0-9-]*$`;
  - a category not among the four;
  - a missing `category` with no preset;
  - a preset's required param missing;
  - `ui.position` not `bottom` or `top`;
  - `cookie.days` not an integer from 1 to 395;
  - `google.mode` not `basic` or `advanced`;
  - `endpoint` neither `https://` nor `/…`;
  - `text`, `theme` or `categories` keys outside their sets;
  - an `objection` mode on `preferences` or `marketing` (only `statistics` may object);
  - a `google: true` service in an `objection` category (GA4 and Google Ads are never within the statistics exception, research §1; and an objection category grants `analytics_storage` in the Consent Mode default, which every Google tag on the page would read);
  - a `ui.policy` that is not a string.
- **Per-page `config` overrides do not apply to `consent`.** There is one banner per site.

## 2. Modules

Each module has a `test/unit/` sibling, an `AIKB/` doc using the template headings, and a `CLAUDE.md` row.

| Module                  | Responsibility                                                     | Public functions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/consent.js`        | The config and every decision made from it; no markup, no browser  | `resolveConsent(input) → KissConsent\|null`, `PRESETS`, `TRACKER_ORIGINS`, `ADS_CMP_SIGNATURES`, `serviceParams(service, hash) → object`, `fill(template, params, where) → string` (throws on a missing param), `consentModeDefault(resolved) → object`, `consentModeState(categories, map) → object`, `purposesVersion(resolved) → string`, `categoriesInUse(resolved) → string[]`, `textOf(html) → string`, `bannerHash(html) → string`, `clientConfig(resolved, {logoUrl, policyUrl, bannerHash}) → object`, `consentReport({consent, pages, real}) → BuildConsent\|null` |
| `lib/consent-gate.js`   | Server-side gating markup, and the wiring check on a rendered page | `gatedScript(name, service, {params, body, partialHtml, mode}) → string`, `embedMarkup(name, service, {src, title, params, text}) → string`, `findDocumentWrite(js) → boolean`, `consentWiringProblems(html) → string[]`                                                                                                                                                                                                                                                                                                                                                     |
| `lib/consent-ui.js`     | The default presentation                                           | `bannerHtml(resolved, {logoUrl, policyUrl})`, `settingsHtml(resolved, {policyUrl})`, `tableHtml(resolved)`, `settingsControlHtml(resolved)`, `themeCss(ui) → string`                                                                                                                                                                                                                                                                                                                                                                                                         |
| `lib/consent-client.js` | The browser side, inlined by its source                            | `kissConsentClient(win, cfg)`, a real function using nothing from module scope, following `lib/scorm-bridge.js:16`; `consentHeadScript(cfg) → string`, which serialises `cfg` with `JSON.stringify` and then escapes `<` as `<` and U+2028/U+2029, so no site text can close the script                                                                                                                                                                                                                                                                                      |

**`TRACKER_ORIGINS`** (2a, frozen, tested): `www.googletagmanager.com`, `www.google-analytics.com`, `region1.google-analytics.com`, `*.doubleclick.net`, `connect.facebook.net`, `www.clarity.ms`, `bat.bing.com`, `static.hotjar.com`, `snap.licdn.com`, `www.redditstatic.com`, `www.youtube.com`, `www.youtube-nocookie.com`, `player.vimeo.com`, `www.google.com/maps` (by path), `maps.google.com`, `widget.superchat.de`. Matching is on host (with `*.` meaning any subdomain), and path only for `www.google.com/maps`. **`ADS_CMP_SIGNATURES`**: the hosts `pagead2.googlesyndication.com` (path `/pagead/js`) and `securepubads.g.doubleclick.net`, the inline strings `adsbygoogle` and `googletag.cmd`, and `<ins … data-ad-client>`.

**Typedefs.** `KissConsent` and `KissConsentInput` are typedefs in `lib/consent.js`, as `KissPackages` is in `lib/packages.js`. In `lib/config.js`:

- `KissSettings` (`:136-153`) gains `@property {import('./consent.js').KissConsent|null} consent`;
- `KissConfigInput` (`:173-185`) gains `consent?: false|KissConsentInput`;
- `resolveConfig` gains `consent: resolveConsent(supplied.consent)` beside `:844-846`.

**Helpers** are registered in `lib/handlebars-helpers.js` beside `scormBridge` (`:525-535`), so they land in `_builtinHelperNames` (`kiss.js:703`). `registerHandlebarsHelpers` already takes `assets`, which resolves `ui.logo`.

## 3. Helpers: exact output

The attribute vocabulary is fixed. The client, the audit, the wiring check and any override partial all read the same names:

- `data-kiss-consent-head`, `data-kiss-consent-style`
- `data-kiss-consent-banner`, `data-kiss-consent-settings`, `data-kiss-consent-hash`
- `data-kiss-service`, `data-kiss-consent`, `data-src`, `data-type`
- `data-kiss-embed`, `data-kiss-embed-frame`, `data-kiss-consent-ui`
- `data-kiss-consent-action`, `data-kiss-consent-category`, `data-kiss-consent-confirmation`
- `data-kiss-done`

### `{{consentHead}}`: early in `<head>`, after `<meta charset>` and the viewport, before any other script

The 5–7 kB inline script must not push `<meta charset>` past the browser's 1,024-byte prescan, so it goes after the meta tags, not first. The wiring check enforces "before any other `<script>`".

```html
<script data-kiss-consent-head>
  (function kissConsentClient(win,cfg){…})(window,{…clientConfig…})
</script>
<style data-kiss-consent-style>
  …themeCss…
</style>
```

**The script, in order:**

1. A `dataLayer`/`gtag` stub.
2. `gtag('consent','default', consentModeDefault)`. Every mapped type is denied, except the types of `objection` categories, which are granted. `security_storage` is granted. `wait_for_update` is included only under `google.mode: 'advanced'` (S1: in basic mode GTM loads after the choice, so it is never read).
3. The `set` calls.
4. A synchronous read of the cookie. If it holds a valid choice, `gtag('consent','update', state)`.
5. `window.kissConsent` is defined.
6. Activation is scheduled: at `DOMContentLoaded` for allowed services and objection categories (§5).

**The style** is omitted when `ui.theme` is `false`.

### `{{consentBanner}}`: first in `<body>`

```html
<template data-kiss-consent-banner data-kiss-consent-hash="<12 hex>"
  >…banner…</template
>
<template data-kiss-consent-settings
  >…
  <dialog>…</dialog>
  …</template
>
<script>
  window.kissConsent && kissConsent.mount()
</script>
```

- **The banner markup** is the site's `ui.partial` when `hbs.partials` has it, rendered with `{text, categories, services, logoUrl, policyUrl, position}`. Otherwise it is `bannerHtml`.
- **The hash** is `bannerHash(banner + settings)`: `sha256(textOf(…))` truncated to 12 hex, computed from the rendered helper output before minifying, so dev and production builds agree. Because categories in use are site-wide, every page of a site has the same hash unless an override partial renders page-dependent text; the report's `banners` list exists to show that case.
- **The policy link.** Banner and dialog both link `ui.policy`, resolved with the same `servedPathFor` and `links.trailingSlash` as `{{link}}` (CLAUDE.md: URL policy is threaded). An unclaimed id fails the render.
- **Learning packages.** A page that names a `package` and calls any consent helper fails the render: `location.reload()` would break an LMS session, and a `Path=/` cookie would be shared by every course on the LMS domain. The guide says why.
- **`mount()` runs inline**, straight after the templates. When there is no valid choice it inserts the banner as the first child of `<body>`. S5 measured the insert at 14 ms and first paint at 28 ms, so the banner never flashes for a returning visitor.

**What the default banner has:**

- `role="region"` with `aria-label="{text.title}"`;
- an `h2`;
- the body text;
- three buttons of equal weight: Accept all, Reject all, Choose cookies;
- a ✕ Close button;
- an optional logo `<img alt="">`.

**Positions:**

- **`bottom`:** `position:fixed;bottom:0`. While the banner is shown, the client sets `scroll-padding-bottom` on `<html>` to the banner's height (updated through a `ResizeObserver`), so a focused element is never hidden under it (WCAG 2.2 SC 2.4.11).
- **`top`:** static, as the first child of `<body>`, before the skip link.

**After a choice**, the **client** (never the template or an override partial) replaces the banner with `<div data-kiss-consent-confirmation role="status" tabindex="-1">{text.confirmation} <button type="button" data-kiss-consent-action="hide">{text.hide}</button></div>`, styled by the theme CSS, and focuses it. It removes itself on Hide, or on the next page. An override partial therefore needs no confirmation markup.

**The settings `<dialog>`** opens with `showModal()`. It holds:

- "Reject all" and "Accept all" buttons, so withdrawing everything is one action, as easy as giving it;
- one checkbox per category in use, with `necessary` disabled and checked; each is unchecked unless the category is granted, or is `objection` with no stored choice;
- one checkbox per service with an "always allow" grant in `s`, under its category, so an embed grant can be withdrawn as easily as it was given;
- Save and Close buttons, and the policy link.

**An override partial** must keep the action and category attributes. `consentWiringProblems` cannot check a partial's semantics; the browser suite proves an override that keeps them works.

### `{{consentScript "name" k=v}}`

- **Src form.** `<script type="text/plain" data-kiss-service="gtm" data-kiss-consent="marketing" data-src="https://…?id=GTM-X"></script>`. Placeholders are filled from the hash, then the service config. A missing one throws `script "gtm": no value for {id}`.
- **Presets with an inline part** (gtm, gtag) emit that part as a gated inline tag first.
- **Block form.** `{{#consentScript "name"}}<script>…</script>{{/consentScript}}`: each `<script>` in the block is rewritten. A body with no `<script>` tag is taken as a script body. `type="module"` becomes `data-type="module"`, `async` becomes `data-async`, `src` becomes `data-src`, and other attributes are kept (`defer` is dropped: the queue already runs in document order).
- **Partial form.** The service's `partial` is rendered with the page context, then rewritten the same way.
- **The rewrite** uses `htmlparser2` (already a dependency), never a regex.
- **Errors** (render errors):
  - `document.write` or `writeln` in an inline body throws `script "x": document.write in a script that runs after consent wipes the page`. S3 measured it: the document is replaced, and in a serial queue `load` never fires.
  - An `<iframe>` in a block or partial throws `use {{consentEmbed}} for an iframe`.
  - An unknown name throws `script: no service "x" in config.consent.services`.
- **Not gated:** a `necessary` service; a `google: true` service under `google.mode: 'advanced'`. Both are emitted as plain scripts.

### `{{consentEmbed "name" src=… title=… k=v}}`

`title` is required (accessible name). The output:

```html
<div class="kiss-embed" data-kiss-embed="youtube" data-kiss-consent="marketing">
  <div class="kiss-embed__notice" data-kiss-consent-ui>
    <p>{embedNotice, with provider}</p>
    <button type="button" data-kiss-consent-action="load">{embedLoad}</button>
    <button type="button" data-kiss-consent-action="allow">
      {embedAllow, with provider}
    </button>
  </div>
  <a class="kiss-embed__watch" href="{watch}">{embedWatch, with provider}</a>
  <template data-kiss-embed-frame
    ><iframe
      src="…"
      title="…"
      loading="lazy"
      allow="…"
      referrerpolicy="strict-origin-when-cross-origin"
    ></iframe
  ></template>
</div>
```

- The frame lives in a `<template>`: S4 measured no request before it is cloned.
- `lib/markdown-copy.js:51` already drops `template`. `[data-kiss-consent-ui]` is added to its `DROPPED` list, so the `.md` copy keeps only the watch link.
- When the service's category is already granted, or `s[name]` is set, the client clones the frame immediately and hides the notice.

### `{{consentSettings}}` and `{{consentTable}}`

- **`{{consentSettings}}`:** `<button type="button" class="kiss-consent-settings" data-kiss-consent-action="settings">{text.settings}</button>`. It goes in the footer of every page.
- **`{{consentTable}}`:** one table per category in use. Columns: service, provider, purpose, cookie or storage key, duration, first or third party. kiss's own cookie is the first row of `necessary`.

### The wiring check: `consentWiringProblems(html)`

It runs on the rendered page in `lib/kiss-page.js`, after `template(...)` (`:303`) and before minifying (`:322`). It decides from the bytes, so it also catches hand-written gated tags. It reports:

1. a `data-kiss-service`, `data-kiss-embed` or `data-kiss-consent-action="settings"` with no `data-kiss-consent-head`;
2. a head with no `data-kiss-consent-banner`, or more than one head or banner;
3. any executable `<script>` (no `type`, a JavaScript type, `module`, or a gated `text/plain` one) before the head's script; `application/ld+json` and other data blocks are exempt.

It runs on HTML pages only; a `.txt`, `.xml` or other output is skipped. In a production build each problem fails the page, with the message naming the services. In dev each one warns.

## 4. The cookie

`kiss_consent=<encodeURIComponent(JSON)>; Path=/; Max-Age=<days×86400>; SameSite=Lax` plus `; Secure` on https and `; Domain=<cookie.domain>` when that is set.

```json
{
  "f": 1,
  "id": "<uuid>",
  "t": 1793664000000,
  "u": 1793664000000,
  "v": "<version>",
  "c": { "statistics": 1, "marketing": 0 },
  "s": { "youtube": 1 }
}
```

- `f` is the format version.
- `t` is the first choice and `u` this choice.
- `c` holds one entry per category in use (`necessary` is never stored).
- `s` holds per-service grants from an embed's "always allow". **Denying a category clears `s` for every service in it**, so a grant can never outlive its category.
- `id` is present **only when `endpoint` is set**: with no log, nothing needs to identify the choice, and no identifier is written or sent in every request's `Cookie` header.

A second cookie, `kiss_consent_closed=1; Path=/; SameSite=Lax` with **no** `Max-Age` (a session cookie), records that the visitor closed the banner without choosing, so it is not shown again in the same browsing session (CNIL: do not ask again during the same visit). It holds no choice, is strictly necessary to honour the close, and is listed in `{{consentTable}}`.

**The choice is invalid** (treated as no choice, with the stored `id` reused) when:

- the cookie does not parse;
- `f` is not 1;
- `v` differs from the current version;
- `now - u > days`.

`id` comes from `crypto.randomUUID()`, falling back to `getRandomValues` hex on an insecure origin.

**Two kiss sites on one registrable domain** that set the same `cookie.domain` would invalidate each other's choice whenever their versions differ. The guide says to give each a distinct `cookie.name` in that case.

The cookie is strictly necessary (ICO, see research §1), is used for nothing else, and is listed first in `{{consentTable}}`.

## 5. The client: `window.kissConsent`

**API:**

- `has(name)`: a category is granted; or, for a service, its category is granted or `s[name]` is set. `necessary` is always true.
- `choice`: `null`, or a frozen `{id, version, at, categories, services}`.
- `show()`: opens the settings dialog.
- `when(name, fn)`: runs `fn` once, now or on the first change that grants `name`. This is for site code that injects a third party itself: diploma-msc's jQuery Vimeo, and Superchat. A later revocation cannot leave it running: every revocation reloads the page (below).
- `on('ready'|'change', fn)`: `ready` replays to late listeners.
- `mount()`: internal.

**DOM events** on `document`:

- `kiss-consent:ready`, with detail `{choice}`, fired once per page at `DOMContentLoaded`, **after** the activation queue has started (not drained: a listener must not assume a revived script has run; `when()` is for that);
- `kiss-consent:change`, with detail `{choice, granted, revoked}`.

Each change also pushes `{event: 'kiss_consent', kiss_consent: {<category>: bool}}` to `dataLayer`, so GTM triggers can react.

| Situation                                     | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every load, in the head, before anything else | Delete the declared first-party cookies and storage keys of every service whose category is **not** granted by the stored choice (or, with none, not `objection`). This catches cookies rewritten by a script on `pagehide` before a withdrawal reload, and a withdrawal made in another tab.                                                                                                                                                                                           |
| Load, no valid choice                         | Consent Mode default. At `DOMContentLoaded`, activate `objection` categories' services. `mount()` shows the banner unless `kiss_consent_closed` is set.                                                                                                                                                                                                                                                                                                                                 |
| Load, valid choice                            | `update` runs in the head, synchronously. At `DOMContentLoaded`, activate allowed services in document order. No banner.                                                                                                                                                                                                                                                                                                                                                                |
| Accept all                                    | Write the cookie (every category in use granted), `gtag('consent','update', state)`, then activate (update first; S1 shows either order gives `G111`, and update-first is correct by construction). POST. Show the confirmation. Fire `change`.                                                                                                                                                                                                                                         |
| Reject all                                    | **Denies every category, `objection` ones included.** Write the cookie, `update` denied, POST, fire `change`. If any category was active in this page view (an objection category activated at load), take the withdrawal path; otherwise show the confirmation.                                                                                                                                                                                                                        |
| Save (dialog)                                 | Write the toggled set. If it denies any category that was active in this page view, take the withdrawal path; otherwise update, activate the newly granted, POST, confirm, fire `change`.                                                                                                                                                                                                                                                                                               |
| Close                                         | Set `kiss_consent_closed`, hide the banner. No choice is written, and it does not count as consent.                                                                                                                                                                                                                                                                                                                                                                                     |
| Withdrawal path                               | Write the cookie, `update` denied, POST. Delete the declared **first-party** cookies of the revoked services: name, or a prefix for `*`, matched against `document.cookie`, with `Path=/` on no domain, the host and each parent domain (S7 measured all four shapes cleared). Remove the declared `storage` keys. Then `location.reload()`. The beacon survives the reload (S6). Third-party cookies and storage inside an embed's frame are out of reach and stay; the guide says so. |
| Embed "load"                                  | Clone the frame, once.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Embed "always allow"                          | Also set `s[name]=1`, write the cookie and POST.                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Activation.**

- **One serial queue in document order.** An external script is inserted with `async=false` and the next element waits for its `load` or `error`, or **10 seconds**, whichever comes first, so a hung third party cannot hold the rest. An inline script runs on insertion. A `data-async` external does not hold the queue. S2 measured that inserting everything at once runs inline and module scripts before earlier externals, while the queue keeps document order exactly.
- **At most once per element:** the `type="text/plain"` original is **replaced** by its clone, so no later pass (Accept after an objection pass, a second Save) can find and revive it again.
- **The DOMContentLoaded trap.** A revived script never sees `DOMContentLoaded`, because it has already fired: S2's deferred script logged `D-saw-DCL` only when ungated. A script revived after a click also misses `load`. `GUIDE.md` states this trap, and `kissConsent.when` is the documented way for site code to wait.

**Endpoint.**

- `navigator.sendBeacon(endpoint, new Blob([json], {type: 'text/plain'}))`, falling back to `fetch(endpoint, {method: 'POST', body, keepalive: true, mode: 'no-cors'})`.
- The body: `{id, version, timestamp: <ISO>, categories, services, bannerHash, page: location.pathname}`.
- **`text/plain` is deliberate.** It avoids a CORS preflight, and the endpoint must parse a `text/plain` body; the guide says so.
- When `endpoint` is `null`, no code path sends anything.

## 6. Audit and report

### Facts (`lib/audit.js`)

- **`extractOrigins`** (`:353-392`): a `script` tag carrying `data-kiss-service` has its origin read from `data-src`, and records `service: <name>`. `PageOrigin` gains `service?: string`. The de-duplication key (`:358`, today `` `${origin} ${kind}` ``) gains the service, so `gtm` and `gtag` on one origin stay two entries.
- **Embed frames:** before `stripForIds` (`:248`) empties templates, a pass reads `<template data-kiss-embed-frame>` iframes as `{origin, kind: 'iframe', service}`.
- **`thirdPartyOrigins`** (`:1113-1152`) and its serialisation (`lib/build-report.js:463-476`) carry a sorted `services` array beside `kinds`. That is additive.
- **`PageFacts.consent`:** `{head: bool, banner: string|null /*hash*/, settings: bool, signatures: string[]}`. `signatures` is the `ADS_CMP_SIGNATURES` and Google-loader strings found in **ungated executable** inline scripts (`adsbygoogle`, `googletag.cmd`, `gtm.js`, `gtag/js`), plus `<ins … data-ad-client>`. The `data-kiss-consent-head` script is **excluded** from the scan: its inlined config may name `gtm.js`.
- **`thirdParty`'s doc** (`AIKB/audit.md`, `GUIDE.md`) says that an origin carrying `services` is fetched only after consent.

### New `CHECKS` ids

Appended after `checkbox-prechecked` (`lib/audit.js:42`), in this order. All are advisory, like every check.

| id                              | Fires when                                                                                                                                                                                                       | page / detail               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `consent-missing`               | `config.consent` is null, and a page loads a script or iframe from `TRACKER_ORIGINS`, or carries a Google loader signature                                                                                       | page / origin               |
| `consent-ungated`               | `config.consent` is set, and a page loads a third-party script or iframe that no service gates and that no `necessary` service lists in `origins` (this includes a `<noscript>` GTM iframe)                      | page / origin               |
| `consent-ads-cmp`               | Any page, consent or not: `pagead2.googlesyndication.com/pagead/js`, `securepubads.g.doubleclick.net`, an `adsbygoogle`/`googletag.cmd` signature, or `<ins data-ad-client>`. These need a Google-certified CMP. | page / origin               |
| `consent-objection-third-party` | A service in an `objection` category loads from a third-party origin                                                                                                                                             | null / `<service> <origin>` |
| `consent-settings-missing`      | A page has the consent head and no `data-kiss-consent-action="settings"`                                                                                                                                         | page / null                 |
| `consent-google-advanced`       | `google.mode` is `'advanced'`                                                                                                                                                                                    | null / null                 |
| `consent-records-missing`       | `endpoint` is null and a `google: true` service is in `marketing`                                                                                                                                                | null / service              |

**Wiring:**

- `auditBuild` (`:742`) gains `consent = null`.
- `runAudit` (`lib/build-finish.js:327-373`) passes `kiss.config.consent`.
- `resolveAudit` needs no change (`config.js:620`).
- `test/unit/skill-coverage.test.js:351-358` then requires every new id to be named in the docs.

### Report key `consent`

Appended after `thirdParty`.

```js
{ version, purposes, mode: 'basic' | 'advanced',
  banners: [{ hash, pages }],
  categories: [{ name, mode }],
  services: [{ name, category, gated: 'script' | 'embed' | 'none', origins, cookies }],
  pagesWithoutHead: [] }
```

- It is `null` without `config.consent`, and on a failed build.
- Every page path in it (`banners[].pages`, `pagesWithoutHead`) goes through the same `real()` mapping `thirdParty` uses (`build-report.js:466`), so a staged `check` and a real build record the same paths.
- **Wiring:** `reportInputs` (`build-finish.js:108-155`), the `buildReport` parameters and output (`build-report.js:263-289`, `~476`), the `BuildReport` typedef (`:143-163`), and a `formatReport` line `consent: version <v>, banner <hash>, <n> services`.
- **No timestamp.** `lastBuildRecord` (`lib/aikb.js:969-983`) stays byte-identical. The time a banner version was first shown is the commit time of the `kiss-ssg aikb` record that first holds its hash. That is the CNIL "timestamped hash" route (research §2), and it holds **only if the record is made before the banner is deployed**. Two things make that visible: `kiss-ssg check` already diffs its report against `last-build.json`, so a changed `consent.banners` hash shows in the diff before deploy; and the guide and `kiss-legal-and-privacy` say to run `kiss-ssg aikb` and commit before deploying a banner change.

## 7. Environment matrix

Every row needs its test before the slice that owns it closes. Test files:

- **C** `test/unit/consent.test.js`
- **G** `test/unit/consent-gate.test.js`
- **UI** `test/unit/consent-ui.test.js`
- **CL** `test/unit/consent-client.test.js`: a domino DOM (`@mixmark-io/domino`, already a dependency), a cookie jar, a fake clock, fake `sendBeacon` and `gtag`. Every case runs both rendered and terser-minified, as in `test/unit/scorm-bridge.test.js:238-250`.
- **A** `test/unit/audit.test.js`
- **I** `test/integration/consent.test.js`, building `test/fixtures/consent-site/`
- **B** `test/browser/consent.test.js`, real Chromium

| Situation                                                                                                              | Tests                                                     |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| src script gated; revived with `async=false` in document order                                                         | G, CL, B                                                  |
| inline / module / `async` / `defer` mixes keep document order                                                          | CL (insertion order), B (S2 order)                        |
| `document.write` in an inline body: render error                                                                       | G, I                                                      |
| an iframe inside `{{consentScript}}`: render error                                                                     | G                                                         |
| unknown service name or missing placeholder: render error; dev warns                                                   | I                                                         |
| GTM container tags: only Consent Mode governs them; `gtm` defaults to marketing                                        | C (preset), B (stub `gtm.js` snapshots `dataLayer` order) |
| Consent Mode default before any Google tag; update in the head on a stored choice; update before activation            | CL, B                                                     |
| advanced mode: Google services ungated, `wait_for_update` present, audit finding                                       | G, C, A                                                   |
| embed: no request before the click; load once; always allow persists                                                   | G, CL, B                                                  |
| no JavaScript: no banner, nothing gated runs, `<noscript>` GTM reported                                                | I (`consent-ungated`), B (JS disabled)                    |
| returning visitor: no banner insert, no flash                                                                          | CL, B                                                     |
| version bump, and a choice older than `days`: banner again, id reused                                                  | CL (fake clock), C (`purposesVersion` changes), B         |
| withdrawal: wildcard names, parent domain, storage keys, reload, then the Reject state                                 | CL, B (`--host-resolver-rules`)                           |
| objection category: granted by default and in Consent Mode; switching it off withdraws                                 | C, CL, B                                                  |
| endpoint: payload POSTed as `text/plain`; none sent when unset                                                         | CL, B                                                     |
| override partial keeps gating, storage, events and focus                                                               | I, B                                                      |
| bottom position: fixed, scroll padding, no focused control obscured                                                    | UI, B                                                     |
| top position: inline before the skip link, no layout shift                                                             | UI, B                                                     |
| close button: no cookie written, banner on the next page                                                               | CL, B                                                     |
| choice on page 1 honoured on page 2                                                                                    | B                                                         |
| html-minifier keeps `type="text/plain"` bodies and the attributes                                                      | G (through `loadMinifier()`), I (production build)        |
| Markdown copies: no banner, embed reduced to its watch link                                                            | I                                                         |
| `sitemap.xml` and `llms.txt` byte-identical with and without `consent`                                                 | I                                                         |
| `links.trailingSlash` policies give identical consent markup                                                           | I                                                         |
| a gated page with no `{{consentHead}}` fails; dev warns                                                                | I                                                         |
| AdSense / Ad Manager signature                                                                                         | A (seen red first)                                        |
| report `consent` deterministic; `last-build.json` byte-identical across two builds                                     | I                                                         |
| unknown keys inside `consent` throw and name the valid keys                                                            | C                                                         |
| `purposesVersion` unchanged by text, theme, logo, cookie names; changed by a new service, origin or category mode      | C                                                         |
| categories in use are site-wide: a service used on one page only still appears on every page's banner and cookie       | C, I                                                      |
| two `{{consentEmbed}}` of one service on a page; "always allow" on one reveals both                                    | CL, B                                                     |
| the src form of one service twice on a page: wiring problem (it would load twice)                                      | G, I                                                      |
| Reject all denies an `objection` category that was active, and takes the withdrawal path                               | CL, B                                                     |
| an "always allow" grant: listed in the dialog, cleared when its category is denied                                     | CL, B                                                     |
| Close: session cookie set, banner not shown again this session, nothing else written                                   | CL, B                                                     |
| every load deletes declared first-party cookies of denied services before activation (another tab withdrew)            | CL, B                                                     |
| a hung external: the queue moves on after 10 s                                                                         | CL (fake timers)                                          |
| `id` absent without an endpoint, present with one                                                                      | CL                                                        |
| `</script>` and U+2028 in `ui.text` cannot break the inline script                                                     | CL                                                        |
| `{{consentHead}}` after `<meta charset>`; an executable script before it is a wiring problem; JSON-LD before it is not | G, I                                                      |
| a page naming a `package` that uses a consent helper fails the render                                                  | I                                                         |
| per-page `config` overrides do not change `consent`                                                                    | I                                                         |
| `KISS_CHECK` staged build: `report.consent` paths equal a real build's                                                 | I                                                         |
| policy link follows `links.trailingSlash`; an unclaimed `ui.policy` id fails the render                                | I                                                         |
| the `data-kiss-consent-head` script never triggers a signature finding                                                 | A                                                         |
| `gtm` and `gtag` on one origin stay two `thirdParty` entries                                                           | A                                                         |

## 8. Browser suite and CI

**Where:** `test/browser/consent.test.js`, inside vitest's existing include.

**Setup:**

- Build `test/fixtures/consent-site` and `examples/14-consent` into temp folders (`os.tmpdir()`).
- Serve each with `serveFolder` (`scripts/screenshot.mjs:162`).
- `launchChromium` (`:196`) becomes an export.
- One browser, a new context per case.
- Every request not to `127.0.0.1` goes to a stub that records it and returns 204, or a script that pushes its name.

**Missing Chromium:** under `process.env.CI` the suite fails with the install command. Locally it uses `describe.skipIf` and prints the same command, so the skip is visible.

**CI (`.github/workflows/ci.yml`):** after `npm ci`, ubuntu runs `npx playwright-core install --with-deps chromium` and windows runs `npx playwright-core install chromium`, selected with `if: matrix.os`.

**Budget:** under 60 s per leg. `testTimeout` is 60000 ms, and `afterAll` closes the browser and the servers.

## 9. Slices

Agents never commit, never remove a worktree holding a junction, and never touch the main checkout's `node_modules`.

| #   | Slice                                                                                                                                                                                                                                                                                 | Owner                                 | May touch                                                                                                                      | After                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | This contract; the Amendment; the adversarial critique and its fixes                                                                                                                                                                                                                  | main, then critic                     | this file, the session log                                                                                                     | the spike                                                                     |
| 2a  | `lib/consent.js` (every export in §2, including `TRACKER_ORIGINS`, `ADS_CMP_SIGNATURES`, `textOf`, `bannerHash`, `consentReport`) and config wiring                                                                                                                                   | main                                  | `lib/consent.js`, `lib/config.js`, their tests, AIKB                                                                           | 1                                                                             |
| 3   | `lib/consent-ui.js`: default banner, dialog, table, settings control, theme CSS, against 2a's resolved shape                                                                                                                                                                          | agent A                               | `lib/consent-ui.js`, `test/unit/consent-ui.test.js`, `AIKB/consent-ui.md`                                                      | 2a                                                                            |
| 2b  | `lib/consent-gate.js`, the helpers, the wiring check, markdown-copy; creates and owns `test/fixtures/consent-site/` and `test/integration/consent.test.js`                                                                                                                            | main                                  | `lib/consent-gate.js`, `lib/handlebars-helpers.js`, `lib/kiss-page.js`, `lib/markdown-copy.js`, the fixture, tests, AIKB       | 2a; `{{consentBanner}}`, `{{consentTable}}` and `{{consentSettings}}` after 3 |
| 2c  | `lib/consent-client.js`                                                                                                                                                                                                                                                               | main                                  | `lib/consent-client.js`, its test, AIKB, `AIKB/upstream.md` (Appendix A's Chrome facts)                                        | 2a                                                                            |
| 2d  | Audit facts, checks and report key; plus the **minimum doc mentions** of the seven new ids that `skill-coverage.test.js:349-359` requires (a line each in `plugins/kiss-ssg/skills/kiss-site-review/SKILL.md`'s audit table), so the gates stay green; slice 6 rewrites them properly | main                                  | `lib/audit.js`, `lib/build-finish.js`, `lib/build-report.js`, their tests, AIKB, those doc lines, the fixture (shared with 2b) | 2a, 2b                                                                        |
| 4   | Browser suite, CI, `launchChromium` export                                                                                                                                                                                                                                            | main                                  | `test/browser/`, the fixture (shared), `scripts/screenshot.mjs` (export only), `.github/workflows/ci.yml`                      | 2b–2d, 3                                                                      |
| 4m  | `scripts/consent-measure.mjs` (the measurement tool from the scratch script; a build folder or a URL; kiss and Cookiebot selectors; scenarios idle, scroll, reject, accept, reload) and `test/unit/consent-measure.test.js`                                                           | agent B                               | those two files                                                                                                                | 1                                                                             |
| 5   | `examples/14-consent`; `eg14`; `examples/README.md`; the examples test row                                                                                                                                                                                                            | agent C                               | `examples/14-consent/**`, `package.json` scripts, `examples/README.md`, `test/integration/examples.test.js`                    | 2–3                                                                           |
| 6   | Docs and skills (§10)                                                                                                                                                                                                                                                                 | agent D; main runs every snippet      | §10's files                                                                                                                    | 2–5                                                                           |
| 7   | Measurement: example 14, then the diploma-msc trial (§11)                                                                                                                                                                                                                             | main, with the operator for the trial | scratchpad, the trial worktree                                                                                                 | 4m, 5                                                                         |
| 8   | Clean room through `scripts/arms.mjs`                                                                                                                                                                                                                                                 | main                                  | `planning/reviews/`                                                                                                            | 6                                                                             |

`npm run types` and the `CLAUDE.md` table rows land with each `lib/` slice.

## 10. Docs and skills

- **`GUIDE.md`:**
  - A section `### Cookie consent` after `### Learning packages`, covering config, presets, helpers, the client API, the events, the cookie, records, Consent Mode and the seven audit ids.
  - The traps: revived scripts miss `DOMContentLoaded`; the endpoint receives `text/plain`; third-party cookies survive withdrawal; `gtm` defaults to marketing, and why; kiss is not a Google-certified CMP; third-party state (a `.vimeo.com` cookie, storage inside an embed's frame) cannot be cleared by withdrawal; a marketing-only grant that loads GTM still lets GA4 send cookieless pings (`analytics_storage` denied); `consent-ungated` on a CDN library is answered with a `necessary` service listing its origin; the consent proof depends on running `kiss-ssg aikb` before a banner version is deployed.
- **`src/models/guide.json`:** a page entry for the new section, so `node docs` builds.
- **`llms.txt`:** one index line, keeping the 16,000-character cap (14,734 today).
- **`README.md`:** a feature line.
- **`CHANGELOG.md`:** `## 2.11.0` with `### Upgrading`. The note covers: the new audit findings `consent-missing` and `consent-ads-cmp` fire on sites without `config.consent`; the new `report().consent` key; the `services` field in `thirdParty`; `audit.ignore` accepts the new ids.
- **Skills:**
  - `kiss-legal-and-privacy`: Build mode declares services in `config.consent`; step 2 names the ids and `report.consent`; step 3's fix becomes `{{consentEmbed}}`; records via `endpoint`; AdSense needs a certified CMP.
  - `kiss-front-end`: `{{consentEmbed}}` when the site has `config.consent`, a hand-built facade only when it does not.
  - `kiss-site-new`: when the brief has analytics, ads tags or embeds, add `config.consent`, `{{consentHead}}`, `{{consentBanner}}` and `{{consentSettings}}` to the layout, linking the legal skill.
  - `kiss-site-review`: the new ids in its audit table.
- **`test/unit/skill-coverage.test.js`:**
  - rows for each skill obligation above;
  - `CONTRADICTIONS` bans on `The fix is a click-to-load facade (\`kiss-front-end\`).`and`no third-party embed that stores anything before a click: a facade instead;`, with the replacements in place;
  - a guard against "a consent banner is out of scope / not kiss".

## 11. The diploma-msc trial

1. `git -C C:/Code/kiss/diploma-msc worktree add --detach C:/Code/kiss/diploma-msc-consent HEAD`, then `npm ci` in it.
2. Replace `node_modules/kiss-ssg` with a junction to `C:/Code/kiss-ssg`. `npx kiss-ssg check` names the link on stderr.
3. Migrate, committing nothing:
   - `layout.hbs`: Cookiebot (`:28-31`) and the Cookiebot CSS (`:64-72`) out, `{{consentHead}}` in; GTM (`:96-106`) becomes `{{consentScript "gtm" id=…}}`; the `<noscript>` GTM iframe (`:114`) goes; `{{consentBanner}}` and `{{consentSettings}}` go in.
   - Services in config: `gtm`, `superchat` (marketing, its origins), `geoip` (preferences, its cookies), `vimeo`. The trial config **declares the container's first-party cookies and storage keys** from the baseline (`_uetsid`, `_uetvid`, `_rdt_uuid`, `_fbp`, `_clck`, `_clsk`, `__obref`, `prism_*`; `localStorage` `_gcl_ls`, `_uetvid`, `_uetsid` and their `_exp` keys, `lastExternalReferrer*`), so withdrawal can clear them.
   - `superchat-launcher.hbs` and `course.js` move to `kissConsent.when` and `on`.
   - `home.hbs:609`'s jQuery Vimeo goes behind `kissConsent.when('vimeo', …)`.
   - The other Vimeo iframes become `{{consentEmbed "vimeo"}}`.
4. Ask the operator about data credentials before building.
5. Measure with `scripts/consent-measure.mjs`, mapping `www.diploma-msc.com` to the local server, and compare with the baseline. Add two extra scenarios: **statistics only** (S1b predicts it loads nothing under the `gtm` marketing default), and **Accept then withdraw** (first-party declared cookies and storage gone, no new request to a gated origin after the reload; third-party `.vimeo.com` and frame storage left, as documented).
6. Teardown, in order:
   1. remove the junction (`fs.rmdirSync`, from a script written with Write);
   2. confirm `C:/Code/kiss-ssg/lib/kiss.js` still exists;
   3. `git worktree remove --force` and `git worktree prune`.

## 12. Risks

1. **Container tags outside Consent Mode** (measured). Mitigated by the `gtm` marketing default and the guide. A site that wants statistics-only GA4 must fix its container. The diploma-msc container needs this, and that is the operator's call, outside this branch.
2. **Revived scripts miss `DOMContentLoaded`** (measured). This is documented, `when()` is offered, and the browser suite proves GTM still fires `gtm.dom` and `gtm.load` (S1: it did).
3. **CSP.** There are two inline scripts per page, and their hashes change with the config. This is documented; computing hashes is out of scope.
4. **Client size.** Estimated (not measured) at 5–7 kB minified, inlined on every page. `AIKB/consent-client.md` records the real figure, and a test pins an upper bound.
5. **Existing sites gain findings** (`consent-missing`) on upgrade. Check the fleet with `kiss-ssg check` before the bump, and cover it in the `### Upgrading` note.

## Appendix A: browser spike (measured 2026-11-03)

- **Setup:** playwright-core Chromium, scratch fixtures served by `serveFolder`. Scripts and raw output are in the session scratchpad (`spike/`).
- **S1:** diploma-msc's live container `GTM-NXRHGJ8`, with `www.diploma-msc.com` mapped to the local server. Only `/gtm.js` and `/gtag/js` were allowed through; every other request was recorded and aborted.

| #   | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | **Basic mode, no choice:** zero requests. **Stored choice** (update in the head, activation at DCL): every hit `gcs=G111`. **First Accept:** `G111` whether `update` ran before or after activation, because GTM loads asynchronously after both. **Advanced** (GTM ungated): before any choice, GA4 sent `G100` `page_view` and `scroll` pings with `npa=1` to `region1.google-analytics.com` and `pagead2.googlesyndication.com/ccm/collect`, and the container loaded Clarity, Bing UET, ActiveCampaign and OpenAI scripts. **`update` before `default`** (a misuse): the earlier update stood, and the hits were `G111`. |
| S1b | **Statistics-only grant** (`analytics_storage` granted, the `kiss_consent` event pushed, GTM activated): Google hits `G101`; Clarity, Bing UET, ActiveCampaign and OpenAI scripts loaded; Meta and Reddit did not. The container's non-Google tags lack consent checks.                                                                                                                                                                                                                                                                                                                                                      |
| S2  | **Ungated control** order: A, B, E, F, C, D, then DCL, then D saw DCL. **Inserting everything at once with `async=false`:** B and C (inline, module) ran before A (an earlier external), so the order broke. **The serial queue:** A, B, C, D, E, F, exact document order, both at DCL and after load. A revived `defer` script **never saw DCL**.                                                                                                                                                                                                                                                                           |
| S3  | `document.write` in a revived inline script replaced the document: `#tail` was gone and the body had one child. In the serial queue the `load` event never fired (navigation timeout).                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S4  | Neither `<template>` iframes nor `data-src` iframes made a request before revival; both loaded after.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| S5  | New visitor: the banner was inserted at 14 ms and first paint was at 28 ms, so the banner was in the first paint. Returning visitor: no insert, no banner. No layout shift entries with the fixed bottom banner.                                                                                                                                                                                                                                                                                                                                                                                                             |
| S6  | `sendBeacon` with a `text/plain` Blob, then `location.reload()` straight away: the POST arrived with its body.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| S7  | The deletion loop (no domain, the host, and each parent domain, `Path=/`) removed `_ga@.kiss.test`, `_ga_X@.kiss.test` (by the `_ga_*` prefix), `_gid@www.kiss.test` and `_gcl_au@.www.kiss.test`.                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Amendments

<!-- Dated sections, appended in place when the design moves. -->

### 2026-11-03: the adversarial critique, folded in before any build

A fresh-context agent reviewed this contract (6 blockers, 18 should-fix, 6 notes). The two file:line claims checked locally (`siteUrl` at `config.js:141`; the origin key at `audit.js:358`) were right. Every finding was folded into the sections above rather than listed here, so the body is the single truth. The fixes, by finding:

- **Withdrawal and grants:** denying a category clears its "always allow" grants, and the dialog lists them (§4, §3). Reject all denies `objection` categories and goes through withdrawal when one was active (§5). Withdrawal clears first-party state only; third-party state is documented, and the success criterion is restated in the session log (§1 presets, §5, §11).
- **Determinism:** `purposesVersion`'s inputs are named, with what it excludes (§1). Categories in use are site-wide (§1).
- **Seams:** every `lib/consent.js` export lands in 2a; slice 3 runs before 2b's banner helpers; 2b owns the fixture; 2d writes the minimum doc lines the coverage test needs; the client renders the confirmation (§9, §3).
- **Correctness:** the minimum example uses `siteUrl` and `id=` (§1); the head goes after `<meta charset>` (§3); originals are replaced by their clones (§5); `async` becomes `data-async` and the queue times out (§3, §5); the origin key carries the service (§6); report paths go through `real()` (§6); the inline config is escaped (§2).
- **Law and UX:** the dialog has Reject all and Accept all (§3); Close sets a session cookie (§4, §5); `id` only with an endpoint (§4); every load clears denied services' first-party cookies (§5); a policy link through the URL policy (§1, §3); `google: true` in an objection category is an error (§1).
- **Scope:** consent helpers fail on learning-package pages (§3); the aikb-before-deploy dependency is documented and visible in `check`'s diff (§6); the helpers are named `consentScript` and `consentEmbed` (operator, 2026-11-03), so no site field or helper named `script` or `embed` can collide.
- **Notes taken into the guide:** marketing-only grants still let GA4 send cookieless pings; `ready` fires after the queue starts; CDN libraries answer `consent-ungated` with a `necessary` service; `thirdParty`'s gated origins load only after consent; two sites sharing `cookie.domain` need distinct cookie names.
