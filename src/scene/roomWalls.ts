// **실내에는 앞벽이 없다** — 세워 준다 (DATA.md §2.2)
//
// 원작 실내는 카메라가 한 각도로 고정이라 **안 보이는 쪽 벽을 아예 안 만들었다.**
// 문이 있는 앞벽(남쪽)과 한쪽 옆벽이 그렇다. 위에서 비스듬히 내려다보는 두 화면
// 안에서는 그 자리가 화면 밖이라 아무 문제가 없지만, 카메라가 도는 우리 화면에서는
// **그 자리가 통째로 검다.**
//
// 실측 (`pnpm holes --walls`, 바닥이 끝나는 자리마다 세로 삼각형이 있는지 센다):
//
//     주인공 방  34자리 중 11이 비었다 (서 · 동)
//     포켓몬센터 60자리 중 19
//     프렌들리숍 40자리 중 9
//     박물관     70자리 중 22
//     도서관     56자리 중 11
//     무쇠탄갱  118자리 중 **0** — 굴은 원작이 사방을 다 만들어 뒀다
//
// 그래서 **바닥이 끝나는데 벽이 안 덮는 높이**에만 벽을 세운다. 굴처럼 이미 다
// 있는 데서는 한 장도 안 는다.
//
// ⚠️ **덮는 높이로 본다 — 「있다·없다」가 아니다.** 무릎 높이 굽도리 한 장을
// 「벽이 있다」로 세면 그 위가 통째로 뚫린 채 지나간다. 어디까지 덮는지는
// `gapsOn`이 가른다.
//
// ⚠️ **출입구는 비운다.** 문 앞 칸(워프)에 벽을 세우면 나갈 수가 없고, 화면에도
// 문이 벽으로 막혀 보인다.
//
// 그림은 **그 방의 벽에서 베낀다.** `plates.floorPatch`의 옆면과 같은 길이다 —
// 제일 가까운 세로 삼각형의 서브메시와 UV 평면을 그대로 쓰고, UV는 타일 안쪽으로
// 되짚어 가장자리 텍셀에 눌리지 않게 한다. 세로 삼각형이 하나도 없는 방에서는
// 못 세운다(그 방에는 베낄 벽이 없다) — 지어내지 않는다.
import { BufferAttribute, BufferGeometry } from 'three'
import { cellKey, cellX, cellZ, type Split } from './plates'

/** 세로로 서 있다고 볼 기울기. `plates.FLOOR_NORMAL`과 같은 잣대의 반대쪽이다 */
const WALL_NORMAL = 0.7

/**
 * 벽이 없을 때 세울 높이 (타일).
 *
 * 방마다 제 벽에서 재는 것이 먼저고, 이 값은 **잴 벽이 있는데도 낮을 때의
 * 최소치**다. 원작 실내 벽이 3~4타일이라 그보다 낮으면 뚫린 것과 다름없다
 */
const MIN_HEIGHT = 3

/**
 * 원작 면과 같은 평면에 세울 때 방 안쪽으로 물리는 폭 (타일).
 *
 * 겹치면 깊이가 다투어 화면에 얼룩이 진다. 타일이 1이므로 이것은 그 50분의 1로,
 * 눈으로는 안 보이고 사람이 지나갈 틈도 아니다 — 통행은 원작 거동값이 정한다
 */
const SHIFT = 0.02

/**
 * 판이 맞닿은 자리의 부동소수 오차. 이보다 얇은 틈은 구멍이 아니다.
 *
 * 실측으로 제일 얇은 **진짜** 구멍이 무쇠탄갱의 0.2타일이었다 (벽이 바닥+2.8에서
 * 끝나 눈높이에서 올려다본 광선 202발이 그 위로 넘어갔다). 그 절반이다
 */
const SEAM = 0.1

/** 세로 면이 덮는 높이 구간 하나 */
type Band = [number, number]

/**
 * 세로 삼각형 하나가 덮는 **모서리들**.
 *
 * 실내 벽은 축에 나란해서 XZ 상자가 한 축으로 얇다. 그 얇은 축의 값이 벽이 선
 * 선이고, 긴 축이 그 벽이 뻗은 칸들이다. 어느 쪽도 안 얇으면(비스듬한 벽) 상자가
 * 닿은 칸의 모서리를 다 적는다 — 실내에는 드물고, 넉넉히 잡는 편이 안전하다
 */
