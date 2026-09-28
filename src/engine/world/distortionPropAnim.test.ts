// 깨어진 세계 소품의 한 틱 (`distortionPropAnim.ts` · `ov9_02249960.c`)
import { describe, expect, it } from 'vitest'
import {
  GHOST_PROP_OPACITY_MAX, obstacleAnimInit, obstacleAnimTick, obstacleSound, platformAnimInit, platformAnimTick,
} from './distortionPropAnim'

describe('발판 (DistWorldPlatformProp)', () => {
  it('둥실거림 — 두 틱에 한 칸씩 여덟 칸을 내려갔다 돌아온다. 가장 깊이 6유닛(3/8칸)', () => {
    const a = platformAnimInit(false, 0)
    const ys: number[] = []
    for (let i = 0; i < 34; i++) ys.push(platformAnimTick(a, false, false).y * 16)
    expect(ys.slice(0, 16)).toEqual([0, 0, -1, -1, -2, -2, -4, -4, -5, -5, -5.5, -5.5, -5.75, -5.75, -6, -6])
    // 끝에서 한 칸 물러 돌아선다 (`FX32_ONE * 8 - DELTA`)
    expect(ys.slice(16, 20)).toEqual([-6, -6, -5.75, -5.75])
    expect(Math.min(...ys)).toBe(-6)
  })

  it('홀수에서 시작하면 거꾸로 간다 · 서 있으면 반만 가라앉는다', () => {
    expect(platformAnimInit(false, 0x4801).delta).toBeLessThan(0)
    expect(platformAnimInit(false, 0x4800).delta).toBeGreaterThan(0)
    const a = platformAnimInit(false, 0x7000)
    expect(platformAnimTick(a, false, true).y * 16).toBe(-3)
  })

  it('나타나기 — 알파가 한 틱에 1씩, 소리는 처음 한 번', () => {
    const a = platformAnimInit(true, 0)
    expect(a.opacity).toBe(0)
    const sounds = [...Array(40).keys()].map(() => platformAnimTick(a, false, false).sound)
    expect(a.opacity).toBe(GHOST_PROP_OPACITY_MAX)
    expect(sounds.filter(Boolean)).toHaveLength(1)
    // 숨기면 다시 한 번
    expect(platformAnimTick(a, true, false).sound).toBe(true)
    expect(a.opacity).toBe(30)
  })
})

describe('덩굴꽃 · 바위 (DistWorldObstacleProp)', () => {
  it('나타나기 — 알파와 프레임이 2씩 같이 오르고 끝에서 멈춘다 (클립 31프레임)', () => {
    const a = obstacleAnimInit(true, 31)
    expect(obstacleAnimTick(a, false, 31)).toBe('appear')
    expect([a.opacity, a.frame]).toEqual([2, 2])
    for (let i = 0; i < 20; i++) obstacleAnimTick(a, false, 31)
    expect([a.opacity, a.frame]).toEqual([31, 31])
  })

  it('사라지기 — 클립이 먼저 거꾸로 돌고, 프레임이 알파 밑으로 내려와야 흐려진다', () => {
    const a = obstacleAnimInit(false, 31)
    expect([a.opacity, a.frame]).toEqual([31, 31])
    // 첫 틱 — 프레임 29 · 알파 31 ≥ 29라 곧바로 줄기 시작한다
    expect(obstacleAnimTick(a, true, 31)).toBe('disappear')
    expect([a.opacity, a.frame]).toEqual([29, 29])
    for (let i = 0; i < 20; i++) obstacleAnimTick(a, true, 31)
    expect([a.opacity, a.frame]).toEqual([0, 0])
  })

  it('소리 — 바위는 FW089_2 하나, 덩굴꽃은 MEKI · MEKI2', () => {
    expect([obstacleSound(23, 'appear'), obstacleSound(23, 'disappear')]).toEqual([1483, 1483])
    expect([obstacleSound(22, 'appear'), obstacleSound(22, 'disappear')]).toEqual([1485, 1486])
  })
})
