// 좌표 트리거가 워프 칸에 닿는 자리 (REPAIR §27)
//
// ⚠️ **여기가 게임 전체에서 스물다섯 칸이다.** 그 칸을 밟으면 「장면이 시작하는
// 것」과 「맵이 갈리는 것」이 같은 걸음에 걸린다. 우리 루프는 이동 뒤에 워프를
// 보는데 스크립트는 이동 앞에서 봐서, 한때 **워프가 한 프레임 빨랐다** — 맵이
// 갈린 뒤에도 앞 맵의 장면이 이어져 주인공을 벽 속에 세웠다(용식이 집).
//
// 그래서 두 가지를 잰다:
//  ① 자리 목록이 자료에서 그대로 나온다 — 새 자료가 들어와 자리가 늘면 여기서 선다
//  ② 그 자리 전부에서, 스크립트가 도는 동안에는 걸어서 워프가 안 걸린다
//
// 차례 자체(밟은 자리 → 워프)는 `scene/systemOrder.test`가 지킨다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, expect, beforeAll } from 'vitest'
import {
  scriptBridge, warpsOf, world, warpSystem,
  type EventFile, type MapHeader, type Warp,
} from './world'
import type { MapGrid } from './grid'
import { worldState } from '../../state/worldState'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
const maybe = withData('maps.json', 'events.json')

interface Site {
  map: number
  name: string
  /** 트리거 칸 */
  tx: number
  tz: number
  /** 그 칸이거나 그 옆의 워프 */
  warp: Warp
}

/** 좌표 트리거 칸이 워프 칸이거나 그 이웃인 자리를 자료에서 뽑는다 */
function sites(maps: MapHeader[], events: Record<string, EventFile>): Site[] {
  const out: Site[] = []
  for (const m of maps) {
    const f = events[String(m.events)]
    if (!f || f.warps.length === 0 || f.triggers.length === 0) continue
    const at = new Map(f.warps.map((w) => [`${String(w.x)},${String(w.z)}`, w]))
    for (const t of f.triggers) {
      for (let dx = 0; dx < t.width; dx++) {
        for (let dz = 0; dz < t.length; dz++) {
          const x = t.x + dx, z = t.z + dz
          // 밟은 칸과 **문의 앞 칸** 둘 다다 — 문은 밟는 칸이 아니라 앞 칸에서 걸린다
          for (const [ax, az] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            const w = at.get(`${String(x + ax)},${String(z + az)}`)
            if (!w) continue
            out.push({ map: m.id, name: m.name, tx: x, tz: z, warp: w })
            break
          }
        }
      }
    }
  }
  return out
}

maybe('트리거와 워프가 같은 걸음에 걸리는 자리', () => {
  let list: Site[] = []

  beforeAll(() => {
    world.maps = read('maps.json').maps as MapHeader[]
    world.events = read('events.json').events as Record<string, EventFile>
    list = sites(world.maps, world.events)
    // 판정에 지형은 안 쓴다. 워프 칸을 **문**으로 쳐서 제일 이르게 걸리게 둔다 —
    // 문은 밟는 칸이 아니라 앞 칸에서 걸리므로 이게 가장 빠듯한 조건이다
    world.grid = {
      behavior: () => 0,
      isBlocked: () => false,
    } as unknown as MapGrid
  })

  it('자리가 스물다섯 · 맵 열여섯이다', () => {
    // 늘었으면 새 자리를 이 시험으로 몰아 보고 늘린다 (`.audit/triggerWarpSweep.mjs`)
    expect(list).toHaveLength(25)
    expect(new Set(list.map((s) => s.map)).size).toBe(16)
    // 용식이 집 문 앞 — 실제로 맵뚫이 났던 그 칸이 목록에 있다
    expect(list.some((s) => s.map === 411 && s.tx === 105 && s.tz === 876)).toBe(true)
  })

  it('스크립트가 도는 동안에는 그 스물다섯 칸 어디서도 워프가 안 걸린다', () => {
    for (const s of list) {
      world.mapId = s.map
      world.armed = true
      world.pending = null
      worldState.player.position.set(s.tx + 0.5, 0, s.tz + 0.5)
      worldState.player.facing = 0

      scriptBridge.running = () => true
      warpSystem.fixedUpdate()
      expect(world.pending, `${String(s.map)} ${s.name} ${String(s.tx)},${String(s.tz)}`).toBeNull()
    }
    scriptBridge.running = null
  })

  it('스크립트가 없으면 그 칸의 워프는 그대로 걸린다 — 막은 것이 문이 아니다', () => {
    // 밟고 선 칸에 워프가 있는 자리만 본다. 문(앞 칸)은 밀고 있어야 걸리는데
    // 그 입력은 여기서 안 만든다
    const onTile = list.filter((s) => s.warp.x === s.tx && s.warp.z === s.tz)
    expect(onTile.length).toBeGreaterThan(0)
    scriptBridge.running = () => false
    for (const s of onTile) {
      world.mapId = s.map
      world.armed = true
      world.pending = null
      worldState.player.position.set(s.tx + 0.5, 0, s.tz + 0.5)
      warpSystem.fixedUpdate()
      // 목적지가 없는 더미 워프가 여섯 있다 — 그건 안 걸리는 게 맞다
      const dummy = warpsOf(s.warp.to).length === 0
      if (!dummy) {
        expect(world.pending, `${String(s.map)} ${String(s.tx)},${String(s.tz)}`).not.toBeNull()
      }
    }
    scriptBridge.running = null
  })
})
