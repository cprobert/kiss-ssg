// The consent manager's default presentation: the banner, the settings
// dialog, the cookie table, the settings control and the theme CSS. Pure
// string functions over the resolved `config.consent` (`lib/consent.js`): no
// Handlebars and no browser. The helpers in `lib/handlebars-helpers.js` wrap
// them, and `lib/consent-client.js` brings them to life by the attribute
// vocabulary of contract §3 (`planning/plans/2026-11-02-consent-manager.md`).
// The client, not this module, renders the confirmation and sets the
// scroll padding a bottom banner needs.

/** @typedef {import('./consent.js').KissConsent} KissConsent */
/** @typedef {import('./consent.js').ConsentUi} ConsentUi */
/** @typedef {import('./consent.js').ConsentService} ConsentService */
/** @typedef {import('./consent.js').ConsentStored} ConsentStored */

/**
 * Escape text for HTML content or a double- or single-quoted attribute.
 *
 * @param {unknown} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * @param {string} action
 * @param {string} label
 * @param {string} [cls]
 * @returns {string}
 */
const button = (action, label, cls = 'kiss-consent__button') =>
  `<button type="button" class="${cls}" data-kiss-consent-action="${action}">${escapeHtml(label)}</button>`

/**
 * @param {string|null} policyUrl
 * @param {string} label
 * @returns {string}
 */
const policyLink = (policyUrl, label) =>
  policyUrl
    ? `<a class="kiss-consent__policy" href="${escapeHtml(policyUrl)}">${escapeHtml(label)}</a>`
    : ''

/**
 * The services of one category, in name order.
 *
 * @param {KissConsent} resolved
 * @param {string} category
 * @returns {ConsentService[]}
 */
const servicesIn = (resolved, category) =>
  Object.keys(resolved.services)
    .sort()
    .map((name) => resolved.services[name])
    .filter((s) => s.category === category)

/**
 * The default banner. `''` when no service needs a choice.
 *
 * @param {KissConsent} resolved
 * @param {{ logoUrl?: string|null, policyUrl?: string|null }} [options]
 * @returns {string}
 */
export function bannerHtml(
  resolved,
  { logoUrl = null, policyUrl = null } = {},
) {
  if (resolved.inUse.length === 0) return ''
  const t = resolved.ui.text
  return [
    `<div class="kiss-consent" data-kiss-consent-root data-position="${escapeHtml(resolved.ui.position)}" role="region" aria-label="${escapeHtml(t.title)}">`,
    // The bar spans the viewport; its content sits in a centred column.
    '<div class="kiss-consent__inner">',
    logoUrl
      ? `<img class="kiss-consent__logo" src="${escapeHtml(logoUrl)}" alt="">`
      : '',
    `<h2 class="kiss-consent__title">${escapeHtml(t.title)}</h2>`,
    `<p class="kiss-consent__body">${escapeHtml(t.body)}</p>`,
    policyLink(policyUrl, t.policy),
    '<div class="kiss-consent__actions">',
    // Accept and Reject are the two answers, and look alike (the ICO's
    // "equally prominent"); Choose cookies is a way to answer in detail, set
    // apart as a text button, as Google's own consent screen does.
    button('accept', t.accept),
    button('reject', t.reject),
    button('settings', t.choose, 'kiss-consent__more'),
    '</div>',
    closeButton('close', t.close),
    '</div>',
    '</div>',
  ].join('')
}

/**
 * The ✕ that closes the banner (`close`) or the dialog (`close-dialog`).
 *
 * @param {string} action
 * @param {string} label
 * @returns {string}
 */
const closeButton = (action, label) =>
  `<button type="button" class="kiss-consent__close" data-kiss-consent-action="${action}" aria-label="${escapeHtml(label)}">×</button>`

/**
 * A switch: a real checkbox, so the client and assistive technology read it
 * as one, styled as a toggle and announced as a switch.
 *
 * @param {string} id
 * @param {string} attrs the data attribute that names what it toggles, or
 * `disabled checked` for the one that cannot be switched off
 * @returns {string}
 */
const switchInput = (id, attrs) =>
  `<input type="checkbox" role="switch" class="kiss-consent-switch" id="${escapeHtml(id)}" ${attrs}>`

