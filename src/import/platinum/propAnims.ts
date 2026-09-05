// 맵 소품이 어떤 애니를 갖는가 (DATA.md §2.31)
//
// `arc/bm_anime_list.narc`가 소품 번호 → 애니 번호 넷을 든다. 멤버 590개가 다
// **20바이트**고 디컴프의 `MapPropAnimeListFile`
// (`overlay005/map_prop_animation.h`)과 자리가 같다:
//
//     u8 hasAnimations · u8 flags · u8 isBicycleSlope · u8 dummy · s32 ids[4]
//
// 실측 — 소품 590 중 **112개가 애니를 갖고**(한 벌 81 · 두 벌 19 · 세 벌 1 ·
// 네 벌 11) 애니 멤버 98개가 **하나도 안 남고 다 쓰인다**. `isBicycleSlope`가
// 선 것이 **정확히 둘**(303·304)이고 그 둘이 차례표의 `bike_muddy_slope` ·
// `bike_dungeon_muddy_slope`다 — 구조체를 제대로 읽었다는 증거다.
//
// ⚠️ **`hasAnimations`를 문으로 쓰면 안 된다.** 590개가 **다** 1이다. 실제로
// 애니가 있는지는 `ids`가 `-1`이 아닌 것이 있는가로 가른다.
import { narcCount, narcEntry } from './nds'

/** 애니 목차 한 줄 — 소품 하나가 가진 것 */
interface PropAnimeRow {
  /** 원작의 `flags`. 1이면 미룬 적재, 2면 미뤄 붙이기 */
  flags: number
  /** 자전거 비탈인가 (`isBicycleSlope`) */
  slope: boolean
  /** 애니 아카이브 번호들. `-1`은 걷어 냈다 */
  anims: readonly number[]
}

/** 목차 한 줄의 크기. 이것이 틀리면 뒤가 통째로 밀린다 */
const ROW = 20

/** `bm_anime_list.narc`를 푼다. 돌려주는 차례가 곧 소품 번호다 */
export function readAnimeList(narc: Uint8Array): PropAnimeRow[] {
  const count = narcCount(narc)
  if (count === null) throw new Error('bm_anime_list가 NARC가 아니다')
  const out: PropAnimeRow[] = []
  for (let i = 0; i < count; i++) {
    const row = narcEntry(narc, i)
    if (row === null || row.length !== ROW) {
      throw new Error(`소품 애니 목차 ${String(i)}이 ${String(ROW)}바이트가 아니다`)
    }
    const view = new DataView(row.buffer, row.byteOffset, row.byteLength)
    const anims: number[] = []
    for (let k = 0; k < 4; k++) {
      const id = view.getInt32(4 + k * 4, true)
      if (id !== -1) anims.push(id)
    }
    out.push({ flags: row[1]!, slope: row[2]! !== 0, anims })
  }
  return out
}

/** 문이 내는 소리 갈래 (`DoorAnimation_GetSoundEffectType`) */
export type DoorKind = 'hinged' | 'sliding' | 'chime'

/**
 * 문 스무 종 (`DoorAnimation_FindDoorAndLoad`).
 *
 * 번호는 `res/field/props/models/map_prop_models.order`의 줄 번호 − 1이고,
 * 갈래는 `DoorAnimation_GetSoundEffectType`이 가르는 셋이다.
 *
 * ⚠️ **여닫이와 미닫이는 움직임이 다르다.** 미닫이(체육관·포켓몬센터·GTS·
 * 카드키·승강기)는 문짝을 **가로로 눌러** 문틀 속으로 넣는다 — `gym_door00op`이
 * 마지막 프레임에 두 짝의 X 크기를 0으로 만든다. 여닫이처럼 돌리면 안 된다
 */
export const DOOR_KIND: Readonly<Record<number, DoorKind>> = {
  66: 'hinged', // door01
  67: 'hinged', // brown_wooden_door
  68: 'hinged', // green_wooden_door
  69: 'hinged', // iron_door
  70: 'sliding', // pokecenter_door
  75: 'sliding', // elevator_door
  128: 'hinged', // pokecenter_inside_counter_door
  246: 'hinged', // jubilife_city_building_door
  260: 'hinged', // hearthome_gym_inside_door
  298: 'sliding', // gym_door
  312: 'hinged', // blue_door
  313: 'hinged', // iron_door_2
  427: 'sliding', // pokecenter_inside_door
  438: 'hinged', // yellow_wooden_door
  441: 'hinged', // mansion_door
  442: 'chime', // veilstone_dpt_store_door
  444: 'hinged', // blue_wooden_door
  456: 'sliding', // gts_inside_door
  484: 'sliding', // card_door
  527: 'hinged', // hotel_grand_lake_door
}

/** 애니 멤버 하나가 무엇이고 몇 프레임인가 */
interface PropAnimMember {
  /** `BCA0` 관절 · `BTP0` 텍스처 갈아 끼우기 · `BTA0` UV 이동 */
  kind: 'BCA0' | 'BTP0' | 'BTA0'
  frames: number
}

/** 굽는 쪽 둘이 같이 보는 표 (`data/props/anims.json`) */
interface PropAnimIndex {
  /** `bm_anime.narc` 멤버마다 */
  members: readonly PropAnimMember[]
  /** 애니가 있는 소품만. 열쇠가 소품 번호다 */
  props: Readonly<Record<string, readonly number[]>>
  /** 자전거 비탈 소품 (실측 둘) */
  slopes: readonly number[]
}

/** `BCA0`·`BTP0`·`BTA0` 머리에서 프레임 수를 읽는다 */
function framesOf(member: Uint8Array): PropAnimMember | null {
  if (member.length < 24) return null
  const tag = String.fromCharCode(member[0]!, member[1]!, member[2]!, member[3]!)
  if (tag !== 'BCA0' && tag !== 'BTP0' && tag !== 'BTA0') return null
  const view = new DataView(member.buffer, member.byteOffset, member.byteLength)
  // 어느 꼴이든 첫 블록의 첫 항목 머리 +4에 프레임 수가 있다
  const block = view.getUint32(16, true)
  const dict = block + 8
  const count = member[dict + 1]!
  let p = dict + 4
  p += view.getUint16(p, true) + count * 4
  const itemSize = view.getUint16(p, true)
  p += 4
  if (count === 0 || itemSize < 4) return { kind: tag, frames: 0 }
  const first = block + view.getUint32(p, true)
  return { kind: tag, frames: view.getUint16(first + 4, true) }
}

/**
 * 두 NARC에서 표를 짓는다.
 *
 * ⚠️ **굽는 쪽 둘이 이 함수를 같이 부른다** — 노드 추출기도 브라우저
 * 변환기도 롬을 들고 있으므로, 표를 따로 만들 이유가 없다 (「굽는 쪽이 둘이다」)
 */
export function buildPropAnims(listNarc: Uint8Array, animNarc: Uint8Array): PropAnimIndex {
  const rows = readAnimeList(listNarc)
  const count = narcCount(animNarc)
  if (count === null) throw new Error('bm_anime가 NARC가 아니다')
  const members: PropAnimMember[] = []
  for (let i = 0; i < count; i++) {
    const at = narcEntry(animNarc, i)
    const got = at === null ? null : framesOf(at)
    if (got === null) throw new Error(`bm_anime ${String(i)}이 애니가 아니다`)
    members.push(got)
  }
  const props: Record<string, number[]> = {}
  const slopes: number[] = []
  for (const [prop, row] of rows.entries()) {
    if (row.anims.length > 0) props[String(prop)] = [...row.anims]
    if (row.slope) slopes.push(prop)
  }
  return { members, props, slopes }
}
