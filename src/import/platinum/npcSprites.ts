// 오버월드 NPC 판때기 — 브라우저에서 (DATA.md §2.16)
//
// 배치표가 들고 있는 `sprite` 번호에서 `mmodel.narc` 파일 번호로 가는 길은
// **산술이 아니라 찾아보기 표 셋**이고, 그 셋은 전부 디컴프에만 있다. 그래서
// 여기서는 `spriteTable.ts`에 구워 둔 결과를 쓴다 — 롬에는 그 다리가 없다.
//
// 그림은 32×32 몇 장짜리 판때기다. 방향과 걸음은 모델이 아니라 **텍스처를 갈아
// 끼워서** 만든다. 어느 장을 언제 쓰는지는 `frame_sequences/*.bin`이 주는데,
// 그 파일도 같은 NARC 안에 있다 (표의 `seq` 멤버).
//
// ⚠️ **노드 쪽(`tools/extract/npcSprites.js`)과 한 줄씩 같아야 한다.**
import { narcEntry } from './nds'
import { parseTex0, decode, type Tex0, type TexEntry } from './nitrotex'
import { readDict } from './nsbmd'
import { encodePng } from './png'
import { SPRITE_TABLE, SPRITE_MEMBER_COUNT, type SpriteRow } from './spriteTable'
import { placedSprites } from './scripts'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

const MMODEL = '/data/mmodel/mmodel.narc'
/** 사람이 걷는 데 필요한 방향 넷. `constants/map_object.h`의 DIR_* 순서다 */
const DIRS = 4
/** 주인공은 배치표에 안 선다 — 남녀 둘 다 있어야 한다 */
const PLAYERS = ['PLAYER_M', 'PLAYER_F']

/** BMD0/BTX0 안에서 TEX0 블록 자리를 찾는다. 없으면 -1 */
function texBlock(buf: Uint8Array, view: DataView): number {
  for (let i = 0, n = view.getUint16(14, true); i < n; i++) {
    const at = view.getUint32(16 + i * 4, true)
    if (String.fromCharCode(buf[at]!, buf[at + 1]!, buf[at + 2]!, buf[at + 3]!) === 'TEX0') return at
  }
  return -1
}

/**
 * `frame_sequences/*.bin`을 푼다.
 *
 * ```
 * u32 count
 * u16 tick[count]     프레임이 시작하는 틱
 * u8  texture[count]  그때 쓸 텍스처 번호
 * u8  unused[count]
 * ```
 * 크기가 `4 + 4×count`라 count가 다른 두 파일(16·32)로 맞춰 확인된다
 */
export function frameSequence(buf: Uint8Array): { ticks: number[], textures: number[] } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const count = view.getUint32(0, true)
  const want = 4 + count * 4
  if (buf.byteLength !== want) {
    throw new Error(`프레임 차례 크기가 ${String(buf.byteLength)}, ${String(want)}여야 한다`)
  }
  const ticks: number[] = []
  const textures: number[] = []
  for (let i = 0; i < count; i++) {
    ticks.push(view.getUint16(4 + i * 2, true))
    textures.push(buf[4 + count * 2 + i]!)
  }
  return { ticks, textures }
}

/** 텍스처 이름이 `<밑이름>.<번호>`라 사전은 글자순이다. 번호순으로 되돌린다 */
export function byFrameNumber(textures: readonly TexEntry[]): { t: TexEntry, i: number }[] {
  return textures
    .map((t, i) => ({ t, i, n: Number(/\.(\d+)$/.exec(t.name)?.[1] ?? 0) }))
    .sort((a, b) => a.n - b.n)
}

/**
 * 표가 밀렸는지 이름으로 본다.
 *
 * ⚠️ **여기서 어긋나면 아래는 전부 헛것이다.** `meson.build`이 파일마다 nsbtx 안
 * 텍스처 이름을 적어 두었고 그것이 표의 마지막 칸이다. 롬에서 꺼낸 이름과 맞대면
 * 396칸이 396칸 다 맞는다 — 우연일 수 없는 수다. 하나라도 어긋나면 엉뚱한 사람이
 * 마을에 선다
 */
function verifyNames(narc: Uint8Array): number {
  const mismatch: string[] = []
  let named = 0
  for (const [, name, member, , , texture] of SPRITE_TABLE) {
    if (texture === null) continue
    const buf = narcEntry(narc, member)
    if (!buf) { mismatch.push(`${name} 멤버 ${String(member)}이 없다`); continue }
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const at = texBlock(buf, view)
    const got = at < 0
      ? []
      : readDict(buf, view, at + view.getUint16(at + 0x0e, true)).map((e) => e.name)
    if (got.length > 0 && got.every((s) => s === texture || s.startsWith(`${texture}.`))) named++
    else mismatch.push(`${name}(${String(member)}) 기대=${texture} 실제=${got.slice(0, 2).join(',')}`)
  }
  if (mismatch.length > 0) {
    throw new Error(
      `텍스처 이름이 ${String(mismatch.length)}칸 어긋났다 — 표가 밀렸다: ${mismatch.slice(0, 3).join(' / ')}`,
    )
  }
  return named
}

