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
import { MAP, PLATFORM_NONE } from '../engine/world/distortion'

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
})
