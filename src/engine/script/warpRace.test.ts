// `Warp`는 새 맵이 설 때까지 선다 (`ScrCmd_Warp` — `scrcmd.c`)
//
// ⚠️ **맵 교체는 씬이 몇 프레임 늦게 소비한다** (`MapStreamer`의 `world.pending`). 그 틈에 스크립트가
// 끝나 버리면 **떠나는 맵의** `OnFrame` 표가 방금 세운 변수를 읽고 엉뚱한 장면을 건다. 실측(e2e ㉖
// 10-06 · 10-07 두 판): 모래시티가 `VAR_SANDGEM_TOWN_STATE=1`을 세우고 연구소로 `Warp`한 틈에
// `OnFrame_ExitLab`(상점 · 센터 안내 — 주인공 동쪽 19칸)이 걸려, 그 걸음이 연구소 안에서 돌아 주인공이
// 벽 밖 (26,7)에 섰다.
//
// 여기서는 진짜 롬 스크립트로 그 틈을 일부러 길게 벌린다 — 씬이 교체를 안 소비하는 프레임을 서른 번 돌린다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, expect, it } from 'vitest'
import type { MapHeader, EventFile } from '../map/world'
import { mapById, world as mapWorld } from '../map/world'
import { worldState } from '../../state/worldState'
import { buildCommands } from './commands'
import { parseScriptMeta } from './data'
import { abortScript, enterMap, fieldScripts, makeWorld, scriptBusy, scriptSystem, start } from './field'
import { VarStore } from './vars'
import { withData } from '../../data/romData.testkit'
import { allDoneServices } from './services.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.bin', 'events.json', 'maps.json')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

const SANDGEM = 418
const SANDGEM_LAB = 422
/** `scripts_sandgem_town.s`의 둘째 진입점 — `SandgemTown_CoordEvent_CounterpartLeadToLab` */
const LEAD_TO_LAB = 2
/**
 * `VAR_SANDGEM_TOWN_STATE` — 1이면 모래시티 표가 `OnFrame_ExitLab`을 건다. `generated/vars_flags.txt`의 4224째 줄이고,
 * 4186째 줄 `VAR_ETERNA_GYM_FLOWER_CLOCK_STATE`가 16459다(`world/eternaGym`) — 사이에 번호를 건너뛰는 줄이 없다
 */
const VAR_SANDGEM_TOWN_STATE = 16_497
/** 씬이 교체를 안 소비하는 프레임 수. 실측 경합은 6~7틱이면 터졌다 */
const HELD = 30

maybe('스크립트 워프가 맵 교체를 기다린다', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const events = (read('events.json') as { events: Record<string, EventFile> }).events
  const yieldToLoop = async (): Promise<void> => new Promise((done) => { setImmediate(done) })

  beforeEach(() => {
    mapWorld.maps = maps
    mapWorld.events = events
    mapWorld.pending = null
    fieldScripts.data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
    fieldScripts.commands = buildCommands(meta.commands)
    fieldScripts.vars = new VarStore()
    fieldScripts.services = allDoneServices
    fieldScripts.world = makeWorld(fieldScripts.vars, [], meta.movements)
    // 경합은 세이브 값이 부은 뒤의 일이다 — 그전에는 표를 아예 안 본다
    fieldScripts.varsReady = true
    fieldScripts.ctx = null
    fieldScripts.lastError = null
    worldState.input.interact = false
    worldState.input.move.set(0, 0)
  })

  it('모래시티 → 연구소: 교체가 늦어도 떠나는 맵의 OnFrame_ExitLab이 안 걸린다', async () => {
    const header = mapById(SANDGEM)!
    mapWorld.mapId = SANDGEM
    enterMap(SANDGEM)
    await yieldToLoop()
    // 좌표 사건 (164, 842~847)을 밟은 자리다. 스크립트가 `GetPlayerMapPos`의 z로 갈래를 고른다
    const me = fieldScripts.world!.player!
    me.x = 164.5
    me.z = 845.5
    expect(start(LEAD_TO_LAB, header.scripts)).toBe(true)

    // 연구소로 가는 `Warp`까지 몬다. 대사는 A로 넘긴다
    let frames = 0
    for (; frames < 6_000 && mapWorld.pending === null && scriptBusy(); frames++) {
      worldState.input.interact = frames % 2 === 0
      scriptSystem.fixedUpdate()
      if (frames % 8 === 0) await yieldToLoop()
    }
    expect(mapWorld.pending?.to, '연구소로 가는 Warp에 닿지 않았다').toBe(SANDGEM_LAB)
    // 경합의 전제 — 표가 볼 변수가 이미 1이다
    expect(fieldScripts.vars.get(VAR_SANDGEM_TOWN_STATE)).toBe(1)
    const lead = fieldScripts.ctx
    expect(lead).not.toBeNull()

    // 씬이 교체를 안 소비한다 — 그동안 떠나는 맵에서 스크립트가 끝나거나 다른 것이 걸리면 안 된다
    for (let f = 0; f < HELD; f++) {
      worldState.input.interact = f % 2 === 0
      scriptSystem.fixedUpdate()
      if (f % 8 === 0) await yieldToLoop()
    }
    expect(fieldScripts.ctx, 'Warp 뒤에 스크립트가 맵 교체를 안 기다렸다').toBe(lead)
    expect(mapWorld.pending?.to).toBe(SANDGEM_LAB)

    // 씬이 교체를 마친다 — 그러면 같은 스크립트가 새 맵에서 `FadeScreenIn`부터 이어 끝난다
    mapWorld.pending = null
    mapWorld.mapId = SANDGEM_LAB
    enterMap(SANDGEM_LAB)
    await yieldToLoop()
    for (let f = 0; f < 600 && fieldScripts.ctx === lead; f++) {
      scriptSystem.fixedUpdate()
      if (f % 8 === 0) await yieldToLoop()
    }
    expect(fieldScripts.ctx).not.toBe(lead)
    expect(fieldScripts.lastError).toBeNull()
    abortScript()
  })
})
