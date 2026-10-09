// 벽·천장으로 **건너뛰는 자리** (PARITY §6.10) — `JumpOnFloatingPlatform`
//
// ⚠️ **한 프레임에 옮기면 화면이 뚝 끊긴다.** 판이 갈리는 순간 중력 축이
// 뒤집혀 카메라의 위쪽이 90도(천장이면 180도) 돌아 버리기 때문이다. 원작은
// `movementAnimSteps`프레임에 걸쳐 밀고 **다 옮긴 뒤에야** 판을 갈아 끼운다
// (`PrepareNewCurrentFloatingPlatform`이 `..._MOVE_PLAYER`의 끝에 있다).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { distortionSchema, type DistortionData } from '../data/schema'
import { withDistortionTables } from '../data/distortionFile'
import { Quaternion, Vector3 } from 'three'
import {
  MAP, PLATFORM_FLOOR, PLATFORM_NONE, distortionBridge, platformBasis,
} from '../engine/world/distortion'
import { surfaceQuaternion, turnQuaternion } from '../engine/actor/distortionSurface'

const FILE = 'public/data/distortion.json'
const real = existsSync(FILE)
const data: DistortionData | null = real
  ? withDistortionTables(distortionSchema.parse(JSON.parse(readFileSync(FILE, 'utf8'))))
  : null

vi.mock('../data/gameData', () => ({
  loadDistortion: () => Promise.resolve(data),
}))

const { world } = await import('../engine/map/world')
const { worldState } = await import('../state/worldState')
const { useSaveStore } = await import('../state/saveStore')
const mod = await import('./distortion')

