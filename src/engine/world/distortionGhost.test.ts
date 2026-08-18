// 소품 보임새 (PARITY §6.10) — `InitActiveGhostPropManager` · `HideGhostPropGroup`
//
// ⚠️ 이 시험이 잡는 것은 **처음 상태를 뒤집는 것**이다. 원작은
// `hiddenGhostPropGroups = ~defaultVisiblePropGroups`로 넣는데, 우리는 한동안
// 0으로 뒀다 — 즉 스물네 무리가 처음부터 전부 보이는 셈이었고, 그래서 밟으면
// 나타나야 할 발판이 「이미 서 있거나 아무 일도 안 일어나는」 것으로 보였다
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { distortionSchema, type DistortionData } from '../../data/schema'
import { withDistortionTables } from '../../data/distortionFile'
import {
  groupHidden, hideGroup, initialHiddenGroups, MAX_GHOST_PROP_GROUPS, newDistortionState, showGroup,
} from './distortion'

const FILE = 'public/data/distortion.json'
const real = existsSync(FILE)
const data: DistortionData | null = real
  ? withDistortionTables(distortionSchema.parse(JSON.parse(readFileSync(FILE, 'utf8'))))
  : null

describe('유령 소품 무리', () => {
  it('처음 숨는 무리는 보이는 무리의 뒤집음이다', () => {
    // 0번만 보이면 1~23이 숨는다
    expect(initialHiddenGroups(0b1)).toBe(0xfffffe)
    // 아무것도 안 보이면 스물넷이 다 숨는다
    expect(initialHiddenGroups(0)).toBe(0xffffff)
  })

  it('24비트를 넘어가지 않는다 — u32를 그대로 뒤집으면 안 된다', () => {
    const hidden = initialHiddenGroups(0)
    expect(hidden).toBeLessThan(1 << MAX_GHOST_PROP_GROUPS)
    expect(hidden).toBeGreaterThanOrEqual(0)
  })

  it('켜고 끄는 것이 자리를 안 흘린다', () => {
    const s = newDistortionState()
    s.hiddenGroups = initialHiddenGroups(0b101)
    expect(groupHidden(s, 0)).toBe(false)
    expect(groupHidden(s, 1)).toBe(true)
    expect(groupHidden(s, 2)).toBe(false)
    hideGroup(s, 0)
    expect(groupHidden(s, 0)).toBe(true)
    expect(groupHidden(s, 2)).toBe(false)
    showGroup(s, 1)
    expect(groupHidden(s, 1)).toBe(false)
  })

  describe.runIf(real)('실제 자료', () => {
    it('층마다 처음 보이는 소품이 하나라도 있다 — 다 숨으면 길이 안 보인다', () => {
      for (const map of data!.maps) {
        const hidden = initialHiddenGroups(map.visibleGroups)
        const shown = map.props.filter((p) => (hidden & (1 << p.group)) === 0)
        expect(shown.length, `맵 ${String(map.map)}`).toBeGreaterThan(0)
      }
    })

    // ⚠️ **맵 581(B6F)의 유일한 방아쇠는 소품이 없는 무리 0을 가리킨다.**
    // 원작 자료가 그렇다 — 밟아도 아무것도 안 나타난다. 고치지 않고 그대로 둔다
    // (승강 경로 20·21이 안 쓰이는 것과 같은 갈래다)
    it('방아쇠가 가리키는 무리에 소품이 있다 — 빈 방아쇠 하나만 빼고', () => {
      const empty: string[] = []
      for (const map of data!.maps) {
        const groups = new Set(map.props.map((p) => p.group))
        for (const t of map.triggers) {
          if (!groups.has(t.group)) empty.push(`${String(map.map)}:${String(t.group)}`)
        }
      }
      expect([...new Set(empty)]).toEqual(['581:0'])
    })

    it('소품 무리 번호가 스물넷 안이다', () => {
      for (const map of data!.maps) {
        for (const p of map.props) expect(p.group).toBeLessThan(MAX_GHOST_PROP_GROUPS)
      }
    })

    // 이 수가 0이 되면 처음 상태를 다시 뒤집어 버린 것이다 — 그때 화면에서는
    // 「나타나야 할 블록이 이미 다 서 있는」 것으로 보인다.
    //
    // 582(기라티나 방)의 여섯은 방아쇠가 아니라 **사건 명령**이 세운다
    // (`showGiratinaRoomPlatforms`, 무리 1~3을 48프레임 간격으로)
    it('밟아야 나타나는 블록이 네 층에 42개 있다', () => {
      const dark = new Map<number, number>()
      for (const map of data!.maps) {
        const hidden = initialHiddenGroups(map.visibleGroups)
        const n = map.props.filter((p) => (hidden & (1 << p.group)) !== 0).length
        if (n > 0) dark.set(map.map, n)
      }
      expect([...dark.entries()]).toEqual([[576, 23], [577, 5], [582, 6], [583, 8]])
    })
  })
})

// 기라티나 방 발판이 서는 순서 (`EventCmdShowGiratinaRoomPlatforms`).
//
// ⚠️ 이 명령 둘이 한동안 「연출」로 분류돼 아무 일도 안 했다. 그 방의 숨은
// 소품 여섯이 영영 안 나타나서 들어가면 못 나왔다
describe('기라티나 방 발판', () => {
  it('세우는 무리는 1·2·3 셋이고 거둘 때는 거꾸로다', async () => {
    const mod = await import('../../scene/distortion')
    // 모듈 안의 상수를 밖에서 못 보므로 자료로 되짚는다 — 그 방(582)의
    // 소품 무리가 실제로 1~3 안에 든다
    if (!real) return
    const room = data!.maps.find((m) => m.map === 582)!
    const hidden = initialHiddenGroups(room.visibleGroups)
    const dark = new Set(room.props.filter((p) => (hidden & (1 << p.group)) !== 0)
      .map((p) => p.group))
    expect([...dark].sort((a, b) => a - b)).toEqual([1, 2, 3])
    expect(typeof mod.distortionGhostTick).toBe('function')
    expect(mod.distortionGhostRunning()).toBe(false)
  })
})
