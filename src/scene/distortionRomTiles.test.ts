// 깨어진 세계의 사건표·스크립트 좌표는 **세계 칸**이다 (REPAIR §90)
//
// 원작은 그 세계 층 열한 개를 한 좌표계에 둔다 — 사건표(`events_distortion_world_1f.json`)의 1F 차원문
// 간판이 (55,39)이고, B7F 태홍 뒤 장면이 `GetPlayerMapPos`를 86·74와 견준다(`_b7f.s` 62–107). 우리 층
// 격자는 0에서 시작하므로 **읽을 때 층 오프셋을 빼고, 스크립트에 줄 때 더한다.**
//
// 오프셋은 롬의 층 자료(`distortion.json`)에서 온다 — 1F 21·10 · B7F 74·32. 시험은 그 자료를 그대로 읽고,
// 격자로 「그 칸이 서거나 막힌 칸인가」까지 잰다.
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildCommands } from '../engine/script/commands'
import { ScriptContext } from '../engine/script/context'
import { parseScriptMeta } from '../engine/script/data'
import { fieldScripts, signAt } from '../engine/script/field'
import { VarStore } from '../engine/script/vars'
import { FieldWorld } from '../engine/script/world'
import { DIR } from '../engine/script/movement'
import {
  localToRom, romToLocal, signsOf, warpIndexAt, warpsOf, world as mapWorld,
  type EventFile, type MapHeader,
} from '../engine/map/world'
import { installNodeAssets, withData } from '../data/romData.testkit'
import { installFieldServices } from './fieldServices'
import { distortionPreload } from './distortionCore'

const DATA = resolve(__dirname, '../../public/data')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
const maybe = withData('scripts.json', 'events.json', 'maps.json', 'distortion.json')

const F1 = 573
const B7F = 581
/** 떡잎마을 — 깨어진 세계 밖 */
const TWINLEAF = 411
/** 격자에서 북쪽을 보는 사분면 (`quarterOf`: 0 +z · 1 +x · 2 −z · 3 −x) */
const FACING_NORTH = 2

maybe('깨어진 세계의 롬 칸', () => {
  const meta = parseScriptMeta(read('scripts.json'))
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  const events = (read('events.json') as { events: Record<string, EventFile> }).events

  let restore: (() => void) | null = null
  let stopServices: (() => void) | null = null
  beforeAll(async () => {
    restore = installNodeAssets()
    mapWorld.maps = maps
    mapWorld.events = events
    fieldScripts.vars = new VarStore()
    stopServices = installFieldServices('ko')
    await distortionPreload()
  })
  afterAll(() => {
    stopServices?.()
    restore?.()
  })

  it('1F 차원문 간판 (55,39)은 우리 칸 (34,29) — 도착 칸 (34,30)에서 북쪽을 보면 닿는다', () => {
    expect(signsOf(F1).map((s) => [s.x, s.z])).toEqual([[34, 29]])
    expect(signAt(F1, 34, 29, FACING_NORTH, fieldScripts.vars)?.script).toBe(2)
    // 롬 칸 그대로는 우리 격자에서 허공이다 — 거기서는 아무것도 안 걸린다
    expect(signAt(F1, 55, 39, FACING_NORTH, fieldScripts.vars)).toBeNull()
  })

  it('1F의 워프 (31,53)도 옮기고, 스크립트가 롬 칸으로 물으면 그 워프를 찾는다', () => {
    expect(warpsOf(F1).map((w) => [w.x, w.z])).toEqual([[10, 43]])
    // `MapHeaderData_GetIndexOfWarpEventAtPos` — 스크립트는 롬 칸을 준다
    expect(warpIndexAt(F1, 31, 53)).toBe(0)
    expect(warpIndexAt(F1, 10, 43)).toBe(-1)
  })

  it('B7F: 우리 칸 (12,42)는 롬 칸 (86,74) — 태홍 장면이 견주는 그 칸이다', () => {
    expect(localToRom(B7F, 12, 42)).toEqual({ x: 86, z: 74 })
    expect(romToLocal(B7F, 86, 74)).toEqual({ x: 12, z: 42 })
  })

  it('`GetPlayerMapPos`가 B7F에서 세계 칸을 준다', () => {
    const vars = new VarStore()
    const world = new FieldWorld({
      vars, input: () => ({ pressed: false, held: false }), movements: meta.movements, services: {},
    })
    world.player = { x: 12, z: 42, visible: true, dir: DIR.north }
    const op = (name: string): number => {
      const at = meta.commands.findIndex((c) => c?.name === name)
      if (at < 0) throw new Error(`${name} 명령이 표에 없다`)
      return at
    }
    const get = op('GetPlayerMapPos')
    const end = op('End')
    const bytes = new Uint8Array([get & 0xff, get >> 8, 0x04, 0x80, 0x05, 0x80, end & 0xff, end >> 8])
    const { map } = buildCommands(meta.commands)
    mapWorld.mapId = B7F
    const ctx = new ScriptContext({ vars, world, commands: map }, bytes, 0)
    ctx.start(0)
    ctx.step(100)
    expect([vars.get(0x8004), vars.get(0x8005)]).toEqual([86, 74])
  })

  it('깨어진 세계 밖은 그대로다', () => {
    expect(localToRom(TWINLEAF, 5, 7)).toEqual({ x: 5, z: 7 })
    expect(romToLocal(TWINLEAF, 5, 7)).toEqual({ x: 5, z: 7 })
    const raw = events[String(maps[TWINLEAF]!.events)]!
    expect(signsOf(TWINLEAF)).toBe(raw.signs)
  })
})

describe('층 자료가 오기 전', () => {
  it('원점을 모르면 옮기지 않는다', () => {
    // `romOrigin.of`가 없거나 null을 주면 사건표를 그대로 쓴다 — 늦게 와도 그때부터 옮긴다
    expect(romToLocal(9999, 3, 4)).toEqual({ x: 3, z: 4 })
  })
})
