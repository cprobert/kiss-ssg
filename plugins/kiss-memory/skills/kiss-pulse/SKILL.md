---
name: kiss-pulse
description: Mid-work checkpoint on a kiss-ssg site — re-run the build check against the recorded baseline, read the page diff against the criteria captured at kiss-open, log the beat and decide continue / adjust / amend / ready-to-close. Use when asked to "pulse", "check progress", "how are we doing against the brief", "am I drifting", "is this ready to close yet", or every time a slice of the change is finished. Cheap and repeatable; not a substitute for kiss-close.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Pulse a kiss-ssg change

The Steer beat between `kiss-open` and `kiss-close`. Work drifts in the gap where nothing checks it; this closes the gap with evidence — a real build diff — rather than a feeling. Run it every slice, keep it under a couple of minutes. If a pulse starts to feel like a close, it has failed its purpose.

## Execution instructions

### 1. Find the intent

```bash
git branch --show-current
grep -rl "branch: $(git branch --show-current)$" planning/sessions/*.md
```

Read that file's **Success criteria**, **Non-goals** and **Impact surface**. They are the baseline: read them, never rewrite them.

No file? Offer to capture intent retrospectively with `kiss-open` (inferring the objective and criteria from the work so far, marked as inferred). If the user declines, pulse loosely against a checklist they give you.

### 2. Run the check against the recorded baseline

```bash
npx kiss-ssg check --summary <build-script>
```

`--summary` goes **before** the script: everything after the script is passed through to the site's own build script.

No flag asks for the diff. When the site has a recorded knowledge base, the check compares this build against `AIKB/last-build.json` by default and prints:

- `+ <path>` a page this change adds
- `- <path>` a page it removes
- `~ <path>` a page whose bytes changed
- `= N` unchanged

That record is the state the branch opened at, because recording happens once per piece of work, at `kiss-close`. So the block is exactly "what my work so far changes about this site" — and it stays that way all branch long, which is the reason nothing here records.

**Never run `npx kiss-ssg aikb` at a pulse.** It would move the baseline to the current build and the diff you are steering by would go empty for the rest of the branch. Recording is the close's job (or, on a site that has never had a record, the open's).

No diff block? The site has never been recorded, so there is no baseline — `kiss-open` normally sets one up. Do not fix it now by recording mid-branch; compare the page list by eye against the criteria and note in the log that the diff was unavailable. `kiss-close` records at the end, and the next branch gets a proper diff.

### 3. Read the diff against the criteria

One line per criterion: **met / partial / not yet / drifted**, each with its evidence from the diff.

Then read the diff the other way round — **every line in it that no criterion asked for**. That is the whole point of the beat:

- A `~` on a page you never meant to touch usually means a shared partial or layout changed under it. Legitimate (a nav item) or accidental (a stray edit) — decide which, out loud.
- A `-` you did not intend is a page that has silently disappeared. Always a finding.
- Criteria that are "eyeball" only: look at the rendered page (or hand it to the human to look at) — do not tick them from the diff.
- `ok: false` anywhere: stop pulsing and fix. A broken build makes every other reading meaningless.

### 4. Drift check

Compare the trajectory against the **Non-goals** and the declared **Impact surface**. A change opened as "content" that is now editing the build script has moved surface — say so; at close it will oblige different checks and, on the data/controller and asset surfaces, a note under `AIKB/notes/`. A check on a recorded site also reports its note rules, four summary lines that cost nothing to read:

- **`note missing:`** — a subject with no note. A _new_ one is the surface moving in front of you: cheaper to answer now than at the close, where it is a hard stop.
- **`note stale:`** — a stamped note whose subject's code has changed under it. On this branch that almost always means _you_ changed it: the code moved, the reason did not. Also a hard stop at the close, so fix it in the slice that caused it, while you still remember why.
- **`note dangling:`** — a note (or `AIKB/site.md`) naming a file that no longer resolves, printed as `"<note path>: <token>"`. Renaming or deleting a file is the usual cause, so a new one is normally this branch's doing.
- **`note dead:`** — a note whose subject has left the map. Expected when the branch retired something; a surprise otherwise, and then a finding.

None of them changes the exit code, and inherited ones (present at open, recorded in the session file) are not yours to fix at a pulse. It is the **new** ones that are drift.

Legitimate expansion (adjacent, same theme) → append a dated entry to the session file's `### Amendments`. Genuine scope creep (a different objective) → say so and recommend deferring. Never absorb it silently; never start a second branch on your own initiative.

### 5. Log the beat and decide

Append one dated line to the session file's `## Pulse log`, then state the call plainly:

```markdown
- **2026-09-10** — criteria 1–2 met (`+ public/courses/data-science.html` and 3 siblings, `~ public/index.html`); criterion 3 not yet (prospectus page still built); one unasked `~ public/about.html` from the footer partial, accepted. Decision: continue.
```

Do **not** tick the Intent block's checkboxes — the close does that against a pristine baseline. Commit the session file alone (never `-A`):

```bash
git add planning/sessions/<file>
git commit -m "Pulse: <YYYY-MM-DD> <one-line decision>"
```

The four decisions: **continue** (on track) / **adjust** (named correction, re-steer now) / **amend** (remit legitimately moved, recorded above) / **ready to close** (criteria met — hand to `kiss-close`).
