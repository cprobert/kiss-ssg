// A first-party visit counter: it counts this browser's visits in a cookie of
// the site's own. A real counter would send the count to the site's own
// server; this one keeps it in the browser, so the example sends nothing.
// It runs only once the visitor allows statistics: the layout gates it with
// {{#consentScript "visits"}}, and the cookie is declared in router.js.
;(function () {
  var match = document.cookie.match(/(?:^|; )ao_visits=(\d+)/)
  var visits = (match ? Number(match[1]) : 0) + 1
  var secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    'ao_visits=' +
    visits +
    '; Path=/; Max-Age=' +
    365 * 24 * 60 * 60 +
    '; SameSite=Lax' +
    secure
})()
