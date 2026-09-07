// **캔버스만 떼어 찍고, 찍은 픽셀로 판정한다.** `firstFrame.mjs`와 `journey.mjs`가
// 같이 쓴다.
//
// ⚠️ **왜 캔버스만인가.** 화면 전체를 찍으면 계기판·대사창·시작 화면의 DOM이
// 색을 채운다. 실측(7판)으로 3D가 한 픽셀도 안 나온 컷이 「색 130개」로
// 통과했다 — 그 색은 전부 DOM이 낸 것이었다. 3D가 그려졌는가를 재려면
// **3D만 남기고** 찍어야 한다.
//
// ⚠️ **`toDataURL`·`drawImage`로 캔버스를 읽지 않는다.** 이 프로젝트의 렌더러는
// `preserveDrawingBuffer: false`라 프레임이 끝나면 버퍼가 비어서, 눈으로 세계가
// 보이는 판에서도 「색 1개 · 알파 0」이 나온다 (`tools/shot/png.mjs`가 같은
// 함정을 적어 둔다). 그렇다고 **WebGPU 캔버스는 영영 못 읽는다**는 뜻은 아니다 —
// 이 프로젝트의 설정에서 못 읽는 것이고, 그래서 여기서는 안 쓴다.
//
// ⚠️ **`locator.screenshot()`은 GPU 레이어를 떼어 오는 API가 아니다.** 그 요소가
// 놓인 자리의 **합성된 화면**을 잘라 찍는 것이다. 그래서 위를 덮은 것을 치우는
// 일이 필요하고(아래 `hide`), 치우는 동안 레이아웃이 흔들리면 그 흔들림 자체가
// 결함을 고칠 수 있다 — 그래서 찍기 전후로 경계 상자와 크기 변화 횟수를 같이
// 재서 **검사가 대상을 바꿨는지**를 남긴다.
import { decodePng, looksFlat, statsOf } from '../shot/png.mjs'

/** 게임 캔버스. `Stage`가 감싼 자리 안의 그것 하나다 (`scene/Stage`의 `#stage-wrap`) */
export const CANVAS = '#stage-wrap canvas'

/**
 * 페이지가 열릴 때 심는다 — **감싼 자리의 크기가 몇 번 바뀌었는지** 센다.
 *
 * 이 값이 촬영 전후로 달라지면 검사가 스스로 크기를 흔든 것이고, 그 판의
 * 「보였다」는 못 믿는다. `ResizeObserver`는 붙이는 순간 한 번 부르므로
 * 절대값이 아니라 **차이**만 본다.
 */
export const WATCH_INIT = () => {
  const w = { resizes: 0, boxes: [] }
  window.__watch = w
  const start = () => {
    const host = document.querySelector('#stage-wrap')
    if (host === null) { setTimeout(start, 50); return }
    new ResizeObserver((es) => {
      w.resizes += 1
      const r = es[0].contentRect
      w.boxes.push(`${String(Math.round(r.width))}x${String(Math.round(r.height))}`)
      if (w.boxes.length > 20) w.boxes.shift()
    }).observe(host)
  }
  start()
}

/**
 * 찍기 직전·직후의 상태. 검사가 대상을 안 바꿨는지 대는 자다.
 *
 * ⚠️ 캔버스의 **CSS 상자**와 **backing store**를 따로 적는다. 둘은 다른 값이고,
 * §41에서 갈린 것이 정확히 그 둘 사이다
 */
const MEASURE = (sel) => {
  const cv = document.querySelector(sel)
  if (cv === null) return null
  const r = cv.getBoundingClientRect()
  const cs = getComputedStyle(cv)
  return {
    rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
    css: `${r.width.toFixed(1)}x${r.height.toFixed(1)}@${r.x.toFixed(1)},${r.y.toFixed(1)}`,
    buffer: `${String(cv.width)}x${String(cv.height)}`,
    style: `${cs.width}x${cs.height}`,
    scroll: `${String(window.scrollX)},${String(window.scrollY)}`,
    dpr: window.devicePixelRatio,
    resizes: window.__watch ? window.__watch.resizes : -1,
    canvases: document.querySelectorAll('canvas').length,
    // 가리기가 **남아 있는가**. 찍고 나서 안 되돌리면 그다음 컷이 통째로 거짓이다
    hidden: document.querySelectorAll('.__canvasOnly-off').length,
    hideSheet: document.getElementById('__canvasOnly') !== null,
  }
}

/** 지금 화면의 상태 한 벌. 컷을 안 찍고도 흔들림을 지켜보려고 밖에 낸다 */
export const measureFrame = (page) => page.evaluate(MEASURE, CANVAS)

