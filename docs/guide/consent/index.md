# Cookie consent

The consent manager built into kiss: services declared once in config.consent, the banner and settings, gated scripts and click-to-load embeds, Google Consent Mode, withdrawal, records of each choice, and what the audit checks.

A site that loads analytics, an advertising tag or a video from another company stores something on its visitors' devices, and in the UK and the EU most of that needs the visitor's consent first. kiss has a consent manager built in. Declare once, in `config.consent`, every service the site loads that stores or reads anything, and kiss makes four things from that one block: the banner, the settings dialog, the cookie table, and the gating on every page. **Nothing a gated service loads is fetched until the visitor allows it.** `examples/14-consent` (`npm run eg14`) is a working site. Whether a site needs consent for a given service, and what its privacy page says, is the `kiss-legal-and-privacy` skill's.

**When you do not need it.** A site with nothing to ask about needs no banner. That means no analytics, no tags, and no embed that loads with the page. A video or a map can stay that way with a hand-built click-to-load facade: a poster and a button that loads the iframe only when pressed (the `kiss-front-end` skill). `consent` is `null` by default. The audit's `consent-missing` says when a page loads a known tracker or embed without it.

The minimum is the services, and the layout's five places:

```js
const kiss = new Kiss({
  siteUrl: 'https://example.com',
  consent: {
    services: {
      gtm: { id: 'GTM-XXXXXXX' },
      youtube: {},
    },
  },
})
```

```html
<!-- src/layouts/layout.hbs -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    {{consentHead}}
    <title>{{title}}</title>
    {{consentScript "gtm"}}
  </head>
  <body>
    {{consentBanner}}
    <main>{{#block "main"}}{{/block}}</main>
    <footer>
      {{consentSettings}} <a href="{{link 'cookies'}}">Cookies</a>
    </footer>
  </body>
</html>
```

```hbs
{{! src/pages/roasting.hbs }}
{{#extend 'layout'}}
  {{#content 'main'}}
    <h1>Watch a roast</h1>
    {{consentEmbed
      'youtube'
      id='VIDEO_ID'
      title='A roast, from green beans to first crack'
    }}
  {{/content}}
{{/extend}}
```

The banner links the page whose id is `cookies`, and a build with no such page fails. Give it `{{consentTable}}`, or set `ui.policy` to the id of the page that explains your cookies (`null` links none).

## Services and presets

A service is one thing the site loads: a tag, a script of its own, or an embed. **Its name picks a preset** when kiss has one of that name. A preset fills in the loader URL, the provider, the origins, the cookies it sets and, for a Google tag, Consent Mode. Your own keys win over the preset's, except `origins`, which add to them. Any key that is not a setting is a placeholder value: `id` above fills the `{id}` in the preset's URL. The helper's hash fills it first, so `{{consentScript "gtm" id=gtmId}}` takes the id per page, and a placeholder with no value fails the render (`consentScript "gtm": no value for {id}`).

| Name | Category | What it loads |
| --- | --- | --- |
| `gtm` | `marketing` | Google Tag Manager, `gtm.js?id={id}`, after its inline `gtm.start` push |
| `gtag` | `statistics` | Google Analytics, `gtag/js?id={id}`, with its inline `config` call |
| `youtube` | `marketing` | an embed from `www.youtube-nocookie.com/embed/{id}`, with a link to the video on YouTube |
| `vimeo` | `marketing` | an embed from `player.vimeo.com/video/{id}?dnt=1`, with a link to the video on Vimeo |
| `google-maps` | `marketing` | an embed whose URL you give: `{{consentEmbed "google-maps" src="https://www.google.com/maps/embed?…" title="…"}}` |

**Why `gtm` is `marketing`.** Consent Mode reaches Google's own tags only. A container also loads other companies' tags, and those run whatever Consent Mode says. Measured on a real container (2026-11-03), a grant of statistics alone loaded Bing, ActiveCampaign and OpenAI scripts. Under `marketing`, the container loads only when marketing is allowed. A site whose container gives every tag that is not Google's its own consent check may set `gtm: { id, category: 'statistics' }`.

A service with no preset says its category, and what it sets, for the table and for withdrawal:

