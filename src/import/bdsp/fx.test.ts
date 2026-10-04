// BDSP 배틀 이펙트 굽기 — 진짜 번들로 (docs/orders/BATTLE_FX_20261004.md §4)
//
// 기대값은 지어낸 것이 아니라 **조사용 파이썬 덤프**(스크래치 `bdspfx/dumpprefab.py` — UnityPy `read_typetree`)가 같은 번들에서
// 뽑은 값이다. 그 덤프와 이 굽는 쪽을 통째로 맞대 본 결과 eb001_capture 6,844칸 · eb001_ballout 8,118칸 · ew033_df_hit 3,706칸에서
// 다른 것은 열쇠 이름(`simulationSpace` 등) · 렌더러 `enabled`의 꼴(0/1 → 참/거짓) · 하위 방출기 참조(PathID → 노드 경로)뿐이었다
import { it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openEnvironment } from './environment'
import { FxTextures, bakeFxPrefab, bakeSequence, prefabsOf, type FxPrefab } from './fx'
import { bdspDir, withLocal } from '../../data/romData.testkit'

const AA = bdspDir('root')
const at = (...rel: string[]): string | null => (AA ? join(AA, ...rel) : null)
const PREFAB = (name: string): string | null => at('Effects', 'effect', 'prefab', 'battle', name)
const bytes = (path: string | null): Uint8Array => new Uint8Array(readFileSync(path!))

const suite = withLocal(
  'BDSP 배틀 이펙트', PREFAB('eb001_capture'), PREFAB('ee002_lvup'), at('Effects', 'fxparticle'), at('Effects', 'effect_common'),
  at('Battle', 'btlv', 'waza', 'sequence', 'ee101'),
)

type Node = FxPrefab['roots'][number]
type Comp = Record<string, unknown> & { type: string }
const flat = (n: Node, out: Node[] = []): Node[] => {
  out.push(n)
  for (const c of n.children) flat(c, out)
  return out
}
const comp = (n: Node, type: string): Comp => n.components.find((c) => (c as Comp).type === type) as Comp

async function bake(...names: string[]): Promise<{ prefabs: Map<string, FxPrefab>, textures: FxTextures, problems: string[] }> {
  const shared = openEnvironment([bytes(at('Effects', 'fxparticle')), bytes(at('Effects', 'effect_common'))])
  const textures = new FxTextures(() => {}, 256)
  const prefabs = new Map<string, FxPrefab>()
  const problems: string[] = []
  for (const n of names) {
    const got = await bakeFxPrefab(n, bytes(PREFAB(n)), shared, textures)
    prefabs.set(n, got.prefab)
    problems.push(...got.problems)
  }
  return { prefabs, textures, problems }
}

