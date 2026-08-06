// 배틀 그림 세우기 검증 (DATA.md §2.17)
//
// 그림이 종마다 80×80 안에서 다르게 차지한다. 상자에 맞춰 늘리면 그 차이가
// 사라져서 잉어킹과 딱구리가 같은 덩치가 된다 — 여기서 그것을 막는다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { spriteFit, type SpriteIndex } from './monSprite'

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'pokemon/index.json'))
const maybe = present ? describe : describe.skip

maybe('배틀 그림', () => {
  const idx = JSON.parse(
    readFileSync(resolve(DATA, 'pokemon/index.json'), 'utf8')) as SpriteIndex

  it('494종에서 앞뒤 그림이 다 나온다', () => {
    // 롬의 2964칸 ÷ 6 = 494종. 0번은 빈 칸이라 493종에 그림이 있어야 한다
    expect(idx.size).toBe(80)
    const ids = Object.keys(idx.sprites).map(Number)
    expect(ids.length).toBe(493)
    expect(Math.min(...ids)).toBe(1)
    expect(Math.max(...ids)).toBe(493)
    const both = ids.filter((s) => idx.sprites[String(s)]?.front && idx.sprites[String(s)]?.back)
    expect(both.length).toBe(493)
  })

  it('그림 크기가 종마다 다르다 — 원작 덩치 차이가 여기 들어 있다', () => {
    const h = (s: number) => idx.sprites[String(s)]!.front!.h
    // 잉어킹(129)보다 딱구리(208)가 크고, 메타몽(132)은 작다
    expect(h(208)).toBeGreaterThan(h(129))
    expect(h(129)).toBeGreaterThan(h(132))
    const all = Object.values(idx.sprites).map((v) => v.front!.h)
    expect(Math.min(...all)).toBeLessThan(40)
    expect(Math.max(...all)).toBeGreaterThan(70)
  })

  it('발밑이 발판에 온다 — 크기가 달라도 뜨거나 파묻히지 않는다', () => {
    const TALL = 2.8
    for (const s of [1, 129, 208, 493]) {
      const box = idx.sprites[String(s)]!.front!
      const { scale, lift } = spriteFit(box, idx.size, TALL)
      expect(scale).toBe(TALL)
      // 판 한가운데를 `lift`에 두면 칠해진 자리 아래끝이 정확히 0이어야 한다
      const bottom = lift - scale / 2 + ((idx.size - box.y - box.h) / idx.size) * scale
      expect(bottom, `종족 ${String(s)}`).toBeCloseTo(0, 6)
      // 칠해진 높이는 판 한 변 × 상자 비율이다. 판을 상자에 맞춰 늘리면
      // 이 값이 종마다 같아져서 덩치 차이가 통째로 사라진다
      expect((box.h / idx.size) * scale).toBeCloseTo((box.h / 80) * TALL, 6)
    }
  })

  it('덩치 차이가 월드 크기로 옮겨진다', () => {
    const TALL = 2.8
    const worldH = (s: number) => {
      const box = idx.sprites[String(s)]!.front!
      return (box.h / idx.size) * spriteFit(box, idx.size, TALL).scale
    }
    // 딱구리(208)가 메타몽(132)보다 확실히 크게 선다
    expect(worldH(208)).toBeGreaterThan(worldH(132) * 1.5)
  })

  it('상자가 없으면 가운데에 세운다', () => {
    expect(spriteFit(undefined, 80, 2.8)).toEqual({ scale: 2.8, lift: 1.4 })
  })
})
