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
//
// ⚠️ **입자가 아닌 묶음이 하나 끼어 있다 — `statChange`.** 능력 변화 연출
// (`BATTLE_ANIMATION_STAT_BOOST`·`STAT_DROP`)은 입자가 아니라 **배경 무늬 한 장**을
// 몸 실루엣 안에서 흘린다 (`battle_anim/script_funcs_stat_change.c`). 그 무늬가
// `pl_batt_bg.narc`의 멤버 열둘이고, 같은 연출 계통이라 같은 자리표에 싣는다 —
// 입자 묶음과 똑같이 **자르기만** 하고 푸는 것은 실행 중에 `statChangePattern`이 한다.
import { narcCount, narcEntry } from './nds'
import { chars, maybeLz77, palettes, screen, screenCell, drawTile, TILE } from './ntrgfx'
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

/**
 * 능력 변화 무늬 (`script_funcs_stat_change.c`의 `sStatChangeNarcMemberTable`).
 *
 * 줄 번호가 원작 표의 차례 그대로다 — `Func_StatChangeUp`이 0, `Func_StatChangeDown`이 1,
 * `Func_StatChangeHeal`이 2, `Func_StatChangeMetal`이 3을 부른다 (`btlanimfunc.inc`의
 * `CallFunc 80, 0` · `CallFunc 81, 1` …). 한 줄이 타일(NCGR) · 팔레트(NCLR) · 배치(NSCR)
 * 셋이다 — 원작 표의 넷째 칸은 배치와 같은 번호라 안 싣는다.
 *
 * 묶음 안 멤버 번호는 `줄 × 3 + {0 타일 · 1 팔레트 · 2 배치}`다
 */
export const STAT_CHANGE_BG = {
  name: 'statChange',
  path: '/battle/graphic/pl_batt_bg.narc',
  table: [
    [0x3c, 0x122, 0x3d],
    [0x36, 0x11f, 0x37],
    [0x38, 0x120, 0x39],
    [0x3a, 0x121, 0x3b],
  ],
} as const

/** 무늬 줄 — `STAT_CHANGE_BG.table`의 차례 */
export type StatChangeRow = 0 | 1 | 2 | 3

/**
 * NARC에서 **고른 멤버만** 차례대로 이어 붙인다. 원작 바이트 그대로다(LZ77로 눌린 채)
 *
 * ⚠️ **없는 멤버가 있으면 선다.** 조용히 건너뛰면 `줄 × 3`이 밀려 팔레트 자리에서
 * 타일을 읽는다
 */
export function packMembers(narc: Uint8Array, members: readonly number[], label: string): {
  bytes: Uint8Array
  pack: ParticlePack
} {
  const at: number[] = []
  const size: number[] = []
  const parts: Uint8Array[] = []
  let total = 0
  for (const m of members) {
    const member = narcEntry(narc, m)
    if (!member || member.length === 0) throw new Error(`${label} ${String(m)}번이 없다`)
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

/** 무늬 한 장의 크기. 화면이 보는 왼쪽 256폭 × 배치 전체 높이다 */
export const STAT_CHANGE_W = 256
export const STAT_CHANGE_H = 512

/**
 * 묶음에서 무늬 한 장을 RGBA로 편다 (`StatChangeContext_LoadBg`).
 *
 * 원작은 타일·배치를 `BATTLE_BG_BASE`에 싣고 팔레트를 **8번 칸**에 붓는다
 * (`PLTT_DEST(BATTLE_BG_PALETTE_MON_SPRITE)`). 배치의 칸들이 전부 그 8번을 가리키므로
 * 파일의 첫 벌이 곧 그 칸이다 — 다른 칸을 가리키는 배치면 던진다.
 *
 * ⚠️ **왼쪽 256폭만 편다.** 배치는 64×64칸(512×512)인데 오른쪽 절반은 빈 칸(0번 타일 ·
 * 0번 팔레트)이고, DS 화면이 256폭이라 원작에서 그 절반은 안 보인다 (`Bg_SetOffset`의
 * X가 늘 0). 무늬의 되풀이(32·64픽셀)가 256과 512를 나누므로 이 한 장을 되풀이해 깔면
 * 끊김이 없다 — 우리 화면이 DS보다 넓은 만큼은 그 되풀이가 메운다
 *
 * ⚠️ **0번 색은 뚫는다.** BG의 0번은 투명이다 — 다만 이 무늬 넷에는 0번 픽셀이 하나도
 * 없다 (`particles.test`가 잰다)
 */
export function statChangePattern(
  bytes: Uint8Array, pack: ParticlePack, row: StatChangeRow,
): Uint8Array {
  const member = (k: number): Uint8Array => {
    const i = row * 3 + k
    const start = pack.at[i], size = pack.size[i]
    if (start === undefined || size === undefined) throw new Error(`statChange ${String(i)}번이 자리표에 없다`)
    return maybeLz77(bytes.subarray(start, start + size))
  }
  const tiles = chars(member(0)).data
  const pal = palettes(member(1))[0]
  if (pal === undefined) throw new Error('statChange 팔레트가 비었다')
  const scr = screen(member(2))
  const rgba = new Uint8Array(STAT_CHANGE_W * STAT_CHANGE_H * 4)
  for (let cy = 0; cy < STAT_CHANGE_H / TILE; cy++) {
    for (let cx = 0; cx < STAT_CHANGE_W / TILE; cx++) {
      const cell = screenCell(scr, cx, cy)
      if (cell >> 12 !== BG_PALETTE_MON_SPRITE) {
        throw new Error(`statChange 배치가 팔레트 ${String(cell >> 12)}번을 가리킨다 — 8번이라야 한다`)
      }
      drawTile(rgba, STAT_CHANGE_W, cx * TILE, cy * TILE, tiles, cell & 0x3ff, pal, {
        hflip: (cell & 0x400) !== 0, vflip: (cell & 0x800) !== 0, alphaZero: true,
      })
    }
  }
  return rgba
}

/** `BATTLE_BG_PALETTE_MON_SPRITE` (`constants/battle/battle_anim.h`) */
const BG_PALETTE_MON_SPRITE = 8

export async function convertParticles(ctx: ConvertContext): Promise<Produced> {
  const out: Produced = new Map()
  const index: Record<string, ParticlePack> = {}
  const steps = PARTICLE_NARCS.length + 1
  for (const [n, group] of PARTICLE_NARCS.entries()) {
    const narc = await ctx.fs.read(group.path)
    if (!narc) throw new Error(`${group.path}을 못 읽었다`)
    const { bytes, pack } = packNarc(narc, group.name)
    out.set(`data/particles/${group.name}.bin`, bytes)
    index[group.name] = pack
    ctx.onProgress?.(n + 1, steps)
  }
  {
    const narc = await ctx.fs.read(STAT_CHANGE_BG.path)
    if (!narc) throw new Error(`${STAT_CHANGE_BG.path}을 못 읽었다`)
    const { bytes, pack } = packMembers(narc, STAT_CHANGE_BG.table.flat(), STAT_CHANGE_BG.name)
    out.set(`data/particles/${STAT_CHANGE_BG.name}.bin`, bytes)
    index[STAT_CHANGE_BG.name] = pack
    ctx.onProgress?.(steps, steps)
  }
  out.set('data/particles/index.json',
    new TextEncoder().encode(`${JSON.stringify(index)}\n`))
  return out
}