function wallEdges(bx0: number, bx1: number, bz0: number, bz1: number): string[] {
  const out: string[] = []
  const thinX = bx1 - bx0 < 0.35
  const thinZ = bz1 - bz0 < 0.35
  if (thinX && !thinZ) {
    const line = Math.round((bx0 + bx1) / 2)
    for (let tz = Math.floor(bz0); tz <= Math.floor(bz1 - 1e-6); tz++) out.push(`x${String(line)}:${String(tz)}`)
    return out
  }
  if (thinZ && !thinX) {
    const line = Math.round((bz0 + bz1) / 2)
    for (let tx = Math.floor(bx0); tx <= Math.floor(bx1 - 1e-6); tx++) out.push(`z${String(line)}:${String(tx)}`)
    return out
  }
  for (let tz = Math.floor(bz0); tz <= Math.floor(bz1); tz++) {
    for (let tx = Math.floor(bx0); tx <= Math.floor(bx1); tx++) {
      out.push(`x${String(tx)}:${String(tz)}`, `x${String(tx + 1)}:${String(tz)}`,
        `z${String(tz)}:${String(tx)}`, `z${String(tz + 1)}:${String(tx)}`)
    }
  }
  return out
}

/** 그 모서리를 가리키는 열쇠. 칸 (tx,tz)의 (dx,dz) 쪽 */
function edgeKey(tx: number, tz: number, dx: number, dz: number): string {
  return dx !== 0
    ? `x${String(tx + (dx > 0 ? 1 : 0))}:${String(tz)}`
    : `z${String(tz + (dz > 0 ? 1 : 0))}:${String(tx)}`
}

/** 그 모서리에 잇닿은 두 모서리. 같은 선 위에서 좌우다 */
function besideKeys(key: string): [string, string] {
  const at = key.indexOf(':')
  const head = key.slice(0, at)
  const n = Number(key.slice(at + 1))
  return [`${head}:${String(n - 1)}`, `${head}:${String(n + 1)}`]
}

/** 그 모서리를 세로 면이 어떻게 덮는가 */
type Kind =
  /** 아예 없다 — 원작이 앞벽을 통째로 안 만들었다 */
  | 'none'
  /** 눈높이 띠에 걸친다 — 벽은 있는데 덜 덮는다 */
  | 'crossing'
  /** 발치에만 있다 — 바닥이 단으로 끝나는 자리다 */
  | 'foot'

function kindOf(bands: readonly Band[] | undefined, y: number): Kind {
  if (!bands || bands.length === 0) return 'none'
  const parts = joined(bands)
  const band = y + MIN_HEIGHT
  return parts.some((p) => p[1] > y + SEAM && p[0] < band) ? 'crossing' : 'foot'
}

/** 겹치거나 맞닿은 구간을 하나로 잇는다 */
function joined(bands: readonly Band[]): Band[] {
  const out: Band[] = []
  for (const b of [...bands].sort((p, q) => p[0] - q[0])) {
    const last = out[out.length - 1]
    if (last && b[0] <= last[1] + SEAM) last[1] = Math.max(last[1], b[1])
    else out.push([b[0], b[1]])
  }
  return out
}

/**
 * 그 모서리에서 **세워야 할 높이 구간들**. 세울 것이 없으면 빈 배열.
 *
 * ⚠️ **「세로 면이 있다·없다」로는 모자란다.** 그렇게 두면 무릎 높이 굽도리
 * 한 장이 그 모서리를 막힌 것으로 만들고, 눈높이 광선은 그 위로 그냥 넘어간다.
 * 실측으로 주인공 방 북쪽이 그랬다 — 덮는 높이가 `-0.1~4.3`이라 넉넉해 보였지만
 * 낮은 굽도리와 높은 지붕의 **최소·최대**를 붙여 놓은 것이라 가운데가 비어 있었다.
 * 무쇠탄갱·천관산도 벽이 바닥+2.8에서 끝나 363발이 그 위로 샜다.
 *
 * 그래서 셋으로 가른다:
 *
 * - 세로 면이 **아예 없다** → 원작이 앞벽을 통째로 안 만든 자리다. 바닥부터 세운다
 * - 눈높이 띠에 **걸치는 면이 있다** → 벽은 있는데 덜 덮는다. 빈 구간만 메운다
 * - 세로 면이 **발치에만 있다** → 바닥이 단으로 끝나는 자리다. 여기서 **옆을 본다**
 *
 * ⚠️ **발치만 덮인 자리는 옆이 어떻게 되는지로 갈린다.** 바닥이 한 단 올라선
 * 모서리는 옆면이 발치에만 있는데, 그것이 깨어진 세계의 **뜬 발판**일 수도 있고
 * 도서관처럼 **올라선 방바닥의 앞벽이 빠진 것**일 수도 있다 — 기하만 봐서는
 * 똑같다. 그래서 **같은 선 위 이웃 모서리**를 본다: 옆이 바닥 위로 서면 그 벽에
 * 난 구멍이고, 옆도 발치뿐이면 그것이 그 자리의 생김새다(깨어진 세계 236자리).
 *
 * ⚠️ **「옆에 원작 벽이 있는가」로 물으면 안 된다.** 도서관 남쪽이 그 반례다 —
 * 발치만 덮인 셋(9·13·17,11) 양옆은 원작에 벽이 **아예 없어서 우리가 세우는**
 * 자리다. 원작만 보면 옆도 비었으니 안 세우게 되고, 광선 108발이 그리로 샜다.
 * 그래서 묻는 것은 **끝내 서는가**다 — 원작 벽이 있든 우리가 세우든
 *
 * @param top 이 청크에서 제일 높은 벽. 벽이 통째로 없을 때 그만큼 세운다
 * @param propped 잇닿은 모서리가 끝내 바닥 위로 서는가
 */
