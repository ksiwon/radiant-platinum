// 그림 칸 애니메이션 — 지금 몇 번째 칸이고 그 칸이 텍스처 어디인가
// (유니티 `TextureSheetAnimationModule`).
//
// ⚠️ **`frameOverTime`·`startFrame`은 0~1로 정규화된 값이다.** 유니티가 칸 수를
// 곱하기 전 값을 적는다 — 그래서 곡선 배율이 0.9999다(실측: 1×4 칸에서도 1×1
// 칸에서도 같은 0.9999). 칸 번호 = ⌊값 × 칸 수⌋.
//
// ⚠️ **0번 칸은 왼쪽 위다.** 텍스처 V는 아래가 0이므로 줄 번호를 뒤집는다.
import { evalCurve } from './curve'
import type { UVModule } from './schema'

/** 그 입자의 칸 번호 */
export function sheetFrame(
  uv: UVModule, normAge: number, age: number, speed: number, rand: number,
): number {
  const tx = Math.max(1, uv.tilesX ?? 1)
  const ty = Math.max(1, uv.tilesY ?? 1)
  const row = (uv.animationType ?? 0) === 1
  const total = row ? tx : tx * ty
  if (total <= 1) return 0
  const start = evalCurve(uv.startFrame, 0, rand, 0)
  const mode = uv.timeMode ?? 0
  let v: number
  if (mode === 2) {
    // 초당 칸 수 — 수명과 상관없이 돈다
    const f = Math.floor(age * (uv.fps ?? 30) + start * total)
    return ((f % total) + total) % total
  }
  if (mode === 1) {
    const [lo, hi] = uv.speedRange ?? [0, 1]
    const x = hi > lo ? Math.min(1, Math.max(0, (speed - lo) / (hi - lo))) : 0
    v = evalCurve(uv.frameOverTime, x, rand, 0)
  } else {
    const cycles = uv.cycles ?? 1
    const raw = normAge * cycles
    const x = cycles > 1 ? raw - Math.floor(raw) : Math.min(1, raw)
    v = evalCurve(uv.frameOverTime, x, rand, 0)
  }
  const f = Math.floor((v + start) * total)
  return ((f % total) + total) % total
}

/** 한 줄 모드에서 이 입자가 쓰는 줄. 1 무작위 · 그 밖은 `rowIndex` */
export function sheetRow(uv: UVModule, rand: number): number {
  const ty = Math.max(1, uv.tilesY ?? 1)
  if ((uv.animationType ?? 0) !== 1) return 0
  if ((uv.rowMode ?? 0) === 1) return Math.min(ty - 1, Math.floor(rand * ty))
  return Math.min(ty - 1, Math.max(0, uv.rowIndex ?? 0))
}

/**
 * 칸 → UV 사각형 [u0, v0, du, dv]. `uv' = uv · (du, dv) + (u0, v0)`
 *
 * @param row 한 줄 모드의 줄 (`sheetRow`)
 */
export function sheetRect(uv: UVModule, frame: number, row: number, out: Float32Array | number[], o = 0): void {
  const tx = Math.max(1, uv.tilesX ?? 1)
  const ty = Math.max(1, uv.tilesY ?? 1)
  const single = (uv.animationType ?? 0) === 1
  const col = single ? frame % tx : frame % tx
  const r = single ? row : Math.floor(frame / tx) % ty
  out[o] = col / tx
  out[o + 1] = 1 - (r + 1) / ty
  out[o + 2] = 1 / tx
  out[o + 3] = 1 / ty
}
