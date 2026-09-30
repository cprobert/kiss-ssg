// Syntax highlighting, the copy button, and a guide menu that starts closed on
// a narrow screen. The page reads fine with none of it.
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

const menu = document.querySelector('.docs__menu')
if (menu && window.matchMedia('(max-width: 60rem)').matches) menu.open = false
