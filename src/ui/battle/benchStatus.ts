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
// - 파티 전체를 낫게 하는 기술(치유방울·아로마테라피)이 **재생기에 닿은** 순간 — 상대 쪽은
//   파티 요약이 없어서 이것 말고는 벤치가 나은 것을 알 길이 없다. 원작은 쓴 쪽 트레이너의
//   파티를 낫게 한다 (`BattleSystem_GetParty(battler)`) — 같은 주인의 벤치만 지운다
//
// 배틀이 끝나면(`phase` 'off') 비운다.
import { ownerOfKey } from '../../engine/battle/aftermath'
import type { PartySlot } from '../../engine/battle/choice'
import type { BattleEvent } from '../../engine/battle/events'
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
  /** 재생기가 방금 접은 사건 (`battleStore.played`) */
  played: readonly BattleEvent[] = [],
): StatusMap {
  let out: Map<string, string> | null = null
  const put = (key: string, status: string | null): void => {
    const now = (out ?? map).get(key) ?? null
    if (now === status) return
    out ??= new Map(map)
    if (status === null) out.delete(key)
    else out.set(key, status)
  }
  for (const e of played) {
    const by = teamCureBy(e)
    if (by === null) continue
    const owner = ownerOfKey(by)
    for (const key of [...(out ?? map).keys()]) if (ownerOfKey(key) === owner) put(key, null)
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

/**
 * 파티 전체를 낫게 한 사건이면 쓴 마리의 키. 4세대에서 `-cureteam`은 아로마테라피뿐이고
 * 치유방울은 `-activate`로 온다 (`messages`의 `ACTIVATE`와 같은 갈래)
 */
function teamCureBy(e: BattleEvent): string | null {
  if (e.kind === 'cureteam') return e.actor.name
  if (e.kind === 'activate' && e.actor !== null
    && (e.effect.id === 'healbell' || e.effect.id === 'aromatherapy')) return e.actor.name
  return null
}

let known: StatusMap = new Map()

useBattleStore.subscribe((s, prev) => {
  if (s.phase === 'off') { known = new Map(); return }
  if (s.view === prev.view && s.party === prev.party && prev.phase !== 'off') return
  known = foldBenchStatus(known, s.view, s.party, s.played === prev.played ? [] : s.played)
})

/** 그 마리가 마지막으로 보인 상태. 멀쩡하거나 모르면 null */
export function benchStatusOf(key: string): string | null {
  return known.get(key) ?? null
}
