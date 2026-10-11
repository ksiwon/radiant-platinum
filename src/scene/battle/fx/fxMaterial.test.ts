// 셰이더 기능이 명세로 읽히고 그래프가 지어지는가 — GPU 없이 되는 부분만 (컴파일 · 그림은 `fxshot`으로 본다)
import { describe, expect, it } from 'vitest'
import { Texture } from 'three'
import { materialKey, readMaterial } from '../../../engine/battle/fx/material'
import type { FxMaterialData } from '../../../engine/battle/fx/schema'
import { buildFxMaterial } from './fxMaterial'

const base = (floats: Record<string, number>, colors: Record<string, number[]> = {}): FxMaterialData => ({
  name: 't',
  shader: 'FxSystem/Particle',
  keywords: [],
  floats: { _MultiTextureMode: 2, ...floats },
  colors,
  textures: { _Texture0: { name: 'a', size: [4, 4], scale: [1, 1], offset: [0, 0] }, _Texture1: { name: 'b', size: [4, 4], scale: [1, 1], offset: [0, 0] } },
} as unknown as FxMaterialData)

describe('셰이더 기능 명세', () => {
  it('깊이 페이드는 `_SoftParticleFadeParams`를 그대로 읽는다', () => {
    const s = readMaterial(base({ _SoftParticlesEnabled: 1 }, { _SoftParticleFadeParams: [0.01, 2.5641, 0, 0] }), null)
    expect(s.soft).toEqual({ near: 0.01, scale: 2.5641 })
    expect(readMaterial(base({}), null).soft).toBeNull()
  })

  it('프레넬 · 줄무늬 · 스피어맵 · 왜곡이 읽힌다', () => {
    const s = readMaterial(base(
      { _FresnelAlphaType: 1, _StripeEnabled: 1, _SphereMapEnabled_Tex1: 1, _Distortion: 2 },
      { _FresnelAlphaRef: [0, 0.6, 0, 0], _StripeColor0: [1, 0, 0, 1], _StripeColor1: [0, 0, 1, 1], _DistortionStrengthScaled: [0.05, 0.08, 0, 0] },
    ), null)
    expect(s.fresnel).toEqual({ x: 0, y: 0.6 })
    expect(s.stripe?.c1).toEqual([0, 0, 1, 1])
    expect(s.sphere).toEqual([false, true])
    expect(s.distortion).toEqual({ mode: 2, x: 0.05, y: 0.08 })
    expect(s.todo).toEqual([])
  })

  it('기능마다 셰이더 열쇠가 갈리고, 같은 조합은 열쇠가 같다 (파이프라인 공유)', () => {
    const keys = ([{}, { _SoftParticlesEnabled: 1 }, { _FresnelAlphaType: 1 }, { _StripeEnabled: 1 }, { _SphereMapEnabled_Tex0: 1 }, { _Distortion: 2 }] as Record<string, number>[])
      .map((f) => materialKey(readMaterial(base(f), null)))
    expect(new Set(keys).size).toBe(keys.length)
    // 값만 다른 재질은 같은 열쇠 — 유니폼으로 갈린다
    const a = materialKey(readMaterial(base({ _SoftParticlesEnabled: 1 }, { _SoftParticleFadeParams: [0.01, 2, 0, 0] }), null))
    const b = materialKey(readMaterial(base({ _SoftParticlesEnabled: 1 }, { _SoftParticleFadeParams: [0.5, 9, 0, 0] }), null))
    expect(a).toBe(b)
  })

  it('모든 기능을 켠 재질의 노드 그래프가 지어진다 (판 · 메시 둘 다)', () => {
    const spec = readMaterial(base(
      { _SoftParticlesEnabled: 1, _FresnelAlphaType: 1, _StripeEnabled: 1, _SphereMapEnabled_Tex0: 1, _Distortion: 2 },
      { _SoftParticleFadeParams: [0.01, 2, 0, 0], _FresnelAlphaRef: [0, 0.6, 0, 0] },
    ), null)
    const maps = [new Texture(), new Texture()]
    expect(() => buildFxMaterial(spec, maps, false)).not.toThrow()
    expect(() => buildFxMaterial(spec, maps, true)).not.toThrow()
  })
})
