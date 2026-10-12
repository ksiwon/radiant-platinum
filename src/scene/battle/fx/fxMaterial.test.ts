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
    expect(s.distortion).toMatchObject({ mode: 2, x: 0.05, y: 0.08 })
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

  it('특수 컴바이너 갈래와 값 여덟 칸 · 왜곡 곡선이 읽히고 그래프가 지어진다', () => {
    const kinds: [string, string][] = [
      ['_COMBINER_ICE01', 'ice'], ['_COMBINER_LIGHTPARAM01', 'light'], ['_COMBINER_LIGHTPARAM01_MULVERTEXCOL_NORML', 'lightNormal'], ['_COMBINER_ALPHABLEND_MUL_TEX0', 'alphaMul'],
      ['_COMBINER_FRESNEL_ONECOLOR_TEX2MULTIPLY', 'fresnelOne'], ['_COMBINER_FIRE_TWOCOLOR', 'fire'],
      ['_COMBINER_ZOFFSET_SMOKE_ALPHAMASK', 'zSmoke'], ['_COMBINER_ZOFFSET_WATER_ALPHA', 'zWater'],
    ]
    const maps = [new Texture(), new Texture()]
    for (const [kw, kind] of kinds) {
      const m = base({}, { _CombinerAnim0_0: [0.4, 0.5, 0, 1], _CombinerAnim0_1: [0.9, 0.6, 0, 0], _DistortionAnim0: [0, 0, 0, 0], _DistortionAnim1: [0.5, 1, 0, 0] })
      ;(m as unknown as { keywords: string[] }).keywords = [kw, '_COMBINERANIM0']
      const spec = readMaterial(m, null)
      expect(spec.combiner.kind).toBe(kind)
      expect(spec.todo).toEqual([])
      expect(() => buildFxMaterial(spec, maps, false)).not.toThrow()
      expect(() => buildFxMaterial(spec, maps, true)).not.toThrow()
    }
    // 디졸브는 알파 식이 맡는다 — 갈래 없음 · 알리지도 않는다
    const d = base({}); (d as unknown as { keywords: string[] }).keywords = ['_COMBINER_DISSOLVE_TEX01_COL_MULTI']
    expect(readMaterial(d, null).combiner.kind).toBeNull()
    expect(readMaterial(d, null).todo).toEqual([])
  })

  it('값이 상수인 재질과 수명 곡선이 있는 재질은 셰이더 열쇠가 갈린다', () => {
    const keysOf = (extra: Record<string, number[]>) => {
      const m = base({}, extra); (m as unknown as { keywords: string[] }).keywords = ['_COMBINER_LIGHTPARAM01']
      return materialKey(readMaterial(m, null))
    }
    const same = Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`_CombinerAnim0_${String(k)}`, [1, 1, 0, 0]]))
    expect(keysOf(same)).not.toBe(keysOf({ _CombinerAnim0_0: [0.4, 0.5, 0, 1], _CombinerAnim0_1: [0.9, 0.6, 0, 0] }))
    const flat = readMaterial(base({ _Distortion: 2 }, { _DistortionAnim0: [0, 1, 0, 0], _DistortionAnim1: [1, 1, 0, 0] }), null)
    const bent = readMaterial(base({ _Distortion: 2 }, { _DistortionAnim0: [0, 0, 0, 0], _DistortionAnim1: [0.3, 1, 0, 0] }), null)
    expect(materialKey(flat)).not.toBe(materialKey(bent))
  })

  it('법선 맵 갈래(`LIGHTPARAM01_MULVERTEXCOL_NORML`)는 빛 띠 갈래와 열쇠가 갈린다 (431 · 434 · 439가 쓴다)', () => {
    const of = (kw: string) => {
      const m = base({}, { _CombinerAnim0_0: [0.05, 0.28, 0.22, 0] }); (m as unknown as { keywords: string[] }).keywords = [kw]
      return materialKey(readMaterial(m, null))
    }
    expect(of('_COMBINER_LIGHTPARAM01')).not.toBe(of('_COMBINER_LIGHTPARAM01_MULVERTEXCOL_NORML'))
    expect(of('_COMBINER_LIGHTPARAM01_MULVERTEXCOL_NORML')).toBe(of('_COMBINER_LIGHTPARAM01_MULVERTEXCOL_NORML'))
  })
})
