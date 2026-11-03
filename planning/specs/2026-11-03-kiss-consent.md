# kiss-consent specification

Copied from the published draft 0.5 (3 November 2026, record format 1, kiss-ssg 2.11) at
`/branch-open` of `feat/consent-log-viewer`, as that branch's contract. It is amended **in place**
from here on, with a dated section at the end when the design moves; the published page is no
longer the source.

An open-source server that receives the consent records a kiss site sends, keeps them as evidence
that consent was given, and lets a visitor see what is held about their browser.

## Purpose and principles

A site that uses cookies needing consent has to be able to show that consent was given. UK GDPR
Article 7(1) puts that on the controller, and Google's EU user consent policy asks advertisers to
keep the text and choices shown, with the date and time. The `kiss_consent` cookie in the
visitor's browser cannot be that evidence: the visitor can delete or edit it. kiss-consent is the
record a site keeps instead.

- **Pseudonymous, not anonymous.** A record says "browser `id` chose these categories at this
  time, under this banner". Fully anonymous counts would show the banner works but not that a
  particular consent was given. The `id` is random and links to a person only if that person shows
  it, which they do to ask what is held or to have it deleted.
- **The minimum.** No IP address, no user agent, no other cookie, no fingerprint. kiss-consent
  stores the record kiss sends and the time it arrived, and nothing else by default.
- **The whole history, not the latest state.** Every choice is a new dated record: consent given,
  withdrawn, given again in part. Nothing is overwritten, on the server or in the browser's own
  log.
- **The visitor sees exactly what is kept.** The browser keeps its own dated copy of every record
  it sent, and the privacy page shows it, in the same shape the server holds.
- **A lost record never blocks a choice.** The visitor's choice takes effect in the browser
  whether or not the server receives it.

> **Not legal advice.** The retention period and the lawful basis for keeping these records need
> checking with a data-protection adviser before the first production deployment (Q1).

## The three parts

| Part         | Where                                                   | What it does                                                                                                                                           |
| ------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| kiss client  | every page of a kiss site, inlined by `{{consentHead}}` | Shows the banner, keeps the choice in the `kiss_consent` cookie, and POSTs a record to the site's `endpoint` on each choice. Exists today.             |
| kiss build   | `kiss-ssg`, at build time                               | Hashes the banner's text (`bannerHash`) and the purposes (`version`), and records both in `report().consent` and `AIKB/last-build.json`. Exists today. |
| kiss-consent | the site's own server, or one shared by several sites   | Receives, validates and keeps records; answers a visitor's request by `id`; gives the site owner views and exports. New.                               |

## The consent record

Format 1 is exactly what kiss-ssg's client sends today (`post()` in `lib/consent-client.js`).
Every field below was checked against the code and the sample records were captured from Chromium
on 3 November 2026. kiss-consent **must** accept this format unchanged.

| Field      | Type           | Meaning                                                                                                                                                                                                                                                                |
| ---------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id         | string         | A random id for the browser, made once with `crypto.randomUUID()` (a UUID v4) and kept in the cookie, so every record from one browser shares it. Where `randomUUID` is missing, 32 hex characters. Today kiss writes it only when an endpoint is set (changed by D1). |
| version    | string         | The purposes version. By default 12 hex characters: a hash of the categories in use and their modes, and each service's name, category, provider and origins. A site may set its own non-empty string instead. A new version means every visitor is asked again.       |
| timestamp  | string         | ISO 8601 in UTC, from the visitor's clock. Not to be trusted on its own; the server adds its own time.                                                                                                                                                                 |
| categories | object or null | One boolean per category the site uses (`preferences`, `statistics`, `marketing`; `necessary` never appears). `null` when the record is an "Always allow" grant made before the banner was answered.                                                                   |
| services   | object         | The services given "Always allow", as `{ "youtube": 1 }`. Empty when there are none. Reject all always sends `{}`.                                                                                                                                                     |
| bannerHash | string         | 12 hex characters: a hash of the banner's and dialog's wording as built. Identifies which text the visitor saw.                                                                                                                                                        |
| page       | string         | The path the choice was made on, `location.pathname`. No query string, no host.                                                                                                                                                                                        |

