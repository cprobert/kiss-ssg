---
name: kiss-pulse
description: Mid-work checkpoint on a kiss-ssg site — re-run the build check against the last committed build, read the page diff against the criteria captured at kiss-open, log the beat and decide continue / adjust / amend / ready-to-close. Use when asked to "pulse", "check progress", "how are we doing against the brief", "am I drifting", "is this ready to close yet", or every time a slice of the change is finished. Cheap and repeatable; not a substitute for kiss-close.
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

### 2. Run the check against the last committed build

```bash
npx kiss-ssg check --against AIKB/last-build.json --summary <build-script>
```

`--against` and `--summary` go **before** the script: everything after the script is passed through to the site's own build script.

`AIKB/last-build.json` is the build that was committed last — so the diff is exactly "what my working tree changes about this site":

- `+ <path>` a page this change adds
- `- <path>` a page it removes
- `~ <path>` a page whose bytes changed
- `= N` unchanged

No `AIKB/last-build.json` (the site does not call `.aikb()`, or has never built with it committed)? Run without `--against` and compare the page list by eye against the criteria; note in the log that the diff was unavailable.

### 3. Read the diff against the criteria

One line per criterion: **met / partial / not yet / drifted**, each with its evidence from the diff.

Then read the diff the other way round — **every line in it that no criterion asked for**. That is the whole point of the beat:

- A `~` on a page you never meant to touch usually means a shared partial or layout changed under it. Legitimate (a nav item) or accidental (a stray edit) — decide which, out loud.
- A `-` you did not intend is a page that has silently disappeared. Always a finding.
- Criteria that are "eyeball" only: look at the rendered page (or hand it to the human to look at) — do not tick them from the diff.
- `ok: false` anywhere: stop pulsing and fix. A broken build makes every other reading meaningless.

### 4. Drift check

Compare the trajectory against the **Non-goals** and the declared **Impact surface**. A change opened as "content" that is now editing the build script has moved surface — say so; at close it will oblige different checks and, on the data/controller and asset surfaces, a note under `AIKB/notes/`.

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