describe.runIf(real)('판을 건너뛴다', () => {
  beforeEach(async () => {
    await mod.distortionPreload()
    useSaveStore.setState({
      distortion: {
        valid: true, hiddenGroups: 0, platformIndex: 99,
        cameraAngleX: 0, cameraAngleY: 0, cameraAngleZ: 0,
        platformFlags: 0, puzzleFlags: 0,
      },
    })
    mod.distortionHooks.vars = null
    world.pending = null
    world.mapId = MAP.b3f
  })

  it('열여섯 프레임에 걸쳐 가고, 다 간 뒤에야 중력이 돈다', () => {
    const b3f = data!.maps.find((m) => m.map === MAP.b3f)!
    // B3F에서 서쪽 벽으로 올라가는 자리. 표의 `steps`가 16이다
    const jump = b3f.jumps.find((j) => j.platformIndex === 0)!
    expect(jump.steps).toBe(16)
    const [lx, ly, lz] = [
      jump.bounds.x - b3f.offsetX, jump.bounds.y - b3f.offsetY, jump.bounds.z - b3f.offsetZ,
    ]
    mod.distortionEnter(MAP.b3f, lx, ly, lz)
    const p = worldState.player.position
    p.set(lx + 0.5, ly, lz + 0.5)
    expect(mod.distortionKind()).toBe(PLATFORM_NONE)

    mod.distortionMoved(lx, ly, lz, jump.dir)
    expect(mod.distortionJumping()).toBe(true)

    // 절반쯤에서는 아직 옮기는 중이고 **판은 안 갈렸다**
    for (let i = 0; i < 8; i++) mod.distortionJumpTick(1 / 60)
    expect(mod.distortionJumping()).toBe(true)
    expect(mod.distortionKind()).toBe(PLATFORM_NONE)
    expect(p.x).not.toBe(lx + 0.5 + jump.dx)

    let frames = 8
    while (mod.distortionJumping() && frames < 200) { mod.distortionJumpTick(1 / 60); frames++ }
    expect(frames).toBe(16)
    // 다 간 자리와 갈아 낀 판
    expect(Math.floor(p.x) + b3f.offsetX).toBe(jump.bounds.x + jump.dx)
    expect(Math.round(p.y) + b3f.offsetY).toBe(jump.bounds.y + jump.dy)
    expect(Math.floor(p.z) + b3f.offsetZ).toBe(jump.bounds.z + jump.dz)
    expect(mod.distortionKind()).not.toBe(PLATFORM_NONE)
  })

  it('뛰는 동안 다시 밟아도 새로 안 뛴다', () => {
    const b3f = data!.maps.find((m) => m.map === MAP.b3f)!
    const jump = b3f.jumps.find((j) => j.platformIndex === 0)!
    const [lx, ly, lz] = [
      jump.bounds.x - b3f.offsetX, jump.bounds.y - b3f.offsetY, jump.bounds.z - b3f.offsetZ,
    ]
    mod.distortionEnter(MAP.b3f, lx, ly, lz)
    worldState.player.position.set(lx + 0.5, ly, lz + 0.5)
    mod.distortionMoved(lx, ly, lz, jump.dir)
    mod.distortionJumpTick(1 / 60)
    const at = worldState.player.position.x
    mod.distortionMoved(lx, ly, lz, jump.dir)
    mod.distortionJumpTick(0)
    expect(worldState.player.position.x).toBe(at)
  })
  it('뛰는 동안 그림이 원작 표대로 뜨고 칸 좌표는 직선으로 간다 (`sFloatingPlatformJumpOffsets`)', () => {
    const b3f = data!.maps.find((m) => m.map === MAP.b3f)!
    const jump = b3f.jumps.find((j) => j.platformIndex === 0)!
    const [lx, ly, lz] = [
      jump.bounds.x - b3f.offsetX, jump.bounds.y - b3f.offsetY, jump.bounds.z - b3f.offsetZ,
    ]
    // 앞 시험이 뛰다 만 것을 끝낸다
    for (let i = 0; i < 20 && mod.distortionJumping(); i++) mod.distortionJumpTick(1 / 60)
    mod.distortionEnter(MAP.b3f, lx, ly, lz)
    worldState.player.position.set(lx + 0.5, ly, lz + 0.5)
    expect(distortionBridge.jumpLift?.()).toBeNull()
    mod.distortionMoved(lx, ly, lz, jump.dir)
    // 자료의 축은 Y(1) · 정방향이다 — 그림만 y로 뜬다
    const want = [6, 8, 10, 11, 12, 12, 12, 11, 10, 9, 8, 6, 4, 0, 0]
    for (let tick = 1; tick <= 15; tick++) {
      mod.distortionJumpTick(1 / 60)
      const lift = distortionBridge.jumpLift?.()
      expect(lift?.[1] ?? NaN, `틱 ${tick}`).toBeCloseTo(want[tick - 1]! / 16, 6)
      expect([lift?.[0], lift?.[2]]).toEqual([0, 0])
    }
    mod.distortionJumpTick(1 / 60)
    expect(distortionBridge.jumpLift?.()).toBeNull()
  })
  it('갈아타는 동안 몸 · 카메라가 같은 k로 돌고, 입력 기저는 끝 프레임에야 바뀐다', () => {
    const b3f = data!.maps.find((m) => m.map === MAP.b3f)!
    const jump = b3f.jumps.find((j) => j.platformIndex === 0)!
    const [lx, ly, lz] = [
      jump.bounds.x - b3f.offsetX, jump.bounds.y - b3f.offsetY, jump.bounds.z - b3f.offsetZ,
    ]
    for (let i = 0; i < 20 && mod.distortionJumping(); i++) mod.distortionJumpTick(1 / 60)
    mod.distortionEnter(MAP.b3f, lx, ly, lz)
    worldState.player.position.set(lx + 0.5, ly, lz + 0.5)
    expect(distortionBridge.poseTurn?.()).toBeNull()
    // 판 밖에서 서쪽 벽(1)으로 — 입력 기저는 바닥이다
    mod.distortionMoved(lx, ly, lz, jump.dir)
    expect(distortionBridge.frame?.() ?? null).toBeNull()
    for (let tick = 1; tick <= 15; tick++) {
      mod.distortionJumpTick(1 / 60)
      const turn = distortionBridge.poseTurn?.()
      expect(turn?.k, `틱 ${tick}`).toBeCloseTo(tick / 16, 9)
      expect(turn?.body).toBe(true)
      expect(turn?.angle).toBe(jump.spriteAngle)
      // 끝 프레임 전에는 입력 기저가 옛 판이다
      expect(distortionBridge.frame?.() ?? null).toBeNull()
    }
    const before = distortionBridge.poseTurn?.()
    expect(before).not.toBeNull()
    mod.distortionJumpTick(1 / 60)
    // 끝 프레임: 턴이 끝나고 입력 기저가 새 판이 된다
    expect(distortionBridge.poseTurn?.()).toBeNull()
    const frame = distortionBridge.frame?.() ?? null
    expect(frame?.kind).toBe(1)
    // 이어 붙는다 — 끝 직전 턴을 k=1로 읽은 자세가 새 판이 읽는 자세와 같다 (몸 · 카메라 기울기 둘 다)
    const end = { ...before!, k: 1 }
    const facing = worldState.player.facing
    const q = new Quaternion()
    expect(turnQuaternion(end, true, q).angleTo(surfaceQuaternion(frame, facing, new Quaternion())))
      .toBeLessThan(1e-5)
    expect(turnQuaternion(end, false, q).angleTo(surfaceQuaternion(frame, 0, new Quaternion())))
      .toBeLessThan(1e-5)
  })

  it('자료의 점프 스물은 spriteAngle이 판 기저 표와 맞는다 (위쪽이 −spriteAngle도 돌아 닿는 판의 위쪽이 된다)', () => {
    const z = new Vector3(0, 0, 1)
    let count = 0
    for (const m of data!.maps) {
      for (const j of m.jumps) {
        const to = m.platforms[j.platformIndex]?.kind ?? PLATFORM_FLOOR
        const upTo = platformBasis(to).up
        // 떠나는 판은 넷 중 하나다 — 어느 하나에서 돌아 닿으면 된다
        const reached = [0, 1, 2, 3].some((from) => {
          const u = platformBasis(from).up
          return new Vector3(u[0], u[1], u[2]).applyAxisAngle(z, (-j.spriteAngle * Math.PI) / 180)
            .distanceTo(new Vector3(upTo[0], upTo[1], upTo[2])) < 1e-9
        })
        expect(reached, `${m.map} → 판 ${j.platformIndex}`).toBe(true)
        expect(Math.abs(j.spriteAngle)).toBe(90)
        count++
      }
    }
    expect(count).toBe(20)
  })
})
