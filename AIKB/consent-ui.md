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
- **`bannerHtml(resolved, { logoUrl, policyUrl })`** → `<div class="kiss-consent" data-kiss-consent-root data-position="…" role="region" aria-label="{title}">`, the full-width bar. Inside it, `<div class="kiss-consent__inner">` is the centred column (max 72rem) holding:
  - the logo (`<img alt="">`), only with `logoUrl`;
  - the `h2` title and the body text;
  - the policy link, only with `policyUrl`;
  - Accept all, Reject all and Choose cookies (`data-kiss-consent-action` `accept`, `reject`, `settings`), all `class="kiss-consent__button"`;
  - the ✕ (`class="kiss-consent__close"`, `action="close"`, `aria-label="{close}"`) at the column's corner.
- **`settingsHtml(resolved, { policyUrl })`** → the `<dialog class="kiss-consent-dialog">`, in three parts:
  - **`__head`:** its `h2` (`id="kiss-consent-dialog-title"`) and a ✕ (`close-dialog`).
  - **`__body`:** the policy link, then one `__category` per category: the `necessary` one first, then each in `inUse`. Each has a `__row` holding a `<label for>` and a **switch**, then the description. A switch is `<input type="checkbox" role="switch" class="kiss-consent-switch" id="…">`: `disabled checked` for `necessary`, and `data-kiss-consent-category="…"` otherwise. Under a category, a hidden `__grant` row with a `data-kiss-consent-service` switch for each of its services that has an `embed`.
  - **`__foot`:** Reject all, Accept all and Save choices, the three choices together and alike.
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
- **The switches carry no `checked`** (except `necessary`'s). The client sets each from the stored choice, and from an `objection` category's default, so the markup is the same for every visitor and the banner hash does not depend on state.
- **The grant toggles are hidden in the markup.** The client unhides the one for a service with an "always allow" grant, so a grant can be withdrawn where it is shown.
- **The table always starts with kiss's own two cookies:** `cookie.name` (`{days} days`) and `<cookie.name>_closed` (Session; `kiss_consent_closed` by default, the name `lib/consent-client.js` derives), both first-party. A service that stores nothing gets one row with `—` for name, kind, duration and party, so every declared service is listed. Services are in name order; a stored item with no description takes its service's.
- **What the client does instead.** The confirmation after a choice and the bottom banner's `scroll-padding-bottom` are the client's (contract §3). The CSS styles `[data-kiss-consent-confirmation]` by the `data-position` the client copies onto it.
- **A top banner is `position:relative`, not `static`.** It stays in the flow as the contract says, and anchors the absolutely placed close button. A bottom banner is fixed, `z-index:2147483000`, `max-height:80vh` and scrolls.
- **The look was restyled on 2026-11-03,** when the operator judged diploma-msc's Cookiebot banner better looking. The changes:
  - a centred inner column on the full-width bar, with a shadow and a top border;
  - quieter body text, mixed from the theme's own `text` and `background` (`color-mix`), so dark schemes follow with no third colour;
  - full-width stacked choices under 40rem;
  - a dialog with a header, divided rows, real switches and a footer;
  - a calmer embed notice.

  Two things were deliberately not taken from Cookiebot: its filled "Allow all" beside an outlined "Deny" (the ICO calls unequal buttons nudging), and its category switches on the first layer (the operator kept them in the dialog). The CSS is about 6.7 kB, under a 7,168-byte ceiling in the test; it was 4 kB before.

- **The switches are styled checkboxes**, so the client reads and sets `.checked` as before, and assistive technology announces them as switches (`role="switch"`, each with a `<label for>`). Off and on differ in colour (the softened text colour against the accent) and in where the knob sits.
- **The CSS takes theme values verbatim.** `resolveConsent` has already refused `;`, `{`, `}`, `<` and `>` in them, so no value can end a declaration or the `<style>`. The CSS has no `!important`, `@import` or `url(`, and switches transitions and animations off under `prefers-reduced-motion`.
