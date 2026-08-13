// 포켓루스 (PARITY §3.9) — `Pokemon_ApplyPokerus` · `Pokemon_ValidatePokerus` ·
// `Party_UpdatePokerusStatus`.
//
// **한 바이트가 둘을 담는다.** 아래 니블은 남은 날, 위 니블은 균주다.
//
//   · `0x00` 걸린 적 없다
//   · `0x52` 5번 균주, 이틀 남았다 (전염된다)
//   · `0x50` 5번 균주, 다 나았다 (더는 안 옮고, 노력치는 계속 두 배)
//
// ⚠️ **나아도 노력치 두 배는 안 사라진다.** 원작이 그 판정을
// `Pokemon_HasPokerus`로 하는데, 그 함수는 바이트가 **0이 아니기만** 하면 참을
// 낸다 — 남은 날이 아니라. 걸렸다 나은 마리가 평생 두 배로 크는 것이 4세대의
// 포켓루스고, 「남은 날」로 판정하면 나흘 뒤에 조용히 사라진다.
import type { Rng } from './instance'

/** 남은 날이 든 아래 니블 */
const DAYS = 0x0f
/** 균주가 든 위 니블 */
const STRAIN = 0xf0

/**
 * 하루가 지날 때 뽑는 값 셋 (`Pokemon_ApplyPokerus`).
 *
 * `LCRNG_Next()`가 u16이고, 그 값이 **딱 이 셋 중 하나**일 때만 걸린다.
 * 65536분의 3이다 — 확률만 옮기고 상수를 지우면 왜 이 숫자인지가 사라진다
 */
export const INFECT_ROLLS: readonly number[] = [16384, 32768, 49152]

/** 난수 한 바퀴 (`LCRNG_Next()`의 u16 결과와 같은 폭) */
const U16 = 0x10000

/** 지금 옮기는 상태인가 (`Pokemon_InfectedWithPokerus`) */
export function infected(mon: { pokerus: number }): boolean {
  return (mon.pokerus & DAYS) !== 0
}

/** 다 나았는가 (`Pokemon_HasCuredPokerus`) — 요약 화면의 점 표시가 이것이다 */
export function cured(mon: { pokerus: number }): boolean {
  return (mon.pokerus & DAYS) === 0 && (mon.pokerus & STRAIN) !== 0
}

/**
 * 노력치가 두 배로 들어가는가 (`Pokemon_HasPokerus`).
 *
 * ⚠️ **`infected`가 아니다.** 위 주석대로 걸린 적이 있으면 계속 두 배다
 */
export function doublesEvs(mon: { pokerus: number }): boolean {
  return mon.pokerus !== 0
}

/** 남은 날 (0~4). 화면에 며칠 남았는지 쓸 때 */
export function daysLeft(mon: { pokerus: number }): number {
  return mon.pokerus & DAYS
}

/**
 * 배틀이 끝날 때 한 마리가 새로 걸리는가 (`Pokemon_ApplyPokerus`).
 *
 * 통신 배틀이 아닐 때만 돈다. 새 바이트를 받은 자리 번호와 값을 돌려주고,
 * 아무 일도 없으면 null이다 — 세이브를 여기서 안 건드린다.
 *
 * ⚠️ **알과 빈 칸은 안 걸린다.** 원작이 종족과 `IS_EGG`를 같이 본다. 그리고
 * **한 번이라도 걸렸던 마리는 다시 안 걸린다** (`HasPokerus`가 0이 아니면 넘어간다)
 */
export function rollInfection(
  party: readonly { species: number; isEgg: boolean; pokerus: number }[],
  rng: Rng,
): { slot: number; pokerus: number } | null {
  if (party.length === 0) return null
  if (!INFECT_ROLLS.includes(Math.floor(rng() * U16))) return null

  // ⚠️ 원작은 알이나 빈 칸을 뽑으면 **다시 뽑는다** (`while (partySlot == count)`).
  // 파티가 알뿐이면 영영 안 끝나는 자리라 상한을 둔다 — 원작은 배틀에 나갈
  // 마리가 반드시 하나는 있어서 그 자리가 안 생긴다
  let slot = -1
  for (let i = 0; i < party.length * 8; i++) {
    const at = Math.floor(rng() * party.length)
    const mon = party[at]
    if (mon && mon.species !== 0 && !mon.isEgg) { slot = at; break }
  }
  if (slot < 0) return null
  if (party[slot]!.pokerus !== 0) return null

  return { slot, pokerus: newStrain(rng) }
}

