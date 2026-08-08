// 간판 판에 붙는 그림 (DATA.md §2.21)
//
// 아틀라스 한 장에 50칸이 들어 있다 — 도로 화살표 31장이 앞, 마을 약도 19장이
// 뒤다. 원작 번호를 우리 칸 번호로 옮기는 것이 이 파일의 전부다.
//
// ⚠️ **종류가 어느 갈래를 볼지 정한다** (`LoadSignpostContentTiles`):
//
//   0 지도    번호 n → `city_map` n번
//   1 화살표  번호 n → `route_map` n번
//
// 둘 다 0번이 빈 판이라, 그림 번호가 안 붙은 간판은 자연스럽게 빈 판이 된다.
import type { CSSProperties } from 'react'
import { loadSignposts } from '../../data/gameData'
import type { Signposts } from '../../data/schema'
import { dataUrl } from '../../data/assetBase'

/** `generated/signpost_types.txt` */
const SIGNPOST_TYPE_MAP = 0

/** 도트를 이만큼 키운다. 48×32 → 96×64 */
const SCALE = 2

let atlas: Signposts | null = null
let asked = false

/**
 * 아틀라스 크기를 받아 둔다.
 *
 * 안 오면 그림 없이 글만 뜬다 — 판 자체는 CSS라 그림이 없어도 읽을 수 있다
 */
export function loadSignpostAtlas(): void {
  if (asked) return
  asked = true
  void loadSignposts().then((v) => { atlas = v }).catch(() => { /* 그림만 빈다 */ })
}

/** 받아 둔 아틀라스. 아직 안 왔으면 null이고 그때는 글만 뜬다 */
export function signpostAtlas(): Signposts | null {
  return atlas
}

/**
 * 그 간판이 보여야 할 그림의 배경 스타일.
 *
 * @param a       아틀라스 크기. 받는 쪽이 넘긴다 — 시험이 붙을 수 있게 순수 함수다
 * @param type    `generated/signpost_types.txt`의 줄 번호
 * @param picture 원작의 NARC 안 번호. 배치표의 `data[0]`에서 온다
 */
export function signpostImage(a: Signposts, type: number, picture: number): CSSProperties {
  const count = type === SIGNPOST_TYPE_MAP ? a.cityCount : a.routeCount
  // 번호가 표를 벗어나면 빈 판으로 떨어뜨린다. 원작 롬에는 없는 값이지만
  // 배치표의 `data[0]`은 객체마다 뜻이 달라서 엉뚱한 수가 들어올 수 있다
  const n = picture >= 0 && picture < count ? picture : 0
  const cell = (type === SIGNPOST_TYPE_MAP ? a.cityFirst : a.routeFirst) + n
  const col = cell % a.cols
  const row = Math.floor(cell / a.cols)
  return {
    width: a.width * SCALE,
    height: a.height * SCALE,
    backgroundImage: `url(${dataUrl('signposts.png')})`,
    // 아틀라스 전체를 배율만큼 키우고 그 안에서 칸 하나를 창으로 낸다
    backgroundSize: `${a.cols * a.width * SCALE}px auto`,
    backgroundPosition: `-${col * a.width * SCALE}px -${row * a.height * SCALE}px`,
  }
}
