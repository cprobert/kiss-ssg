// Rendering a partial by name, from a v1 helper that used to read the global
// Handlebars module. Its own kind of thing: it reaches into the instance's
// partial registry, which nothing else here does.

/**
 * The pure part, exported so it can be tested without a Kiss instance — which
 * is the whole reason this file exists rather than a registerHelper call
 * sitting in router.js. Takes the environment explicitly instead of closing
 * over one.
 */
export function renderPartial(hbs, name, context, data) {
  const partial = hbs.partials[name]
  if (!partial) return ''
  const template =
    typeof partial === 'function' ? partial : hbs.compile(partial)
  // Pass the caller's own data frame through — that frame is how the page is
  // recorded as using the partial, so a save re-renders just this page rather
  // than the whole site.
  return new hbs.SafeString(template(context, { data }))
}

// The registrar: a thin adapter over the function above, and nothing else.
// Handlebars is per-instance in v2, so this registers on `kiss.handlebars` —
// `require('handlebars').partials` is empty here, which is how a v1 helper that
// read the global module rendered nothing at all, silently, on a green build.
export function registerPartialHelpers(kiss) {
  kiss.handlebars.registerHelper(
    'renderPartial',
    function (name, context, options) {
      return renderPartial(kiss.handlebars, name, context, options?.data)
    },
  )
}