function gapsOn(
  bands: readonly Band[] | undefined, y: number, top: number, propped: boolean,
): Band[] {
  if (!bands || bands.length === 0) return [[y, y + Math.max(MIN_HEIGHT, top - y)]]
  const parts = joined(bands)
  const band = y + MIN_HEIGHT
  const above = parts.some((p) => p[1] > y + SEAM && p[0] < band)
  if (!above) {
    if (!propped) return []
    // 벽이 통째로 빠진 자리다 — 아무것도 없을 때와 같이 **옆 벽만큼** 세운다.
    // 여기서 `MIN_HEIGHT`로만 세우면 옆 벽보다 낮은 판이 끼어 턱이 진다
    return [[y, y + Math.max(MIN_HEIGHT, top - y)]]
  }
  // 제 꼭대기까지 본다 — 지붕만 높이 떠 있으면 그 아래가 다 구멍이다
  const hi = Math.max(band, parts[parts.length - 1]![1])
  const out: Band[] = []
  let at = y
  for (const [b0, b1] of parts) {
    if (b1 <= at) continue
    if (b0 >= hi) break
    if (b0 > at + SEAM) out.push([at, Math.min(b0, hi)])
    at = Math.max(at, b1)
    if (at >= hi) break
  }
  if (at < hi - SEAM) out.push([at, hi])
  return out
}

/**
 * 그 구멍 **너머에 원작 벽이 서 있는가**. 서 있으면 방의 끝은 거기다.
 *
 * ⚠️ **바닥이 끝났다고 다 방의 끝은 아니다.** 계단이 그렇다 — 주인공 방(맵 415)
 * 은 원작이 `z=4` 선에 `x 6~11`, 높이 `-0.13~4.25`짜리 세로면을 세워 뒀는데,
 * 계단이 내려가느라 그 앞 `(9,4)·(10,4)` 두 칸에 바닥 삼각형이 없다. 그것을
 * 「바닥이 끝나는 자리」로 읽으면 **한 칸 안쪽인 `z=5`에** 바닥부터 천장까지
 * 세우게 된다 — 계단 소품(`z 3.75~5.63`)을 가로질러 방 안으로 튀어나온 벽이다.
 *
 * 그렇다고 그냥 안 세우면 안 된다. 실측으로 빼 보니 1인칭 광선이 9발에서
 * 66발로 늘고 `(9,5)` 북쪽에 빈 높이 2.38이 남았다 — 원작 세로면이 거기 있어도
 * **안에서는 안 그려진다.** 그래서 **자리만 옮긴다**: 구멍 너머 그 선에 세운다.
 *
 * 한 칸만 본다. 더 멀리 보면 옆방 벽을 제 방 벽으로 오인해서 정작 뚫린 자리를
 * 안 메운다 — 실측으로 계단은 한 칸이면 닿는다
 */
const REACH = 1

function closedBeyond(
  cover: Map<string, Band[]>,
  tx: number, tz: number, dx: number, dz: number, y: number,
): number {
  for (let step = 1; step <= REACH; step++) {
    const key = edgeKey(tx + dx * step, tz + dz * step, dx, dz)
    if (kindOf(cover.get(key), y) === 'crossing') return step
  }
  return 0
}

/**
 * **구멍을 방바닥으로 메운다.** 메운 칸을 돌려준다.
 *
 * 자리를 옮겨 세우는 것만으로는 모자랐다 — 계단 벽을 `z=5`에서 `z=4`로 물렸더니
 * 옆벽은 `z=5`에서 시작한 채라 **모서리 `x 11 · z 4~5`가 열렸고**, 45°로 나간
 * 광선 65발이 그리로 비껴 나갔다. 구멍을 방의 일부로 세면 옆벽이 따라 올라와
 * 그 모서리가 닫힌다.
 *
 * 메우는 자리는 둘을 다 채워야 한다:
 *
 *   ① **구멍 너머에 원작 세로면이 선다.** 「이 구멍은 방 밖이 아니라 방 안이다」의
 *      증거다 — 밖이라면 그 너머에 벽이 있을 까닭이 없다
 *   ② **안쪽 모서리에는 원작 면이 하나도 없다.** 원작이 여기에 무언가 그려 뒀다면
 *      그것이 이 자리의 생김새다. 발치에만 있는 것(단)도 그렇다 —
 *      깨어진 세계의 뜬 발판이 그 갈래고, 그것까지 메우면 발판마다 상자가 씌워진다
 *
 * ②를 안 걸었을 때 실측으로 깨어진 세계 둘레의 「벽이 없는 쪽」이 174에서 189로
 * 늘고, 27자리 전체 시점 광선이 51발에서 53발로 늘었다
 */