/**
 * 두 잰 값이 **같은 화면**을 가리키는가. 다르면 그 사이에 무엇이 흔들린 것이다.
 *
 * ⚠️ **한 컷의 앞뒤만 보면 모자란다.** 기준을 잡은 뒤 마지막 컷까지 통째로
 * 견줘야 「첫 컷과 나중 컷 사이에 크기가 바뀐」 판을 잡는다
 */
export function sameFrame(a, b) {
  if (a === null || b === null) return { ok: false, why: '잰 값이 없다' }
  for (const key of ['css', 'buffer', 'style', 'scroll', 'dpr', 'resizes', 'canvases']) {
    if (String(a[key]) !== String(b[key])) {
      return { ok: false, why: `${key}가 ${String(a[key])} → ${String(b[key])}로 바뀌었다` }
    }
  }
  if (b.hidden !== 0 || b.hideSheet) return { ok: false, why: '가리기가 안 되돌려졌다' }
  return { ok: true, why: null }
}

/**
 * 계기판을 치운다 — **인라인 스타일에 손대지 않는다.**
 *
 * 예전 탐침은 `el.style.visibility`에 직접 썼다가 되돌릴 때 빈 문자열을 넣었다.
 * 원래 인라인으로 `visibility`를 쥐고 있던 요소는 그때 제 값을 잃는다. 그래서
 * 여기서는 **클래스 하나와 스타일 시트 한 장**만 쓴다 — 끄면 흔적이 없다.
 *
 * ⚠️ `display:none`이나 부모 크기 바꾸기를 안 쓴다. 그것들은 레이아웃을 다시
 * 재게 만들고, **레이아웃 변화가 바로 이 결함을 고치는 것**이라 검사가 제 손으로
 * 답을 만들어 버린다. `visibility`는 자리를 그대로 두고 칠하기만 뺀다
 */
const HIDE = ([sel, on, alsoCanvas = false, keepDom = false]) => {
  const ID = '__canvasOnly'
  const cls = '__canvasOnly-off'
  if (!on) {
    for (const el of document.querySelectorAll(`.${cls}`)) el.classList.remove(cls)
    document.getElementById(ID)?.remove()
    return
  }
  if (document.getElementById(ID) === null) {
    const st = document.createElement('style')
    st.id = ID
    st.textContent = `.${cls}{visibility:hidden!important}`
    document.head.append(st)
  }
  const cv = document.querySelector(sel)
  if (!keepDom) {
    const keep = new Set()
    for (let e = cv; e !== null; e = e.parentElement) keep.add(e)
    for (const el of document.querySelectorAll('body *')) {
      if (!keep.has(el)) el.classList.add(cls)
    }
  }
  // **음성 대조군**: 캔버스까지 치우면 같은 자리에 페이지 배경만 남는다.
  // 그 컷이 「그려졌다」로 읽히면 자가 고장 난 것이다
  if (alsoCanvas && cv !== null) cv.classList.add(cls)
}

/**
 * 계기판을 치우고/되돌린다. **진단 탐침이 같은 방식으로 가리려고** 밖에 낸다 —
 * 가리는 법이 둘이 되면 「탐침에서는 나왔는데 검사에서는 안 나온다」가 생긴다
 */
export const hideDom = (page, on, alsoCanvas = false, keepDom = false) =>
  page.evaluate(HIDE, [CANVAS, on, alsoCanvas, keepDom])

/**
 * 캔버스 한 컷.
 *
 * @returns `{ png, stats, before, after, steady }`
 *   `steady`가 거짓이면 **찍는 동안 화면이 흔들렸다** — 그 판의 결과는 못 믿는다
 */
export async function shootCanvas(page, { path = null, settle = 200, dropCanvas = false } = {}) {
  const n = await page.locator('canvas').count()
  if (n !== 1) throw new Error(`캔버스가 ${String(n)}개다 — 하나여야 잰다`)
  const before = await page.evaluate(MEASURE, CANVAS)
  if (before === null) throw new Error(`게임 캔버스(${CANVAS})가 없다`)
  let png
  try {
    await page.evaluate(HIDE, [CANVAS, true, dropCanvas])
    if (settle > 0) await page.waitForTimeout(settle)
    // 캔버스까지 치운 판은 요소를 못 찍는다(안 보이는 것은 플레이라이트가
    // 기다린다) — **같은 자리**를 잘라 찍는다. 자리는 치우기 전에 재 둔 그것이다
    png = dropCanvas
      ? await page.screenshot({ ...(path === null ? {} : { path }), clip: before.rect })
      : await page.locator(CANVAS).screenshot(path === null ? {} : { path })
  } finally {
    await page.evaluate(HIDE, [CANVAS, false])
  }
  const after = await page.evaluate(MEASURE, CANVAS)
  const same = sameFrame(before, after)
  return { png, stats: statsOf(png), before, after, steady: same.ok, why: same.why }
}

