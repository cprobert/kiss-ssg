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
    logoUrl
      ? `<img class="kiss-consent__logo" src="${escapeHtml(logoUrl)}" alt="">`
      : '',
    `<h2 class="kiss-consent__title">${escapeHtml(t.title)}</h2>`,
    `<p class="kiss-consent__body">${escapeHtml(t.body)}</p>`,
    policyLink(policyUrl, t.policy),
    '<div class="kiss-consent__actions">',
    button('accept', t.accept),
    button('reject', t.reject),
    button('settings', t.choose),
    '</div>',
    `<button type="button" class="kiss-consent__close" data-kiss-consent-action="close" aria-label="${escapeHtml(t.close)}">×</button>`,
    '</div>',
  ].join('')
}

/**
 * The settings dialog. Category checkboxes carry no `checked`: the client
 * sets each from the stored choice. `''` when no service needs a choice.
 *
 * @param {KissConsent} resolved
 * @param {{ policyUrl?: string|null }} [options]
 * @returns {string}
 */
export function settingsHtml(resolved, { policyUrl = null } = {}) {
  if (resolved.inUse.length === 0) return ''
  const t = resolved.ui.text
  /**
   * @param {string} label
   * @param {string} description
   * @param {string} input
   * @param {string} [grants]
   */
  const fieldset = (label, description, input, grants = '') =>
    `<fieldset class="kiss-consent-dialog__category"><legend><label>${input} ${escapeHtml(label)}</label></legend><p>${escapeHtml(description)}</p>${grants}</fieldset>`
  const categories = resolved.inUse.map((name) => {
    const category = resolved.categories[name]
    const grants = servicesIn(resolved, name)
      .filter((s) => s.embed)
      .map(
        (s) =>
          `<label class="kiss-consent-dialog__grant" data-kiss-consent-grant="${escapeHtml(s.name)}" hidden><input type="checkbox" data-kiss-consent-service="${escapeHtml(s.name)}"> ${escapeHtml(s.label)}</label>`,
      )
      .join('')
    return fieldset(
      category.label,
      category.description,
      `<input type="checkbox" data-kiss-consent-category="${escapeHtml(name)}">`,
      grants,
    )
  })
  return [
    '<dialog class="kiss-consent-dialog" aria-labelledby="kiss-consent-dialog-title">',
    `<h2 id="kiss-consent-dialog-title">${escapeHtml(t.settings)}</h2>`,
    policyLink(policyUrl, t.policy),
    '<div class="kiss-consent__actions">',
    button('reject', t.reject),
    button('accept', t.accept),
    '</div>',
    fieldset(
      t.necessaryLabel,
      t.necessaryDescription,
      '<input type="checkbox" disabled checked>',
    ),
    ...categories,
    '<div class="kiss-consent__actions">',
    button('save', t.save),
    button('close-dialog', t.close),
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
  const surface = `background:${v('background')};color:${v('text')};font-family:${v('font')};border:1px solid ${v('border')};`
  const fixed =
    'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;max-height:80vh;overflow:auto;'
  return [
    `.kiss-consent,.kiss-consent-dialog,.kiss-embed,[data-kiss-consent-confirmation]{${props}}`,
    `.kiss-consent,[data-kiss-consent-confirmation]{${surface}box-sizing:border-box;padding:1rem;line-height:1.5}`,
    `.kiss-consent[data-position="bottom"],[data-kiss-consent-confirmation][data-position="bottom"]{${fixed}}`,
    // "Static" in contract §3 means in the flow, not fixed: `relative` stays
    // in the flow and anchors the close button.
    '.kiss-consent[data-position="top"],[data-kiss-consent-confirmation][data-position="top"]{position:relative}',
    '.kiss-consent{padding-right:3rem}',
    '.kiss-consent__logo{display:block;max-height:2.5rem;width:auto;margin-bottom:.5rem}',
    '.kiss-consent__title,.kiss-consent-dialog h2{margin:0 0 .5rem;font-size:1.25rem}',
    '.kiss-consent__body{margin:0 0 .5rem;max-width:70ch}',
    `.kiss-consent__policy{color:inherit;text-decoration:underline}`,
    '.kiss-consent__actions{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0}',
    // One rule for every choice button, banner and embed alike: no variant
    // (the ICO's "equally prominent").
    `.kiss-consent__button,.kiss-embed__notice button{font:inherit;font-size:1rem;min-height:2.75rem;padding:.5rem 1rem;background:${v('accent')};color:${v('accent-text')};border:2px solid ${v('accent')};border-radius:${v('radius')};cursor:pointer}`,
    `.kiss-consent__close{position:absolute;top:.5rem;right:.5rem;font:inherit;font-size:1.25rem;min-width:2.75rem;min-height:2.75rem;background:transparent;color:inherit;border:0;border-radius:${v('radius')};cursor:pointer}`,
    `.kiss-consent :focus-visible,.kiss-consent-dialog :focus-visible,.kiss-embed :focus-visible,[data-kiss-consent-confirmation]:focus-visible,[data-kiss-consent-confirmation] :focus-visible,.kiss-consent-settings:focus-visible,.kiss-consent-table-wrap:focus-visible{outline:3px solid ${v('accent')};outline-offset:2px}`,
    `.kiss-consent-dialog{${surface}border-radius:${v('radius')};padding:1.25rem;max-width:min(40rem,calc(100vw - 2rem));max-height:calc(100vh - 2rem);overflow:auto}`,
    '.kiss-consent-dialog::backdrop{background:rgb(0 0 0/.5)}',
    `.kiss-consent-dialog fieldset{border:1px solid ${v('border')};border-radius:${v('radius')};margin:0 0 .75rem;padding:.5rem .75rem}`,
    '.kiss-consent-dialog legend{font-weight:bold}',
    '.kiss-consent-dialog__grant{display:block;margin:.25rem 0 0 1.5rem}',
    '.kiss-consent-dialog__grant[hidden]{display:none}',
    '[data-kiss-consent-confirmation] button{font:inherit;margin-left:.5rem;background:transparent;color:inherit;border:1px solid currentColor;border-radius:4px;cursor:pointer}',
    '.kiss-consent-settings{font:inherit;background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer}',
    `.kiss-embed{position:relative;${surface}border-radius:${v('radius')};padding:1rem}`,
    '.kiss-embed__notice p,.kiss-consent-dialog fieldset p{margin:0 0 .5rem}',
    '.kiss-embed__notice button{margin:0 .5rem .5rem 0}',
    '.kiss-embed__watch{color:inherit}',
    '.kiss-embed iframe{display:block;width:100%;aspect-ratio:16/9;height:auto;border:0}',
    '.kiss-consent-table-wrap{overflow-x:auto;margin:0 0 1.5rem}',
    '.kiss-consent-table{border-collapse:collapse;width:100%;min-width:40rem}',
    '.kiss-consent-table caption{text-align:left;font-weight:bold;padding:.25rem 0}',
    '.kiss-consent-table th,.kiss-consent-table td{border:1px solid currentColor;padding:.25rem .5rem;text-align:left;vertical-align:top}',
    '@media (prefers-reduced-motion:reduce){.kiss-consent,.kiss-consent *,.kiss-consent-dialog,.kiss-consent-dialog *,[data-kiss-consent-confirmation]{transition:none;animation:none}}',
  ].join('\n')
}
