// 사람이 처음 만나는 두 화면을 찍는다 — 고지가 **실제로 보이는지** 재려고
// (COPYRIGHT.md §11)
//
//     node tools/shot/title.mjs            개발 서버를 띄워 찍는다
//     node tools/shot/title.mjs --url=…    이미 떠 있는 곳을 찍는다
//
// ⚠️ `shot.mjs`는 확인 지점(맵)으로 뛰어드는 도구라 이 둘에 안 머문다.
// **눈으로 볼 것**을 만드는 것이 목적이고, 예쁜지 아닌지는 사람이 정한다.
//
// ⚠️ **타이틀만으로는 모자란다.** 설치 전 사용자는 타이틀에 못 간다 —
// `BootGate`가 설치 전에는 `<App/>`을 아예 안 그리기 때문이다(그리면 타이틀
// 음악·UI 글·맵 미리받기가 그 자리에서 요청으로 나간다). 그래서 그 사람이
// 실제로 보는 첫 화면은 설치 화면이고, 고지는 **거기에도** 있어야 한다.
// 개발 서버는 `play:dev`로 뜨므로 설치 화면은 「에셋 다시 설치」로 연다.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { freePort, startVite } from '../devServer.mjs'

const OUT = resolve(import.meta.dirname, '../../shots')
const VIEW = { width: 1280, height: 720 }
const flag = (name) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}

/**
 * 고지가 DOM에 있는 것과 **화면에 보이는 것**은 다르다.
 *
 * ⚠️ **DOM 순서로 첫 번째를 집으면 안 된다.** 설치 화면은 `position: fixed`로
 * 타이틀을 덮으므로 둘이 동시에 문서에 있고, 그때 첫 번째는 **밑에 깔린 쪽**이다.
 *
 * ⚠️ **`elementFromPoint`로 가리면 안 된다.** 그건 그려지는지가 아니라 **눌리는지**를
 * 잰다 — 타이틀의 `head`가 `pointer-events: none`이라 멀쩡히 보이는 고지가
 * "안 보인다"로 나왔다. 어느 화면 것인지는 **덮는 층의 z-index**로 가른다:
 * 타이틀 10 · 설치 60. 가장 높은 것이 위에 있는 것이다
 */
const DISCLAIMER = () => {
  const layerOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n)
      if (s.position === 'fixed') return Number(s.zIndex) || 0
    }
    return 0
  }
  const seen = [...document.querySelectorAll('p')]
    .filter((p) => p.textContent?.includes('비공식·비제휴'))
    .map((p) => {
      const box = p.getBoundingClientRect()
      const s = getComputedStyle(p)
      return {
        layer: layerOf(p),
        top: Math.round(box.top),
        bottom: Math.round(box.bottom),
        inView: box.width > 0 && box.top >= 0 && box.bottom <= window.innerHeight,
        painted: s.display !== 'none' && s.visibility === 'visible' && Number(s.opacity) > 0.3,
      }
    })
  const top = Math.max(0, ...seen.map((s) => s.layer))
  // 지금 맨 위 층의 고지가 화면 안에 그려져 있는가 — 그것만이 사람이 보는 것이다
  const onTop = seen.filter((s) => s.layer === top)
  return { 맨위층: top, 보임: onTop.every((s) => s.inView && s.painted), seen }
}

/** 차림표에 무엇이 몇 개 서 있는가. 눌리는지도 같이 본다 */
const MENU = () => [...document.querySelectorAll('button')]
  .filter((b) => b.offsetParent !== null)
  .map((b) => `${b.textContent?.replace(/^▶/, '').trim() ?? ''}${b.disabled ? ' (안 눌림)' : ''}`)

const main = async () => {
  let url = flag('url')
  let vite = null
  // ⚠️ 공용 `startVite`를 쓴다. 여기 따로 두었던 것은 `Local:`이 찍히기를 120초
  // 기다렸는데, 의존성을 다시 묶는 날에는 그 안에 못 뜬다 — 서버는 멀쩡한데
  // 끊는 쪽이 우리였다 (`devServer.mjs` 머리말의 실측)
  if (!url) { vite = await startVite(await freePort()); url = vite.url }

  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForFunction(() => document.body.innerText.trim().length > 0, null, { timeout: 60_000 })
  // 글꼴과 배경이 자리 잡을 틈
  await page.waitForTimeout(1200)

  mkdirSync(OUT, { recursive: true })
  writeFileSync(resolve(OUT, 'title.png'), await page.screenshot())
  console.log(`타이틀 고지  ${JSON.stringify(await page.evaluate(DISCLAIMER))}`)
  console.log(`타이틀 차림표 ${JSON.stringify(await page.evaluate(MENU))}`)
  console.log('→ shots/title.png')

  // ── 설치 화면 — 설치 전 사람이 실제로 보는 첫 화면 ────────────────────────
  await page.getByRole('button', { name: '에셋 다시 설치' }).click()
  await page.getByRole('heading', { name: '에셋 설치' }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(800)
  writeFileSync(resolve(OUT, 'install.png'), await page.screenshot())
  console.log(`설치 고지  ${JSON.stringify(await page.evaluate(DISCLAIMER))}`)
  console.log('→ shots/install.png')

  // 물음표를 눌러 설명이 실제로 펼쳐지는지. 안 펼쳐지면 그건 없는 것과 같다
  await page.getByRole('button', { name: 'AssetAssistant 폴더 설명' }).first().click()
  await page.waitForTimeout(300)
  const help = await page.evaluate(() => {
    const hit = [...document.querySelectorAll('[role="note"]')]
      .find((n) => n.textContent?.includes('StreamingAssets'))
    if (!hit) return { open: false }
    const box = hit.getBoundingClientRect()
    return { open: true, w: Math.round(box.width), h: Math.round(box.height) }
  })
  console.log(`물음표  ${JSON.stringify(help)}`)
  writeFileSync(resolve(OUT, 'install-help.png'), await page.screenshot())
  console.log('→ shots/install-help.png')

  await browser.close()
  vite?.child.kill()
}

await main()
