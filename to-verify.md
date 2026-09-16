# To verify on a laptop

Things `npm run gates` cannot judge and Claude should not self-certify. Raised at
`/branch-close` Step 5a (operator eyeball) for branch
`claude/learna-kiss-session-communication-d1uv1d` (v2.4.0); deferred because the
operator was on mobile.

Delete an item once you have looked. Delete the file once it is empty.

---

## 1. The upgrade notice — the one that matters most

**Why:** this branch's headline break. A 2.3 site with `aliases` that upgrades and
changes nothing stops emitting `_redirects`. The only thing standing between that
and silently-404ing old URLs is one `notice` line. It shipped as a **minor**
(2.4.0), so nothing in the version number warns anybody.

```bash
cd examples/11-blog
# temporarily comment out `redirects: { format: 'netlify' }` in router.js
node router.js
```

- [ ] `public/11-blog/redirects.json` is written, `_redirects` is **not**
- [ ] the notice appears, and you would actually catch it in a real build's output:

```
aliases written to redirects.json only — set config.redirects.format
(e.g. 'netlify', 'firebase', or ['netlify','firebase']) to emit a file your host reads
```

**Judgement call:** is a cyan `notice` loud enough for a change that silently
breaks live redirects? If not, it should be a `warn`. Say so and it is a one-line
change — `lib/kiss.js`, `_writeRedirects()`.

Restore `router.js` afterwards (`git checkout examples/11-blog/router.js`).

## 2. Two hosts from one build

```bash
node -e "1" # scratch a site, or use examples/11-blog with:
#   redirects: { format: ['netlify', 'firebase'] }
```

- [ ] `_redirects` **and** `redirects.firebase.json` both appear, carrying the same rules
- [ ] `redirects.json` is there underneath both

## 3. learna-kiss on Firebase — the site that started this

The whole branch came from that site's session. Nothing here has been run against
the real repo.

- [ ] set `links: { trailingSlash: false }` and `redirects: { format: 'firebase' }`
- [ ] build and confirm `<loc>` entries have **no** trailing slash — the ~19
      `slug: "index"` pages were the original finding
- [ ] confirm `{{canonical}}` and `{{link}}` agree on the same page (the split this
      branch exists to prevent)
- [ ] then the site's hand-rolled `canonical` helper can be deleted — check that
      removing it changes no output

## 4. `.robots()` on a real site

```js
kiss.sitemap().robots()
```

- [ ] `robots.txt` carries a `Sitemap:` line pointing at the sitemap that build wrote
- [ ] it is absent when `.sitemap()` is not called
- [ ] a `robots.txt` in `src/assets/` is left alone under `{ overwrite: false }`

## 5. The renderer exports from a real install

Verified here against a packed tarball, but not on your machine:

```bash
npm pack && cd /tmp && mkdir t && cd t && npm init -y && npm i /path/to/kiss-ssg-2.4.0.tgz
node -e "import('kiss-ssg').then(m => console.log(typeof m.renderRedirects))"   # function
node -e "import('kiss-ssg/lib/redirects.js').catch(e => console.log(e.code))"   # ERR_PACKAGE_PATH_NOT_EXPORTED
```

- [ ] both lines behave as above

---

## Open decisions, not verification

- **2.4.0 is a minor carrying a behavioural break.** Your call, recorded. If this
  ever goes to a consumer who is not you, the CHANGELOG's first heading is the
  only warning they get.
- **`AIKB/testing.md`** now documents that `examples.test.js` self-heals on a
  report-shape change. The underlying test design is still a trap — it rewrites
  two tracked files and goes green on a re-run. Worth its own branch.
- **`config.js` now imports `redirects.js`** — first time the config resolver
  depends on a feature module. Deliberate, no cycle, but a direction you may want
  to reverse.
