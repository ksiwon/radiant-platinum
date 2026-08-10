// 앱 셸 표식 굽기 (COPYRIGHT.md §11)
//
// ⚠️ **여기서 그리는 것에 캐릭터도 워드마크도 없다.** 예전 셸 그림 셋은 우리가
// 만든 PNG였지만 그 안에 금속 질감의 워드마크와 기라티나(오리진 폼)로 보이는
// 형상이 그려져 있었다. 바이트 검사는 전부 통과하는데 화면을 열면 공식처럼 보인다 —
// 원본 바이트를 안 싣는 것과 공식처럼 보이지 않는 것은 다른 문제다.
//
// 그래서 표식을 **기하학으로만** 그린다: 어두운 바탕에서 퍼져 나가는 고리 여섯.
// 생물 실루엣도, 몬스터볼 모양도, 공식 로고 형태도 없다. 코드가 곧 원본이라
// 무엇을 그렸는지 다투 여지가 없다.
//
//     node tools/assets/shellMark.mjs
'use strict'
const fs = require('node:fs')
const path = require('node:path')
const { encodePng } = require('../extract/png')

const ROOT = path.resolve(__dirname, '../..')
const OUT = path.join(ROOT, 'public/assets')

/** 바탕 — 밤하늘 쪽 남색. 타이틀 배경 CSS와 같은 계열이다 */
const BG = [7, 12, 22]
/** 고리 — 차가운 백금색 */
const RING = [214, 228, 244]
/** 안쪽 불빛 */
const GLOW = [126, 168, 214]

/** 고리 여섯의 반지름 비율과 굵기 비율 */
const RINGS = [
  [0.94, 0.030],
  [0.76, 0.022],
  [0.60, 0.050],
  [0.44, 0.016],
  [0.30, 0.070],
  [0.13, 0.130],
]

/**
 * 표식 한 장.
 *
 * 고리마다 안티에일리어싱을 손으로 한다 — 경계에서 1픽셀 안쪽으로 부드럽게
 * 떨어뜨리지 않으면 작은 크기에서 톱니가 그대로 보인다
 */
function draw(size) {
  const rgba = new Uint8Array(size * size * 4)
  const c = (size - 1) / 2
  const soft = size / 256   // 흐린 폭. 크기에 비례해야 64px과 512px이 같아 보인다
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c
      const dy = (y - c) / c
      const d = Math.hypot(dx, dy)
      // 바깥은 투명하게 — 둥근 표식이라 네모 바탕이 남으면 촌스럽다
      const disc = clamp01((1 - d) / (soft * 0.06) + 1)
      let r = BG[0], g = BG[1], b = BG[2]
      // 가운데에서 퍼지는 빛
      const glow = clamp01(1 - d * 1.35) ** 2
      r = mix(r, GLOW[0], glow * 0.55)
      g = mix(g, GLOW[1], glow * 0.55)
      b = mix(b, GLOW[2], glow * 0.55)
      // 고리
      for (const [radius, width] of RINGS) {
        const edge = Math.abs(d - radius)
        const a = clamp01((width - edge) / Math.max(width * 0.35, soft * 0.02))
        if (a <= 0) continue
        // 위쪽이 밝고 아래쪽이 어둡다 — 금속처럼 보이는 것은 이 기울기다
        const shade = 0.62 + 0.38 * (1 - (dy + 1) / 2)
        r = mix(r, RING[0] * shade, a)
        g = mix(g, RING[1] * shade, a)
        b = mix(b, RING[2] * shade, a)
      }
      // ⚠️ **색을 32단계로 눌러 담는다.** 부드러운 그라디언트는 픽셀마다 색이
      // 달라서 deflate가 아무것도 못 줄인다 — 512px 한 장이 173KB였다. 32단계면
      // 눈으로는 거의 같은데 파일이 한 자릿수 KB로 떨어진다
      const o = (y * size + x) * 4
      rgba[o] = step(r)
      rgba[o + 1] = step(g)
      rgba[o + 2] = step(b)
      rgba[o + 3] = Math.round(255 * disc)
    }
  }
  return rgba
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
/** 0~255를 32단계로 */
const step = (v) => Math.min(255, Math.round(Math.round(v / 8) * 8))
const mix = (a, b, t) => a + (b - a) * t

/** 같은 그림을 벡터로. 파비콘과 매니페스트는 이쪽이 훨씬 작다 */
function svg() {
  const rings = RINGS.map(([radius, width]) =>
    `    <circle cx="256" cy="256" r="${(radius * 256).toFixed(1)}" fill="none"`
    + ` stroke="url(#metal)" stroke-width="${(width * 512).toFixed(1)}" />`).join('\n')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img"
     aria-label="퍼져 나가는 고리 여섯으로 그린 추상 표식">
  <defs>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#7ea8d6" />
      <stop offset="62%" stop-color="#0d1626" />
      <stop offset="100%" stop-color="#070c16" />
    </radialGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="46%" stop-color="#d6e4f4" />
      <stop offset="54%" stop-color="#9fb2c6" />
      <stop offset="100%" stop-color="#7f92a8" />
    </linearGradient>
  </defs>
  <circle cx="256" cy="256" r="256" fill="url(#glow)" />
${rings}
</svg>
`
}

function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const wrote = []
  // ⚠️ **PNG를 한 장만 굽는다.** 512짜리는 눌러 담아도 72KB였고, 매니페스트는
  // SVG를 받는다 — 1.3KB로 같은 그림이 나온다. PNG가 필요한 자리는 Safari의
  // `apple-touch-icon` 하나뿐이다
  for (const size of [180]) {
    const file = path.join(OUT, `mark-${size}.png`)
    const png = encodePng(draw(size), size, size)
    fs.writeFileSync(file, png)
    wrote.push([`mark-${size}.png`, png.length])
  }
  const file = path.join(OUT, 'mark.svg')
  fs.writeFileSync(file, svg(), 'utf8')
  wrote.push(['mark.svg', fs.statSync(file).size])
  for (const [name, size] of wrote) {
    console.log(`${name.padEnd(16)} ${(size / 1024).toFixed(1)}KB`)
  }
}

if (require.main === module) main()
module.exports = { draw, svg, RINGS }
