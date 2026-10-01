// 어느 곡을 틀 것인가 (DATA.md §2.18)
//
// **곡 번호는 지어내지 않는다.** 맵 헤더가 `bgmDay`·`bgmNight`를 들고 있고,
// 헤더가 내놓는 번호 1186개가 **전부** SDAT의 곡을 가리킨다 — 없는 번호가 0개다.
// 여기서 할 일은 지금 선 맵의 헤더를 보고 낮/밤을 고르는 것뿐이다.
// 화면이 직접 쓰는 번호는 잎 모듈에 있다 — 여기를 들여오면 three가 딸려 온다
export { OPENING_SONG, TITLE_SONG } from './songIds'
import { mapById } from '../map/world'
import { TimeOfDay, timeOfDayForHour } from '../map/timeOfDay'

/**
 * 야생 배틀 곡과 트레이너 배틀 곡.
 *
 * 자료 둘이 같은 번호를 준다. SDAT의 `SYMB`가 1116을 `SEQ_BA_POKE`,
 * 1119를 `SEQ_BA_TRAIN`이라 부르고, 디컴프의 `generated/sdat.txt`는 같은 자리를
 * `SEQ_BATTLE_WILD_POKEMON`·`SEQ_BATTLE_TRAINER`라 부른다 — 디컴프가 이름만
 * 고쳐 붙인 32개 중 둘이다.
 *
 * ⚠️ 처음엔 1120·1121로 적었다. 그 둘은 **아카기와 디아루가·펄기아**다 —
 * 야생 포켓몬이 나올 때마다 보스 곡이 흐를 뻔했다. 번호는 세지 않으면 모른다
 */
export const WILD_BATTLE = 1116
export const TRAINER_BATTLE = 1119

/**
 * 전설을 만나면 곡이 갈린다.
 *
 * `enc_effects.c`의 `EncEffects_WildPokemonEffect`가 종족 번호로 조우 연출을
 * 고르고, 그 연출이 곡을 데리고 온다(`EncEffectsPair`). 야생이라고 전부 같은
 * 곡이 아니다 — 기라티나는 플래티넘 전용 곡을 쓴다.
 *
 * 번호는 두 자료가 함께 확인해 준다. 디컴프 `generated/sdat.txt`를 **닻으로**
 * 세면(줄 번호 + 상수로는 안 된다) `SEQ_BATTLE_GIRATINA`가 1201인데, SDAT의
 * `SYMB`도 같은 자리를 `SEQ_PL_BA_GIRA`라 부른다
 */
const LAKE_GUARDIAN = 1118
const DIALGA_PALKIA = 1121
const ARCEUS = 1125
const LEGENDARY = 1126
const GIRATINA_SONG = 1201
const REGI_TRIO = 1204

/** 원작 주석이 "상수 파일로 옮겨야 한다"고 적어 둔 그 값이다 (`enc_effects.c`) */
const ZONE_PAL_PARK = 251

/**
 * 종족 → 곡. 표에 없으면 야생 곡이다.
 *
 * ⚠️ **쉐이미와 크레세리아는 연출만 특별하고 곡은 야생 곡이다** —
 * `ENCEFF_SHAYMIN`·`ENCEFF_CRESSELIA` 둘 다 `SEQ_BATTLE_WILD_POKEMON`을 가리킨다.
 * 전설이면 다 특별한 곡일 것이라고 짐작하면 여기서 틀린다
 */
const WILD_SONG = new Map<number, number>([
  [487, GIRATINA_SONG],
  [483, DIALGA_PALKIA], [484, DIALGA_PALKIA],
  [480, LAKE_GUARDIAN], [481, LAKE_GUARDIAN], [482, LAKE_GUARDIAN],
  [493, ARCEUS],
  // 레지기가스 · 히드런 · 다크라이 · 로토무
  [486, LEGENDARY], [485, LEGENDARY], [491, LEGENDARY], [479, LEGENDARY],
])

/** 파크에서 만나면 평범한 야생이 되는 것들 — 레지 삼형제와 관동 새 셋 */
const ONLY_OUTSIDE_PAL_PARK = new Map<number, number>([
  [377, REGI_TRIO], [378, REGI_TRIO], [379, REGI_TRIO],
  [144, LEGENDARY], [145, LEGENDARY], [146, LEGENDARY],
])

/** 지금 만난 야생에게 붙는 곡 */
export function wildSongFor(species: number, mapId: number): number {
  const special = WILD_SONG.get(species)
  if (special !== undefined) return special
  if (mapId !== ZONE_PAL_PARK) {
    const outside = ONLY_OUTSIDE_PAL_PARK.get(species)
    if (outside !== undefined) return outside
  }
  return WILD_BATTLE
}

