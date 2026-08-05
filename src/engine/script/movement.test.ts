// 이동 동작 검증 (DATA.md §2.10)
//
// 방향과 프레임 수가 맞는지가 전부다. 둘 다 눈으로는 안 잡힌다 — 방향이
// 뒤집혀도 NPC는 여전히 "걸어가고", 프레임이 두 배여도 "조금 느린" 것으로 보인다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseScriptMeta } from './data'
import {
  DIR, DIR_STEP, MOVEMENT_END, MovementRunner, parseMovements,
  type Movable, type MovementTable,
} from './movement'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'scripts.json'))
const maybe = present ? describe : describe.skip

const actor = (): Movable => ({ x: 10, z: 20, dir: DIR.south, visible: true })

/** `{u16 동작, u16 횟수}` 목록을 바이트로 */
const bytes = (...pairs: [number, number][]): Uint8Array => {
  const buf = new Uint8Array((pairs.length + 1) * 4)
  const view = new DataView(buf.buffer)
  pairs.forEach(([action, count], i) => {
    view.setUint16(i * 4, action, true)
    view.setUint16(i * 4 + 2, count, true)
  })
  view.setUint16(pairs.length * 4, MOVEMENT_END, true)
  return buf
}

describe('목록 읽기', () => {
  it('끝 표시까지 읽는다', () => {
    expect(parseMovements(bytes([13, 2], [1, 1]), 0))
      .toEqual([{ action: 13, count: 2 }, { action: 1, count: 1 }])
  })

  it('끝 표시가 없으면 터진다', () => {
    // 조용히 넘어가면 파일 뒤쪽의 아무 바이트나 동작으로 읽는다
    const buf = new Uint8Array(8)
    expect(() => parseMovements(buf, 0)).toThrow('파일 밖')
  })
})

describe('방향', () => {
  it('z가 커지는 쪽이 남쪽이다', () => {
    // 워프·NPC 좌표가 그렇다. 뒤집으면 NPC가 반대로 걸어간다
    expect(DIR_STEP[DIR.north]).toEqual({ x: 0, z: -1 })
    expect(DIR_STEP[DIR.south]).toEqual({ x: 0, z: 1 })
    expect(DIR_STEP[DIR.west]).toEqual({ x: -1, z: 0 })
    expect(DIR_STEP[DIR.east]).toEqual({ x: 1, z: 0 })
  })
})

maybe('실제 표로 걷기', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const table: MovementTable = meta.movements
  const code = (name: string): number => table.findIndex((m) => m?.name === name)

  it('표를 디컴프에서 뽑았다', () => {
    // 걸음은 전부 한 칸이고 속도만 다르다 — 거리 × 프레임 = 16단위(한 타일)라
    // 그렇게 나온다. 값 하나라도 손으로 옮겼으면 여기서 어긋난다
    expect(table).toHaveLength(256)
    expect(table[code('WALK_NORMAL_NORTH')]).toEqual({
      name: 'WALK_NORMAL_NORTH', kind: 'walk', dir: DIR.north, tiles: 1, frames: 8,
    })
    expect(table[code('WALK_FAST_NORTH')]?.frames).toBe(4)
    expect(table[code('WALK_SLOW_NORTH')]?.frames).toBe(16)
    expect(table[code('FACE_WEST')]).toEqual({ name: 'FACE_WEST', kind: 'face', dir: DIR.west, frames: 1 })
    expect(table[code('DELAY_16')]).toEqual({ name: 'DELAY_16', kind: 'delay', frames: 16 })
    // 155~253은 이름조차 없다. 끝 표시가 254라 그 사이가 비어 있다
    expect(table[200]).toBeNull()
  })

  it('보통 걸음 두 칸이 열여섯 프레임에 끝난다', () => {
    const target = actor()
    const runner = new MovementRunner(target, [{ action: code('WALK_NORMAL_NORTH'), count: 2 }], table)
    for (let i = 0; i < 8; i++) runner.tick()
    expect(target.z).toBe(19) // 한 칸
    expect(target.dir).toBe(DIR.north)
    expect(runner.done).toBe(false)
    for (let i = 0; i < 8; i++) runner.tick()
    expect(target.z).toBe(18)
    expect(runner.done).toBe(true)
  })

  it('걷는 도중에는 칸 사이에 있다', () => {
    // 정수로만 움직이면 뚝뚝 끊겨 보인다. 프레임마다 1/8씩 간다
    const target = actor()
    const runner = new MovementRunner(target, [{ action: code('WALK_NORMAL_EAST'), count: 1 }], table)
    runner.tick()
    expect(target.x).toBeCloseTo(10.125)
    runner.tick()
    expect(target.x).toBeCloseTo(10.25)
  })

  it('바라보기는 한 프레임이고 자리를 안 옮긴다', () => {
    const target = actor()
    const runner = new MovementRunner(target, [{ action: code('FACE_WEST'), count: 1 }], table)
    runner.tick()
    expect(target).toMatchObject({ x: 10, z: 20, dir: DIR.west })
    expect(runner.done).toBe(true)
  })

  it('숨기고 보이기가 먹는다', () => {
    const target = actor()
    const runner = new MovementRunner(target, [
      { action: code('SET_INVISIBLE'), count: 1 },
      { action: code('SET_VISIBLE'), count: 1 },
    ], table)
    runner.tick()
    expect(target.visible).toBe(false)
    runner.tick()
    expect(target.visible).toBe(true)
  })
})
