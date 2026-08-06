// 어느 곡을 틀 것인가 (DATA.md §2.18)
//
// **곡 번호는 지어내지 않는다.** 맵 헤더가 `bgmDay`·`bgmNight`를 들고 있고,
// 헤더가 내놓는 번호 1186개가 **전부** SDAT의 곡을 가리킨다 — 없는 번호가 0개다.
// 여기서 할 일은 지금 선 맵의 헤더를 보고 낮/밤을 고르는 것뿐이다.
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
 * 지금 맵에서 틀 곡.
 *
 * 낮/밤 경계는 하늘과 같은 표다(`map/timeOfDay`, 원작 `rtc.c`의 24칸). 다만
 * **하늘처럼 섞지 않는다** — 곡은 섞을 수 없으니 경계에서 갈아탄다.
 *
 * 밤과 심야가 밤 곡을 함께 쓰고 해질녘은 낮 곡이다. 헤더에 칸이 둘뿐이라
 * 그 이상 나눌 근거가 없다
 */
export function songForMap(mapId: number, hour: number): number | null {
  const header = mapById(mapId)
  if (!header) return null
  const t = timeOfDayForHour(hour)
  const night = t === TimeOfDay.NIGHT || t === TimeOfDay.LATE_NIGHT
  return night ? header.bgmNight : header.bgmDay
}
