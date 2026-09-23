# design

Cross-cutting, like `testing.md`: not a module, but the things that are true of kiss as a whole and that
every module doc assumes. Read it when a decision feels like it is being argued from first principles for
the second time.

## Responsibility

Holds what kiss **is** and where it came from, so that design arguments resolve against a written position
rather than being re-derived. `CLAUDE.md` § Design philosophy states the position; this doc holds the
lineage and the worked consequences that are too long for it.

## Lineage

kiss descends from **SCMS ("simple CMS")**, a Ruby static CMS its author wrote while learning Ruby. kiss is
its version 2 in intent — "reasonably compatible and easy to upgrade" — which is why a real SCMS site was
the edge test that produced most of the notes in this folder.

SCMS's shape was a folder per page: `_pages/<slug>/` holding a `_config.yml` and one content file per layout
hole, with the **file extension choosing the renderer**. The unit of work and the unit of storage were the
same thing — to change the about page you opened `_pages/about/` and everything about that page was in front
of you.

kiss trades that for a single answer to "what pages does this site have": `router.js`. That is the right
trade for kiss's goal, because an agent's hardest problem is exactly that question. But it **is** a trade,
and naming what it cost stops it being re-litigated:

- **A page has no single home.** Changing one can touch `src/pages/`, `src/models/`, `src/controllers/`,
  `src/partials/` and `router.js` — five directories, five tables.
- **A page cannot be half-deleted in SCMS; in kiss it can.** Delete a view and you leave a `.page()` call
  that fails the build, a model nobody reads, and partials nobody renders. Failing loudly is better than the
  alternative, but nothing enumerates the leftovers.
- **Both shapes are legible, to different people.** A folder named `about` containing `intro`, `leadin` and
  `main` explains itself to anyone. `router.js` explains itself to a programmer.
- **kiss's cost lands on maintenance, SCMS's landed on comprehension.** A conversion exercises neither, which
  is why a migration is a poor test of the thing it appears to be testing.

**The inherited idea kiss keeps** is that the extension states the processing — see `AIKB/partials.md` for how
`.hbs`/`.md`/`.html`/`.txt` carry that through.

## The organising principle

**Fail at build time and name the file.** It is the single idea most of `lib/` is an instance of:
`{{link}}` fails on an id no page claims and names the id and the view; two pages claiming one output path
fail and name the path; `assertBuildFolderIsSafe` throws and names both folders; a `.hbs` that cannot be read
fails that page rather than writing the filename into the output.

Stated as a rule for new work: **find every place kiss knows something is wrong and says nothing, and make it
say so.** A silent, deterministic, wrong result on a green build is the worst thing this codebase can
produce, and every defect a real conversion found in 2.4.0 was an instance of it — a sass compile silently
overwritten, a dev build written into the published folder, a watch rebuild that reported success and
served stale output, an AIKB lint noisy about something correct (the same failure inverted).

## Prior art: the same three problems in other generators

Recorded 2026-09-23, after six review rounds on `codex/protect-source-folders` had all landed on the same
three problems: two producers writing one output path, stale output after a rebuild, and a live-reload
message with no recipient. Every static site generator meets them. Checked against Jekyll, Eleventy, Hugo
and Astro (whose dev server is Vite), from their current docs and issue trackers; the sources are listed at
the end of this section so the check can be repeated rather than re-derived.

**Two producers, one path.** Everyone warns or fails; nobody restores the loser afterwards.

| Generator | Behaviour                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Jekyll    | warns `Conflict: The following destination is shared by multiple files`, extended to static files in 2020; the build continues                 |
| Eleventy  | throws `DuplicatePermalinkOutputError`; the build fails (an open issue asks for a config key to soften it)                                     |
| Astro     | `prerenderConflictBehavior`: `warn` (default), `error` or `ignore`; the highest-priority route wins                                            |
| Hugo      | silent overwrite unless `--printPathWarnings` is passed                                                                                        |
| kiss      | warns, names both producers, and puts the collision on the report as `outputs.collisions`; advisory, no config key (`AIKB/output-registry.md`) |

kiss's is Jekyll's shape plus the report. Astro's configurable warn-or-error is the nicest version and is a
one-key addition if a site ever wants a collision to fail the build.

**Stale output after a rebuild.** The others avoid the problem rather than solve it.

