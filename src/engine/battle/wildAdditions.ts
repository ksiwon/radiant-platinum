// 원작 밖에서 더한 야생 (PARITY §6.13)
//
// 신오도감 여덟 종 — 니로우·돈크로우·무우마·무우마직·나옹마·몬냥이·스컹뿡·스컹탱크 — 은
// 플래티넘 롬에 얻는 길이 없다. 야생 조우표 0줄 · NPC 교환 넷(페라페·잉어킹·고우스트·캐이시)에도
// 없고 · 선물 스크립트도 없다. 원작의 길은 다이아몬드·펄과의 통신 교환 하나고, 통신은 범위 밖이다 (§9).
//
// 그래서 D/P에서 나오던 자리의 플래티넘 칸 하나를 **반으로 나눠** 같이 나오게 한다. 자리와 시간은
// BDSP 조우표(`Dpr/scriptableobjects/gamesettings`의 `FieldEncountTable_d`·`_p`)에서 읽었다 —
// 니로우(D)·무우마(P)는 로스트타워 1F~5F 밤(존 368~372 · Lv17~21), 스컹뿡·스컹탱크(D)는 206번(존 362)·
// 221번(404)도로, 나옹마·몬냥이(P)는 218번(400)·222번(407)도로. 돈크로우·무우마직은 어둠의돌로 진화한다.
//
// ⚠️ **칸을 늘리지 않는다.** 12칸 가중치(`LAND_SLOT_RATES`)는 원작 고정표고, 무리·시간대·레이더·자력이
// 칸 번호로 돈다. 칸 하나가 뽑혔을 때 한 번 더 굴려 반을 새 종에 주면 그 규칙이 다 그대로다.
//
// ⚠️ **원래 종이 그 칸에 서 있을 때만 나눈다** (`base`). 시간대·무리·레이더가 그 칸을 갈아 끼웠으면
// 안 나눈다 — 로스트타워는 그래서 밤에만 나뉜다(밤 칸이 해골몽일 때). 롬이 달라 그 칸이 다른 종이면
// 조용히 안 나눈다(`wildAdditions.test.ts`가 지금 롬에서 다섯 자리가 다 맞는지 본다).
//
// ⚠️ **롬 자료는 안 고친다** — 읽을 때 덮는다. 개발 서버와 설치본이 같은 `bootWorld`로 읽는다
import type { EncounterTable } from './encounter'
import type { PokedexHabitat } from '../../data/schema'

/** 한 칸을 나눠 쓰는 새 종. 그 칸의 레벨을 그대로 쓴다 (시간대 칸과 같은 규칙) */
export interface LandShare {
  slot: number
  /** 그 칸에 이 종이 서 있을 때만 나눈다 */
  base: number
  species: number
}

/** 나뉜 칸이 뽑혔을 때 새 종이 나올 몫 */
export const SHARE_CHANCE = 0.5

const MURKROW = 198
const MISDREAVUS = 200
const GLAMEOW = 431
const PURUGLY = 432
const STUNKY = 434
const SKUNTANK = 435

const MACHOP = 66
const MR_MIME = 122
const MAGNEMITE = 81
const SUDOWOODO = 185
const WINGULL = 278
const DUSKULL = 355

/** 맵 헤더 번호 → 나누는 칸 */
export const WILD_ADDITIONS: Readonly<Record<number, readonly LandShare[]>> = {
  // 로스트타워 1F~5F — 밤 칸 둘(해골몽·해골몽)
  ...Object.fromEntries([357, 358, 359, 360, 361].map((map) => [map, [
    { slot: 2, base: DUSKULL, species: MURKROW },
    { slot: 3, base: DUSKULL, species: MISDREAVUS },
  ]])),
  // 206번도로 — 알통몬 Lv17 칸
  350: [{ slot: 5, base: MACHOP, species: STUNKY }],
  // 218번도로 — 마임맨 Lv30 칸
  388: [{ slot: 5, base: MR_MIME, species: GLAMEOW }],
  // 221번도로 — 꼬지모 Lv31 · Lv30 칸
  392: [{ slot: 4, base: SUDOWOODO, species: SKUNTANK }, { slot: 5, base: SUDOWOODO, species: STUNKY }],
  // 222번도로 — 갈모매 Lv38 · 코일 Lv39 칸
  395: [{ slot: 4, base: WINGULL, species: GLAMEOW }, { slot: 5, base: MAGNEMITE, species: PURUGLY }],
}

/**
 * 표에 나눌 칸을 얹는다. 여러 번 불러도 같다 — 덧붙이지 않고 갈아 끼운다.
 *
 * 맵 헤더로 표를 찾는다(`MapHeader.encounters`). 여러 맵이 한 표를 쓰면 그 표를 쓰는 맵 전부에 걸린다
 */
export function applyWildAdditions(
  tables: EncounterTable[], maps: readonly { encounters?: number | null }[],
): void {
  for (const [map, shares] of Object.entries(WILD_ADDITIONS)) {
    const at = maps[Number(map)]?.encounters
    if (at === null || at === undefined) continue
    const table = tables[at]
    if (table) table.shares = [...shares]
  }
}

/** 그 칸이 지금 나뉘는가. 나뉘면 새 종 번호 */
export function shareAt(table: EncounterTable, slot: number, species: number): number | null {
  const share = table.shares?.find((s) => s.slot === slot)
  return share !== undefined && share.base === species ? share.species : null
}

/**
 * 도감 서식지 (`zukan_enc_platinum.narc`)에 더한 자리.
 *
 * 번호는 그 자리에 원래 사는 종들이 **다 같이** 가진 자리 번호다 — 로스트타워 던전 20 · 206번 들판 19 ·
 * 218번 34 · 221번 36 · 222번 37. 시간이 안 매인 칸은 아침·낮·밤 셋 다 적는다
 */
const HABITAT_ADDITIONS: Readonly<Record<number, Record<string, number[]>>> = {
  [MURKROW]: { dungeonNight: [20] },
  [MISDREAVUS]: { dungeonNight: [20] },
  [STUNKY]: { fieldMorning: [19, 36], fieldDay: [19, 36], fieldNight: [19, 36] },
  [SKUNTANK]: { fieldMorning: [36], fieldDay: [36], fieldNight: [36] },
  [GLAMEOW]: { fieldMorning: [34, 37], fieldDay: [34, 37], fieldNight: [34, 37] },
  [PURUGLY]: { fieldMorning: [37], fieldDay: [37], fieldNight: [37] },
}

/** 서식지에 더한 자리를 얹는다. 롬에 이미 적힌 자리가 있으면 합친다 */
export function withWildHabitats(habitat: PokedexHabitat): PokedexHabitat {
  const species = { ...habitat.species }
  for (const [id, keys] of Object.entries(HABITAT_ADDITIONS)) {
    const was = species[id] ?? {}
    const next: Record<string, number[]> = { ...was }
    for (const [key, at] of Object.entries(keys)) next[key] = [...new Set([...(was[key] ?? []), ...at])]
    species[id] = next
  }
  return { ...habitat, species }
}
