import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { observeLossNotice } from './lossNotice.mjs'

let browser
beforeAll(async () => { browser = await chromium.launch() })
afterAll(async () => { await browser?.close() })

it('preserves visible notice text after automatic recovery removes it', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent('<main>game</main>')
    await page.evaluate(observeLossNotice)
    await page.evaluate(async () => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'alertdialog')
      dialog.textContent = 'Graphics connection lost'
      document.body.append(dialog)
      await new Promise((done) => requestAnimationFrame(done))
      dialog.remove()
    })
    expect(await page.locator('[role="alertdialog"]').count()).toBe(0)
    expect(await page.evaluate(() => globalThis.__rpLossNotice)).toBe('Graphics connection lost')
  } finally { await page.close() }
})

it.each(['display:none', 'visibility:hidden'])('does not pass an invisible notice: %s', async (style) => {
  const page = await browser.newPage()
  try {
    await page.setContent('<main>game</main>')
    await page.evaluate(observeLossNotice)
    await page.evaluate((css) => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'alertdialog')
      dialog.style.cssText = css
      dialog.textContent = 'Hidden notice'
      document.body.append(dialog)
    }, style)
    expect(await page.evaluate(() => globalThis.__rpLossNotice)).toBeNull()
  } finally { await page.close() }
})
