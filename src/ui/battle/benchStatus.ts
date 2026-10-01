// 벤치에 있는 마리의 상태 이상 — 트레이너 공 줄이 읽는다 (PARITY §2.2b).
//
// 원작 공 줄(`PartyGaugeData_Fill`)은 **파티 전원의** `STOCK_STATUS`를 쓴다. 화면의
// 뷰(`view.active`)는 지금 서 있는 네 자리만 들고 있어서, 독에 걸린 채 물러난 마리가
// 공 줄에서 멀쩡한 초록으로 돌아갔다.
//
// 그래서 키마다 **마지막으로 본 상태**를 따로 남긴다:
//
// - 뷰에 서 있는 동안 본 상태 — 재생기가 민 만큼이다. 정본을 보면 글보다 공이 먼저 바뀐다
// - 우리 쪽은 명령을 물을 때 오는 파티 요약(`party`)의 상태 — 처음부터 벤치에 있던
//   마리(필드에서 독에 걸려 온 마리)와 벤치를 낫게 한 것(치료방울)이 여기서 들어온다
//
// 배틀이 끝나면(`phase` 'off') 비운다.
import type { PartySlot } from '../../engine/battle/choice'
import type { BattleView } from '../../engine/battle/view'
import { useBattleStore } from '../../state/battleStore'

/** 키 → 상태 약자 (`psn`·`slp`…). 멀쩡하면 없다 */
type StatusMap = ReadonlyMap<string, string>

/**
 * 한 번 접는다. 바뀐 것이 없으면 **같은 지도**를 돌려준다.
 *
 * 뷰가 파티 요약보다 나중에 온다 — 둘이 같은 마리를 다르게 말하면 서 있는 쪽이
 * 재생기가 방금 보여 준 값이라 그쪽이 맞다
 */
export function foldBenchStatus(
  map: StatusMap, view: BattleView | null, party: readonly PartySlot[],
): StatusMap {
  let out: Map<string, string> | null = null
  const put = (key: string, status: string | null): void => {
    const now = (out ?? map).get(key) ?? null
    if (now === status) return
    out ??= new Map(map)
    if (status === null) out.delete(key)
    else out.set(key, status)
  }
  for (const slot of party) {
    if (slot.active) continue
    put(slot.key, slot.fainted ? null : slot.status)
  }
  if (view) {
    for (const mon of Object.values(view.active)) {
      if (mon) put(mon.key, mon.status === 'ok' ? null : mon.status)
    }
  }
  return out ?? map
}

let known: StatusMap = new Map()

useBattleStore.subscribe((s, prev) => {
  if (s.phase === 'off') { known = new Map(); return }
  if (s.view === prev.view && s.party === prev.party && prev.phase !== 'off') return
  known = foldBenchStatus(known, s.view, s.party)
})

/** 그 마리가 마지막으로 보인 상태. 멀쩡하거나 모르면 null */
export function benchStatusOf(key: string): string | null {
  return known.get(key) ?? null
}