function fillHoles(floor: Map<number, number>, cover: Map<string, Band[]>): Set<number> {
  const added = new Set<number>()
  for (const [key, y] of [...floor]) {
    const tx = cellX(key), tz = cellZ(key)
    for (const [dx, dz] of SIDES) {
      const at = cellKey(tx + dx, tz + dz)
      if (floor.has(at) || added.has(at)) continue
      if (kindOf(cover.get(edgeKey(tx, tz, dx, dz)), y) !== 'none') continue
      if (closedBeyond(cover, tx, tz, dx, dz, y) === 0) continue
      added.add(at)
      floor.set(at, y)
    }
  }
  return added
}

/** 베낄 벽 삼각형 하나. UV 평면까지 펴 둔다 (`plates.FloorTri`와 같은 꼴) */
interface WallTri {
  group: number
  ax: number; ay: number; az: number
  ux: number; uy: number; uz: number
  vx: number; vy: number; vz: number
  au: number; av: number; du: number; dv: number; eu: number; ev: number
  r: number; g: number; b: number
  cx: number; cz: number
  /** 이 벽이 서 있는 높이 범위 */
  y0: number; y1: number
  /**
   * 이 삼각형이 놓인 **선** — 얇은 축과 그 값. 비스듬한 벽은 `null`.
   *
   * 같은 벽이 층으로 겹쳐 있어서 필요하다 (`nearestWall`)
   */
  axis: 'x' | 'z' | null
  line: number
}

export interface RoomWalls {
  geometry: BufferGeometry
  /** `[시작, 개수, 서브메시]`. 청크 재질 배열을 그대로 쓴다 */
  groups: [number, number, number][]
  /** 세운 판 수. 시험과 감사가 읽는다 */
  count: number
}

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

/** 칸 테두리 (월드 타일). 양끝을 포함한다 */
interface FloorExtent { minX: number, minZ: number, maxX: number, maxZ: number }

/**
 * 월드 타일 열쇠.
 *
 * `plates.cellKey`는 청크 로컬(−48~+48)용이라 못 쓴다 — 여기 오는 것은 청크가
 * 놓인 자리를 더한 월드 좌표고, 판이 청크 밖으로 삐져나가면 음수도 된다
 * (맵 89가 x −2까지 간다)
 */
const TILE_BIAS = 512
const TILE_SPAN = 4096
export const tileKey = (x: number, z: number): number =>
  (x + TILE_BIAS) * TILE_SPAN + (z + TILE_BIAS)
const tileX = (key: number): number => Math.floor(key / TILE_SPAN) - TILE_BIAS
const tileZ = (key: number): number => (key % TILE_SPAN) - TILE_BIAS

/**
 * 이 청크에서 **바닥이 실제로 그려진** 칸들 (월드 타일 열쇠).
 *
 * ⚠️ **통행 격자도 BDHC 판도 방의 크기가 아니다.** 실내 행렬은 32×32인데 방은
 * 그 일부이고, 통행 자료는 방 밖도 「안 막힘」으로 두고(포켓몬센터 1,024칸 중
 * 901칸이 열려 있다), 높이 판은 아예 행렬 전체를 덮는 맵이 넷 중 넷이다
 * (`node .audit/roomBox.mjs`). **그려진 바닥만이 방이다** — 그리고 그것을 이미
 * `survey`가 세고 있다 (벽을 세울 자리를 찾느라).
 */
export function floorTiles(split: Split, origin: { x: number, z: number }): number[] {
  const { floor } = survey(split)
  const out: number[] = []
  for (const key of floor.keys()) out.push(tileKey(cellX(key) + origin.x, cellZ(key) + origin.z))
  return out
}

