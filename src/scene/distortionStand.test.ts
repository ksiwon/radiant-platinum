// 깨어진 세계에서 **서 있는 높이**와 **층에 서는 사람들** (PARITY §6.10)
//
// ⚠️ 여기서 재는 것 둘 다 화면에 바로 보이는 고장이었다:
//
//  · 높이를 지형에서 읽으려 들면 B2F에서 여덟 칸이 뜬다. 원작은 이 세계에
//    들어서면서 주인공의 높이 계산을 꺼 버리고(`InitPlayer`), 처음 서는 높이를
//    `mapOffset.y + MAP_OBJECT_TILE_SIZE` 한 줄로 적어 둔다 (`LoadFloor`).
//  · 층에 들어설 때 그 층의 사람을 안 세우면 기라티나도 호수 셋도 바위도
//    한 번도 안 나온다 — 원작은 `AddMapObjectsForMap`을 층마다 부른다.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { distortionSchema, type DistortionData } from '../data/schema'
import { FLAG_COND, MAP, PLATFORM_FLOOR, PROGRESS } from '../engine/world/distortion'
import { VarStore } from '../engine/script/vars'

const FILE = 'public/data/distortion.json'
const real = existsSync(FILE)
const data: DistortionData | null = real
  ? distortionSchema.parse(JSON.parse(readFileSync(FILE, 'utf8')))
  : null

vi.mock('../data/gameData', () => ({
  loadDistortion: () => Promise.resolve(data),
}))

const { world } = await import('../engine/map/world')
const { npcActors } = await import('../engine/actor/npcs')
const { useSaveStore } = await import('../state/saveStore')
const mod = await import('./distortion')

const FLOORS = [573, 574, 575, 576, 577, 579, 580, 581, 582, 583]

describe.runIf(real)('서 있는 높이', () => {
  // ⚠️ **첫 진입은 자료보다 빠르다.** 자료를 봐야 답할 수 있게 만들면 그 한 번을
  // 놓쳐 y가 0으로 잡히고, 그러면 승강 발판 칸의 세계 y가 한 칸 어긋나
  // **아래층으로 내려가는 발판이 안 걸린다** (실측: 1F에서 밟아도 안 탔다).
  // 이 시험이 `distortionPreload`보다 먼저 도는 것이 그 뜻이다
  it('자료가 오기 전에도 답한다', () => {
    expect(mod.distortionLoaded()).toBe(false)
    expect(mod.distortionGroundY(MAP.f1)).toBe(1)
  })

  it('열 층 어디서나 지역 y가 1이다', async () => {
    await mod.distortionPreload()
    for (const map of FLOORS) expect(mod.distortionGroundY(map), `맵 ${String(map)}`).toBe(1)
    // 깨어진 세계 밖은 이 함수가 답하지 않는다 — 맵 격자가 답한다
    expect(mod.distortionGroundY(415)).toBeNull()
  })

  // ⚠️ **판의 bounds를 높이로 쓰면 안 된다.** B2F의 바닥 판 넷은 지역 9에
  // 있는데 그건 서쪽 벽을 타고 올라가야 닿는 위층이고, 그 층에서 실제로
  // 걷는 바닥은 지역 1이다 (실측: 걸을 수 있는 196칸 중 170칸의 그림이 1)
  it('B2F의 바닥 판은 지역 9에 있다 — 그걸 높이로 쓰면 여덟 칸이 뜬다', () => {
    const b2f = data!.maps.find((m) => m.map === MAP.b2f)!
    const floors = b2f.platforms.filter((p) => p.kind === PLATFORM_FLOOR)
    expect(floors).toHaveLength(4)
    for (const p of floors) expect(p.bounds.y - b2f.offsetY).toBe(9)
    expect(mod.distortionGroundY(MAP.b2f)).toBe(1)
  })

  // 승강 경로의 y 변화가 층 오프셋의 차이와 같아서 지역 y가 보존된다 —
  // 그래서 「한 층에 한 값」이 열 층 내내 성립한다
  it('층을 오르내려도 지역 y가 그대로다', () => {
    const step: Record<number, number> = {}
    for (const c of data!.connections) {
      const cur = data!.maps.find((m) => m.map === c.currID)
      const next = data!.maps.find((m) => m.map === c.nextID)
      if (cur === undefined || next === undefined) continue
      step[c.currID] = cur.offsetY - next.offsetY
    }
    // 아래로 가는 경로의 y 변화(음수)는 그 층의 오프셋 차이와 크기가 같다
    const drops = new Set(
      data!.elevatorPaths.filter((p) => p.finalTileYOffset < 0).map((p) => -p.finalTileYOffset))
    for (const [map, d] of Object.entries(step)) {
      expect(drops.has(d), `맵 ${map} 오프셋 차 ${String(d)}`).toBe(true)
    }
  })
})

