// 가이드맵의 지도 셈 — 그림 영역 · 배율 · 이름표 쪽 · 이동(pan) · Q/E 걸음 (시험이 브라우저 없이 돈다).
//
// 지도 그림 `townMap.png`는 256×192인데 **쓰는 곳은 가운데 216×168뿐이다.** 왼쪽 x 0~15와 오른쪽 x 240~은 원작 위 화면의
// 파란 띠, 아래 y 168~은 이름이 찍히던 노란 띠라 한 화면인 우리에게는 장식이다. 좌표 체계는 그림 좌표 그대로이고
// (`gridX` · `gridY`), 화면에 놓을 때만 `(좌표 − 영역 시작) × 배율`이다 — 커서 칸 셈은 이 파일이 안 건드린다.
import { FLY_SPOTS, GRID, gridX, gridY, SHAPE_SIZE } from '../../engine/map/townMap'
import type { DataLocale } from '../../data/gameData'
import type { PixelScale } from '../theme/scale'

/** 원작 위 화면 전체 (`townMap.png`) */
export const SHEET = { w: 256, h: 192 } as const

/**
 * 그림에서 쓰는 영역. 둘레는 모두 잰 값이다 — 좌우 흰 선(x 16~19 · 236~239)과 띠가 이 밖에 있다 (`flyMap.test`가 그림과 맞댄다)
 */
export const CROP = { x: 20, y: 0, w: 216, h: 168 } as const

/** 정수 배율 둘 — 전체(3배)와 확대(4배). 2.2배 같은 소수 배율은 없다 */
export const ZOOM: { out: PixelScale, in: PixelScale } = { out: 3, in: 4 }

/** 날 수 있는 곳 한 자리 */
export type Spot = (typeof FLY_SPOTS)[number]

/** 이름표가 표식의 어느 쪽에 앉는가 — 왼 · 오른 · 위 · 아래 */
type LabelSide = 'l' | 'r' | 't' | 'b'

/**
 * 언어마다 이름표가 앉는 쪽 (`spawn` 번호 → 쪽).
 *
 * 글 폭이 언어마다 달라서(영어는 길고 한글은 좁다) 표가 셋이다. 스물 자리가 **다 열린 판에서** 굵은 12px 이름표가
 * ① 지도 영역 안에 들고 ② 서로 안 겹치고 ③ 어느 표식도 안 덮도록 3배 · 4배에서 함께 찾은 값이다.
 * 글 폭은 실제 글꼴(Pretendard Bold, 가나는 Noto Sans JP Bold)의 advance 폭에 바깥 외곽선 3px을 더해 쟀다 —
 * `flyMap.test`가 세 언어 모두 같은 조건을 다시 잰다. 글꼴이나 지명이 바뀌면 그 시험이 깨진다
 */
export const LABEL_SIDE: Readonly<Record<DataLocale, Readonly<Record<number, LabelSide>>>> = {
  ko: {
    0: 'l', 1: 'r', 2: 'l', 3: 'b', 4: 'r', 16: 'r', 17: 'l', 5: 't', 6: 'b', 7: 'r',
    8: 'r', 9: 'b', 10: 'b', 11: 'l', 12: 'l', 13: 'r', 15: 'r', 18: 'r', 14: 'b', 19: 'l',
  },
  en: {
    0: 'r', 1: 'r', 2: 'l', 3: 'l', 4: 'r', 16: 'r', 17: 'l', 5: 't', 6: 'b', 7: 'r',
    8: 'r', 9: 'l', 10: 'b', 11: 'l', 12: 'l', 13: 'r', 15: 'r', 18: 'r', 14: 'b', 19: 'l',
  },
  ja: {
    0: 'r', 1: 'r', 2: 'l', 3: 'b', 4: 'r', 16: 'r', 17: 'l', 5: 't', 6: 'b', 7: 'r',
    8: 'r', 9: 'l', 10: 'b', 11: 'l', 12: 'l', 13: 'r', 15: 'r', 18: 'r', 14: 'b', 19: 'l',
  },
}

/** 이름표와 표식 사이 · 위아래 이름표의 간격 (px) */
const LABEL_GAP = { side: 5, vert: 3 } as const

interface Box { left: number, top: number, width: number, height: number }

/** 그림 좌표 한 점 → 영역 안 화면 px */
function at(x: number, y: number, k: number): { left: number, top: number } {
  return { left: (x - CROP.x) * k, top: (y - CROP.y) * k }
}

/** 지도 한 장의 화면 크기 */
export function mapSize(k: number): { w: number, h: number } {
  return { w: CROP.w * k, h: CROP.h * k }
}

/** 날 수 있는 곳 표식 한 장의 자리 */
export function markBox(spot: Spot, k: number): Box {
  const [w, h] = SHAPE_SIZE[spot.shape] ?? [GRID, GRID]
  return { ...at(gridX(spot.x) + spot.dx, gridY(spot.z) + spot.dy, k), width: w * k, height: h * k }
}