```js
consent: {
  services: {
    visits: {
      category: 'statistics',
      label: 'Visit counter',
      provider: 'Aster & Oak',
      description: 'Counts how many times this browser has visited.',
      cookies: [
        { name: 'ao_visits', duration: '1 year', description: 'How many visits' },
      ],
    },
    chat: {
      category: 'marketing',
      provider: 'Chatterbox',
      src: 'https://widget.chatterbox.example/{key}.js',
      key: 'abc123',
      storage: ['chatterbox_session'],
    },
    jquery: { category: 'necessary', origins: ['https://code.jquery.com'] },
  },
}
```

-   **`cookies` and `storage`** list what a service writes: `{ name, duration, description, domain }`, or a bare name. A name ending `*` is a prefix (`_ga_*`). An entry with a `domain` is another site's (third-party) unless it says `party: 'first'`. A site's own `cookies` and `storage` are added to the preset's, as `origins` are, and an entry with the same name as a preset's replaces it: a `gtm` that declares its container's own cookies (`_fbp`, `_clck`) keeps `_ga`, `_ga_*` and `_gcl_au`.
-   **`src`**, **`inline`** and **`partial`** say what `{{consentScript}}` loads: a URL, a script body run before it, or the name of a site partial whose `<script>` tags are gated as this service. **`embed`** (`{ src, title, watch }`) is what `{{consentEmbed}}` loads, and `watch` is the provider's own page for it.
-   **`origins`** names the other sites a service loads from, beyond its `src`: for the audit and the version (below).
-   **`category: 'necessary'`** is a service the site cannot work without: it is never gated and never asked about. A library from a CDN is one, and naming its origin is how the audit's `consent-ungated` stops reporting it.
-   **`google: true`** marks a Google tag your config builds itself, so Consent Mode applies to it.

A service's name is lowercase letters, digits and `-`, and never a category's (`necessary`, `preferences`, `statistics`, `marketing`), because `kissConsent.has()` takes either by one name. Every level of `consent` refuses a key it does not know, and the error names the valid ones.

## Categories

Three categories can be asked about, `preferences`, `statistics` and `marketing`, plus `necessary`, which is always on. The banner offers only the categories at least one service belongs to. That set is decided once for the whole site, so every page asks the same question, even a page that loads none of those services. Give a category its own `label` or `description` under `categories`.

**`statistics` may be `mode: 'objection'`** instead of the default `'consent'`. Its services then run before any choice, and a visitor switches them off. This is the UK's statistics exception (PECR Schedule A1 para. 5), and it is narrow: statistics solely to improve the site, not shared, with clear information and a free way to object. It does not exist in EU law. A Google tag cannot be in an objection category, and the build refuses one. The audit's `consent-objection-third-party` reports a third-party service in one.

```js
consent: {
  categories: { statistics: { mode: 'objection' } },
  services: {
    visits: {
      category: 'statistics',
      src: '/js/visits.js',
      cookies: ['ao_visits'],
    },
  },
}
```

## The helpers

| Helper | Where | What it writes |
| --- | --- | --- |
| `{{consentHead}}` | in `<head>`, after `<meta charset>` and the viewport, before any script | the inline client: sets Consent Mode's defaults, reads the stored choice, defines `window.kissConsent`; the rest of the client, `kiss-consent.<hash>.js`, deferred; and the theme's `<style>` |
| `{{consentBanner}}` | first in `<body>` | the banner and the settings dialog, each in a `<template>`, shown only to a visitor who has not chosen |
| `{{consentScript}}` | wherever the script belongs | the service's scripts as `type="text/plain"`, which the browser does not run, until allowed |
| `{{consentEmbed}}` | where the embed belongs; `title=` is required | a notice with **Load it** and **Always allow** buttons, a link to the provider, and the iframe in a `<template>` |
| `{{consentSettings}}` | in every page's footer | the "Cookie settings" button, so a visitor can change their mind from any page |
| `{{consentTable}}` | on the cookie page | one table per category: each service, its provider, purpose, cookies and storage, duration, and first or third party |

