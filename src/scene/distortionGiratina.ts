// 깨어진 세계 — 기라티나가 지나가고, 그림자가 돌고, 내려온다 (PARITY §6.10)
//
// 셋 다 사건 명령이 부르는 연출이다 (`distortionEvents`). 표는 자료에 있고
// 여기서는 프레임만 센다 — 프레임 수를 지어내지 않는다.
import { type Movable } from '../engine/script/movement'
import { SFX } from '../engine/audio/sfx'
import { music } from '../engine/audio/music'
import { SPECIES_GIRATINA } from '../engine/pokemon/form'
import { npcActors } from '../engine/actor/npcs'
import { distortionHooks, setState, state, toLocalTiles } from './distortionCore'

/**
 * 세우고 거두는 무리 범위 (`GIRATINA_ROOM_PLATFORMS_*_GHOST_PROP_GROUP`).
 *
 * 셋이다 — 1·2·3. 세울 때는 1에서 3으로 올라가고 거둘 때는 3에서 1로 내려간다
 */
const GIRATINA_ROOM_GROUP = { first: 1, last: 3 } as const

/** 첫 무리가 서기까지 (`GIRATINA_ROOM_SHOW_PLATFORMS_INITIAL_DELAY`) */
const SHOW_INITIAL_DELAY = 36

/** 다음 무리까지 (`..._SHOW_PLATFORMS_DELAY` · `..._HIDE_PLATFORMS_DELAY`, 둘 다 48) */
const STEP_DELAY = 48

/** 거둘 때의 첫 뜸 (`GIRATINA_ROOM_HIDE_PLATFORMS_INITIAL_DELAY`) */
const HIDE_INITIAL_DELAY = 16

interface GhostRun {
  /** 다음에 손댈 무리 */
  group: number
  /** 남은 프레임 */
  delay: number
  show: boolean
}

let ghost: GhostRun | null = null

/**
 * 기라티나 방의 발판 무리를 한 무리씩 세우거나 지운다
 * (`EVENT_CMD_SHOW/HIDE_GIRATINA_ROOM_PLATFORMS`).
 *
 * ⚠️ **이 둘을 「연출」로 넘기면 그 방에서 길이 안 생긴다.** 숨은 소품 여섯이
 * 영영 안 나타나서 못 나간다 — 세우는 쪽은 무리 1에서, 지우는 쪽은 무리 3에서
 * 시작하고 첫 뜸도 서로 다르다 (36프레임 · 16프레임)
 */
export function startGhostRun(show: boolean): void {
  ghost = show
    ? { group: GIRATINA_ROOM_GROUP.first, delay: SHOW_INITIAL_DELAY, show: true }
    : { group: GIRATINA_ROOM_GROUP.last, delay: HIDE_INITIAL_DELAY, show: false }
}

/** 발판이 서거나 거둬지는 중인가. 도는 동안은 조작을 막는다 */
export function distortionGhostRunning(): boolean {
  return ghost !== null
}

/**
 * 한 프레임 (`EventCmdShowGiratinaRoomPlatforms_ShowPlatforms`).
 *
 * 48프레임마다 한 무리씩이다. 한 번에 다 세우지 않는 이유가 있다 — 원작은
 * 발판이 하나씩 솟는 것을 보여 주고, 그 사이에 소리를 끊는다
 */
export function distortionGhostTick(dt: number): void {
  const run = ghost
  if (run === null) return
  run.delay -= dt * 60
  if (run.delay > 0) return

  const s = state()
  const bit = 1 << run.group
  setState({ hiddenGroups: run.show ? s.hiddenGroups & ~bit : s.hiddenGroups | bit })
  run.delay = STEP_DELAY
  run.group += run.show ? 1 : -1

  const done = run.show
    ? run.group > GIRATINA_ROOM_GROUP.last
    : run.group < GIRATINA_ROOM_GROUP.first
  if (done) ghost = null
}

/**
 * 지나가는 기라티나 (`PROP_KIND_GIRATINA_SHADOW` = 20).
 *
 * 네 자리에서 돈다 — 1F에서 신오와 함께 올려다보는 것 하나(스크립트가
 * `StartDistortionWorldGiratinaShadowEvent`로 부른다), B4F 둘, 기라티나 방 둘.
 * 앞의 셋은 밟는 사건이 물고 있고(`EVENT_CMD_SHOW_GIRATINA_SHADOW`) 그동안
 * **사건이 선다** — 다 지나갈 때까지 다음 명령으로 안 넘어간다
 * (`EventCmdShowGiratinaShadow_Finish`).
 *
 * ⚠️ **몸짓은 아직 없다.** 원작은 이 소품에 nsbca가 붙어 날갯짓을 하는데
 * (`PROP_ANIM_KIND_GIRATINA_SHADOW`) 우리가 굽는 것은 정지 메시 하나다.
 * 자리·크기·방향·소리·프레임 수는 표 그대로다
 */