### A visitor's history: consent, withdrawal, partial consent again

Captured from kiss's consent test site with `endpoint: '/consent-log'`, in Chromium on 3 November 2026. One browser accepts everything, withdraws everything from the settings dialog (the page
reloads), then comes back and allows statistics only. Three records arrive, one per choice, all
with the same `id`.

| timestamp (UTC) | statistics | marketing | What the visitor did                   |
| --------------- | ---------- | --------- | -------------------------------------- |
| 15:40:42.846    | true       | true      | Accept all                             |
| 15:40:43.194    | false      | false     | Withdrew everything; the page reloaded |
| 15:40:43.611    | true       | false     | Came back and chose statistics only    |

```json
{
  "id": "a68e41c1-78ea-46a9-bead-709c2148c782",
  "version": "61f7f5e9e977",
  "timestamp": "2026-11-03T15:40:42.846Z",
  "categories": { "statistics": true, "marketing": true },
  "services": {},
  "bannerHash": "9c84de96507e",
  "page": "/"
}
```

```json
{
  "id": "a68e41c1-78ea-46a9-bead-709c2148c782",
  "version": "61f7f5e9e977",
  "timestamp": "2026-11-03T15:40:43.194Z",
  "categories": { "statistics": false, "marketing": false },
  "services": {},
  "bannerHash": "9c84de96507e",
  "page": "/"
}
```

```json
{
  "id": "a68e41c1-78ea-46a9-bead-709c2148c782",
  "version": "61f7f5e9e977",
  "timestamp": "2026-11-03T15:40:43.611Z",
  "categories": { "statistics": true, "marketing": false },
  "services": {},
  "bannerHash": "9c84de96507e",
  "page": "/"
}
```

A separate browser that clicks "Always allow" on a video before answering the banner sends a
record with no category answer:

```json
{
  "id": "a8c588bc-1976-4ce7-acb6-554c5b95ec8b",
  "version": "61f7f5e9e977",
  "timestamp": "2026-11-03T14:54:09.633Z",
  "categories": null,
  "services": { "youtube": 1 },
  "bannerHash": "9c84de96507e",
  "page": "/"
}
```

> **Gap in format 1.** A record does not say which control produced it. Accept all and a Save
> with every switch on send the same thing, and a withdrawal looks like any other choice. Format 2
> adds `action` and `format` (D13).

## How records arrive

### When kiss sends one

- On **Accept all**, **Reject all** and **Save** (in the banner or the settings dialog), and on
  **Always allow** for an embed.
- A withdrawal is an ordinary record whose categories are now `false`. It is sent before the page
  reloads.
- **Never** on Close (✕), which is not a choice, and never on a page load.

### The request

- `POST` to the site's `endpoint`: a path on the site (`/api/consent`) or an `https://` URL.
- The body is the record as JSON, sent as `Content-Type: text/plain`. kiss-consent **must** parse
  the raw body: a JSON body parser that waits for `application/json` will skip it.
- `text/plain` makes it a simple request, so a cross-origin endpoint gets no CORS preflight.
  `navigator.sendBeacon` also sends the endpoint domain's cookies; kiss-consent **must not** read
  or set any.
- kiss tries `sendBeacon` first, and falls back to `fetch` with `keepalive` and `mode: 'no-cors'`.

### What is not guaranteed

- The response is never read. kiss-consent should answer `204 No Content` to anything it accepts.
- There is no retry. A record lost to a network error, an ad blocker or a closing tab is gone. The
  log is evidence of the consents it holds, not a complete count of choices.
- The endpoint is public and unauthenticated. Anyone can post anything to it.

## What the server stores

One row per accepted record:

