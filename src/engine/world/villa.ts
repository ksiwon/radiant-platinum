// 별장 — 가구 스물과 방문객 (`overlay005/villa_furniture.c` · `system_vars.c` · `ov5_021F6454.c`)
//
// 가구는 산 것만 **소품으로 선다.** 자리가 스물셋인데 가구는 스물이다 — 화분이 네 자리를 쓴다. 산 가구는
// 칸을 막고(부딪힘 상자), 그 칸에 대고 A를 누르면 별장 스크립트의 21~40번이 돈다(텔레비전만 공용 방송 스크립트
// 이고 **북쪽을 볼 때만** 돈다). 산 것은 깃발 2455~2474에 적힌다.
//
// ⚠️ **포켓몬 흉상은 이 판에서 못 산다.** 조건이 시설 다섯의 승리 한 번씩인데 넷은 차후 업데이트다
// (PARITY §9.3). 은빛 흉상은 배틀팩토리 은 인쇄(`PRINT_STATE` ≥ 2)로 열린다.

/** `generated/villa_furniture_type.txt`의 차례 */
export const VILLA_FURNITURE = {
  table: 0, bigSofa: 1, smallSofa: 2, bed: 3, nightTable: 4, tv: 5, audioSystem: 6, bookshelf: 7, rack: 8,
  houseplant: 9, pcDesk: 10, musicBox: 11, pokemonBust: 12, pokemonBustSilver: 13, piano: 14, guestSet: 15,
  wallClock: 16, masterpiece: 17, teaSet: 18, chandelier: 19,
} as const
export const VILLA_FURNITURE_COUNT = 20

/** 산 가구의 깃발 (`FLAG_VILLA_FURNITURE_TABLE` = `FLAG_VILLA_FURNITURE_START`) */
export const FLAG_VILLA_FURNITURE_START = 2455

/** 가구 소품의 모델 번호 — `map_prop_models.order`의 `villa_furniture_*` 스물(559~578) */
export const VILLA_FURNITURE_MODEL_START = 559

/** 가구마다의 A 버튼 스크립트 — 별장 스크립트 파일의 번호다. 텔레비전은 null(공용 방송) */
function villaFurnitureScript(type: number): number | null {
  return type === VILLA_FURNITURE.tv ? null : 0x15 + type
}

/** 한 자리 (`VillaFurniture`) — 자리는 타일 단위(가운데 = n + 0.5 · 모서리 = n) */
interface FurnitureSlot {
  type: number
  x: number
  z: number
  /** 막는 칸 [왼 · 위 · 오른 · 아래](끝 포함). 벽걸이 · 샹들리에처럼 안 막는 것은 null */
  bounds: readonly [number, number, number, number] | null
}

const F = VILLA_FURNITURE
/** `MAP_OBJECT_COORD_CENTER_TO_FX32(n)` · `…EDGE_TO_FX32(n)` */
const mid = (n: number): number => n + 0.5
const edge = (n: number): number => n

/** `sVillaFurnitures` — 차례 그대로 스물셋 */
export const VILLA_SLOTS: readonly FurnitureSlot[] = [
  { type: F.table, x: mid(12), z: edge(7), bounds: [11, 5, 13, 8] },
  { type: F.bigSofa, x: edge(15), z: edge(7), bounds: [14, 5, 15, 8] },
  { type: F.smallSofa, x: mid(13), z: mid(10), bounds: [11, 9, 13, 10] },
  { type: F.bed, x: mid(18), z: edge(8), bounds: [18, 6, 20, 9] },
  { type: F.nightTable, x: mid(20), z: mid(7), bounds: [17, 6, 17, 7] },
  { type: F.tv, x: edge(12), z: mid(3), bounds: [11, 3, 12, 3] },
  { type: F.audioSystem, x: mid(14), z: mid(3), bounds: [13, 3, 15, 3] },
  { type: F.bookshelf, x: edge(17), z: mid(3), bounds: [16, 3, 17, 3] },
  { type: F.rack, x: edge(19), z: mid(3), bounds: [18, 3, 19, 3] },
  { type: F.houseplant, x: mid(1), z: mid(3), bounds: [1, 3, 1, 3] },
  { type: F.houseplant, x: mid(20), z: mid(3), bounds: [20, 3, 20, 3] },
  { type: F.houseplant, x: mid(1), z: mid(11), bounds: [1, 11, 1, 11] },
  { type: F.houseplant, x: mid(20), z: mid(11), bounds: [20, 11, 20, 11] },
  { type: F.pcDesk, x: edge(2), z: mid(8), bounds: [1, 7, 2, 9] },
  { type: F.musicBox, x: mid(18), z: mid(3), bounds: null },
  { type: F.pokemonBust, x: mid(2), z: mid(3), bounds: [2, 3, 2, 3] },
  { type: F.pokemonBustSilver, x: mid(6), z: mid(3), bounds: [6, 3, 6, 3] },
  { type: F.piano, x: mid(2), z: mid(5), bounds: [1, 4, 2, 6] },
  { type: F.guestSet, x: edge(6), z: edge(10), bounds: [4, 9, 7, 10] },
  { type: F.wallClock, x: mid(11), z: mid(1), bounds: null },
  { type: F.masterpiece, x: mid(8), z: mid(1), bounds: null },
  { type: F.teaSet, x: mid(6), z: mid(10), bounds: null },
  { type: F.chandelier, x: mid(7), z: mid(6), bounds: null },
]

