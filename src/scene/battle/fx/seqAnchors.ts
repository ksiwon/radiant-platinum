// 시퀀스의 `node` 번호 → 몸의 로케이터 (BATTLE_FX §4).
//
// BDSP 포켓몬 모델에는 이펙트용 로케이터가 노드로 들어 있다(`EffMouth01` · `EffCenter01` ·
// `EffFront01` · `EffOverHead01` …, `models/pokemon/*.glb`). 시퀀스는 그것을 **번호**로 부르는데
// 번호 → 이름 표가 롬에 없다(코드 쪽 열거형이다). 그래서 쓰임새로 짝지었다 — 시퀀스 1,235벌에서
// 번호마다 붙는 프리팹 이름을 세어 본 것이다:
//
//   0  발밑 (smoke · under · bg)         → Origin
//   2  입 (muzzle · bullet · voice)       → EffMouth01
//   5  맞는 자리 (hit 251 · df 169)       → EffFront01
//   6  머리 위 (sleep · cry · sweat)      → EffOverHead01
//   15 몸 가운데 (charge · chara · 카메라 393) → EffCenter01
//   16 땅 (ground · landing · sea)        → Origin
//
// 나머지는 드물어(≤ 89회) 가까운 것으로 둔다. ⚠️ 이 표는 짐작이다 — 화면으로 맞춘다.
import { STAGE_ORIGIN, slotRig, tallOf } from '../stageRefs'
import { Vector3, type Object3D } from 'three'
import type { SeqAnchor } from '../../../engine/battle/fx/sequence'

const NODE_NAMES: Readonly<Record<number, readonly string[]>> = {
  0: ['Origin'],
  1: ['Waist', 'EffCenter01'],
  2: ['EffMouth01', 'EffShoot01_01', 'EffHeadCenter01'],
  3: ['EffHorn01', 'EffHeadCenter01'],
  4: ['Origin'],
  5: ['EffFront01', 'EffCenter01'],
  6: ['EffOverHead01', 'EffHeadCenter01'],
  7: ['EffEye01', 'EffHeadCenter01'],
  8: ['EffHeadCenter01', 'EffMouth01'],
  13: ['EffTail01', 'EffCenter01'],
  15: ['EffCenter01', 'Waist'],
  16: ['Origin'],
}

/** 몸이 없을 때(도트) 키에 대한 높이 비율 */
const NODE_HEIGHT: Readonly<Record<number, number>> = {
  0: 0, 4: 0, 16: 0, 2: 0.7, 3: 0.95, 6: 1.05, 7: 0.85, 8: 0.8,
}

const cache = new WeakMap<Object3D, Map<number, Object3D | null>>()
const tmp = new Vector3()

function locator(root: Object3D, node: number): Object3D | null {
  let m = cache.get(root)
  if (!m) { m = new Map(); cache.set(root, m) }
  if (m.has(node)) return m.get(node)!
  let hit: Object3D | null = null
  for (const name of NODE_NAMES[node] ?? ['EffCenter01']) {
    hit = root.getObjectByName(name) ?? null
    if (hit) break
  }
  m.set(node, hit)
  return hit
}

/**
 * 자리의 로케이터 (무대 좌표).
 *
 * @param spot 그 자리의 발판 (x, z) — 몸을 아직 못 그렸을 때 쓴다
 */
export function slotAnchor(slot: string, node: number, spot: [number, number]): SeqAnchor {
  const rig = slotRig[slot]
  const yaw = rig?.yaw ?? 0
  const root = rig?.root ?? null
  if (root) {
    const hit = locator(root, node)
    if (hit) {
      hit.getWorldPosition(tmp).sub(STAGE_ORIGIN)
      return { pos: [tmp.x, tmp.y, tmp.z], yaw }
    }
  }
  const body = rig?.body ?? null
  const base: [number, number, number] = body
    ? [body.getWorldPosition(tmp).x - STAGE_ORIGIN.x, 0, tmp.z - STAGE_ORIGIN.z]
    : [spot[0], 0, spot[1]]
  base[1] = tallOf(slot) * (NODE_HEIGHT[node] ?? 0.5)
  return { pos: base, yaw }
}