/**
 * 그려진 바닥을 **방마다 갈라** 방마다 테두리를 낸다.
 *
 * ⚠️ **테두리 상자 하나로는 안 된다.** 방에서 떨어진 바닥 한 칸이 상자를 통째로
 * 부풀린다 — 연고시티 체육관 문 방(맵 89)은 걸어 다니는 자리가 x 1~16 · z 2~10인데
 * 그려진 바닥을 통째로 감싸면 x −2~24 · z 0~19가 된다. 그 여유만큼 카메라가 벽을
 * 지나 밖으로 나가고, 밖에는 아무것도 없어서 화면의 73.1%가 검었다 (REPAIR §13).
 *
 * ⚠️ **「이어진 바닥」만으로는 안 갈라진다.** 실측으로 맵 89의 바닥 371칸이
 * **한 덩어리**다 — 벽 밑에도 바닥이 깔려 있어서 방 안과 방 밖이 그 벽을 지나
 * 붙는다(`node .audit/roomFloorMap.mjs`).
 *
 * 그래서 **걸어 다닐 수 있는 칸으로만 번진다.** 막힌 칸은 번지지 않고 테두리에만
 * 든다 — 벽 밑 한 겹은 방의 일부라 카메라가 그 위에 서도 발밑이 바닥이지만,
 * 그 너머로는 못 넘어간다.
 *
 * 카메라는 주인공이 선 방을 골라 쓴다 (`actor/camera`의 `roomAt`)
 */
export function floorRegions(
  tiles: readonly number[], blocked: (x: number, z: number) => boolean,
): FloorExtent[] {
  const floor = new Set(tiles)
  const left = new Set<number>()
  for (const k of floor) if (!blocked(tileX(k), tileZ(k))) left.add(k)
  const out: FloorExtent[] = []
  const stack: number[] = []
  for (const seed of tiles) {
    if (!left.delete(seed)) continue
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity
    const grow = (x: number, z: number): void => {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
    stack.push(seed)
    while (stack.length > 0) {
      const key = stack.pop()!
      const x = tileX(key), z = tileZ(key)
      grow(x, z)
      for (const [dx, dz] of SIDES) {
        const nx = x + dx, nz = z + dz
        const nk = tileKey(nx, nz)
        // 막힌 칸은 벽 밑이다 — 테두리에는 넣되 그 너머로는 안 번진다
        if (left.delete(nk)) stack.push(nk)
        else if (floor.has(nk)) grow(nx, nz)
      }
    }
    out.push({ minX, minZ, maxX: maxX + 1, maxZ: maxZ + 1 })
  }
  return out
}

/**
 * 이 청크의 바닥과 벽을 훑는다.
 *
 * `floor`는 칸마다 **제일 높은 바닥 높이**, `cover`는 모서리마다 세로 면이
 * 덮는 **높이 구간들**, `tris`는 베낄 수 있는 벽 삼각형이다
 */
function survey(split: Split): {
  floor: Map<number, number>
  cover: Map<string, Band[]>
  tris: WallTri[]
  top: number
} {
  const posAttr = split.geometry.getAttribute('position') as BufferAttribute | undefined
  const pos = posAttr?.array as Float32Array | undefined
  const uvAttr = split.geometry.getAttribute('uv') as BufferAttribute | undefined
  const uv = uvAttr?.array as Float32Array | undefined
  const colAttr = split.geometry.getAttribute('color') as BufferAttribute | undefined
  const col = colAttr?.array as ArrayLike<number> | undefined
  const index = split.geometry.getIndex()?.array
  const floor = new Map<number, number>()
  const cover = new Map<string, Band[]>()
  const tris: WallTri[] = []
  let top = -Infinity
  if (!index || !pos) return { floor, cover, tris, top }

  for (const [start, count, group] of split.groups) {
    for (let t = 0; t < count; t += 3) {
      const a = index[start + t]!, b = index[start + t + 1]!, c = index[start + t + 2]!
      const ax = pos[a * 3]!, ay = pos[a * 3 + 1]!, az = pos[a * 3 + 2]!
      const ux = pos[b * 3]! - ax, uy = pos[b * 3 + 1]! - ay, uz = pos[b * 3 + 2]! - az
      const vx = pos[c * 3]! - ax, vy = pos[c * 3 + 1]! - ay, vz = pos[c * 3 + 2]! - az
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz)
      if (len < 1e-9) continue
      const flat = Math.abs(ny) / len >= WALL_NORMAL
      const bx0 = Math.min(ax, ax + ux, ax + vx), bx1 = Math.max(ax, ax + ux, ax + vx)
      const bz0 = Math.min(az, az + uz, az + vz), bz1 = Math.max(az, az + uz, az + vz)
      const y0 = Math.min(ay, ay + uy, ay + vy), y1 = Math.max(ay, ay + uy, ay + vy)

      if (flat) {
        // 바닥 — 삼각형 **안에 든 칸만** 적는다 (`plates.gatherFloors`와 같다)
        const area = ux * vz - vx * uz
        if (Math.abs(area) < 1e-9) continue
        for (let tz = Math.floor(bz0); tz <= Math.floor(bz1); tz++) {
          for (let tx = Math.floor(bx0); tx <= Math.floor(bx1); tx++) {
            const px = tx + 0.5 - ax, pz = tz + 0.5 - az
            const w1 = (px * vz - vx * pz) / area
            const w2 = (ux * pz - px * uz) / area
            if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue
            const key = cellKey(tx, tz)
            const y = ay + w1 * uy + w2 * vy
            const had = floor.get(key)
            if (had === undefined || y > had) floor.set(key, y)
          }
        }
        continue
      }

      // 벽 — **모서리 단위로** 적는다.
      //
      // ⚠️ **칸 단위로 적으면 안 된다.** 「이 칸에 벽이 있다」로 두면 북쪽 벽
      // 하나가 그 칸의 **서·동·남 모서리까지** 막힌 것으로 만든다 — 3×3 방에서
      // 세울 자리 아홉 중 둘이 그렇게 조용히 빠졌다 (`roomWalls.test`가 잡았다).
      // 실내 벽은 축에 나란하므로 얇은 축을 보고 어느 선 위인지 정한다
      for (const line of wallEdges(bx0, bx1, bz0, bz1)) {
        const had = cover.get(line)
        if (had) had.push([y0, y1])
        else cover.set(line, [[y0, y1]])
      }
      if (y1 > top) top = y1
      if (!uv) continue
      tris.push({
        group,
        ax, ay, az, ux, uy, uz, vx, vy, vz,
        au: uv[a * 2]!, av: uv[a * 2 + 1]!,
        du: uv[b * 2]! - uv[a * 2]!, dv: uv[b * 2 + 1]! - uv[a * 2 + 1]!,
        eu: uv[c * 2]! - uv[a * 2]!, ev: uv[c * 2 + 1]! - uv[a * 2 + 1]!,
        r: col ? col[a * 3]! : 1, g: col ? col[a * 3 + 1]! : 1, b: col ? col[a * 3 + 2]! : 1,
        cx: ax + (ux + vx) / 3, cz: az + (uz + vz) / 3,
        y0, y1,
        axis: bx1 - bx0 < 0.35 ? 'x' : (bz1 - bz0 < 0.35 ? 'z' : null),
        line: bx1 - bx0 < 0.35 ? (bx0 + bx1) / 2 : (bz0 + bz1) / 2,
      })
    }
  }
  return { floor, cover, tris, top }
}

