// 이긴 순간의 곡 — 박자에 신호를 단다 (`battle_controller_player.c` 4263~4318 · `battle_script.c` 9725 · 10497)
//
// 원작은 곡을 **그 자리에서** 갈아 튼다:
//   트레이너 · 시설 — 결판이 난 순간(마지막 마리가 쓰러지고 경험치까지 다 준 뒤) · 「○○와의 승부에서 이겼다!」 앞
//   야생 — 야생이 다 쓰러진 뒤 **첫 경험치 줄**이 시작될 때(`SEQ_GET_EXP_START`)
//   포획 — 「잡았다!」를 찍는 순간(`SEQ_CATCH_MON_PRINT_POKEMON_WAS_CAUGHT`). 수납 소리(`SEQ_SE_DP_GETTING`)는 흔들림이
//          다 끝난 그 앞 박자다
// 박자에 `music` · `sound`를 달면 재생기가 그 박자를 시작할 때 부른다(`beatRunner`의 `cue`).
import type { Beat } from '../../engine/battle/playback'
import { SFX } from '../../engine/audio/sfx'
import { trainerVictorySong, VICTORY } from '../../engine/audio/battleSongs'

interface VictoryCase {
  kind: 'wild' | 'trainer' | 'factory' | 'safari'
  outcome: string | null
  /** 첫 상대의 분류 */
  trainerClass: number | null
  /** 판 끝에 붙은 줄 수 (`bookends.closingLines`) — 박자 목록의 꼬리다 */
  closing: number
}

/** `beats`를 고쳐 쓴다 — 새 목록을 만들지 않는다(재생기가 같은 목록을 쥐고 걷는다) */
export function markVictory(beats: Beat[], c: VictoryCase): void {
  // 포획 — 잡힌 볼의 흔들림 박자 다음이 「잡았다!」다 (`playback`의 `ball` 갈래: 흔들림 → 글 → 꼬리)
  const ball = beats.findIndex((b) => b.events.some((e) => e.kind === 'ball' && e.caught))
  if (ball >= 0 && beats[ball + 1] !== undefined) {
    beats[ball + 1] = { ...beats[ball + 1]!, music: VICTORY.wild, sound: SFX.CAUGHT }
    return
  }
  if (c.outcome !== 'win') return
  const firstClosing = beats.length - c.closing
  if (c.kind === 'trainer' || c.kind === 'factory') {
    if (c.closing > 0) beats[firstClosing] = { ...beats[firstClosing]!, music: trainerVictorySong(c.trainerClass) }
    return
  }
  // 야생 — 상대가 마지막으로 쓰러진 박자(몸) 뒤의 「쓰러졌다!」 줄 **다음** 글이 첫 경험치 줄이다. 경험치 줄이 없으면
  // (레벨 100) 끝말에 단다 — 원작은 줄이 없어도 그 자리에서 튼다
  let last = -1
  beats.forEach((b, i) => { if (b.events.some((e) => e.kind === 'faint' && e.actor.side === 'p2')) last = i })
  if (last < 0) return
  const said = beats.findIndex((b, i) => i > last && b.text !== null)
  const next = said < 0 ? -1 : beats.findIndex((b, i) => i > said && b.text !== null)
  const at = next >= 0 ? next : c.closing > 0 ? firstClosing : -1
  if (at >= 0) beats[at] = { ...beats[at]!, music: VICTORY.wild }
}
