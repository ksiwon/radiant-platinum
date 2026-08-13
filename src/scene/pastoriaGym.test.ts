// 물가시티 체육관의 물바닥 (PARITY §7.12)
//
// ⚠️ 여기서 재는 것은 **물 높이가 길을 여닫는가**다. 다섯째 뱃지의 방이고
// 격자가 길을 안 적어 두었으므로, 이 규칙이 없으면 관장에게 갈 수가 없다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { heightPlateAt } from '../engine/map/dynamicHeight'
import {
  PASTORIA_BEHAVIOR, PASTORIA_BUTTON, PASTORIA_BUTTON_MODEL, PASTORIA_GYM_MAP,
  PASTORIA_PLATE_BOX, PASTORIA_WATER, PASTORIA_WATER_MODEL, TILE_DYNAMIC_HEIGHT_COLLISION,
  pastoriaButtonOf, pastoriaWaterFor,
} from '../engine/world/pastoriaGym'
import {
  initPastoriaGym, pastoriaBlockedAt, pastoriaBusy, pastoriaPressed, pastoriaTick,
  pastoriaWaterHeight, pastoriaWaterProp, pressPastoriaButton, resetPastoriaGym,
} from './pastoriaGym'

const DATA = resolve(__dirname, '../../public/data')
const read = (name: string): unknown => JSON.parse(readFileSync(resolve(DATA, name), 'utf8'))

interface Placement { model: number; x: number; y: number; z: number }
const maps = (read('maps.json') as { maps: { matrix: number }[] }).maps
const matrix = (read('matrices/interiors.json') as {
  matrices: Record<string, { tileWidth: number; tileHeight: number; byteOffset: number;
    buildings: Record<string, Placement[]> }>
}).matrices[String(maps[PASTORIA_GYM_MAP]!.matrix)]!

/** 그 방의 거동값 격자. 우리가 실제로 걷는 그 자료다 */
function behaviors(): Uint16Array {
  const buf = readFileSync(resolve(DATA, 'matrices/interiors.bin'))
  return new Uint16Array(
    buf.buffer, buf.byteOffset + matrix.byteOffset, matrix.tileWidth * matrix.tileHeight)
}

/** 다 움직일 때까지 굴린다 */
function settle(): void {
  for (let i = 0; i < 1000 && pastoriaBusy(); i++) pastoriaTick(1 / 60)
  if (pastoriaBusy()) throw new Error('물이 안 멈춘다')
}

describe('롬과 맞는가', () => {
  it('단추 셋이 실제로 놓여 있다', () => {
    const models = Object.values(matrix.buildings).flat().map((b) => b.model)
    for (const model of Object.values(PASTORIA_BUTTON_MODEL)) {
      expect(models, `모델 ${String(model)}`).toContain(model)
      expect(pastoriaButtonOf(model)).not.toBeNull()
    }
  })

  it('⚠️ 물바닥 소품에는 배치가 없다', () => {
    // 원작이 이 방에서만 손으로 싣는다 — 배치를 기다리면 물이 영영 안 뜬다
    const models = Object.values(matrix.buildings).flat().map((b) => b.model)
    expect(models).not.toContain(PASTORIA_WATER_MODEL)
  })

  it('거동값 넷이 실제로 그 방에 있다', () => {
    // 값을 손으로 옮겨 적었다. 하나라도 어긋나면 길 판정이 통째로 죽는다
    const counts = new Map<number, number>()
    for (const t of behaviors()) {
      const b = t & 0x7fff
      counts.set(b, (counts.get(b) ?? 0) + 1)
    }
    expect(counts.get(PASTORIA_BEHAVIOR.highGround)).toBe(10)
    expect(counts.get(PASTORIA_BEHAVIOR.middleGround)).toBe(6)
    expect(counts.get(PASTORIA_BEHAVIOR.lowGround)).toBe(10)
    // 물 그 자체. 방의 절반 가까이가 이 값이다
    expect(counts.get(TILE_DYNAMIC_HEIGHT_COLLISION)).toBe(445)
  })

  it('높이판이 걷는 자리를 다 덮는다', () => {
    const box = PASTORIA_PLATE_BOX
    const tiles = behaviors()
    for (let z = 0; z < matrix.tileHeight; z++) {
      for (let x = 0; x < matrix.tileWidth; x++) {
        if ((tiles[z * matrix.tileWidth + x]! & 0x7fff) !== TILE_DYNAMIC_HEIGHT_COLLISION) continue
        expect(x, `물 칸 (${String(x)},${String(z)})`).toBeGreaterThanOrEqual(box.startTileX)
        expect(x).toBeLessThan(box.startTileX + box.sizeX)
        expect(z).toBeGreaterThanOrEqual(box.startTileZ)
        expect(z).toBeLessThan(box.startTileZ + box.sizeZ)
      }
    }
  })
})