/**
 * 그려졌는가. **자는 `tools/shot/png.mjs` 하나다** — 문턱을 여기서 새로 정하면
 * 도구마다 조용히 갈린다.
 *
 * 문턱의 근거(실측, 이 하네스의 표본):
 *   · 배경만 나온 컷 — 색 1~3 · 흩어짐 0.0
 *   · 세계가 나온 컷 — 색 수천 · 흩어짐 20 이상
 */
export function looksDrawn(stats) {
  return !looksFlat(stats)
}

/**
 * 두 컷을 견준다.
 *
 * ⚠️ **크기가 다르면 「100% 달라졌다」가 아니라 「못 견준다」다.** 오래 그 자리에
 * `return 1`이 있었고, 그 값을 부르는 쪽은 전부 **정상 변화**로 읽었다 — 크기가
 * 어긋난 컷 한 쌍이 「화면이 갱신됐다」로 통과할 수 있었다는 뜻이다. `NaN`으로
 * 비켜 가는 것도 같은 병이다(비교 연산이 조용히 거짓이 된다). 그래서 **상태를
 * 밖으로 낸다** — 부르는 쪽이 FAIL이나 BLOCKED로 다뤄야 한다
 *
 * @returns `{ comparable, ratio, why }` — `comparable`이 거짓이면 `ratio`는 `null`이다
 */
export function compareShots(a, b, tol = 8) {
  const x = decodePng(a)
  const y = decodePng(b)
  if (x.w !== y.w || x.h !== y.h) {
    return {
      comparable: false, ratio: null,
      why: `크기가 다르다 — ${String(x.w)}x${String(x.h)} 대 ${String(y.w)}x${String(y.h)}`,
    }
  }
  const n = x.w * x.h
  let hit = 0
  for (let i = 0; i < n; i++) {
    const p = i * x.bpp, q = i * y.bpp
    const d = Math.max(
      Math.abs(x.pixels[p] - y.pixels[q]),
      Math.abs(x.pixels[p + 1] - y.pixels[q + 1]),
      Math.abs(x.pixels[p + 2] - y.pixels[q + 2]))
    if (d > tol) hit += 1
  }
  return { comparable: true, ratio: hit / n, why: null }
}

/**
 * 달라진 픽셀의 비율만 낸다. **못 견주면 던진다** — 조용한 숫자로 안 내려간다.
 * 판정하는 자리에서는 `compareShots`를 써서 못 견주는 것을 따로 다룬다
 */
export function diffRatio(a, b, tol = 8) {
  const got = compareShots(a, b, tol)
  if (!got.comparable) throw new Error(`두 컷을 못 견준다 — ${String(got.why)}`)
  return got.ratio
}

/**
 * 그림의 한 조각(ROI)의 평균 색. **도형이 거기 있는가**를 재는 자다.
 *
 * ⚠️ **화면 전체의 차이로는 도형을 못 본다.** 하늘색으로 지우기만 해도 검은
 * 페이지 배경과는 100% 다르다 — 그 판정은 「캔버스가 무엇이든 냈다」까지고
 * 「도형을 그렸다」가 아니다
 */
export function roiMean(png, roi) {
  const x = decodePng(png)
  const x0 = Math.max(0, Math.round(roi.x))
  const y0 = Math.max(0, Math.round(roi.y))
  const x1 = Math.min(x.w, Math.round(roi.x + roi.w))
  const y1 = Math.min(x.h, Math.round(roi.y + roi.h))
  if (x1 <= x0 || y1 <= y0) throw new Error(`ROI가 그림 밖이다 ${JSON.stringify(roi)}`)
  let r = 0, g = 0, b = 0
  const n = (x1 - x0) * (y1 - y0)
  for (let y = y0; y < y1; y++) {
    for (let px = x0; px < x1; px++) {
      const o = (y * x.w + px) * x.bpp
      r += x.pixels[o]; g += x.pixels[o + 1]; b += x.pixels[o + 2]
    }
  }
  return { r: r / n, g: g / n, b: b / n, n }
}

/** 두 ROI 평균이 얼마나 다른가 (0~255) */
export function roiGap(a, b) {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))
}

/**
 * 도형이 배경과 갈릴 만큼 다른가.
 *
 * 문턱의 근거(실측): 지움색만 나온 판에서 두 ROI의 평균 차는 **0.0**이었고,
 * 정육면체가 나온 판에서는 **60을 넘었다**
 */
export const SHAPE_GAP = 12

/** 정상 입력 앞뒤로 세계가 달라졌다고 볼 최소 비율. 실측 표본에서 온 값이다 */
export const MOVED = 0.02

/**
 * 찍어야 할 컷을 다 찍었는가. **일부만 찍고 통과하는 길을 막는다.**
 *
 * @param need 정본 이름 목록 (검사가 아니라 밖에서 온다)
 * @param got  실제로 찍은 이름 목록
 */
export function missingShots(need, got) {
  const has = new Set(got)
  return need.filter((one) => !has.has(one))
}
