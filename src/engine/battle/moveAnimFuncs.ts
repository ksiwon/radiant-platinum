// 대본이 전용 태스크(`Func_*`)로만 서는 기술의 몸 효과 — 자료 표(`moveAnimTable`)가 못 담은 것을 디컴프에서 옮긴다.
//
// BDSP는 이 기술들의 연출을 안 만들었다(소드실드에서 빠진 기술이라 BDSP에서 어떤 포켓몬도 못 배운다 — 시퀀스가 `DummyLabel` 한 줄).
// 우리는 플래티넘이라 쓸 수 있으므로 원작 DS 대본이 정본이다. 이미터가 없고 전용 태스크로 서는 기술을 여기서 몸 효과 값으로 옮긴다.
import { ASSIST_FRAMES, FORESIGHT_FRAMES, ODOR_FRAMES, SNATCH_FRAMES } from './dsBodyFx'
import type { MoveAnim } from './moveAnimTable'

/**
 * 맞는 소리 · 몸 효과가 도는 길이(프레임)와 흔들림. 근거: `src/battle_anim/script_funcs_0.c`
 *
 * 지진(`Func_Magnitude`, 222) — `BattleAnimTask_Magnitude`: **모든 배틀러의 스프라이트와 배경 층**을 `ShakeContext`로 흔든다.
 * 가로 폭 `MAGNITUDE_SHAKE_BASE_EXTENT(2) + 세기 단계`, 세로 폭 = 세기 단계, 간격 0(`MAGNITUDE_SHAKE_INTERVAL`), 횟수 10
 * (`MAGNITUDE_SHAKE_AMOUNT`). 단계는 위력으로 정한다(150→6 · 110→5 · 90→4 · 70→3 · 50→2 · 30→1 · 그 밖 0). 소리 `SEQ_SE_DP_W070`을 8프레임마다 둘 돈다
 * (`PlayLoopedSoundEffectC … 2, 8`)
 */
/** 굴림을 모를 때(대본 길이를 묻는 자리) 쓰는 중간 단계 */
const MAGNITUDE_DEFAULT_LEVEL = 3

/**
 * 매그니튜드의 굴린 수(4~10) → 흔들림 단계. 원작은 위력으로 가른다(10→0 · 30→1 · 50→2 · 70→3 · 90→4 · 110→5 · 150→6) —
 * 위력이 수 4~10에 차례로 10 · 30 · 50 · 70 · 90 · 110 · 150이라 `수 − 4`다 (sim의 `onModifyMove`가 같은 표다)
 */
function magnitudeLevel(magnitude: number | null): number {
  return magnitude === null ? MAGNITUDE_DEFAULT_LEVEL : Math.max(0, Math.min(6, Math.round(magnitude) - 4))
}

/** 전용 태스크 대본에 몸 효과를 채운다. 해당 없으면 그대로. `magnitude`는 그 기술이 굴린 수 */
export function patchBareAnim(move: number, anim: MoveAnim | null, magnitude: number | null = null): MoveAnim | null {
  if (anim === null) return anim
  if (move === 222) {
    const level = magnitudeLevel(magnitude)
    const x = 2 + level
    const y = level
    const cycles = 10
    return {
      ...anim,
      // 몸(양쪽 다)과 배경 층이 같이 흔들린다
      shake: { who: 'both', x, y, interval: 1, cycles, power: Math.max(x, y) * cycles },
      camera: { x, y, interval: 1, power: Math.max(x, y) * cycles },
      frames: cycles * 3,
    }
  }
  // 아래 넷은 몸 복제 · 입체 메시(`scene/battle/DsBodyFx`)가 그리고, 여기는 몸에 거는 것과 길이만 준다 (`dsBodyFx` 머리말)
  if (move === 193) {
    // 선견 — 눈이 훑은 뒤 맞는 몸이 하얗게 번쩍인다 (`FORESIGHT_SPRITE_FLASH_*`: 색 31/31/31 · 알파 0 → 10)
    return { ...anim, tint: { who: 'defender', color: [31, 31, 31], alpha: 10 }, frames: FORESIGHT_FRAMES, unknownWait: false }
  }
  if (move === 274) return { ...anim, frames: ASSIST_FRAMES, unknownWait: false }
  if (move === 289) {
    // 슬쩍 — 쓴 몸은 감추고 복제가 달린다(`Func_Snatch`). 작은 몸짓(`lunge`)은 짝수 갈래의 것이라 뺀다
    return { ...anim, lunge: null, vanish: true, frames: SNATCH_FRAMES, unknownWait: false }
  }
  if (move === 316) {
    // 냄새맡기 — 복제 둘이 흔들리고(`Func_Shake ±20`), 쓴 몸은 4px × 2회만 떤다 (`Func_Shake 4, 0, 1, 2`)
    return { ...anim, shake: { who: 'attacker', x: 4, y: 0, interval: 1, cycles: 2, power: 8 }, frames: ODOR_FRAMES, unknownWait: false }
  }
  return anim
}