describe('단추가 물 높이를 정한다', () => {
  beforeEach(() => { resetPastoriaGym() })

  it('⚠️ 들어설 때마다 물이 낮은 데서 다시 시작한다', () => {
    expect(initPastoriaGym(PASTORIA_GYM_MAP)).toBe(true)
    expect(pastoriaPressed()).toBe(PASTORIA_BUTTON.orange)
    expect(pastoriaWaterHeight()).toBe(PASTORIA_WATER.low)
    expect(pastoriaWaterProp()).toEqual({ model: PASTORIA_WATER_MODEL, x: 16, y: 0, z: 16 })
  })

  it('파랑은 높음 · 초록은 가운데 · 주황은 낮음', () => {
    expect(pastoriaWaterFor(PASTORIA_BUTTON.blue)).toBe(PASTORIA_WATER.high)
    expect(pastoriaWaterFor(PASTORIA_BUTTON.green)).toBe(PASTORIA_WATER.middle)
    expect(pastoriaWaterFor(PASTORIA_BUTTON.orange)).toBe(PASTORIA_WATER.low)
  })

  it('밟으면 물이 오르고 높이판이 따라온다', () => {
    initPastoriaGym(PASTORIA_GYM_MAP)
    expect(pressPastoriaButton(PASTORIA_BUTTON_MODEL.blue)).toBe(true)
    settle()
    expect(pastoriaWaterHeight()).toBe(PASTORIA_WATER.high)
    expect(heightPlateAt(2, 3)?.height).toBe(PASTORIA_WATER.high)
  })

  it('⚠️ 초록은 지금 물이 어디 있느냐로 오르거나 내린다', () => {
    initPastoriaGym(PASTORIA_GYM_MAP)
    pressPastoriaButton(PASTORIA_BUTTON_MODEL.green)
    settle()
    expect(pastoriaWaterHeight()).toBe(PASTORIA_WATER.middle)

    pressPastoriaButton(PASTORIA_BUTTON_MODEL.blue)
    settle()
    pressPastoriaButton(PASTORIA_BUTTON_MODEL.green)
    settle()
    expect(pastoriaWaterHeight()).toBe(PASTORIA_WATER.middle)
  })

  it('같은 단추를 다시 밟으면 아무 일도 없다', () => {
    initPastoriaGym(PASTORIA_GYM_MAP)
    expect(pressPastoriaButton(PASTORIA_BUTTON_MODEL.orange)).toBe(false)
    expect(pastoriaBusy()).toBe(false)
  })

  it('단추가 아닌 칸을 밟으면 아무 일도 없다', () => {
    initPastoriaGym(PASTORIA_GYM_MAP)
    expect(pressPastoriaButton(-1)).toBe(false)
  })
})

describe('물 높이가 길을 여닫는다', () => {
  beforeEach(() => { resetPastoriaGym(); initPastoriaGym(PASTORIA_GYM_MAP) })

  it('⚠️ 이름과 반대다 — 높은 땅은 물이 낮아야 딛는다', () => {
    // 땅이 높으면 물이 낮아야 발이 닿는다. 뒤집으면 방의 길이 통째로 뒤집힌다
    expect(pastoriaBlockedAt(PASTORIA_BEHAVIOR.highGround)).toBe(false)
    expect(pastoriaBlockedAt(PASTORIA_BEHAVIOR.middleGround)).toBe(true)
    expect(pastoriaBlockedAt(PASTORIA_BEHAVIOR.lowGround)).toBe(true)

    pressPastoriaButton(PASTORIA_BUTTON_MODEL.blue)
    settle()
    expect(pastoriaBlockedAt(PASTORIA_BEHAVIOR.highGround)).toBe(true)
    expect(pastoriaBlockedAt(PASTORIA_BEHAVIOR.lowGround)).toBe(false)
  })

  it('가운데 땅은 초록에서만 열린다', () => {
    pressPastoriaButton(PASTORIA_BUTTON_MODEL.green)
    settle()
    expect(pastoriaBlockedAt(PASTORIA_BEHAVIOR.middleGround)).toBe(false)
    expect(pastoriaBlockedAt(PASTORIA_BEHAVIOR.highGround)).toBe(true)
    expect(pastoriaBlockedAt(PASTORIA_BEHAVIOR.lowGround)).toBe(true)
  })

  it('그 밖의 칸은 안 본다', () => {
    expect(pastoriaBlockedAt(0)).toBeNull()
    expect(pastoriaBlockedAt(TILE_DYNAMIC_HEIGHT_COLLISION)).toBeNull()
  })
})
