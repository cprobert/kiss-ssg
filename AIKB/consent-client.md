# consent-client.js

## Responsibility

The consent manager's browser side, in two parts that share one object, `window.__kissConsent` (spec `planning/specs/2026-11-03-kiss-consent.md`, "the inline part and the cached file"):

- **`kissConsentHead(win, cfg)`**, inlined into every page by `{{consentHead}}` with the site's config. It sets the Google Consent Mode default (and the `update` for a stored choice), reads the stored choice, answers `has()` and `choice`, mounts the banner before first paint with the bottom bar's padding, and puts a `window.kissConsent` stub in place that queues `show()`, `when()`, `on()` and any click on a consent control.
- **`kissConsentClient(win)`**, the rest, in one cached file every consent page loads with `defer` (`<build>/kiss-consent.<hash>.js`, written by `writeConsentClient` in `lib/build-finish.js`). It clears what denied services left behind, answers the buttons, writes the choice cookie, records each choice (the browser's own log, then the endpoint), starts allowed scripts in document order, reveals allowed embeds, withdraws a choice, replaces the stub with the full `window.kissConsent`, and replays what the stub queued.

The head part keeps the state (`stored`, `choice`, `grants`) and every function both parts need on the shared object, and the client reads and writes it there, so no rule is written twice.

The contract is `planning/plans/2026-11-02-consent-manager.md` §3–§5, and for the record format, the log and the id, `planning/specs/2026-11-03-kiss-consent.md` (D1, D8, D10, D13). Every behavioural choice was first measured in Chromium (its Appendix A).

## Public interface

- **`consentHeadScript(cfg, clientUrl)` → `string`.** It returns `<script data-kiss-consent-head>(<the head part>)(window,<cfg JSON>)</script><script src="<clientUrl>" defer data-kiss-consent-client></script>`, where `cfg` is `clientConfig()` from `lib/consent.js` and `clientUrl` is the cached file's URL as `consentUrl` writes it (the prefix rule). The JSON escapes `<` as `<` and U+2028/U+2029, so no site text can end the script.
- **`consentClientSource()` → `string`.** The cached file's source, `(<kissConsentClient>)(window);`. It holds no site config, so it is the same file for every site on one kiss version.
- **`consentClientName()` → `string`.** `kiss-consent.<10 hex of the source's sha256>.js`, memoised: it changes only when the client's code does, so the file can be cached for good.
- **`inlineJson(value)` → `string`.** That escaping, as a function, shared with `lib/consent-record.js` so the viewer's config cannot end its script either.
- **`kissConsentHead`** and **`kissConsentClient`** are exported for the tests.
- **In the browser, `window.kissConsent`:**
  - `has(name)`: `necessary` is always true, and so is a `necessary` service. A category is true when it is granted. Any other service is true when its category is granted or it has an "always allow" grant. Only own properties answer, so `constructor` and the rest of `Object.prototype` never do.
  - `choice`: `null`, or a frozen `{ id, version, at, categories, services }`.
  - `show()`: opens the settings dialog.
  - `when(name, fn)`: runs `fn` now if `name` is granted, otherwise once on the change that grants it.
  - `on('ready' | 'change', fn)`: `ready` replays to a listener added after it fired.
  - `mount()`: called by `{{consentBanner}}`'s inline script.
- **DOM events on `document`:** `kiss-consent:ready` (detail `{ choice }`) and `kiss-consent:change` (detail `{ choice, granted, revoked }`).
- **`dataLayer`:** each change also pushes `{ event: 'kiss_consent', kiss_consent: { <category>: bool } }`.
- **Actions** are read by delegation from `data-kiss-consent-action`: `accept`, `reject`, `settings`, `save`, `close`, `close-dialog`, `hide`, `load`, `allow`.

## Depends on

In the browser, nothing but `window`. In Node, `node:crypto` (`consentClientName`). `consentHeadScript` serialises what `lib/consent.js`'s `clientConfig` built.

## Depended on by

`lib/handlebars-helpers.js` (`{{consentHead}}`, `consentClientName`), `lib/build-finish.js` (`writeConsentClient`: `consentClientName`, `consentClientSource`). `test/unit/consent-client.test.js` runs the head part then the client in Node's `vm` against a domino DOM with a fake cookie jar, clock, storage and beacon, both as rendered and terser-minified, and runs them apart for the stub's queue, the fail-closed case and a second copy of either. `test/browser/consent.test.js` runs it in Chromium on built sites (`test/helpers/consent-site.js`), with every off-host request stubbed. It covers: before a choice, Reject, Accept, a returning visitor, document order, statistics only, withdrawal, a version bump, Close, an embed, focus under the bar, no JavaScript, the endpoint, the log across a withdrawal's reload, a cached file held back (the banner shows first, an early Accept takes effect when the file arrives), an override partial, and the top position.

## Non-obvious behavior

- **Order in the head.** The inline part runs these steps in order:
  1. the `dataLayer` and `gtag` stub (it never replaces an existing `gtag`);
  2. `gtag('consent', 'default', …)`;
  3. the two `set` calls;
  4. a synchronous cookie read;
  5. `gtag('consent', 'update', …)` when a valid choice is stored.

  That is all before any other script, which the wiring check enforces. Clearing denied services' first-party cookies and storage moved to the cached file's start at the split (2026-11-03): nothing gated runs until that file has started, so it still runs before anything it protects.

- **The stub and the replay.** Before the cached file starts, `window.kissConsent.has()` and `.choice` answer from the shared state; `show()`, `when()` and `on()` are queued; a click on a `data-kiss-consent-action` control is queued by a listener that stops at `S.ready`. The client sets `S.ready` first and installs its own listener. `start()` then applies what was queued **before anything starts**: the queued `on()` listeners (which start nothing), then the queued clicks, so every choice the visitor made holds; only then the first activation, `ready`, and the queued `when()` and `show()`, which can start or show something. Replaying after the activation let a Reject queued during the download run an `objection` category's script first, and reload to withdraw it (Codex round 2, P1, reproduced in Chromium and red in the unit and browser tests on that order). A unit test with the replay removed fails. **`window.kissConsent` is one object for the page's life**: the client puts its API on `S.api` and never replaces the global, and the stub's `show`, `when` and `on` hand each call to `S.api` once it is set. Replacing the global stranded a script that had kept the object or a method from before the file arrived: its calls were queued after the queue was drained (Codex round 3, P2). **If the file never arrives** (blocked, offline), the banner shows and nothing is written or started: it fails closed. Each part guards against running twice (`win.kissConsent` for the head, `S.ready` for the client).

- **A stored record counts only when all of these hold,** decided once for the category choice and the "always allow" grants alike:
  - the format is `1` and the version matches;
  - it is younger than `cookie.days`.

  The category choice also needs a category answer `c`. An "always allow" grant made before the banner was answered is stored with `c: null`: it is honoured while the record is current, but the banner still asks. An expired or old-version record honours neither. Until 2026-11-03 the grants were checked against the version only, so a site that shortened `cookie.days` left old grants working after their choice had expired (found by the Codex review).

- **The activation queue is serial.**
  - **Why:** S2 measured inline and module scripts running before an earlier external when everything was inserted at once.
  - **How it runs:** each gated script is replaced by a live clone in document order. An external one holds the queue until `load` or `error`, or a 10-second timer. An inline module holds it too: it fires no `load`, so kiss appends `;window["__kissConsentRan<n>"]()` as its last statement, and the call, `error` (a failed import) or the timer releases the queue. A module that throws before its end waits out the timer. A `data-async` one never holds it.
  - **No double runs:** the original is replaced, and queued elements are marked, so no later pass revives one twice.
  - **When:**
    - at `DOMContentLoaded` for the stored choice or an `objection` category;
    - on the click for a new grant.
  - **What scripts miss:** revived scripts never see `DOMContentLoaded` (`AIKB/upstream.md`).
- **Withdrawal reloads.** A choice that refuses a category active on this page, or a service this page started, takes the withdrawal path. A service counts as started when its embed was revealed, a gated script of it was revived, or a `when()` callback for it ran, each recorded by `started()`. Until 2026-11-03 only a revealed embed counted, so a service started under an "always allow" grant by `when()` or its own scripts, with its category refused, kept running after Reject all, and its cookies stayed (found by the Codex review):
  1. write the cookie, send the `update`, append to the log and send the POST;
  2. delete the first-party cookies and storage of every denied service, on no domain, the host and each parent domain (S7). A `__Secure-` or `__Host-` cookie is deleted with `Secure`, which a browser requires, and a `__Host-` one on no domain only, since it cannot carry one (found by the Codex review, 2026-11-03);
  3. `location.reload()`, because a script that ran cannot be un-run.

  "Reject all" denies `objection` categories too, so it withdraws one that started at load. Every load also repeats the deletion in the head, which catches a cookie rewritten on `pagehide` before the reload, and a withdrawal made in another tab.

- **A cookie or storage key an allowed service also declares is never deleted.** `gtag` and `gtm` both declare the Google cookies, so with statistics allowed and marketing refused, deleting gtm's `_ga` would reset gtag's visitor on every load. `keptBy()` checks every allowed service, necessary ones included, which is why `clientConfig` hands the client a necessary service's names too (round 5 of the Codex review, 2026-11-03).
- **Lookups by name read own properties only** (`own()`), so `constructor` or any other `Object.prototype` name never answers as a category, a service or a grant (round 5).
- **"Always allow" starts the service's gated scripts as well as its embeds** (`activate()` after the grant), as a category choice does (round 5).
- **Reject all clears every "always allow" grant.** It commits with no grants at all, so a video allowed while marketing was refused stops with the rest, and a page showing it reloads.
- **Saving the dialog clears the grants of a category it changes from granted to denied.** A grant made while its category stays denied survives a Save, because the dialog shows that grant's own switch and the visitor left it on. Before 2026-11-03 Reject all went through this same rule and so kept such a grant (found by the Codex review).
- **Close is not consent.** It sets `<cookie.name>_closed=1` with no `Max-Age` (a session cookie) and removes the banner. Nothing else is written, so the banner returns in the next browser session.
- **The visitor id is always made** (D1), at the first choice: `crypto.randomUUID()`, else `getRandomValues` hex, kept in the cookie and carried by every record. Until 2026-11-03 it was made only with an endpoint; the log and the history page need it either way. It leaves the browser only in a POST.
- **One record, two copies, the log first.** `logChoice(stored, action)` builds the format-2 record (`format`, `action`, then format 1's `id`, `version`, `timestamp`, `categories`, `services`, `bannerHash`, `page`), appends it to `localStorage[<cookie.name>_log]`, and then hands the same JSON to `post()`, so the browser's copy and the server's are identical (the Chromium suite compares them across a withdrawal's reload). `action` is `accept`, `reject`, `save` (from `commit()`) or `allow` (an embed's grant); Close, Load, the dialog and a page load record nothing. The log keeps the last 50; anything that is not a JSON array is started again; if storage throws on both tries, the choice stands unlogged (D10). The POST is `navigator.sendBeacon` with a `text/plain` Blob (it survived an immediate reload, S6), falling back to `fetch` with `keepalive` and `mode: 'no-cors'`. A failure never blocks the choice.
- **The log survives withdrawal** (D8). `clearServices()` skips `<cookie.name>_log` whatever a service's pattern matches (a `kiss_*` storage pattern took it before), and `resolveConsent` refuses a service that declares the name outright.
- **The client renders the confirmation itself** (`role="status"`, `tabindex="-1"`, focused, with a Hide button). An override partial therefore needs none.
- **A bottom-positioned banner or confirmation keeps the page reachable under it** (WCAG 2.2 SC 2.4.11). All three measures are measured by `test/browser/consent.test.js`, which was red before them:
  - **A spacer at the end of `<body>`:** `[data-kiss-consent-spacer]`, `aria-hidden`, the bar's height. It is moved to the end again at `DOMContentLoaded`, because it is placed while the page is still parsing. Without it the page's last content, the footer's Cookie settings control included, could never scroll clear of the bar, and a click on it failed.
  - **`scroll-padding-bottom` on `<html>`**, for scrolling to a fragment.
  - **A `focusin` check** that scrolls a focused element clear of the bar. Chromium does not scroll an element that is inside the viewport but under the bar when focus moves to it, so `scroll-padding` alone left links hidden under the banner.

  All three follow the bar's height through `ResizeObserver`, and are removed with the bar. They apply only while the bar's computed `position` is `fixed`. A site's own banner partial may sit in the flow whatever `ui.position` says, and then nothing is added (the browser suite checks the override partial gets no spacer).

- **A link in the dialog closes it**, the policy link and the history link alike, so a jump within the same page (the history page's own "See your consent history") does not leave the history behind the modal (Codex round 5, P2; red in the unit and Chromium tests). It closes on a `setTimeout(…, 0)` after the click, not during it: a link removed from the document during its own click is not followed.
- **The dialog** is cloned from its template on first open, gets `data-kiss-consent-dialog`, and opens with `showModal()` (falling back to `open`). Its switches (styled checkboxes) are set from the current state each time it opens.
- **Size.** Measured 2026-11-03 for a gtm + youtube + vimeo site, terser-minified. **Inline, on every page:** 4,839 bytes, 2,092 gzipped, the config included. **The cached file, once:** 8,939 bytes, 3,421 gzipped. Before the split the one inline script was 12,600 (4,618), under a 13,312 ceiling the operator had raised twice that day; 10,932 when first measured, where the contract had estimated 5–7 kB. `test/unit/consent-client.test.js` holds the inline part under 5,376 and the file under 9,728, about 10% over each measurement; raising one is a decision, not a fix. The inline part still needs `'unsafe-inline'` or a hash under a Content Security Policy; the file is `'self'`.
- **The cached file is minified by the pages' own minifier** (`html-minifier-terser` over `<script>…</script>`, `minifyJS`), so it needs no dependency of its own, and is unminified in dev as pages are. Its name hashes the unminified source, so the same code is the same name whatever minifies it.
- **Written in ES5 style (`var`, `function`)**, except optional `catch` bindings (ES2019), so the inlined source runs on the browsers a static site serves with no transpile step. It is minified with the page in production.