- Jekyll wipes the destination on every build ("files or folders that are not created by your site will be
  removed"), with `keep_files` for what other tools put there. Its incremental mode is still labelled
  experimental and "may break site generation".
- Eleventy never cleans: a deleted source stays in `_site` and the docs say delete the folder. A community
  plugin keeps an inventory of "files previously created but no longer", which is what kiss's asset
  reconcile does.
- Hugo's dev server can render to memory (`--renderToMemory`), so there is no stale file on disk to clean;
  production has `--cleanDestinationDir`.

kiss does three different things, and the split is the point: a one-shot `cleanBuild: true` empties the
folder in the constructor (Jekyll's wipe), `'atomic'` stages and swaps (Hugo's "nothing stale can exist"
without the memory), and `false` never cleans (Eleventy's default). A **watch replay** is the exception: it
does not wipe, it sweeps by ownership — the output registry for pages and generated files, the manifest
inventory for assets. That is the hard road, and it is where the six rounds went: every defect was a
transition the ledger got wrong (a Sass error deleting the last-good stylesheet, a rename recorded as a
collision, an asset shadowed by a deleted page never restored). It was chosen so a replay re-copies nothing
it does not have to. **The fallback, if the lifecycle keeps costing more than it saves:** a replay already
re-renders every page, so a replay that stages and swaps, exactly as one-shot `'atomic'` does, would delete
the sweep, the page side of the registry and the restore logic, at the price of re-copying assets per
replay (Hugo's `--forceSyncStatic` is that trade, named). Not adopted; recorded so the next person weighing
it starts from here.

**A reload with no recipient.** livereload-js reconnects with a one-second backoff and replays nothing, so a
refresh broadcast in the ~200 ms between a reload's DOM-ready and the new socket is lost (measured; see
`AIKB/upstream.md`). Vite's client reloads the page whenever its socket reconnects, which covers the lost
message at the price of the opposite complaint, needless reloads. Eleventy's dev server has its own
WebSocket server and updates the DOM by diffing, so the page rarely reloads and the window rarely opens. kiss
keeps the documented window: the client is livereload-js's, not ours, and a human saving files cannot hit
it.

**The watcher.** Chokidar is the Node norm. Eleventy uses it outright; Vite still uses chokidar 3.6 for files
outside its module graph, with a WSL2 caveat that needs polling. kiss is on chokidar 5.0.0, the latest, and
none of the three problems above is the watcher's.

Sources, as checked on 2026-09-23: Jekyll PR jekyll/jekyll#8459 and `docs/configuration/options` and
`docs/configuration/incremental-regeneration`; Eleventy issue 11ty/eleventy#3001, discussion #2294,
`docs/dev-server`, and `kentaroi/eleventy-plugin-clean`; Hugo `commands/hugo_server` and `commands/hugo`;
Astro `reference/configuration-reference` (`prerenderConflictBehavior`); Vite `config/server-options`
(`server.watch`) and issue vitejs/vite#5675; the livereload-js README.

## The documentation rule

**Any behaviour whose consequence is a wrong artefact rather than an error states that consequence in the
same sentence as the rule.** This is not a style preference; it is the diagnosis of a measured failure. Of
ten problems a competent agent hit building a real site on 2.4.0 unaided, **eight were cases where the
documentation was correct and it got it wrong anyway** — because a reader retains the consequence and
forgets the rule.

    STATED     "in dev: true it degrades to true and logs one notice"
    RETAINED   nothing — and a preview build went into the published folder
    NEEDED     "...so pointing dev at your published folder leaves a preview build in it"

There are not many such behaviours. `cleanBuild: 'atomic'` in dev, non-dev minification, helper
registration, and the asset precedence in `AIKB/assets.md` are the set as it stands.

## Non-obvious behavior

- **What ships is an example.** `examples/` is in the `files` whitelist so an agent in a consuming project can
  read it, which means every example is copied as a claim about good practice. Each one is therefore a
  standalone project that builds unmodified when copied out — the import is `'kiss-ssg'` (resolved in-repo by
  package self-reference), the output is its own `public/`, and nine of eleven configure no `folders` at all,
  because the defaults are the shape. That last fact is the philosophy's best demonstration and the reason
  the restructure was worth its diff.
- **Skills do not ship, and cannot be assumed.** `plugins/` is not in the `files` whitelist. A real conversion
  was completed without them because nothing in the installed package revealed they existed. So anything an
  unaided agent needs in order to build correctly belongs in `llms.txt`, which ships; a skill may hold a
  procedure the operator opts into, never a fact the build depends on.
- **The steer is on the shape of the code, not the shape of the content.** `{{link}}` punishes a hand-written
  URL; `folders.models` existing makes "this repeated markup is data" the path of least resistance. Nothing
  resists collapsing a site's editable content into templates — measured: a conversion turned 39 separately
  editable content files into 11 templates with 2 non-template editing surfaces, irreversibly, and neither
  the engine nor the output diff could see it. For a tool descended from a CMS that is the open gap, recorded
  here rather than solved.
