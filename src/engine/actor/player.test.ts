// 1인칭 시선이 **몸이 보는 쪽에서 출발하는가** (`actor/player`의 `seatLook`)
//
// ⚠️ **들어가자마자 북쪽을 봤다.** 1인칭은 고정 스텝마다 시선(yaw)으로 몸을 덮는데
// (`facingFromYaw`), yaw는 마우스만 움직이고 시작값이 0(북쪽)이다. 그래서 남쪽을
// 보던 사람이 V를 누르면 화면도 몸도 북쪽으로 홱 돌았고, 워프가 정해 준 도착
// 방향(`ScrCmd_Warp`)도 다음 스텝에 지워졌다 — 집에서 나오자마자 방금 나온 문을
// 보고 W를 누르면 그 문으로 되돌아 들어갔다.
import { afterEach, describe, expect, it } from 'vitest'
import { playerSystem } from './player'
import { cameraSystem } from './camera'
import { facingFromYaw } from '../input/mouse'
import { activeZone } from '../map/zone'
import { worldState } from '../../state/worldState'

/** 원작 방향 번호로 접는다 — 남 0 · 동 1 · 북 2 · 서 3 (`turnInPlace.test`와 같다) */
const quarter = (facing: number): number =>
  ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4

/** 빈 판에 세워 두고 스텝을 돌린다. 아무 키도 안 누른다 */
function stand(steps = 1): void {
  for (let i = 0; i < steps; i++) playerSystem.fixedUpdate(1 / 60)
}

function reset(mode: 'first' | 'third', facing: number): void {
  activeZone.grid = null
  const p = worldState.player
  p.position.set(0.5, 0, 0.5)
  p.prevPosition.copy(p.position)
  p.velocity.set(0, 0, 0)
  p.facing = facing
  p.hop.active = false
  p.surfing = false
  p.cycling = false
  p.riding = false
  p.flying = false
  worldState.input.move.set(0, 0)
  worldState.camera.mode = mode
  worldState.camera.yaw = 0
  worldState.camera.pitch = 0
  cameraSystem.free = null
}

afterEach(() => {
  worldState.camera.mode = 'third'
  cameraSystem.free = null
  // 1인칭을 떠난 스텝을 한 번 돌려 적어 둔 얼굴을 비운다 — 다음 시험이 새로 들어온다
  stand()
})

describe('1인칭은 몸이 보던 쪽에서 출발한다', () => {
  it('남쪽을 보던 사람이 1인칭에 들어가면 남쪽을 본다 — yaw π', () => {
    reset('third', 0)
    stand()
    worldState.camera.mode = 'first'
    worldState.camera.pitch = 0.4
    stand()
    expect(worldState.camera.yaw).toBeCloseTo(Math.PI, 10)
    // 고개도 바로 든다
    expect(worldState.camera.pitch).toBe(0)
    // 몸은 안 돈다 — 얼굴이 그대로 남쪽이다
    expect(worldState.player.facing).toBe(0)
  })

  it('동쪽을 보던 사람은 동쪽이다', () => {
    reset('third', Math.PI / 2)
    stand()
    worldState.camera.mode = 'first'
    stand(5)
    expect(quarter(facingFromYaw(worldState.camera.yaw))).toBe(1)
    expect(quarter(worldState.player.facing)).toBe(1)
  })

  it('1인칭 동안은 시선이 몸을 돌린다 — 마우스로 돌린 쪽이 앞이다', () => {
    reset('first', 0)
    stand()
    // 마우스가 서쪽으로 돌렸다 (`input/mouse`가 yaw만 바꾼다)
    worldState.camera.yaw = Math.PI * 1.5
    stand()
    expect(quarter(worldState.player.facing)).toBe(3)
    // 그 뒤로는 다시 심지 않는다 — 시선이 그대로다
    stand(5)
    expect(worldState.camera.yaw).toBe(Math.PI * 1.5)
  })

  // ⚠️ 워프 도착 방향 · 문을 나서는 얼굴 · 스크립트의 돌려세우기 · 불러오기가 이 길이다
  it('⚠️ 1인칭 중에 바깥에서 얼굴을 바꾸면 시선이 거기서 다시 심긴다', () => {
    reset('first', Math.PI)
    stand(3)
    expect(worldState.camera.yaw).toBeCloseTo(0, 10)
    worldState.camera.pitch = -0.3
    // `MapStreamer`의 `worldState.player.facing = facingOfDir(target.facing)` 자리
    worldState.player.facing = 0
    stand()
    expect(worldState.camera.yaw).toBeCloseTo(Math.PI, 10)
    expect(worldState.camera.pitch).toBe(0)
    expect(worldState.player.facing).toBe(0)
  })

  // 스크립트가 카메라를 쥔 동안은 3인칭 렌즈다 (`camera`의 `firstPersonView`) —
  // 마우스가 돌릴 시선이 화면에 없으니 몸이 마우스를 따라 돌면 안 된다
  it('스크립트 카메라 동안은 마우스가 몸을 못 돌린다', () => {
    reset('first', 0)
    stand()
    cameraSystem.free = { x: 10, z: 10 }
    worldState.camera.yaw = Math.PI / 2
    stand()
    expect(worldState.player.facing).toBe(0)
    expect(worldState.camera.yaw).toBeCloseTo(Math.PI, 10)
    // 그동안 스크립트가 돌려세우면 그 쪽을 따른다
    worldState.player.facing = Math.PI / 2
    stand()
    expect(quarter(worldState.player.facing)).toBe(1)
    // 놓으면 그 얼굴에서 다시 마우스가 쥔다
    cameraSystem.free = null
    stand()
    expect(quarter(facingFromYaw(worldState.camera.yaw))).toBe(1)
  })

  it('3인칭은 yaw를 안 건드린다 — 원작처럼 카메라가 북쪽에 고정이다', () => {
    reset('third', 0)
    worldState.camera.yaw = 1.234
    stand(3)
    expect(worldState.camera.yaw).toBe(1.234)
  })
})
