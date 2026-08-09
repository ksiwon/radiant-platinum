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
}

export function songForMap(mapId: number, hour: number): number | null {
  if (fieldBgm.override !== null) {
    return fieldBgm.override === 'stop' ? null : fieldBgm.override
  }
  const header = mapById(mapId)
  if (!header) return null
  const t = timeOfDayForHour(hour)
  const night = t === TimeOfDay.NIGHT || t === TimeOfDay.LATE_NIGHT
  return night ? header.bgmNight : header.bgmDay
}
