// 승강 발판을 실제로 태워 본다 (PARITY §6.10).
//
// 규칙은 `engine/world/distortionElevator`가 시험하고, 여기서는 **한 번 타면
// 정말 층이 바뀌고 발밑에 땅이 있는가**를 본다 — 이 한 줄이 안 되면 이야기가
// 1F에서 끝나므로 표만 맞아서는 모자란다
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { distortionSchema, type DistortionData } from '../data/schema'
import { withDistortionTables } from '../data/distortionFile'
import { MAP } from '../engine/world/distortion'
import { PLATFORM_FLAG } from '../engine/world/distortionElevator'

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

/** 층을 실제로 갈아 끼운다 — `MapStreamer`가 워프를 처리하는 자리를 흉내 낸다 */
function settleWarp(): void {
  const pending = world.pending
  if (pending === null) return
  world.pending = null
  world.mapId = pending.to
  mod.distortionEnter(pending.to, pending.x, pending.y ?? 0, pending.z)
  worldState.player.position.set(pending.x + 0.5, pending.y ?? 0, pending.z + 0.5)
}

/** 한 프레임씩 끝까지 태운다. 안 끝나면 시험이 선다 */
function rideOut(): number {
  let frames = 0
  while (mod.distortionRiding()) {
    mod.distortionRideTick(1 / 60)
    settleWarp()
    frames++
    if (frames > 2000) throw new Error('발판이 안 멈춘다')
  }
  return frames
}

describe.runIf(real)('승강 발판을 탄다', () => {
  beforeEach(async () => {
    await mod.distortionPreload()
    mod.distortionForgetEvents()
    useSaveStore.setState({
      distortion: {
        valid: false, hiddenGroups: 0, platformIndex: 0,
        cameraAngleX: 0, cameraAngleY: 0, cameraAngleZ: 0,
        platformFlags: 0, puzzleFlags: 0,
      },
    })
    mod.distortionHooks.progress = () => 0
    mod.distortionHooks.runScript = () => { /* 시험에서는 스크립트를 안 돌린다 */ }
    mod.distortionHooks.puzzleFinished = () => false
    world.pending = null
    // ⚠️ **한 프레임 먼저 돌린다.** 씬이 프레임을 안 물려 주면 발판이 아예
    // 안 걸린다 — 태워 놓고 안 움직이면 갇히기 때문이다 (`scene/distortion`)
    mod.distortionRideTick(0)
  })

  it('1F에서 타면 B1F에 닿고, 도로 올라올 발판이 선다', () => {
    const t = data!.movingPlatforms.find((m) => m.map === MAP.f1)!.platforms[0]!
    const f1 = data!.maps.find((m) => m.map === MAP.f1)!
    world.mapId = MAP.f1
    mod.distortionEnter(MAP.f1, t.tileX - f1.offsetX, t.tileY - f1.offsetY, t.tileZ - f1.offsetZ)
    // 처음 들어설 때 자리 표가 세워진다
    expect(useSaveStore.getState().distortion.platformFlags)
      .toBe((1 << PLATFORM_FLAG.b4f1) | (1 << PLATFORM_FLAG.b5f1))

    mod.distortionStepped(
      t.tileX - f1.offsetX, t.tileY - f1.offsetY, t.tileZ - f1.offsetZ, 0,
    )
    expect(mod.distortionRiding()).toBe(true)
    const frames = rideOut()

    expect(world.mapId).toBe(MAP.b1f)
    // 한 층이 128프레임이다 — 층 갈이를 기다린 프레임이 몇 더 붙는다
    expect(frames).toBeGreaterThanOrEqual(128)
    const b1f = data!.maps.find((m) => m.map === MAP.b1f)!
    const p = worldState.player.position
    expect(Math.floor(p.x) + b1f.offsetX).toBe(t.tileX)
    expect(Math.round(p.y) + b1f.offsetY).toBe(t.tileY - 32)
    expect(Math.floor(p.z) + b1f.offsetZ).toBe(t.tileZ)
    // 올라올 발판이 그 자리에 섰다
    expect(useSaveStore.getState().distortion.platformFlags & (1 << PLATFORM_FLAG.b1f1))
      .not.toBe(0)
  })

  it('B3F에서 두 층을 한 번에 내려간다 (B4F를 스쳐 B5F로)', () => {
    const b3f = data!.maps.find((m) => m.map === MAP.b3f)!
    const t = data!.movingPlatforms.find((m) => m.map === MAP.b3f)!.platforms
      .find((q) => q.elevatorPathIndex === 8)!
    world.mapId = MAP.b3f
    mod.distortionEnter(MAP.b3f, t.tileX - b3f.offsetX, t.tileY - b3f.offsetY, t.tileZ - b3f.offsetZ)
    mod.distortionStepped(
      t.tileX - b3f.offsetX, t.tileY - b3f.offsetY, t.tileZ - b3f.offsetZ, 0,
    )
    rideOut()
    expect(world.mapId).toBe(MAP.b5f)
    const b5f = data!.maps.find((m) => m.map === MAP.b5f)!
    expect(Math.round(worldState.player.position.y) + b5f.offsetY).toBe(t.tileY - 64)
    // 경로 9로 끝나면 B5F의 첫 발판이 생겨난다
    expect(useSaveStore.getState().distortion.platformFlags & (1 << PLATFORM_FLAG.b5f1))
      .not.toBe(0)
  })

  it('타는 동안은 조작이 안 먹는다', () => {
    const f1 = data!.maps.find((m) => m.map === MAP.f1)!
    const t = data!.movingPlatforms.find((m) => m.map === MAP.f1)!.platforms[0]!
    world.mapId = MAP.f1
    mod.distortionEnter(MAP.f1, t.tileX - f1.offsetX, t.tileY - f1.offsetY, t.tileZ - f1.offsetZ)
    mod.distortionStepped(
      t.tileX - f1.offsetX, t.tileY - f1.offsetY, t.tileZ - f1.offsetZ, 0,
    )
    // 타는 중에 또 밟아도 새로 안 태운다
    mod.distortionStepped(
      t.tileX - f1.offsetX, t.tileY - f1.offsetY, t.tileZ - f1.offsetZ, 0,
    )
    expect(mod.distortionRiding()).toBe(true)
    rideOut()
    expect(mod.distortionRiding()).toBe(false)
  })

  it('층을 받는 동안은 발판이 멈춰 선다', () => {
    const f1 = data!.maps.find((m) => m.map === MAP.f1)!
    const t = data!.movingPlatforms.find((m) => m.map === MAP.f1)!.platforms[0]!
    world.mapId = MAP.f1
    mod.distortionEnter(MAP.f1, t.tileX - f1.offsetX, t.tileY - f1.offsetY, t.tileZ - f1.offsetZ)
    mod.distortionStepped(
      t.tileX - f1.offsetX, t.tileY - f1.offsetY, t.tileZ - f1.offsetZ, 0,
    )
    // 층 갈이가 걸릴 때까지 돌린다
    for (let i = 0; i < 200 && world.pending === null; i++) mod.distortionRideTick(1 / 60)
    expect(world.pending).not.toBeNull()
    const before = worldState.player.position.y
    mod.distortionRideTick(1 / 60)
    expect(worldState.player.position.y).toBe(before)
    settleWarp()
    rideOut()
    expect(world.mapId).toBe(MAP.b1f)
  })
})
