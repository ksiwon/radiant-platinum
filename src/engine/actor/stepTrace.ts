// 지나온 칸과 지나온 거리 (PARITY §1.1)
//
// 원작은 격자에 잠긴 이동이라 **한 칸 = 한 걸음**이고 대각선이 아예 없다. 우리는
// 연속 이동이고 방향키 둘을 같이 누르면 45도로 간다 (`input/keyboard`가 길이를
// 1로 맞춘다). 그런데 「한 걸음」을 세는 자리가 전부 **밟은 칸이 바뀌었나**로
// 보고 있었다 — 45도로 가면 x와 z가 따로 경계를 넘으므로 같은 거리에 칸 경계를
// √2배 더 자주 넘는다.
//
// 실측(`node .audit/diagonalSteps.mjs`, 같은 자리에서 3초씩):
//
//   옆으로만  칸당 걸음 0.96
//   대각선    칸당 걸음 1.38     → 비율 **1.444** (이론값 √2 = 1.414)
//
// 곧 대각선으로 걸으면 독·친밀도·알 부화·야생 조우가 그만큼 빨라진다.
//
// ⚠️ **대각선 입력을 막는 길은 안 고른다.** 3D 자유 이동이 이 게임이 원작과
// 다른 자리 중 사용자가 제일 먼저 만지는 것이고, 그것을 되돌리면 1인칭·마우스
// 시선·연속 충돌이 다 어긋난다. 고칠 것은 **세는 자**이지 움직임이 아니다.
//
// 그래서 둘로 가른다:
//
//   걸음    칸 변화가 아니라 **지나온 거리**로 센다. 1칸 = 1걸음이고 대각선도
//           직선도 같은 거리면 같은 걸음이다 — 원작의 「한 칸 = 한 걸음」에 가깝다
//   트리거  칸 단위 판정을 그대로 두되, **지나온 칸을 전부 차례로** 묻는다.
//           한 틱에 두 칸을 지났으면 두 번 묻는다

interface Tile { x: number, z: number }

/**
 * 한 틱에 지날 수 있는 칸 수의 위끝.
 *
 * 달릴 때 한 틱에 축마다 0.094칸이라 실제로는 많아야 둘이다. 이걸 넘는 것은
 * 걸은 것이 아니라 **옮겨진 것**이고(워프·승강 발판·깨어진 세계의 뛰는 자리),
 * 그때 사이 칸을 다 밟은 것으로 세면 지나가지도 않은 트리거가 돈다
 */
const MAX_TILES = 8

/** 그 점이 든 칸 */
export const tileOf = (x: number, z: number): Tile => ({ x: Math.floor(x), z: Math.floor(z) })

/**
 * 지난 자리에서 지금 자리까지 **지나온 칸을 차례대로.**
 *
 * 출발한 칸은 안 담는다 — 이미 그 칸에서 할 일은 했다. 대각선으로 모서리를
 * 스치면 사이 칸이 담기고, 그것이 이 함수의 요점이다: 1×1 트리거 114자리가
 * 「그 틱의 칸 하나」만 보던 판정에서 새고 있었다.
 *
 * ⚠️ **한 칸을 두 번 담지 않는다.** 곧은 선분은 같은 칸에 두 번 들어갈 수 없지만,
 * 뜨는 소수 때문에 경계에 딱 걸리는 판이 생긴다 — 조우를 두 번 굴리면 원작과
 * 어긋나므로 여기서 막는다.
 *
 * ⚠️ **옮겨진 자리는 지나온 것이 아니다.** `MAX_TILES`를 넘으면 사이를 버리고
 * **닿은 칸 하나**만 낸다. 워프 다음 틱은 부르는 쪽이 `reset`으로 빈 줄을 낸다
 */
