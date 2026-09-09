// 그린 것이 없는 자리를 막는다 (REPAIR.md §22)
//
// **원작이 방 밖을 안 막는다.** 청크의 통행표(perm)는 32×32 전부를 담는데 방은
// 그중 일부만 쓰고, 남는 칸은 0x0000 — 곧 「걸을 수 있음」이다. DS 원작도
// 그대로다(`TerrainCollisionManager_CheckCollision`은 그 비트 하나만 본다).
// 위에서 내려다보는 2D 화면에서는 갈 일이 없어 아무도 안 밟았을 뿐이다.
//
// 3인칭에서는 밟힌다. 실측(`.audit/probe/sealCheck.mjs`) — 게임을 처음부터 걸어서
// 닿는 칸 110,809개 중 **4,170개가 발밑에 그려진 것이 하나도 없다**:
//
//   사천왕 방 넷      각 803칸  맵 176→177로 들어오면 (8,11)에 내려서는데
//   (행렬 183~186)             `disarmWarp` 때문에 그 칸에서 발을 뗄 수 있고,
//                              한 칸 남쪽 (8,12)이 벽의 틈이다
//   연고 관장 방      788칸    방이 z=15에서 끝나는데 통행표는 32×32가 다 열려 있다
//   (행렬 225)
//   운하 체육관       116칸    ⚠️ 결함이 아니다 — 바닥 없이 뜨는 판으로만 다니는 방
//   오버월드           54칸    야외다
//
// 그래서 **여기서 원작과 갈라선다** — 「바닥이 그려져 있지 않으면 못 간다」.
// 무엇이 그려져 있는지는 굽는 쪽이 비트로 적어 준다 (`chunks/cover.bin` ·
// `props/index.json`의 `boxes`).
//
// ⚠️ **장치가 통행을 따로 쥐는 방은 손대지 않는다.** 운하시티 체육관은 아예
// 바닥이 없고 뜨는 판 스물넷 위로만 다니며, 깨어진 세계는 높이가 지형이 아니라
// 들고 다니는 상태다. 거기서 「그린 것이 없다」는 결함이 아니라 설계다.
//
// ⚠️ **행사 칸은 바닥에 닿아 있을 때만 남긴다.** 워프·사람·간판·트리거 5,504칸을
// 재 보면 5,485칸이 그린 바닥 **위**에 있고, 3칸이 모델 가장자리에서 **한 칸**
// 벗어나 있다(문턱이다). 나머지 16칸은 세 칸 넘게 떨어져 있는데 전부 롬에 남은
// 죽은 자료다 — 「수수께끼의 장소」의 사람 다섯, 못 밟는 구석(0,0)·(1,1)에 앉은
// 남는 헤더의 워프 여덟, 그리고 연고 체육관 관장 방(맵 91)의 문 셋.
//
// 그 문 셋은 `scripts.order`로 확인했다: 맵 91이 `hearthome_city_gym_leader_room`,
// 문이 가리키는 맵 92·94는 `scripts_empty`고 93·95·100은 `dp_gym_elevator_room_1`·
// `_2`·`dp_gym_leader_room` — **다이아·펄 체육관의 남은 방들**이다. 백금에서 안
// 쓰는 방이라 막아도 잃는 것이 없다. 그래서 「닿아 있는가」를 한 칸으로 끊는다.
import { IMPASSABLE } from './zone'
import type { HeightData } from './height'
import type { MatrixMeta } from './grid'


