// BDSP 맵이 **움직이게 하는 값** — 재질이 적어 둔 속도 · 흔들림을 glb 재질 `extras`로 옮긴다 (docs/orders/GAPS_20261011.md A)
//
// 원작 `Delphis/Map/Standard` 셰이더는 재질 값 몇 개로 그림을 흘리고 풀 · 나무를 흔든다. 두 굽는 쪽(`arena.ts` · 노드 쪽
// `tools/extract/bdspArena.py`)이 그 값을 다 버려서 BDSP 맵이 멈춰 있었다. 실행 쪽(`scene/bdspMotion`)이 읽는 `extras`:
//
//   texVel  [u, v]          그림이 흐르는 빠르기 (그림 한 장이 1초에 흐르는 비율 · 유니티 UV 방향 — 위가 +v)
//   scroll  [u, v]          `LineUVScroll`(`_ScrollSpeed`)의 줄 흐름
//   frames  { h, v, start, every }  `PhotoFrame`의 그림 교체 — h × v 칸을 `every`초마다 넘긴다
//   swing   { power, speed, dist, uv, scale, dir }  바람 흔들림 (정점 가중치는 속성 `_SWING`)
//
// ⚠️ **채널 대응은 추측이다.** `_TexVelocity`는 4성분인데 셰이더가 Switch 바이너리라 어느 성분이 어느 그림인지 읽을 수 없다.
// 값을 보면 `(0, 0.354, …)`처럼 xy만 있거나 `(0, 0, 0, 0.1)`처럼 zw만 있다 — xy를 `_MainTex`, zw를 `_LayerTex`의 속도로 읽고
// (층 그림이 밑그림인 재질은 zw부터), `_TexVelocity2`는 안 쓴다. 우리는 재질마다 그림 한 장만 굽는다.
//
// 노드 쪽(`bdspArena.py`의 `motion_extras`)과 **같은 JSON**이어야 한다 — 키 순서도 같다
import type { UnityValue } from './typetree'

type Props = Record<string, UnityValue>
const num = (v: UnityValue | undefined, fallback = 0): number => (typeof v === 'number' ? v : fallback)

interface Source { floats: Map<string, UnityValue>, colors: Map<string, UnityValue> }

/** 재질이 흔들림 · 흐름 값을 들고 있는가 — 켜진 것만 `extras`로 싣는다 */
export function motionExtras(look: Source | undefined, layered: boolean): Record<string, unknown> | null {
  if (!look) return null
  const color = (key: string): number[] | null => {
    const c = look.colors.get(key) as Props | undefined
    return c ? [num(c.r), num(c.g), num(c.b), num(c.a)] : null
  }
  const any = (v: readonly number[]): boolean => v.some((x) => x !== 0)
  const out: Record<string, unknown> = {}

  const vel = color('_TexVelocity')
  if (vel) {
    const main = [vel[0]!, vel[1]!]
    const layer = [vel[2]!, vel[3]!]
    const pick = layered ? (any(layer) ? layer : main) : (any(main) ? main : layer)
    if (any(pick)) out.texVel = pick
  }
  const speed = look.floats.get('_ScrollSpeed')
  if (typeof speed === 'number' && speed !== 0) out.scroll = [0, speed]

  const h = num(look.floats.get('_PatternH'), 1)
  const v = num(look.floats.get('_PatternV'), 1)
  const every = look.floats.get('_SwitchingTime')
  if (typeof every === 'number' && every > 0 && num(look.floats.get('_AutoSwitch')) > 0 && h >= 1 && v >= 1 && h * v > 1) {
    out.frames = { h: Math.trunc(h), v: Math.trunc(v), start: Math.trunc(num(look.floats.get('_StartFrameIndex'))), every }
  }

  if (num(look.floats.get('_SwingEnable')) > 0) {
    const scale = color('_SwingScale') ?? [0, 0, 0, 0]
    const dir = color('_WindDirection') ?? [1, 0, 0, 0]
    out.swing = {
      power: num(look.floats.get('_SwingPower'), 1),
      speed: num(look.floats.get('_SwingSpeed'), 1),
      dist: num(look.floats.get('_SwingDistribution'), 1),
      uv: num(look.floats.get('_SwingUV')),
      scale: [scale[0]!, scale[1]!, scale[2]!],
      dir: [dir[0]!, dir[1]!, dir[2]!],
    }
  }
  return Object.keys(out).length > 0 ? out : null
}

/**
 * **지역 · 방에 서는 파티클 표식** — `FieldEffect` 컴포넌트(`_effectId`)가 달린 물체의 자리. 폭포 · 분수 · 횃불 · 워프존 · 기계 불빛 …(번들 502개 · 66종).
 * `effectdatabase`의 `FieldEffectData[id]`가 프리팹을 가리키고(`import/bdsp/fx.ts`가 `data/fx/index.json`의 `fieldEffects`로 싣는다), 실행 쪽
 * (`scene/FieldFx`)이 가까운 것만 세운다. 표식은 메시 없는 노드이고 `extras.fx`가 번호다 — 노드 쪽(`bdspArena.py`)과 같다
 */
export const FX_NODE_PREFIX = 'fx:'

/** 흔들림 가중치 속성 이름 — glTF 사용자 속성은 `_`로 시작한다. three가 소문자(`_swing`)로 싣는다 */
export const SWING_ATTRIBUTE = '_SWING'

/**
 * 정점 가중치 — 정점 색 `R × A` (0 뿌리 → 1 끝). 나무 · 꽃은 R이 0(밑동)에서 1(끝)로 오르고 A는 꽉 차 있으며, 풀(`ComGrass`)은
 * RGB가 꽉 차고 A가 0에서 1로 오른다 — 어느 채널이 가중치인지는 셰이더를 못 읽어 **둘의 곱으로 짐작한다**(`docs/PARITY.md` 8.5b).
 * 정점 색 채널이 없으면 `null`이다(그 메시는 흔들지 않는다)
 */
export function swingWeights(color: Float32Array | undefined, dim: number | undefined, n: number): Float32Array | null {
  if (!color || dim === undefined || dim < 4 || color.length < n * dim) return null
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = Math.fround(color[i * dim]! * color[i * dim + 3]!)
  return out
}