/**
 * The settings dialog. Category checkboxes carry no `checked`: the client
 * sets each from the stored choice. `''` when no service needs a choice.
 *
 * @param {KissConsent} resolved
 * @param {{ policyUrl?: string|null, historyUrl?: string|null }} [options]
 * `historyUrl` is `ui.history`'s page, linked beside the policy (D12)
 * @returns {string}
 */
export function settingsHtml(
  resolved,
  { policyUrl = null, historyUrl = null } = {},
) {
  if (resolved.inUse.length === 0) return ''
  const t = resolved.ui.text
  /**
   * The services a category's consent covers, by label and provider, so the
   * visitor sees who relies on it before choosing (the ICO: "consent for
   * categories of third-party controllers will not be specific enough").
   * `''` for a category with none.
   *
   * @param {string} name
   */
  const servicesList = (name) => {
    // The provider always, even when it repeats the label ("Vimeo (Vimeo)"),
    // so every line reads the same way (the operator, 2026-11-04).
    const items = servicesIn(resolved, name).map(
      (s) => `<li>${escapeHtml(`${s.label} (${s.provider})`)}</li>`,
    )
    return items.length
      ? `<ul class="kiss-consent-dialog__services" aria-label="${escapeHtml(t.servicesLabel)}">${items.join('')}</ul>`
      : ''
  }
  /**
   * One category: its name and switch on a row, its description under them,
   * the services it covers, then any "always allow" grants of its services.
   *
   * @param {string} id
   * @param {string} label
   * @param {string} description
   * @param {string} attrs
   * @param {string} services
   * @param {string} [grants]
   */
  const category = (id, label, description, attrs, services, grants = '') =>
    `<div class="kiss-consent-dialog__category"><div class="kiss-consent-dialog__row"><label for="${escapeHtml(id)}">${escapeHtml(label)}</label>${switchInput(id, attrs)}</div><p>${escapeHtml(description)}</p>${services}${grants}</div>`
  const categories = resolved.inUse.map((name) => {
    const c = resolved.categories[name]
    // Every service gets one, hidden until the client holds a grant for it:
    // {{consentEmbed}} offers "Always allow" for any service with src=, not
    // only one with an `embed` block, and a grant with no switch could not be
    // withdrawn here.
    const grants = servicesIn(resolved, name)
      .map(
        (s) =>
          `<div class="kiss-consent-dialog__grant" data-kiss-consent-grant="${escapeHtml(s.name)}" hidden><label for="kiss-consent-grant-${escapeHtml(s.name)}">${escapeHtml(s.label)}</label>${switchInput(`kiss-consent-grant-${s.name}`, `data-kiss-consent-service="${escapeHtml(s.name)}"`)}</div>`,
      )
      .join('')
    return category(
      `kiss-consent-${name}`,
      c.label,
      c.description,
      `data-kiss-consent-category="${escapeHtml(name)}"`,
      servicesList(name),
      grants,
    )
  })
  const linked =
    policyLink(policyUrl, t.policy) +
    (historyUrl
      ? `<a class="kiss-consent__history" href="${escapeHtml(historyUrl)}">${escapeHtml(t.historyLink)}</a>`
      : '')
  const links = linked
    ? `<div class="kiss-consent-dialog__links">${linked}</div>`
    : ''
  return [
    '<dialog class="kiss-consent-dialog" aria-labelledby="kiss-consent-dialog-title">',
    '<div class="kiss-consent-dialog__head">',
    `<h2 id="kiss-consent-dialog-title">${escapeHtml(t.settings)}</h2>`,
    closeButton('close-dialog', t.close),
    '</div>',
    '<div class="kiss-consent-dialog__body">',
    category(
      'kiss-consent-necessary',
      t.necessaryLabel,
      t.necessaryDescription,
      'disabled checked',
      servicesList('necessary'),
    ),
    ...categories,
    '</div>',
    // The three choices together, equal, at the foot of the dialog, Accept
    // first as in the banner; then the policy and history links under them
    // (the operator, 2026-11-04).
    '<div class="kiss-consent-dialog__foot">',
    button('accept', t.accept),
    button('reject', t.reject),
    button('save', t.save),
    links,
    '</div>',
    '</dialog>',
  ].join('')
}

/**
 * @param {string[]} cells
 * @returns {string}
 */
const row = (cells) =>
  `<tr>${cells.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`

/**
 * @param {ConsentService} service
 * @returns {string[]}
 */
