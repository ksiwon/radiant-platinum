// 시원이 서는 자리 (SIWON.md §2·§3)
//
// 배치표에 없는 사람이라 여기서 한 줄을 만들어 `map/world`의 배치표에 얹는다 —
// 그러면 세우는 쪽(`spawnNpcs`)과 말 거는 쪽(`npcAt`)이 **한 길로** 그를 본다.
//
// ⚠️ **처음 고른 자리는 못 쓴다.** 축복시티의 미사용 민가(맵 31)는 방도 비어
// 있고 워프도 양방향으로 이어져 있지만, 도시 쪽 문 자리(128·736, 129·736)의
// 타일 성질이 0이고 그 칸이 든 청크의 z 736~743 **여덟 줄이 통째로 통행
// 불가**다. 신오 격자 전체에서 워프가 안 붙은 문(0x69) 칸도 셋뿐인데 셋 다
// 사방이 막혀 있거나 게이트의 반대쪽 면이다. 살리려면 도시 지형을 지어내야
// 해서, **이미 갈 수 있는 방**으로 옮겼다 — 근거는 SIWON.md §2다

/** `MAP_HEADER_JUBILIFE_CITY_CONDOMINIUMS_2F` — 1층 계단으로 올라간다 */
export const SIWON_MAP = 25

/** `MAP_HEADER_POKEMON_LEAGUE_HALLWAY_TO_HALL_OF_FAME` — 전당 방 바로 앞 복도 */
export const SIWON_CAMEO_MAP = 186

/**
 * 배치표에 없는 번호. 그 방의 원작 사람은 0과 1뿐이라 멀찍이 띄운다.
 *
 * ⚠️ 스크립트가 `VAR_LAST_TALKED`로 읽는 번호이기도 한데, 시원의 대화는 롬
 * 스크립트를 안 거치므로 부딪힐 자리가 없다
 */
const SIWON_LOCAL_ID = 200

/**
 * 말을 걸면 이 번호가 나온다. 롬 스크립트 번호가 아니라 **우리 표시**다 —
 * `tryTalk`이 이것을 보고 `start()` 대신 시원의 대화를 연다
 */
export const SIWON_SCRIPT = 0xfff0

/** `OBJ_EVENT_GFX_GAME_DIRECTOR`. BDSP 모델 `fc2033_01`이 이미 굽혀 있다 */
const SIWON_SPRITE = 242

/** 방 안의 걸을 수 있는 칸. 원작 주민 둘(11·11, 8·8)과 안 겹친다 */
const SIWON_X = 16
const SIWON_Z = 5

/** `MOVEMENT_TYPE_NONE` — 서서 기다린다 */
const MOVE_NONE = 0

/** 배치표 한 줄의 날 것. 차례가 `events.json`의 `raw`와 같아야 한다 */
const RAW = [
  SIWON_LOCAL_ID, SIWON_SPRITE, MOVE_NONE, 0, 0, SIWON_SCRIPT, 0, 0, 0, 0, 0, 0,
  SIWON_X, SIWON_Z, 0, 0,
]

/**
 * 그 맵에 시원이 서는가. 서면 배치표에 얹을 한 줄을 준다.
 *
 * 복도의 기습 등장은 사람을 안 세운다 — 목소리만 지나가고 끝이라
 * (SIWON.md §6) 여기 없다
 */
export function siwonNpcOf(mapId: number): {
  x: number; z: number; height: number; localID: number; sprite: number; move: number
  trainerType: number; facing: number; script: number; flag: number | null
  range: [number, number]; raw: number[]
} | null {
  if (mapId !== SIWON_MAP) return null
  return {
    x: SIWON_X,
    z: SIWON_Z,
    height: 0,
    localID: SIWON_LOCAL_ID,
    sprite: SIWON_SPRITE,
    move: MOVE_NONE,
    trainerType: 0,
    // 남쪽을 본다 — 계단에서 올라오는 쪽이다
    facing: 0,
    script: SIWON_SCRIPT,
    // 숨김 조건이 없다. 전당등록 전에도 서 있고, 말을 걸면 다시 오라고 한다
    flag: null,
    range: [0, 0],
    raw: [...RAW],
  }
}
