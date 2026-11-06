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

It writes no markup and runs nothing in a browser. The gated tags are `lib/consent-gate.js`'s job, an embed `lib/embed.js`'s, the default banner `lib/consent-ui.js`'s, and the page's own behaviour `lib/consent-client.js`'s. The contract is `planning/plans/2026-11-02-consent-manager.md`.

## Public interface

- **`resolveConsent(input)` → `KissConsent | null`.** `config.consent`, resolved and checked; `undefined`, `null` and `false` give `null`. `lib/config.js`'s `resolveConfig` calls it for `config.consent`.
  - **Unknown keys:** every level refuses them, naming the valid keys. The exception is a service's own extra keys, which are placeholder values (`gtm: { id: 'GTM-X' }`) and must be strings or numbers.
  - **The consent log's name is kiss's:** a service whose cookies or storage name `<cookie.name>_log` exactly is refused (D8 of `planning/specs/2026-11-03-kiss-consent.md`), because it would be listed as that service's and deleted with it. A pattern that matches it is allowed; the client never deletes the log.
  - **The resolved block:** `{ version, categories, inUse, services, cookie, google, endpoint, ui }`. `ui` is `{ position, logo, partial, policy, history, text, theme }`: `policy` (default `'cookies'`) and `history` (default `null`, the page with `{{consentRecord}}`) are page ids or `null`, and `text` holds the banner's, the dialog's, the embed's and the history page's (`history…`) wording.
