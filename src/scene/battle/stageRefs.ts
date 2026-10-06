// 배틀 무대와 엔진 사이의 얇은 다리 (sceneRefs와 같은 역할).
//
// 카메라는 매 프레임 `EngineDriver`가 한 군데서 쓴다. 배틀 무대가 자기 useFrame에서
// 카메라를 옮기면 그 뒤에 도는 EngineDriver가 오버월드 값으로 도로 덮어쓴다 —
// R3F는 priority 오름차순으로 콜백을 돌리고 EngineDriver가 1이기 때문이다.
// 그래서 "지금 카메라를 누가 갖는가"를 여기 두고 EngineDriver가 물어본다.
import { Vector3, type Object3D } from 'three'
import { BATTLE_FOV } from '../../engine/battle/shots'
import type { ArenaCollider } from '../../engine/battle/fx/arenaCollider'

export const battleStage = {
  /** 배틀 무대가 카메라를 가져갔는가 */
  active: false,
  position: new Vector3(),
  target: new Vector3(),
  /**
   * 세로 전각(도). **BDSP가 배틀에 쓰는 30이다** (`shots`의 `BATTLE_FOV`).
   *
   * 필드는 55°인데, 포켓몬이 실측 크기(모부기 0.397m)로 서므로 그 렌즈로는
   * 화면 높이의 4%짜리 점이 된다. 파트너 고르는 장면과 같은 방식이다
   */
  fov: BATTLE_FOV,
  /** 굴림(라디안) — BDSP 시퀀스의 `CameraTwist`. 기본 0 */
  roll: 0,
}

/**
 * 지금 선 무대의 지오메트리 충돌 — 시퀀스 카메라가 벽 · 천장 구조물에 안 박히게 (`fx/cameraClamp`).
 * 무대(`BattleStage`의 `Arena`)가 설 때 한 번 짓고 내려갈 때 지운다. 받는 중 · 깨어진 세계는 `null`이다
 */
export const arenaRoom: { current: ArenaCollider | null } = { current: null }

/**
 * 배틀 무대가 서는 자리. 오버월드에서 **멀리 떨어뜨린다.**
 *
 * 둘 다 씬에 올라간 채로 두고 카메라만 옮기는 방식이라, 가까이 두면 배틀 뒤로
 * 신오의 지형이 비친다. 신오는 y=0 평면이므로 아래로 크게 내리면 겹칠 일이 없다
 */
export const STAGE_ORIGIN = new Vector3(0, -500, 0)

/**
 * 파트너 고르는 장면도 같은 방식으로 카메라를 가져간다.
 *
 * 배틀과 다른 점 하나 — **화각을 같이 가져간다.** 원작이 그 장면만 세로 반각
 * 22°(전각 44°)로 잡아 두었고, 필드(55°) 그대로 두면 볼 셋이 훨씬 넓게 벌어진다
 * (`ui/field/starterScene`)
 */
export const starterStage = {
  active: false,
  position: new Vector3(),
  target: new Vector3(),
  /** 세로 전각(도) */
  fov: 44,
}

/** 그 장면이 서는 자리. 배틀과 반대쪽으로 올려 둔다 */
export const STARTER_ORIGIN = new Vector3(0, 500, 0)

/** 진화·부화가 카메라를 가져갈 때 쓰는 세 번째 무대. */
export const cinematicStage = {
  active: false,
  position: new Vector3(),
  target: new Vector3(),
  fov: 38,
}

/** 배틀·파트너 무대와 겹치지 않도록 더 아래에 둔다. */
export const CINEMATIC_ORIGIN = new Vector3(0, -1000, 0)

/**
 * 지금 도는 기술 연출이 무대에 요구하는 것 (PARITY §2.13).
 *
 * 원작 대본은 입자만 뿌리는 것이 아니라 **몸을 흔들고 눌리게 하고 물들이고
 * 감추고 화면을 흔든다.** 그건 도형을 그리는 `MoveVfx`가 아니라 무대가 할 일이라
 * 여기로 넘긴다 — `sceneRefs`·`battleStage`와 같은 방식이다.
 *
 * ⚠️ **`t`가 1을 넘으면 아무것도 안 걸린 것이다.** 연출이 끝나고 값을 안 지우면
 * 다음 턴까지 몸이 붉게 물든 채로 남는다
 */
