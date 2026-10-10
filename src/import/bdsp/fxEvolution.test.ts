// BDSP 진화 · 부화 이펙트와 알 모델 굽기 — 진짜 번들로 (메뉴 개편 P0b ⑫)
//
// `fx.ts`의 `convertBattleFx`가 필드 프리팹(`ef_f_evolution_*` · `sd9120_*`)과 알 모델(`ew121_egg00`)을 같이 굽는다. 굽는 쪽은 설치기와 노드가
// **같은 코드**라(`tools/extract/bdspFx.mjs`) 둘을 따로 맞댈 것이 없다 — 여기서는 번들을 직접 열어 그 코드가 실제로 읽히는지 본다.
import { it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { openEnvironment } from './environment'
import { exportArena } from './arena'
import { verifyGlb } from './glb'
import { FxTextures, bakeFxPrefab } from './fx'
import { encodePng } from '../platinum/png'
import { bdspDir, withLocal } from '../../data/romData.testkit'

const AA = bdspDir('root')
const at = (...rel: string[]): string | null => (AA ? join(AA, ...rel) : null)
const FIELD = at('Effects', 'effect', 'prefab', 'field')
const bytes = (path: string | null): Uint8Array => new Uint8Array(readFileSync(path!))

const suite = withLocal(
  'BDSP 진화 · 부화 이펙트', FIELD, at('Effects', 'effmodel', 'ew121_egg00'), at('Effects', 'fxparticle'), at('Effects', 'effect_common'),
)

suite('진화 · 부화 이펙트', () => {
  const names = (re: RegExp): string[] => readdirSync(FIELD!).filter((n) => re.test(n)).sort()

  it('진화 아홉 · 부화 열일곱 — 번들 이름이 약속한 수다', () => {
    expect(names(/^ef_f_evolution_/)).toEqual([
      'ef_f_evolution_flash_01', 'ef_f_evolution_ground_01', 'ef_f_evolution_impact_01', 'ef_f_evolution_ring_01',
      'ef_f_evolution_smoke_01', 'ef_f_evolution_star_01', 'ef_f_evolution_star_02', 'ef_f_evolution_star_03', 'ef_f_evolution_star_04',
    ])
    expect(names(/^sd9120_/)).toHaveLength(17)
    expect(names(/^sd9120_egg_piece/)).toEqual(['sd9120_egg_piece01', 'sd9120_egg_piece02', 'sd9120_egg_piece03', 'sd9120_egg_piece04'])
  })

  it('스물여섯 벌이 전부 문제 없이 구워진다', async () => {
    const shared = openEnvironment([bytes(at('Effects', 'fxparticle')), bytes(at('Effects', 'effect_common'))])
    const textures = new FxTextures(() => {}, 256)
    const all = [...names(/^ef_f_evolution_/), ...names(/^sd9120_/)]
    expect(all).toHaveLength(26)
    for (const name of all) {
      const got = await bakeFxPrefab(name, bytes(at('Effects', 'effect', 'prefab', 'field', name)), shared, textures)
      expect(got.prefab.roots.length, name).toBeGreaterThan(0)
      expect(got.problems, name).toEqual([])
    }
    // 그림은 이름으로 하나씩 — 진화 고리가 그림을 하나 들고 있다
    expect(textures.info.size).toBeGreaterThan(5)
  }, 120_000)

  it('알 모델 — 정점 689 · 삼각형 1,216 · 재질 하나, GLB가 온전하다', async () => {
    const env = openEnvironment([bytes(at('Effects', 'effmodel', 'ew121_egg00'))])
    const { glb, stat } = await exportArena(env, encodePng, { name: 'ew121_egg00', maxSize: 256 })
    expect(stat.problems).toEqual([])
    expect([stat.vertices, stat.triangles, stat.materials]).toEqual([689, 1216, 1])
    expect(verifyGlb(glb)).toEqual([])
    // 알은 위로 길다 (높이 0.79 · 폭 0.52)
    expect(stat.height).toBeGreaterThan(stat.width)
  }, 60_000)
})
