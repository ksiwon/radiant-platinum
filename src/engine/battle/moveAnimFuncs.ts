// 대본이 전용 태스크(`Func_*`)로만 서는 기술의 몸 효과 — 자료 표(`moveAnimTable`)가 못 담은 것을 디컴프에서 옮긴다.
//
// BDSP는 이 기술들의 연출을 안 만들었다(소드실드에서 빠진 기술이라 BDSP에서 어떤 포켓몬도 못 배운다 — 시퀀스가 `DummyLabel` 한 줄).
// 우리는 플래티넘이라 쓸 수 있으므로 원작 DS 대본이 정본이다. 이미터가 없고 전용 태스크로 서는 기술을 여기서 몸 효과 값으로 옮긴다.
import type { MoveAnim } from './moveAnimTable'

/**
 * 맞는 소리 · 몸 효과가 도는 길이(프레임)와 흔들림. 근거: `src/battle_anim/script_funcs_0.c`
 *
 * 지진(`Func_Magnitude`, 222) — `BattleAnimTask_Magnitude`: **모든 배틀러의 스프라이트와 배경 층**을 `ShakeContext`로 흔든다.
 * 가로 폭 `MAGNITUDE_SHAKE_BASE_EXTENT(2) + 세기 단계`, 세로 폭 = 세기 단계, 간격 0(`MAGNITUDE_SHAKE_INTERVAL`), 횟수 10
 * (`MAGNITUDE_SHAKE_AMOUNT`). 단계는 위력으로 정한다(150→6 · 110→5 · 90→4 · 70→3 · 50→2 · 30→1 · 그 밖 0). 크기(4~10)를 굴리는 위력은 우리
 * 엔진이 대본에 안 넘기므로 중간 단계 **3(위력 70, 매그니튜드 6~7)**으로 고정한다 — 우리 값이다. 소리 `SEQ_SE_DP_W070`을 8프레임마다 둘 돈다
 * (`PlayLoopedSoundEffectC … 2, 8`)
 */
const MAGNITUDE_LEVEL = 3

/** 전용 태스크 대본에 몸 효과를 채운다. 해당 없으면 그대로 */
export function patchBareAnim(move: number, anim: MoveAnim | null): MoveAnim | null {
  if (anim === null) return anim
  if (move === 222) {
    const x = 2 + MAGNITUDE_LEVEL
    const y = MAGNITUDE_LEVEL
    const cycles = 10
    return {
      ...anim,
      // 몸(양쪽 다)과 배경 층이 같이 흔들린다
      shake: { who: 'both', x, y, interval: 1, cycles, power: Math.max(x, y) * cycles },
      camera: { x, y, interval: 1, power: Math.max(x, y) * cycles },
      frames: cycles * 3,
    }
  }
  return anim
}
