// 갤럭시단아지트의 감금장치 셋 (PARITY §1.25)
//
// 호수 삼신을 가둔 통이다. **이야기 길목에 서 있는데 화면에 없었다** — 스크립트
// 명령 둘(`InitLakeGuardianContainmentUnits`·`DeactivateLakeGuardianContainmentUnits`)이
// 안 만들어져 있어서, 아지트 꼭대기에 올라가도 빈 방이었다.
//
// 원작은 소품 하나에 애니 두 벌을 얹는다
// (`overlay006/lake_guardian_containment_units.c`):
//
//   0번  가둬 두는 동안 도는 것. **풀어 줄 때 마지막 프레임에서 멈춘다**
//   1번  통이 열리는 것. 한 번만 돌고(`SetLoopCount(1)`) 선다
//
// 처음 세울 때 갈래가 둘이다:
//
//   아직 안 풀어 줬다   1번을 **0프레임에서 멈춰** 둔다 (닫힌 통)
//   이미 풀어 줬다      0번을 멈추고, 1번을 **마지막 프레임으로 보내** 멈춘다
//
// 즉 「열린 통」은 애니를 끝까지 보낸 자리이지 다른 모델이 아니다.
//
// 푸는 차례는 상태 셋이다(`Task_DeactivateContainmentUnits`):
//
//   0  0번이 **마지막 프레임에 닿을 때까지 기다렸다가** 멈춘다
//   1  1번을 푼다 (열리기 시작)
//   2  1번이 한 바퀴를 마치면 끝
//
// ⚠️ **여는 그림은 우리 것이다.** 원작의 두 애니는 소품 모델에 딸린 nsbca고
// 우리 소품 파이프라인은 정지 메시만 굽는다 — 꿀 나무와 같은 처지다
// (PARITY §6.6). **상태 기계와 박자는 그대로 옮기고**, 통이 어떻게 열리는지만
// 우리가 만든다 (`scene/lakeGuardianUnits`).

/** 갤럭시단아지트. 감금장치가 있는 유일한 맵이다 */
export const LAKE_GUARDIAN_MAP = 494

/**
 * `lake_guardian_containment_unit.nsbmd`의 소품 번호.
 *
 * `res/field/props/models/meson.build`의 차례다 — 첫 줄이 0번이라 498번째
 * 줄이 496이다 (꿀 나무가 28번째 줄의 26인 것과 같은 셈)
 */
export const LAKE_GUARDIAN_MODEL = 496

/** `FLAG_FREED_GALACTIC_HQ_POKEMON` — 이 플래그가 「이미 풀어 줬다」다 */
export const FLAG_FREED_GALACTIC_HQ = 2429

/** 통 하나가 지금 어떤 꼴인가 */
export const UNIT_STATE = {
  /** 닫혀 있다 — 1번 애니 0프레임 */
  held: 0,
  /** 열리는 중 — 1번 애니가 도는 동안 */
  opening: 1,
  /** 열렸다 — 1번 애니 마지막 프레임 */
  freed: 2,
} as const

export type UnitState = (typeof UNIT_STATE)[keyof typeof UNIT_STATE]

/**
 * 맵에 들어설 때의 처음 꼴 (`LakeGuardianContainmentUnit_InitAnimations`).
 *
 * 풀어 준 뒤에 다시 들어오면 **열린 채로** 서 있어야 한다 — 원작이 1번 애니를
 * 마지막 프레임으로 보내 놓는 것이 그것이다
 */
export function initialUnitState(freed: boolean): UnitState {
  return freed ? UNIT_STATE.freed : UNIT_STATE.held
}

/**
 * 여는 데 걸리는 시간(초). **우리 값이다** — 원작 대응물이 nsbca 프레임 수라
 * 안 굽는 이상 못 옮긴다.
 *
 * 원작은 0번 애니가 한 바퀴를 마치기를 기다렸다가 열기 시작하므로 「기다림 →
 * 열림」의 두 마디가 있다. 그 모양만 지킨다
 */
export const UNIT_OPEN = {
  /** 0번 애니가 마지막 프레임에 닿기를 기다리는 동안 (상태 0) */
  settleSeconds: 0.45,
  /** 통이 열리는 동안 (상태 1~2) */
  openSeconds: 1.1,
} as const

/** 여는 동안의 진행도 0~1. `settle`을 지난 뒤부터 오른다 */
export function openProgress(elapsedSeconds: number): number {
  const t = (elapsedSeconds - UNIT_OPEN.settleSeconds) / UNIT_OPEN.openSeconds
  return t <= 0 ? 0 : t >= 1 ? 1 : t
}

/** 다 열렸는가. 스크립트가 이걸로 기다림을 푼다 */
export function openFinished(elapsedSeconds: number): boolean {
  return elapsedSeconds >= UNIT_OPEN.settleSeconds + UNIT_OPEN.openSeconds
}
