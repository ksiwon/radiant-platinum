import { describe, expect, it } from 'vitest'
import { AdditiveBlending, MeshStandardMaterial, NormalBlending, Texture } from 'three'
import { applyLightMode, lightMode } from './arenaLight'

describe('무대 창빛', () => {
  it('비치는 창빛만 가른다 — 벽·바닥·잎은 그대로다', () => {
    expect(lightMode('M_B_016_Wall_01', false, true)).toBe('plain')
    expect(lightMode('M_B_016_Leaf_01', false, true)).toBe('plain')
    // 이름이 창빛이어도 오려 내기(`MASK`)로 실렸으면 손대지 않는다
    expect(lightMode('M_B_016_Light_14', false, true)).toBe('plain')
  })

  it('그림 있는 창빛은 더하기, 없는 창빛은 숨긴다', () => {
    expect(lightMode('M_B_015_WindowLight_01', true, true)).toBe('additive')
    expect(lightMode('M_B_016_Light_14', true, true)).toBe('additive')
    // g021의 열하나 — 색만 흰색·알파 1이라 어떻게 그려도 흰 판이다
    expect(lightMode('M_B_021_WindowLight_03', true, false)).toBe('hidden')
    expect(lightMode('M_CB_021_WindowLight_05', true, false)).toBe('hidden')
    // 리그 무대의 그림 없는 조명 면은 널빤지가 아니다 — 여태 보이던 대로 둔다
    expect(lightMode('M_B_038_Light_27', true, false)).toBe('plain')
    expect(lightMode('M_B_042_Light_24', true, false)).toBe('plain')
  })

  it('재질에 실제로 건다', () => {
    const lit = new MeshStandardMaterial({ name: 'M_B_015_WindowLight_02', transparent: true, map: new Texture() })
    expect(applyLightMode(lit)).toBe(true)
    expect(lit.blending).toBe(AdditiveBlending)
    expect(lit.depthWrite).toBe(false)

    const bare = new MeshStandardMaterial({ name: 'M_B_021_WindowLight_10', transparent: true })
    expect(applyLightMode(bare)).toBe(false)

    const wall = new MeshStandardMaterial({ name: 'M_B_021_Wall_01' })
    expect(applyLightMode(wall)).toBe(true)
    expect(wall.blending).toBe(NormalBlending)
    expect(wall.depthWrite).toBe(true)
  })
})