/**
 * 새로 걸린 바이트를 만든다.
 *
 * 원작 그대로다: `(p & 7) != 0`이 나올 때까지 굴리고, 위 니블이 서 있으면
 * 아래 셋만 남긴다. 그 값을 위아래에 같이 깔고(`p |= p << 4`) `0xf3`으로
 * 자른 뒤 하나 더한다 — 그래서 남은 날은 늘 1~4다
 */
function newStrain(rng: Rng): number {
  let p = 0
  for (let i = 0; i < 64; i++) {
    p = Math.floor(rng() * 256)
    if ((p & 0x7) !== 0) break
  }
  if ((p & 0x7) === 0) p = 1
  if (p & STRAIN) p &= 0x7
  p |= p << 4
  p &= 0xf3
  return (p + 1) & 0xff
}

/**
 * 옆 칸으로 옮는다 (`Pokemon_ValidatePokerus`). 배틀이 끝날 때마다 돈다.
 *
 * ⚠️ **세 번에 한 번만 돈다.** 원작이 `LCRNG_Next() % 3 == 0`으로 감싼다 —
 * 이 한 줄을 빼면 파티 여섯이 한 배틀 만에 다 걸린다.
 *
 * 옮는 조건은 「옆 칸이 **한 번도 안 걸렸다**」다(`(p & 0xf0) == 0`). 그리고
 * 오른쪽으로 옮기면 그 칸을 건너뛴다 — 방금 옮은 마리가 그 자리에서 또
 * 옮기지는 않는다
 */
export function spread<T extends { species: number; pokerus: number }>(
  party: readonly T[],
  rng: Rng,
): T[] {
  if (Math.floor(rng() * 3) !== 0) return [...party]
  const out = [...party]
  for (let i = 0; i < out.length; i++) {
    const here = out[i]
    if (!here || here.species === 0) continue
    if ((here.pokerus & DAYS) === 0) continue
    const left = out[i - 1]
    if (i !== 0 && left && (left.pokerus & STRAIN) === 0) {
      out[i - 1] = { ...left, pokerus: here.pokerus }
    }
    const right = out[i + 1]
    if (i < out.length - 1 && right && (right.pokerus & STRAIN) === 0) {
      out[i + 1] = { ...right, pokerus: here.pokerus }
      i++
    }
  }
  return out
}

/**
 * 날이 지난 만큼 남은 날을 깎는다 (`Party_UpdatePokerusStatus`).
 *
 * ⚠️ **나흘 넘게 안 켰으면 남은 날에 상관없이 낫는다.** 원작이 `daysPassed > 4`를
 * 따로 본다 — DS 시계를 앞으로 돌려도 균주가 안 살아남게 하는 자리다.
 *
 * 나으면 균주 니블만 남는다. 그 니블마저 0이면 `0x10`을 세운다 — 「걸린 적 없다」와
 * 「나았다」가 같은 0이 되어 버리는 것을 막는 원작의 방어선이다
 */
export function elapseDays<T extends { species: number; pokerus: number }>(
  party: readonly T[],
  daysPassed: number,
): T[] {
  if (daysPassed <= 0) return [...party]
  return party.map((mon) => {
    if (mon.species === 0) return mon
    const left = mon.pokerus & DAYS
    if (left === 0) return mon
    let next = left < daysPassed || daysPassed > 4
      ? mon.pokerus & STRAIN
      : mon.pokerus - daysPassed
    if (next === 0) next = 0x10
    return { ...mon, pokerus: next }
  })
}

/** 배틀 한 판이 끝날 때 파티에 일어나는 일 전부. 통신 배틀에는 안 돈다 */
export function afterBattle<T extends { species: number; isEgg: boolean; pokerus: number }>(
  party: readonly T[],
  rng: Rng,
): T[] {
  const caught = rollInfection(party, rng)
  const next = caught === null
    ? [...party]
    : party.map((mon, i) => (i === caught.slot ? { ...mon, pokerus: caught.pokerus } : mon))
  return spread(next, rng)
}
