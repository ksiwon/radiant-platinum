// 진화 장면의 규칙 두 가지 — 화면 밖에서 시험할 수 있게 순수 함수로 뗐다.
import { EVO_BEATS, evolutionCanCancel, type EvolutionBeats } from '../../engine/pokemon/evolutionBeat'

/**
 * 지금 X로 진화를 멈출 수 있는가.
 *
 * **레벨 진화만, 교대하는 40~242프레임에만** 받는다. 원작은 레벨이면 `flags 0x1`, 돌이면 `NULL`을 넘기고(`start_menu.c:1738-1742`),
 * 교환 진화는 `0x4`(`trade.c:99`)이며 `evolution.c:283`은 `flags & 0x1`일 때만 B를 받는다.
 * 안내(`[X] 그만둔다`)가 뜨는 구간과 같은 함수를 쓴다
 */
export function canStopEvolution(byLevel: boolean, frame: number, beats: EvolutionBeats = EVO_BEATS): boolean {
  return byLevel && evolutionCanCancel(frame, beats)
}