/**
 * 그 벽 삼각형의 UV 평면 위에서 (가로거리, 높이)를 그림 좌표로 옮기는 아핀.
 *
 * 벽은 세로면이라 (x, z) 둘 중 **가로로 눕는 축**과 y가 평면을 이룬다. 그 둘을
 * 삼각형의 u·v 무게중심으로 풀어 UV를 얻는다
 */
function uvOnWall(src: WallTri): (x: number, y: number, z: number) => [number, number] {
  // 벽면 위의 두 방향 (u, v)를 (가로, 세로) 성분으로 줄인다
  const hx = src.ux, hz = src.uz, hy = src.uy
  const gx = src.vx, gz = src.vz, gy = src.vy
  // 가로 축은 x·z 중 이 벽이 실제로 뻗은 쪽이다
  const alongX = Math.abs(hx) + Math.abs(gx) >= Math.abs(hz) + Math.abs(gz)
  const h1 = alongX ? hx : hz
  const g1 = alongX ? gx : gz
  const det = h1 * gy - g1 * hy
  return (x, y, z) => {
    if (Math.abs(det) < 1e-9) return [src.au, src.av]
    const p1 = (alongX ? x - src.ax : z - src.az)
    const p2 = y - src.ay
    const w1 = (p1 * gy - g1 * p2) / det
    const w2 = (h1 * p2 - p1 * hy) / det
    return [src.au + w1 * src.du + w2 * src.eu, src.av + w1 * src.dv + w2 * src.ev]
  }
}

/**
 * 세로로 1타일 올라갈 때 **UV가 움직이는 거리.** 무늬가 실린 층일수록 크다
 *
 * ⚠️ 원작 실내 벽은 한 장이 아니라 **여러 층이 같은 평면에 겹쳐** 있다.
 * 주인공 방(맵 415)의 `z=3.6` 벽을 재면 네 층이다:
 *
 * | 높이 | UV의 v | 1타일당 UV | 그림의 어디 |
 * |---|---|---:|---|
 * | -0.1~0.1 | .875~.881 | 0.030 | 회색 띠 |
 * | 0.1~0.8 | .594~.705 | 0.159 | 크림색 굽도리 |
 * | 0.8~4.3 | .781~.969 | 0.054 | **회색 띠** |
 * | 0.8~3.8 | .027~.594 | 0.189 | **크림색 벽지** |
 *
 * 회색 띠는 벽지 뒤에 깔린 **받침**이고 눈에 보이는 것은 벽지다.
 * 그런데 네 층의 무게중심이 xz에서 똑같아서 「제일 가까운 것」이 그냥 처음
 * 만난 것으로 갈렸고, 실제로 회색 받침이 뽑혔다 — 계단 옆에 **바닥부터
 * 천장까지 새까만 판때기**가 섰다 (`.audit/wallSource.mjs`).
 */