/** 청크 한 변의 칸 수. 4세대 전 행렬이 32로 같다 */
const CHUNK = 32
/**
 * 이어 붙이는 다리의 길이 한도 — 안 그려진 칸 **두 칸**까지 (`dist+dist+1`).
 *
 * 배틀프런티어(행렬 256) 동쪽 날개가 x=63의 두 칸으로만 이어져 있어서 이 장치가
 * 생겼다. 길이를 안 막으면 **방 밖 허공에 길을 내 준다** — 연고 체육관 관장 방
 * (행렬 225)에서 벽 뒤에 갇힌 한 칸(1,14)까지 일곱 칸짜리 다리가 났고, 그 길이
 * 곧 「바닥 없이 걷는 자리」였다.
 *
 * ⚠️ **지금은 다리가 하나도 안 쓰인다.** 높이 판을 바닥 증거로 치기 시작한
 * 뒤로(`plateFloor`), 한도를 1로 낮춰 다리를 통째로 끊어도 걸어서 닿는 칸이
 * 106,754로 **똑같다**(실측). 그래도 남겨 두는 것은 굽는 쪽이 바닥 하나를
 * 놓쳤을 때 길이 끊기는 것보다 두 칸 걷는 편이 낫기 때문이다
 */
const MAX_BRIDGE = 3
/** 청크 하나의 비트 수 ÷ 8 */
const COVER_BYTES = CHUNK * CHUNK / 8

export interface FloorCover {
  /** land 번호마다 128B. 비트 `z*32+x`가 서면 그 칸 밑에 그린 것이 있다 */
  bits: Uint8Array
  /** 소품 모델마다 XZ 상자 `[x0, z0, x1, z1]`. 그린 것이 없으면 null */
  boxes: readonly (readonly [number, number, number, number] | null)[]
  /** 상자의 단위. `chunks/index.json`의 `posScale`이다 */
  posScale: number
}

/**
 * BDHC 판이 덮는 칸 — **딱 맞게 깎아 놓은 판일 때만**.
 *
 * 높이 판은 두 갈래다. 배틀팩토리(land 321)는 판 스물하나가 방에 딱 맞고
 * 높이가 5.88·4.87·3.88·2.87·1.88·0.87·−0.13으로 **계단**이다 — 그 방이 거기
 * 있다는 뜻이다. 사천왕 방(land 260)은 판 열여섯이 32×32를 **통째로** 8×8씩
 * 나눠 덮고 높이가 전부 0.00이다 — 아무것도 안 적은 것과 같은 기본판이다.
 *
 * 그래서 **청크를 다 덮는 판은 안 믿는다.** 굽는 쪽이 놓친 바닥(배틀팩토리
 * 아래쪽 절반이 그렇다)을 막아 버리지 않으면서, 방 밖 허공은 그대로 막는다.
 */
function plateFloor(height: HeightData, land: number): Uint8Array | null {
  const span = height.chunks[land]
  if (!span) return null
  const [start, count] = span
  const hit = new Uint8Array(CHUNK * CHUNK)
  const s = height.fixedPerTile
  let n = 0
  for (let i = 0; i < count; i++) {
    const o = (start + i) * 4
    const ax = height.coords[o]! / s, az = height.coords[o + 1]! / s
    const bx = height.coords[o + 2]! / s, bz = height.coords[o + 3]! / s
    const plane = height.planes[height.refs[start + i]!]
    if (!plane || plane[1] === 0) continue          // 수직면 위에는 설 수 없다
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx)))
    const x1 = Math.min(CHUNK - 1, Math.ceil(Math.max(ax, bx)) - 1)
    const z0 = Math.max(0, Math.floor(Math.min(az, bz)))
    const z1 = Math.min(CHUNK - 1, Math.ceil(Math.max(az, bz)) - 1)
    for (let tz = z0; tz <= z1; tz++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (hit[tz * CHUNK + tx] === 0) { hit[tz * CHUNK + tx] = 1; n++ }
      }
    }
  }
  return n >= CHUNK * CHUNK ? null : hit
}

/** 그 칸 밑에 청크 메시가 있는가 */
function meshAt(cover: FloorCover, land: number, lx: number, lz: number): boolean {
  const at = land * COVER_BYTES * 8 + lz * CHUNK + lx
  const byte = cover.bits[at >> 3]
  return byte !== undefined && (byte & (1 << (at & 7))) !== 0
}

