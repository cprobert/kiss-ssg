# consent-client.js

## Responsibility

The consent manager's browser side. One function, `kissConsentClient(win, cfg)`, is inlined into every page by `{{consentHead}}`. On the page it:

- sets the Google Consent Mode default and restores a stored choice;
- clears what denied services left behind;
- mounts the banner;
- answers its buttons;
- writes the choice cookie;
- starts allowed scripts in document order;
- reveals allowed embeds;
- withdraws a choice;
- logs each choice to the site's endpoint;
- gives site code `window.kissConsent`.

The contract is `planning/plans/2026-11-02-consent-manager.md` §3–§5. Every behavioural choice was first measured in Chromium (its Appendix A).

## Public interface

- **`consentHeadScript(cfg)` → `string`.** It returns `<script data-kiss-consent-head>(<the client>)(window,<cfg JSON>)</script>`, where `cfg` is `clientConfig()` from `lib/consent.js`. The JSON escapes `<` as `<` and U+2028/U+2029, so no site text can end the script.
- **`kissConsentClient`** is exported for the tests.
- **In the browser, `window.kissConsent`:**
  - `has(name)`: `necessary` is always true. A category is true when it is granted. A service is true when its category is granted or it has an "always allow" grant.
  - `choice`: `null`, or a frozen `{ id, version, at, categories, services }`.
  - `show()`: opens the settings dialog.
  - `when(name, fn)`: runs `fn` now if `name` is granted, otherwise once on the change that grants it.
  - `on('ready' | 'change', fn)`: `ready` replays to a listener added after it fired.
  - `mount()`: called by `{{consentBanner}}`'s inline script.
- **DOM events on `document`:** `kiss-consent:ready` (detail `{ choice }`) and `kiss-consent:change` (detail `{ choice, granted, revoked }`).
- **`dataLayer`:** each change also pushes `{ event: 'kiss_consent', kiss_consent: { <category>: bool } }`.
- **Actions** are read by delegation from `data-kiss-consent-action`: `accept`, `reject`, `settings`, `save`, `close`, `close-dialog`, `hide`, `load`, `allow`.

## Depends on

Nothing: it runs in the browser, on `window` alone. `consentHeadScript` serialises what `lib/consent.js`'s `clientConfig` built.

## Depended on by

`lib/handlebars-helpers.js` (`{{consentHead}}`, slice 2b). `test/unit/consent-client.test.js` runs the script in Node's `vm` against a domino DOM with a fake cookie jar, clock, storage and beacon, both as rendered and terser-minified. `test/browser/consent.test.js` runs it in Chromium on built sites (`test/helpers/consent-site.js`), with every off-host request stubbed. It covers: before a choice, Reject, Accept, a returning visitor, document order, statistics only, withdrawal, a version bump, Close, an embed, focus under the bar, no JavaScript, the endpoint, an override partial, and the top position.

## Non-obvious behavior

- **Order in the head.** The client runs these steps in order:
  1. the `dataLayer` and `gtag` stub (it never replaces an existing `gtag`);
  2. `gtag('consent', 'default', …)`;
  3. the two `set` calls;
  4. a synchronous cookie read;
  5. clearing denied services' first-party cookies and storage;
  6. `gtag('consent', 'update', …)` when a valid choice is stored.

  That is all before any other script, which the wiring check enforces.

- **A stored choice is valid only when all of these hold:**
  - the format is `1` and the version matches;
  - it holds a category answer `c`;
  - it is younger than `cookie.days`.

  An "always allow" grant made before the banner was answered is stored with `c: null`. It is honoured, but the banner still asks. A version mismatch ignores the grants too.

- **The activation queue is serial.**
  - **Why:** S2 measured inline and module scripts running before an earlier external when everything was inserted at once.
  - **How it runs:** each gated script is replaced by a live clone in document order. An external one holds the queue until `load` or `error`, or a 10-second timer. A `data-async` one never holds it.
  - **No double runs:** the original is replaced, and queued elements are marked, so no later pass revives one twice.
  - **When:**
    - at `DOMContentLoaded` for the stored choice or an `objection` category;
    - on the click for a new grant.
  - **What scripts miss:** revived scripts never see `DOMContentLoaded` (`AIKB/upstream.md`).
- **Withdrawal reloads.** A choice that refuses a category active on this page, or a service whose embed was revealed, takes the withdrawal path:
  1. write the cookie, send the `update` and the POST;
  2. delete the first-party cookies and storage of every denied service, on no domain, the host and each parent domain (S7);
  3. `location.reload()`, because a script that ran cannot be un-run.

  "Reject all" denies `objection` categories too, so it withdraws one that started at load. Every load also repeats the deletion in the head, which catches a cookie rewritten on `pagehide` before the reload, and a withdrawal made in another tab.

- **Denying a category clears its "always allow" grants,** but only on the change from granted to denied. A grant made later, while the category stays denied, stands until the dialog's grant checkbox removes it.
- **Close is not consent.** It sets `<cookie.name>_closed=1` with no `Max-Age` (a session cookie) and removes the banner. Nothing else is written, so the banner returns in the next browser session.
- **The visitor id exists only with an endpoint.** `id` is written to the cookie and sent only when `cfg.endpoint` is set: `crypto.randomUUID()`, else `getRandomValues` hex. The POST is `navigator.sendBeacon` with a `text/plain` Blob (it survived an immediate reload, S6), falling back to `fetch` with `keepalive` and `mode: 'no-cors'`. A failure never blocks the choice.
- **The client renders the confirmation itself** (`role="status"`, `tabindex="-1"`, focused, with a Hide button). An override partial therefore needs none.
- **A bottom-positioned banner or confirmation keeps the page reachable under it** (WCAG 2.2 SC 2.4.11). All three measures are measured by `test/browser/consent.test.js`, which was red before them:
  - **A spacer at the end of `<body>`:** `[data-kiss-consent-spacer]`, `aria-hidden`, the bar's height. It is moved to the end again at `DOMContentLoaded`, because it is placed while the page is still parsing. Without it the page's last content, the footer's Cookie settings control included, could never scroll clear of the bar, and a click on it failed.
  - **`scroll-padding-bottom` on `<html>`**, for scrolling to a fragment.
  - **A `focusin` check** that scrolls a focused element clear of the bar. Chromium does not scroll an element that is inside the viewport but under the bar when focus moves to it, so `scroll-padding` alone left links hidden under the banner.

  All three follow the bar's height through `ResizeObserver`, and are removed with the bar.

- **The dialog** is cloned from its template on first open, gets `data-kiss-consent-dialog`, and opens with `showModal()` (falling back to `open`). Its checkboxes are set from the current state each time it opens.
- **Size, inlined on every page:** 10,932 bytes minified, 4,047 gzipped, for a gtm + youtube + vimeo site (measured 2026-11-03; the contract had estimated 5–7 kB). `test/unit/consent-client.test.js` holds it under 12,000 bytes; raising that ceiling is a decision, not a fix.
- **Written in ES5 style (`var`, `function`)**, except optional `catch` bindings (ES2019), so the inlined source runs on the browsers a static site serves with no transpile step. It is minified with the page in production.
