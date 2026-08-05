// 배틀이 끝난 뒤 세이브에 되돌리는 것 (PLAN §7.6 메타게임 레이어)
//
// **왕복 변환은 세이브 손상이 가장 잘 나는 자리다.** 파티에서 sim으로 갔다가
// 돌아오는 길에 순서가 한 칸 밀리면 다친 포켓몬의 HP가 옆 칸에 적힌다. 그래서
// 순서가 아니라 키로 짝짓고, 짝을 못 찾으면 **건드리지 않는다**.
//
// sim을 import 하지 않는다 — 지연 청크가 사라진 뒤에도 이 함수는 살아 있어야 한다.
import type { FinalMon } from './events'
import type { PokemonInstance } from '../pokemon/instance'

/** 파티 i번째가 sim 안에서 갖는 키. 세션에 넣을 때와 되돌릴 때가 같아야 한다 */
export function partyKey(index: number): string {
  return `p1-${index}`
}

/** 상대 팀 i번째의 키 */
export function foeKey(index: number): string {
  return `p2-${index}`
}

/**
 * 배틀 결과를 파티에 반영한다. 새 배열을 돌려준다 — 세이브는 불변으로 다룬다.
 *
 * HP·상태이상·PP를 옮긴다. 경험치·노력치는 별도 계산이다.
 *
 * PP는 남은 값을 그대로 덮어쓴다 — 배틀을 열 때 세이브 값을 sim에 넣어 뒀으므로
 * 척도가 같다(`session.syncPp`). 짝짓기는 칸 순서가 아니라 기술 번호로 한다 —
 * sim은 우리가 넣은 순서를 안 지켜 준다
 */
export function applyResults(
  party: readonly PokemonInstance[],
  results: readonly FinalMon[],
): PokemonInstance[] {
  const byKey = new Map(results.map((r) => [r.key, r]))
  return party.map((mon, i) => {
    const r = byKey.get(partyKey(i))
    if (!r) return mon // 배틀에 안 나간 개체. 원본 그대로 둔다
    const left = new Map(r.pp.map((s) => [s.move, s.pp]))
    return {
      ...mon,
      hp: r.hp,
      status: r.status,
      statusTurns: r.status === 'ok' ? 0 : mon.statusTurns,
      // 결과에 없는 기술은 안 건드린다 — 배틀에 안 나갔거나 sim이 모르는 기술이다
      moves: mon.moves.map((slot) => {
        const pp = left.get(slot.move)
        return pp === undefined || pp === slot.pp ? slot : { ...slot, pp: Math.max(0, pp) }
      }),
    }
  })
}

/** 파티 전원이 쓰러졌는가 — 졌다는 뜻이다 */
export function isWipedOut(party: readonly PokemonInstance[]): boolean {
  return party.length > 0 && party.every((m) => m.hp <= 0)
}
