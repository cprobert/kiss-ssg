# consent-ui.js

## Responsibility

The consent manager's default presentation, as pure string functions over the resolved `config.consent` (`KissConsent`, `lib/consent.js`):

- the banner `{{consentBanner}}` puts in its template when the site has no override partial;
- the settings dialog;
- the cookie declaration `{{consentTable}}` writes;
- the control `{{consentSettings}}` writes;
- the theme CSS `{{consentHead}}` inlines.

No Handlebars and no browser. The markup speaks the attribute vocabulary of contract §3 (`planning/plans/2026-11-02-consent-manager.md`), which `lib/consent-client.js` acts on.

## Public interface

- **`escapeHtml(s)`** → `s` with `&`, `<`, `>`, `"` and `'` escaped. Every interpolated string in this module goes through it.
- **`bannerHtml(resolved, { logoUrl, policyUrl })`** → `<div class="kiss-consent" data-kiss-consent-root data-position="…" role="region" aria-label="{title}">` holding:
  - the logo (`<img alt="">`), only with `logoUrl`;
  - the `h2` title and the body text;
  - the policy link, only with `policyUrl`;
  - Accept all, Reject all and Choose cookies (`data-kiss-consent-action` `accept`, `reject`, `settings`), all `class="kiss-consent__button"`;
  - a close button (`action="close"`, `aria-label="{close}"`).
- **`settingsHtml(resolved, { policyUrl })`** → the `<dialog class="kiss-consent-dialog">`:
  - its `h2` (`id="kiss-consent-dialog-title"`) and the policy link;
  - Reject all and Accept all;
  - a `necessary` fieldset, its checkbox `disabled checked`;
  - a fieldset per category in `inUse`, with `<input type="checkbox" data-kiss-consent-category="…">`;
  - under each, a hidden `data-kiss-consent-grant` label with a `data-kiss-consent-service` checkbox for each of its services that has an `embed`;
  - Save (`save`) and Close (`close-dialog`).
- **`tableHtml(resolved)`** → one `<table class="kiss-consent-table">` for `necessary`, then one per category in `inUse`. Columns: Service, Provider, Purpose, Name, Kind (Cookie / Local storage), Duration, Party (First / Third).
- **`settingsControlHtml(resolved)`** → `<button type="button" class="kiss-consent-settings" data-kiss-consent-action="settings">`.
- **`themeCss(ui)`** → the CSS, or `''` under `ui.theme: false`.

## Depends on

`lib/consent.js`, for types only.

## Depended on by

- Planned on this branch (contract §9): `lib/handlebars-helpers.js` (the `consentHead`, `consentBanner`, `consentSettings` and `consentTable` helpers).
- `test/unit/consent-ui.test.js`.

## Non-obvious behavior

- **Nothing to ask, nothing rendered.** With no category in use, `bannerHtml` and `settingsHtml` return `''`. `tableHtml` still writes the `necessary` table, because kiss's own cookie is set either way.
- **Equal weight is structural.** Accept, Reject and Choose share one class and the CSS has one rule for it, with no primary variant (the ICO: "equally prominent"). A test pins both.
- **The checkboxes carry no `checked`.** The client sets each from the stored choice, and from an `objection` category's default, so the markup is the same for every visitor and the banner hash does not depend on state.
- **The grant toggles are hidden in the markup.** The client unhides the one for a service with an "always allow" grant, so a grant can be withdrawn where it is shown.
- **The table always starts with kiss's own two cookies:** `cookie.name` (`{days} days`) and `<cookie.name>_closed` (Session; `kiss_consent_closed` by default, the name `lib/consent-client.js` derives), both first-party. A service that stores nothing gets one row with `—` for name, kind, duration and party, so every declared service is listed. Services are in name order; a stored item with no description takes its service's.
- **What the client does instead.** The confirmation after a choice and the bottom banner's `scroll-padding-bottom` are the client's (contract §3). The CSS styles `[data-kiss-consent-confirmation]` by the `data-position` the client copies onto it.
- **A top banner is `position:relative`, not `static`.** It stays in the flow as the contract says, and anchors the absolutely placed close button. A bottom banner is fixed, `z-index:2147483000`, `max-height:80vh` and scrolls.
- **The CSS takes theme values verbatim.** `resolveConsent` has already refused `;`, `{`, `}`, `<` and `>` in them, so no value can end a declaration or the `<style>`. The CSS has no `!important`, `@import` or `url(`, and switches transitions and animations off under `prefers-reduced-motion`.
