// 파티 공 줄의 칸 (PARITY §2.2b · REPAIR §122 · `PartyGaugeData_New` · `battle_controller.c` 2122)
//
// 원작의 공 줄은 **쪽마다 하나**다 — 트레이너마다 하나가 아니다:
//
//   · 상대 쪽에 트레이너가 둘이면(태그 더블·편과 함께) 한 줄에 **첫 상대의 파티를
//     0번 칸부터, 둘째 상대의 파티를 3번 칸부터** 채운다 (`PartyGaugeData_Fill(…, 0)`·
//     `(…, 3)`). 첫 상대가 넷 이상이면 넷째가 둘째 상대의 첫 마리에 덮인다 — 원작 그대로다
//   · 우리 쪽은 편이 있어도 **내 파티만**이다 — 합친 갈래는 통신 2vs2와 프론티어의 편
//     배틀에만 열린다(2133~2135). 이야기의 편 배틀은 `else` 갈래로 떨어져
//     `BattleSystem_GetParty(battler)` 하나를 채운다
//
// 알은 칸을 안 차지한다(`species != SPECIES_EGG`일 때만 `slot++`) — 우리 명부에는 알이
// 안 실린다
import { ownerOfKey, type KeyOwner } from '../../engine/battle/aftermath'

/** 공 줄의 칸 수 (`MAX_PARTY_SIZE`) */
export const GAUGE_SLOTS = 6

/** 둘째 트레이너가 채우기 시작하는 칸 */
const SECOND_TRAINER_SLOT = 3

/** 그 주인의 키들. 파티 칸 차례다 — 키 뒤 번호가 파티 칸이다 (`aftermath.partyKey`) */
function keysOf(keys: readonly string[], owner: KeyOwner): string[] {
  return keys.filter((k) => ownerOfKey(k) === owner)
    .sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)))
}

/**
 * 한 쪽 공 줄의 여섯 칸. 빈 칸은 undefined다.
 *
 * `owners`가 둘이면 첫째가 0번부터, 둘째가 3번부터 채운다
 */
export function gaugeSlots(
  keys: readonly string[], owners: readonly KeyOwner[],
): (string | undefined)[] {
  const out: (string | undefined)[] = Array.from({ length: GAUGE_SLOTS }, () => undefined)
  owners.forEach((owner, i) => {
    let slot = i === 0 ? 0 : SECOND_TRAINER_SLOT
    for (const key of keysOf(keys, owner)) {
      if (slot >= GAUGE_SLOTS) break
      out[slot++] = key
    }
  })
  return out
}
