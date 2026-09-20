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
      // `new URL(...).pathname` is a usable filesystem path on POSIX and NOT
      // on Windows, where it returns `/C:/...` and `fs` resolves the leading
      // slash against the current drive root (`C:\C:\...`). This branch hit
      // it twice — once in `lib/` via `path.resolve` separators, once in a
      // test fixture — and both times only the Windows CI leg could see it,
      // so a Linux run reported five green gates over a broken test.
      // `fileURLToPath` is correct on both.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[property.name='pathname'][object.callee.name='URL']",
          message:
            'new URL(...).pathname is not a filesystem path on Windows (it yields /C:/...). Use fileURLToPath(new URL(...)) from node:url.',
        },
        {
          selector:
            "MemberExpression[property.name='pathname'][object.type='NewExpression'][object.callee.name='URL']",
          message:
            'new URL(...).pathname is not a filesystem path on Windows (it yields /C:/...). Use fileURLToPath(new URL(...)) from node:url.',
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
