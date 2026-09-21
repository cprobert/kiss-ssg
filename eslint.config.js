import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { args: 'none' }],
      // A FILE url's `.pathname` is not a filesystem path on Windows: it
      // returns `/C:/...`, and `fs` resolves the leading slash against the
      // current drive root (`C:\\C:\\...`). This branch hit it twice — once in
      // `lib/` via `path.resolve` separators, once in a test fixture — and
      // both times only the Windows CI leg could see it, so a Linux run
      // reported green gates over a broken test. `fileURLToPath` is correct on
      // both.
      //
      // Scoped to the `import.meta.url` base deliberately. Reading `.pathname`
      // off a real http URL is CORRECT usage (`lib/links.js` does it), and a
      // blanket ban would reject it — a lint rule that cries wolf gets
      // disabled, which costs more than it saves. `import.meta.url` as the
      // base is always a file URL, which is exactly the case that is always
      // wrong.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name='pathname'][object.type='NewExpression'][object.callee.name='URL'][object.arguments.1.object.type='MetaProperty']",
          message:
            'new URL(..., import.meta.url).pathname is not a filesystem path on Windows (it yields /C:/...). Use fileURLToPath(new URL(..., import.meta.url)) from node:url.',
        },
        {
          // The other always-a-file-URL case, and the one the narrowing above
          // dropped. Scoping to `import.meta.url` removed a false positive on
          // `new URL('https://…').pathname` and took an explicit
          // `new URL('file:///C:/x')` with it — same bug, written out longhand
          // rather than derived from a base. A literal is the only form worth
          // matching here: a variable holding a file URL is not decidable from
          // the syntax, and guessing is how a lint rule starts crying wolf.
          // Case-insensitive, and tolerant of leading whitespace, because the
          // URL parser is both: `FILE:///C:/x` and ` file:///C:/x` produce the
          // same `/C:/x` the rule exists to prevent, and the first version of
          // this selector missed both — a ban that does not cover the spellings
          // of the thing it bans. `https://h/file:x` stays unflagged and should:
          // its pathname is `/file:x`, which is not a filesystem path.
          selector:
            "MemberExpression[property.name='pathname'][object.type='NewExpression'][object.callee.name='URL'][object.arguments.0.value=/^\\s*[Ff][Ii][Ll][Ee]:/]",
          message:
            "new URL('file:…').pathname is not a filesystem path on Windows (it yields /C:/...). Use fileURLToPath() from node:url.",
        },
      ],
    },
  },
  {
    ignores: [
      'docs/**',
      'public/**',
      'examples/**/assets/**',
      'src/**',
      'coverage/**',
    ],
  },
]
