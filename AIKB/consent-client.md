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
  1. write the cookie, send the `update` and the POST;
  2. delete the first-party cookies and storage of every denied service, on no domain, the host and each parent domain (S7). A `__Secure-` or `__Host-` cookie is deleted with `Secure`, which a browser requires, and a `__Host-` one on no domain only, since it cannot carry one (found by the Codex review, 2026-11-03);
  3. `location.reload()`, because a script that ran cannot be un-run.

  "Reject all" denies `objection` categories too, so it withdraws one that started at load. Every load also repeats the deletion in the head, which catches a cookie rewritten on `pagehide` before the reload, and a withdrawal made in another tab.

- **Reject all clears every "always allow" grant.** It commits with no grants at all, so a video allowed while marketing was refused stops with the rest, and a page showing it reloads.
- **Saving the dialog clears the grants of a category it changes from granted to denied.** A grant made while its category stays denied survives a Save, because the dialog shows that grant's own switch and the visitor left it on. Before 2026-11-03 Reject all went through this same rule and so kept such a grant (found by the Codex review).
- **Close is not consent.** It sets `<cookie.name>_closed=1` with no `Max-Age` (a session cookie) and removes the banner. Nothing else is written, so the banner returns in the next browser session.
- **The visitor id exists only with an endpoint.** `id` is written to the cookie and sent only when `cfg.endpoint` is set: `crypto.randomUUID()`, else `getRandomValues` hex. The POST is `navigator.sendBeacon` with a `text/plain` Blob (it survived an immediate reload, S6), falling back to `fetch` with `keepalive` and `mode: 'no-cors'`. A failure never blocks the choice.
- **The client renders the confirmation itself** (`role="status"`, `tabindex="-1"`, focused, with a Hide button). An override partial therefore needs none.
- **A bottom-positioned banner or confirmation keeps the page reachable under it** (WCAG 2.2 SC 2.4.11). All three measures are measured by `test/browser/consent.test.js`, which was red before them:
  - **A spacer at the end of `<body>`:** `[data-kiss-consent-spacer]`, `aria-hidden`, the bar's height. It is moved to the end again at `DOMContentLoaded`, because it is placed while the page is still parsing. Without it the page's last content, the footer's Cookie settings control included, could never scroll clear of the bar, and a click on it failed.
  - **`scroll-padding-bottom` on `<html>`**, for scrolling to a fragment.
  - **A `focusin` check** that scrolls a focused element clear of the bar. Chromium does not scroll an element that is inside the viewport but under the bar when focus moves to it, so `scroll-padding` alone left links hidden under the banner.

  All three follow the bar's height through `ResizeObserver`, and are removed with the bar. They apply only while the bar's computed `position` is `fixed`. A site's own banner partial may sit in the flow whatever `ui.position` says, and then nothing is added (the browser suite checks the override partial gets no spacer).

- **The dialog** is cloned from its template on first open, gets `data-kiss-consent-dialog`, and opens with `showModal()` (falling back to `open`). Its switches (styled checkboxes) are set from the current state each time it opens.
- **Size, inlined on every page:** 12,048 bytes minified, 4,427 gzipped, for a gtm + youtube + vimeo site (measured 2026-11-03, after the Codex review fixes; 10,932 when first measured, and the contract had estimated 5–7 kB). `test/unit/consent-client.test.js` holds it under 12,288 bytes, raised from 12,000 by the operator the same day; raising that ceiling is a decision, not a fix.
- **Written in ES5 style (`var`, `function`)**, except optional `catch` bindings (ES2019), so the inlined source runs on the browsers a static site serves with no transpile step. It is minified with the page in production.
