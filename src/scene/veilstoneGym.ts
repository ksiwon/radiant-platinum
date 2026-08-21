// 장막시티 체육관의 샌드백을 찬다 (PARITY §7.12)
//
// 규칙과 표는 `engine/world/veilstoneGym`이 들고 있고 여기는 **지금 놓인
// 자리**와 **프레임**을 맡는다.
//
// ⚠️ **차는 것이 명령이 아니라 A다.** 스크립트도 좌표 트리거도 없고, 말을
// 거는 자리에서 앞 칸에 샌드백이 있으면 그것을 찬다 (`field_control.c` 567줄).
//
// ⚠️ **한 번 무너진 타이어는 리포트에 안 남는다.** 원작이 맵을 떠날 때
// `initialized`만 남기고 객체는 지도 객체 목록에 맡기는데, 그 목록도 맵을
// 나가면 없어진다 — 다시 들어오면 열하나가 다시 선다
import {
  VEILSTONE_BAGS, VEILSTONE_FLAG, VEILSTONE_GYM_MAP, VEILSTONE_SFX, VEILSTONE_SLIDE_SPEED,
  VEILSTONE_STACKS, VEILSTONE_STEP, veilstoneKey, veilstoneTravel,
} from '../engine/world/veilstoneGym'
import { MAP_FEATURE, setMapFeature } from '../engine/world/mapFeatures'
import type { FeatureProp } from './movingProps'

interface Active {
  /** 샌드백 아홉의 지금 칸 */
  bags: [number, number][]
  /** 아직 서 있는 타이어 더미의 칸 */
  stacks: Set<string>
}

interface Sliding {
  index: number
  dir: number
  /** 남은 칸 수 */
  left: number
  /** 칸 안에서 얼마나 왔는가 (0~1) */
  frac: number
  /** 다 가면 무너뜨릴 타이어. 없으면 null */
  topple: string | null
}

let active: Active | null = null
let sliding: Sliding | null = null

/** 소리를 내는 자리. 씬이 꽂아 준다 */
export const veilstoneSound: {
  play: ((seq: number) => void) | null
  stop: ((seq: number) => void) | null
} = { play: null, stop: null }

/** 맵에 들어설 때 (`VeilstoneGym_DynamicMapFeaturesInit`) */
export function initVeilstoneGym(map: number): boolean {
  if (map !== VEILSTONE_GYM_MAP) return false
  setMapFeature(MAP_FEATURE.veilstoneGym)
  active = {
    bags: VEILSTONE_BAGS.map(([x, z]) => [x, z]),
    stacks: new Set(VEILSTONE_STACKS.map(([x, z]) => veilstoneKey(x, z))),
  }
  sliding = null
  return true
}

/** 미끄러지는 동안은 조작이 멈춘다 */
export function veilstoneBusy(): boolean {
  return sliding !== null
}

/**
 * 그 칸이 막혔는가.
 *
 * ⚠️ **원작은 여기서 아무것도 안 막는다** — 샌드백·타이어가 지도 객체라
 * 그쪽 판정이 맡는다. 우리에게는 그 자리에 세울 객체가 없어서 대신 막는다
 */
export function veilstoneBlockedAt(tileX: number, tileZ: number): boolean | null {
  if (active === null) return null
  const key = veilstoneKey(tileX, tileZ)
  if (active.stacks.has(key)) return true
  if (active.bags.some(([x, z]) => x === tileX && z === tileZ)) return true
  return null
}

/**
 * 앞 칸의 샌드백을 찬다 (`VeilstoneGym_HitPunchingBag`).
 *
 * @param tileX 주인공이 **바라보는** 칸
 * @param dir 원작 방향 번호 (북 0 · 남 1 · 서 2 · 동 3)
 * @returns 샌드백이 있어서 찼으면 true. 안 움직여도 참이다
 */
export function hitVeilstoneBag(tileX: number, tileZ: number, dir: number): boolean {
  if (active === null || sliding !== null) return false
  const index = active.bags.findIndex(([x, z]) => x === tileX && z === tileZ)
  if (index < 0) return false

  const { distance, flags } = veilstoneTravel(tileX, tileZ, dir, active.stacks)
  if (distance === 0) {
    // 꿈쩍도 안 한다 — 원작도 소리만 내고 끝난다
    veilstoneSound.play?.(VEILSTONE_SFX.hit)
    return true
  }

  const [dx, dz] = VEILSTONE_STEP[dir] ?? [0, 0]
  const endX = tileX + dx * distance, endZ = tileZ + dz * distance
  sliding = {
    index, dir, left: distance, frac: 0,
    topple: (flags & VEILSTONE_FLAG.tireStack) !== 0
      ? veilstoneKey(endX + dx, endZ + dz)
      : null,
  }
  veilstoneSound.play?.(VEILSTONE_SFX.slide)
  return true
}