export const moveImpact: {
  /** 0~1 진행. 1 이상이면 도는 연출이 없다 */
  t: number
  /** 때린 쪽·맞은 쪽. 몸에 거는 것은 이 둘로 가른다 */
  attacker: string | null
  defender: string | null
  /** 화면 흔들림 진폭(타일) */
  camera: number
  shake: { who: string; amount: number; hz: number } | null
  tint: { who: string; color: string; strength: number } | null
  squash: { who: string; x: number; y: number } | null
  /** 쓴 쪽이 사라진다 (구멍파기·공중날기) */
  vanish: boolean
} = {
  t: 1, attacker: null, defender: null,
  camera: 0, shake: null, tint: null, squash: null, vanish: false,
}

/**
 * 배틀이 열리는 순간의 땅 이펙트 (`engine/battle/encounterBurst`).
 *
 * ⚠️ **화면과 무대가 시계를 나눠 써야 한다** — 흰 막은 DOM이 덮고
 * (`ui/battle/BattleScreen`) 입자는 3D 무대가 뿌리는데, 원작에서는 같은
 * `SysTask_SetupUI` 안의 한 프레임 카운터다. 시작 시각을 여기 한 자리에 두고
 * 둘이 같이 읽는다 (진화·부화의 `cinematicStore.startedAt`과 같은 자리다)
 */
export const encounterBurst: { at: number; white: boolean } = { at: 0, white: true }

/** 연출이 끝났다. 걸어 둔 것을 전부 놓는다 */
export function clearMoveImpact(): void {
  moveImpact.t = 1
  moveImpact.attacker = null
  moveImpact.defender = null
  moveImpact.camera = 0
  moveImpact.shake = null
  moveImpact.tint = null
  moveImpact.squash = null
  moveImpact.vanish = false
}

/**
 * 자리마다 **실제로 서 있는 몸의 크기** (PARITY §2.13).
 *
 * ⚠️ **이걸 안 보면 기술이 허공에서 나간다.** 연출의 높이가 한동안 상수였다 —
 * 줄기도 덩어리도 y=1.2에서 나가고 발밑 고리는 반지름 1.5였다. 그런데 화면에
 * 서는 키가 디그다 0.30m에서 갸라도스 3.54m까지다. 작은 쪽은 머리 위 네 배
 * 높이로 빔이 지나가고, 큰 쪽은 배를 뚫고 지나간다.
 *
 * 발판마다 **자세를 먹인 뒤의 키**를 여기 적어 두고(`BattleStage`의 `Slot`이
 * 반 초에 한 번 재는 그 값이다) 연출이 그 비율로 자리를 잡는다
 */
export const slotBody: Record<string, number> = {}

/** 기본 키(m). 아직 안 재었거나 도트로 선 자리에 쓴다 */
export const SLOT_TALL = 1.4

/** 그 자리에 선 몸의 키. 못 재었으면 기본값 */
export function tallOf(slot: string): number {
  const tall = slotBody[slot]
  return tall !== undefined && tall > 0.05 ? tall : SLOT_TALL
}

/** 이 자리에 이 효과가 걸리는가 */
export function impactHits(who: string, slot: string): boolean {
  if (who === 'both') return slot === moveImpact.attacker || slot === moveImpact.defender
  if (who === 'attacker') return slot === moveImpact.attacker
  return slot === moveImpact.defender
}

