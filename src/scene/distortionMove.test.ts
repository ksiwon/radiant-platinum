// **밟으면 바닥이 미끄러진다** (PARITY §6.10 · `EVENT_CMD_MOVE_PLATFORM`).
//
// B2F에서 건너편으로 가는 길이 이 발판이다. 규칙 상수는
// `engine/world/distortionMovePlatform`이 시험하고, 여기서는 **정말 프레임을
// 두고 움직이는가**를 본다 — 예전엔 사건이 같은 프레임에 주인공만 여덟 칸
// 옮겨서 판은 제자리에 두고 사람만 허공을 건너갔다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { distortionSchema, type DistortionData } from '../data/schema'
import { withDistortionTables } from '../data/distortionFile'
import { EVENT_CMD, MAP } from '../engine/world/distortion'
import { HOP_FRAMES, HOP_TILES, VIBRATION } from '../engine/world/distortionMovePlatform'

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

/** B2F에서 발판을 태우는 첫 사건 (`sMapEventB2F_P2N`) */
function firstRide(): { x: number; y: number; z: number; cmds: readonly unknown[] } | null {
  const table = data?.events.find((e) => e.map === MAP.b2f)
  for (const e of table?.events ?? []) {
    if (e.cmds.some((c) => c.kind === EVENT_CMD.movePlatform)) {
      return { x: e.x, y: e.y, z: e.z, cmds: e.cmds }
    }
  }
  return null
}

/** 사건이 끝날 때까지 한 프레임씩. 안 끝나면 시험이 선다 */
function runOut(each?: (frame: number) => void): number {
  let frames = 0
  while (mod.distortionEventRunning()) {
    mod.distortionEventTick(1 / 60)
    frames++
    each?.(frames)
    if (frames > 2000) throw new Error('사건이 안 끝난다')
  }
  return frames
}

describe.runIf(real)('밟으면 바닥이 통째로 미끄러진다', () => {
  const spot = firstRide()

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
    mod.distortionHooks.vars = () => null as never
    world.pending = null
    world.mapId = MAP.b2f
  })

  it('B2F에 발판을 미는 사건이 있다', () => {
    expect(spot, '자료에 `movePlatform` 사건이 하나도 없다').not.toBeNull()
  })

  it.runIf(spot)('밟은 프레임에는 아직 아무도 안 움직인다', () => {
    const b2f = data!.maps.find((m) => m.map === MAP.b2f)!
    const lx = spot!.x - b2f.offsetX, ly = spot!.y - b2f.offsetY, lz = spot!.z - b2f.offsetZ
    mod.distortionEnter(MAP.b2f, lx, ly, lz)
    worldState.player.position.set(lx + 0.5, ly, lz + 0.5)
    mod.distortionStepped(lx, ly, lz, 0)
    expect(mod.distortionEventRunning(), '사건이 안 걸렸다').toBe(true)
    // 원작은 먼저 **떤다** — 이 열두 프레임 동안 칸은 그대로다
    mod.distortionEventTick(1 / 60)
    expect(worldState.player.position.z).toBeCloseTo(lz + 0.5, 5)
    expect(Math.abs(worldState.player.position.y - ly)).toBeLessThanOrEqual(VIBRATION[0]! + 1e-6)
  })

  it.runIf(spot)('판이 떨다가 미끄러지고, 주인공이 뛰어내리고, 빈 판이 돌아온다', () => {
    const b2f = data!.maps.find((m) => m.map === MAP.b2f)!
    const lx = spot!.x - b2f.offsetX, ly = spot!.y - b2f.offsetY, lz = spot!.z - b2f.offsetZ
    mod.distortionEnter(MAP.b2f, lx, ly, lz)
    worldState.player.position.set(lx + 0.5, ly, lz + 0.5)
    const from = worldState.player.position.clone()
    mod.distortionStepped(lx, ly, lz, 0)

    const slide = spot!.cmds.find(
      (c) => (c as { kind: number }).kind === EVENT_CMD.movePlatform) as {
        params: { platformIndex: number, finalTileZOffset: number } }
    const index = slide.params.platformIndex
    let moved = 0
    let lifted = 0
    const frames = runOut(() => {
      const at = mod.distortionSlideAt(index)
      if (at !== null && Math.abs(at[2]) > 0.01) moved++
      if (worldState.player.position.y - ly > 0.2) lifted++
    })

    // ① 판이 실제로 여러 프레임에 걸쳐 나가 있었다
    expect(moved, '판이 한 번도 안 밀렸다 — 순간이동이다').toBeGreaterThan(20)
    // ② 주인공이 공중에 떴다 = 뛰어내렸다
    expect(lifted, '뛰는 동안 발이 안 떴다').toBeGreaterThan(HOP_FRAMES / 2)
    // ③ 다 끝나면 판은 제자리다 (보냈다가 되돌리는 한 쌍이라 0이 된다)
    const rest = mod.distortionSlideAt(index) ?? [0, 0, 0]
    expect(Math.abs(rest[0]) + Math.abs(rest[1]) + Math.abs(rest[2]))
      .toBeLessThan(0.01)
    // ④ 주인공은 판이 간 만큼 + 뛴 만큼 옮겨졌다
    const want = slide.params.finalTileZOffset - HOP_TILES
    expect(worldState.player.position.z - from.z).toBeCloseTo(want, 3)
    expect(worldState.player.position.y).toBeCloseTo(ly, 5)
    // ⑤ 한 프레임에 안 끝났다
    expect(frames).toBeGreaterThan(VIBRATION.length + HOP_FRAMES)
  })
})