interface Manifest {
  name: string
  w: number
  h: number
  frames: number
  seq: { ticks: number[], frames: number[] } | null
  anims: readonly (readonly [number, number, number])[] | null
  directional: boolean
}

export async function convertNpcSprites(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read(MMODEL)
  if (!narc) throw new Error(`${MMODEL}을 못 읽었다`)

  // 개수부터 맞춘다. 다르면 표의 멤버 번호가 통째로 헛것이다
  let count = 0
  while (narcEntry(narc, count)) count++
  if (count !== SPRITE_MEMBER_COUNT) {
    throw new Error(
      `mmodel.narc ${String(count)}개 ≠ 표가 아는 ${String(SPRITE_MEMBER_COUNT)}칸`,
    )
  }
  verifyNames(narc)
  check(ctx)

  const rows = new Map<number, SpriteRow>(SPRITE_TABLE.map((r) => [r[0], r]))
  const used = await placedSprites(ctx)
  for (const who of PLAYERS) {
    const row = SPRITE_TABLE.find((r) => r[1] === who)
    if (row && !used.has(row[0])) used.set(row[0], 0)
  }

  const out: Produced = new Map()
  const manifest: Record<number, Manifest> = {}
  const seqCache = new Map<number, { ticks: number[], textures: number[] } | null>()
  const ids = [...used.keys()].sort((a, b) => a - b)
  let done = 0
  for (const gfx of ids) {
    done++
    const row = rows.get(gfx)
    // 사람이 아닌 것(열매나무·파수꾼)은 표에 없다. 그것까지 그리지는 않는다
    if (!row) continue
    const buf = narcEntry(narc, row[2])
    if (!buf) continue
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const at = texBlock(buf, view)
    if (at < 0) continue

    const tex0: Tex0 = parseTex0(buf, at)
    const frames = byFrameNumber(tex0.textures)
    const first = frames[0]!.t
    const pal = tex0.palettes[0]!
    const w = first.width
    const h = first.height

    // 프레임을 가로로 이어 붙인 한 줄 아틀라스
    const atlas = new Uint8Array(w * frames.length * h * 4)
    for (let k = 0; k < frames.length; k++) {
      const rgba = decode(tex0, frames[k]!.t, pal.offset)
      for (let y = 0; y < h; y++) {
        const from = y * w * 4
        atlas.set(rgba.subarray(from, from + w * 4), (y * w * frames.length + k * w) * 4)
      }
    }
    out.set(`data/npc/${String(gfx)}.png`, await encodePng(atlas, w * frames.length, h))

    // 어느 틱에 어느 장을 쓰는가. 텍스처 번호는 사전 차례라 아틀라스 차례로 옮긴다
    let seq: Manifest['seq'] = null
    const seqMember = row[3]
    if (seqMember !== null) {
      if (!seqCache.has(seqMember)) {
        const bin = narcEntry(narc, seqMember)
        seqCache.set(seqMember, bin ? frameSequence(bin) : null)
      }
      const raw = seqCache.get(seqMember)!
      if (raw !== null) {
        const slot = raw.textures.map((t) => frames.findIndex((f) => f.i === t))
        if (!slot.includes(-1)) seq = { ticks: raw.ticks, frames: slot }
      }
    }

    manifest[gfx] = {
      name: row[1],
      w, h, frames: frames.length,
      seq,
      anims: row[4],
      // 앞의 네 동작이 곧 북·남·서·동이다 (`constants/map_object.h`의 DIR_*).
      // 넷보다 많은 것이 있다 — 주인공은 걷기 넷 + 달리기 넷이고 간호사는 넷에
      // 인사 하나가 더 붙는다. **차례표가 있어야** 방향마다 그림이 갈린다:
      // 바위도 걷기 동작표를 달고 있지만 장이 하나뿐이라 늘 같은 그림이다
      directional: seq !== null && row[4] !== null && row[4].length >= DIRS,
    }
    if (done % 8 === 0) { check(ctx); ctx.onProgress?.(done, ids.length); await breathe(ctx) }
  }

  ctx.onProgress?.(ids.length, ids.length)
  out.set('data/npcSprites.json', json(manifest))
  return out
}
