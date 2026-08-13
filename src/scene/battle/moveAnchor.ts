// 기술이 어디서 나가서 어디를 맞히는가 (PARITY §7.3)
//
// ⚠️ **한동안 전부 상수였다.** 줄기도 덩어리도 y=1.2에서 나가고 발밑 고리는
// 반지름 1.5였는데, 화면에 서는 키는 디그다 0.30m부터 갸라도스 3.54m까지다 —
// 작은 쪽은 머리 위 네 배 높이로 빔이 지나갔고 큰 쪽은 배를 뚫고 지나갔다.
// 「기술 위치가 안 맞는다」가 그것이다.
//
// 그래서 **그 자리에 선 몸**에서 뽑는다. 무대가 대기 동작일 때 실제로 재서
// 적어 두는 값이다 (`stageRefs`의 `slotBody`, `BattleStage`의 `Slot`).
import { tallOf } from './stageRefs'

/**
 * 키에 대한 비율 셋.
 *
 * 네발도 두발도 함께 담아야 해서 사람 몸 비율을 그대로 못 쓴다. 입은 어깨
 * 위쯤, 맞는 자리는 몸통 한가운데, 몸 둘레는 키의 절반이 안 되게 잡았다
 */
export const MUZZLE = 0.78
export const TORSO = 0.55
export const GIRTH = 0.45

/** 이 자리에서 기술이 나가는 높이(m) */
export function muzzleY(slot: string): number {
  return tallOf(slot) * MUZZLE
}

/** 이 자리에서 기술이 맞는 높이(m) */
export function torsoY(slot: string): number {
  return tallOf(slot) * TORSO
}

/** 이 자리를 감싸는 반지름(m) */
export function girth(slot: string): number {
  return tallOf(slot) * GIRTH
}

/**
 * 도형 크기의 배수.
 *
 * ⚠️ **두 몸의 평균으로 잡는다.** 때리는 쪽만 보면 갸라도스가 디그다를 칠 때
 * 디그다가 도형에 통째로 묻히고, 맞는 쪽만 보면 그 반대가 된다.
 *
 * 위아래로 묶어 둔다 — 잉어킹 0.9m와 레쿠쟈 3.5m 사이에서 도형이 열 배씩
 * 벌어지면 같은 기술로 안 보인다
 */
export function shapeSpan(by: string, at: string): number {
  const mean = (tallOf(by) + tallOf(at)) / 2
  return Math.min(1.6, Math.max(0.45, mean / 1.4))
}