function serviceRows(service) {
  /** @type {[ConsentStored, string][]} */
  const stored = [
    ...service.cookies.map(
      (c) => /** @type {[ConsentStored, string]} */ ([c, 'Cookie']),
    ),
    ...service.storage.map(
      (c) => /** @type {[ConsentStored, string]} */ ([c, 'Local storage']),
    ),
  ]
  if (stored.length === 0)
    return [
      row([
        service.label,
        service.provider,
        service.description,
        '—',
        '—',
        '—',
        '—',
      ]),
    ]
  return stored.map(([item, kind]) =>
    row([
      service.label,
      service.provider,
      item.description || service.description,
      item.name,
      kind,
      item.duration,
      item.party === 'third' ? 'Third' : 'First',
    ]),
  )
}

const TABLE_HEAD =
  '<thead><tr><th scope="col">Service</th><th scope="col">Provider</th><th scope="col">Purpose</th><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Duration</th><th scope="col">Party</th></tr></thead>'

/**
 * The cookie declaration: one table for `necessary`, which begins with kiss's
 * own two cookies, then one per category in use.
 *
 * @param {KissConsent} resolved
 * @returns {string}
 */
export function tableHtml(resolved) {
  const t = resolved.ui.text
  const own = [
    row([
      'Cookie consent',
      'This site',
      'Remembers your cookie choice',
      resolved.cookie.name,
      'Cookie',
      `${resolved.cookie.days} days`,
      'First',
    ]),
    row([
      'Cookie consent',
      'This site',
      'Remembers that you closed the cookie banner without choosing',
      // The client names it after the choice cookie: `kiss_consent_closed` by default.
      `${resolved.cookie.name}_closed`,
      'Cookie',
      'Session',
      'First',
    ]),
    row([
      'Cookie consent',
      'This site',
      'Keeps a dated copy of each cookie choice made in this browser, for you to see',
      // The browser's own consent history, `kiss_consent_log` by default (D11).
      `${resolved.cookie.name}_log`,
      'Local storage',
      'Until cleared',
      'First',
    ]),
  ]
  /**
   * @param {string} caption
   * @param {string[]} rows
   */
  // Each table in a focusable, labelled scrolling region: seven columns do
  // not fit a phone, and breaking words to make them fit left one letter per
  // line at 320px (example 14, 2026-11-03). The region scrolls instead, and a
  // keyboard user can reach it to scroll (WCAG 2.1.1).
  const table = (caption, rows) =>
    `<div class="kiss-consent-table-wrap" role="region" tabindex="0" aria-label="${escapeHtml(caption)}"><table class="kiss-consent-table"><caption>${escapeHtml(caption)}</caption>${TABLE_HEAD}<tbody>${rows.join('')}</tbody></table></div>`
  return [
    table(t.necessaryLabel, [
      ...own,
      ...servicesIn(resolved, 'necessary').flatMap(serviceRows),
    ]),
    ...resolved.inUse.map((name) =>
      table(
        resolved.categories[name].label,
        servicesIn(resolved, name).flatMap(serviceRows),
      ),
    ),
  ].join('')
}

/**
 * The control that reopens the settings, for every page's footer.
 *
 * @param {KissConsent} resolved
 * @returns {string}
 */
export function settingsControlHtml(resolved) {
  return `<button type="button" class="kiss-consent-settings" data-kiss-consent-action="settings">${escapeHtml(resolved.ui.text.settings)}</button>`
}

/** @type {Record<string, string>} theme key → custom property suffix */
const THEME_PROPS = {
  background: 'background',
  text: 'text',
  accent: 'accent',
  accentText: 'accent-text',
  border: 'border',
  radius: 'radius',
  font: 'font',
}

/**
 * The default theme's CSS, or `''` under `ui.theme: false`. Theme values were
 * checked by `resolveConsent` to hold no `;`, `{`, `}`, `<` or `>`.
 *
 * @param {ConsentUi} ui
 * @returns {string}
 */
