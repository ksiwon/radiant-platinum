import { afterAll, beforeAll, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { observeLossNotice } from './lossNotice.mjs'

let browser
// ⚠️ **진짜 브라우저를 여닫으므로 훅 시한을 따로 준다.** 한가한 기계에서 닫기는 0.1초인데
// `pnpm check` 전체가 병렬로 돌고 옆에서 다른 Playwright가 돌면 기본 10초를 넘겨 이 파일만
// 떨어졌다 — 시험 다섯은 다 통과한 채로 (실측 2026-09-18 · `.audit/tmp/closeTime.mjs`)
const BROWSER_HOOK_MS = 60_000
beforeAll(async () => { browser = await chromium.launch() }, BROWSER_HOOK_MS)
afterAll(async () => { await browser?.close() }, BROWSER_HOOK_MS)

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

it.each([311, 334])('records a completed scene only in the target map (%s)', async (map) => {
  const { watchMapScene } = await import('./observe.mjs')
  const page = await browser.newPage()
  try {
    await page.setContent('<main>game</main>')
    await page.evaluate(watchMapScene, 311)
    await page.evaluate(async (id) => {
      const m = document.documentElement.dataset
      m.map = String(id)
      m.scene = 'overworld'
      m.script = '1'
      await new Promise((done) => requestAnimationFrame(done))
      delete m.script
    }, map)
    expect(await page.evaluate(() => globalThis.__rpMapSceneWatch.finish())).toBe(map === 311)
  } finally { await page.close() }
})
