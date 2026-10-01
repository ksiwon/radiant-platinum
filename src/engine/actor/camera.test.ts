// 실내 3인칭이 **어디를 겨누는가** (PARITY §6.2 · REPAIR §5)
//
// ⚠️ **여기 있던 줄이 CODEMAP §3에 「필드 카메라 거리·화각 — 시험이 없다」로
// 적혀 있었다.** 자리를 정하는 일이 `update` 안에 통째로 들어 있어서 세계를
// 안 만들면 못 쟀기 때문이다. `aimPitch`·`roomAt`은 순수 함수라 잴 수 있다.
//
// 실측이 왜 이 둘을 낳았는지는 `camera.ts`의 `aimPitch` 머리말에 있다 —
// 건물에 들어서면 주인공이 늘 앞벽에 붙어 서므로 카메라가 갈 5.5칸 뒤는
// 그려진 바닥 밖이다.
import { afterEach, describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import {
  aimPitch, cameraDolly, cameraSystem, clampToRoom, firstPersonView, roomAt, scriptCameraActive, type RoomBox,
} from './camera'
import { worldState } from '../../state/worldState'
import { cutInFrame } from '../battle/encounterCutIn'

/** 세로줄 끝을 상자와 같게 채운 상자. 줄마다 다른 자리는 따로 만든다 */
const box = (minX: number, minZ: number, maxX: number, maxZ: number): RoomBox => ({
  minX, minZ, maxX, maxZ,
  southEdge: new Map(Array.from({ length: maxX - minX }, (_, i) => [minX + i, maxZ])),
})

/** 포켓몬센터의 실측 상자 (`node .audit/probe/roomFit.mjs`) */
const CENTER: RoomBox = box(1, 3, 16, 14)

/** 실내 렌즈. 주인공을 곧장 겨누면 이 각이다 */
const STRAIGHT = 30.2

describe('바닥 끝을 프레임 밖으로 민다', () => {
  it('바닥 위에 서 있으면 주인공을 곧장 겨눈다', () => {
    expect(aimPitch(3.2, 5.5, 0)).toBeCloseTo(STRAIGHT, 1)
    expect(aimPitch(3.2, 5.5, -4)).toBeCloseTo(STRAIGHT, 1)
  })

  // ⚠️ **이것이 정수리만 보이던 자리다.** 주인공이 방의 남쪽 끝(z 12.5)에 서면
  // 카메라가 z 18로 가는데 바닥은 z 14에서 끝난다 — 4칸을 넘어선다
  it('⚠️ 바닥 밖으로 4칸 나가면 겨눔이 눕는다', () => {
    const got = aimPitch(3.2, 5.5, 4)
    // 프레임 아랫변이 바닥 끝에 떨어지는 각: atan(3.2/4) − 27.5 = 11.16도
    expect(got).toBeCloseTo(13.01, 1)
    // 대사창에 안 잘리는 한계(17.19도)에 걸린다 — 그보다 더는 안 눕힌다
    expect(got).toBeCloseTo(STRAIGHT - 17.19, 1)
  })

  it('조금만 나가면 그만큼만 눕는다', () => {
    const got = aimPitch(3.2, 5.5, 3)
    expect(got).toBeCloseTo((Math.atan2(3.2, 3) * 180) / Math.PI - 27.5, 1)
    expect(got).toBeGreaterThan(STRAIGHT - 17.19)
    expect(got).toBeLessThan(STRAIGHT)
  })

  // 실내 렌즈에서는 **2.04칸까지는 안 민다** — 그만큼 나가도 프레임 아랫변이
  // 아직 바닥 위에 떨어진다. 주인공이 앞벽에서 3.5칸만 떨어져도 손 안 댄다
  it('겨눔은 주인공을 넘어 위로는 안 간다', () => {
    expect(aimPitch(3.2, 5.5, 0.2)).toBeCloseTo(STRAIGHT, 1)
    expect(aimPitch(3.2, 5.5, 2)).toBeCloseTo(STRAIGHT, 1)
  })

  // ⚠️ 0에 가까우면 겨눔점이 무한히 멀어져 화면이 홱 돈다
  it('⚠️ 낮은 렌즈에서도 6도 아래로는 안 눕는다', () => {
    expect(aimPitch(1, 5.5, 40)).toBe(6)
  })
})

describe('선 자리가 든 방', () => {
  const ROOMS: readonly RoomBox[] = [
    CENTER,
    box(20, 20, 24, 24),
  ]

  it('안에 들면 그 방이다', () => {
    expect(roomAt(ROOMS, 8, 8)).toBe(CENTER)
  })

  it('두 칸 안이면 제일 가까운 방을 집는다', () => {
    expect(roomAt(ROOMS, 25, 22)).toBe(ROOMS[1])
  })

  it('두 칸을 넘게 떨어지면 아무 방도 아니다 — 안 민다', () => {
    expect(roomAt(ROOMS, 50, 50)).toBeNull()
  })

  // ⚠️ 맵 89에서 방 밖 바닥이 방을 빙 둘러 있어 그 테두리 상자가 방을 품는다
  it('⚠️ 드는 방이 여럿이면 제일 작은 것이다', () => {
    const big = box(0, 0, 25, 19)
    const small = box(5, 5, 15, 15)
    expect(roomAt([big, small], 8, 8)).toBe(small)
    expect(roomAt([small, big], 8, 8)).toBe(small)
  })
})

// 굴에서는 겨눔을 미는 대신 **자리를 물린다** — 통로 토막이라 바닥 끝을 못 믿는다
describe('굴에서는 자리를 물린다', () => {
  const at = (x: number, z: number): Vector3 => new Vector3(x, 4, z)

  it('상자가 없으면 그대로다 — 실외는 물릴 것이 없다', () => {
    const goal = at(100, 200)
    expect(clampToRoom(goal, null, 1)).toBe(goal)
    expect([goal.x, goal.z]).toEqual([100, 200])
  })

  it('안에 있으면 안 움직인다', () => {
    const goal = clampToRoom(at(8, 8), CENTER, 1)
    expect([goal.x, goal.z]).toEqual([8, 8])
  })

  it('밖으로 나가면 여유만큼 안으로 들어온다', () => {
    const goal = clampToRoom(at(8, 20.5), CENTER, 1)
    expect(goal.z).toBe(13)
    expect(goal.x).toBe(8)
  })

  it('반대쪽도 같다', () => {
    expect(clampToRoom(at(8, -5), CENTER, 1).z).toBe(4)
    expect(clampToRoom(at(-5, 8), CENTER, 1).x).toBe(2)
    expect(clampToRoom(at(99, 8), CENTER, 1).x).toBe(15)
  })

  // ⚠️ 안 막으면 양쪽에서 물려 카메라가 상자 **밖으로** 튕겨 나간다
  it('⚠️ 조각이 여유의 두 배보다 좁으면 가운데에 놓는다', () => {
    const goal = clampToRoom(at(99, -99), box(0, 0, 3, 3), 2)
    expect([goal.x, goal.z]).toEqual([1.5, 1.5])
  })

  it('높이는 안 건드린다 — 물리는 것은 평면 자리뿐이다', () => {
    expect(clampToRoom(at(99, 99), CENTER, 1).y).toBe(4)
  })
})

// ⚠️ **설정의 시점과 지금 렌즈는 다르다** (`firstPersonView`). 스크립트가 카메라를
// 쥐는 동안은 1인칭이어도 3인칭으로 본다 — 1인칭 눈으로는 북쪽에서 벌어지는 사건이
// 화면 밖이고, 빙글 워프의 당기기도 아무 일이 없었다
describe('스크립트 카메라 동안은 3인칭 렌즈다', () => {
  afterEach(() => {
    worldState.camera.mode = 'third'
    cameraSystem.free = null
    cameraDolly.warp = 1
    cutInFrame.now = null
    cameraSystem.mountLift = 0
  })

  it('1인칭 설정이면 1인칭 렌즈다', () => {
    worldState.camera.mode = 'first'
    expect(scriptCameraActive()).toBe(false)
    expect(firstPersonView()).toBe(true)
  })

  it('시점 이동(`AddFreeCamera`) 동안은 3인칭이다 — 설정은 그대로다', () => {
    worldState.camera.mode = 'first'
    cameraSystem.free = { x: 3, z: 4 }
    expect(scriptCameraActive()).toBe(true)
    expect(firstPersonView()).toBe(false)
    expect(worldState.camera.mode).toBe('first')
  })

  it('빙글 워프가 당기는 동안도 · 조우 컷인 동안도 같다', () => {
    worldState.camera.mode = 'first'
    cameraDolly.warp = 0.6
    expect(firstPersonView()).toBe(false)
    cameraDolly.warp = 1
    cutInFrame.now = {} as NonNullable<typeof cutInFrame.now>
    expect(firstPersonView()).toBe(false)
  })

  it('3인칭 설정은 늘 3인칭이다', () => {
    expect(firstPersonView()).toBe(false)
  })
})

/** 1인칭 눈이 있어야 할 자리 — 주인공 발밑에서 눈높이 1.38 · 앞으로 0.12 */
const eyeAt = (lift = 0): Vector3 => {
  const p = worldState.player.position
  const yaw = worldState.camera.yaw
  return new Vector3(p.x + Math.sin(yaw) * 0.12, p.y + 1.38 + lift, p.z - Math.cos(yaw) * 0.12)
}

describe('렌즈가 갈리는 프레임에는 미끄러지지 않고 앉는다', () => {
  afterEach(() => {
    worldState.camera.mode = 'third'
    cameraSystem.free = null
    cameraSystem.mountLift = 0
  })

  // 보이는 것(천장 · 남쪽 벽 · 몸)은 같은 프레임에 뒤집힌다. 자리가 감쇠로 따라가면
  // 그 0.2초 동안 벽 뒷면이나 제 머리 속을 본다
  it('3인칭에서 V를 누른 프레임에 바로 눈자리다', () => {
    worldState.player.position.set(10, 0, 10)
    worldState.camera.yaw = 0
    worldState.camera.mode = 'third'
    for (let i = 0; i < 120; i++) cameraSystem.update(1 / 60)
    expect(worldState.camera.position.distanceTo(eyeAt())).toBeGreaterThan(5)
    worldState.camera.mode = 'first'
    cameraSystem.update(1 / 60)
    expect(worldState.camera.position.distanceTo(eyeAt())).toBeLessThan(1e-9)
    expect(cameraSystem.drift).toBeLessThan(1e-9)
  })

  it('1인칭에서 나오는 프레임에도 바로 3인칭 자리다 — 머리 속을 안 본다', () => {
    worldState.player.position.set(10, 0, 10)
    worldState.camera.mode = 'first'
    for (let i = 0; i < 60; i++) cameraSystem.update(1 / 60)
    worldState.camera.mode = 'third'
    cameraSystem.update(1 / 60)
    expect(cameraSystem.drift).toBeLessThan(1e-9)
    expect(worldState.camera.position.y).toBeGreaterThan(3)
  })

  it('컷신이 렌즈를 잠시 돌렸다 놓을 때도 앉는다', () => {
    worldState.player.position.set(10, 0, 10)
    worldState.camera.mode = 'first'
    for (let i = 0; i < 60; i++) cameraSystem.update(1 / 60)
    cameraSystem.free = { x: 10, z: 4 }
    cameraSystem.update(1 / 60)
    expect(cameraSystem.drift).toBeLessThan(1e-9)
    cameraSystem.free = null
    cameraSystem.update(1 / 60)
    expect(worldState.camera.position.distanceTo(eyeAt())).toBeLessThan(1e-9)
  })

  it('렌즈가 그대로면 예전처럼 감쇠로 따라간다', () => {
    worldState.player.position.set(10, 0, 10)
    worldState.camera.mode = 'third'
    for (let i = 0; i < 120; i++) cameraSystem.update(1 / 60)
    worldState.player.position.set(12, 0, 10)
    cameraSystem.update(1 / 60)
    expect(cameraSystem.drift).toBeGreaterThan(1)
  })
})

// 파도타기는 몸을 포켓몬 등판 위로 0.89칸 올린다 (`SURF_MOUNT.stand`) — 눈이
// 발 높이 기준에 남으면 등판을 기어가는 높이에서 물을 본다
describe('타고 있으면 1인칭 눈도 그만큼 든다', () => {
  afterEach(() => {
    worldState.camera.mode = 'third'
    cameraSystem.mountLift = 0
  })

  it('몸이 든 만큼 눈이 오른다', () => {
    worldState.player.position.set(10, 0, 10)
    worldState.camera.mode = 'first'
    cameraSystem.update(1 / 60)
    cameraSystem.snap()
    cameraSystem.mountLift = 0.89
    cameraSystem.update(1 / 60)
    expect(worldState.camera.position.distanceTo(eyeAt(0.89))).toBeLessThan(1e-9)
  })
})