| Column           | From               | Notes                                                                                      |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------------ |
| site             | the server         | Which site the record is for: from the endpoint path or the request's host (Q4).           |
| received_at      | the server         | UTC, from the server's clock. The time the evidence rests on.                              |
| id               | record             | Indexed: a visitor's request is answered by it.                                            |
| version          | record             |                                                                                            |
| client_timestamp | record `timestamp` | Kept as sent; compared with `received_at` for skew.                                        |
| categories       | record             | JSON, or null.                                                                             |
| services         | record             | JSON.                                                                                      |
| banner_hash      | record             | Indexed: links to the banner registry.                                                     |
| page             | record             |                                                                                            |
| flags            | the server         | Validation notes, such as an unknown banner hash or a large clock skew. Kept, not dropped. |

**Never stored by default:** the IP address, the user agent, the referrer, request headers, or any
cookie. Rate limiting may use the IP address in memory, never on disk.

## Validation

| Rule                                                  | Outcome              |
| ----------------------------------------------------- | -------------------- |
| body over 4 kB, or not JSON                           | refused              |
| a field missing, of the wrong type, or an unknown one | refused              |
| id not a UUID or 32 hex characters                    | refused              |
| categories naming a category the site does not use    | refused              |
| bannerHash not in the site's banner registry          | flagged              |
| version not seen in the site's builds                 | flagged              |
| client timestamp more than 24 hours from received_at  | flagged              |
| more than a set number of records per id per hour     | refused (rate limit) |

The **banner registry** maps each `bannerHash` to the wording it stands for, with the date it was
first deployed. kiss already records every hash in `report().consent.banners` and
`AIKB/last-build.json`; the kiss side gains a file that carries the wording too (below).

## Retention and visitor rights

- **Retention.** Each record is deleted after a set period from `received_at`. Starting proposal:
  the consent cookie's lifetime (182 days by default) plus a period for disputes. The site owner's
  decision, after advice (Q1).
- **Access.** A visitor who gives their `id` gets every record held for it. The id is on the
  privacy page's viewer.
- **Deletion.** A visitor can ask for every record held for their id to be deleted. kiss-consent
  deletes them and keeps a count of deletions, not the id.
- **Proof of identity.** Holding the id is the proof.

## The admin views (server, not this branch)

A record by id; choices over time (counts only); banner versions; flagged records; export as JSON
Lines and CSV by site and date range.

## Changes on the kiss side — the scope of `feat/consent-log-viewer`

### Record format 2

Two fields added to the POST and the log, everything in format 1 unchanged:

| Field  | Type   | Meaning                                                       |
| ------ | ------ | ------------------------------------------------------------- |
| format | number | `2`. A record without it is format 1.                         |
| action | string | Which control made it: `accept`, `reject`, `save` or `allow`. |

### The banner registry file

The build writes, for each `bannerHash`, the plain text it stands for and the categories as the
visitor saw them (key, label, description, mode), as `consent-banners.json` beside `sitemap.xml`.
kiss-consent fetches it for its registry. Records stay small: category keys and true or false,
never the labels.

### Reopening the choice

Unchanged: `{{consentSettings}}` in the footer (the audit's `consent-settings-missing` reports a
page without it) and `kissConsent.show()`. A floating cookie icon is **considered, not proposed**
(WCAG 2.2 SC 2.4.11); out of scope.

### The history link in the dialog

`ui.history` names, by page id, the page that carries `{{consentRecord}}`, the way `ui.policy`
names the cookie policy. When it is set, the settings dialog's footer shows "See your consent
history" beside the policy link. The build fails if no page has that id, as `{{link}}` does.

### The browser's own history: `kiss_consent_log`

kiss appends every record it makes to a `localStorage` key, `kiss_consent_log`, a JSON array in
exactly the format it POSTs (format 2, with `action`).

- **Written first:** before the POST, and before a withdrawal's reload.
- **Every choice, nothing else:** Accept all, Reject all, Save, Always allow; never Close or a page
  load.
