// 밟으면 도는 판 (PARITY §1.30)
//
// 원작 상태 기계가 168줄이고 그중 재는 값이 셋이다 — **어느 쪽으로 미는가** ·
// **몸이 몇 번 도는가** · **언제 서는가**. 셋 다 여기서 못 박는다.
import { beforeEach, describe, expect, it } from 'vitest'
import { Behavior } from '../map/zone'
import { DIR } from '../script/movement'
import {
  clearPanelSlide, dirStep, isSlidePanel, nextDir, panelSlide, panelStep, SLIDE_BEHAVIOR,
  SPINS_PER_TILE, slideDirOf, turned, type PanelView,
} from './slidePanel'

/** 칸마다 거동값을 손으로 놓은 세계. 적은 칸 밖은 통행 불가다 */
function world(tiles: Record<string, number>): PanelView {
  return {
    behaviorAt: (x, z) => tiles[`${String(x)},${String(z)}`] ?? 0,
    blockedAt: (x, z) => !(`${String(x)},${String(z)}` in tiles),
    heightAt: () => 0,
  }
}

beforeEach(() => { clearPanelSlide() })

describe('도는 판', () => {
  it('거동값 넷이 롬의 차례 그대로다', () => {
    // `map_tile_behaviors.h:75` — EASTWARD · WESTWARD · NORTHWARD · SOUTHWARD
    expect([
      Behavior.SLIDE_EAST, Behavior.SLIDE_WEST, Behavior.SLIDE_NORTH, Behavior.SLIDE_SOUTH,
    ]).toEqual([0x40, 0x41, 0x42, 0x43])
  })

  it('이름과 미는 쪽이 같다', () => {
    expect(slideDirOf(SLIDE_BEHAVIOR.east)).toBe(DIR.east)
    expect(slideDirOf(SLIDE_BEHAVIOR.west)).toBe(DIR.west)
    expect(slideDirOf(SLIDE_BEHAVIOR.north)).toBe(DIR.north)
    expect(slideDirOf(SLIDE_BEHAVIOR.south)).toBe(DIR.south)
    expect(slideDirOf(Behavior.ICE)).toBeNull()
    expect(isSlidePanel(Behavior.ICE)).toBe(false)
  })

  it('도는 차례가 북→서→남→동이다', () => {
    // ⚠️ `(dir + 1) % 4`가 아니다 — `DIR` 번호가 북0·남1·서2·동3이라
    // 산술로 돌리면 남 다음이 동이 된다
    expect(turned(DIR.north)).toBe(DIR.west)
    expect(turned(DIR.west)).toBe(DIR.south)
    expect(turned(DIR.south)).toBe(DIR.east)
    expect(turned(DIR.east)).toBe(DIR.north)
    // 네 번 돌면 제자리다
    let d: number = DIR.north
    for (let i = 0; i < 4; i++) d = turned(d)
    expect(d).toBe(DIR.north)
  })

  it('칸 증분이 z 남쪽 규약을 따른다', () => {
    expect(dirStep(DIR.north)).toEqual({ dx: 0, dz: -1 })
    expect(dirStep(DIR.south)).toEqual({ dx: 0, dz: 1 })
    expect(dirStep(DIR.west)).toEqual({ dx: -1, dz: 0 })
    expect(dirStep(DIR.east)).toEqual({ dx: 1, dz: 0 })
  })

  it('판 위면 판이 방향을 정하고, 판 밖이면 한 번 더 돈다', () => {
    // `ov5_021E120C`의 `unk_04 === 0` 갈래 그대로다
    expect(nextDir(SLIDE_BEHAVIOR.north, DIR.east)).toBe(DIR.north)
    expect(nextDir(0, DIR.east)).toBe(turned(DIR.east))
  })

  it('판이 아닌 칸에서는 안 잡는다', () => {
    const view = world({ '0,0': 0 })
    expect(panelStep(view, { x: 0.5, z: 0.5 }, 4.5)).toBeNull()
    expect(panelSlide.active).toBe(false)
  })

  it('밟는 순간 잡는다 — 걸음을 안 내디뎌도 된다', () => {
    // 얼음은 입력이 있어야 잡히는데(`iceStep`) 이쪽은 칸에 들어서면 곧바로다
    const view = world({ '0,0': SLIDE_BEHAVIOR.east, '1,0': 0 })
    const step = panelStep(view, { x: 0.5, z: 0.5 }, 4.5)
    expect(step).not.toBeNull()
    expect(panelSlide.active).toBe(true)
    expect(step!.vx).toBeGreaterThan(0)
    expect(step!.vz).toBe(0)
  })

  it('한 칸을 가는 동안 몸이 세 번 돈다', () => {
    const view = world({ '0,0': SLIDE_BEHAVIOR.east, '1,0': 0, '2,0': 0 })
    panelStep(view, { x: 0.5, z: 0.5 }, 4.5)
    expect(panelSlide.facing).toBe(DIR.east)
    const seen = [panelSlide.facing]
    // ⚠️ **칸 경계 앞까지만 센다.** 경계를 넘으면 다음 칸의 진행 방향으로
    // 얼굴이 한 번 더 붙는데(원작도 그렇다), 그것은 「도는 것」이 아니다
    for (let k = 1; k < 20; k++) {
      panelStep(view, { x: 0.5 + k / 20, z: 0.5 }, 4.5)
      if (panelSlide.facing !== seen[seen.length - 1]) seen.push(panelSlide.facing)
    }
    expect(seen.length - 1).toBe(SPINS_PER_TILE)
    // 동 → 북 → 서 → 남
    expect(seen).toEqual([DIR.east, DIR.north, DIR.west, DIR.south])
  })

  it('판을 벗어나도 한 칸은 더 가고, 그때 방향이 한 번 더 돈다', () => {
    // 동쪽 판 하나 → 보통 칸 → 그 북쪽이 열려 있다
    const view = world({
      '0,0': SLIDE_BEHAVIOR.east, '1,0': 0, '1,-1': 0,
    })
    panelStep(view, { x: 0.5, z: 0.5 }, 4.5)
    expect(panelSlide.dir).toBe(DIR.east)
    // 다음 칸 한가운데에 닿았다
    panelStep(view, { x: 1.5, z: 0.5 }, 4.5)
    // 판이 아니므로 동 → 북으로 한 번 돈다
    expect(panelSlide.dir).toBe(DIR.north)
    expect(panelSlide.active).toBe(true)
  })

  it('돌아간 쪽이 막혔으면 거기서 선다', () => {
    // 동쪽 판 하나 → 보통 칸. 그 북쪽이 막혀 있다
    const view = world({ '0,0': SLIDE_BEHAVIOR.east, '1,0': 0 })
    panelStep(view, { x: 0.5, z: 0.5 }, 4.5)
    const step = panelStep(view, { x: 1.5, z: 0.5 }, 4.5)
    expect(step).toEqual({ vx: 0, vz: 0, facing: expect.any(Number) })
    expect(panelSlide.active).toBe(false)
  })

  it('판이 이어지면 판이 정한 쪽으로 꺾인다', () => {
    // 동쪽 판 → 남쪽 판 → 보통 칸
    const view = world({
      '0,0': SLIDE_BEHAVIOR.east, '1,0': SLIDE_BEHAVIOR.south, '1,1': 0,
    })
    panelStep(view, { x: 0.5, z: 0.5 }, 4.5)
    expect(panelSlide.dir).toBe(DIR.east)
    panelStep(view, { x: 1.5, z: 0.5 }, 4.5)
    expect(panelSlide.dir).toBe(DIR.south)
  })

  it('목표를 지나치지 않는다', () => {
    const view = world({ '0,0': SLIDE_BEHAVIOR.east, '1,0': 0, '2,0': 0 })
    panelStep(view, { x: 0.5, z: 0.5 }, 4.5)
    // 목표 코앞에서는 남은 거리보다 빨리 안 간다
    const near = panelStep(view, { x: 1.49, z: 0.5 }, 4.5)!
    expect(near.vx).toBeLessThanOrEqual(0.01 * 60 + 1e-9)
  })
})
