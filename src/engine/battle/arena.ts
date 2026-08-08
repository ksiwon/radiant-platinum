// 어느 무대에서 싸우는가 (DATA.md §7.4)
//
// 원작 DS는 맵 헤더의 `battleBG` 다섯 비트로 배틀 2D 배경을 고른다. 593개 맵이
// 열여덟 가지를 쓴다 (`generated/battle_backgrounds.txt`의 스물넷 중 앞 열여덟).
// 우리는 2D 배경이 아니라 3D 무대를 세우므로, 그 번호로 **BDSP 무대**를 고른다.
//
// ⚠️ **어느 무대인지는 BDSP 롬이 적어 둔 것을 읽었다.** 우리가 텍스처 이름을 보고
// 짐작한 것이 아니다 — `Dpr/scriptableobjects/gamesettings`의 `ArenaInfo`에 무대
// 104벌이 **일본어 이름과 함께** 들어 있고(`草むら`·`洞窟`·`雪原`…), 같은 파일의
// `MapInfo`에 신오 658개 존이 각각 어느 무대를 쓰는지가 들어 있다. 아래 표의
// 근거는 그 둘이다.
//
// 이어 붙이는 데 쓴 자물쇠 셋:
//
//   ① **사천왕 다섯이 이름으로 1:1이다.** DS의 `BACKGROUND_AARON`…`CYNTHIA`가
//      BDSP의 `ポケモンリーグ（VS四天王リョウ）`…`（VSシロナ）` 다섯 벌과 그대로
//      맞는다 (충호·들국화·대엽·오엽·난천).
//   ② **실내 둘이 건물로 갈린다.** BDSP는 민가·트레이너스쿨에 `室内_木目`를,
//      포켓몬센터·프렌들리샵·포켓치사·TV국·도서관에 `室内_タイル`를 쓴다. 우리
//      `INDOORS_2`(73맵)의 첫 항목들이 바로 포켓치사(C01R0101~)와 TV국(C01R0201~)
//      이고, `INDOORS_1`(232맵)은 민가·체육관·게이트다.
//   ③ **같은 자리를 BDSP도 같은 무대로 부른다.** 하쿠타이의 숲 → `森`,
//      키사키시티 → `雪原`, 대습원 → `沼地`, 무쇠탄갱·천관산 → `洞窟`.
//
// 무대마다 `SizennotikaraWazaNo`(자연의 힘이 바뀌는 기술)와 `MinomuttiFormNo`
// (도롱마담의 겉모습)가 붙어 있는데, 이 둘은 원작 DS에도 **지형별로** 있다
// (`data/terrain/to_move.h`, `battle_system.c` 938줄). 세대가 달라 기술 번호까지
// 같지는 않지만 — DS는 씨폭탄·바위사태, BDSP는 에너지볼·파워젬 — 갈라지는 자리는
// 같다. 표를 고르고 나서 이 둘로 되짚어 봤고 어긋나는 데가 없었다.
import type { MapHeader } from '../map/world'
import { SHOT_REACH } from './shots'

/** 무대 한 벌 */
export interface Arena {
  /** `public/models/arena/<file>` */
  file: string
  /** BDSP가 이 무대에 붙여 둔 이름 (`ArenaInfo.Caption`) */
  caption: string
  /**
   * BDSP가 이 무대에 얹는 하늘 번들 (`ArenaInfo.SkyAssetBundleName`).
   *
   * ⚠️ **`s006`이 "하늘 없음"이다.** 우리가 정한 규칙이 아니라 롬에서 읽히는
   * 사실이다 — 무대 104벌 중 굴과 실내는 하나도 빠짐없이 `s006`을 쓰고
   * (`洞窟`·`室内_木目`·`室内_タイル`·`森の洋館`·사천왕 방 다섯), 야외는 저마다
   * 다른 하늘을 갖는다 (`草むら`→`s001`, `山岳`→`s008`, `雪原`→`s017`).
   * 그래서 이 한 값으로 하늘을 세울지 말지가 갈린다
   */
  sky: string
  /**
   * 발밑에서 여기까지는 **여덟 방향 어디로 가도 땅이 있다** (m, 실측).
   *
   * ⚠️ **무대가 다 넓지는 않다.** 실내는 12×18m짜리 방이라 반지름 6m가 끝이고
   * 굴은 10m, 들판·바다는 12~24m다 (`arena.test`가 glb를 열어 잰다). 카메라를
   * 이 밖으로 보내면 방에서는 벽을 뚫고 나가 천장 위에서 내려다보게 된다 —
   * 실제로 기본 샷이 9.95m라 방 세 곳에서 밖으로 나갔다
   */
  radius: number
}

/** "하늘 없음"을 뜻하는 BDSP 하늘 번들 */
const NO_SKY = 's006'

/** 이 무대에 하늘을 세우는가 */
export function hasSky(arena: Arena): boolean {
  return arena.sky !== NO_SKY
}


/** 카메라가 벽에서 떨어져 있을 여유 (m) */
const CLEARANCE = 1

/**
 * 카메라를 무대 크기에 맞춰 당기는 비율.
 *
 * 1이면 샷이 적힌 그대로다. 좁은 무대에서는 **바라보는 자리는 그대로 두고
 * 거리만 줄인다** — 방이 좁으면 화면도 좁아야 맞고, 무엇보다 벽 밖으로
 * 나가지 않는다
 */
export function cameraFit(arena: Arena): number {
  return Math.min(1, (arena.radius - CLEARANCE) / SHOT_REACH)
}

/**
 * 배경 번호 → 무대.
 *
 * ⚠️ **번호는 원작 것이다.** `battle_backgrounds.txt`의 차례 그대로라, 여기서
 * 임의로 매기면 롬에서 읽은 `battleBg`와 어긋난다.
 */