/** 그 칸을 막는 산 가구의 자리 — 없으면 null (`CheckFurnitureCollision`) */
function slotAt(owns: (type: number) => boolean, x: number, z: number): FurnitureSlot | null {
  for (const s of VILLA_SLOTS) {
    if (s.bounds === null || !owns(s.type)) continue
    const [l, t, r, b] = s.bounds
    if (z >= t && z <= b && x >= l && x <= r) return s
  }
  return null
}

/** 그 칸이 산 가구로 막혔는가 (`Villa_DynamicMapFeaturesCheckCollision`) */
export function villaBlocked(owns: (type: number) => boolean, x: number, z: number): boolean {
  return slotAt(owns, x, z) !== null
}

/**
 * 그 칸에 대고 A를 누르면 도는 것 (`FieldSystem_TrySetVillaFurnitureScript`) — 별장 스크립트 번호,
 * 공용 방송이면 `'tv'`, 없으면 null. 텔레비전은 **북쪽을 볼 때만** 켜진다 — 옆에서 누르면 다음 자리를 본다
 */
export function villaTalkAt(
  owns: (type: number) => boolean, x: number, z: number, facingNorth: boolean,
): number | 'tv' | null {
  for (const s of VILLA_SLOTS) {
    if (s.bounds === null || !owns(s.type)) continue
    const [l, t, r, b] = s.bounds
    if (!(z >= t && z <= b && x >= l && x <= r)) continue
    const script = villaFurnitureScript(s.type)
    if (script === null && !facingNorth) continue
    return script ?? 'tv'
  }
  return null
}

/** 조건을 재는 데 드는 것 — 기록과 시설 인쇄 */
interface VillaProgress {
  record: (id: number) => number
  /** 다섯 시설의 인쇄 상태(`VAR_BATTLE_*_PRINT_STATE`) */
  prints: readonly number[]
}

/** `generated/game_records.txt`의 차례 */
const RECORD = {
  steps: 0, berriesPlanted: 4, eggsHatched: 11, towerVictories: 29, battleground: 57,
  factoryVictories: 60, castleVictories: 61, hallVictories: 62, arcadeVictories: 63, hallOfFame: 73,
} as const

/**
 * 그 가구를 살 수 있는가 (`ScrCmd_CheckMetFurnitureRequirements`) — 스크립트가 넘기는 번호는 **가구 + 1**이다.
 * 조건이 없는 가구는 늘 참이다
 */
export function villaFurnitureAllowed(furniturePlusOne: number, p: VillaProgress): boolean {
  switch (furniturePlusOne - 1) {
    case F.pokemonBust:
      return [RECORD.towerVictories, RECORD.factoryVictories, RECORD.castleVictories, RECORD.hallVictories,
        RECORD.arcadeVictories].every((id) => p.record(id) >= 1)
    case F.pokemonBustSilver:
      return p.prints.some((s) => s >= 2)
    case F.piano:
      return p.record(RECORD.hallOfFame) >= 10
    case F.guestSet:
      return p.record(RECORD.battleground) >= 50
    case F.wallClock:
      return p.record(RECORD.berriesPlanted) >= 50
    case F.masterpiece:
      return p.record(RECORD.eggsHatched) >= 30
    case F.chandelier:
      return p.record(RECORD.steps) >= 300000
    default:
      return true
  }
}

/** 방문객 굴림 표 (`sVillaVisitorPercentChances` · `sNumPossibleVillaVisitors`) — 가구 0~7 · 8~11 · 12 이상 */
const VISIT_CHANCE = [25, 75, 90] as const
const VISITORS = [4, 12, 15] as const

/**
 * 오늘의 방문객 (`SystemVars_UpdateVillaVisitor` · `CalcVillaVisitorIndex` · `InitVillaVisitor`).
 * 가구가 많을수록 자주 · 여럿 중에서 온다. 안 오면 0xFF. 말 번호는 0~4다.
 * ⚠️ **별장 · 리조트 에어리어에 서 있으면 안 굴린다** — 부르는 쪽이 자리를 본다
 */
export function rollVillaVisitor(ownedCount: number, next: () => number): { visitor: number, message: number } {
  const tier = ownedCount >= 12 ? 2 : ownedCount >= 8 ? 1 : 0
  const visitor = next() % 100 > VISIT_CHANCE[tier] ? 0xff : next() % VISITORS[tier]
  return { visitor, message: next() % 5 }
}