describe.runIf(real)('층에 들어서면 그 층 사람이 선다', () => {
  beforeEach(async () => {
    await mod.distortionPreload()
    npcActors.list = []
    npcActors.byLocalID.clear()
    const vars = new VarStore()
    mod.distortionHooks.vars = () => vars
    mod.distortionHooks.giratinaAnim = () => false
    mod.distortionHooks.cyrusAppearance = () => 0
    mod.distortionHooks.puzzleFinished = () => false
    useSaveStore.setState({
      distortion: {
        valid: true, hiddenGroups: 0, platformIndex: 99,
        cameraAngleX: 0, cameraAngleY: 0, cameraAngleZ: 0,
        platformFlags: 0, puzzleFlags: 0,
      },
    })
    world.pending = null
  })

  it('기라티나는 그가 내려온 뒤에만 선다', () => {
    mod.distortionHooks.progress = () => PROGRESS.giratinaRoomFirstShadow
    mod.distortionEnter(MAP.giratinaRoom, 15, 1, 23)
    expect(npcActors.byLocalID.has(128)).toBe(false)

    npcActors.list = []
    npcActors.byLocalID.clear()
    mod.distortionHooks.progress = () => PROGRESS.giratinaArrived
    mod.distortionEnter(MAP.giratinaRoom, 15, 1, 23)
    const giratina = npcActors.byLocalID.get(128)
    expect(giratina?.info.sprite).toBe(230)
  })

  // ⚠️ 스크립트가 직접 부르는 것(`manualAddOnly`)은 들어서면서 세우지 않는다.
  // 기라티나 방의 시로나·태홍이 그것이라, 세워 버리면 아직 오지 않은 사람이
  // 방에 미리 서 있는다
  it('스크립트가 부를 사람은 미리 안 선다', () => {
    mod.distortionHooks.progress = () => PROGRESS.giratinaArrived
    mod.distortionEnter(MAP.giratinaRoom, 15, 1, 23)
    const room = data!.mapObjects.find((m) => m.map === MAP.giratinaRoom)!
    for (const row of room.objects) {
      if ((row.flagCond as number) !== FLAG_COND.manualAddOnly) continue
      expect(npcActors.byLocalID.has(row.localID as number)).toBe(false)
    }
  })

  // ⚠️ **바위가 안 서면 수수께끼가 통째로 없다.** B5F에서 밀어 떨어뜨릴
  // 바위 셋이 그림 번호 84고, 그것이 `boulderTrue` 조건으로 걸려 있다
  it('B5F 바위 수수께끼의 바위 셋이 선다', () => {
    // 아직 안 푼 상태로 처음 들어선다 — 그러면 세 바위가 B5F에 놓인다
    useSaveStore.setState({
      distortion: { ...useSaveStore.getState().distortion, valid: false },
    })
    mod.distortionHooks.progress = () => PROGRESS.talkedToB3FCyrus
    mod.distortionEnter(MAP.b5f, 20, 1, 25)
    const rocks = npcActors.list.filter((a) => a.info.sprite === 84)
    expect(rocks.map((r) => r.localID).sort((a, b) => a - b)).toEqual([128, 129, 130])
  })

  // ⚠️ **좌표가 세계 좌표다.** 층 오프셋을 안 빼면 사람이 맵 밖에 선다
  it('세운 자리가 그 층의 지역 좌표다', () => {
    mod.distortionHooks.progress = () => PROGRESS.giratinaArrived
    mod.distortionEnter(MAP.turnbackCaveRoom, 20, 1, 25)
    const map = data!.maps.find((m) => m.map === MAP.turnbackCaveRoom)!
    const row = data!.mapObjects.find((m) => m.map === MAP.turnbackCaveRoom)!
      .objects.find((o) => o.localID === 129)!
    const actor = npcActors.byLocalID.get(129)!
    expect(actor.x).toBe((row.x as number) - map.offsetX)
    expect(actor.z).toBe((row.z as number) - map.offsetZ)
    expect(actor.y).toBe(1)
  })
})