export const GIRATINA_SHADOW_KIND = 20

/**
 * 방향 다섯 (`sGiratinaShadowPropRotAngles`). 도 단위의 (x, y, z)다.
 *
 * ⚠️ **4번만 자리가 반 칸 밀린다** — 원작이 `rotAnglesIndex == 4`일 때만
 * `pos.x += FX32_ONE * 8`을 더한다 (`..._AnimInit`)
 */
const SHADOW_ROT: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], [0, 180, 0], [0, 90, 0], [0, 270, 0], [90, 0, 0],
]

/** `GIRATINA_SHADOW_PROP_SFX_KIND_*` */
const SHADOW_SFX = { none: 0, cry: 1, flee: 2 } as const

/**
 * 자료의 고정소수점을 타일로 바꾸는 나눔수.
 *
 * `pos`는 `타일 << 4`에 `FX32_ONE`을 곱한 값이라 한 타일이 16 × 4096이다 —
 * 크기(`scale`)만 `FX32_ONE`이 1이라 4096으로 나눈다
 */
const SHADOW_UNIT = 16 * 4096

const FX32_ONE = 4096

interface ShadowRun {
  /** 지금 자리 (세계 타일) */
  x: number
  y: number
  z: number
  /** 한 프레임에 가는 타일 */
  dx: number
  dy: number
  dz: number
  step: number
  total: number
  scale: number
  rot: readonly [number, number, number]
}

let shadow: ShadowRun | null = null


/**
 * 그림자를 띄운다 (`LoadGiratinaShadowPropAnimation`).
 *
 * 표 한 줄을 그대로 받는다 — 사건 명령의 인자든 `giratinaShadows`의 것이든
 * 같은 `DistWorldGiratinaShadowTemplate`이다
 */
export function startDistortionShadow(t: Readonly<Record<string, number | number[] | null>>): void {
  const num = (k: string): number => (typeof t[k] === 'number' ? t[k] : 0)
  const vec = (k: string): number[] => (Array.isArray(t[k]) ? t[k] : [0, 0, 0])
  const rotIndex = num('rotAnglesIndex')
  const delta = vec('posDelta')
  const scale = vec('scale')
  shadow = {
    // ⚠️ 자리는 **타일 그대로**다. 원작이 `타일 << 4`로 올려 잡을 뿐이라
    // 나눠 되돌리면 표에 적힌 그 칸이다
    x: num('initialTileX') + (rotIndex === 4 ? 0.5 : 0),
    y: num('initialTileY'),
    z: num('initialTileZ'),
    dx: (delta[0] ?? 0) / SHADOW_UNIT,
    dy: (delta[1] ?? 0) / SHADOW_UNIT,
    dz: (delta[2] ?? 0) / SHADOW_UNIT,
    step: 0,
    total: num('movementAnimSteps'),
    scale: (scale[0] ?? FX32_ONE) / FX32_ONE,
    rot: SHADOW_ROT[rotIndex] ?? SHADOW_ROT[0]!,
  }
  // 소리는 **뜨는 첫 프레임에 한 번**이다 (`GIRATINA_SHADOW_PROP_STATE_SFX`)
  const kind = num('soundKind')
  if (kind === SHADOW_SFX.cry) void music.playCry(SPECIES_GIRATINA)
  else if (kind === SHADOW_SFX.flee) void music.playEffect(SFX.GIRATINA_FLEE)
}

/** 그림자를 거둔다 (`DistWorld_FinishGiratinaShadowEvent`) */
export function finishDistortionShadow(): void {
  shadow = null
}

/** 지금 어디에 어떻게 떠 있는가. 없으면 null. 자리는 **이 층의** 타일이다 */
export function distortionShadowAt(): {
  x: number; y: number; z: number; scale: number; rot: readonly [number, number, number]
} | null {
  if (shadow === null) return null
  const [lx, ly, lz] = toLocalTiles(shadow.x, shadow.y, shadow.z)
  return { x: lx, y: ly, z: lz, scale: shadow.scale, rot: shadow.rot }
}

/**
 * 한 프레임 (`DistWorldGiratinaShadowProp_AnimTick`).
 *
 * ⚠️ **다 가도 스스로 사라지지 않는다.** 사건이 물고 있던 것은 사건이
 * 거두고(`EventCmdShowGiratinaShadow_Finish`), 스크립트가 띄운 1F의 그것은
 * 스크립트가 `FinishDistortionWorldGiratinaShadowEvent`로 거둔다 — 그동안
 * 주인공과 신오가 그 자리에서 놀라는 몸짓을 한다
 */
