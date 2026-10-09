// 판 갈이의 **끝**에서 몸 · 카메라 · 입력 기저가 같이 도는가 (REPAIR — 깨어진 세계 움직임 D2)
//
// 건너뛰기는 `distortionJumpPoint.test`가 잰다. 여기는 폭포 끝과 미끄러지는 판 · 뛰는 판 끝이다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { distortionSchema, type DistortionData } from '../data/schema'
import { withDistortionTables } from '../data/distortionFile'
import { Quaternion, Vector3 } from 'three'
import {
  MAP, PLATFORM_CEILING, distortionBridge, PLATFORM_FLOOR, PLATFORM_NONE, PLATFORM_WEST_WALL, findPlatform, newDistortionState,
  platformBasis,
} from '../engine/world/distortion'
import { spriteRollRadians, surfaceQuaternion } from '../engine/actor/distortionSurface'
import { takePlayerPoseSnap } from '../engine/actor/bodyTurn'

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

/** 층이 실려 왔다 (MapStreamer가 하는 것) */
function arrive(): void {
  if (world.pending === null) return
  const pend = world.pending
  world.pending = null
  world.mapId = pend.to
  mod.distortionEnter(pend.to, pend.x, pend.y ?? 0, pend.z)
  worldState.player.position.x = pend.x + 0.5
  worldState.player.position.z = pend.z + 0.5
}

/** 타던 폭포를 끝까지 보낸다 (물살에서 걸어 나오는 것까지) */
function settleCascade(): void {
  for (let f = 0; f < 2000 && mod.distortionCascading(); f++) {
    arrive()
    mod.distortionCascadeTick(1 / 60)
  }
}

