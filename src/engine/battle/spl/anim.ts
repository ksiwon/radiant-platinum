// 입자의 크기·색·알파·텍스처가 수명을 따라 변하는 곡선 (`lib/spl/spl_anim.c`).
//
// ⚠️ **수명을 0~255로 놓고 잰다.** 원작이 `lifeRate`라 부르는 그 값이고,
// 곡선의 `in`·`peak`·`out`도 같은 자에 있다. 되풀이하는 입자는 수명이 아니라
// `loopFrames`를 그 자로 쓴다 (`SPLParticle`의 주석).
//
// ⚠️ **전부 정수 나눗셈이다.** 원작이 `/` 하나로 끝내는 자리를 실수로 바꾸면
// 끝값이 1씩 어긋난다 — 곡선이 꺾이는 자리에서 눈에 보인다.
import { FX16_ONE } from './resource'
import type { SplResource } from './resource'

/** GXRgb 5비트씩 꺼내기 */
const rgbR = (c: number): number => c & 31
const rgbG = (c: number): number => (c >>> 5) & 31
const rgbB = (c: number): number => (c >>> 10) & 31
export const rgb = (r: number, g: number, b: number): number =>
  (r & 31) | ((g & 31) << 5) | ((b & 31) << 10)

/** 곡선이 만지는 입자 값들 */
interface AnimTarget {
  animScale: number
  color: number
  animAlpha: number
  texture: number
}

/** `SPLAnim_Scale` */
export function animScale(p: AnimTarget, res: SplResource, lifeRate: number): void {
  const a = res.scaleAnim!
  if (lifeRate < a.in) {
    p.animScale = a.start + Math.trunc((lifeRate * (a.mid - a.start)) / a.in)
  } else if (lifeRate < a.out) {
    p.animScale = a.mid
  } else {
    p.animScale = a.end + Math.trunc(((lifeRate - 255) * (a.end - a.mid)) / (255 - a.out))
  }
}

/**
 * `SPLAnim_Color`.
 *
 * ⚠️ **가운데 색은 곡선이 아니라 머리에 있다** (`header.color`) — 자료가
 * 시작·끝만 들고 봉우리는 리소스 머리의 색을 쓴다. 이걸 놓치면 물드는 색이
 * 통째로 달라진다
 */
export function animColor(p: AnimTarget, res: SplResource, lifeRate: number): void {
  const a = res.colorAnim!
  const peakColor = res.header.color
  if (lifeRate < a.in) {
    p.color = a.start
    return
  }
  if (lifeRate < a.peak) {
    if (!a.interpolate) { p.color = peakColor; return }
    const t = lifeRate - a.in
    const span = a.peak - a.in
    p.color = rgb(
      rgbR(a.start) + Math.trunc((t * (rgbR(peakColor) - rgbR(a.start))) / span),
      rgbG(a.start) + Math.trunc((t * (rgbG(peakColor) - rgbG(a.start))) / span),
      rgbB(a.start) + Math.trunc((t * (rgbB(peakColor) - rgbB(a.start))) / span),
    )
    return
  }
  if (lifeRate < a.out) {
    if (!a.interpolate) { p.color = a.end; return }
    const t = lifeRate - a.peak
    const span = a.out - a.peak
    p.color = rgb(
      rgbR(peakColor) + Math.trunc((t * (rgbR(a.end) - rgbR(peakColor))) / span),
      rgbG(peakColor) + Math.trunc((t * (rgbG(a.end) - rgbG(peakColor))) / span),
      rgbB(peakColor) + Math.trunc((t * (rgbB(a.end) - rgbB(peakColor))) / span),
    )
    return
  }
  p.color = a.end
}

/**
 * `SPLAnim_Alpha`.
 *
 * ⚠️ **난수를 쓴다** — 끝에 `SPLRandom_ScaledRangeFX32`가 걸려 있어서, 이 곡선이
 * 있는 입자는 알파가 프레임마다 조금씩 떤다. 그래서 난수를 인자로 받는다
 */
export function animAlpha(
  p: AnimTarget, res: SplResource, lifeRate: number,
  scaledRange: (num: number, range: number) => number,
): void {
  const a = res.alphaAnim!
  let value: number
  if (lifeRate < a.in) {
    value = Math.trunc((lifeRate * (a.mid - a.start)) / a.in) + a.start
  } else if (lifeRate < a.out) {
    value = a.mid
  } else {
    value = Math.trunc(((lifeRate - 255) * (a.end - a.mid)) / (255 - a.out)) + a.end
  }
  p.animAlpha = scaledRange(value, a.randomRange)
}

/** `SPLAnim_Texture` — 프레임 표를 차례로 넘긴다 */
export function animTexture(p: AnimTarget, res: SplResource, lifeRate: number): void {
  const a = res.texAnim!
  for (let i = 0; i < a.frameCount; i++) {
    if (lifeRate < a.step * (i + 1)) { p.texture = a.textures[i]!; return }
  }
  p.texture = a.textures[Math.max(0, a.frameCount - 1)]!
}

/** `SPLAnim_ChildScale` — 1.0에서 `endScale`로 곧게 간다 (255로 나눈다) */
export function animChildScale(p: AnimTarget, res: SplResource, lifeRate: number): void {
  const end = res.child!.endScale
  p.animScale = end + Math.trunc(((end - FX16_ONE) * (lifeRate - 255)) / 255)
}

/** `SPLAnim_ChildAlpha` — 끝으로 갈수록 사라진다 */
export function animChildAlpha(p: AnimTarget, _res: SplResource, lifeRate: number): void {
  p.animAlpha = Math.trunc(((255 - lifeRate) * 31) / 255)
}
