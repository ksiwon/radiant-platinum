// 배틀 카메라 (PLAN §7.4)
//
// 카메라가 한 자리에 서므로 여기서 잴 것은 **그 한 자리가 무대를 제대로
// 담는가**와, 더블에서 짝을 벌리는 두 방향이 그 시선에서 뽑혔는가다.
import { describe, it, expect } from 'vitest'
import { BATTLE_FOV, CAMERA, PAIR_DEPTH, PAIR_DIR, SHOT_REACH, SLOT, type Side, type Vec3 } from './shots'

const SIDES: Side[] = ['p1', 'p2']

/** 카메라에서 그 자리까지 */
function reach(side: Side): number {
  return Math.hypot(
    CAMERA.position[0] - SLOT[side].x,
    CAMERA.position[2] - SLOT[side].z,
  )
}

describe('카메라', () => {
  it('지면 위에 서고 무대 밖으로 안 나간다', () => {
    const [x, y, z] = CAMERA.position
    expect(y).toBeGreaterThan(0.4)
    expect(y).toBeLessThan(8)
    // 지면 원판이 반지름 34다. 그 밖으로 나가면 허공이 보인다
    expect(Math.hypot(x, z)).toBeLessThan(30)
  })

  it('두 자리 사이를 본다 — 한쪽에 붙어 있지 않다', () => {
    // 보는 점은 무대 한가운데다. 양쪽 발판에서 같은 거리에 있어야 한다
    const toP1 = Math.hypot(CAMERA.look[0] - SLOT.p1.x, CAMERA.look[2] - SLOT.p1.z)
    const toP2 = Math.hypot(CAMERA.look[0] - SLOT.p2.x, CAMERA.look[2] - SLOT.p2.z)
    expect(Math.abs(toP1 - toP2)).toBeLessThan(0.01)
    expect(CAMERA.look[1]).toBeGreaterThan(0)
  })

  it('내 쪽이 카메라에 가깝다 — 화면에서 내 것이 크다', () => {
    expect(reach('p1')).toBeLessThan(reach('p2'))
    // 실측 3.9 대 7.7 — 상대가 절반 크기다 (PLAN §7.4)
    expect(reach('p2') / reach('p1')).toBeGreaterThan(1.8)
  })

  it('`SHOT_REACH`가 실제 수평 거리다 — 좁은 무대를 당길 때 이 값을 쓴다', () => {
    const flat = Math.hypot(
      CAMERA.position[0] - CAMERA.look[0],
      CAMERA.position[2] - CAMERA.look[2],
    )
    expect(SHOT_REACH).toBeCloseTo(flat, 6)
    expect(SHOT_REACH).toBeCloseTo(5.68, 2)
  })

  it('무대에 선 둘이 화면 안에 든다', () => {
    // 화각은 **세로**다. 가로는 화면 비만큼 넓다 — 찍는 창이 960×640이라 1.5배
    const half = Math.tan((BATTLE_FOV / 2) * (Math.PI / 180)) * (960 / 640)
    for (const side of SIDES) {
      // 시선 축으로 잰 깊이와, 그 축에서 옆으로 벗어난 거리
      const dx = SLOT[side].x - CAMERA.position[0]
      const dz = SLOT[side].z - CAMERA.position[2]
      const depth = dx * -VIEW.x + dz * -VIEW.z
      const lateral = Math.abs(dx * LAT.x + dz * LAT.z)
      // 실측 — 내 쪽 깊이 3.75·옆 1.05(0.279) · 상대 7.62·1.05(0.137).
      // 가로 한계가 0.402다
      expect(lateral / depth, side).toBeLessThan(half)
    }
  })
})

describe('짝이 벌어지는 방향', () => {
  const unit = (v: Vec3) => Math.hypot(v[0], v[1], v[2])

  it('둘 다 단위 길이고 지면에 눕는다', () => {
    expect(unit(PAIR_DIR)).toBeCloseTo(1, 6)
    expect(unit(PAIR_DEPTH)).toBeCloseTo(1, 6)
    expect(PAIR_DIR[1]).toBe(0)
    expect(PAIR_DEPTH[1]).toBe(0)
  })

  it('서로 직각이다 — 하나는 시선의 좌우, 하나는 깊이다', () => {
    const dot = PAIR_DIR[0] * PAIR_DEPTH[0] + PAIR_DIR[2] * PAIR_DEPTH[2]
    expect(dot).toBeCloseTo(0, 6)
  })

  /**
   * ⚠️ 여기가 이 짝의 요지다. x축으로 벌리면 한 마리는 카메라 쪽으로 오고
   * 한 마리는 물러나서 **크기가 갈린다**. 시선의 좌우로 벌려야 둘이 같은
   * 깊이에 나란히 선다
   */
  it('좌우로 벌리는 편이 x축으로 벌리는 것보다 깊이가 덜 갈린다', () => {
    const spread = 0.45
    for (const side of SIDES) {
      const far = (dir: Vec3, sign: number) => Math.hypot(
        CAMERA.position[0] - (SLOT[side].x + dir[0] * spread * sign),
        CAMERA.position[2] - (SLOT[side].z + dir[2] * spread * sign),
      )
      const swing = (dir: Vec3) => Math.abs(far(dir, 1) - far(dir, -1))
      // 실측 — 내 쪽 0.240 대 0.623, 상대 0.122 대 0.316. 절반 아래다
      expect(swing(PAIR_DIR) / swing([1, 0, 0]), side).toBeLessThan(0.5)
    }
  })
})

/** 시선과 그 오른쪽. 모듈 안의 것과 같은 식으로 여기서 다시 뽑는다 */
const VIEW = (() => {
  const x = CAMERA.position[0] - CAMERA.look[0]
  const z = CAMERA.position[2] - CAMERA.look[2]
  const n = Math.hypot(x, z)
  return { x: x / n, z: z / n }
})()
const LAT = { x: -VIEW.z, z: VIEW.x }
