// 물가시티 체육관의 톱니 (PARITY §7.12)
//
// ⚠️ 여기서 재는 것은 **표 둘이 서로 맞는가**와 **길이 실제로 열리는가**다.
// 여덟째 뱃지의 방이고 격자에 길이 없어서, 상자 번호가 하나만 어긋나도
// 그 방에서 한 걸음도 못 나간다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  SUNYSHORE_BLOCKED, SUNYSHORE_BUTTON, SUNYSHORE_ENTRY, SUNYSHORE_GEARS, SUNYSHORE_GYM_MAPS,
  SUNYSHORE_REGIONS, SUNYSHORE_ROOMS, SUNYSHORE_STATES, sunyshoreGearAngle, sunyshoreNextState,
  sunyshoreRoomOf, sunyshoreStateOnEnter,
} from '../engine/world/sunyshoreGym'
import {
  initSunyshoreGym, pressSunyshoreButton, sunyshoreBlockedAt, sunyshoreBusy, sunyshoreProps,
  sunyshoreState, sunyshoreTick, resetSunyshoreGym,
} from './sunyshoreGym'

const DATA = resolve(__dirname, '../../public/data')
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(DATA, name), 'utf8'))
const maps = (read('maps.json') as { maps: { events: number }[] }).maps
const events = (read('events.json') as {
  events: { triggers: { script: number; x: number; z: number }[]; warps: { z: number }[] }[]
}).events

/** 다 돌 때까지 굴린다 */
function settle(): number {
  let frames = 0
  while (sunyshoreBusy()) {
    sunyshoreTick(1 / 60)
    frames++
    if (frames > 500) throw new Error('톱니가 안 멈춘다')
  }
  return frames
}

describe('표가 서로 맞는가', () => {
  it('방 셋에 톱니가 3·6·13개다', () => {
    expect(SUNYSHORE_GEARS.map((g) => g.length)).toEqual([3, 6, 13])
    expect(SUNYSHORE_GYM_MAPS).toHaveLength(SUNYSHORE_ROOMS)
  })

  it('막는 상자가 12·18·40개다', () => {
    expect(SUNYSHORE_REGIONS.map((r) => r.length)).toEqual([12, 18, 40])
  })

  it('회전 상태 넷이 다 있고 상자 번호가 표 안에 든다', () => {
    // ⚠️ 번호가 하나만 넘쳐도 그 상태에서 막을 자리를 못 찾아 길이 뚫린다
    for (let room = 0; room < SUNYSHORE_ROOMS; room++) {
      const states = SUNYSHORE_BLOCKED[room]!
      expect(states, `${String(room)}번 방`).toHaveLength(SUNYSHORE_STATES)
      for (const list of states) {
        for (const index of list) {
          expect(index, `${String(room)}번 방`).toBeLessThan(SUNYSHORE_REGIONS[room]!.length)
        }
      }
    }
  })

  it('⚠️ 원작 표의 덧대기를 지우고 옮겼다', () => {
    // 2번 방의 상태 1·3이 아홉 개뿐인데 원작이 열한 칸을 쓰려고 앞 번호를
    // 두 번 더 적어 두었다. 겹치는 것은 뜻이 없다
    expect(SUNYSHORE_BLOCKED[1]![1]).toHaveLength(9)
    expect(SUNYSHORE_BLOCKED[1]![3]).toHaveLength(9)
    for (const room of SUNYSHORE_BLOCKED) {
      for (const list of room) expect(new Set(list).size).toBe(list.length)
    }
  })

  it('들어오는 문 z가 워프 표에 있다', () => {
    for (let room = 0; room < SUNYSHORE_ROOMS; room++) {
      const warps = events[maps[SUNYSHORE_GYM_MAPS[room]!]!.events]!.warps
      expect(
        warps.some((w) => w.z === SUNYSHORE_ENTRY[room]!.entranceZ),
        `${String(room)}번 방의 입구 z`,
      ).toBe(true)
    }
  })

  it('단추 트리거가 방마다 있다', () => {
    for (const map of SUNYSHORE_GYM_MAPS) {
      expect(events[maps[map]!.events]!.triggers.length).toBeGreaterThan(0)
    }
  })
})

