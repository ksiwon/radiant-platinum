// 입자 자료(`.spa`)를 롬에서 **자르기만** 해서 싣는다 (DATA.md §2.28).
//
// ⚠️ **여기서 아무것도 바꾸지 않는다.** 원작 바이트를 그대로 옮기고 읽는 것은
// 실행 중에 `engine/battle/spl/resource`가 한다 — 그래서 굽는 쪽 둘이 자동으로
// 같아진다(「굽는 쪽이 둘이다」 규칙을 제일 싸게 지키는 길이다). 자료가 다 합쳐
// 2.7MiB뿐이라 미리 풀어 둘 값이 없다.
//
// ⚠️ **NARC 여덟을 통째로 옮기지 않는다.** 멤버를 이어 붙이고 자리표를 따로
// 둔다 — NARC 머리(FATB/FNTB/FIMG)를 우리가 다시 읽을 이유가 없고, 설치본의
// 파일 수도 623개가 아니라 아홉이 된다.
import { narcCount, narcEntry } from './nds'
import type { ConvertContext, Produced } from './convertTypes'

/** 입자가 든 NARC 여덟 (`platinum.us/filesys.csv`) */
export const PARTICLE_NARCS = [
  /** 기술 연출 488 + 조우 이펙트 12 + 맞음·레벨업 */
  { name: 'waza', path: '/wazaeffect/effectdata/waza_particle.narc' },
  /** 몬스터볼 던지고 터지는 것 */
  { name: 'ball', path: '/wazaeffect/effectdata/ball_particle.narc' },
  /** 알에서 깨어날 때 */
  { name: 'egg', path: '/demo/egg/data/particle/egg_demo_particle.narc' },
  /** 진화 무대 */
  { name: 'evolve', path: '/demo/shinka/data/particle/shinka_demo_particle.narc' },
  { name: 'frontier', path: '/particledata/pl_frontier/frontier_particle.narc' },
  /** 파티 화면의 폼 변화 */
  { name: 'formChange', path: '/particledata/pl_pokelist/pokelist_particle.narc' },
  { name: 'etc', path: '/particledata/pl_etc/pl_etc_particle.narc' },
  { name: 'common', path: '/particledata/particledata.narc' },
] as const

/** 바이트로 ` `·A·P·S. 리틀엔디언 u32로 읽은 값이다 */
const MAGIC = 0x53504120

/** 자리표 한 줄 — 멤버가 어디서 시작해 몇 바이트인가 */
interface ParticlePack {
  /** 멤버마다의 시작 자리. 길이가 곧 멤버 수다 */
  readonly at: readonly number[]
  readonly size: readonly number[]
}

export type ParticleIndex = Record<string, ParticlePack>

/**
 * NARC 하나를 이어 붙인다.
 *
 * ⚠️ **`.spa`가 아닌 멤버가 있으면 선다.** 지금 롬에는 623개가 623개 다
 * `.spa`인데, 조용히 건너뛰면 번호가 밀려서 **대본이 엉뚱한 입자를 부른다** —
 * 대본이 주는 것이 이름이 아니라 멤버 번호이기 때문이다
 */
export function packNarc(narc: Uint8Array, label: string): {
  bytes: Uint8Array
  pack: ParticlePack
} {
  const count = narcCount(narc)
  if (count === null) throw new Error(`${label}이 NARC가 아니다`)
  const at: number[] = []
  const size: number[] = []
  const parts: Uint8Array[] = []
  let total = 0
  for (let i = 0; i < count; i++) {
    const member = narcEntry(narc, i)
    if (!member) throw new Error(`${label} ${String(i)}번이 없다`)
    if (member.length < 32) throw new Error(`${label} ${String(i)}번이 ${String(member.length)}바이트뿐이다`)
    const head = new DataView(member.buffer, member.byteOffset, member.byteLength)
    if (head.getUint32(0, true) !== MAGIC) {
      throw new Error(`${label} ${String(i)}번이 .spa가 아니다 — 번호가 밀린다`)
    }
    at.push(total)
    size.push(member.length)
    parts.push(member)
    total += member.length
  }
  const bytes = new Uint8Array(total)
  let o = 0
  for (const p of parts) { bytes.set(p, o); o += p.length }
  return { bytes, pack: { at, size } }
}

export async function convertParticles(ctx: ConvertContext): Promise<Produced> {
  const out: Produced = new Map()
  const index: Record<string, ParticlePack> = {}
  for (const [n, group] of PARTICLE_NARCS.entries()) {
    const narc = await ctx.fs.read(group.path)
    if (!narc) throw new Error(`${group.path}을 못 읽었다`)
    const { bytes, pack } = packNarc(narc, group.name)
    out.set(`data/particles/${group.name}.bin`, bytes)
    index[group.name] = pack
    ctx.onProgress?.(n + 1, PARTICLE_NARCS.length)
  }
  out.set('data/particles/index.json',
    new TextEncoder().encode(`${JSON.stringify(index)}\n`))
  return out
}