beforeEach(async () => {
  settleCascade()
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
      arrive()
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

describe.runIf(real)('D4 벽에 선 사람은 그림이 눕는다 (`rotated` · `rotationAngle`)', () => {
  it('배치표에서 rotated인 줄은 난천 둘뿐이고, 둘 다 서쪽 벽 판 위에 있다 — 각이 판 기저의 위쪽과 맞는다', () => {
    const z = new Vector3(0, 0, 1)
    const rotated: { map: number, localID: number }[] = []
    for (const m of data!.maps) {
      const table = data!.mapObjects.find((t) => t.map === m.map)
      for (const o of table?.objects ?? []) {
        if ((o.rotated as number) !== 1) continue
        rotated.push({ map: m.map, localID: o.localID as number })
        // 서 있는 칸의 세계 좌표 — y는 `타일 × 4096 × 16`
        const wy = Math.round((o.y as number) / (4096 * 16))
        // 바닥 판(y 233)과 벽 판(y 225~233)이 한 줄 겹친다 — 눕는 사람이 서 있는 것은 서쪽 벽 판이다
        const idx = findPlatform(m.platforms, o.x as number, wy, o.z as number, PLATFORM_WEST_WALL)
        expect(idx, `${m.map}#${o.localID} 서쪽 벽 판`).toBeGreaterThanOrEqual(0)
        const kind = m.platforms[idx]?.kind ?? PLATFORM_FLOOR
        const upKind = platformBasis(kind).up
        const up = new Vector3(0, 1, 0).applyAxisAngle(z, spriteRollRadians(o.rotationAngle as number))
        expect(up.distanceTo(new Vector3(upKind[0], upKind[1], upKind[2])), `${m.map}#${o.localID}`)
          .toBeLessThan(1e-9)
        expect(kind).toBe(PLATFORM_WEST_WALL)
      }
    }
    expect(rotated).toEqual([{ map: MAP.b2f, localID: 128 }, { map: MAP.b2f, localID: 128 }])
  })

  it('addObjectRow가 roll을 배우에게 싣는다 — 눕는 줄만', async () => {
    const { npcActors } = await import('../engine/actor/npcs')
    const { VarStore } = await import('../engine/script/vars')
    const vars = new VarStore()
    const [lx, ly, lz] = local(MAP.b2f, 30, 232, 20)
    mod.distortionEnter(MAP.b2f, lx, ly, lz)
    npcActors.list = []
    npcActors.byLocalID.clear()
    mod.distortionAddObject(128, vars)
    expect(npcActors.byLocalID.get(128)?.info.roll).toBe(90)
  })
})

describe.runIf(real)('D5 이어하기 · 맵 갈이의 자세 복원과 필드 태스크 중의 메뉴 · 저장 차단', () => {
  it('저장된 판 번호(서쪽 벽)로 들어서면 판 · 입력 기저가 곧바로 벽이고 몸 · 카메라를 앉히라는 부탁이 선다', () => {
    const b2f = floorOf(MAP.b2f)
    const wall = b2f.platforms.findIndex((p) => p.kind === PLATFORM_WEST_WALL)
    useSaveStore.setState({ distortion: { ...newDistortionState(), valid: true, platformIndex: wall } })
    takePlayerPoseSnap()
    const [lx, ly, lz] = local(MAP.b2f, 30, 227, 22)
    mod.distortionEnter(MAP.b2f, lx, ly, lz)
    expect(mod.distortionKind()).toBe(PLATFORM_WEST_WALL)
    expect(distortionBridge.frame?.()?.kind).toBe(PLATFORM_WEST_WALL)
    expect(takePlayerPoseSnap()).toBe(true)
    // 벽 자세의 몸 — 위쪽이 +x다
    const q = surfaceQuaternion(distortionBridge.frame?.() ?? null, 0, new Quaternion())
    const up = new Vector3(0, 1, 0).applyQuaternion(q)
    expect([up.x, up.y, up.z].map((v) => Math.round(v))).toEqual([1, 0, 0])
  })

  it('판 개수 이상(판 밖)으로 저장돼 있으면 바닥 자세로 앉는다', () => {
    const b2f = floorOf(MAP.b2f)
    useSaveStore.setState({
      distortion: { ...newDistortionState(), valid: true, platformIndex: b2f.platforms.length },
    })
    takePlayerPoseSnap()
    const [lx, ly, lz] = local(MAP.b2f, 30, 227, 22)
    mod.distortionEnter(MAP.b2f, lx, ly, lz)
    expect(distortionBridge.frame?.() ?? null).toBeNull()
    expect(takePlayerPoseSnap()).toBe(true)
  })

  it('층 갈이는 판이 안 바뀌므로 앉히지 않는다', () => {
    const [lx, ly, lz] = local(MAP.b2f, 30, 227, 22)
    useSaveStore.setState({ distortion: { ...newDistortionState(), valid: true, platformIndex: 0 } })
    takePlayerPoseSnap()
    core.beginFloorLoad()
    mod.distortionEnter(MAP.b2f, lx, ly, lz)
    expect(takePlayerPoseSnap()).toBe(false)
  })

  it('건너뛰는 동안은 필드 태스크가 서 있다 — 메뉴 · 저장이 안 열린다 (`distortionBusy` → `player.riding`)', () => {
    settleCascade()
    const b3f = floorOf(MAP.b3f)
    const jump = b3f.jumps.find((j) => j.platformIndex === 0)!
    const [lx, ly, lz] = local(MAP.b3f, jump.bounds.x, jump.bounds.y, jump.bounds.z)
    mod.distortionEnter(MAP.b3f, lx, ly, lz)
    worldState.player.position.set(lx + 0.5, ly, lz + 0.5)
    expect(mod.distortionBusy()).toBe(false)
    mod.distortionMoved(lx, ly, lz, jump.dir)
    expect(mod.distortionBusy()).toBe(true)
    for (let i = 0; i < 20 && mod.distortionBusy(); i++) mod.distortionJumpTick(1 / 60)
    expect(mod.distortionBusy()).toBe(false)
  })

  it('폭포를 타는 동안도 막힌다', () => {
    const site = CASCADES.find((c) => !c.down)!
    const [lx, ly, lz] = local(site.map, site.x, site.y, site.z0 + 1)
    mod.distortionEnter(site.map, lx, ly, lz)
    worldState.player.position.set(lx + 0.5, ly, lz + 0.5)
    mod.distortionMoved(lx, ly, lz, site.dir)
    expect(mod.distortionBusy()).toBe(true)
  })
})