describe('들어온 문이 처음 상태를 정한다', () => {
  beforeEach(() => { resetSunyshoreGym() })

  it('앞 방에서 걸어 들어오면 0이다', () => {
    for (let room = 0; room < SUNYSHORE_ROOMS; room++) {
      expect(sunyshoreStateOnEnter(room, SUNYSHORE_ENTRY[room]!.entranceZ)).toBe(0)
    }
  })

  it('⚠️ 뒤에서 돌아오면 방마다 2·1·0으로 선다', () => {
    // 되돌아 나가는 길이 그때 열려 있어야 한다
    expect(SUNYSHORE_ENTRY.map((e) => e.state)).toEqual([2, 1, 0])
    for (let room = 0; room < SUNYSHORE_ROOMS; room++) {
      expect(sunyshoreStateOnEnter(room, SUNYSHORE_ENTRY[room]!.entranceZ + 1))
        .toBe(SUNYSHORE_ENTRY[room]!.state)
    }
  })

  it('맵 번호로 방을 찾는다', () => {
    expect(sunyshoreRoomOf(154)).toBe(0)
    expect(sunyshoreRoomOf(156)).toBe(2)
    expect(sunyshoreRoomOf(122)).toBeNull()
  })
})

describe('단추가 상태를 돌린다', () => {
  beforeEach(() => { resetSunyshoreGym() })

  it('보통은 +1 · 거꾸로는 −1 · 두 배는 +2', () => {
    expect(sunyshoreNextState(3, SUNYSHORE_BUTTON.normal)).toBe(0)
    expect(sunyshoreNextState(0, SUNYSHORE_BUTTON.reverse)).toBe(3)
    expect(sunyshoreNextState(3, SUNYSHORE_BUTTON.double)).toBe(1)
  })

  it('⚠️ 상태는 누르는 순간 바뀐다 — 톱니가 다 돌기를 안 기다린다', () => {
    initSunyshoreGym(154, 14)
    expect(sunyshoreState()).toBe(0)
    pressSunyshoreButton(SUNYSHORE_BUTTON.normal)
    expect(sunyshoreState()).toBe(1)
    expect(sunyshoreBusy()).toBe(true)
  })

  it('90도가 열여섯 프레임 · 180도가 서른두 프레임이다', () => {
    initSunyshoreGym(154, 14)
    pressSunyshoreButton(SUNYSHORE_BUTTON.normal)
    expect(settle()).toBe(16)
    pressSunyshoreButton(SUNYSHORE_BUTTON.double)
    expect(settle()).toBe(32)
  })

  it('다 돌면 각이 상태에서 나오는 값과 딱 맞는다', () => {
    initSunyshoreGym(156, 25)
    pressSunyshoreButton(SUNYSHORE_BUTTON.normal)
    settle()
    const gears = SUNYSHORE_GEARS[2]!
    const props = sunyshoreProps()
    for (const [i, gear] of gears.entries()) {
      const want = sunyshoreGearAngle(gear, 1)
      const got = gear.vertical ? props[i]!.rotX : props[i]!.rotY
      expect(got, `톱니 ${String(i)}`).toBeCloseTo(want, 10)
    }
  })

  it('⚠️ 벽에 붙은 톱니는 x축으로 돈다', () => {
    initSunyshoreGym(155, 21)
    const props = sunyshoreProps()
    const gears = SUNYSHORE_GEARS[1]!
    for (const [i, gear] of gears.entries()) {
      if (gear.vertical) expect(props[i]!.rotY).toBe(0)
      else expect(props[i]!.rotX).toBe(0)
    }
  })
})

describe('회전이 길을 여닫는다', () => {
  beforeEach(() => { resetSunyshoreGym() })

  it('한 상자가 상태에 따라 막혔다 뚫린다', () => {
    // 1번 방의 상자 0은 상태 1·2에서 막히고 0·3에서는 안 막힌다
    initSunyshoreGym(154, 14)
    const [x, z] = SUNYSHORE_REGIONS[0]![0]!
    expect(sunyshoreBlockedAt(x, z)).toBeNull()
    pressSunyshoreButton(SUNYSHORE_BUTTON.normal)
    settle()
    expect(sunyshoreBlockedAt(x, z)).toBe(true)
  })

  it('상자 밖은 안 본다', () => {
    initSunyshoreGym(154, 14)
    expect(sunyshoreBlockedAt(0, 0)).toBeNull()
    expect(sunyshoreBlockedAt(31, 31)).toBeNull()
  })

  it('⚠️ 상태마다 막히는 자리가 실제로 다르다', () => {
    // 넷이 다 같으면 톱니가 돌아도 길이 안 바뀐다 — 표를 잘못 옮긴 자리다
    for (let room = 0; room < SUNYSHORE_ROOMS; room++) {
      const seen = new Set(SUNYSHORE_BLOCKED[room]!.map((l) => [...l].sort((a, b) => a - b).join(',')))
      expect(seen.size, `${String(room)}번 방`).toBe(SUNYSHORE_STATES)
    }
  })

  it('이 체육관이 아니면 아무것도 안 막는다', () => {
    expect(sunyshoreBlockedAt(5, 8)).toBeNull()
  })
})