/**
 * 지금 맵에서 틀 곡.
 *
 * 낮/밤 경계는 하늘과 같은 표다(`map/timeOfDay`, 원작 `rtc.c`의 24칸). 다만
 * **하늘처럼 섞지 않는다** — 곡은 섞을 수 없으니 경계에서 갈아탄다.
 *
 * 밤과 심야가 밤 곡을 함께 쓰고 해질녘은 낮 곡이다. 헤더에 칸이 둘뿐이라
 * 그 이상 나눌 근거가 없다
 */
/**
 * 스크립트가 곡을 가로챈 상태 (`FieldBGM_SetOverride`).
 *
 * ⚠️ 이게 없으면 `PlayMusic`이 소용없다 — 곡을 고르는 쪽(`MusicDirector`)이
 * 1초마다 맵 헤더의 곡으로 되돌려 놓기 때문이다. `'stop'`은 `StopMusic`이다.
 * `PlayDefaultMusic`이 이 자리를 비우고, 맵이 바뀔 때도 비운다
 */
export const fieldBgm = {
  override: null as number | 'stop' | null,
  /**
   * 장면이 쥔 곡 — 진화(`SEQ_SHINKA`)·교환(`SEQ_KOUKAN`)처럼 필드를 떠난 화면의 곡.
   *
   * ⚠️ **가로채기와 다른 칸이다.** 원작 장면은 곡을 바로 틀고(`Sound_PlayBasicBGM` ·
   * `Sound_SetSceneAndPlayBGM`) `FieldBGM_GetEffective`를 안 거친다 — 그래서 파도타기
   * 곡보다도 앞이다. 가로채기(`FieldBGM_SetOverride`)는 파도타기 **뒤**라, 둘을 한 칸에
   * 두면 물 위에서 진화할 때 진화 곡 대신 파도타기 곡이 흐른다. 스크립트도 이 칸을 안
   * 본다(`musicOverride`). 장면이 열 때 쥐고 닫을 때 돌려놓는다. `'stop'`은 `Sound_StopBGM`이다
   */
  scene: null as number | 'stop' | null,
}

/** `SEQ_NAMINORI` — 파도타기 곡 */
const SURF_SONG = 1151
/** `SEQ_PL_BICYCLE` — 자전거로드 곡. 탈 때 곡(`SEQ_BICYCLE` 1152)과 다르다 */
const CYCLING_ROAD_SONG = 1189

/** 깨어진 세계 열 층 — 물 위에서도 파도타기 곡으로 안 간다 (`FieldBGM_GetEffective`의 `switch`) */
const DISTORTION_FLOORS = new Set([573, 574, 575, 576, 577, 579, 580, 581, 582, 583])

/**
 * 이야기 깃발이 갈아 끼우는 곡 (`SystemFlag_GetAltMusicForHeader`).
 *
 * 맵 번호 · 깃발 · 곡(낮/밤)이 다 롬 목록에서 센 값이다 — 맵은 `generated/map_headers.txt`의 줄 − 1,
 * 깃발은 `vars_flags.txt`의 열거, 곡은 `sdat.txt`의 닻. 은하단 본부는 1층만 따로 한 번 더 본다
 */
const ALT_SONGS: readonly { maps: readonly number[], flag: number, day: number, night: number }[] = [
  // 비워진 입지호 · 입지호 동굴 — 아카기가 무너뜨린 뒤 (`FLAG_ALT_MUSIC_LAKE_VALOR`)
  { maps: [314], flag: 2436, day: 1070, night: 1070 },
  { maps: [316], flag: 2436, day: 1065, night: 1065 },
  // 리샘호 · 엄격호 (`SEQ_D_LAKE`)
  { maps: [312], flag: 2446, day: 1070, night: 1070 },
  { maps: [318], flag: 2447, day: 1070, night: 1070 },
  // 팔파크 (`SEQ_D_SAFARI`)
  { maps: [251], flag: 2453, day: 1069, night: 1069 },
  // 마빈 연구소 (`SEQ_OPENING2`)
  { maps: [422], flag: 2451, day: 1098, night: 1098 },
  // 은하단 본부 여덟 층 (`SEQ_CITY07_D/N`)
  { maps: [305, 306, 307, 308, 309, 310, 494, 497], flag: 2437, day: 1016, night: 1045 },
  // 은하단 본부 1층만 (`SEQ_D_AGITO`) — 위 깃발이 안 섰을 때만 본다
  { maps: [305], flag: 2438, day: 1067, night: 1067 },
  // 영원시티 은하단 빌딩 넷 (`SEQ_CITY04_D/N`)
  { maps: [72, 73, 74, 75], flag: 2439, day: 1013, night: 1042 },
  // 골짜기 발전소 (`SEQ_ROAD_C_D/N`)
  { maps: [201], flag: 2440, day: 1023, night: 1052 },
  // 꽃향기 꽃밭 · 224번도로 (`SEQ_TOWN03_D/N`)
  { maps: [256], flag: 2441, day: 1006, night: 1035 },
  { maps: [399], flag: 2442, day: 1006, night: 1035 },
  // 챔피언의 방 (`SEQ_SILENCE_FIELD`)
  { maps: [185], flag: 2443, day: 1001, night: 1001 },
]

