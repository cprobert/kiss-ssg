# sass.js

## Responsibility

Resolves the `sass` package's modern compiler API once, so every module that compiles Sass imports one already-correct binding instead of repeating the named-vs-default feature detection.

## Public interface

- `default` — the resolved sass binding, exposing the modern API (`compile(file, options)`, `compileString(source, options)` and the rest of the `sass` namespace).

## Depends on

`sass`.

## Depended on by

`lib/assets.js`, `lib/handlebars-helpers.js`.

## Non-obvious behavior

- `import * as sassModule from 'sass'` then `typeof sassModule.compile === 'function' ? sassModule : sassModule.default` — not a plain `import sass from 'sass'` or `sassModule.default ?? sassModule`. Sass releases before 1.45 only put the modern `compile`/`compileString` API on the ESM namespace's `default` export (no named exports), so a bare namespace import leaves `sass.compile` undefined and every compile throws `TypeError: sass.compile is not a function`. But current sass exports both, _and_ logs an `import sass from 'sass'` is deprecated" warning the moment `.default` is touched — so the detection must prefer the named export and only reach for `.default` when it is missing, or every build on a modern sass prints that deprecation warning.
- The binding is resolved at module load, once per process — the two consumers share it (review finding D-15: the detection and its comment used to be duplicated verbatim in both, so a fix would have landed in only one copy).
