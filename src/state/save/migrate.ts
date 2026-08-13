// 세이브 버전 이전 (PLAN §9.3 · IMPORT.md §11-5)
//
// 지금까지는 `data.version !== SAVE_VERSION`이면 **없는 리포트로 쳤다.** 화면에는
// "리포트가 없다"로만 보이므로, 앱을 한 번 올린 것뿐인데 진행이 사라진 것처럼
// 느껴진다. 그 조용한 실패를 셋으로 가른다:
//
//   · 옮길 수 있다      → 한 단계씩 올린다
//   · 이 판보다 최신이다 → 손대지 않고 "더 새 판에서 쓰라"고 말한다
//   · 못 옮긴다         → 손대지 않고 **원본 파일을 돌려준다**
//
// ⚠️ **없는 과거를 지어내지 않는다.** 1~6으로 저장된 리포트는 세상에 없다 —
// 판이 7에서 처음 올랐고, 그래서 표가 7에서 시작한다.
import { newDaycare } from '../../engine/pokemon/breeding'
import { dayNumber, newDaily } from '../../engine/world/daily'
import { newRecentRoutes, newRoamers } from '../../engine/world/roamer'
import { newJournal } from '../../engine/world/journal'
import { newPoketch } from '../../engine/world/poketch'
import { newDistortionState } from '../../engine/world/distortion'
import { newHallOfFame } from '../../engine/world/hallOfFame'
import { safeParseSave } from './schema'
import type { SaveData } from '../saveStore'

/** n에서 n+1로만 옮긴다. 두 칸을 한 번에 건너뛰는 함수는 두지 않는다 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>

/**
 * 개체마다 새 칸을 박는다.
 *
 * ⚠️ **개체가 사는 곳이 셋이다** — 파티 6, 박스 540, 육성가 2. 한 군데를
 * 빠뜨리면 그 자리에서 꺼낼 때 스키마가 걸리는데, 그때는 이유가 안 보인다
 */
