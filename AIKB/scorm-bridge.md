# scorm-bridge.js

## Responsibility

The bridge between a page and a SCORM 1.2 LMS such as Moodle (`planning/plans/2026-10-24-learning-packages.md`, section B and amendment 2). In a SCORM package each member page is a SCO; the LMS puts an `API` object on a frame above it, and the page must start a session, report what happened and finish. The bridge does that, and gives the page's own script a small API, `window.kissScorm`, to record answers.

It is one inline `<script>`, not a file: the `{{scormBridge}}` helper renders it, so the same page works on the web, in an IMS content package and in a SCORM package, byte for byte. With no LMS above it, every call does nothing.

## Public interface

- `scormBridgeScript({ manual = false })` → `string`: `<script>(<the bridge>)(window,<manual>)</script>`. The same bytes on every call. The `scormBridge` helper (`AIKB/handlebars-helpers.md`) is its only caller in kiss.
- In the browser, `window.kissScorm`:
  - `available`: `true` while a session with an LMS is open.
  - `interaction({ id, type = 'choice', response, correct, result })`: one `cmi.interactions.n` entry at `n = cmi.interactions._count`: `id` first (SCORM 1.2 requires it of a new entry), then `type`, `student_response`, `correct_responses.0.pattern`, `result` (`true` or `'correct'` is `correct`, anything else `wrong`) and `time` (CMITime, `HH:MM:SS`); then a commit. A `choice` answer is a letter: an option index (`0` is `a`) or a letter given; an array is several, comma-separated.
  - `score(fraction)`: `min` 0, `max` 100, `raw` the fraction as a whole percentage, clamped to 0–1; then a commit.
  - `status(value)`: sets `cmi.core.lesson_status` to `passed`, `completed`, `failed`, `incomplete` or `browsed`; any other value is ignored.

## What it does

1. **Once per window.** If `window.kissScorm` exists, it returns: including the helper twice is harmless.
2. **It waits for a parent still loading.** It walks up `parent` (at most 10 frames, in `try`/`catch`). A same-origin parent whose document is still loading may yet run its own bridge (placed after an iframe in its `<body>`), so the bridge waits for each such parent's `DOMContentLoaded` before it decides, with a placeholder `kissScorm` that queues the page's calls (`available` is false meanwhile). Then it runs again, and sends the queued calls. Without the wait, whichever bridge ran first owned the session: a child that ran before its parent started it, the parent's `LMSInitialize` failed and turned the parent off, and the child's unload finished the session (found by a Codex adversarial review, 2026-10-24). A bridge in `<head>` runs before the page's iframes are parsed, so the usual case waits for nothing.
3. **Embedded pages proxy.** If a same-origin ancestor has `kissScorm`, this copy forwards every call to it and never touches the LMS: only the outermost kiss page of a SCO owns the session. It looks the ancestor's `kissScorm` up at each call, because an ancestor still waiting replaces its placeholder when it decides.
4. **Finds the API** up `parent`, then up `opener`, at most 10 frames each; a frame of another origin is skipped, never thrown on.
5. **Starts the session** with `LMSInitialize('')`. Unless `manual`, it reads `cmi.core.lesson_status` and sets `completed` only from `not attempted`, `browsed` or `incomplete` (never downgrading `passed` or `failed`), then commits at once.
6. **On `pagehide`**: sets `cmi.core.session_time` (CMITimespan, since load) and commits; it calls `LMSFinish` only when `event.persisted` is false. A page frozen in the back/forward cache keeps its session, because Moodle's API refuses every call after `LMSFinish`. It registers no `unload` or `beforeunload`, which would keep a page out of that cache.

## Depends on

Nothing: the bridge runs in the browser, on `window` alone.

## Depended on by

`lib/handlebars-helpers.js` (`scormBridge`). `test/unit/scorm-bridge.test.js` runs the script in Node's `vm` against a scripted SCORM 1.2 `API` and stub frames, as rendered and as minified.

## Non-obvious behavior

- **The bridge is a real function, inlined by its source.** `scormBridgeScript()` uses `Function.prototype.toString`, so the bridge is linted, type-checked and formatted like the rest of `lib/`, and must use nothing from the module's scope. A production build minifies it with the page; the tests run both the rendered and the terser-minified script.
- **Every call is guarded.** After each call it reads `LMSGetLastError()`. On 301 (not initialised: the LMS ended the session underneath the page) it calls `LMSInitialize('')` once and retries once. Any other error, a second failure or a throw turns the bridge off for the rest of the page's life. Nothing ever throws into the page.
- **Interactions fail soft.** If `cmi.interactions._count` or a field of an entry is refused (Moodle answers 401 where interactions are not supported), interactions are switched off and the rest of the bridge keeps working.
- **Ids are cleaned, not clipped.** An interaction id must be a CMIIdentifier. An id that is already `[A-Za-z0-9_.-]{1,255}` is kept; any other is cleaned to those characters, cut to 246, and given `-` and an 8-digit FNV-1a hash of the original, so two ids never become the same.
- **The session time counts from load**, set again at each `pagehide`. Moodle adds `session_time` to the total only at `LMSFinish`, so setting it more than once does not count time twice.