/**
 * 이 행렬에서 **발밑에 그려진 것이 있는 칸**을 찍는다.
 *
 * 청크 메시는 칸 단위로 찍힌 비트를 그대로 쓰고, 소품은 XZ 상자로만 덮는다 —
 * 상자는 넓게 잡는 쪽이라 **덜 막는다**(안전한 방향이다). 소품 2,967개가 전부
 * 회전 0 · 배율 1이라 평행이동만 하면 된다 (실측).
 */
export function drawnFloor(meta: MatrixMeta, cover: FloorCover, height?: HeightData): Uint8Array {
  const W = meta.tileWidth, H = meta.tileHeight
  const drawn = new Uint8Array(W * H)
  for (const c of meta.chunks) {
    const ox = c.mx * CHUNK, oz = c.my * CHUNK
    const plates = height ? plateFloor(height, c.land) : null
    for (let lz = 0; lz < CHUNK; lz++) {
      const tz = oz + lz
      if (tz >= H) break
      for (let lx = 0; lx < CHUNK; lx++) {
        const tx = ox + lx
        if (tx >= W) continue
        if (meshAt(cover, c.land, lx, lz) || plates?.[lz * CHUNK + lx] === 1) drawn[tz * W + tx] = 1
      }
    }
  }
  const s = cover.posScale
  for (const list of Object.values(meta.buildings)) {
    for (const b of list) {
      const box = cover.boxes[b.model]
      if (!box) continue
      const x0 = Math.max(0, Math.floor(box[0] / s + b.x))
      const x1 = Math.min(W - 1, Math.ceil(box[2] / s + b.x) - 1)
      const z0 = Math.max(0, Math.floor(box[1] / s + b.z))
      const z1 = Math.min(H - 1, Math.ceil(box[3] / s + b.z) - 1)
      for (let tz = z0; tz <= z1; tz++) {
        for (let tx = x0; tx <= x1; tx++) drawn[tz * W + tx] = 1
      }
    }
  }
  return drawn
}

/**
 * 그린 것이 없는 걸을 칸을 막는다. **`tiles`를 제자리에서 고친다.**
 *
 * ⚠️ **막아서 길이 끊기면 안 된다.** 그려진 데끼리 안 그려진 칸을 건너 이어져
 * 있는 자리가 있다 — 배틀프런티어(행렬 256)의 동쪽 날개가 x=63의 **두 칸**을
 * 지나야 닿고, 그걸 막았더니 배틀팩토리가 통째로 끊겼다(실측). 그래서 남길
 * 것을 고르고 끝내지 않고, **원래 이어져 있던 것은 도로 이어 준다** — 안 그려진
 * 칸을 지나는 최단 경로를 짧은 것부터 골라 잇는다(크러스컬).
 *
 * @param eventTiles 그 행렬 위 워프·사람·간판·트리거 칸. **그린 바닥에 닿아 있으면**
 *   바닥이 없어도 남긴다 (머리말의 「행사 칸」)
 * @returns 막은 칸 수
 */
