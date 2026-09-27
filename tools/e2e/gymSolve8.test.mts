// 여덟째 체육관 풀이를 **제품의 톱니 표로** 돌려 본다 (`gymSolve8.mjs`)
//
// ⚠️ **걸음을 재는 시험이 아니다.** 실제로 톱니가 돌고 길이 바뀌는지는 탐침이 잰다. 여기서
// 잠그는 것은 「구운 격자 + 제품 표로 풀면 방 셋이 다 풀린다」다
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SUNYSHORE_BUTTON, SUNYSHORE_GYM_MAPS, sunyshoreBlocked, sunyshoreNextState, sunyshoreStateOnEnter,
} from '../../src/engine/world/sunyshoreGym'
import { gridOf, matrixOf, missingData } from './route.mjs'
import { solveSunyshore } from './gymSolve8.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const EVENTS = resolve(ROOT, 'raw/decomp/res/field/events')
const HAVE = existsSync(EVENTS) && missingData().length === 0

interface Events {
  object_events: { x: number, z: number }[]
  coord_events: { x: number, z: number, script: number }[]
  warp_events: { x: number, z: number }[]
}
const eventsOf = (room: number): Events =>
  JSON.parse(readFileSync(resolve(EVENTS, `events_sunyshore_city_gym_room_${String(room + 1)}.json`), 'utf8')) as Events

/**
 * 스크립트 번호 → 단추 (`scripts_sunyshore_city_gym_room_{1,2,3}.s`의 항목 차례).
 * 1번 방 2 보통 · 2번 방 2 보통(아래) · 3 거꾸로(위) · 3번 방 2 보통(위) · 3 두 배(아래)
 */
const BUTTON_OF: readonly Record<number, number>[] = [
  { 2: SUNYSHORE_BUTTON.normal },
  { 2: SUNYSHORE_BUTTON.normal, 3: SUNYSHORE_BUTTON.reverse },
  { 2: SUNYSHORE_BUTTON.normal, 3: SUNYSHORE_BUTTON.double },
]

function roomSetup(room: number) {
  const ev = eventsOf(room)
  const grid = gridOf(matrixOf(SUNYSHORE_GYM_MAPS[room]!))
  const people = new Set(ev.object_events.map((o) => `${String(o.x)},${String(o.z)}`))
  const buttons = new Map(ev.coord_events.map((c) => [`${String(c.x)},${String(c.z)}`, BUTTON_OF[room]![c.script]!]))
  const blocked = (state: number, x: number, z: number): boolean =>
    grid.blocked(x, z) || people.has(`${String(x)},${String(z)}`) || sunyshoreBlocked(room, state, x, z) === true
  return { ev, buttons, blocked }
}

describe.skipIf(!HAVE)('물가 체육관 풀이 — 방 셋', () => {
  it('1번 방 — 문 (8,14)에서 2번 방 계단 (8,2)까지', () => {
    const { buttons, blocked } = roomSetup(0)
    const plan = solveSunyshore({
      start: { x: 8, z: 14 }, state: sunyshoreStateOnEnter(0, 14), blocked, buttons,
      next: sunyshoreNextState, goal: (x: number, z: number) => x === 8 && z === 2,
    })
    expect(plan).not.toBeNull()
    expect(plan!.presses).toBeGreaterThan(0)
  })

  it('2번 방 — (9,21)에서 3번 방 계단 (9,2)까지', () => {
    const { buttons, blocked } = roomSetup(1)
    const plan = solveSunyshore({
      start: { x: 9, z: 21 }, state: sunyshoreStateOnEnter(1, 21), blocked, buttons,
      next: sunyshoreNextState, goal: (x: number, z: number) => x === 9 && z === 2,
    })
    expect(plan).not.toBeNull()
    expect(plan!.presses).toBeGreaterThan(0)
  })

  it('3번 방 — (11,25)에서 전진 앞 (11,4)까지', () => {
    const { buttons, blocked } = roomSetup(2)
    const plan = solveSunyshore({
      start: { x: 11, z: 25 }, state: sunyshoreStateOnEnter(2, 25), blocked, buttons,
      next: sunyshoreNextState, goal: (x: number, z: number) => x === 11 && z === 4,
    })
    expect(plan).not.toBeNull()
    expect(plan!.presses).toBeGreaterThan(0)
  })

  it('단추 위에서는 다시 안 눌린다 — 들어설 때만 회전 상태가 바뀐다', () => {
    const buttons = new Map([['1,0', SUNYSHORE_BUTTON.normal]])
    // 상태 1에서만 (2,0)이 열린다 — 단추를 한 번 밟고 곧장 지나가야 한다
    const blocked = (s: number, x: number, z: number) => z !== 0 || x < 0 || x > 2 || (x === 2 && s !== 1)
    const plan = solveSunyshore({
      start: { x: 0, z: 0 }, state: 0, blocked, buttons, next: sunyshoreNextState,
      goal: (x: number) => x === 2,
    })
    expect(plan!.steps.map((s) => s.key)).toEqual(['ArrowRight', 'ArrowRight'])
    expect(plan!.steps[0]).toMatchObject({ press: SUNYSHORE_BUTTON.normal, state: 1 })
  })
})