function uvPerHeight(t: WallTri): number {
  const at = uvOnWall(t)
  const [u0, v0] = at(t.ax, t.ay, t.az)
  const [u1, v1] = at(t.ax, t.ay + 1, t.az)
  return Math.hypot(u1 - u0, v1 - v0)
}

/**
 * 그 칸에서 제일 가까운 벽 삼각형. **같은 선 위에 층이 겹치면 무늬가 실린 층**을
 * 고른다 (`uvPerHeight`)
 */
function nearestWall(tris: readonly WallTri[], x: number, z: number): WallTri | null {
  let near: WallTri | null = null
  let far = Infinity
  for (const t of tris) {
    const d = (t.cx - x) ** 2 + (t.cz - z) ** 2
    if (d < far) { far = d; near = t }
  }
  if (!near || near.axis === null) return near
  let best = near
  let dense = uvPerHeight(near)
  for (const t of tris) {
    // ⚠️ **높이가 겹치는 것만 보면 안 된다.** 제일 가까운 것이 바닥에 붙은
    // 0.2 높이짜리 회색 조각이면 벽지(0.8~3.8)와 안 겹쳐서 아무것도 안 걸린다.
    // 같은 선 위면 UV를 그 판 자리로 되짚으므로(`shiftX`/`shiftZ`) 멀어도 된다
    if (t.axis !== near.axis || Math.abs(t.line - near.line) > 0.05) continue
    const k = uvPerHeight(t)
    if (k > dense) { dense = k; best = t }
  }
  return best
}

/**
 * 바닥이 끝나는데 벽이 없는 자리에 벽을 세운다. 세울 것이 없으면 `null`.
 *
 * @param door 그 칸이 출입구인가 (월드 타일). 여기는 비운다
 * @param origin 청크가 놓인 자리. `door`에 월드 좌표로 물으려고 받는다
 */
