// 레지 유적의 점 일곱 (`ActivateRegiRuinsDot` · REPAIR §136)
//
// **우리가 판정할 것은 하나도 없다.** 점을 밟으면 원작 스크립트가 제 자리를 `GetPlayerMapPos`로 읽어 명령에 넘기고,
// 일곱이 다 서면 전당등록을 물어 석상을 깨운다(270). 여기서 재는 것은 **그 스크립트가 실제로 270까지 가는가**다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta, resolveScript } from './data'
import { VarStore } from './vars'
import { FieldWorld } from './world'
import { DIR } from './movement'
import { world as mapWorld, type EventFile, type MapHeader } from '../map/world'
import { DATA, withData } from '../../data/romData.testkit'
import { stubFieldMoves, stubLabels, stubParty, stubTrainerInfo } from './services.testkit'
import { FLAG_GAME_COMPLETED } from '../world/siwon'

const maybe = withData('scripts.json', 'scripts.bin', 'maps.json', 'events.json')

/** `MAP_HEADER_IRON_RUINS` · `VAR_IRON_RUINS_STATE` */
const IRON_RUINS = 588
const VAR_IRON_RUINS_STATE = 16489

maybe('무쇠 유적 — 점 일곱', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)
  const maps = (JSON.parse(readFileSync(resolve(DATA, 'maps.json'), 'utf8')) as { maps: MapHeader[] }).maps
  const events = (JSON.parse(readFileSync(resolve(DATA, 'events.json'), 'utf8')) as
    { events: Record<string, EventFile> }).events
  const header = maps[IRON_RUINS]!
  const dots = events[String(header.events)]!.triggers

  /** 점 하나를 밟는다 — 그 칸에 세우고 좌표 이벤트의 스크립트를 끝까지 돌린다 */
  function step(vars: VarStore, at: { x: number; z: number; script: number }): void {
    const world = new FieldWorld({
      vars, input: () => ({ pressed: true, held: true }), movements: meta.movements,
      services: { party: stubParty, labels: stubLabels, fieldMoves: stubFieldMoves, trainerInfo: stubTrainerInfo },
    })
    world.player = { x: at.x, z: at.z, visible: true, dir: DIR.north }
    mapWorld.mapId = IRON_RUINS
    const target = resolveScript(meta, at.script, header.scripts)
    if (!target) throw new Error(`스크립트 ${String(at.script)}를 못 찾았다`)
    const ctx = new ScriptContext({ vars, world, commands: map }, fileBytes(data, target.file), target.file)
    ctx.start(entryOffset(data, target.file, target.entry))
    for (let frame = 0; frame < 2000; frame++) {
      if (!ctx.step(200_000)) break
      world.tick()
    }
    // 점마다의 지역 변수는 맵을 떠날 때 비는 값이다 — 한 칸씩 밟는 시험이라 다음 점을 위해 비운다
    vars.clearMapLocals()
  }

  it('점 일곱 자리가 롬 표와 같다', () => {
    expect(dots.map((d) => `${String(d.x)},${String(d.z)}`).sort()).toEqual(
      ['10,7', '4,7', '5,5', '5,9', '7,7', '9,5', '9,9'])
  })

  it('일곱을 다 밟으면 석상이 깨어난다 (270)', () => {
    const vars = new VarStore()
    vars.setFlag(FLAG_GAME_COMPLETED)
    for (const [i, d] of dots.entries()) {
      step(vars, d)
      const state = vars.get(VAR_IRON_RUINS_STATE)
      if (i < dots.length - 1) expect(state, `${String(i + 1)}번째 점 뒤`).toBeLessThan(0x7f + 1)
    }
    expect(vars.get(VAR_IRON_RUINS_STATE)).toBe(270)
    mapWorld.mapId = -1
  })

  it('전당등록 전이면 260에서 멈춘다 — 석상은 안 깨어난다', () => {
    const vars = new VarStore()
    for (const d of dots) step(vars, d)
    expect(vars.get(VAR_IRON_RUINS_STATE)).toBe(260)
    mapWorld.mapId = -1
  })
})
