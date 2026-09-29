// 시설 장면의 걸음 (`stageMotion.ts` · `ov63_0222BE18.c`)
import { describe, expect, it } from 'vitest'
import { FACTORY_MOVES, StageMotion, opponentGfx } from './stageMotion'

const run = (m: StageMotion): number => {
  let t = 0
  while (m.busy() && t < 2000) { m.tick(); t++ }
  return t
}

describe('걸음 목록', () => {
  it('걷기 한 칸은 8틱 · 16픽셀 — 복도에 들어서는 여섯 칸은 48틱에 96픽셀', () => {
    const m = new StageMotion()
    m.add({ id: 4, gfx: 0, x: 128, y: 192, dir: 0, visible: true })
    m.apply(4, FACTORY_MOVES.enter)
    expect(run(m)).toBe(48)
    expect([m.actors.get(4)!.x, m.actors.get(4)!.y]).toEqual([128, 96])
  })

  it('배틀룸 — 주인공과 상대가 마주 선다 (64,128) · (192,128)', () => {
    const m = new StageMotion()
    m.add({ id: 4, gfx: 0, x: 128, y: 192, dir: 0, visible: true })
    m.add({ id: 98, gfx: 3, x: 128, y: 64, dir: 1, visible: true })
    m.apply(4, FACTORY_MOVES.roomEnter)
    m.apply(98, FACTORY_MOVES.opponentEnter)
    expect(run(m)).toBe(10 * 8)
    m.apply(98, FACTORY_MOVES.opponentFace)
    run(m)
    const p = m.actors.get(4)!, o = m.actors.get(98)!
    expect([p.x, p.y, p.dir, o.x, o.y, o.dir]).toEqual([64, 128, 3, 192, 128, 2])
  })

  it('쉬기 · 보기 · 숨기 — 수철은 숨은 채로 걸어 들어온다', () => {
    const m = new StageMotion()
    m.add({ id: 98, gfx: 215, x: 128, y: 64, dir: 1, visible: true })
    m.apply(98, FACTORY_MOVES.thortonHidden)
    run(m)
    expect([m.actors.get(98)!.visible, m.actors.get(98)!.x, m.actors.get(98)!.y]).toEqual([false, 192, 128])
    m.add({ id: 4, gfx: 0, x: 64, y: 128, dir: 3, visible: true })
    m.apply(4, FACTORY_MOVES.lookAround)
    // 제자리 다섯(40) + 쉬기 8·8·4·4·8·8(40)
    expect(run(m)).toBe(80)
    expect(m.actors.get(4)!.dir).toBe(3)
  })

  it('상대 그림 — 분류 표 · 없으면 소년', () => {
    expect(opponentGfx(90)).toBe(141)
    expect(opponentGfx(250)).toBe(3)
  })
})