export function roomWalls(
  split: Split,
  door: (tx: number, tz: number) => boolean,
  origin: { x: number, z: number } = { x: 0, z: 0 },
): RoomWalls | null {
  const { floor, cover, tris, top } = survey(split)
  if (floor.size === 0 || tris.length === 0) return null
  const holes = fillHoles(floor, cover)

  const bucket = new Map<number, {
    position: number[]; uv: number[]; color: number[]; normal: number[]
  }>()
  const into = (group: number) => {
    let b = bucket.get(group)
    if (!b) { b = { position: [], uv: [], color: [], normal: [] }; bucket.set(group, b) }
    return b
  }

  // ⚠️ **두 번 돈다.** 발치만 덮인 모서리는 옆이 **끝내 서는지**를 봐야 갈리는데,
  // 그 답에는 우리가 세울 판도 들어간다 (`gapsOn` 주석). 그래서 먼저 갈래만
  // 매기고, 세우는 것은 그 다음이다. 출입구는 비우는 자리라 갈래에서 뺀다 —
  // 문간을 「선 벽」으로 세면 그 옆 단이 벽이 된다
  const kinds = new Map<string, Kind>()
  for (const [key, y] of floor) {
    const tx = cellX(key), tz = cellZ(key)
    if (door(tx + origin.x, tz + origin.z)) continue
    for (const [dx, dz] of SIDES) {
      if (floor.has(cellKey(tx + dx, tz + dz))) continue
      kinds.set(edgeKey(tx, tz, dx, dz), kindOf(cover.get(edgeKey(tx, tz, dx, dz)), y))
    }
  }
  /** 그 모서리가 끝내 바닥 위로 서는가 — 원작 벽이든 우리가 세우는 것이든 */
  const stands = (k: string): boolean => {
    const kind = kinds.get(k)
    return kind === 'none' || kind === 'crossing'
  }

  let count = 0
  for (const [key, y] of floor) {
    const tx = cellX(key), tz = cellZ(key)
    for (const [dx, dz] of SIDES) {
      if (floor.has(cellKey(tx + dx, tz + dz))) continue
      /**
       * 메운 구멍의 바깥쪽은 **원작 세로면이 있어도 세운다.**
       *
       * 거기 원작 면이 있다는 것은 `fillHoles`가 이미 확인한 사실이다. 그런데도
       * 방 안에서 보면 뚫려 있었다 — 실측으로 계단 자리를 안 세워 봤더니 1인칭
       * 광선이 9발에서 66발로 늘었다. 그 면은 있어도 **안에서는 안 그려진다.**
       * 같은 평면이 되므로 방 안쪽으로 `SHIFT`만큼 물려 깊이 다툼을 피한다
       */
      const filled = holes.has(key)
      const back = filled ? SHIFT : 0
      // 이 **모서리**를 세로 면이 어디까지 덮는가. 안 덮인 띠만 메운다
      const edge = edgeKey(tx, tz, dx, dz)
      const gaps = filled
        ? [[y, y + Math.max(MIN_HEIGHT, top - y)] as Band]
        : gapsOn(cover.get(edge), y, top, besideKeys(edge).some(stands))
      if (gaps.length === 0) continue
      // 출입구는 비운다 — 막으면 못 나가고 문이 벽으로 덮인다
      if (door(tx + origin.x, tz + origin.z)) continue

      const src = nearestWall(tris, tx + 0.5, tz + 0.5)
      if (!src) continue
      const at = uvOnWall(src)
      // 판은 칸 경계에 선다. 방 **안쪽**을 보게 감는다.
      //
      // ⚠️ **법선 속성이 아니라 감는 순서가 앞뒤를 정한다.** 둘이 어긋나면
      // 화면에서는 그냥 안 보인다 — GPU도 광선도 뒷면을 버리고, 셰이딩 법선은
      // 「그려질 때」만 쓰인다. 실제로 x쪽 벽(동·서)만 거꾸로 감겨 있었고,
      // 주인공 방에서 동쪽으로 쏜 광선 526발이 벽을 그냥 통과했다.
      //
      // 아랫변 방향을 `d = p1 - p0`라 하면 기하 법선이 `(-d.z, 0, d.x)`이므로,
      // 안쪽 `(-dx, 0, -dz)`와 같으려면 **`d = (-dz, 0, dx)`** 여야 한다
      const lineX = tx + (dx > 0 ? 1 : 0) - dx * back
      const lineZ = tz + (dz > 0 ? 1 : 0) - dz * back
      const [p0x, p0z] = dx !== 0
        ? [lineX, tz + (dx > 0 ? 0 : 1)]
        : [tx + (dz > 0 ? 1 : 0), lineZ]
      const [p1x, p1z] = dx !== 0
        ? [lineX, tz + (dx > 0 ? 1 : 0)]
        : [tx + (dz > 0 ? 0 : 1), lineZ]
      const bin = into(src.group)
      // ⚠️ **UV는 베껴 온 벽의 자리로 되짚는다.** 목표 칸 좌표를 그대로 넣으면
      // 그 벽에서 멀어진 만큼 UV가 타일을 벗어나 가장자리 텍셀로 눌린다.
      // 높이는 **바닥에서 잰다** — 띠 중간부터 세우는 판도 그림의 세로 위상이
      // 바닥에 맞아야 원래 벽과 이어져 보인다
      const shiftX = Math.floor(src.cx) - tx
      const shiftZ = Math.floor(src.cz) - tz
      const uvAt = (px: number, py: number, pz: number): [number, number] =>
        at(px + shiftX, src.y0 + (py - y), pz + shiftZ)
      for (const [lo, hi] of gaps) {
        const face: [number, number, number][] = [
          [p0x, lo, p0z], [p1x, lo, p1z], [p1x, hi, p1z],
          [p0x, lo, p0z], [p1x, hi, p1z], [p0x, hi, p0z],
        ]
        for (const [px, py, pz] of face) {
          const [u, v] = uvAt(px, py, pz)
          bin.position.push(px, py, pz)
          bin.uv.push(u, v)
          bin.color.push(src.r, src.g, src.b)
          bin.normal.push(-dx, 0, -dz)
        }
        count += 1
      }
    }
  }
  if (count === 0) return null

  let total = 0
  for (const b of bucket.values()) total += b.position.length / 3
  const position = new Float32Array(total * 3)
  const uv = new Float32Array(total * 2)
  const color = new Float32Array(total * 3)
  const normal = new Float32Array(total * 3)
  const groups: [number, number, number][] = []
  let at = 0
  for (const [group, b] of bucket) {
    const n = b.position.length / 3
    position.set(b.position, at * 3)
    uv.set(b.uv, at * 2)
    color.set(b.color, at * 3)
    normal.set(b.normal, at * 3)
    groups.push([at, n, group])
    at += n
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
  geometry.setAttribute('color', new BufferAttribute(color, 3))
  geometry.setAttribute('normal', new BufferAttribute(normal, 3))
  for (const [start, n, group] of groups) geometry.addGroup(start, n, group)
  geometry.computeBoundingSphere()
  return { geometry, groups, count }
}
