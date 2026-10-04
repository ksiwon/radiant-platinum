// 등신 몸에 실리는 배틀 클립 이름 (DATA.md §2.16)
//
// 배틀 무대에는 사람이 서지 않는다 (사용자 결정 2026-10-04). 이 이름들은 굽는 쪽
// (`engine/actor/npcModels`의 `TRAINER_CLIPS`)과 변환 시험이 같은 값을 보려고 남아 있다

/**
 * 등신 몸에 실린 배틀 클립.
 *
 * 굽는 쪽이 이 넷만 싣는다 (`engine/actor/npcModels`의 `TRAINER_CLIPS`).
 * 길이는 PLAN.md의 클립 표에서 잰 값이다
 */
export const TRAINER_CLIP = {
  /** 배틀에 들어서는 동작. 4.13초 */
  advent: 'advent_b',
  /** 명령을 기다리며 쉬는 동작. **되풀이한다** — 나머지 셋은 한 번만 돈다 */
  wait: 'wait_b',
  /** 공을 던지며 지시하는 동작. 2.33초 */
  order: 'order_b',
  /** 진 동작. 5.50초 */
  lose: 'lose01_b',
} as const
