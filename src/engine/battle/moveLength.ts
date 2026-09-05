// 기술 하나의 연출이 몇 프레임인가 (PARITY §2.13).
//
// 원작은 기술마다 전용 대본을 돌리고 그 대본이 끝날 때까지 다음 글이 안 뜬다
// (`BattleAnimSystem`). 길이는 두 갈래로 정해진다:
//
//   `Delay` · `WaitForAnimTasks`  대본 자체가 서는 시간 → `anim.frames`
//   `WaitForAllEmitters`          입자가 다 사그라질 때까지 → `.spa`가 안다
//
// ⚠️ **둘째를 빼면 연출이 잘린다.** 대본 468 중 415가 입자를 기다리고, 그중
// 절반 넘게가 `Delay`를 아예 안 쓴다 — 몸통박치기의 대본에는 `Delay`가 한 줄도
// 없다. 첫째만 세면 그런 기술은 「길이 0」이 된다.
//
// ⚠️ **길이가 하나로 고정돼 있던 동안 무엇이 잘렸나.** 마흔 프레임으로 두었을
// 때 대본 468 중 340이 그보다 길었고(중앙값 60), 프레임 마흔 뒤에 붙는 이미터
// 일흔아홉 벌은 **서기 전에 화면이 끝났다.**
import { MOVE_FRAMES } from './vfx'
import type { MoveAnim } from './moveAnimTable'
import { splLifeFrames } from './spl/emitter'
import type { SplFile } from './spl/resource'

/**
 * 연출이 이보다 길면 자른다.
 *
 * ⚠️ **원작 값이 아니라 우리 상한이다.** 롬에서 제일 긴 대본이 194프레임이라
 * 이 값에 걸리는 기술은 지금 없다 — 자료가 이상하거나(수명이 터무니없이 긴
 * 자원) 우리 계산이 틀렸을 때 배틀이 멈춰 보이지 않게 하는 마개다
 */
const MAX_FRAMES = 300

/**
 * 대본 하나의 연출 길이 (프레임, 60fps).
 *
 * @param anim 기술 연출 대본. 없으면 지금까지의 한 벌짜리 길이다
 * @param fileFor 입자 묶음의 멤버 하나. 아직 안 받았으면 `null`
 */
export function moveAnimFrames(
  anim: MoveAnim | null,
  fileFor: (member: number) => SplFile | null,
): number {
  if (anim === null) return MOVE_FRAMES

  let frames = anim.frames
  // 길이를 모르는 전용 태스크를 기다리는 대본 여든셋은 지금까지의 값을 바닥으로
  // 깐다 — 그 태스크들을 옮기기 전까지는 이것이 우리가 아는 전부다
  if (anim.unknownWait) frames = Math.max(frames, MOVE_FRAMES)

  if (anim.waits) {
    const member = new Map(anim.loads.map((l) => [l.ps, l.member]))
    for (const e of anim.emitters) {
      const at = member.get(e.ps)
      const file = at === undefined ? null : fileFor(at)
      const res = file?.resources[e.res]
      if (res === undefined) continue
      const life = splLifeFrames(res)
      // 스스로 안 끝나는 자원은 원작도 대본 끝에서 걷어 간다 — 길이를 안 늘린다
      if (life !== null) frames = Math.max(frames, e.at_frame + life)
    }
  }

  // 아무것도 안 알려 주는 대본 열셋(따라하기·자연의힘처럼 몸이 비어 있다)은
  // 지금까지의 값 그대로 간다. 0으로 두면 기술 이름이 뜨자마자 사라진다
  return Math.min(MAX_FRAMES, frames === 0 ? MOVE_FRAMES : frames)
}
