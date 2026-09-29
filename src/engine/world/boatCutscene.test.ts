import { describe, expect, it } from 'vitest'
import {
  BOAT_DIR, boatFieldStart, boatFieldTick, boatTravelStart, boatTravelTick, movesOnField,
} from './boatCutscene'

const FX = 4096

describe('배로 건너가기 — 필드 (boat_cutscene.c)', () => {
  it('운하시티를 떠나는 배는 25칸을 가고 14칸째에 다리가 들린다', () => {
    const b = boatFieldStart(BOAT_DIR.northToSouth)
    let bridgeAt = -1, fadeAt = -1
    let bridgeDoneAt = Infinity
    for (let t = 1; t < 2000 && fadeAt < 0; t++) {
      const ev = boatFieldTick(b, t >= bridgeDoneAt)
      if (ev.includes('bridge')) { bridgeAt = t; bridgeDoneAt = t + 130 }
      if (ev.includes('fadeOut')) fadeAt = t
    }
    // ¼유닛으로 23틱(5.75유닛) — 24번째 틱에 빨라진 1¼유닛을 그 틱부터 더한다(`speed += FX32_ONE` 뒤 `distanceTraveled += speed`).
    // 14칸(224유닛)은 23 + ⌈218.25 / 1.25⌉ = 198틱째다
    expect(bridgeAt).toBe(23 + Math.ceil((224 - 5.75) / 1.25))
    // 다리가 다 들리고(130프레임) **배도 25칸(400유닛)을 가야** 닫는다 — 이 배는 다리가 먼저 끝난다
    expect(fadeAt).toBe(Math.max(bridgeAt + 130, 23 + Math.ceil((400 - 5.75) / 1.25)))
    // ⚠️ 배는 빨라지기 **전** 빠르기로 옮기고 간 거리는 **뒤** 빠르기로 센다 — 24번째 틱의 1유닛만큼 배가 덜 간다
    expect(b.boat[1]).toBe(-(b.traveled - FX))
    // 카메라는 x로 2칸 비켜 섰다
    expect(b.camera[0]).toBe(32 * FX)
  })

  it('선단시티를 떠나는 배는 12칸을 가고 다리가 없다', () => {
    const b = boatFieldStart(BOAT_DIR.westToEast)
    let fadeAt = -1
    for (let t = 1; t < 2000 && fadeAt < 0; t++) if (boatFieldTick(b, false).includes('fadeOut')) fadeAt = t
    expect(fadeAt).toBe(23 + Math.ceil((192 - 5.75) / 1.25))
    expect(b.boat[0]).toBe(b.traveled - FX)
    expect(b.camera[1]).toBe(Math.min(fadeAt, 96) * FX / 2)
  })

  it('섬에서 돌아오는 배는 필드 장면 없이 곧바로 닫는다', () => {
    expect(movesOnField(BOAT_DIR.southToNorth)).toBe(false)
    expect(movesOnField(BOAT_DIR.eastToWest)).toBe(false)
    expect(boatFieldTick(boatFieldStart(BOAT_DIR.southToNorth), false)).toEqual(['fadeOut'])
  })
})

describe('배로 건너가기 — 배 앱 (canalave_ship.c)', () => {
  it('첫 틱에 소리 · 첫 애니가 89프레임에 닿으면 닫고 · 닫히면 끝', () => {
    const t = boatTravelStart([90, 90, 90, 90])
    const log: string[] = []
    let fade = -1
    for (let i = 0; i < 200; i++) {
      const ev = boatTravelTick(t, fade >= 0 && i >= fade + 6)
      for (const e of ev) log.push(`${String(i)}:${e}`)
      if (ev.includes('fadeOut')) fade = i
      if (ev.includes('done')) break
    }
    expect(log).toEqual(['0:se', '89:fadeOut', '95:done'])
    expect(t.frames).toEqual([89, 89, 89, 89])
  })
})