/** 샌드백·타이어가 지금 그리는 자리 */
export function veilstoneProps(): FeatureProp[] {
  const now = active
  if (now === null) return []
  const out: FeatureProp[] = []
  for (const [i, [x, z]] of now.bags.entries()) {
    let fx = x, fz = z
    if (sliding !== null && sliding.index === i) {
      const [dx, dz] = VEILSTONE_STEP[sliding.dir] ?? [0, 0]
      fx += dx * sliding.frac
      fz += dz * sliding.frac
    }
    out.push({
      key: `샌드백${String(i)}`, model: VEILSTONE_MODEL.bag, from: 'fldeff',
      x: fx + 0.5 + VEILSTONE_NODE.bag[0], y: VEILSTONE_NODE.bag[1],
      z: fz + 0.5 + VEILSTONE_NODE.bag[2],
    })
  }
  for (const key of now.stacks) {
    const [x, z] = key.split(',').map(Number)
    out.push({
      key: `타이어${key}`, model: VEILSTONE_MODEL.stack, from: 'fldeff',
      x: (x ?? 0) + 0.5 + VEILSTONE_NODE.stack[0], y: VEILSTONE_NODE.stack[1],
      z: (z ?? 0) + 0.5 + VEILSTONE_NODE.stack[2],
    })
  }
  return out
}

/**
 * 모델 번호.
 *
 * ⚠️ **맵 소품이 아니다.** 원작이 이 셋을 `/data/mmodel/fldeff.narc`에서 읽어
 * 따로 그린다(`sVeilstoneGymObjectModelIDs` = 112·114·113). 깨어진 세계의
 * 소품과 같은 아카이브·같은 형식이라 그쪽 파이프라인에 이어 붙였고, 번호는
 * 그 목록에서의 자리다 (`tools/extract/distortionProps.js`)
 */
/**
 * 모델이 제 노드에 적어 둔 이동. **한 타일이 16유닛**이라 그 값을 16으로 나눈 것이다.
 *
 * ⚠️ **없으면 샌드백이 통째로 바닥 밑에 그려진다.** 우리 SBC 리더가 노드 명령을
 * 안 읽고 재질·폴리곤 짝만 가져와서(`import/platinum/chunks`의 `readSbc`),
 * 노드에 붙은 이동이 통째로 사라진다. 자리 표에 없는 값이라 아무도 안 잡았다 —
 * 스무 개가 `visible: true`로 제자리에 서 있는데 화면에는 하나도 안 나왔다.
 *
 * 실측(`fldeff.narc`의 노드 사전):
 *
 *   샌드백(113)      polySurface26  t = (0, 71.600, 0)   → y +4.475
 *   서 있는 타이어(114) pCube1         t = (0, 8.000, −6.000) → y +0.5 · z −0.375
 *
 * 견줘 보면 맞는다: 샌드백 기하가 y −4.48~−0.31이라 4.475를 올리면 밑동이
 * 바닥에 닿고, 타이어는 −0.52~0.33이라 0.5를 올리면 −0.02~0.83이 된다.
 *
 * ⚠️ **높이는 화면으로 봤고 z는 못 봤다.** 샌드백을 올리니 받침이 바닥에 닿은
 * 빨간 자루가 실제로 떴다(실측). 타이어의 z −0.375는 표에서 온 값이고, 그 방은
 * 카메라가 벽에 껴서 아직 눈으로 확인 못 했다 — 축 방향이 롬과 같은지도 안 쟀다.
 * 한 칸의 3/8이라 틀려도 제 칸을 벗어나지는 않는다
 *
 * ⚠️ **여기서만 고친다. 굽는 쪽에 넣으면 안 된다.** 이 롬의 자산은 노드 이동이
 * **이미 정점에 구워져 있는 자리가 있다** — 맵 청크 666개 중 이동을 단 채로
 * 그려지는 노드가 207개이고(청크 181의 `h_01floor1`이 −15타일), 그런데도 실내가
 * 지금 제대로 나온다. 깨어진 세계도 주인공이 판에 발을 딛고 선다. 전부 붙이면
 * 지금 맞는 것들이 어긋난다 — 샌드백만 안 구워져 있었다
 * ([REPAIR.md](../../docs/REPAIR.md) §12)
 */
const VEILSTONE_NODE = {
  stack: [0, 8 / 16, -6 / 16],
  bag: [0, 71.6 / 16, 0],
} as const

const VEILSTONE_MODEL = { toppled: 25, stack: 26, bag: 27 } as const

/** 한 프레임 (`VeilstoneGym_AnimationState_MovePunchingBag`) */
export function veilstoneTick(dt: number): void {
  if (active === null || sliding === null) return
  sliding.frac += VEILSTONE_SLIDE_SPEED * dt
  while (sliding.frac >= 1 && sliding.left > 0) {
    sliding.frac -= 1
    sliding.left--
    const [dx, dz] = VEILSTONE_STEP[sliding.dir] ?? [0, 0]
    const bag = active.bags[sliding.index]!
    bag[0] += dx
    bag[1] += dz
  }
  if (sliding.left > 0) return

  sliding.frac = 0
  veilstoneSound.stop?.(VEILSTONE_SFX.slide)
  veilstoneSound.play?.(VEILSTONE_SFX.hit)
  if (sliding.topple !== null) {
    active.stacks.delete(sliding.topple)
    veilstoneSound.play?.(VEILSTONE_SFX.topple)
  }
  sliding = null
}

/** 맵을 옮기면 없어진다 */
export function resetVeilstoneGym(): void {
  active = null
  sliding = null
}

/** 샌드백이 지금 어디 있는가 — 시험이 쓴다 */
export function veilstoneBagAt(index: number): readonly number[] | null {
  return active?.bags[index] ?? null
}

/** 아직 서 있는 타이어 더미 수 — 시험이 쓴다 */
export function veilstoneStacksLeft(): number {
  return active?.stacks.size ?? 0
}
