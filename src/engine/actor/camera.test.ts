// 카메라를 방 안으로 물리는 규칙 (PARITY §6.2 · REPAIR §5)
//
// ⚠️ **여기 있던 줄이 CODEMAP §3에 「필드 카메라 거리·화각 — 시험이 없다」로
// 적혀 있었다.** 자리를 정하는 일이 `update` 안에 통째로 들어 있어서 세계를
// 안 만들면 못 쟀기 때문이다. `clampToRoom`은 순수 함수라 잴 수 있다.
//
// 실측이 왜 이 함수를 낳았는지는 `camera.ts`의 `INDOOR` 머리말에 있다 —
// 3인칭이 여덟 칸 뒤에서 보므로 작은 방에서는 **카메라가 그려진 바닥 밖**에
// 서고, 그러면 화면 아래가 통째로 검어진다.
import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { clampToRoom, roomAt, type RoomBox } from './camera'

/** 포켓몬센터의 실측 상자 (`node .audit/roomBox.mjs`) */
const CENTER: RoomBox = { minX: 1, minZ: 2, maxX: 17, maxZ: 14 }

const at = (x: number, z: number): Vector3 => new Vector3(x, 4, z)

describe('방 안으로 물린다', () => {
  it('상자가 없으면 그대로다 — 실외는 물릴 것이 없다', () => {
    const goal = at(100, 200)
    expect(clampToRoom(goal, null, 1)).toBe(goal)
    expect([goal.x, goal.z]).toEqual([100, 200])
  })

  it('안에 있으면 안 움직인다', () => {
    const goal = clampToRoom(at(8, 8), CENTER, 1)
    expect([goal.x, goal.z]).toEqual([8, 8])
  })

  // ⚠️ **이것이 검은 화면의 원인이었다.** 주인공이 z 12.5에 서면 카메라가
  // 여덟 칸 뒤인 z 20.5로 가는데 바닥은 z 14에서 끝난다
  it('⚠️ 바닥 밖으로 나가면 여유만큼 안으로 들어온다', () => {
    const goal = clampToRoom(at(8, 20.5), CENTER, 1)
    expect(goal.z).toBe(13)
    expect(goal.x).toBe(8)
  })

  it('반대쪽도 같다', () => {
    expect(clampToRoom(at(8, -5), CENTER, 1).z).toBe(3)
    expect(clampToRoom(at(-5, 8), CENTER, 1).x).toBe(2)
    expect(clampToRoom(at(99, 8), CENTER, 1).x).toBe(16)
  })

  it('여유가 0이면 테두리까지 간다', () => {
    expect(clampToRoom(at(8, 20.5), CENTER, 0).z).toBe(14)
  })

  // ⚠️ 안 막으면 양쪽에서 물려 카메라가 상자 **밖으로** 튕겨 나간다
  it('⚠️ 방이 여유의 두 배보다 좁으면 가운데에 놓는다', () => {
    const tight: RoomBox = { minX: 0, minZ: 0, maxX: 3, maxZ: 3 }
    const goal = clampToRoom(at(99, -99), tight, 2)
    expect([goal.x, goal.z]).toEqual([1.5, 1.5])
  })

  it('높이는 안 건드린다 — 물리는 것은 평면 자리뿐이다', () => {
    expect(clampToRoom(at(99, 99), CENTER, 1).y).toBe(4)
  })
})

// **어느 방으로 물릴지 고른다** (REPAIR §13)
//
// 그려진 바닥이 방마다 갈려 오므로(`scene/roomWalls`의 `floorRegions`) 주인공이
// 선 방을 골라야 한다. 상자끼리 **겹친다** — 맵 89는 방 밖 바닥이 방을 빙 둘러
// 있어서 그 테두리 상자가 방을 통째로 품는다.
describe('주인공이 선 방을 고른다', () => {
  /** 맵 89 실측 (`node .audit/roomRegions.mjs`) — 바깥 테두리가 방을 품는다 */
  const OUTSIDE: RoomBox = { minX: -1, minZ: 0, maxX: 24, maxZ: 19 }
  const ROOM: RoomBox = { minX: 7, minZ: 2, maxX: 17, maxZ: 12 }

  it('방이 없으면 안 물린다', () => {
    expect(roomAt([], 8, 5)).toBeNull()
  })

  it('⚠️ 둘 다 품으면 작은 쪽이다 — 먼저 찾은 것을 집으면 조인 것이 헛일이다', () => {
    expect(roomAt([OUTSIDE, ROOM], 8.5, 5.5)).toBe(ROOM)
    expect(roomAt([ROOM, OUTSIDE], 8.5, 5.5)).toBe(ROOM)
  })

  it('어느 방에도 안 들면 두 칸 안의 제일 가까운 방이다', () => {
    expect(roomAt([ROOM], 6, 5)).toBe(ROOM)
  })

  // ⚠️ 강철섬(맵 293)에서 주인공이 x 38.5에 섰는데 x 43~53짜리 조각이 뽑혀
  // 카메라가 x 44로 밀렸다. 멀면 아예 안 물리는 편이 낫다
  it('⚠️ 두 칸보다 멀면 안 물린다', () => {
    expect(roomAt([{ minX: 43, minZ: 0, maxX: 53, maxZ: 32 }], 38.5, 4.5)).toBeNull()
  })
})