`{{consentScript}}` has three forms. With no body it writes the service's `inline` script, then its `src`; `src=` in the hash overrides the service's. As a block, every `<script>` inside is gated as the service, the service's own `src` is not used, and a block with no `<script>` tag is one script's body. For a service with a `partial`, it renders that partial with the page's context and gates its scripts the same way:

```hbs
{{consentScript 'chat'}}
{{#consentScript 'visits'}}
  <script>window.aoVisits = { path: location.pathname }</script>
  <script src='/{{asset "js/visits.js"}}'></script>
{{/consentScript}}
```

Gated scripts run in document order once allowed, each external one and each inline module waiting for the one before it (for up to ten seconds). `async` keeps a script from holding the queue, `type="module"` is kept, and `defer` is dropped, because the queue already keeps the order. Every script type a browser runs is gated, `application/x-javascript` and `language="javascript"` included; a data block such as JSON-LD is left as it is. A `necessary` service, or a Google tag under advanced mode, is not gated, so its block is written exactly as you wrote it, `defer` and all.

**The build checks the wiring of every page**, from the HTML it wrote. A page fails, and warns under `dev`, when it has gated markup or a settings button with no `{{consentHead}}`; a head with no banner, or two of either; an executable script before the head's (JSON-LD is fine); or one service's script twice. A mistake in a helper fails the page the same way: `config.consent` not set, an unknown service, a missing placeholder, an iframe inside `{{consentScript}}`, or a `ui.policy` or `ui.logo` that the build does not have.

**On a learning package's pages** (§ Learning packages) `{{consentHead}}`, `{{consentBanner}}` and `{{consentSettings}}` render nothing, so one layout serves both, and `{{consentScript}}` and `{{consentEmbed}}` fail the page. The LMS deals with consent for a course: a reload inside it would break the learner's session, and a `Path=/` cookie would be shared by every course on its domain.

## In the browser: `window.kissConsent`

The banner offers **Accept all** and **Reject all** as two buttons of equal weight (the ICO asks that refusing be as prominent as accepting), **Choose cookies** beside them as a text button for a choice in detail (the arrangement Google's own consent screen uses), and a ✕ that closes it without choosing. The dialog has a ✕ to close it, a switch per category (a real checkbox, announced as a switch), and Reject all, Accept all and Save choices at its foot. After a choice the banner is replaced by a short confirmation that takes focus. A bottom banner keeps a focused control and the end of the page scrollable clear of it.

Site code reads the choice through `window.kissConsent`, which `{{consentHead}}` defines:

```js
kissConsent.has('marketing') // a category is allowed; necessary always is
kissConsent.has('vimeo') // a service: its category is allowed, or "Always allow"
kissConsent.has('cdn') // a necessary service: always true
kissConsent.choice // null, or { id, version, at, categories, services }
// choice.services holds the "Always allow" grants only; a record's services lists every one
kissConsent.show() // open the settings dialog
kissConsent.when('vimeo', () => startPlayer()) // now, or once it is allowed
kissConsent.on('change', ({ choice, granted }) => console.info(granted))
```

`has` and `choice` answer from the first moment. The rest of the client is a separate file, `kiss-consent.<hash>.js`, which the build writes at its root and every consent page loads with `defer`, so a returning visitor's browser has it cached. Until it has arrived, `show`, `when` and `on` are held and run in order when it does, and so is a click on the banner: nothing is lost. If the file never arrives, the banner still shows and nothing gated runs. Serve it like any other file; its name changes only when kiss's client code does, so it can be cached for good. Under a Content Security Policy it needs `'self'`, and the inline part still needs `'unsafe-inline'` or its hash.

`on('ready', fn)` runs once per page when the queue of allowed scripts has started, and at once for a listener added after that. Started is not finished: a listener must not assume a gated script has run. `when` is for that. The same two moments are DOM events on `document`: `kiss-consent:ready` (`detail.choice`) and `kiss-consent:change` (`detail.choice`, `detail.granted`). Each choice also pushes `{ event: 'kiss_consent', kiss_consent: { statistics: true, marketing: false } }` to `dataLayer`, for a GTM trigger.

**A gated script never sees `DOMContentLoaded`**, because it runs after the page has parsed. A script revived after a click misses `load` too. Code inside one that waits for either never runs, so it runs straight away instead. Site code that loads a third party itself, such as a player script or a chat widget it injects, is not gated, so it waits with `kissConsent.when('<service>', fn)`.

```js
const startPlayer = () => {
  const s = document.createElement('script')
  s.src = 'https://player.vimeo.com/api/player.js'
  document.head.append(s)
}
if (window.kissConsent) kissConsent.when('vimeo', startPlayer)
```

## The choice, asking again, and withdrawal

The choice is a first-party cookie, `kiss_consent`, used for nothing else and listed first in the cookie table. It holds a format number, when the choice was first made and last changed, the version, and one flag per category, plus any "Always allow" grants. It keeps for `cookie.days`, 182 by default: six months, the time the ICO and the CNIL suggest before asking again. Change the name with `cookie.name`, and its domain with `cookie.domain`. Two kiss sites on one domain that share a `cookie.domain` need different names, or each would invalidate the other's choice. **Close** (✕) is not a choice: it sets a session cookie, `kiss_consent_closed`, so the banner stays away for the rest of the visit and returns in the next one.

**Everyone is asked again when the purposes change.** `version` defaults to a hash of the categories in use, with their modes, and each service's name, category, provider and origins. So a new service, a new third-party origin or a category's mode changing asks everyone again. Wording, colours, the logo, cookie names and a different GTM id ask nobody, because the ICO says not to ask repeatedly. Set `version` yourself to ask everyone again on purpose.

**Withdrawing is as easy as giving**, from the settings button on every page. Refusing a category that is running on the page deletes the first-party cookies and storage keys its services declared, then reloads the page, because a script that has run cannot be un-run. Every page load deletes them too, which catches a withdrawal made in another tab. **What it cannot clear:** another site's cookies (Vimeo's `vuid` on `.vimeo.com`), and storage inside an embed's own frame (YouTube's `localStorage`). They stay until the visitor clears them in the browser, and your cookie page should say so. Withdrawal also clears only what is declared, so declare the first-party cookies your container's tags set. It never clears kiss's own consent log, even when a service's pattern (`kiss_*`) matches it.

