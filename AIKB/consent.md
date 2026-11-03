# consent.js

## Responsibility

The cookie consent manager's config, and every decision made from it. It covers:

- which services a site declares, filled from presets;
- what each service loads and stores;
- which categories the banner offers;
- the version that decides when a visitor is asked again;
- the Google Consent Mode state;
- what the browser is handed;
- what the build report records.

It writes no markup and runs nothing in a browser. The gated tags are `lib/consent-gate.js`'s job, the default banner `lib/consent-ui.js`'s, and the page's own behaviour `lib/consent-client.js`'s. The contract is `planning/plans/2026-11-02-consent-manager.md`.

## Public interface

- **`resolveConsent(input)` → `KissConsent | null`.** `config.consent`, resolved and checked; `undefined`, `null` and `false` give `null`. `lib/config.js`'s `resolveConfig` calls it for `config.consent`.
  - **Unknown keys:** every level refuses them, naming the valid keys. The exception is a service's own extra keys, which are placeholder values (`gtm: { id: 'GTM-X' }`) and must be strings or numbers.
  - **The resolved block:** `{ version, categories, inUse, services, cookie, google, endpoint, ui }`.
- **`categoriesInUse(resolved)`** → the categories at least one service belongs to, `necessary` aside, in `CATEGORY_NAMES` order. Decided once per site (`inUse`), so every page offers the same set.
- **`purposesVersion(resolved)`** → 12 hex characters. The default `version`; see Non-obvious behavior.
- **`serviceParams(service, hash)`** and **`fill(template, params, where)`.** Placeholder values come from the helper's hash over the service's own. `fill` URL-encodes each value and throws `<where>: no value for {x}`.
- **`consentModeDefault(resolved)`** and **`consentModeState(granted, map)`** → the Consent Mode `default` and `update` arguments.
- **`textOf(html)`** and **`bannerHash(html)`** → the visible text, and 12 hex characters of its sha256.
- **`gatingOf(service, resolved)`** → how a service is emitted:
  - `'none'` for a `necessary` service, or a Google service under `google.mode: 'advanced'`;
  - `'embed'` for a service with an `embed`;
  - `'script'` otherwise.
- **`clientConfig(resolved, { logoUrl, policyUrl, bannerHash })`** → the object `{{consentHead}}` inlines. It carries only what the client acts on: the version, the cookie settings, categories, every service with its first-party cookie and storage names (a `necessary` service with none, so `has()` and `when()` answer for it while its cookies are never deleted), the Google block with its computed defaults, the endpoint, the position and two strings.
- **`consentReport({ consent, pages, real, gatedPages })`** → the report's `consent` key, or `null` without a consent manager.
- **`originOf(url)`** and **`matchesHost(url, list)`** → URL helpers for the audit.
- **Frozen tables:**
  - `CATEGORY_NAMES`, `CONSENT_TYPES`;
  - `PRESETS` (gtm, gtag, youtube, vimeo, google-maps);
  - `TRACKER_ORIGINS`, `ADS_CMP_SIGNATURES`;
  - the `DEFAULT_*` blocks.
- **Typedefs:** `KissConsent`, `KissConsentInput`, `ConsentService`, `ConsentStored`, `BuildConsent`, `PageConsentFacts`.

## Depends on

`node:crypto` (sha256), nothing in `lib/`.

## Depended on by

- `lib/config.js` (`resolveConfig`).
- `lib/consent-ui.js` (the resolved shape it renders; `clientConfig` feeds `lib/consent-client.js`'s `consentHeadScript`).
- Planned on this branch (contract §9): `lib/consent-gate.js`, `lib/handlebars-helpers.js`, `lib/audit.js` and `lib/build-finish.js`.
- `test/unit/consent.test.js`.

## Non-obvious behavior

- **The version hashes purposes, not presentation.** `purposesVersion` takes a canonical JSON of:
  - each category in use with its mode;
  - each non-necessary service, sorted by name, as name, category, provider and sorted origins.

  It excludes wording, theme, logo, position, cookie settings, the endpoint, the cookie and storage lists, and placeholder values. So a colour change, a different GTM id, or a kiss upgrade that names one more cookie in a preset asks nobody again (the ICO says not to ask repeatedly). A new service, a new third-party origin, or a category changing mode asks everyone (the ICO says to ask again when purposes change). A hand-set `version` overrides it, and the report records both.

- **`gtm` defaults to `marketing`.** Consent Mode governs Google's own tags only. In diploma-msc's real container, a statistics-only grant loaded Bing UET, ActiveCampaign and OpenAI scripts (contract Appendix A, S1b, measured 2026-11-03). Under `marketing`, GTM loads only when marketing is granted. A site whose container gives every other tag a consent check may set `category: 'statistics'`.
- **Only `statistics` may be `objection`** (UK PECR Schedule A1 para 5). A `google: true` service in an objection category is refused, for two reasons:
  - Google Analytics and Ads are not within the statistics exception;
  - an objection category grants its Consent Mode types in the `default`, and every Google tag on the page reads those.
- **The Consent Mode map is rebased onto what the site offers** (`offeredMap`). The types of every category not in use go to the category that holds the site's Google tags, the most restrictive one when they span several. With no Google tag, the map is left alone.
  - **Why:** the diploma-msc trial (2026-11-03) measured `gcs=G110` after Accept all. `gtm` was its only Google tag and sat in marketing, no statistics category was offered, so `analytics_storage` was never granted. After the rule it measured `G111`.
  - **Where it shows:** `resolved.google.map` is the rebased map, and `consentModeDefault`, `clientConfig` and the client all read it.
- **A site's `cookies` and `storage` add to a preset's,** as `origins` do; an entry with a preset entry's name replaces it in place (`mergeStored`). Until slice 6's documentation found the two rules disagreed, a site's list replaced the preset's, and a `gtm` that declared `_fbp` silently dropped `_ga`.
- **First- and third-party storage.** A stored item (a cookie, or a `localStorage` key under `storage`) with a `domain` is third-party unless `party: 'first'` says otherwise. `clientConfig` hands the browser first-party names only, because a page can delete nothing else. The presets' YouTube storage and Vimeo cookies are third-party: listed in the cookie table, never deleted.
- **A service may not take a category's name.** `kissConsent.has()` and `when()` take a category or a service by one name and answer for the category first, so a service named `necessary` would have run before any choice (found by the Codex review, 2026-11-03).
- **A required placeholder is a render error, not a config error.** A preset needs `{id}`, but the value may come from the helper's hash per page (`{{consentScript "gtm" id=gtmId}}`, as diploma-msc passes it), so `resolveConsent` cannot know it is missing. `fill` throws when it is.
- **`consentReport` holds no timestamp,** so `last-build.json` stays byte-identical across identical builds. The time a banner version was first shown is the commit time of the `kiss-ssg aikb` record that first holds its hash.
- **Theme values refuse `;`, `{`, `}`, `<` and `>`,** so a site's colour cannot end the declaration or the `<style>` element it is written into.