export function sealFloor(
  meta: MatrixMeta, tiles: Uint16Array, cover: FloorCover,
  eventTiles: readonly (readonly [number, number])[],
  height?: HeightData,
): number {
  const W = meta.tileWidth, H = meta.tileHeight
  const open = (i: number): boolean => (tiles[i]! & IMPASSABLE) === 0

  // ① 남길 것 — 그려진 칸과, **거기 닿아 있는** 행사 칸
  const drawn = drawnFloor(meta, cover, height)
  const keep = Uint8Array.from(drawn)
  const touchesFloor = (ex: number, ez: number): boolean =>
    ([[ex, ez], [ex - 1, ez], [ex + 1, ez], [ex, ez - 1], [ex, ez + 1]] as const)
      .some(([ax, az]) => ax >= 0 && az >= 0 && ax < W && az < H && drawn[az * W + ax] === 1)
  for (const [ex, ez] of eventTiles) {
    if (ex < 0 || ez < 0 || ex >= W || ez >= H) continue
    const i = ez * W + ex
    if (open(i) && touchesFloor(ex, ez)) keep[i] = 1
  }

  // ② 남길 칸에서 한꺼번에 번진다. 칸마다 「어느 덩어리에서 왔나 · 몇 걸음 ·
  //    누구를 거쳐」를 적어 둔다
  const root = new Int32Array(W * H).fill(-1)
  const dist = new Int32Array(W * H).fill(-1)
  const from = new Int32Array(W * H).fill(-1)
  const queue: number[] = []
  {
    // 남길 칸의 덩어리 번호를 먼저 매긴다 (4방향)
    const seen = new Uint8Array(W * H)
    for (let i = 0; i < keep.length; i++) {
      if (keep[i] !== 1 || !open(i) || seen[i] === 1) continue
      const bag = [i]
      seen[i] = 1
      root[i] = i
      dist[i] = 0
      for (let k = 0; k < bag.length; k++) {
        const at = bag[k]!
        queue.push(at)
        const tx = at % W, tz = (at - tx) / W
        for (const [ax, az] of [[tx - 1, tz], [tx + 1, tz], [tx, tz - 1], [tx, tz + 1]] as const) {
          if (ax < 0 || az < 0 || ax >= W || az >= H) continue
          const j = az * W + ax
          if (seen[j] === 1 || keep[j] !== 1 || !open(j)) continue
          seen[j] = 1
          root[j] = i
          dist[j] = 0
          bag.push(j)
        }
      }
    }
  }
  for (let k = 0; k < queue.length; k++) {
    const i = queue[k]!
    const tx = i % W, tz = (i - tx) / W
    for (const [ax, az] of [[tx - 1, tz], [tx + 1, tz], [tx, tz - 1], [tx, tz + 1]] as const) {
      if (ax < 0 || az < 0 || ax >= W || az >= H) continue
      const j = az * W + ax
      if (root[j]! >= 0 || !open(j)) continue
      root[j] = root[i]!
      dist[j] = dist[i]! + 1
      from[j] = i
      queue.push(j)
    }
  }

  // ③ 서로 다른 덩어리가 맞닿는 자리를 **짧은 것부터** 이어 붙인다 (`MAX_BRIDGE`까지)
  const link: { cost: number, a: number, b: number }[] = []
  for (let i = 0; i < root.length; i++) {
    if (root[i]! < 0) continue
    const tx = i % W, tz = (i - tx) / W
    for (const [ax, az] of [[tx + 1, tz], [tx, tz + 1]] as const) {
      if (ax >= W || az >= H) continue
      const j = az * W + ax
      if (root[j]! < 0 || root[j] === root[i]) continue
      link.push({ cost: dist[i]! + dist[j]! + 1, a: i, b: j })
    }
  }
  // 값이 같으면 칸 번호로 가른다 — 두 번 돌려도 같은 답이 나와야 한다
  link.sort((x, y) => x.cost - y.cost || x.a - y.a || x.b - y.b)
  const parent = new Map<number, number>()
  const find = (x: number): number => {
    let r = x
    while (parent.get(r) !== undefined && parent.get(r) !== r) r = parent.get(r)!
    return r
  }
  const paint = (at: number): void => { for (let i = at; i >= 0 && keep[i] !== 1; i = from[i]!) keep[i] = 1 }
  for (const e of link) {
    if (e.cost > MAX_BRIDGE) break
    const ra = find(root[e.a]!), rb = find(root[e.b]!)
    if (ra === rb) continue
    parent.set(ra, rb)
    parent.set(rb, rb)
    paint(e.a)
    paint(e.b)
  }

  let sealed = 0
  for (let i = 0; i < tiles.length; i++) {
    if (!open(i) || keep[i] === 1) continue
    tiles[i]! |= IMPASSABLE
    sealed++
  }
  return sealed
}