## Records: the endpoint and the banner hash

You must be able to show what a visitor agreed to. Google's EU user consent policy asks advertisers to keep "the text and choices presented to users" and "the date and time" of each consent.

-   **The text.** Every page's banner carries a hash of its words (`data-kiss-consent-hash`), and `report().consent.banners` lists each hash with its pages. `npx kiss-ssg aikb` records the report into `AIKB/last-build.json`, so the commit that first holds a hash dates that wording. **That proof holds only if the record is made before the banner is deployed**: run `kiss-ssg aikb` and commit whenever the banner changes, then deploy. `kiss-ssg check` says so: when its diff against `AIKB/last-build.json` finds a banner hash the record does not hold, it prints `! consent banner <hash> (was <hash>): record it with kiss-ssg aikb and commit before deploying` above the page rows, and `! consent version a -> b: every visitor is asked again` when the version moved. With an `endpoint` set, the build also writes **`consent-banners.json`** beside the pages, for the server your records go to: for each hash, the exact text it was taken from (its sha256 begins with the hash) and the categories and services as the visitor saw them, so a server holding records can show each one with the words it was given under.
-   **The choices.** `endpoint: '/api/consent'` (or an `https://` URL) makes every choice POST a record to it: `{ format: 2, action, id, version, timestamp, categories, services, bannerHash, page }`. `action` is the control that made it: `accept`, `reject`, `save` or `allow` (an embed's "Always allow"). A withdrawal is a record whose categories are now `false`. `categories` is `null` for an "Always allow" made before the banner was answered. `services` names every service this config declares outside `necessary`, each `true` or `false`: what runs after that choice, whether its category or its own "Always allow" decided it. Services change over time and a category's answer does not cover one added later, so the record says what was agreed to then. A new service also changes `version`, which asks every visitor again. Store each one on your own server. The body is JSON sent as **`text/plain`**, so the browser sends it with no CORS preflight; parse the raw body, because a JSON body parser looking for `application/json` will skip it. Nothing is sent on Close or on a page load, and nothing is retried: a record lost to a network error or a blocker is gone.
-   **The browser's own copy.** Every choice is also appended, before it is posted, to `localStorage` under `kiss_consent_log` (named after `cookie.name`): the same records, oldest first, the last 50. It needs no endpoint, so a visitor can see their history from the day the site ships. It is not evidence, because the visitor can edit it; the server's records are. Withdrawal never deletes it, and a service may not declare its name. The cookie table lists it.
-   **The id.** The cookie carries a random `id` (`crypto.randomUUID()`), made in the browser at the first choice, and every record from that browser carries it. It says nothing about the person, and it leaves the browser only in a record posted to your endpoint. A visitor quotes it to ask what you hold, or to have it deleted.

The audit's `consent-records-missing` fires on a Google marketing tag with no endpoint.

## The visitor's history: `{{consentRecord}}`

Put `{{consentRecord}}` on the privacy page, and set `ui.history` to that page's id. The settings dialog then links it ("See your consent history", beside the cookie policy link), straight to the section (`#kiss-consent-history`) rather than the top of the page. A build with no page of that id fails, as `{{link}}` does, and the audit's `consent-history-missing` reports a page of that id with no `{{consentRecord}}` on it. `ui.history` is `null` by default, so the dialog links nothing until the page exists.

```hbs
<h1>Privacy</h1>
<p>…</p>
{{consentRecord}}
```

```js
consent: {
  services: { gtm: { id: 'GTM-XXXXXXX' } },
  ui: { history: 'privacy' },
}
```

It writes a section headed "Your cookie choices", which says what the history is, and a table the browser fills from `kiss_consent_log`. Rows are newest first: the date and time to the second, which choice it was, each category allowed or refused, the services that choice allowed and the ones it refused, by the labels you gave them, and the purposes version. A row marks where the purposes changed and the visitor was asked again. The date follows the visitor's own locale when it is the page's language (an en-GB browser on a `lang="en"` page writes `3 Nov 2026, 15:40:42`), and the page's `lang` otherwise. Above the table it shows the visitor's consent id, which every record of theirs carries, on your server and in their browser alike: it is what they quote in a request for the data you hold. With an `endpoint` set, the section also says exactly which details each choice sends. It says nothing about what your server keeps: that is for your privacy notice to say.

There is no control to delete the history. A record that has to show consent should not be easy to change, and the visitor can still clear it with the browser's own site data. With JavaScript off, a note says the history needs it; where the browser refuses storage, it says there is none to show. A choice made on the page, from its footer's settings, appears at once. Its script is its own and is on this page only. The Markdown copy keeps the heading and the statements, and drops the table. Every string is a `ui.text` key: `historyLink`, `historyTitle`, `historyIntro`, `historySent`, `historyId`, `historyEmpty`, `historyUnavailable`, `historyNoScript`, `historyWhen`, `historyChoice`, `historyServicesAllowed`, `historyServicesRefused`, `historyVersion`, `historyChanged`, `historyYes`, `historyNo`, and one per choice, `historyAccept`, `historyReject`, `historySave` and `historyAllow`.

## Customising the banner

```js
consent: {
  services: { gtm: { id: 'GTM-XXXXXXX' } },
  endpoint: '/api/consent',
  ui: {
    position: 'top',
    logo: 'img/logo.svg',
    text: { title: 'Cookies at Aster & Oak', accept: 'Allow all' },
    theme: {
      background: 'var(--surface)',
      text: 'var(--ink)',
      accent: 'var(--accent)',
      accentText: 'var(--on-accent)',
      border: 'var(--line)',
      radius: '12px',
    },
  },
}
```

-   **`position`** is `'bottom'` (a fixed bar, the default) or `'top'` (in the page's flow, before the skip link).
-   **`logo`** is an asset path, looked up as `{{asset}}` looks one up.

The policy link and the logo are root-relative (`/cookies/`), unless `siteUrl` carries a path prefix (`https://example.com/site/`): then they are absolute and carry it (`https://example.com/site/cookies/`), as `{{link absolute=true}}` would write them.

-   **`text`** replaces any of the wording: `title`, `body`, `accept`, `reject`, `choose`, `save`, `close`, `settings`, `policy`, `confirmation`, `hide`, `necessaryLabel`, `necessaryDescription`, and the embed's `embedNotice`, `embedLoad`, `embedAllow` and `embedWatch` (`{provider}` is filled in), and the history page's `history…` keys (above).
-   **`history`** is the id of the page with `{{consentRecord}}`, linked from the dialog; `null` (the default) links none.
-   **`theme`** sets `background`, `text`, `accent`, `accentText`, `border`, `radius` and `font`. A value is any CSS value without `;`, `{`, `}`, `<` or `>`, so `var(--surface)` uses your site's own custom properties and the banner follows its dark scheme. `theme: false` drops kiss's stylesheet altogether.

**A filled Accept beside an outlined Reject.** By default Accept all and Reject all are identical. A site that wants Accept a step ahead can outline Reject in the same colour, from its own stylesheet (which loads after kiss's, so the rule wins):

```css
.kiss-consent__button[data-kiss-consent-action='reject'] {
  background: transparent;
  color: var(--kiss-consent-accent);
}
```

Both buttons keep the same size, border, colour and place, in the banner and in the settings dialog, and a dark scheme follows because the rule uses the theme's own accent. This is as far as the styling should go. Regulators judge a highlighted Accept case by case, but a Reject that is faded, low in contrast, smaller, worded as something else or moved off the first layer is a clear breach. That breach makes the consent invalid, and Google Ads relies on that consent. So check that the accent on the banner's background still reaches 4.5:1, and never hide Reject.

**Your own banner markup** is a partial named `consent-banner` (or `ui.partial`), rendered with `text`, `position`, `logoUrl`, `policyUrl`, `categories` and `services`. Keep the buttons' `data-kiss-consent-action` values, `accept`, `reject`, `settings` and `close`, because the client acts on them, and keep Accept and Reject equally prominent. Keep the `kiss-consent` classes and `data-position` to keep kiss's styles and the bottom bar's placement, or style it all yourself; the client makes room at the foot of the page only when the banner is actually `position: fixed`. The dialog and the confirmation stay kiss's.

A site whose every service is `necessary` has nothing to ask: `{{consentBanner}}` writes empty templates and no banner is shown, so the same layout works whether or not a site asks for anything.

```html
<!-- src/partials/consent-banner.hbs -->
<section
  class="kiss-consent"
  data-position="{{position}}"
  role="region"
  aria-label="{{text.title}}"
>
  <h2 class="kiss-consent__title">{{text.title}}</h2>
  <p class="kiss-consent__body">
    We roast in Bristol and count our visitors.
    <a class="kiss-consent__policy" href="{{policyUrl}}">{{text.policy}}</a>
  </p>
  <div class="kiss-consent__actions">
    <button
      class="kiss-consent__button"
      type="button"
      data-kiss-consent-action="accept"
    >
      {{text.accept}}
    </button>
    <button
      class="kiss-consent__button"
      type="button"
      data-kiss-consent-action="reject"
    >
      {{text.reject}}
    </button>
    <button
      class="kiss-consent__button"
      type="button"
      data-kiss-consent-action="settings"
    >
      {{text.choose}}
    </button>
  </div>
  <button
    class="kiss-consent__close"
    type="button"
    data-kiss-consent-action="close"
    aria-label="{{text.close}}"
  >
    ✕
  </button>
</section>
```

## Google Consent Mode

`{{consentHead}}` sets Consent Mode's default before any Google tag can load: everything denied except `security_storage`, and except an objection category's types. A returning visitor's choice is applied in the same script, before anything else on the page runs. The categories map to Consent Mode's types: `statistics` to `analytics_storage`; `marketing` to `ad_storage`, `ad_user_data` and `ad_personalization`; `preferences` to `functionality_storage` and `personalization_storage` (`google.map` changes it).

`google.mode` is `'basic'` by default: a Google tag is gated like any other, so nothing reaches Google before a choice. `'advanced'` loads Google's tags ungated, with consent denied, and Google then sends "cookieless pings" before any choice. No regulator has said that is lawful, so the audit's `consent-google-advanced` reports it as a decision someone must have made. The other settings are `waitForUpdate` (advanced mode only), `adsDataRedaction` and `urlPassthrough`.

**A category the site does not offer follows the one holding its Google tags.** A site whose only Google tag is `gtm` (marketing) offers no statistics category, so `analytics_storage` would never be granted and GA4 would run cookieless for a visitor who accepted everything. kiss hands the Consent Mode types of every category the site does not offer to the category holding its Google tags (the most restrictive, when they span several): on such a site, allowing marketing grants `analytics_storage` too, and the marketing category's description should say it covers measuring the site. Measured on diploma-msc's real container (2026-11-03): `gcs=G110` after Accept all before this rule, `G111` after.

**A marketing grant alone still reaches Google Analytics** on a site that does offer statistics. Under the `gtm` default, a visitor who allows marketing but not statistics loads the container with `analytics_storage` denied. GA4 sets no cookie then, but it still sends cookieless pings. If statistics refused must mean nothing sent to GA4, give the GA4 tag in the container its own consent check, or load GA4 as a `gtag` service under `statistics`.

**kiss is not a Google-certified CMP.** Google requires one, integrated with the IAB's TCF, of publishers serving personalised ads through AdSense, Ad Manager or AdMob. It does not require one of advertisers, so GA4 and Google Ads conversion tracking are fine. The audit's `consent-ads-cmp` reports an AdSense or Ad Manager tag on any page, with or without `config.consent`.

## What the build reports

Seven audit checks, advisory like every audit check (§ Checking a build):

| id | fires when |
| --- | --- |
| `consent-missing` | no `config.consent`, and a page loads a known tracker or embed (Google, Meta, Clarity, Bing, Hotjar, LinkedIn, Reddit, YouTube, Vimeo, Google Maps, Superchat) or has a GTM or gtag loader inline |
| `consent-ungated` | `config.consent` is set, and a page loads a third-party script or iframe that no service gates and no `necessary` service names in its `origins`, a `<noscript>` GTM frame included |
| `consent-ads-cmp` | AdSense or Ad Manager is on a page: these need a Google-certified CMP |
| `consent-objection-third-party` | a service in an `objection` category loads from another site |
| `consent-settings-missing` | a page has `{{consentHead}}` and no `{{consentSettings}}`, on a site with something to ask (not when every service is `necessary`) |
| `consent-google-advanced` | `google.mode` is `'advanced'` |
| `consent-records-missing` | a Google tag under `marketing`, and no `endpoint` |
| `consent-history-missing` | the page `ui.history` names has no `{{consentRecord}}` |

`report().consent` is `{ version, purposes, mode, banners: [{ hash, pages }], categories, services: [{ name, category, gated, origins, cookies }], pagesWithoutHead }`, or `null` without `config.consent` and on a failed build. `purposes` is the computed version, kept even when `version` is set by hand. `--summary` prints it as `consent: version <v>, banner <hash>, <n> services`. In `report().thirdParty`, an origin that a service gates carries `services: ['gtm']`: it is fetched only after consent.

## Traps

-   **A gated script never sees `DOMContentLoaded`.** Run its code straight away, and make site code that injects a third party wait with `kissConsent.when` (above).
-   **`document.write` in a gated script fails the build.** Run after the page has parsed, it would replace the whole page. kiss can see it only in a script's own body, not inside a file a `src` loads.
-   **A Content-Security-Policy** that refuses inline scripts needs the hash of each inline script the page runs: `{{consentHead}}`'s, which changes whenever the config or the banner's wording does, `{{consentBanner}}`'s one-line `mount()`, and each gated inline script. kiss does not compute them.
-   **AdSense and Ad Manager need a Google-certified CMP**, which kiss is not (`consent-ads-cmp`).
-   **A marketing grant loads GTM, and GA4 inside it still sends cookieless pings** with `analytics_storage` denied (above).
-   **Withdrawal clears first-party state only**, and only what is declared. Another site's cookies and an embed's frame storage stay.
-   **The proof of what a visitor saw depends on `kiss-ssg aikb` running before the banner is deployed.**
-   **Learning-package pages render no banner**, and a gated script or embed on one fails the page.
-   **No JavaScript, no banner, and nothing gated runs.** That is the refusal by default. A `<noscript>` GTM iframe would load ungated, so it goes, and `consent-ungated` reports one that stays.