/**
 * 자리마다 **몸이 나타나는 시각**(초, 연출 시계 `battleClock.now()`).
 *
 * ⚠️ **몸이 볼보다 먼저 나오면 안 된다.** 등판 연출은 「누가 그 자리에 섰다」를
 * 보고 시작하는데(`BattleBallEffects`가 `view.active`의 열쇠가 바뀌면 던진다),
 * 몸을 그리는 쪽은 같은 값을 보고 **그 프레임에 바로** 나타났다 — 그래서 포켓몬이
 * 먼저 서 있고 그 뒤에 볼이 날아와 터졌다.
 *
 * 던지는 쪽이 **볼이 열려 몸이 나타나는 시각**(내보내기 시퀀스의 `PokemonIntroMotion` — `captureTiming`의
 * `sendOutAppearAt`)을 여기 적고, 몸은 그때까지 안 나온다. 소리(울음) · 체력판도 이 시각을 기다린다.
 * 적힌 것이 없으면(연출이 안 도는 자리) 곧바로 나온다
 */
export const ballOpen: Record<string, number> = {}

/**
 * 자리마다 **몸이 사라지는 시각**(초, 연출 시계)과 그 몸의 열쇠 — 기절(`ee620` · `ee621`) · 포획(`ee101`) · 거두기(`ee610`)가
 * 몸을 지우는 프레임이다(`BattleBallEffects`가 적는다). 무대의 몸은 이 시각부터 안 그린다 — 시퀀스가 끝나 몸 값을 놓아도
 * 쓰러진 · 잡힌 몸이 다시 서지 않는다. 열쇠가 다르면(다음 마리) 안 따른다
 */
export const bodyGone: Record<string, { at: number; key: string }> = {}

/** 배틀이 끝나면 놓는다 — 안 지우면 다음 배틀 첫 몸이 옛 시각을 기다린다 */
export function clearBallOpen(): void {
  for (const key of Object.keys(ballOpen)) delete ballOpen[key]
  for (const key of Object.keys(bodyGone)) delete bodyGone[key]
}

/** 자리마다 선 몸의 상자 (무대 좌표) — 대기 자세에서 잰다(`BattleStage`의 `Slot`) */
export const slotBox: Record<string, { min: [number, number, number]; max: [number, number, number] }> = {}

/**
 * 자리마다 **선 몸의 뿌리**와 그 몸을 옮기는 그룹 (BATTLE_FX §4).
 *
 * BDSP 연출 시퀀스가 몸의 로케이터(`EffMouth01` · `EffCenter01` …)에 이펙트를 붙인다.
 * 로케이터는 BDSP 모델에 노드로 들어 있어서(`models/pokemon/*.glb`) 몸을 쥔 `Slot`이 여기
 * 적고 시퀀스가 읽는다. 도트로 선 자리는 `root`가 `null`이다. `shown`은 그 몸이 지금 화면에 서 있는가 —
 * 카메라 막이(`clampShot`)는 서 있는 몸의 상자만 본다
 */
export const slotRig: Record<string, { root: Object3D | null; body: Object3D | null; yaw: number; shown: boolean }> = {}

/**
 * 그 자리의 몸 기록을 지운다 — 종이 바뀌거나 몸이 졌을 때. ⚠️ 안 지우면 쓰러진 몸 · 바뀐 몸의 상자가 카메라 막이에
 * 남고(`clampShot`), 옛 뿌리를 읽은 로케이터(`slotAnchor`)가 크기 0의 몸에서 땅으로 무너진다
 */
export function clearSlotBody(slot: string): void {
  delete slotBody[slot]
  delete slotBox[slot]
  delete slotRig[slot]
}

/**
 * 지금 도는 BDSP 시퀀스들이 무대에 거는 것 (`scene/battle/fx/BdspSequence`).
 *
 * **여럿이 같이 돈다** — 더블 첫 등판은 볼 넷이 한꺼번에 날고, 기술 연출 중에 다른 자리가 쓰러질 수 있다. 그래서
 * 몸 값은 자리마다 · 카메라 · 흔들림 · 배경은 쓴 시퀀스(`owner`)를 들고, 시퀀스가 끝나면 **제 것만** 놓는다
 * (`releaseSeq`). 몸 값은 그 자리를 쥔 시퀀스가 있는 동안만 무대가 읽는다 — 끝나면 비운다. 안 비우면 다음 턴까지
 * 몸이 상대 앞에 서 있다
 */
