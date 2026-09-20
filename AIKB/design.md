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
