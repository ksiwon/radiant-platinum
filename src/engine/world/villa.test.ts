import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  rollVillaVisitor, VILLA_FURNITURE, VILLA_FURNITURE_MODEL_START, VILLA_SLOTS, villaBlocked, villaFurnitureAllowed,
  villaTalkAt,
} from './villa'

const F = VILLA_FURNITURE
const all = (): boolean => true
const none = (): boolean => false

describe('별장 가구', () => {
  it('산 것만 막는다 · 화분 넷 · 벽걸이는 안 막는다', () => {
    expect(villaBlocked(none, 12, 6)).toBe(false)
    expect(villaBlocked(all, 12, 6)).toBe(true)
    expect(VILLA_SLOTS.filter((s) => s.type === F.houseplant)).toHaveLength(4)
    expect(villaBlocked(all, 11, 1)).toBe(false)
  })

  it('A 버튼 — 21 + 가구 · 텔레비전은 북쪽을 볼 때만 방송', () => {
    expect(villaTalkAt(all, 12, 7, false)).toBe(0x15 + F.table)
    expect(villaTalkAt(all, 11, 3, true)).toBe('tv')
    expect(villaTalkAt(all, 11, 3, false)).toBeNull()
    expect(villaTalkAt(all, 18, 3, true)).toBe(0x15 + F.rack)
  })

  it('조건 — 피아노는 전당 10번 · 은빛 흉상은 은 인쇄 하나 · 흉상은 시설 다섯', () => {
    const rec = (values: Record<number, number>) => (id: number) => values[id] ?? 0
    expect(villaFurnitureAllowed(F.piano + 1, { record: rec({ 73: 9 }), prints: [] })).toBe(false)
    expect(villaFurnitureAllowed(F.piano + 1, { record: rec({ 73: 10 }), prints: [] })).toBe(true)
    expect(villaFurnitureAllowed(F.pokemonBustSilver + 1, { record: rec({}), prints: [2, 0, 0, 0, 0] })).toBe(true)
    expect(villaFurnitureAllowed(F.pokemonBust + 1, { record: rec({ 60: 3 }), prints: [] })).toBe(false)
    expect(villaFurnitureAllowed(F.table + 1, { record: rec({}), prints: [] })).toBe(true)
  })

  it('방문객 — 가구 열둘부터 90%에 열다섯 중 하나', () => {
    const seq = (...v: number[]) => () => v.shift() ?? 0
    expect(rollVillaVisitor(12, seq(90, 14, 3))).toEqual({ visitor: 14, message: 3 })
    expect(rollVillaVisitor(12, seq(91, 7))).toEqual({ visitor: 0xff, message: 7 % 5 })
    expect(rollVillaVisitor(0, seq(25, 5, 0))).toEqual({ visitor: 1, message: 0 })
  })
})

const SRC = 'raw/decomp/src/overlay005/villa_furniture.c'
const ORDER = 'raw/decomp/res/field/props/models/map_prop_models.order'
const TYPES = 'raw/decomp/generated/villa_furniture_type.txt'

describe.runIf(existsSync(SRC) && existsSync(ORDER) && existsSync(TYPES))('원작과 맞대기', () => {
  it('자리 스물셋 — 차례 · 가구 · 막는 칸', () => {
    const src = readFileSync(SRC, 'utf8')
    const types = readFileSync(TYPES, 'utf8').split(/\r?\n/).filter(Boolean)
    const body = src.slice(src.indexOf('sVillaFurnitures[FURNITURE_SLOTS] = {'))
    const rows = [...body.matchAll(/\.furnitureType = (VILLA_FURNITURE_\w+),[\s\S]*?\.collisionBounds = (COLLISION_BOUNDS_NONE|\{[\s\S]*?\})/g)]
    expect(rows).toHaveLength(VILLA_SLOTS.length)
    rows.forEach(([, type, bounds], i) => {
      expect(VILLA_SLOTS[i]!.type).toBe(types.indexOf(type!))
      if (bounds === 'COLLISION_BOUNDS_NONE') expect(VILLA_SLOTS[i]!.bounds).toBeNull()
      else {
        const n = [...bounds!.matchAll(/= (\d+)/g)].map((m) => Number(m[1]))
        expect(VILLA_SLOTS[i]!.bounds).toEqual(n)
      }
    })
  })

  it('모델 번호 — map_prop_models.order의 차례', () => {
    const order = readFileSync(ORDER, 'utf8').split(/\r?\n/)
    expect(order.indexOf('villa_furniture_table.nsbmd')).toBe(VILLA_FURNITURE_MODEL_START)
    expect(order.indexOf('villa_furniture_chandelier.nsbmd')).toBe(VILLA_FURNITURE_MODEL_START + F.chandelier)
  })
})