export const seqStage: {
  /** 도는 시퀀스가 하나라도 있는가 */
  running: boolean
  /** 자리 → 그 자리 몸에 거는 값 (시퀀스 프레임을 같이 든다) */
  body: Record<string, SeqBodyPose | null>
  /** 자리 → 그 몸을 쥔 시퀀스 */
  bodyOwner: Record<string, symbol>
  /** 자리 → 그 몸을 감춘 시퀀스 (`PokemonVisibleOther` — 시퀀스 카메라가 선 동안만) */
  hide: Record<string, symbol>
  /** 화면 흔들림 진폭 (m) */
  shake: number
  /**
   * 시퀀스 카메라 — 기본 카메라를 받아 그 프레임 카메라를 낸다. 카메라 명령이 안 선 동안은 `null`을
   * 낸다(기본 카메라). 시퀀스가 없으면 함수째 `null`
   */
  camera: ((base: SeqCameraPose) => SeqCameraPose | null) | null
  /** 배경 물들임 (0~1 색 · 진하기) */
  back: { color: [number, number, number]; alpha: number } | null
  /** 카메라 · 흔들림 · 배경을 쓴 시퀀스 */
  owner: symbol | null
  /** 도는 시퀀스들 */
  live: Set<symbol>
  /** 자리 → 그 자리 체력판을 감춘 시퀀스 (`GaugeDispAll` · `GaugeDisp` — 화면을 쥔 시퀀스만) */
  gauge: Record<string, symbol>
} = { running: false, body: {}, bodyOwner: {}, hide: {}, shake: 0, camera: null, back: null, owner: null, live: new Set(), gauge: {} }

/** 시퀀스 카메라 (`engine/battle/fx/sequence`의 `SeqCamera`) — 무대 좌표 · 화각(도) · 굴림(라디안) */
interface SeqCameraPose {
  pos: [number, number, number]
  target: [number, number, number]
  fov: number
  roll: number
}

/** 시퀀스가 몸 하나에 거는 값 (`engine/battle/fx/sequence`의 `BodyPose`) + 그 시퀀스의 지금 프레임 */
export interface SeqBodyPose {
  offset: [number, number, number]
  scale: [number, number, number]
  visible: boolean
  glow: { color: [number, number, number]; power: number } | null
  turn: number
  shake: [number, number, number]
  motion: { name: 'attack' | 'damage' | 'wait' | 'cry' | 'down' | 'landB' | 'landC'; at: number } | null
  motionSpeed: number
  intro: boolean
  /** 그 시퀀스의 지금 프레임 (30fps) — `motion.at`과 견준다 */
  frame: number
}

/** 시퀀스가 돌기 시작한다 */
export function claimSeq(owner: symbol): void {
  seqStage.live.add(owner)
  seqStage.running = true
}

/** 시퀀스가 끝났다 — 제가 건 것만 놓는다 */
export function releaseSeq(owner: symbol): void {
  for (const slot of Object.keys(seqStage.bodyOwner)) {
    if (seqStage.bodyOwner[slot] !== owner) continue
    delete seqStage.bodyOwner[slot]
    delete seqStage.body[slot]
  }
  for (const slot of Object.keys(seqStage.hide)) if (seqStage.hide[slot] === owner) delete seqStage.hide[slot]
  for (const slot of Object.keys(seqStage.gauge)) if (seqStage.gauge[slot] === owner) delete seqStage.gauge[slot]
  if (seqStage.owner === owner) {
    seqStage.owner = null
    seqStage.camera = null
    seqStage.shake = 0
    seqStage.back = null
  }
  seqStage.live.delete(owner)
  seqStage.running = seqStage.live.size > 0
}

/** 다 놓는다 — 배틀이 내려갈 때 */
export function clearSeqStage(): void {
  for (const owner of [...seqStage.live]) releaseSeq(owner)
  seqStage.body = {}
  seqStage.bodyOwner = {}
  seqStage.hide = {}
  seqStage.gauge = {}
  seqStage.shake = 0
  seqStage.camera = null
  seqStage.back = null
  seqStage.owner = null
  seqStage.running = false
}
