// B5F에서 호수의 셋이 바위 넣는 법을 보여 주고, B6F에 가서 선다 (PARITY §6.10 · REPAIR §86)
//
// 표와 프레임 산술은 `engine/world/distortionTuto`가 시험한다. 여기서는 **실제
// 자료로 칸을 밟아** 사건 명령 12·13·14가 끝까지 돌고, 그 뒤 B6F에 그 마리가
// 서서 웅덩이 스크립트 5·6·7이 움직일 대상이 있는가를 본다 — 예전에는 셋 다
// `default:`로 떨어져 아무 일도 안 일어났고, B6F의 셋은 한 번도 안 섰다.
import { beforeEach, expect, it, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { distortionSchema, type DistortionData } from '../data/schema'
import { withDistortionTables } from '../data/distortionFile'
import { DATA, withData } from '../data/romData.testkit'
import { EVENT_CMD, FLAG_COND, MAP, flagHolds } from '../engine/world/distortion'
import { TUTO_SPECS } from '../engine/world/distortionTuto'
import { DIR, type Movable, type MovementStep } from '../engine/script/movement'

const FILE = resolve(DATA, 'distortion.json')
const data: DistortionData | null = existsSync(FILE)
  ? withDistortionTables(distortionSchema.parse(JSON.parse(readFileSync(FILE, 'utf8'))))
  : null

vi.mock('../data/gameData', () => ({
  loadDistortion: () => Promise.resolve(data),
}))

const { world } = await import('../engine/map/world')
const { worldState } = await import('../state/worldState')
const { useSaveStore } = await import('../state/saveStore')
const { npcActors, clearNpcs } = await import('../engine/actor/npcs')
const { VarStore } = await import('../engine/script/vars')
const { FieldWorld } = await import('../engine/script/world')
const { makeWorld } = await import('../engine/script/field')
const { buildCommands } = await import('../engine/script/commands')
const { ScriptContext } = await import('../engine/script/context')
const { entryOffset, fileBytes, parseScriptMeta, resolveScript } = await import('../engine/script/data')
const mod = await import('./distortion')

const maybe = withData('distortion.json', 'scripts.json', 'scripts.bin')

maybe('B5F의 바위 안내 셋', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const scripts = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map: commands } = buildCommands(meta.commands)

  let vars = new VarStore()
  /** `MapStreamer`가 꽂는 것과 같은 길 — `fieldScripts.world.objects` */
  let field = makeWorld(vars, [], meta.movements)

  beforeEach(async () => {
    await mod.distortionPreload()
    clearNpcs()
    useSaveStore.setState({
      distortion: {
        valid: false, hiddenGroups: 0, platformIndex: 0,
        cameraAngleX: 0, cameraAngleY: 0, cameraAngleZ: 0,
        platformFlags: 0, puzzleFlags: 0,
      },
    })
    vars = new VarStore()
    field = makeWorld(vars, [], meta.movements)
    // B6F의 시로나가 서는 진행도 (`talkedToB3FCyrus`)
    mod.distortionHooks.progress = () => 6
    mod.distortionHooks.runScript = () => false // 스크립트는 아래에서 따로 돌린다
    mod.distortionHooks.puzzleFinished = () => false
    mod.distortionHooks.vars = () => vars
    mod.distortionHooks.addObject = (localID) => { mod.distortionAddObject(localID, vars) }
    mod.distortionHooks.movements = () => meta.movements
    mod.distortionHooks.mapObject = (localID) => field.objects(localID)
    world.pending = null
  })

  function floorOf(map: number): DistortionData['maps'][number] {
    return data!.maps.find((m) => m.map === map)!
  }

  /** 그 사건 칸들 (세계 좌표) */
  function triggers(kind: number): { x: number; y: number; z: number }[] {
    const table = data!.events.find((e) => e.map === MAP.b5f)!
    return table.events.filter((e) => e.cmds.some((c) => c.kind === kind))
      .map((e) => ({ x: e.x, y: e.y, z: e.z }))
  }

  /** 그 층의 세계 칸에 선다 */
  function stand(map: number, wx: number, wy: number, wz: number): [number, number, number] {
    const f = floorOf(map)
    const l: [number, number, number] = [wx - f.offsetX, wy - f.offsetY, wz - f.offsetZ]
    world.mapId = map
    mod.distortionEnter(map, l[0], l[1], l[2])
    worldState.player.position.set(l[0] + 0.5, l[1], l[2] + 0.5)
    worldState.player.facing = Math.PI // 북
    return l
  }

  /** 칸을 밟는다 — 사건이 걸린다 */
  function step(map: number, w: { x: number; y: number; z: number }): void {
    const l = stand(map, w.x, w.y, w.z)
    mod.distortionStepped(l[0], l[1], l[2], DIR.north)
  }

  /** 사건이 끝날 때까지 한 프레임씩. 안 끝나면 시험이 선다 */
  function runOut(each?: () => void): number {
    let frames = 0
    while (mod.distortionEventRunning()) {
      mod.distortionEventTick(1 / 60)
      frames++
      each?.()
      if (frames > 3000) throw new Error('사건이 안 끝난다')
    }
    return frames
  }

  const flags = (): number => useSaveStore.getState().distortion.puzzleFlags

  /** B6F 배치표의 그 줄이 지금 설 조건인가 (`CheckFlagConditionForObjectEvent`) */
  function b6fRowHolds(localID: number): boolean {
    const row = data!.mapObjects.find((m) => m.map === MAP.b6f)!.objects
      .find((o) => o.localID === localID)!
    expect(row.flagCond).toBe(FLAG_COND.boulderTrue)
    return flagHolds(row.flagCond as number, row.flagCondVal as number, {
      progress: 6, state: useSaveStore.getState().distortion,
      giratinaAnim: () => false, cyrusAppearance: 0,
    })
  }

  it.each([
    // 1(Init) 뒤로 솟기 72 · 바위 쪽 32 · 오르내림 90 · 물러나기 48 · 가라앉기 136
    ['유크시', EVENT_CMD.showUxieBoulderTuto, 72 + 32 + 90 + 48 + 136],
    // 솟기 56 · 목록 160(늦은 32 + 32 + 32 + 16 + 32 + 16) · 가라앉기 104 (첫 프레임이 겹친다)
    ['아그놈', EVENT_CMD.showAzelfBoulderTuto, 56 + 160 + 104 - 1],
    // 솟기 40 · 목록 256 · 가라앉기 72 (첫 프레임이 겹친다)
    ['엠라이트', EVENT_CMD.showMespritBoulderTuto, 40 + 256 + 72 - 1],
  ])('%s — 끝까지 돌고, B5F의 그 마리는 지워지고, B6F의 그 마리가 설 조건이 선다', (
    _name, kind, want,
  ) => {
    const spec = TUTO_SPECS[kind]!
    const at = triggers(kind)
    expect(at.length, '사건 칸이 둘이어야 한다').toBe(2)
    step(MAP.b5f, at[0]!)
    expect(flags() & (1 << spec.seen)).toBe(0)
    expect(mod.distortionEventRunning(), '사건이 안 걸렸다').toBe(true)
    // Init — 그 자리에서 선다
    const actor = npcActors.byLocalID.get(spec.b5f)
    expect(actor, 'B5F의 그 마리가 안 섰다').toBeDefined()
    expect(b6fRowHolds(spec.b6f)).toBe(false)

    let lift = 0
    const frames = runOut(() => { lift = Math.max(lift, actor!.offsetY ?? 0) })
    expect(frames).toBe(want)
    // 판 아래에서 그 높이만큼 솟았다 (유크시는 오르내림의 반 칸이 더해진다)
    expect(lift).toBeGreaterThanOrEqual(spec.ascendTarget)
    expect(lift).toBeLessThanOrEqual(spec.ascendTarget + 0.5)

    expect(mod.distortionEventRunning()).toBe(false)
    expect(npcActors.byLocalID.has(spec.b5f), 'B5F의 그 마리가 남았다').toBe(false)
    expect(flags() & (1 << spec.seen)).not.toBe(0)
    expect(flags() & (1 << spec.inB6F)).not.toBe(0)
    expect(b6fRowHolds(spec.b6f)).toBe(true)

    // 다른 한 칸을 밟아도 다시 안 돈다 (`boulderFalse *_TUTO_SEEN`)
    step(MAP.b5f, at[1]!)
    expect(mod.distortionEventRunning()).toBe(false)

    // B6F에 들어서면 그 마리가 선다 (`AddMapObjectsForMap`)
    clearNpcs()
    const b6f = data!.mapObjects.find((m) => m.map === MAP.b6f)!.objects
      .find((o) => o.localID === spec.b6f)!
    stand(MAP.b6f, 85, floorOf(MAP.b6f).offsetY, 52)
    const there = npcActors.byLocalID.get(spec.b6f)
    expect(there, 'B6F에 그 마리가 안 섰다').toBeDefined()
    expect(there!.gfx).toBe(b6f.graphicsID)
  })

  it('도는 동안 사건 잠금이 서 있고, 다른 사건 칸을 밟아도 안 걸린다', () => {
    const uxie = triggers(EVENT_CMD.showUxieBoulderTuto)[0]!
    const azelf = triggers(EVENT_CMD.showAzelfBoulderTuto)[0]!
    step(MAP.b5f, uxie)
    let held = 0
    for (let i = 0; i < 100; i++) {
      mod.distortionEventTick(1 / 60)
      if (mod.distortionEventRunning()) held++
    }
    expect(held).toBe(100)
    // 잠긴 동안 다른 칸에 닿아도 (`distortionStepped`가 먼저 막는다)
    const f = floorOf(MAP.b5f)
    mod.distortionStepped(azelf.x - f.offsetX, azelf.y - f.offsetY, azelf.z - f.offsetZ, DIR.north)
    expect(npcActors.byLocalID.has(TUTO_SPECS[EVENT_CMD.showAzelfBoulderTuto]!.b5f)).toBe(false)
    runOut()
    expect(mod.distortionEventRunning(), '끝나면 풀린다').toBe(false)
  })

  it.each([
    ['z 67 — Top', 67, [66, 68]],
    ['z 68 — Bottom', 68, [67, 69]],
  ])('엠라이트는 주인공 둘레를 돈다: %s', (_name, z, [minZ, maxZ]) => {
    const spec = TUTO_SPECS[EVENT_CMD.showMespritBoulderTuto]!
    const at = triggers(EVENT_CMD.showMespritBoulderTuto).find((t) => t.z === z)!
    step(MAP.b5f, at)
    const f = floorOf(MAP.b5f)
    const actor = npcActors.byLocalID.get(spec.b5f)!
    const player = field.objects(0xff)!
    const from = worldState.player.position.clone()
    const zs = new Set<number>()
    const dirs = new Set<number>()
    runOut(() => {
      if (npcActors.byLocalID.has(spec.b5f)) zs.add(Math.round(actor.z) + f.offsetZ)
      dirs.add(player.dir)
    })
    // 엠라이트가 오간 z의 가운데가 주인공이 선 줄이다
    expect(Math.min(...zs)).toBe(minZ)
    expect(Math.max(...zs)).toBe(maxZ)
    // 주인공은 제자리에서 두 바퀴 돌고 서쪽을 보고 선다
    expect([...dirs].sort()).toEqual([DIR.north, DIR.south, DIR.west, DIR.east].sort())
    expect(player.dir).toBe(DIR.west)
    expect(worldState.player.position.distanceTo(from)).toBe(0)
  })

  /**
   * 웅덩이 스크립트 (`DistortionWorldB6F_CoordEvent_*BoulderInPit`).
   *
   * `ApplyMovement 그 마리, WarpOut` → `WaitMovement` →
   * `DeleteDistortionWorldMapObject 그 마리`. 그 마리가 없으면 걸음이 **아무에게도
   * 안 걸린 채** 지나간다 — 예전이 그랬다
   */
  function runPitScript(scriptID: number): { applied: { id: number; ok: boolean }[]; ended: boolean } {
    const file = meta.files.findIndex((m) => m.name === 'scripts_distortion_world_b6f')
    const target = resolveScript(meta, scriptID, file)
    if (target === null) throw new Error('B6F 스크립트가 없다')
    const player: Movable = { x: 0, z: 0, dir: DIR.north, visible: true }
    const fw = new FieldWorld({
      vars,
      input: () => ({ pressed: true, held: true }),
      movements: meta.movements,
      objects: (id) => (id === 0xff ? player : npcActors.byLocalID.get(id) ?? null),
      services: {
        distortion: {
          addObject: (id) => { mod.distortionAddObject(id, vars) },
          removeObject: (id) => { mod.distortionRemoveObject(id) },
          resetPersisted: () => { /* 안 쓴다 */ },
          resetCamera: () => { /* 안 쓴다 */ },
          startShadow: () => { /* 안 쓴다 */ },
          finishShadow: () => { /* 안 쓴다 */ },
        },
      },
    })
    const applied: { id: number; ok: boolean }[] = []
    const apply = fw.applyMovement.bind(fw)
    fw.applyMovement = (id: number, steps: readonly MovementStep[]) => {
      const ok = apply(id, steps)
      applied.push({ id, ok })
      return ok
    }
    const ctx = new ScriptContext({ vars, world: fw, commands }, fileBytes(scripts, target.file), target.file)
    ctx.start(entryOffset(scripts, target.file, target.entry))
    for (let frame = 0; frame < 2000; frame++) {
      if (!ctx.step(200_000)) return { applied, ended: true }
      fw.tick()
    }
    return { applied, ended: false }
  }

  it.each([
    ['엠라이트', EVENT_CMD.showMespritBoulderTuto, 5],
    ['유크시', EVENT_CMD.showUxieBoulderTuto, 6],
    ['아그놈', EVENT_CMD.showAzelfBoulderTuto, 7],
  ])('B6F 웅덩이 스크립트가 %s를 움직이고 지운다', (_name, kind, scriptID) => {
    const spec = TUTO_SPECS[kind]!
    step(MAP.b5f, triggers(kind)[0]!)
    runOut()
    clearNpcs()
    stand(MAP.b6f, 85, floorOf(MAP.b6f).offsetY, 52)
    expect(npcActors.byLocalID.has(spec.b6f)).toBe(true)

    const got = runPitScript(scriptID)
    expect(got.ended, '스크립트가 안 끝난다').toBe(true)
    expect(got.applied).toEqual([{ id: spec.b6f, ok: true }])
    expect(npcActors.byLocalID.has(spec.b6f), '다 사라지고 나서도 남았다').toBe(false)
  })

  it('안내를 안 보면 B6F에 그 셋이 없다 — 웅덩이 스크립트의 걸음이 허공에 걸린다', () => {
    stand(MAP.b6f, 85, floorOf(MAP.b6f).offsetY, 52)
    for (const kind of [
      EVENT_CMD.showUxieBoulderTuto, EVENT_CMD.showAzelfBoulderTuto, EVENT_CMD.showMespritBoulderTuto,
    ]) {
      expect(npcActors.byLocalID.has(TUTO_SPECS[kind]!.b6f)).toBe(false)
    }
    const got = runPitScript(6)
    // 서지는 않는다 — 대상 없는 걸음은 조용히 넘어가고 스크립트는 끝난다
    expect(got.ended).toBe(true)
    expect(got.applied).toEqual([{ id: TUTO_SPECS[EVENT_CMD.showUxieBoulderTuto]!.b6f, ok: false }])
  })
})