- **Without an endpoint too.**
- **Capped** at the last 50 records, oldest dropped first.
- **Declared** in the cookie table beside `kiss_consent`.
- **This browser's copy only:** lost when the visitor clears site data, and not proof.

### `{{consentRecord}}`: the visitor's viewer

A helper for the privacy page. It shows the visitor their `id`; their full dated history from
`kiss_consent_log`, newest first (when, which control, each category, any "Always allow" grants);
and a plain statement of what the server keeps for each row and what it never keeps. With
kiss-consent running (later), the same view can ask the server for the records held and show where
the two differ.

### The client split: an inline part and a cached file

Carried from the consent-manager branch (2026-11-02 log, "Raised, not taken here"): split the
head client, 12,346 bytes minified under a 13,312 ceiling, into a small **inline** part (Consent
Mode default and update, the stored-choice read, a `kissConsent` stub) and a **cached, deferred,
hashed file**. This is the first step to a hosted script, so the file's config should be one a
server could serve as well as kiss could write.

### The sub-folder URL defect (round-8 P2)

Carried from the consent-manager branch: under `siteUrl: 'https://example.com/site/'` the banner's
and dialog's policy link is written `/cookies/` rather than `/site/cookies/`, and `logoUrlFor`
writes a root-relative logo URL (`lib/handlebars-helpers.js`, the consent helpers). Not verified
locally when logged. `ui.history` and the cached client's URL go through the same code.

### Implementation decisions — all agreed

The operator's decisions of 3 November 2026 (D1–D12 in draft 0.4, D13 at `/branch-open`).

| Decision                | Today                                                             | Decision                                                                                                                                                                                            |
| ----------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1 id                   | Made only when an `endpoint` is set.                              | Always made, in the browser, with `crypto.randomUUID()`, and logged. It never leaves the browser unless an endpoint is set; the viewer shows it for a visitor to quote.                             |
| D2 labels               | The client config carries each category's `name` and `mode` only. | The client config carries each category's and service's label, so the viewer prints "Statistics" and "YouTube". The server gets the wording once per banner version, from the banner registry file. |
| D3 viewer code          | n/a                                                               | The head client only appends to the log. `{{consentRecord}}` writes its own small script on the viewer page alone.                                                                                  |
| D4 build vs browser     | n/a                                                               | The helper renders the heading, the "what we keep" statement and an empty state at build time; the browser fills the rows. With JavaScript off, a note says the history needs it.                   |
| D5 wording              | `ui.text` holds the banner and dialog strings.                    | About eight new `ui.text` keys (heading, empty state, column names, the action names).                                                                                                              |
| D6 dates                | Records hold UTC ISO 8601.                                        | Every row shows the date and the time, to the second, in the visitor's locale and time zone (`Intl.DateTimeFormat`, the page's `lang`), with the exact UTC value in a `<time datetime>`.            |
| D7 versions             | A new version means no current choice.                            | The log keeps records across versions; each row shows its version, and a change of version is marked between rows ("the site's cookie purposes changed").                                           |
| D8 withdrawal           | Deletes the declared storage of refused services.                 | Never deletes `kiss_consent_log`, even if a service's pattern matches it, and `resolveConsent` refuses a service declaring the name outright.                                                       |
| D9 deleting the history | n/a                                                               | No delete control, in the viewer or the client.                                                                                                                                                     |
| D10 storage unavailable | The client wraps `localStorage` in try/catch.                     | The choice works as now; nothing is logged; the viewer says the history is not available in this browser.                                                                                           |
| D11 cookie table        | Lists `kiss_consent` and `kiss_consent_closed`.                   | Adds `kiss_consent_log`: first-party local storage, until cleared, necessary (pending Q6).                                                                                                          |
| D12 the dialog link     | `ui.policy` names the policy page by id.                          | `ui.history` the same way; the link only when set; a build error for an id no page claims.                                                                                                          |
| D13 format 2            | The cookie's own `f` is 1.                                        | **Agreed at `/branch-open`, 2026-11-03.** The POST and the log gain `format: 2` and `action`; the cookie's format is unchanged, so no visitor is asked again.                                       |