/** 격자 한 칸의 자리 — 구역 하이라이트와 커서가 쓴다. 한 칸은 7 원본px이고 안쪽으로 1 붙는다 */
export function cellBox(x: number, z: number, k: number): Box {
  return { ...at(gridX(x) - 1, gridY(z) - 1, k), width: GRID * k, height: GRID * k }
}

/** 이름표의 기준점과 글자 상자를 그 점에 앉히는 변환. 글 폭을 어림하지 않는다 — 앉힘은 CSS 변환이 한다 */
export function labelAnchor(spot: Spot, k: number, locale: DataLocale): { left: number, top: number, transform: string } {
  const m = markBox(spot, k)
  switch (LABEL_SIDE[locale][spot.spawn] ?? 'r') {
    case 'l': return { left: m.left - LABEL_GAP.side, top: m.top + m.height / 2, transform: 'translate(-100%, -50%)' }
    case 't': return { left: m.left + m.width / 2, top: m.top - LABEL_GAP.vert, transform: 'translate(-50%, -100%)' }
    case 'b': return { left: m.left + m.width / 2, top: m.top + m.height + LABEL_GAP.vert, transform: 'translate(-50%, 0)' }
    default: return { left: m.left + m.width + LABEL_GAP.side, top: m.top + m.height / 2, transform: 'translate(0, -50%)' }
  }
}

/** 한 칸의 한가운데 (화면 px) — 주인공 표식과 이동의 기준 */
export function cellCenter(x: number, z: number, k: number): { x: number, y: number } {
  const p = at(gridX(x) + 2.5, gridY(z) + 2.5, k)
  return { x: p.left, y: p.top }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * 지도를 얼마나 밀어 놓을까 — 커서를 가운데에 두되 지도 끝을 넘지 않는다. 지도가 창보다 작으면 가운데에 둔다.
 *
 * 연출일 뿐이다 — 커서 칸 셈은 이 값과 상관이 없다
 */
export function panFor(
  cursor: { x: number, z: number }, k: number, view: { w: number, h: number },
): { x: number, y: number } {
  const map = mapSize(k)
  const c = cellCenter(cursor.x, cursor.z, k)
  return {
    x: map.w > view.w ? clamp(view.w / 2 - c.x, view.w - map.w, 0) : (view.w - map.w) / 2,
    y: map.h > view.h ? clamp(view.h / 2 - c.y, view.h - map.h, 0) : (view.h - map.h) / 2,
  }
}

/**
 * Q · E — 열린 날기 자리를 차례로 돈다 (`FLY_SPOTS` 표 차례 = 이야기 순서). 끝에서는 돌아간다.
 *
 * `current`가 열린 자리 밖(닫힌 자리 · 날기 자리 아닌 칸)이면 E는 첫 자리로, Q는 마지막 자리로 간다.
 * 열린 곳이 없으면 null이다
 */
export function stepSpot(open: readonly Spot[], current: Spot | null, dir: 1 | -1): Spot | null {
  if (open.length === 0) return null
  const at = current === null ? -1 : open.findIndex((s) => s.spawn === current.spawn)
  if (at < 0) return dir > 0 ? open[0]! : open[open.length - 1]!
  return open[(at + dir + open.length) % open.length]!
}

/**
 * 이름표를 붙일 자리 — 같은 이름이 앞에 이미 있으면 뺀다. 포켓몬리그가 마주 붙은 두 자리(챔피언로드 앞 · 정문)로 나뉘는데
 * 이름이 같아서, 둘 다 열려도 한 곳으로 읽히게 하나만 붙인다. `nameOf`는 그 자리의 이름이다
 */
export function labelledSpots(open: readonly Spot[], nameOf: (s: Spot) => string): Spot[] {
  const seen = new Set<string>()
  return open.filter((s) => {
    const name = nameOf(s)
    if (name === '' || seen.has(name)) return false
    seen.add(name)
    return true
  })
}

/** 행동 줄 글(`flyCaption`)을 키캡 글자와 말로 가른다 — 「Z · 여기로 날아간다」 → Z + 「여기로 날아간다」 */
export function captionParts(caption: string): { key: string | null, text: string } {
  const m = /^([A-Z]) · (.+)$/.exec(caption)
  return m === null ? { key: null, text: caption } : { key: m[1]!, text: m[2]! }
}

/** 바닥 안내 — 키 글자는 `KeyHints`가 키캡으로 감싼다. 보기만 하는 지도는 날기를 안 말한다 */
export function flyFoot(zoomed: boolean, viewOnly: boolean): string {
  return `↑↓←→ 옮기기 · Q/E 날 수 있는 곳 · Tab ${zoomed ? '전체' : '확대'}${viewOnly ? '' : ' · Z 날아간다'} · X 닫기`
}