export function themeCss(ui) {
  if (ui.theme === false) return ''
  const theme = ui.theme
  const props = Object.entries(THEME_PROPS)
    .filter(([key]) => theme[key] !== undefined)
    .map(([key, prop]) => `--kiss-consent-${prop}:${theme[key]};`)
    .join('')
  const v = (/** @type {string} */ name) => `var(--kiss-consent-${name})`
  const line = `1px solid ${v('border')}`
  // Text a step quieter than the headings, from the theme's own two colours,
  // so it follows a dark scheme without a third colour to configure.
  const muted = `color-mix(in srgb,${v('text')} 78%,${v('background')})`
  const surface = `background:${v('background')};color:${v('text')};font-family:${v('font')};`
  const fixed =
    'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;max-height:80vh;overflow:auto;'
  return [
    // Every element whose rules read a theme variable defines them, the
    // footer's settings button and the cookie table's scrolling region
    // included: their focus outline read an undefined accent, which voided it.
    `.kiss-consent,.kiss-consent-dialog,.kiss-embed,[data-kiss-consent-confirmation],.kiss-consent-settings,.kiss-consent-table-wrap{${props}}`,
    `.kiss-consent,[data-kiss-consent-confirmation]{${surface}box-sizing:border-box;font-size:.95rem;line-height:1.55}`,
    `.kiss-consent[data-position="bottom"],[data-kiss-consent-confirmation][data-position="bottom"]{${fixed}border-top:${line};box-shadow:0 -6px 24px rgb(0 0 0/.12)}`,
    // In the page's flow, not fixed: `relative` stays in the flow.
    `.kiss-consent[data-position="top"],[data-kiss-consent-confirmation][data-position="top"]{position:relative;border-bottom:${line}}`,
    // The bar spans the viewport; its content sits in a centred column, the
    // ✕ at that column's corner.
    '.kiss-consent__inner{position:relative;box-sizing:border-box;max-width:72rem;margin:0 auto;padding:1.25rem 3.75rem 1.25rem 1.5rem}',
    '.kiss-consent__logo{display:block;max-height:2rem;width:auto;margin:0 0 .75rem}',
    '.kiss-consent__title,.kiss-consent-dialog h2{margin:0 0 .375rem;font-size:1.125rem;font-weight:700;line-height:1.3}',
    `.kiss-consent__body{margin:0;max-width:68ch;color:${muted}}`,
    '.kiss-consent__policy,.kiss-consent__history{display:inline-block;margin-top:.375rem;color:inherit;text-decoration:underline;text-underline-offset:2px}',
    '.kiss-consent__actions{display:flex;flex-wrap:wrap;gap:.625rem;margin-top:1rem}',
    // One rule for Accept, Reject, Save and the embed's buttons alike: no
    // variant (the ICO's "equally prominent"). Choose cookies is __more, below.
    `.kiss-consent__button,.kiss-embed__notice button{font:inherit;font-weight:600;min-height:2.75rem;padding:.5rem 1.25rem;background:${v('accent')};color:${v('accent-text')};border:2px solid ${v('accent')};border-radius:${v('radius')};cursor:pointer}`,
    '.kiss-consent__button:hover,.kiss-embed__notice button:hover{filter:brightness(.92)}',
    `.kiss-consent__more{font:inherit;font-weight:600;min-height:2.75rem;padding:.5rem .75rem;background:transparent;color:${v('accent')};border:0;border-radius:${v('radius')};cursor:pointer}.kiss-consent__more:hover{text-decoration:underline}`,
    `.kiss-consent__close{position:absolute;top:.75rem;right:.75rem;display:grid;place-items:center;width:2.75rem;height:2.75rem;padding:0;font:inherit;font-size:1.5rem;line-height:1;background:transparent;color:inherit;border:0;border-radius:${v('radius')};cursor:pointer}`,
    '.kiss-consent__close:hover{background:rgb(127 127 127/.15)}',
    // On a phone each choice is a full-width row: equal, and easy to hit.
    '@media (max-width:40rem){.kiss-consent__inner{padding:1rem 1rem 1.25rem}.kiss-consent__title{padding-right:2.5rem}.kiss-consent__actions{flex-direction:column}.kiss-consent__button,.kiss-consent__more{width:100%}}',
    `.kiss-consent :focus-visible,.kiss-consent-dialog :focus-visible,.kiss-embed :focus-visible,[data-kiss-consent-confirmation]:focus-visible,[data-kiss-consent-confirmation] :focus-visible,.kiss-consent-settings:focus-visible,.kiss-consent-table-wrap:focus-visible{outline:3px solid ${v('accent')};outline-offset:2px}`,
    `.kiss-consent-dialog{${surface}border:${line};border-radius:${v('radius')};padding:0;width:min(36rem,calc(100vw - 2rem));max-height:calc(100vh - 2rem);box-shadow:0 12px 40px rgb(0 0 0/.25)}`,
    '.kiss-consent-dialog[open]{display:flex;flex-direction:column}',
    '.kiss-consent-dialog::backdrop{background:rgb(0 0 0/.5)}',
    `.kiss-consent-dialog__head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem .75rem .75rem 1.25rem;border-bottom:${line}}`,
    '.kiss-consent-dialog__head h2{margin:0}.kiss-consent-dialog__head .kiss-consent__close{position:static}',
    '.kiss-consent-dialog__body{padding:.25rem 1.25rem;overflow:auto}',
    // The policy and history links: their own line in the footer, under the choices.
    '.kiss-consent-dialog__links{flex-basis:100%;display:flex;flex-wrap:wrap;gap:0 1.25rem;font-size:.9rem}',
    `.kiss-consent-dialog__category{padding:.875rem 0;border-bottom:${line}}.kiss-consent-dialog__category:last-child{border-bottom:0}`,
    '.kiss-consent-dialog__row,.kiss-consent-dialog__grant{display:flex;align-items:center;justify-content:space-between;gap:1rem}',
    '.kiss-consent-dialog__row label{font-weight:600}',
    // The service list shares the description's look, indented for its bullets.
    `.kiss-consent-dialog__category p,.kiss-consent-dialog__services{margin:.25rem 0 0;font-size:.9rem;color:${muted}}.kiss-consent-dialog__services{padding-left:1.25rem}`,
    '.kiss-consent-dialog__grant{margin:.625rem 0 0 1rem;font-size:.9rem}.kiss-consent-dialog__grant[hidden]{display:none}',
    `.kiss-consent-dialog__foot{display:flex;flex-wrap:wrap;gap:.625rem;padding:1rem 1.25rem;border-top:${line}}`,
    // A checkbox drawn as a switch: the track is the text colour softened when
    // off and the accent when on, so off and on differ by colour and by where
    // the knob sits.
    `.kiss-consent-switch{appearance:none;flex:none;position:relative;width:2.75rem;height:1.5rem;margin:0;border-radius:999px;background:color-mix(in srgb,${v('text')} 45%,${v('background')});cursor:pointer}`,
    '.kiss-consent-switch::before{content:"";position:absolute;top:3px;left:3px;width:calc(1.5rem - 6px);height:calc(1.5rem - 6px);border-radius:50%;background:#fff;box-shadow:0 1px 2px rgb(0 0 0/.3)}',
    `.kiss-consent-switch:checked{background:${v('accent')}}.kiss-consent-switch:checked::before{left:calc(100% - 1.5rem + 3px)}`,
    '.kiss-consent-switch:disabled{opacity:.55;cursor:not-allowed}',
    '[data-kiss-consent-confirmation]{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:.75rem;padding:.875rem 1.25rem;font-weight:600}',
    `[data-kiss-consent-confirmation] button{font:inherit;padding:.375rem .875rem;background:transparent;color:inherit;border:1px solid currentColor;border-radius:${v('radius')};cursor:pointer}`,
    '.kiss-consent-settings{font:inherit;background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer}',
    `.kiss-embed{position:relative;${surface}border:${line};border-radius:${v('radius')};padding:1.5rem;text-align:center}`,
    `.kiss-embed__notice p{margin:0 auto 1rem;max-width:44ch;color:${muted}}`,
    '.kiss-embed__notice button{margin:0 .25rem .75rem}',
    '.kiss-embed__watch{color:inherit}',
    '.kiss-embed iframe{display:block;width:100%;aspect-ratio:16/9;height:auto;border:0}',
    '.kiss-consent-table-wrap{overflow-x:auto;margin:0 0 1.5rem}',
    '.kiss-consent-table{border-collapse:collapse;width:100%;min-width:40rem}',
    '.kiss-consent-table caption{text-align:left;font-weight:bold;padding:.25rem 0}',
    '.kiss-consent-table th,.kiss-consent-table td{border:1px solid currentColor;padding:.25rem .5rem;text-align:left;vertical-align:top}',
    '@media (prefers-reduced-motion:reduce){.kiss-consent,.kiss-consent *,.kiss-consent-dialog,.kiss-consent-dialog *,[data-kiss-consent-confirmation]{transition:none;animation:none}}',
  ].join('\n')
}
