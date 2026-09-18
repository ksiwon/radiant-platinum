// 역할별 색 꺼내기 — 묶음 0 imped를 텍셀 그대로 읽은 표와 맞는가
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { decodePng, withData } from '../../data/romData.testkit'
import { colorsIn, fenceSwatch, PLANTER_LAYOUTS, planterSwatch, shrubSwatch, texel } from './swatches'

const DATA = resolve(__dirname, '../../../public/data')

withData('tex/index.json', 'tex/0.png', 'tex/8.png', 'tex/12.png')('imped 역할별 색', () => {
  const idx = JSON.parse(readFileSync(resolve(DATA, 'tex/index.json'), 'utf8')) as {
    sets: { items: [string, string, number, number, number, number][] }[]
  }
  const open = (set: number) => {
    const png = decodePng(resolve(DATA, `tex/${String(set)}.png`))
    const [, , x, y, w, h] = idx.sets[set]!.items.find(([t]) => t === 'imped')!
    return { sheet: { width: png.width, pixels: png.pixels }, item: { x, y, w, h } }
  }

  it('묶음 0 화분 — 림·용기·흙·잎이 제 색이다', () => {
    const { sheet, item } = open(0)
    expect(planterSwatch(sheet, item, PLANTER_LAYOUTS.e1000013!)).toEqual({
      rim: 0xc6cee7,
      rimEdge: 0x9ca5bd,
      container: 0x9ca5bd,
      containerEdge: 0x737384,
      soil: 0x9c7373,
      leaves: [0xc6f74a, 0x9cce42, 0x84ad31, 0x6b8c31],
    })
  })

  it('묶음 0 덤불 — 잎 넷이 화분과 같고 그늘이 따로다', () => {
    const { sheet, item } = open(0)
    const got = shrubSwatch(sheet, item)!
    expect(got.leaves).toEqual([0xc6f74a, 0x9cce42, 0x84ad31, 0x6b8c31])
    expect(got.shade).toBe(0x737384)
  })

  it('칸 둘레 한 줄은 투명이다 — 자리를 잘못 잡으면 null이 난다', () => {
    const { sheet, item } = open(0)
    expect(texel(sheet, item, 32, 32)).toBeNull()
    expect(colorsIn(sheet, item, [32, 32, 33, 48])).toEqual([])
  })

  it('축복시티 그림(묶음 8 · c92159ee)은 흙이 안 보이고 잎이 넷이다', () => {
    const { sheet, item } = open(8)
    expect(planterSwatch(sheet, item, PLANTER_LAYOUTS.c92159ee!)).toEqual({
      rim: 0xe7e7ce,
      rimEdge: 0xadad9c,
      container: 0xadad9c,
      containerEdge: 0x6b6b7b,
      soil: null,
      leaves: [0x84d642, 0x63ad39, 0x4a8452, 0x295a39],
    })
  })

  it('배치를 잘못 고르면 역할이 섞인다 — 묶음 0 배치로 묶음 8을 읽으면 흙 자리에 잎이 있다', () => {
    const { sheet, item } = open(8)
    const wrong = planterSwatch(sheet, item, PLANTER_LAYOUTS.e1000013!)
    expect(wrong?.soil).not.toBe(0x9c7373)
  })

  it('212번도로 그림(묶음 12 · 덤불 7bdd6519) — 잎 다섯 단계와 밑 그늘', () => {
    const { sheet, item } = open(12)
    expect(shrubSwatch(sheet, item)).toEqual({
      leaves: [0xa5f75a, 0x84d642, 0x63ad39, 0x4a8452, 0x295a39],
      shade: 0x6b6b7b,
    })
  })
})

withData('tex/index.json', 'tex/6.png', 'tex/14.png')('imped 말뚝 울타리 색', () => {
  const idx = JSON.parse(readFileSync(resolve(DATA, 'tex/index.json'), 'utf8')) as {
    sets: { items: [string, string, number, number, number, number][] }[]
  }
  const open = (set: number) => {
    const png = decodePng(resolve(DATA, `tex/${String(set)}.png`))
    const [, , x, y, w, h] = idx.sets[set]!.items.find(([t]) => t === 'imped')!
    return { sheet: { width: png.width, pixels: png.pixels }, item: { x, y, w, h } }
  }

  it('묶음 6(흰색)과 14(푸른 회색) — 짜임이 같고 색만 다르다', () => {
    const six = open(6)
    expect(fenceSwatch(six.sheet, six.item)).toEqual({
      postFront: 0xadad9c, postTop: 0xeff7ff, postEdge: 0xe7e7ce, railTop: 0xe7e7ce, railFront: 0x6b6b7b,
    })
    const blue = open(14)
    expect(fenceSwatch(blue.sheet, blue.item)).toEqual({
      postFront: 0x9ca5ad, postTop: 0xeff7ff, postEdge: 0xced6ef, railTop: 0xced6ef, railFront: 0x6b6b7b,
    })
  })
})
