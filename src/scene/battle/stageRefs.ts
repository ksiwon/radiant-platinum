// 배틀 무대와 엔진 사이의 얇은 다리 (sceneRefs와 같은 역할).
//
// 카메라는 매 프레임 `EngineDriver`가 한 군데서 쓴다. 배틀 무대가 자기 useFrame에서
// 카메라를 옮기면 그 뒤에 도는 EngineDriver가 오버월드 값으로 도로 덮어쓴다 —
// R3F는 priority 오름차순으로 콜백을 돌리고 EngineDriver가 1이기 때문이다.
// 그래서 "지금 카메라를 누가 갖는가"를 여기 두고 EngineDriver가 물어본다.
import { Vector3 } from 'three'
import { BATTLE_FOV } from '../../engine/battle/shots'

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
}

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
 * 지금 도는 기술 연출이 무대에 요구하는 것 (PARITY §7.3).
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
 * 자리마다 **실제로 서 있는 몸의 크기** (PARITY §7.3).
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