- **`categoriesInUse(resolved)`** → the categories at least one service belongs to, `necessary` aside, in `CATEGORY_NAMES` order. Decided once per site (`inUse`), so every page offers the same set.
- **`purposesVersion(resolved)`** → 12 hex characters. The default `version`; see Non-obvious behavior.
- **`serviceParams(service, hash)`**, **`fill(template, params, where)`** and **`fillScript(template, params, where)`.** Placeholder values come from the helper's hash over the service's own. `fill` is for a URL template (`src`, `embed.src`, `embed.watch`) and URL-encodes each value. `fillScript` is for a script body (a service's `inline`): it URL-encodes each value exactly as `fill` does, then writes every character of that result outside `[A-Za-z0-9_.-]` as a `\uXXXX` escape. Both run one shared placeholder loop (`fillWith`, private: the regex, the own-key check, the error), differing only in the encoder, so the placeholder syntax cannot drift between the two. Both throw `<where>: no value for {x}`, and both throw `URIError` on a value holding a lone surrogate, as `fill` always has.
- **`consentModeDefault(resolved)`** and **`consentModeState(granted, map)`** → the Consent Mode `default` and `update` arguments.
- **`textOf(html)`** and **`bannerHash(html)`** → the visible text, and 12 hex characters of its sha256.
- **`bannerRegistry({ consent, hashes, texts })`** → `consent-banners.json`'s contents, or `null` without a consent manager or without an `endpoint` (no server to read it): `{ format: 1, version, banners: [{ hash, text, categories: [{ key, label, description, mode }], services: [{ name, label, provider, category }] }] }` (`provider` because the ICO asks for every controller relying on the consent by name, and a label is not always one, 2026-11-04), one entry per distinct hash the written pages carry, sorted. `text` is the `textOf` the hash was taken from, so `sha256(text)` begins with the hash and a server can check it; `null` for a hash with no recorded text. Necessary services are left out, as they are of the dialog's choices.
- **`gatingOf(service, resolved)`** → how a service is emitted:
  - `'none'` for a `necessary` service, or a Google service under `google.mode: 'advanced'`;
  - `'embed'` for a service with an `embed`;
  - `'script'` otherwise.
- **`scriptKind(type, language)` → `'classic'|'module'|null`.** How a browser runs a `<script>` with those attributes, as Chromium 156 measured it (`AIKB/upstream.md`). The gate, the wiring check and the audit's inline-script reading all call it, so a type one of them lets through cannot be caught by another.
- **`clientConfig(resolved, { bannerHash })`** → the object `{{consentHead}}` inlines. It carries no URL: the policy link and the logo are in the banner's markup, and the `logoUrl`/`policyUrl` it once carried were read by nothing in the client (removed 2026-11-03). It carries only what the client acts on: the version, the cookie settings, categories, every service with its first-party cookie and storage names (a `necessary` one too: `has()` and `when()` answer for it, it is never refused so its names are never deleted, and a refused service declaring the same name keeps it), the Google block with its computed defaults, the endpoint, the position and two strings.
- **`consentReport({ consent, pages, real, gatedPages })`** → the report's `consent` key, or `null` without a consent manager.
- **`originOf(url)`** and **`matchesHost(url, list)`** → URL helpers for the audit.
- **Frozen tables:**
  - `CATEGORY_NAMES`, `CONSENT_TYPES`;
  - `PRESETS` (gtm, gtag, youtube, vimeo, google-maps, instagram, soundcloud; soundcloud's origins measured 2026-11-04, nothing stored logged out);
  - `STORAGE_KINDS` (a storage item's `kind`, as the cookie table names it);
  - `TRACKER_ORIGINS`, `ADS_CMP_SIGNATURES`;
  - the `DEFAULT_*` blocks.
- **`presetService(name)`** → `ConsentService | null`, a preset resolved alone (below).
- **Typedefs:** `KissConsent`, `KissConsentInput`, `ConsentService`, `ConsentEmbed`, `ConsentStored`, `BuildConsent`, `PageConsentFacts`.

## Depends on

`node:crypto` (sha256), nothing in `lib/`.

## Depended on by

- `lib/config.js` (`resolveConfig`).
- `lib/consent-ui.js` (the resolved shape it renders, and `STORAGE_KINDS`; `clientConfig` feeds `lib/consent-client.js`'s `consentHeadScript`).
- `lib/consent-gate.js` (`fill`, `fillScript`, `gatingOf`, `scriptKind`), `lib/embed.js` (`PRESETS`, `fill`, `gatingOf`, `presetService`), `lib/handlebars-helpers.js`, `lib/audit.js` and `lib/build-finish.js`.
- `test/unit/consent.test.js`, `test/unit/embed.test.js`.

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
- **A preset's provider is part of `version`.** On 2026-11-04 the `youtube` preset's provider became Google (the operator: "YouTube is Google"). The provider names the controller relying on the consent, so the change moved the purposes version of every site using the preset, and their visitors are asked again on upgrade. That is the rule working as written above, not a side effect. The changelog's upgrade note says so. The same day, the embed wording's defaults moved from `{provider}` to `{service}` (the label) for its two buttons, so a YouTube embed does not offer "Always allow Google" for a grant of YouTube alone. `servicesLabel` names the dialog's service lists. A service's `policy` became an href that day, so `policyUrl` accepts only an absolute http(s) URL or null, and fails the build on anything else (a page id, `javascript:`, a bare host). It is not part of `version`.
- **First- and third-party storage.** A stored item (a cookie, or an item under `storage`) with a `domain` is third-party unless `party: 'first'` says otherwise. `clientConfig` hands the browser first-party names only, because a page can delete nothing else. The presets' YouTube storage and Vimeo cookies are third-party: listed in the cookie table, never deleted.
- **A storage item has a `kind`:** `local` (the default), `session` or `indexeddb`; a cookie's is `cookie`, and `kind` on a cookie entry is refused. The cookie table names it (`STORAGE_KINDS`: Local storage, Session storage, IndexedDB), and `clientConfig` sends only first-party `local` names, since the client deletes `localStorage` keys and nothing else. Added 2026-11-04 with the YouTube preset's IndexedDB database `YtIdbMeta`: before it, every storage item was labelled "Local storage", which would have put a false row in every YouTube site's table. `kind` is not part of `version`.
- **`embed.video`** (a flag, `false` by default; `true` on the `youtube` and `vimeo` presets) marks a video player. `lib/embed.js` reads it to put a play mark on a postered Load button, to label the button with `embedPlay` rather than `embedLoad`, and to mark the box for autoplay on Load.
- **`DEFAULT_TEXT.embedPlay` ("Play video") and `embedWording(text, own)`.** A video's button has its own key. `embedWording` makes it follow a site's `embedLoad` when the site set that and not `embedPlay`, so a site that translated `embedLoad` before 2.13.0 does not gain an English word on its videos. `resolveUi` applies it to `ui.text`, and `lib/embed.js` `resolveEmbeds` to `embeds.text`. It is not in the banner hash, which is taken over the banner's and dialog's rendered HTML only (`bannerHash`), so a new text key changes no site's records.
- **An embed's frame sizing is config** (`embed.ratio`, `width`, `height`, `measure`), resolved here and written by `lib/embed.js` (`AIKB/embed.md`). `ratio` defaults to `'16/9'`; `null` means the frame's content decides its height, starting at `height` (600 px when unset), and `measure: true` follows the height the frame reports. The `instagram` preset is the one that uses them (2026-11-04).
- **`presetService(name)`** resolves a preset alone, as a service with no site settings: what `{{embed}}` loads with no `config.consent`. `null` for a name with no preset.
- **A service may not take a category's name.** `kissConsent.has()` and `when()` take a category or a service by one name and answer for the category first, so a service named `necessary` would have run before any choice (found by the Codex review, 2026-11-03).
- **A required placeholder is a render error, not a config error.** A preset needs `{id}`, but the value may come from the helper's hash per page (`{{consentScript "gtm" id=gtmId}}`, as diploma-msc passes it), so `resolveConsent` cannot know it is missing. `fill` throws when it is.
- **A placeholder in a script body is string content, not a URL** (security hardening, 2026-11-06). `inline` once went through `fill`, and `encodeURIComponent` leaves `'`, `(` and `)` alone, so the `gtag` preset's `window.gtag('config','{id}')` with an id of `G-X'-alert(1)-'` closed the string and called `alert`. `fillScript` URL-encodes the value as `fill` does, then writes every character of the result outside `[A-Za-z0-9_.-]` as `\uXXXX`; after URL-encoding those are only `%` and the six characters `encodeURIComponent` leaves alone, `'`, `(`, `)`, `!`, `~` and `*`. Inside any string literal the script reads `encodeURIComponent(value)`, exactly what it read when `inline` went through `fill` (the unit tests evaluate the emitted script and compare the value, for a quote, a backtick, `\`, a newline, `</script>`, U+2028 and a non-BMP character). **The URL-encoding is kept on purpose.** The first version of this fix wrote the raw value, escaped; that closed the breakout and opened another hole, because a site's `inline` that puts a placeholder inside a URL or an HTML string (`new Image().src='https://t.example/p?site={site}'`, `el.innerHTML='<a href="/x?id={site}">x</a>'`) had been getting an encoded, inert value and then got the raw one (the code review measured an injection through `innerHTML`). Unit tests evaluate both cases: the URL keeps one parameter, the HTML string holds no `<`, `>` or `"` from the value. Outside a literal a value cannot close one, call a function or end the `<script>` element, but it is still read as code: a value made only of safe characters (`x--`, a variable's name) is an expression. An id of letters, digits, `_`, `-` and `.` is written byte for byte as `fill` wrote it (`G-ABC123`, `AW-123`, `1234567890`, `0.5`, measured against `main`'s `fill`). **The dot is kept on purpose:** a site's own `inline` may hold a number outside quotes (`window.r={rate};` with `0.5`), which worked under `fill`; escaping the dot would make it a syntax error only a browser reports. An unquoted placeholder holding any other character than `! ~ * ' ( )` was already broken under URL-encoding (`%3A` is not JavaScript). One holding one of those six was not: `encodeURIComponent` passed them through, so `window.q={q};` with `init()` called `init` (measured on `main`). That was code injection, and it is now a syntax error in the browser, on purpose: a placeholder is data, never code. A value holding `document.write(` is inert now, so `findDocumentWrite` no longer trips on it, and is right not to. The page minifier (terser, under `minifyJS`) rewrites an ungated inline script; a unit test runs the hostile value through `html-minifier-terser` with `minifyJS` and still reads it back intact.
- **`consentReport` holds no timestamp,** so `last-build.json` stays byte-identical across identical builds. The time a banner version was first shown is the commit time of the `kiss-ssg aikb` record that first holds its hash.
- **Theme values refuse `;`, `{`, `}`, `<` and `>`,** so a site's colour cannot end the declaration or the `<style>` element it is written into.
