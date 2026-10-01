// BDSP **빛 재질**을 편다 — 더해서 그리고, 어두워지면 발광을 켠다 (docs/orders/VISUAL_20260930.md §2)
//
// 굽는 쪽이 재질 `extras`에 실어 둔 것을 읽는다 (`import/bdsp/arena.ts`의 `bakeLooks` · `lights`):
//
//   add      더해서 그린다 (원작 `_SrcBlend 5 · _DstBlend 1`)
//   glow     발광 세기 (`_EmissionColorIntensity`)
//   emitOn   발광이 켜지는 어둠 (`_EmissionOnTime`)
//
// ⚠️ **안 켜면 입구가 흰 판으로 막힌다.** 포켓몬센터 · 프렌들리숍 · 체육관 입구의 `PokeCenLight`는 바탕색이 0이고 더해서 그리므로
// 낮에는 아무것도 안 보여야 한다. 밤에는 발광 그림(입구 앞 빛 웅덩이)만 은은히 더해진다
//
// ⚠️ **더해도 0인 판은 끈다** (`visible`). 바탕이 검정이어도 무광 재질(`MeshStandardMaterial`)은 해의 정반사(F0 0.04)와 둘레 빛을
// 더해서, 낮 들판시티 체육관 앞 잔디 위에 테두리 또렷한 연한 판이 섰다(I-p11-9 — 잔디보다 G +10~13). 바탕이 검정인 더하기
// 판은 발광이 0인 동안(`glowShare` 0) 그리지 않고, 발광이 없는 것(`OutLight`)은 늘 안 그린다 — 원작도 검정을 더하니 안 보인다
import { AdditiveBlending, Material, Mesh, MeshStandardMaterial, type Color, type Object3D } from 'three'
import { timeBlend, TimeOfDay, type TimeOfDayId } from '../engine/map/timeOfDay'

/**
 * 시간대마다 **어둠** (0~1) — 원작 `_EmissionOnTime`과 견주는 값이다.
 *
 * ⚠️ **BDSP의 곡선을 읽은 것이 아니다.** 원작은 이 문턱을 제 시계로 재는데 그 식은 번들에 없다. 번들이 적은 문턱들 —
 * 문 0.3 · 입구 빛 0.4 · 바깥 등 0.5 · 간판 글씨 0.6 · 높이 안개 0 — 이 **해질녘에 차례로 켜지는 순서**라서, 해질녘을 그 한가운데
 * (0.5)에 두고 밤 · 심야를 1로 둔다. 그러면 입구 빛은 해질녘부터, 간판 글씨는 밤부터 켜진다
 */
const DARKNESS: Readonly<Record<TimeOfDayId, number>> = {
  [TimeOfDay.MORNING]: 0,
  [TimeOfDay.DAY]: 0,
  [TimeOfDay.TWILIGHT]: 0.5,
  [TimeOfDay.NIGHT]: 1,
  [TimeOfDay.LATE_NIGHT]: 1,
}

/** 문턱을 넘고 이만큼 더 어두워지면 다 켜진다 — 시간대 경계에서 툭 켜지지 않게 */
const RAMP = 0.1

/** 지금 시각의 어둠. 시간대 경계 앞뒤는 `timeBlend`대로 섞는다 */
export function darknessAt(hour: number): number {
  const { from, to, k } = timeBlend(hour)
  return DARKNESS[from] * (1 - k) + DARKNESS[to] * k
}

/** 어둠이 이만큼일 때 발광 배수 (0~1) */
export function glowShare(darkness: number, emitOn: number): number {
  return Math.min(1, Math.max(0, (darkness - emitOn) / RAMP))
}

interface Glowing { material: MeshStandardMaterial, glow: number, emitOn: number }

/** 바탕이 검정인 더하기 판 — 발광이 있을 때만 그린다. 발광이 없는 판이면 `glowing`이 `null`이고 늘 안 그린다 */
interface Dim { material: Material, glowing: Glowing | null }

/** 바탕색이 검정인가 — 그림은 바탕색에 곱해지므로 그림이 있어도 0이다 */
function blackBase(m: Material): boolean {
  const c = (m as { color?: Color }).color
  return c !== undefined && c.r === 0 && c.g === 0 && c.b === 0
}

export interface BdspLights {
  /** 지금 시각으로 발광과 검은 더하기 판의 보이기를 맞춘다. 바뀐 것이 없으면 아무것도 안 한다 */
  update(hour: number): void
}

/** 장면 안의 빛 재질을 편다. 더하는 것은 여기서 한 번 바꾸고, 발광은 `update`가 시각마다 맞춘다 */
export function bdspLights(root: Object3D): BdspLights {
  const glowing: Glowing[] = []
  const adding: Material[] = []
  const seen = new Set<Material>()
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
    for (const m of mats) {
      const extras = m.userData as { add?: boolean, glow?: number, emitOn?: number }
      if (extras.add === true) {
        o.castShadow = false
        if (!seen.has(m)) {
          m.blending = AdditiveBlending
          m.transparent = true
          m.depthWrite = false
          // 흐림(`fieldFade`)이 되돌릴 값도 같이 — 안 고치면 한 번 흐렸다 풀 때 깊이를 도로 쓴다
          const rest = m.userData.rest as { transparent: boolean, depthWrite: boolean } | undefined
          if (rest) { rest.transparent = true; rest.depthWrite = false }
          adding.push(m)
        }
      }
      if (!seen.has(m) && typeof extras.glow === 'number' && m instanceof MeshStandardMaterial) {
        glowing.push({ material: m, glow: extras.glow, emitOn: extras.emitOn ?? 0 })
        m.emissiveIntensity = 0
      }
      seen.add(m)
    }
  })
  const dims: Dim[] = adding.filter(blackBase).map((m) => ({
    material: m, glowing: glowing.find((g) => g.material === m) ?? null,
  }))
  // 첫 `update` 전에도 낮 판이 서지 않게 — 발광이 0에서 시작한다
  for (const d of dims) d.material.visible = false
  let last = Number.NaN
  return {
    update(hour) {
      const dark = darknessAt(hour)
      if (dark === last) return
      last = dark
      for (const g of glowing) g.material.emissiveIntensity = g.glow * glowShare(dark, g.emitOn)
      for (const d of dims) d.material.visible = d.glowing !== null && d.glowing.material.emissiveIntensity > 0
    },
  }
}
