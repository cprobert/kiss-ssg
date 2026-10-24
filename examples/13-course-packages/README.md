# 13 · course packages

A page that names a `package` is zipped into a learning package that an LMS such as Moodle imports:
an IMS content package, a SCORM 1.2 package, or both from the same pages. Here the Aster & Oak
barista school has two lessons, each built the other way a lesson can be:

| Lesson                        | Shape                                                                           | In the LMS                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Espresso basics (`espresso/`) | **One SCO per page.** Two pages, each its own SCO                               | The LMS tracks each page, and its table of contents moves the learner between them               |
| Milk texture (`milk/`)        | **One SCO, many views.** One page whose own navigation shows one view at a time | One SCO, one session, one attempt; its question records the answer and marks the lesson complete |

## Run it

```bash
npm run eg13        # from the repo root
node router.js      # from examples/13-course-packages/
```

It writes the three pages into `public/`, and four zips into `public/packages/`:

```
./public/packages/espresso-basics.imscp.zip  Espresso basics  (2 pages)
./public/packages/espresso-basics.scorm12.zip  Espresso basics  (2 pages)
./public/packages/milk-texture.imscp.zip  Milk texture  (1 page)
./public/packages/milk-texture.scorm12.zip  Milk texture  (1 page)
```

Upload a `.scorm12.zip` to Moodle as a SCORM package activity, or an `.imscp.zip` as an IMS content
package resource. A rebuild of the same pages gives the same bytes, so only a changed lesson needs
uploading again.

## What to copy

- **A page joins a package by naming it**, `package: 'espresso-basics'`, and must have an `id`. The
  LMS keeps each learner's record by the identifier made from that id, so it stays the same when the
  page moves. `packageSection` groups pages under a heading in the LMS's table of contents.
- **`config.packages` says how**: `format` (`'imscp'`, `'scorm12'` or both), the `title` the LMS
  shows (a function of the package id and its pages), `dir` (default `packages`) and `only`.
- **The package carries what its pages need, and nothing else.** kiss follows every stylesheet,
  image, font and embedded page they reference, and roots the zip above all of it: the shared
  `css/course.css` is inside each package. Anything it cannot carry (a root-relative URL, a link to a
  page outside the package, a file this build did not write) is listed in the report's `packages`,
  with the reason, and left out.
- **`{{scormBridge}}` in `<head>`** connects a page to the LMS. With no `complete`, a page is complete
  when it is seen; `complete="manual"` leaves it to the page, as the milk lesson does. The page's own
  script records through `window.kissScorm`: `interaction({ id, response, correct, result })`,
  `score(fraction)` and `status('completed')`. On the web, or in an IMS content package, every call
  does nothing, so the same page works everywhere.
- **In a one-SCO-per-page lesson, the pages do not link to each other.** A link from one SCO to
  another would open the second inside the first; the report lists any such link for a SCORM package.
  The LMS's table of contents is the navigation.

GUIDE.md § Learning packages has the whole of it.