suite('배틀 이펙트', () => {
  it('eb001_capture — 노드 15 · 파티클 13 · 힘장 2, 덤프와 같은 값', async () => {
    const { prefabs, textures, problems } = await bake('eb001_capture')
    expect(problems).toEqual([])
    const p = prefabs.get('eb001_capture')!
    expect(p.roots).toHaveLength(1)
    const nodes = flat(p.roots[0]!)
    expect(nodes).toHaveLength(15)
    const types = nodes.flatMap((n) => n.components.map((c) => (c as Comp).type))
    expect(types.filter((t) => t === 'ParticleSystem')).toHaveLength(13)
    expect(types.filter((t) => t === 'ParticleSystemForceField')).toHaveLength(2)
    expect(textures.info.has('fxpt_1_circle005_m')).toBe(true)

    const byName = new Map(nodes.map((n) => [n.name, n]))
    const tubu = byName.get('tubu_add')!
    const r = comp(tubu, 'ParticleSystemRenderer')
    expect(r.renderMode).toBe('Stretch')
    expect(r.sortingFudge).toBe(-1)
    expect(r.velocityScale).toBe(0.02)
    expect(r.pivot).toEqual([0, 0.25, 0])
    expect(r.vertexStreams).toEqual(['Position', 'Normal', 'Color', 'UV', 'UV2', 'Custom1XYZW', 'Custom2XYZW', 'AgePercent', 'InvStartLifetime', 'AnimFrame'])
    const mat = (r.materials as Record<string, unknown>[])[0]!
    expect(mat.shader).toBe('FxSystem/Particle')
    expect(mat.renderQueue).toBe(3000)
    expect((mat.keywords as string[])).toHaveLength(17)
    expect(mat.blend).toEqual({ color: ['SrcAlpha', 'OneMinusSrcAlpha'], alpha: ['One', 'Zero'], opColor: 0, opAlpha: 0 })
    expect(mat.cull).toBe(2)
    expect((mat.floats as Record<string, number>)._ColorScale).toBe(1.25)
    expect((mat.textures as Record<string, unknown>)._Texture0).toEqual({ name: 'fxpt_1_circle005_m', size: [128, 128], scale: [2, 2], offset: [0, 1] })

    const ps = comp(tubu, 'ParticleSystem') as Record<string, Record<string, unknown>> & Comp
    expect(ps.lengthInSec).toBe(0.1)
    expect(ps.simulationSpace).toBe(1)
    expect(ps.InitialModule!.startSpeed).toEqual({ const: 24 })
    expect(ps.InitialModule!.startLifetime).toEqual({ randMin: 0.25, randMax: 0.5 })
    expect((ps.SizeModule!.curve as { curve: number[][] }).curve[1]).toEqual([0.11, 7.04, 46.27273, 12.66667])
    expect((ps.EmissionModule!.m_Bursts as unknown[])).toHaveLength(1)
    expect(ps.ShapeModule!.typeName).toBe('Sphere')
    expect(ps.ShapeModule!.m_Rotation).toEqual([2e-5, 180, 270])
    expect(ps.ExternalForcesModule!.multiplierCurve).toEqual({ const: 3 })
    // 힘장은 PathID가 아니라 노드 경로로 (뿌리 기준)
    expect(ps.ExternalForcesModule!.influenceList).toEqual(['tubu_add/tubu_add_Magnet'])
    expect((ps.CustomDataModule!.color0 as Record<string, unknown>).randColorMin).toEqual([0.53442, 0, 1, 1])
    expect(ps.VelocityModule!.orbitalZ).toEqual({ const: -8 })
    expect(ps.ClampVelocityModule!.dampen).toBe(0.14706)

    const field = comp(byName.get('tubu_add_Magnet')!, 'ParticleSystemForceField') as unknown as { fields: { m_Parameters: Record<string, unknown> } }
    expect(field.fields.m_Parameters.m_GravityCurve).toEqual({ const: 0.48 })
    expect(field.fields.m_Parameters.m_EndRange).toBe(5)

    // 하위 방출기도 노드 경로로
    const sub = comp(byName.get('flash_sub')!, 'ParticleSystem') as Record<string, Record<string, unknown>>
    expect((sub.SubModule!.subEmitters as { emitter: unknown }[])[0]!.emitter).toBe('flash_sub/flash_many_Child')

    // 메시는 그 자리에 싣는다 — 링 205정점 (공용 번들 `effect_common`에 있다)
    const ring = comp(byName.get('ring_aura')!, 'ParticleSystemRenderer')
    expect(ring.renderMode).toBe('Mesh')
    const m = ring.mesh as { name: string, positions: number[], uvs: number[], indices: number[] }
    expect(m.name).toBe('fx_cmn_ring01')
    expect(m.positions).toHaveLength(205 * 3)
    expect(m.uvs).toHaveLength(205 * 2)
    expect(m.indices.length % 3).toBe(0)
    expect(Math.max(...m.indices)).toBeLessThan(205)
  }, 60_000)

  it('ee002_lvup — 애니메이터 기본 상태의 클립이 파티클 모양 크기를 민다', async () => {
    const { prefabs, problems } = await bake('ee002_lvup')
    expect(problems).toEqual([])
    const nodes = flat(prefabs.get('ee002_lvup')!.roots[0]!)
    const owner = nodes.find((n) => n.components.some((c) => (c as Comp).type === 'Animator'))!
    expect(owner.name).toBe('line_flash')
    const a = comp(owner, 'Animator') as unknown as { clip: { state: string, stop: number, sampleRate: number, curves: { path: string, component: string, attribute: string, keys: number[][] }[] } }
    expect(a.clip.state).toBe('ee002_lvup-line_flash')
    expect(a.clip.stop).toBe(0.66667)
    expect(a.clip.curves.map((c) => c.attribute)).toEqual(['ShapeModule.m_Scale.x', 'ShapeModule.m_Scale.y', 'ShapeModule.m_Scale.z'])
    expect(a.clip.curves.every((c) => c.path === 'line_flash' && c.component === 'ParticleSystem')).toBe(true)
    // 0.02에서 머물다 1/3초부터 0.18까지 곧게 (기울기 0.48). `null` 기울기는 계단 — 머무는 구간이라 값은 같다
    expect(a.clip.curves[0]!.keys).toEqual([[0, 0.02, null, 0], [0.33333, 0.02, null, 0.48], [0.66667, 0.18, 0.48, 0]])
  }, 60_000)

  it('ee101 — 켜진 명령만 싣고, 파티클 파일을 프리팹 이름으로 푼다', () => {
    const env = openEnvironment([bytes(at('Battle', 'btlv', 'waza', 'sequence', 'ee101'))])
    const mono = env.entries.find((e) => e.object.classId === 114)!
    const seq = bakeSequence(env.readEntry(mono) as Record<string, never>)
    expect(seq.name).toBe('ee101')
    const commands = seq.groups.flatMap((g) => g.commands)
    expect(commands.length).toBeGreaterThan(0)
    const trail = commands.find((c) => c.name === 'ParticleCreate' && c.values.file?.[0] === 'ee100/ee101_01_ball_fol01.ptcl')!
    expect([trail.start, trail.end]).toEqual([9, 25])
    expect(prefabsOf(seq)).toContain('ee101_01_ball_fol01')
    // 조건부 묶음은 0이 아닌 옵션만 남는다 — 「표시 제어」 묶음이 옵션 0 = 2
    expect(seq.groups.find((g) => g.name === '表示制御')?.options).toEqual([[0, 2]])
  })
})