function stampMons(
  data: Record<string, unknown>, add: Record<string, unknown>,
): Record<string, unknown> {
  const stamp = (mon: unknown): unknown =>
    mon === null || typeof mon !== 'object' ? mon : { ...mon, ...add }
  const daycare = data.daycare as { slots?: unknown } | undefined
  return {
    party: Array.isArray(data.party) ? data.party.map(stamp) : data.party,
    boxes: Array.isArray(data.boxes)
      ? data.boxes.map((box) => (Array.isArray(box) ? box.map(stamp) : box))
      : data.boxes,
    daycare: Array.isArray(daycare?.slots)
      ? {
        ...daycare,
        slots: daycare.slots.map((slot) => (
          slot === null || typeof slot !== 'object' ? slot
            : { ...slot, mon: stamp((slot as { mon?: unknown }).mon) }
        )),
      }
      : data.daycare,
  }
}

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /**
   * 7 → 8. 걸음 계수기와 탈출 자리가 생겼다 (PARITY §1.1 · §4.1).
   *
   * 옛 리포트에는 그 칸이 없다. **0과 null로 시작하는 것이 맞다** — 원작도 새
   * 게임을 열 때 걸음이 둘 다 0이고, 굴에 한 번도 안 들어갔으면 탈출 자리가 없다
   */
  7: (data) => ({ ...data, version: 8, steps: { poison: 0, repel: 0 }, exit: null }),

  /**
   * 8 → 9. 날마다 바뀌는 것의 씨앗이 생겼다 (PARITY §6.11).
   *
   * ⚠️ **여기서 진짜 난수를 뽑는다.** 0으로 두면 `ARNG_Next(0) = 1`이라
   * 옛 리포트를 이어 온 사람이 전부 **같은 빈티나 칸·같은 무리**를 갖는다.
   * 원작도 새 게임에서 `MTRNG_Next()`로 뽑으므로, 처음 뽑는 그 자리가 여기다.
   *
   * 날짜는 오늘로 잡는다. 옛 리포트에는 "마지막으로 논 날"이 없어서
   * 며칠이 지났는지 알 방법이 없다 — 0으로 두면 에폭부터 오늘까지 이만 번을
   * 굴리게 된다
   */
  8: (data) => ({
    ...data,
    version: 9,
    daily: newDaily(Math.floor(Math.random() * 0x100000000), dayNumber(new Date())),
  }),

  /**
   * 9 → 10. 알과 육성가가 생겼다 (PARITY §3.2·§3.3).
   *
   * 개체마다 `isEgg` 칸이 늘었다 — 옛 리포트의 마리는 **전부 알이 아니다**.
   * 파티만이 아니라 **박스 540칸까지** 손봐야 한다. 파티만 고치면 박스에서
   * 꺼내는 순간 스키마가 걸리는데, 그때는 이유가 안 보인다
   */
  9: (data) => {
    const hatched = (mon: unknown): unknown =>
      mon === null || typeof mon !== 'object' ? mon : { ...mon, isEgg: false }
    const party = Array.isArray(data.party) ? data.party.map(hatched) : data.party
    const boxes = Array.isArray(data.boxes)
      ? data.boxes.map((box) => (Array.isArray(box) ? box.map(hatched) : box))
      : data.boxes
    return { ...data, version: 10, party, boxes, daycare: newDaycare() }
  },

  /**
   * 10 → 11. 검은·하얀 피리가 실제로 먹는다 (PARITY §1.22).
   *
   * 맵을 옮기면 어차피 풀리는 값이라 **안 분 것으로** 시작한다
   */
  10: (data) => ({ ...data, version: 11, flute: 0 }),

  /**
   * 11 → 12. 개체에 **어디서 왔는가**가 새겨진다 (PARITY §3.8 · §5 요약 화면).
   *
   * ⚠️ **없는 과거를 지어내지 않는다.** 옛 리포트의 마리가 어느 풀숲에서
   * 몇 레벨에 잡혔는지는 세상에 남아 있지 않다. 자리를 0으로 두면 원작이
   * 이름을 못 찾을 때 쓰는 "수수께끼의 장소"로 떨어지고
   * (`StringTemplate_SetMetLocationName`), 날짜는 null이라 그 줄을 안 찍는다 —
   * 오늘 날짜를 넣으면 전부 오늘 잡은 것으로 보인다.
   *
   * 원래 트레이너 이름만은 안다. 통신이 없어서 **모두 주인공의 것**이다
   */
  11: (data) => {
    const who = data.trainer as { name?: unknown; gender?: unknown } | undefined
    const name = typeof who?.name === 'string' ? who.name : ''
    const gender = who?.gender === 'boy' ? 'male' : 'female'
    const blank = { location: 0, date: null }
    const origin = { otName: name, otGender: gender, met: blank, metLevel: 0, egg: blank, fateful: false }
    const stamp = (mon: unknown): unknown =>
      mon === null || typeof mon !== 'object' ? mon : { ...mon, origin }
    const party = Array.isArray(data.party) ? data.party.map(stamp) : data.party
    const boxes = Array.isArray(data.boxes)
      ? data.boxes.map((box) => (Array.isArray(box) ? box.map(stamp) : box))
      : data.boxes
    return { ...data, version: 12, party, boxes }
  },

  /**
   * 12 → 13. 개체에 폼 칸이 생겼다 (PARITY §3.4).
   *
   * ⚠️ **전부 0으로 둔다.** 옛 리포트의 조개무지가 어느 바다에서 왔는지는 아무
   * 데도 안 적혀 있다 — 잡은 자리로 되짚으면 그럴듯하지만 그건 지어내는 것이고,
   * 서쪽 바다(0)가 원작에서 자료가 없을 때의 대답이다
   */
  12: (data) => ({ ...data, version: 13, ...stampMons(data, { form: 0 }) }),

  /**
   * 13 → 14. 도감에 「쓰러뜨려 봤다」 칸이 생겼다 (PARITY §2.22).
   *
   * ⚠️ **잡은 것을 베낀다.** 0으로 두면 예전 리포트를 이어 온 사람은 다 모은
   * 도감을 들고도 상성 표시가 하나도 안 뜬다. 잡은 종은 반드시 상대해 본 종이므로
   * 그만큼은 사실이고, 놓아준 종만 다시 만날 때까지 안 뜬다
   */
  13: (data) => {
    const dex = data.pokedex
    if (dex === null || typeof dex !== 'object') return { ...data, version: 14 }
    const caught = (dex as { caught?: unknown }).caught
    return {
      ...data,
      version: 14,
      pokedex: {
        ...dex,
        battled: caught instanceof Uint8Array ? caught.slice() : caught,
      },
    }
  },

  /**
   * 14 → 15. 배회 포켓몬 여섯 자리가 생겼다 (PARITY §6.3).
   *
   * 빈 자리로 시작한다. 여는 것은 이야기이고(`ActivateRoamingPokemon`), 옛
   * 리포트가 그 자리를 이미 지나왔다면 다시 안 열린다 — **없는 배회를 지어내
   * 풀어놓지 않는다.** 잃는 것은 이미 지나간 사람의 엠라이트 하나고, 지어내면
   * 잡은 적 없는 크레세리아가 도감에 뜨는 쪽이 된다
   */
  14: (data) => ({
    ...data,
    version: 15,
    roamers: newRoamers(),
    recentRoutes: newRecentRoutes(),
  }),

  /**
   * 모험노트 (PARITY §7.4).
   *
   * ⚠️ **지난 날을 지어내지 않는다.** 빈 노트 열 쪽으로 시작한다 — 이미
   * 신오를 한 바퀴 돈 리포트라도 노트에는 오늘부터 적힌다. 어제 무엇을 했는지는
   * 세이브 어디에도 안 남아 있어서, 채우려면 만들어내는 수밖에 없다
   */
  15: (data) => ({ ...data, version: 16, journal: newJournal() }),

  /**
   * 포켓치 (PARITY §7.3).
   *
   * ⚠️ **앱을 지어내지 않는다.** 디지털시계 하나만 든 새 포켓치로 시작한다 —
   * 옛 리포트가 축복시티를 지나왔더라도 받은 앱이 어디에도 안 적혀 있다.
   * 다시 받으러 갈 수 있는 것들이라 잃는 것은 걸음 하나다
   */
  16: (data) => ({ ...data, version: 17, poketch: newPoketch() }),

  /**
   * 깨어진 세계 (PARITY §6.10).
   *
   * ⚠️ **valid를 거짓으로 둔다.** 이 칸이 서 있으면 「이미 들어와 본 적이 있고
   * 서 있던 판·카메라 각이 이것」이라는 뜻인데, 옛 리포트에는 그 자리가 없다.
   * 거짓이면 들어서는 순간 발밑을 보고 다시 잡는다 — 원작이 처음 들어올 때
   * 하는 것과 같다
   */
  17: (data) => ({ ...data, version: 18, distortion: newDistortionState() }),

  /**
   * 명예의 전당 (PARITY §7.11).
   *
   * ⚠️ **한 줄도 지어내지 않는다.** 이미 챔피언을 이긴 리포트라도 그때의 파티가
   * 어땠는지는 아무 데도 안 남아 있다 — 빈 기록으로 시작하고, 다음에 다시
   * 이기면 그때부터 쌓인다. 원작도 기록이 깨지면 `HallOfFame_Init`으로 비운다
   */
  18: (data) => ({
    ...data,
    version: 19,
    hallOfFame: newHallOfFame(),
    // ⚠️ **전당에 든 날도 지어내지 않는다.** 언제 이겼는지가 아무 데도 안 남아
    // 있으므로 비워 두고, 트레이너 카드는 그 줄을 안 그린다
    trainer: { ...(data.trainer as object), firstClearedAt: null },
  }),

  /**
   * 코인·석판 이름·모습 (PARITY §5 · §6.9).
   *
   * 셋 다 빈 값으로 시작한다. 코인은 게임코너에서 벌던 것을 아무 데도 안 적어
   * 뒀으니 0이고, 석판은 안 새긴 것이며, 모습은 아직 안 고른 0번이다
   */
  19: (data) => ({
    ...data,
    version: 20,
    trainer: { ...(data.trainer as object), tabletName: '', appearance: 0 },
    coins: 0,
  }),

  /**
   * 20 → 21. 개체에 포켓루스 한 바이트가 생겼다 (PARITY §3.9).
   *
   * ⚠️ **전부 0이다 — 「걸린 적 없다」.** 0이 아닌 값을 넣으면 옛 리포트의
   * 마리가 전부 노력치를 두 배로 먹는다. 걸리는 자리는 배틀이 끝나는 순간뿐이고
   * (`Pokemon_ApplyPokerus`), 65536분의 3이라 그 희소함이 이 규칙의 전부다
   */
  20: (data) => ({ ...data, version: 21, ...stampMons(data, { pokerus: 0 }) }),
}

