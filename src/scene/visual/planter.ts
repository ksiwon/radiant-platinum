// 사각 화분 — 형상에 원본 역할색을 입힌다 (FIRST_PERSON §6.1)
//
// 색은 **정점색**이다. 텍스처를 안 붙이는 것은 원본이 위에서 내려다본 그림이라
// 어느 면에도 그대로 못 붙기 때문이다(§6.4-6과 같은 까닭). 명암은 조명이 준다.
import { BufferAttribute, Color, type BufferGeometry } from 'three'
import { fenceGeometry, PLANTER, planterGeometry, shrubGeometry } from './geometry'
import type { FenceSwatch, PlanterSwatch, ShrubSwatch } from './swatches'

/**
 * 원본 판 폭 중 **화분이 차지하는 몫**.
 *
 * 화분 칸 16텍셀 중 둘레 한 줄씩이 투명이라 몸통은 14텍셀이다 (묶음 0·6 둘 다 —
 * `docs/orders/FIRST_PERSON_FP_20260917.md`). 판이 한 칸이면 화분은 0.875칸이다
 */
export const PLANTER_FILL = 14 / 16

/** sRGB 정수 → 선형 rgb. `Color.setHex`가 작업 색공간(선형)으로 한 번 바꾼다 */
function linear(hex: number): [number, number, number] {
  const c = new Color().setHex(hex)
  return [c.r, c.g, c.b]
}

/**
 * 역할색을 입힌 화분 하나. 원점은 밑면 한가운데, 폭 `width`(타일).
 *
 * - 용기: 앞면색, 밑면만 모서리색
 * - 림: 위를 보는 면은 림색, 옆면은 림 모서리색
 * - 흙: 그림에 흙이 없으면 **가장 어두운 잎색**으로 채운다 — 원본에 없는 색을
 *   지어내지 않으려는 것이다(그 그림에서 흙 자리는 잎 그늘로 보인다)
 * - 식물: 높이에 따라 잎색을 밝은 것부터 위에서 아래로
 */
export function paintedPlanter(width: number, swatch: PlanterSwatch): BufferGeometry {
  const shape = planterGeometry(width)
  const g = shape.geometry
  const pos = g.getAttribute('position').array
  const nor = g.getAttribute('normal').array
  const index = g.getIndex()!.array
  const colors = new Float32Array(pos.length)
  const leaves = swatch.leaves.map(linear)
  const darkest = swatch.leaves[swatch.leaves.length - 1]!
  const soilTop = (PLANTER.body + PLANTER.rimHeight - PLANTER.soilDrop) * width
  const plantTop = soilTop + PLANTER.plantHeight * width
  const slotColor = [
    linear(swatch.container), linear(swatch.rim), linear(swatch.soil ?? darkest),
  ]
  const edge = linear(swatch.containerEdge)
  const rimEdge = linear(swatch.rimEdge)
  for (const grp of g.groups) {
    const slot = grp.materialIndex ?? 0
    for (let t = grp.start; t < grp.start + grp.count; t++) {
      const i = index[t]!
      let rgb: [number, number, number]
      if (slot === 3) {
        const h = Math.max(0, Math.min(1, (pos[i * 3 + 1]! - soilTop) / (plantTop - soilTop)))
        const band = Math.min(leaves.length - 1, Math.floor((1 - h) * leaves.length))
        rgb = leaves[band]!
      } else if (slot === 0) {
        rgb = nor[i * 3 + 1]! < -0.5 ? edge : slotColor[0]!
      } else if (slot === 1) {
        rgb = nor[i * 3 + 1]! > 0.5 ? slotColor[1]! : rimEdge
      } else {
        rgb = slotColor[2]!
      }
      colors[i * 3] = rgb[0]
      colors[i * 3 + 1] = rgb[1]
      colors[i * 3 + 2] = rgb[2]
    }
  }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  return g
}

/**
 * 역할색을 입힌 **둥근 덤불** 하나 (§3 — 화분과 다른 계열). 원점은 밑면 한가운데.
 *
 * 잎은 높이에 따라 밝은 것부터 위에서 아래로. 밑 링도 **가장 어두운 잎색**이다 —
 * 원본 밑줄의 그늘색(`swatch.shade`)은 땅에 그린 그림자라 입체에 칠하지 않는다
 * (§5.4). 칠했더니 덤불 밑에 검은 받침이 붙은 것처럼 보였다 (2026-09-17 요새 212번도로)
 */
export function paintedShrub(width: number, swatch: ShrubSwatch): BufferGeometry {
  const g = shrubGeometry(width).geometry
  const pos = g.getAttribute('position').array
  const index = g.getIndex()!.array
  const colors = new Float32Array(pos.length)
  const leaves = swatch.leaves.map(linear)
  const base = leaves[leaves.length - 1]!
  const top = g.boundingBox!.max.y
  for (const grp of g.groups) {
    for (let t = grp.start; t < grp.start + grp.count; t++) {
      const i = index[t]!
      let rgb: [number, number, number]
      if ((grp.materialIndex ?? 0) === 1) rgb = base
      else {
        const h = Math.max(0, Math.min(1, pos[i * 3 + 1]! / top))
        rgb = leaves[Math.min(leaves.length - 1, Math.floor((1 - h) * leaves.length))]!
      }
      colors[i * 3] = rgb[0]
      colors[i * 3 + 1] = rgb[1]
      colors[i * 3 + 2] = rgb[2]
    }
  }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  return g
}

/**
 * 역할색을 입힌 **말뚝 울타리** 한 토막 (§6.2). 칸 차례는 `FENCE_SLOTS`.
 *
 * 면마다 한 색이다 — 기둥 앞뒤는 앞면색, 옆은 모서리색, 위는 윗면색. 가로대는
 * 위만 윗면색이고 나머지는 앞면색이다. 명암은 조명이 준다
 */
export function paintedFence(length: number, u0: number, u1: number, swatch: FenceSwatch): BufferGeometry {
  const g = fenceGeometry(length, u0, u1).geometry
  const index = g.getIndex()!.array
  const colors = new Float32Array(g.getAttribute('position').array.length)
  const bySlot = [swatch.postFront, swatch.postTop, swatch.postEdge, swatch.railTop, swatch.railFront].map(linear)
  for (const grp of g.groups) {
    const rgb = bySlot[grp.materialIndex ?? 0]!
    for (let t = grp.start; t < grp.start + grp.count; t++) {
      const i = index[t]!
      colors[i * 3] = rgb[0]
      colors[i * 3 + 1] = rgb[1]
      colors[i * 3 + 2] = rgb[2]
    }
  }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  return g
}
