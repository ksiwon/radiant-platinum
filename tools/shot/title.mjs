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
//
// ⚠️ **설치 화면은 개발 서버가 아니라 `dist`에서 연다.** 개발 서버는 늘
// `play:dev`로 뜨고, 밖에서 갈래를 바꾸는 뒷문은 **일부러 없다**(e2e ㉓ —
// 쿼리·해시·저장소를 만져도 안 바뀐다). 한동안 타이틀의 「에셋 다시 설치」를
// 눌러 열었는데 그 단추가 평소에는 안 서게 됐고, 애초에 그건 설치를 마친
// 사람이 보는 화면이지 처음 오는 사람이 보는 화면이 아니었다. 빈 프로필로
// `dist`에 들어가면 그것이 곧 배포된 사용자의 첫 화면이다.
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { freePort, startVite } from '../devServer.mjs'
import { serveDist } from '../e2e/serve.mjs'

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

/**
 * 글이 실제로 읽히는가 — **색을 재서 판정한다.**
 *
 * ⚠️ **그림만 보고는 놓친다. 실제로 놓쳤다.** 배포된 첫 화면에서 테마 변수가
 * 하나도 안 풀려 글자색과 글꼴이 통째로 기본값이었다 — `dayTheme`이 그 변수를
 * 정의하는 유일한 자리인데 `App`에만 붙어 있었고, 설치 화면은 `App` **대신**
 * 그려지기 때문이다. 개발에서는 마법사를 `App` 안에서 열어 보므로 멀쩡했다.
 *
 * WCAG 대비비로 잰다. 본문 기준이 4.5:1, 큰 글자는 3:1이다.
 * ⚠️ `opacity`는 안 친다 — 여기서 재는 것은 **색이 풀렸는가**이고, 흐리기는
 * 우리가 일부러 준 값이다
 */
const CONTRAST = () => {
  const nums = (css) => (css.match(/[\d.]+/g) ?? []).map(Number)
  const lum = (css) => {
    const [r, g, b] = nums(css)
    const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
  }
  /** 이 글 뒤에 실제로 깔린 색. 투명한 조상은 건너뛴다 */
  const groundOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const bg = getComputedStyle(n).backgroundColor
      const a = nums(bg)
      if (a.length >= 3 && (a.length < 4 || a[3] > 0.5)) return bg
    }
    return 'rgb(0,0,0)'
  }
  const ratio = (el) => {
    const a = lum(getComputedStyle(el).color)
    const b = lum(groundOf(el))
    const [hi, lo] = a > b ? [a, b] : [b, a]
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10
  }
  /**
   * 그 글을 든 것 중 **가장 안쪽**.
   *
   * ⚠️ 바깥 것을 집으면 조상의 배경과 그 조상의 색을 견주게 되어 엉뚱한 값이
   * 나온다 — 실제로 본문이 1.1로 찍혔는데 글은 멀쩡했다
   */
  const find = (tag, has) => {
    const all = [...document.querySelectorAll(tag)].filter((n) => n.textContent?.includes(has))
    return all.find((n) => !all.some((m) => m !== n && n.contains(m))) ?? null
  }
  const of = (el) => (el ? ratio(el) : null)

  const h1 = document.querySelector('h1')
  return {
    제목: of(h1),
    고지: of(find('p', '비공식·비제휴')),
    본문: of(find('div', '고른 파일은 이 기기')),
    // 변수가 안 풀리면 글꼴도 같이 안 풀린다 — 한 축을 더 본다
    글꼴: h1 ? getComputedStyle(h1).fontFamily.split(',')[0].replace(/["']/g, '') : null,
  }
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
  console.log(`타이틀 대비  ${JSON.stringify(await page.evaluate(CONTRAST))}`)
  console.log('→ shots/title.png')

  await page.close()

  // ── 설치 화면 — 설치 전 사람이 **실제로** 보는 첫 화면 ────────────────────
  const dist = resolve(import.meta.dirname, '../../dist')
  if (!existsSync(resolve(dist, 'index.html'))) {
    console.log('설치 화면은 못 찍었다 — dist가 없다. `pnpm build`로 굽는다')
    await browser.close()
    vite?.child.kill()
    return
  }
  // 빈 프로필이라 OPFS에 설치본이 없다 → `install:none` → 설치 화면.
  // 개발 서버가 아니라 `dist`인 것이 요점이다 (머리말)
  const server = await serveDist(dist, await freePort())
  const fresh = await browser.newContext({ viewport: VIEW, deviceScaleFactor: 1 })
  const first = await fresh.newPage()
  await first.goto(`${server.url}/`, { waitUntil: 'load' })
  await first.getByRole('heading', { name: '에셋 설치' }).waitFor({ timeout: 30_000 })
  await first.waitForTimeout(800)
  const tag = await first.evaluate(() => document.documentElement.dataset.boot ?? null)
  writeFileSync(resolve(OUT, 'install.png'), await first.screenshot())
  console.log(`설치 고지  ${JSON.stringify(await first.evaluate(DISCLAIMER))}  갈래 ${tag}`)
  console.log(`설치 대비  ${JSON.stringify(await first.evaluate(CONTRAST))}`)
  console.log('→ shots/install.png')

  // 물음표를 눌러 설명이 실제로 펼쳐지는지. 안 펼쳐지면 그건 없는 것과 같다
  await first.getByRole('button', { name: 'AssetAssistant 폴더 설명' }).first().click()
  await first.waitForTimeout(300)
  const help = await first.evaluate(() => {
    const hit = [...document.querySelectorAll('[role="note"]')]
      .find((n) => n.textContent?.includes('StreamingAssets'))
    if (!hit) return { open: false }
    const box = hit.getBoundingClientRect()
    return { open: true, w: Math.round(box.width), h: Math.round(box.height) }
  })
  console.log(`물음표  ${JSON.stringify(help)}`)
  writeFileSync(resolve(OUT, 'install-help.png'), await first.screenshot())
  console.log('→ shots/install-help.png')

  await browser.close()
  server.close()
  vite?.child.kill()
}

await main()