/** 이 표로 닿을 수 있는 가장 낮은 버전 */
export function oldestSupported(target: number, table = MIGRATIONS): number {
  let v = target
  while (table[v - 1]) v--
  return v
}

export type MigrateResult =
  | { kind: 'ok'; save: SaveData; from: number; migrated: boolean }
  | { kind: 'too-new'; found: number; expected: number }
  | { kind: 'unsupported-old'; found: number; oldest: number }
  | { kind: 'invalid'; why: string; found: number | null }

function versionOf(value: unknown): number | null {
  if (value === null || typeof value !== 'object') return null
  const v = (value as { version?: unknown }).version
  return typeof v === 'number' && Number.isInteger(v) ? v : null
}

/**
 * 어떤 버전의 세이브 모양이든 지금 판으로 올린다.
 *
 * 마지막에 **반드시 스키마를 다시 통과**해야 한다 — 이전 함수가 한 칸을
 * 빠뜨려도 여기서 걸린다. 이전 함수 자체를 믿고 넘기면 그 실수가 게임 한복판에서
 * 나온다
 */
export function migrateSave(
  value: unknown,
  target: number,
  table: Readonly<Record<number, Migration>> = MIGRATIONS,
): MigrateResult {
  const found = versionOf(value)
  if (found === null) return { kind: 'invalid', why: 'version 칸이 없다', found: null }
  if (found > target) return { kind: 'too-new', found, expected: target }

  let data = value as Record<string, unknown>
  let at = found
  while (at < target) {
    const step = table[at]
    if (!step) return { kind: 'unsupported-old', found, oldest: oldestSupported(target, table) }
    data = { ...step(data), version: at + 1 }
    at++
  }

  const parsed = safeParseSave(data)
  if (!parsed.ok) return { kind: 'invalid', why: parsed.why, found }
  return { kind: 'ok', save: parsed.save, from: found, migrated: found !== target }
}
