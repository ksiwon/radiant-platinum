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
 * **두 번째 상대 트레이너**의 i번째 키 (PARITY §2.2b).
 *
 * 태그 배틀에서는 상대 쪽 한 팀에 두 파티가 이어 붙는다(`sim/session`의
 * `OwnedSlots`). 키가 겹치면 누구의 마리인지 못 가르므로 앞머리를 따로 쓴다 —
 * 원작의 전투원 번호(`BATTLER_ENEMY_2` = 3)를 따서 `p4`다
 */
export function foe2Key(index: number): string {
  return `p4-${index}`
}

/** **편**의 i번째 키 (`BATTLER_PLAYER_2` = 2를 따서 `p3`). 세이브로 안 돌아간다 */
export function allyKey(index: number): string {
  return `p3-${index}`
}

/**
 * 그 키를 낸 사람. 화면이 트레이너 이름을 고르고 파티 공을 가르는 데 쓴다.
 *
 * `player`·`partner`는 우리 쪽, `foe`·`foe2`는 상대 쪽이다
 */
export type KeyOwner = 'player' | 'partner' | 'foe' | 'foe2'
export function ownerOfKey(key: string): KeyOwner {
  if (key.startsWith('p3-')) return 'partner'
  if (key.startsWith('p4-')) return 'foe2'
  if (key.startsWith('p2-')) return 'foe'
  return 'player'
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

/**
 * 동행이 붙어 있는 동안 **배틀이 끝날 때마다 파티가 다 낫는다**
 * (`encounter.c` — 야생 한 자리, 그 밖 한 자리, 두 곳 다 같은 조건이다):
 *
 * ```c
 * if (CheckPlayerWonEncounter(encounter) == FALSE) { … return TRUE; }
 *
 * if (SystemFlag_CheckHasPartner(SaveData_GetVarsFlags(fieldSystem->saveData))) {
 *     Party_HealAllMembers(SaveData_GetParty(fieldSystem->saveData));
 * }
 * ```
 *
 * ⚠️ **「이겼다」가 우리 말보다 넓다.** 원작의 `CheckPlayerWonBattle`은
 * **진 판과 비긴 판만** 거짓이고 나머지는 전부 참이다 —
 * 잡은 판(`CAPTURED_MON`), 내가 달아난 판(`PLAYER_FLED = CAPTURED_MON|WIN`),
 * 상대가 달아난 판(`ENEMY_FLED = CAPTURED_MON|LOSE`, 값 6이라 `LOSE`도
 * `DRAW`도 아니다)까지 낫는다. 우리에게 비긴 판은 아직 없다.
 *
 * 이것이 없으면 영원의 숲이 원작보다 훨씬 험해진다 — 모미가 붙어 있는데도
 * 야생 배틀마다 HP가 깎여 내려가므로, 실측(2026-09-16 journey8)으로 한 판에
 * 숲과 205번도로에서 세 번 전멸했다
 */
export function shouldPartnerHeal(
  outcome: 'win' | 'loss' | 'caught' | 'fled' | 'foeFled' | null,
  hasPartner: boolean,
): boolean {
  if (!hasPartner) return false
  if (outcome === null || outcome === 'loss') return false
  return true
}
