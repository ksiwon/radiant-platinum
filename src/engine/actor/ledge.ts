// 턱 뛰어내리기 (DATA.md §2.2)
//
// 원작의 갈색 턱은 **한쪽으로만 지나갈 수 있는 문**이다. 위에서 아래로는 뛰어
// 내려가지고 아래에서 위로는 못 올라간다. 지름길이자 길 안내다.
//
// **어느 값이 턱인지도, 어느 쪽으로 뛰는지도 잰 값이다.** 오버월드 전역에서
// 통행 불가 타일을 모양별로 갈랐더니 셋이 남았다:
//
//   0x3b  305칸  가로줄만 (가로이음 243 · 세로이음 0)  남북 양쪽이 통행 가능 300칸
//   0x39   21칸  세로줄만                              동서 양쪽이 통행 가능  21칸
//   0x38   15칸  세로줄만                              동서 양쪽이 통행 가능  15칸
//
// 셋 다 `allpeak` 그림을 쓴다 — 사진 속 갈색 턱이 그것이다. 양쪽이 다 걸을 수
// 있는데 자기만 막혀 있는 것은 턱 말고 없다.
//
// 방향은 **UV가 말해 준다.** 판에 그림이 얹힌 방향을 재면:
//
//   0x3b   u→+X   v→+Z      0x39   u→+Z   v→−X      0x38   u→−Z   v→+X
//
// 0x3b가 남쪽으로 뛰는 턱인 것은 화면으로 확인했다. 그러면 **v축이 뛰는 쪽**이고,
// 같은 규칙으로 0x39는 서쪽, 0x38은 동쪽이다. 두 세로 턱이 서로 정확히 거울이라
// 동·서 한 쌍이라는 것도 맞아떨어진다.
import { Behavior } from '../map/zone'

/** 턱 값 → 뛰는 방향(타일). 나머지 값은 턱이 아니다 */
const JUMP: Readonly<Record<number, readonly [number, number]>> = {
  [Behavior.LEDGE_SOUTH]: [0, 1],
  [Behavior.LEDGE_WEST]: [-1, 0],
  [Behavior.LEDGE_EAST]: [1, 0],
}

/** 뛰어넘는 데 걸리는 시간(초). 원작은 두 칸을 16프레임에 넘는다 */
export const HOP_TIME = 0.4
/** 뛰는 높이(타일) */
export const HOP_RISE = 0.55

export function ledgeJump(behavior: number): readonly [number, number] | null {
  return JUMP[behavior] ?? null
}

/** 턱 판정에 필요한 것의 전부 */
export interface LedgeGrid {
  behavior(tx: number, tz: number): number
  isBlocked(tx: number, tz: number): boolean
}

/**
 * 지금 자리에서 이 방향으로 가면 턱을 넘는가. 넘으면 **착지할 칸 한가운데**를,
 * 아니면 null을 돌려준다.
 *
 * 판정은 칸 단위다 — 턱은 원작에서도 칸 단위 사건이고, 연속 좌표로 보면
 * 턱에 스치듯 닿을 때마다 뛰어 버린다.
 */
export function ledgeHop(
  grid: LedgeGrid, x: number, z: number, vx: number, vz: number,
): { x: number; z: number } | null {
  // 미는 쪽이 뚜렷해야 한다. 대각선으로 밀 때 어느 쪽으로 뛸지는 원작에 없다
  const dx = Math.abs(vx) > Math.abs(vz) ? Math.sign(vx) : 0
  const dz = dx === 0 ? Math.sign(vz) : 0
  if (dx === 0 && dz === 0) return null

  const tx = Math.floor(x), tz = Math.floor(z)
  const jump = ledgeJump(grid.behavior(tx + dx, tz + dz))
  // 턱은 **뛰는 쪽에서만** 넘을 수 있다. 반대쪽에서 오면 그냥 벽이다
  if (!jump || jump[0] !== dx || jump[1] !== dz) return null

  // 착지는 턱 너머 한 칸이다. 거기가 막혔으면 뛰지 않는다 — 벽에 처박힌다
  const landX = tx + dx * 2, landZ = tz + dz * 2
  if (grid.isBlocked(landX, landZ)) return null
  return { x: landX + 0.5, z: landZ + 0.5 }
}