export const ARENA: readonly Arena[] = [
  // 0 PLAIN — 도로 26곳 + 발전소·팔파크. BDSP도 201~224번도로에 이 무대를 쓴다
  { file: 'g001.glb', caption: '草むら', sky: 's001', radius: 12 },
  // 1 WATER — 213번도로·220·223·230번수로·갈라진 바닷길. 전부 바다다.
  // BDSP는 물 위 배틀을 淡水(458존)와 海水(16존)로 가르는데, 이 다섯은 그 海水 쪽이다
  { file: 'g010.glb', caption: '海水', sky: 's010', radius: 24 },
  // 2 CITY — 도시 열여덟. ⚠️ BDSP의 `汎用背景1~3`이 도시용이지만 **열어 보니
  // 메시가 하나(삼각형 590개)뿐인 빈 판이다** — 도시 지오메트리는 배경에 안 굽는다.
  // 그래서 BDSP가 코토부키·크로가네·하쿠타이 같은 나머지 도시에 실제로 쓰는 것을
  // 따라간다: 草むら
  { file: 'g001.glb', caption: '草むら', sky: 's001', radius: 12 },
  // 3 FOREST — 영원의 숲·대습초원·호수. BDSP 하쿠타이의 숲이 이 무대다
  { file: 'g005.glb', caption: '森', sky: 's001', radius: 12 },
  // 4 MOUNTAIN — 창기둥·하드마운틴·산길. BDSP는 어느 존에도 안 쓰지만 이름이 이것뿐이다
  { file: 'g008.glb', caption: '山岳', sky: 's008', radius: 12 },
  // 5 SNOW — 선단시티·216·217번도로. BDSP 키사키시티가 이 무대다
  { file: 'g017.glb', caption: '雪原', sky: 's017', radius: 20 },
  // 6 INDOORS_1 — 232맵. 민가·체육관·게이트
  { file: 'g015.glb', caption: '室内_木目', sky: 's006', radius: 6 },
  // 7 INDOORS_2 — 73맵. 포켓몬센터·프렌들리샵·포켓치사·TV국
  { file: 'g016.glb', caption: '室内_タイル', sky: 's006', radius: 6 },
  // 8 INDOORS_3 — 35맵. 숲의 양옥집 9개 · 그랜드레이크 6 · 로스트타워 5 · 운하도서관 3…
  // BDSP는 이걸 森の洋館(9존)·ロストタワー(5존)·汎用背景5~6으로 쪼개 놓았다.
  // 우리는 한 벌만 고를 수 있고, **양옥집 아홉이 BDSP 森の洋館 아홉과 수까지 같다**
  { file: 'g021.glb', caption: '森の洋館', sky: 's006', radius: 6 },
  // 9 CAVE_1 — 무쇠탄갱·무쇠게이트. 사람이 손댄 굴이라 BDSP `洞窟`(갱목·철제 틀이 있다)
  { file: 'g006.glb', caption: '洞窟', sky: 's006', radius: 10 },
  // 10 CAVE_2 — 신수유적·천관산·챔피언로드. 손 안 댄 굴
  { file: 'g070.glb', caption: '洞窟_人工物なし', sky: 's006', radius: 10 },
  // 11 CAVE_3 — 귀혼동굴 46맵. 제일 깊은 굴
  { file: 'g056.glb', caption: '洞窟_深部', sky: 's006', radius: 10 },
  // 12~16 사천왕과 챔피언. 이름으로 1:1이다
  { file: 'g038.glb', caption: 'ポケモンリーグ（VS四天王リョウ）', sky: 's006', radius: 12 },
  { file: 'g039.glb', caption: 'ポケモンリーグ（VS四天王キクノ）', sky: 's006', radius: 12 },
  { file: 'g040.glb', caption: 'ポケモンリーグ（VS四天王オーバ）', sky: 's006', radius: 12 },
  { file: 'g041.glb', caption: 'ポケモンリーグ（VS四天王ゴヨウ）', sky: 's006', radius: 12 },
  { file: 'g042.glb', caption: 'ポケモンリーグ（VSシロナ）', sky: 's006', radius: 16 },
  // 17 DISTORTION_WORLD — 깨어진 세계 12맵.
  // ⚠️ **BDSP엔 이게 없다.** 깨어진 세계는 플래티넘에만 있는 곳이라 리메이크가
  // 만들지 않았다. 기라티나가 나오는 자리로 제일 가까운 `槍の柱2`를 빌려 쓴다 —
  // 원작을 옮긴 것이 아니라 **우리가 고른 것**이다
  { file: 'g069.glb', caption: '槍の柱2', sky: 's069', radius: 20 },
]

/** 표에 없는 번호가 오면 서는 무대. 원작도 배경 번호가 넘치면 풀밭으로 떨어진다 */
const FALLBACK = ARENA[0]!

/** `BACKGROUND_WATER`. 파도타기 중이면 맵과 무관하게 이 배경이다 */
const WATER = 1

/**
 * 이 배틀이 설 무대.
 *
 * ⚠️ **파도타기 중이면 맵을 안 본다.** 원작이 그렇게 한다 —
 * `SetBackgroundAndTerrain`이 `PLAYER_AVATAR_SURFING`일 때 배경을 통째로
 * `BACKGROUND_WATER`로 바꾼다. 물 위에서 싸우는데 뭍이 깔리면 안 되니까
 */
export function arenaFor(header: MapHeader | null, surfing: boolean): Arena {
  if (surfing) return ARENA[WATER]!
  return ARENA[header?.battleBg ?? -1] ?? FALLBACK
}