/** 206번도로 · 자전거로드 남북 문 (`FieldBGM_GetAltMusicForCyclingRoad`) */
const ROUTE_206 = 350
const CYCLING_ROAD_GATES = new Set([80, 351])

/** 곡을 고르는 데 쓰는 필드의 사정. 없으면 헤더와 가로채기만 본다 */
export interface FieldSongState {
  /** 파도타기 중인가 (`PLAYER_AVATAR_SURFING`) */
  surfing: boolean
  /** 이야기 깃발 */
  flag: (id: number) => boolean
  /** 바로 앞에 있던 맵 (`FieldOverworldState_GetPrevLocation`) */
  prevMapId: number | null
  /** 선 칸 */
  x: number
  z: number
}

/**
 * 지금 맵에서 틀 곡 (`FieldBGM_GetEffective`).
 *
 * 원작 차례 그대로다 — ① 파도타기면 파도타기 곡(깨어진 세계만 빼고) ② 헤더의 낮/밤 곡 ③ 이야기 깃발이
 * 갈아 끼운 곡 ④ 자전거로드 문에서 들어섰으면 자전거로드 곡 ⑤ 스크립트·자전거가 가로챈 곡.
 * 레이더 곡은 레이더가 가로채기로 건다 (`scene/pokeRadar`). `'stop'`(`StopMusic`)은 그 넷보다 먼저다.
 * 장면이 쥔 곡(`fieldBgm.scene`)은 이 함수 바깥의 것이라 **다섯보다 다 먼저**다
 *
 * ⚠️ **파도타기 곡이 가로채기보다 앞이다.** 원작이 파도타기를 가장 먼저 보고 곧바로 돌려준다
 */
export function songForMap(mapId: number, hour: number, field?: FieldSongState): number | null {
  if (fieldBgm.scene === 'stop') return null
  if (fieldBgm.scene !== null) return fieldBgm.scene
  if (fieldBgm.override === 'stop') return null
  if (field?.surfing === true && !DISTORTION_FLOORS.has(mapId)) return SURF_SONG
  if (fieldBgm.override !== null) return fieldBgm.override
  const header = mapById(mapId)
  if (!header) return null
  const t = timeOfDayForHour(hour)
  const night = t === TimeOfDay.NIGHT || t === TimeOfDay.LATE_NIGHT
  let song = night ? header.bgmNight : header.bgmDay
  if (field === undefined) return song
  const alt = altSong(mapId, night, field.flag)
  if (alt !== null) song = alt
  if (cyclingRoadSong(mapId, field)) song = CYCLING_ROAD_SONG
  return song
}

function altSong(mapId: number, night: boolean, flag: (id: number) => boolean): number | null {
  for (const row of ALT_SONGS) {
    if (!row.maps.includes(mapId) || !flag(row.flag)) continue
    return night ? row.night : row.day
  }
  return null
}

/**
 * 206번도로에 **자전거로드 문에서** 들어섰고 자전거로드 두 끝(x 299~306 · z 576이나 681)에 섰는가.
 *
 * 원작은 문을 나선 그 칸에서만 참이다 — 길을 달려 내려가면 거짓이 되지만 곡은 이미 틀었으므로 계속 흐른다
 * (`FieldBGM_TryFadeOut`이 같은 곡이면 안 바꾼다). 우리도 가로채기로 붙든다 (`SetCyclingBGM`)
 */
function cyclingRoadSong(mapId: number, field: FieldSongState): boolean {
  if (mapId !== ROUTE_206 || field.prevMapId === null || !CYCLING_ROAD_GATES.has(field.prevMapId)) return false
  if (field.x < 299 || field.x > 306) return false
  return field.z === 576 || field.z === 681
}
