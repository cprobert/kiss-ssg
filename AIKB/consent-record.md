# consent-record.js

## Responsibility

The visitor's consent history: what `{{consentRecord}}` writes on a site's privacy page. The build writes everything that does not depend on the visitor (the heading, what the history is, what each choice sends when the site has an endpoint, an empty table, and the states it can be in). A small script of its own, inlined after it, fills the table from `<cookie.name>_log`, the log `lib/consent-client.js` appends every choice to. The spec is `planning/specs/2026-11-03-kiss-consent.md` (D2–D7, D9, D10).

## Public interface

- **`RECORD_ID`**, `'kiss-consent-history'`: the section's `id`, which the settings dialog's `ui.history` link carries as its fragment, so a visitor lands on the history, not the top of a long privacy page (the clean room, 2026-11-03). The audit's `consent-history-missing` reports a `ui.history` page without the section.
- **`recordHtml(resolved)` → `string`.** `<section class="kiss-consent-record" id="kiss-consent-history" data-kiss-consent-record>`:
  - `<h2>` `historyTitle`, a `<p>` `historyIntro`, and with an `endpoint` a `<p>` `historySent`;
  - `<div data-kiss-consent-ui>` holding everything that changes with the visitor: a `<noscript>` note, the id line (`[data-kiss-consent-record-id]`), the empty and unavailable states (`[data-kiss-consent-record-empty]`, `[data-kiss-consent-record-unavailable]`), and the table in the cookie table's focusable scrolling region (`[data-kiss-consent-record-rows]`), all `hidden`;
  - the table's head: When, Choice, one column per category in use (its label), Always allowed, Purposes version; `<tbody>` empty;
  - `<script data-kiss-consent-record-script>(kissConsentRecord)(window, recordConfig)</script>`.
- **`recordConfig(resolved)` → `{ log, categories: [name, label][], services: { name: label }, text }`.** What the script is handed: the log's name, the labels it prints (D2), and the seven `ui.text` strings it writes in the browser. No URL.
- **`kissConsentRecord(win, cfg)`**, exported for the tests: the browser side.

## Depends on

`./consent-ui.js` (`escapeHtml`), `./consent-client.js` (`inlineJson`, the same script-safe JSON the head client's config uses). `lib/handlebars-helpers.js`'s `consentRecord` helper calls `recordHtml` and returns nothing on a packaged page.

## Depended on by

`lib/handlebars-helpers.js` (`{{consentRecord}}`). `test/unit/consent-record.test.js` runs the markup and the script in a domino DOM with a fake `localStorage`, as rendered and terser-minified. `test/integration/consent.test.js` builds a site with the viewer on its privacy page (its own script on that page alone, the Markdown copy), and `test/browser/consent.test.js` follows the dialog's `ui.history` link in Chromium and reads the rows.

## Non-obvious behavior

- **The labels are in the viewer's config, not the head's.** D2 as agreed put them in `clientConfig()`, inlined on every page; the operator moved them here at the viewer slice (2026-11-03, the spec's Amendments), because only this page prints them, and the head script stays the size it was.
- **Rows are built with DOM calls and `textContent`, never HTML.** The log is the visitor's to edit, so an `action`, a `timestamp` or a service name that holds markup is printed as text (a unit test feeds it `<img onerror>` and `<script>`). An unknown action, a missing category or a category-less record prints `—`; a log that is not JSON, not an array, or holds non-objects is read as empty or skipped.
- **The date locale is the visitor's, for the page's language.** D6 said "the page's `lang`", and Chromium showed that alone gives an en-GB visitor on a `lang="en"` page US dates. The script picks the first of `navigator.languages` whose language is the page's, else the page's `lang`, and formats with `dateStyle`/`timeStyle: 'medium'` (seconds included) inside `<time datetime="<UTC ISO>">`.
- **States:** storage that throws shows `unavailable` and nothing else (D10); an empty log shows `empty`; JavaScript off shows only the `<noscript>` note, since every state starts `hidden`.
- **The id is the newest record's, and always shown** once the log holds one. The operator's rule (2026-11-03): the visitor's copy is as close to the server's record as it can be, a self-service data takeout, and the id is what a visitor quotes in a data request. It was first built to show only with an endpoint, on the reading that a site with none holds nothing to look up; the operator overruled that. `historyId`'s wording ("carried by every record of your choices") is true with or without an endpoint. Only `historySent` depends on one, because it states what is sent.
- **What it says is sent, and only that.** `historySent` lists the fields kiss posts, a fact kiss knows. What the site's server keeps (its web server logs included) is the site's to say in its privacy notice, so nothing here claims it.
- **A version change between two rows** inserts `[data-kiss-consent-record-changed]`, one cell spanning every column (D7).
- **No delete control** (D9).
- **It redraws on `kiss-consent:change`**, so a choice made from this page's own footer shows without a reload. A withdrawal reloads the page anyway.
- **It finds its section from `document.currentScript`**, falling back to the first `[data-kiss-consent-record]`.