export function tilesCrossed(
  fromX: number, fromZ: number, toX: number, toZ: number,
): Tile[] {
  let x = Math.floor(fromX), z = Math.floor(fromZ)
  const ex = Math.floor(toX), ez = Math.floor(toZ)
  if (x === ex && z === ez) return []

  const dx = toX - fromX, dz = toZ - fromZ
  const stepX = Math.sign(dx), stepZ = Math.sign(dz)
  // 다음 경계까지 걸리는 몫(0~1)과 한 칸을 지나는 데 걸리는 몫
  const tDeltaX = stepX === 0 ? Infinity : 1 / Math.abs(dx)
  const tDeltaZ = stepZ === 0 ? Infinity : 1 / Math.abs(dz)
  let tMaxX = stepX === 0 ? Infinity
    : stepX > 0 ? (x + 1 - fromX) / dx : (x - fromX) / dx
  let tMaxZ = stepZ === 0 ? Infinity
    : stepZ > 0 ? (z + 1 - fromZ) / dz : (z - fromZ) / dz

  const out: Tile[] = []
  const seen = new Set<string>()
  while (x !== ex || z !== ez) {
    if (out.length >= MAX_TILES) return [{ x: ex, z: ez }]
    // ⚠️ **같으면 x를 먼저 넘는다.** 정확히 모서리를 지나는 판에서 어느 칸을
    // 거칠지 정해야 하는데, 어느 쪽이든 사이 칸 하나를 거치는 것이 요점이라
    // 한쪽으로 못 박아 두면 그만이다 — 안 박으면 판마다 다른 칸이 나온다
    if (tMaxX <= tMaxZ) { x += stepX; tMaxX += tDeltaX } else { z += stepZ; tMaxZ += tDeltaZ }
    const key = `${String(x)},${String(z)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ x, z })
  }
  return out
}

/**
 * 지나온 **거리**를 칸 단위로 세어 「몇 걸음인가」를 낸다. 1칸 = 1걸음.
 *
 * 부르는 쪽이 누적 거리를 들고 있다가 **전과 후의 차**로 이번 걸음을 안다 —
 * 그래야 이 함수가 순수하게 남고, 시험이 세계를 안 만들고도 주기를 잴 수 있다
 */
export const stepsFrom = (distance: number): number => Math.floor(distance)

/**
 * 한 자리를 따라다니며 「지나온 칸」과 「난 걸음」을 내는 자.
 *
 * 세는 자리가 셋이라(걸음·조우·트리거) 저마다 자기 것을 든다 — 하나를 나눠
 * 쓰면 먼저 부른 쪽이 다른 쪽의 칸을 먹는다
 */
export class StepTrace {
  private x = Number.NaN
  private z = Number.NaN
  /** 지나온 거리의 누적. 걸음은 이 값의 정수 부분에서 난다 */
  private travelled = 0
  private counted = 0

  /**
   * 지금 자리로 옮긴다. 지나온 칸과 이번에 난 걸음 수를 준다.
   *
   * 첫 부름과 `reset` 다음 부름은 **빈 줄에 걸음 0**이다 — 맵에 막 들어선 칸은
   * 지나온 것이 아니다 (원작도 이동이 끝난 자리에서만 센다)
   */
  advance(x: number, z: number): { tiles: readonly Tile[], steps: number } {
    if (Number.isNaN(this.x)) { this.reset(x, z); return { tiles: [], steps: 0 } }
    const tiles = tilesCrossed(this.x, this.z, x, z)
    const moved = Math.hypot(x - this.x, z - this.z)
    this.x = x
    this.z = z
    // ⚠️ **옮겨진 거리는 걸은 거리가 아니다.** 워프·승강 발판이 한 틱에 수십
    // 칸을 옮기는데 그것을 걸음으로 세면 그 자리에서 알이 깬다. 칸 목록이
    // 잘려 나온 것과 같은 잣대로 자른다
    if (tiles.length === 1 && moved > MAX_TILES) { this.travelled = this.counted; return { tiles, steps: 0 } }
    this.travelled += moved
    const now = stepsFrom(this.travelled)
    const steps = now - this.counted
    this.counted = now
    return { tiles, steps }
  }

  /** 이 자리를 「방금 도착한 곳」으로 친다. 워프·판 갈아타기 다음에 부른다 */
  reset(x: number, z: number): void {
    this.x = x
    this.z = z
    this.travelled = 0
    this.counted = 0
  }
}
