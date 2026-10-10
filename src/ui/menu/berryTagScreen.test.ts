// 나무열매 태그 — 크기 단위(롬 cm) · 이웃 열매 · 맛 그래프 · 목록이 비어도 안 터진다
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'
import { useMenuStore } from '../../state/menuStore'

const { BerryTagScreen, FLAVOR_MAX, berrySizeText, flavorPath, flavorPoint, neighbor } = await import('./BerryTagScreen')

/** 롬 398의 9번 (한국어 · 일본어 · 영어) */
const KO = '{STRVAR_1 51, 0, 0}.{STRVAR_1 50, 1, 0}cm'
const JA = '{STRVAR_1 51, 0}.{STRVAR_1 50, 1}cm'
const EN = '{STRVAR_1 51, 0, 0}.{STRVAR_1 50, 1, 0}"'

describe('크기 단위는 로케일의 글을 따른다', () => {
  it('한국어 · 일본어는 mm를 cm로 — 몫과 나머지 한 자리', () => {
    expect(berrySizeText(KO, 20, 'ko')).toBe('2.0cm')
    expect(berrySizeText(KO, 223, 'ko')).toBe('22.3cm')
    expect(berrySizeText(JA, 300, 'ja')).toBe('30.0cm')
  })

  it('영어는 인치다 (원작 변환식 size × 1000 / 254)', () => {
    // 254mm = 10.0인치
    expect(berrySizeText(EN, 254, 'en')).toBe('10.0"')
    expect(berrySizeText(EN, 20, 'en')).toBe('0.8"')
  })

  it('단위 글자가 코드에 박혀 있지 않다 — 인치 기호를 안 붙인다', () => {
    expect(berrySizeText(KO, 80, 'ko')).not.toContain('″')
  })
})

describe('맛 그래프', () => {
  it('첫 꼭짓점은 위쪽(매운맛)이고 시계 방향이다', () => {
    const [x0, y0] = flavorPoint(0, FLAVOR_MAX, 50, 100, 100)
    expect(x0).toBeCloseTo(100)
    expect(y0).toBeCloseTo(50)
    const [x1] = flavorPoint(1, FLAVOR_MAX, 50, 100, 100)
    expect(x1).toBeGreaterThan(100)
  })

  it('상한을 넘는 값은 바깥 고리에서 멈춘다', () => {
    expect(flavorPoint(0, 400, 50, 0, 0)[1]).toBeCloseTo(-50)
    expect(flavorPoint(0, 0, 50, 0, 0)[1]).toBeCloseTo(0)
  })

  it('채움은 닫힌 오각형 경로다', () => {
    const d = flavorPath([10, 0, 0, 0, 0], 60, 0, 0)
    expect(d.startsWith('M ')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.match(/L/g)).toHaveLength(4)
  })
})

describe('이웃 열매', () => {
  it('↑↓가 목록 차례로 가고 끝에서 멈춘다', () => {
    const list = [150, 151, 152]
    expect(neighbor(list, 151, 1)).toBe(152)
    expect(neighbor(list, 151, -1)).toBe(150)
    expect(neighbor(list, 152, 1)).toBe(152)
    expect(neighbor(list, 150, -1)).toBe(150)
  })

  it('목록에 없거나 비었으면 제자리다', () => {
    expect(neighbor([], 150, 1)).toBe(150)
    expect(neighbor([149], 150, 1)).toBe(150)
  })
})

describe('열기', () => {
  afterEach(() => { useMenuStore.getState().closeAll() })

  it('berryItem도 berryList도 없이 열어도 안 터진다', () => {
    useMenuStore.getState().open('berryTag')
    expect(() => renderToStaticMarkup(createElement(BerryTagScreen))).not.toThrow()
  })

  it('목록이 비어도 안 터진다', () => {
    useMenuStore.getState().openBerryTag(149)
    expect(useMenuStore.getState().berryList).toEqual([])
    expect(() => renderToStaticMarkup(createElement(BerryTagScreen))).not.toThrow()
  })

  it('목록과 함께 열어도 안 터진다', () => {
    useMenuStore.getState().openBerryTag(150, [149, 150, 151])
    expect(() => renderToStaticMarkup(createElement(BerryTagScreen))).not.toThrow()
  })
})
