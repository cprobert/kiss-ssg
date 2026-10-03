// Syntax highlighting, the copy button, the light/dark toggle, and a guide menu
// that starts closed on a narrow screen. The page reads fine with none of it.
if (window.hljs) window.hljs.highlightAll()

for (const button of document.querySelectorAll('[data-copy]')) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy)
      button.textContent = 'Copied'
    } catch {
      button.textContent = 'Select and copy'
    }
    setTimeout(() => (button.textContent = 'Copy'), 2000)
  })
}

// The theme toggle. A saved choice was already applied by the inline script in
// <head>; with none, the device setting decides and the button offers the
// other one. Storage can be blocked (a private window), so the choice then
// lasts for this page only.
const STORAGE_KEY = 'kiss-docs-theme'
const toggle = document.querySelector('[data-theme-toggle]')
if (toggle) {
  const root = document.documentElement
  const deviceDark = window.matchMedia('(prefers-color-scheme: dark)')
  const current = () =>
    root.dataset.theme || (deviceDark.matches ? 'dark' : 'light')
  const label = toggle.querySelector('[data-theme-toggle-label]')
  const render = () => {
    const next = current() === 'dark' ? 'light' : 'dark'
    toggle.dataset.next = next
    label.textContent = `Switch to ${next} mode`
  }
  toggle.addEventListener('click', () => {
    root.dataset.theme = toggle.dataset.next
    try {
      localStorage.setItem(STORAGE_KEY, root.dataset.theme)
    } catch {
      // Blocked storage: the choice holds until the next page load.
    }
    render()
  })
  // A device that changes mode (a sunset schedule) moves an unchosen page too.
  deviceDark.addEventListener('change', render)
  render()
  toggle.hidden = false
}

// The home page's agent selector: one set-up box at a time, Claude Code until
// the visitor picks another. A remembered choice that no longer names a box
// falls back to the first.
const AGENT_KEY = 'kiss-docs-agent'
const picker = document.querySelector('[data-agent-picker]')
if (picker) {
  const select = picker.querySelector('select')
  const boxes = document.querySelectorAll('[data-agent-boxes] [data-agent]')
  const show = (id) => {
    for (const box of boxes) box.hidden = box.dataset.agent !== id
  }
  let saved = null
  try {
    saved = localStorage.getItem(AGENT_KEY)
  } catch {
    // Blocked storage: start from the default.
  }
  if ([...select.options].some((o) => o.value === saved)) select.value = saved
  select.addEventListener('change', () => {
    show(select.value)
    try {
      localStorage.setItem(AGENT_KEY, select.value)
    } catch {
      // Blocked storage: the choice holds until the next page load.
    }
  })
  show(select.value)
  picker.hidden = false
}

const menu = document.querySelector('.docs__menu')
if (menu && window.matchMedia('(max-width: 60rem)').matches) menu.open = false