Each lands with the kiss-ssg rules for public API: `GUIDE.md`, one `llms.txt` line, the types,
unit tests in a simulated DOM and a Chromium test, and the Markdown copy dropping the viewer's
controls.

## Roadmap: a hosted service (not this branch)

kiss-consent stays open source and free to self-host; a hosted service would charge businesses
for a login, their sites and banner wording, and audit export, and later a hosted script for sites
not built with kiss (the open-core model of Plausible, Umami and Matomo). What it asks of version
1: **tenants from the start** (every record and registry entry belongs to a site, every site to an
account, which settles Q4); **versioned records** (D13's `format`); **a client that stands alone**
(the inline/cached split, with a config a server could serve); **audit-grade export** with the
banner wording attached.

## Open questions

1. **Retention and lawful basis.** How long, and on what basis? Needs a data-protection adviser.
2. **Storage engine.** SQLite on one server, or Postgres for several sites?
3. **Hosting.** A Node service beside each site, one shared service, or a serverless function?
4. **Several sites.** Named by endpoint path, request host, or a field kiss adds?
5. **Abuse.** Are rate limits per id enough, or does a public endpoint need a per-site token?
6. **The browser's log and the storage rules.** Is `kiss_consent_log` strictly necessary storage,
   needing no consent of its own? A reading, not advice: ask with Q1.
7. **An aggregate-only mode.** Counts per banner version only, with no id?

## Sources

- kiss-ssg `lib/consent-client.js`: `write()` (the cookie) and `post()` (the record and delivery).
- kiss-ssg `lib/consent.js`: `purposesVersion`, `bannerHash` and the endpoint's validation.
- kiss-ssg `test/browser/consent.test.js`: "posts each choice to the endpoint as text/plain".
- kiss-ssg `GUIDE.md`, "Records: the endpoint and the banner hash".
- `planning/reviews/2026-11-02-consent-research.md`: the ICO, CNIL and Google requirements.

## Amendments

<!-- Dated sections, appended when the design moves during the branch. -->

### 2026-11-03 — built: format 2, the log, the viewer, `ui.history`

What was built against D1–D13, and where it moved from the table above.

- **Built as agreed:** D1 (the id at every choice), D3, D4, D5 (19 `ui.text` keys rather than about
  eight: one per string the page shows, all named in GUIDE.md), D7, D8 (the client skips the log;
  `resolveConsent` refuses a service declaring its name), D9, D10, D11, D12 (`ui.history`, default
  `null`; one `pageUrlFor` with `ui.policy`, so both fail the build alike) and D13 (`format: 2`
  and `action` on the POST and the log; the cookie stays `f: 1`).
- **D2 moved, the operator's decision at the viewer slice:** the category and service labels ride
  in the **viewer's** config (`recordConfig()`, `lib/consent-record.js`), on the history page
  alone, not in `clientConfig()` on every page. Same labels printed, records still keys only, and
  the head script did not grow (12,600 bytes minified before and after the viewer).
- **D6 refined, from Chromium:** "the page's `lang`" alone gave an en-GB visitor on a `lang="en"`
  page US dates (`Nov 3, 2026, 6:22:56 PM`). The viewer uses the visitor's locale when its
  language is the page's, and the page's `lang` otherwise, so month names match the words around
  them.
- **The viewer shows the id only with an endpoint**, and says what is sent (`historySent`) only
  then: the id exists to be quoted to the site, and without an endpoint the site holds nothing to
  look up. It never says what the site's server keeps; that is the privacy notice's, and
  `kiss-legal-and-privacy` says so.
- **The dialog links the history page** after the policy link; the banner does not. Setting
  `ui.history` changes the banner hash, as any change to the dialog's wording does.
