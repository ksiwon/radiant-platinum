// 자전거 단 바꾸기 (`actor/bikeGear`)
//
// 재는 것 셋: **누를 때마다 한 번**인가(누르고 있으면 매 틱 뒤집히면 안 된다),
// **타고 있을 때만** 먹는가, 그리고 바뀐 단이 **소리까지** 원작 차례인가
// (원작이 3단에 `GEAR2`를 낸다 — 이름만 보면 거꾸로다).
import { beforeEach, describe, expect, it } from 'vitest'
import { attachKeyboard, setGameActive, setUiCapture } from '../input/keys'
import { worldState } from '../../state/worldState'
import { SFX } from '../audio/sfx'
import { BIKE_GEAR } from './bike'
import { bikeGearSystem, resetBikeGearInput } from './bikeGear'
import { drainBikeCues } from './bikeTerrain'

// 노드에는 DOM 생성자가 없다 — `typingInto`가 이름만 본다 (`input/restoreGate.test`와 같다)
const g = globalThis as Record<string, unknown>
g.HTMLElement ??= class {}
g.HTMLInputElement ??= class {}
g.HTMLTextAreaElement ??= class {}

function fakeWindow() {
  const listeners = new Map<string, ((e: unknown) => void)[]>()
  return {
    addEventListener(type: string, fn: (e: unknown) => void) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn])
    },
    fire(type: string, e: unknown) {
      for (const fn of listeners.get(type) ?? []) fn(e)
    },
  }
}

const win = fakeWindow()
attachKeyboard(win as unknown as Window)

const down = (): void => {
  win.fire('keydown', { code: 'KeyB', target: null, preventDefault: () => {} })
}
const up = (): void => {
  win.fire('keyup', { code: 'KeyB', target: null, preventDefault: () => {} })
}

describe('자전거 단 바꾸기', () => {
  beforeEach(() => {
    up()
    setGameActive(true)
    setUiCapture(false)
    resetBikeGearInput()
    drainBikeCues()
    worldState.restoring = false
    worldState.player.cycling = true
    worldState.player.bikeGear = BIKE_GEAR.third
    worldState.player.pedalling = 5
  })

  it('원작의 초기값은 3단이다', () => {
    // `PlayerData_Init`이 `cyclingGear = 0`으로 연다. 그래서 새 게임의 자전거는
    // **전속력이 안 나고**, 진흙 비탈을 만나면 B를 눌러야 한다
    expect(BIKE_GEAR.third).toBe(0)
    expect(BIKE_GEAR.fourth).toBe(1)
  })

  it('누를 때마다 한 번씩 오간다', () => {
    down()
    bikeGearSystem.fixedUpdate()
    expect(worldState.player.bikeGear).toBe(BIKE_GEAR.fourth)
    // 누르고 있는 동안은 더 안 바뀐다 — 매 틱 뒤집히면 단을 고를 수가 없다
    bikeGearSystem.fixedUpdate()
    bikeGearSystem.fixedUpdate()
    expect(worldState.player.bikeGear).toBe(BIKE_GEAR.fourth)
    up()
    bikeGearSystem.fixedUpdate()
    down()
    bikeGearSystem.fixedUpdate()
    expect(worldState.player.bikeGear).toBe(BIKE_GEAR.third)
  })

  it('단을 바꾸면 속도가 처음으로 돌아간다', () => {
    down()
    bikeGearSystem.fixedUpdate()
    expect(worldState.player.pedalling).toBe(0)
  })

  it('타고 있을 때만 먹는다', () => {
    worldState.player.cycling = false
    down()
    bikeGearSystem.fixedUpdate()
    expect(worldState.player.bikeGear).toBe(BIKE_GEAR.third)
    expect(drainBikeCues()).toEqual([])
  })

  it('소리가 원작 차례다 — 3단이 `GEAR2`다', () => {
    down()
    bikeGearSystem.fixedUpdate()
    expect(drainBikeCues()).toEqual([SFX.BIKE_GEAR_UP])
    up()
    bikeGearSystem.fixedUpdate()
    down()
    bikeGearSystem.fixedUpdate()
    expect(drainBikeCues()).toEqual([SFX.BIKE_GEAR_DOWN])
  })

  it('화면이 키를 가져갔으면 안 먹는다', () => {
    setUiCapture(true)
    down()
    bikeGearSystem.fixedUpdate()
    expect(worldState.player.bikeGear).toBe(BIKE_GEAR.third)
  })

  it('복원 중에는 안 먹는다', () => {
    // 저장한 자리를 세우는 동안 조작이 새면 안 된다 (REPAIR §42)
    worldState.restoring = true
    down()
    bikeGearSystem.fixedUpdate()
    expect(worldState.player.bikeGear).toBe(BIKE_GEAR.third)
  })
})
