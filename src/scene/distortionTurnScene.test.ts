// 판 갈이의 **끝**에서 몸 · 카메라 · 입력 기저가 같이 도는가 (REPAIR — 깨어진 세계 움직임 D2)
//
// 건너뛰기는 `distortionJumpPoint.test`가 잰다. 여기는 폭포 끝과 미끄러지는 판 · 뛰는 판 끝이다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { distortionSchema, type DistortionData } from '../data/schema'
import { withDistortionTables } from '../data/distortionFile'
import {
  MAP, PLATFORM_CEILING, PLATFORM_FLOOR, PLATFORM_NONE, PLATFORM_WEST_WALL, newDistortionState,
} from '../engine/world/distortion'
import { DIR } from '../engine/script/movement'

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
const core = await import('./distortionCore')
const { turningToPlatform } = await import('./distortionEvents')
const { distortionPoseTurn, endPoseTurn } = await import('./distortionTurn')
const { CASCADES, cascadeFinishFrame, cascadeFrames } = await import('../engine/world/distortionCascade')

const floorOf = (map: number) => data!.maps.find((m) => m.map === map)!
const local = (map: number, x: number, y: number, z: number): [number, number, number] => {
  const f = floorOf(map)
  return [x - f.offsetX, y - f.offsetY, z - f.offsetZ]
}

beforeEach(async () => {
  await mod.distortionPreload()
  useSaveStore.setState({ distortion: newDistortionState() })
  core.takeFloorLoad()
  core.takeCarried()
  world.pending = null
  endPoseTurn()
})

describe.runIf(real)('미끄러지는 판 · 뛰는 판 끝 — 갈래가 바뀌면 돌고 나서 판을 갈아 끼운다', () => {
  it('서쪽 벽에서 바닥 판으로 내려앉으면 16프레임 동안 몸 · 카메라가 같은 k로 돈다', () => {
    const b2f = floorOf(MAP.b2f)
    const wall = b2f.platforms.findIndex((p) => p.kind === PLATFORM_WEST_WALL)
    const ground = b2f.platforms.findIndex((p) => p.kind === PLATFORM_FLOOR)
    expect(wall).toBeGreaterThanOrEqual(0)
    expect(ground).toBeGreaterThanOrEqual(0)
    const [lx, ly, lz] = local(MAP.b2f, 30, 227, 22)
    mod.distortionEnter(MAP.b2f, lx, ly, lz)
    core.bindPlatform(wall)
    expect(mod.distortionKind()).toBe(PLATFORM_WEST_WALL)

    for (let n = 1; n <= 15; n++) {
      expect(turningToPlatform(b2f, ground, 1 / 60), `${n}프레임`).toBe(true)
      const turn = distortionPoseTurn()
      expect(turn?.k).toBeCloseTo(n / 16, 9)
      expect(turn).toMatchObject({ fromKind: PLATFORM_WEST_WALL, toKind: PLATFORM_FLOOR, body: true })
      // 입력 기저는 아직 옛 판이다
      expect(mod.distortionKind()).toBe(PLATFORM_WEST_WALL)
    }
    // 열여섯째에 다 돌았다 — 이제 판을 갈아 끼울 때다
    expect(turningToPlatform(b2f, ground, 1 / 60)).toBe(false)
    expect(distortionPoseTurn()?.k).toBe(1)
  })

  it('갈래가 같으면(판 밖 ↔ 바닥 포함) 돌 것이 없다', () => {
    const b2f = floorOf(MAP.b2f)
    const ground = b2f.platforms.findIndex((p) => p.kind === PLATFORM_FLOOR)
    const [lx, ly, lz] = local(MAP.b2f, 30, 227, 22)
    mod.distortionEnter(MAP.b2f, lx, ly, lz)
    core.bindPlatform(-1)
    expect(mod.distortionKind()).toBe(PLATFORM_NONE)
    expect(turningToPlatform(b2f, ground, 1 / 60)).toBe(false)
    expect(distortionPoseTurn()).toBeNull()
  })
})

describe.runIf(real)('폭포 끝 — 닿을 판의 기저로 가는 카메라 기울기를 마무리 롤에 맞춘다', () => {
  it('B5F에서 오르는 폭포: 마무리 롤이 시작되는 프레임에 턴이 서서 끝 프레임에 1이 된다', () => {
    const site = CASCADES.find((c) => !c.down)!
    const [lx, ly, lz] = local(site.map, site.x, site.y, site.z0 + 1)
    mod.distortionEnter(site.map, lx, ly, lz)
    worldState.player.position.set(lx + 0.5, ly, lz + 0.5)
    mod.distortionMoved(lx, ly, lz, site.dir)
    expect(mod.distortionCascading()).toBe(true)

    const finishAt = cascadeFinishFrame(site)
    const total = cascadeFrames(site)
    expect(finishAt).toBeLessThan(total)
    const seen: number[] = []
    for (let f = 1; f <= total + 2 && mod.distortionCascading(); f++) {
      if (world.pending !== null) {
        // 층이 실려 왔다 (MapStreamer가 하는 것)
        const pend = world.pending
        world.pending = null
        world.mapId = pend.to
        mod.distortionEnter(pend.to, pend.x, pend.y, pend.z)
        worldState.player.position.x = pend.x + 0.5
        worldState.player.position.z = pend.z + 0.5
      }
      mod.distortionCascadeTick(1 / 60)
      const turn = distortionPoseTurn()
      if (f < finishAt) expect(turn, `${f}프레임`).toBeNull()
      if (turn !== null) {
        expect(turn.body).toBe(false)
        seen.push(turn.k)
      }
    }
    // 올라가 닿는 B4F의 판은 천장이다 — 바닥에서 천장으로 카메라가 돈다
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]).toBeGreaterThanOrEqual(0.5)
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!)
    // 끝난 뒤에는 턴이 없고 입력 기저가 천장이다
    expect(distortionPoseTurn()).toBeNull()
    expect(mod.distortionKind()).toBe(PLATFORM_CEILING)
  })
})