export function distortionShadowTick(dt: number): void {
  const run = shadow
  if (run === null || run.step >= run.total) return
  const steps = dt * 60
  run.x += run.dx * steps
  run.y += run.dy * steps
  run.z += run.dz * steps
  run.step += steps
}

/** 다 지나갔는가 (`IsGiratinaShadowAnimationFinished`) */
export function distortionShadowDone(): boolean {
  return shadow === null || shadow.step >= shadow.total
}

/**
 * 기라티나가 하늘에서 내려선다 (`sPlayGiratinaArrivalHandlers`).
 *
 * 진행도 12로 (15,14)를 떠날 때 딱 한 번 돈다. 원작의 다섯 걸음 중 우리가
 * 그리는 것은 **세우기와 내려오기**다 —
 *
 *   ① 배치표의 기라티나(번호 128)를 세우고 **10칸 위**에 띄운다
 *   ② 하늘이 어두워지는 동안 내려온다. 1칸 남을 때까지는 프레임당 1/16칸,
 *      그 뒤로는 절반 속도다 (`..._DESCEND_Y_FAST/SLOW_DECREMENT`)
 *   ③ 새까맣던 몸이 90프레임에 걸쳐 밝아진다
 *   ④ 30프레임 쉬고 끝난다 (`..._WAIT_DELAY`)
 *
 * ⚠️ **①이 없으면 기라티나가 아예 안 선다.** 배치표의 조건은 「진행도 == 13」인데
 * 층에 들어설 때 한 번만 세우므로, 방 안에서 진행도가 12→13이 되는 이 자리에서
 * 원작이 `AddMapObjectWithLocalID`로 따로 세운다. 이걸 빼면 이야기대로 걸어
 * 들어왔을 때 (15,13)이 빈 채로 남는다 — 실제로 그랬다.
 *
 * ⚠️ **몸빛과 하늘빛은 아직 없다.** 원작은 팔레트를 16단계로 물들이는데
 * (`SPRITE_PALETTE_MAX_TINT_LEVEL`) 우리 오버월드 포켓몬은 GLB 재질이라
 * 그 층이 없다. 길이만 원작 그대로 둔다
 */
const ARRIVAL_LIFT = 10

/** `..._DESCEND_Y_FAST_DECREMENT` 0x1000 = 한 게임 단위 = 1/16칸 */
const ARRIVAL_FAST = 1 / 16

/** `..._DESCEND_Y_SLOW_DECREMENT` 0x800 — 마지막 한 칸은 절반 속도다 */
const ARRIVAL_SLOW = 1 / 32

/** 느려지는 높이 (`..._DESCEND_Y_SLOW_THRESHOLD` = 1칸) */
const ARRIVAL_SLOW_AT = 1

/** 몸이 다 밝아지기까지 (`16 ÷ (16 ÷ (3 × 30))`) */
const ARRIVAL_BRIGHTEN = 90

/** 다 내려선 뒤 (`..._WAIT_DELAY`) */
const ARRIVAL_WAIT = 30

/** 기라티나 방의 그것 (`DIST_WORLD_MAP_OBJECT_GIRATINA_ROOM_GIRATINA`) */
const GIRATINA_LOCAL_ID = 128

interface ArrivalRun {
  target: Movable
  /** 아직 남은 높이 (칸) */
  lift: number
  /** 다 내려선 뒤 흐른 프레임 */
  after: number
}

let arrival: ArrivalRun | null = null


export function beginArrival(): boolean {
  distortionHooks.addObject?.(GIRATINA_LOCAL_ID)
  const target = npcActors.byLocalID.get(GIRATINA_LOCAL_ID)
  if (target === undefined) return false
  target.offsetY = ARRIVAL_LIFT
  arrival = { target, lift: ARRIVAL_LIFT, after: 0 }
  void music.playEffect(SFX.GIRATINA_ARRIVE)
  return true
}

/** 한 프레임. 다 끝났으면 true */
export function tickArrival(dt: number): boolean {
  const run = arrival
  if (run === null) return true
  const steps = dt * 60
  if (run.lift > 0) {
    run.lift = Math.max(0, run.lift
      - (run.lift > ARRIVAL_SLOW_AT ? ARRIVAL_FAST : ARRIVAL_SLOW) * steps)
    run.target.offsetY = run.lift
    return false
  }
  run.target.offsetY = 0
  run.after += steps
  if (run.after < ARRIVAL_BRIGHTEN + ARRIVAL_WAIT) return false
  arrival = null
  return true
}
