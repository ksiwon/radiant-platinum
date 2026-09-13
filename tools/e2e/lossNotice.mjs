// Run inside the page before inducing loss. Preserve a visible notice atomically:
// a second locator call can race automatic renderer recovery and removal.
export function observeLossNotice() {
  globalThis.__rpLossNotice = null
  const capture = () => {
    const dialog = document.querySelector('[role="alertdialog"]')
    if (!dialog) return
    const box = dialog.getBoundingClientRect()
    const style = getComputedStyle(dialog)
    if (box.width === 0 || box.height === 0 || style.visibility === 'hidden') return
    const text = dialog.innerText.trim()
    if (text) globalThis.__rpLossNotice = text
  }
  const observer = new MutationObserver(capture)
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
  })
  capture()
}
