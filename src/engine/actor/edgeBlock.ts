// 한쪽으로만 막힌 칸 (`TileBehavior_BlocksMovement*` · `sub_02064004`)
//
// 칸 전체가 막힌 것이 아니라 **가장자리 하나둘에 벽이 선** 칸이다. 원작은 한 걸음마다
// 두 칸을 본다 — 지금 칸이 그 방향으로 **나가는 것**을 막는가, 들어갈 칸이 그 반대쪽에서
// **들어오는 것**을 막는가. 둘 중 하나면 못 간다:
//
// ```c
// if (Unk_020EE76C[dir](v1) == TRUE || Unk_020EE77C[dir](v2) == TRUE) return TRUE;
// ```
//
// ⚠️ **없던 규칙이다.** 거동값 열 개(0x30~0x37 · 0x49 · 0x4A)가 세계에 55칸 깔려 있고
// 무쇠 체육관(10) · 선단 체육관(13) · 축복 방송국 3F · 글로벌 트레이드 1F·2F에 있다.
// 선단 체육관의 0x49·0x4A 열세 칸은 **동서로만 · 남북으로만 드나드는** 칸이라 얼음
// 미끄럼 퍼즐의 길이 이것으로 갈린다(JOURNEY_BADGE67 §4.2). 없으면 원작이 막는 칸을
// 그냥 지나갔다.

/** 방향 — 원작 차례 (북 0 · 남 1 · 서 2 · 동 3) */
type Dir = 0 | 1 | 2 | 3

/** `TileBehavior_BlocksMovementNorthward` 따위 넷 — `map_tile_behavior.c` 그대로 */
const BLOCKS_OUT: readonly ReadonlySet<number>[] = [
  new Set([0x32, 0x34, 0x35, 0x49]), // 북쪽으로 못 나간다 — NORTHWARD · N&E · N&W · N&S
  new Set([0x33, 0x36, 0x37, 0x49]), // 남쪽으로 — SOUTHWARD · S&E · S&W · N&S
  new Set([0x31, 0x35, 0x37, 0x4a]), // 서쪽으로 — WESTWARD · N&W · S&W · E&W
  new Set([0x30, 0x34, 0x36, 0x4a]), // 동쪽으로 — EASTWARD · N&E · S&E · E&W
]

/** 들어갈 칸은 **반대 방향** 표로 본다 (`Unk_020EE77C`) */
const OPPOSITE: readonly Dir[] = [1, 0, 3, 2]

/** 한 칸 걸음 (dx, dz) → 방향. 한 축만 ±1이어야 한다 */
function dirOf(dx: number, dz: number): Dir | null {
  if (dz < 0 && dx === 0) return 0
  if (dz > 0 && dx === 0) return 1
  if (dx < 0 && dz === 0) return 2
  if (dx > 0 && dz === 0) return 3
  return null
}

/**
 * `from` 칸(거동값)에서 `to` 칸(거동값)으로 (dx, dz) 한 칸 가는 걸음을 가장자리가 막는가.
 *
 * @param fromBehavior 지금 칸의 거동값
 * @param toBehavior 들어갈 칸의 거동값
 */
export function edgeBlocks(fromBehavior: number, toBehavior: number, dx: number, dz: number): boolean {
  const d = dirOf(dx, dz)
  if (d === null) return false
  return BLOCKS_OUT[d]!.has(fromBehavior) || BLOCKS_OUT[OPPOSITE[d]!]!.has(toBehavior)
}

/**
 * 몸이 (x0, z0) → (x1, z1)로 옮길 때 **어느 귀퉁이든** 막힌 가장자리를 넘는가.
 *
 * 우리 주인공은 칸에 잠기지 않고 반지름 있는 몸으로 움직여서, 한 걸음이 여러 칸 경계를
 * 조금씩 넘는다. 그래서 귀퉁이 넷마다 「넘기 전 칸 → 넘은 뒤 칸」을 보고, 칸이 바뀐
 * 축마다 원작 판정을 돌린다. 한 번에 한 축만 움직이므로(`actor/player`의 축별 시도)
 * 칸은 많아야 한 축으로 한 칸 바뀐다
 *
 * @param behavior 칸의 거동값 (`MapGrid.behavior`)
 * @param radius 몸 반지름(타일)
 */
export function edgeCrossBlocked(
  behavior: (tx: number, tz: number) => number,
  x0: number, z0: number, x1: number, z1: number, radius: number,
): boolean {
  for (const [ox, oz] of [[-radius, -radius], [radius, -radius], [-radius, radius], [radius, radius]] as const) {
    const fx = Math.floor(x0 + ox), fz = Math.floor(z0 + oz)
    const tx = Math.floor(x1 + ox), tz = Math.floor(z1 + oz)
    if (fx === tx && fz === tz) continue
    if (edgeBlocks(behavior(fx, fz), behavior(tx, tz), Math.sign(tx - fx), Math.sign(tz - fz))) return true
  }
  return false
}
