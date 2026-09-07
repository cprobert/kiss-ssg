---
branch: feat/markdown-config
base: main
status: open
opened: 2026-09-07
---

# Session — 2026-09-07: A Config Surface for Markdown Options

## Intent (captured at /branch-open)

**Objective:** Give `new Kiss(config)` a `markdown` block for Remarkable options — merged one
level deep like `sass` and `fetch` — and correct the `breaks` default that v2 flipped by
accident, so a site's markdown rendering is configuration rather than a documented reach into
`kiss.remarkable` followed by a manual `registerPartials()`.

**Success criteria:**

- [ ] `new Kiss({ markdown: { breaks: true } })` changes both `.md` partial rendering and the
      `{{markdown}}` helper, with no `kiss.registerPartials()` call in the consumer's script —
      the block is applied before construction-time partial registration.
- [ ] `markdown` merges one level deep over the defaults, like `sass` and `fetch`: setting one
      key leaves the others at their defaults rather than replacing the object.
- [ ] Defaults ship as `html: true, xhtmlOut: true, breaks: false` — `breaks` restored to the
      published v1.0.2 value, `xhtmlOut` deliberately left at v2's `true`.
- [ ] A hard-wrapped `.md` partial renders as one paragraph by default, with no `<br />` at the
      source's wrap points. Regression test asserts this against a fixture partial.
- [ ] `lib/config.js` unit test covers the new key (default, one-level merge, `null`/`undefined`
      handling) alongside the existing `sass`/`fetch` merge tests.
- [ ] `llms.txt`, `README.md` and the affected `AIKB/` docs (`config.md`, `kiss.md`,
      `partials.md`) describe the block; `types/` regenerated via `npm run types`.
- [ ] `CHANGELOG.md` records the `breaks` default correction as a behaviour change, not just
      the additive config key.
- [ ] `npm run gates` passes.

**Non-goals / out of scope:**

- No `preset` support (`'commonmark'` / `'full'`) — options only. Reconsider if anyone asks.
- No per-page markdown override. Partials render once at construction, so the option is
  per-`Kiss`-instance by nature, exactly like `sass` and `fetch`.
- Not reverting `xhtmlOut` to v1's `false`. `<br />` and `<br>` are identical in HTML5; the
  only cost is diff noise when comparing a v1 build to a v2 one, which is a migration-time
  concern, not a rendering one.
- Not touching the a1k9 site (separate repo). Its two-line workaround becomes deletable, but
  removing it is a job for that repo.
- Not swapping or upgrading the Markdown renderer.

**Impact surface:** public API — a new `config` key, plus a change to default rendered output.
Obliges `llms.txt` + `README.md` + regenerated `types/`. Additive config would be a minor bump;
the `breaks` default change is observable in built output, so `/branch-close` should weigh that
too. On the current `2.0.0-alpha` line the mechanical bump is
`npm version prerelease --preid alpha`.

**Expected shape:** planned — the destination and the route are both known. The config-block
pattern already exists twice (`sass`, `fetch`); this follows it. The only unmapped part is
where exactly the option has to be applied so it lands before partials register.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /retrospective fills the Reflection below and flips status: closed -->
