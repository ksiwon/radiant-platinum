// 소리 그룹 — 브라우저에서 (DATA.md §2.18)
//
// 곡은 악보고 악기는 표본이다. 넷을 이어야 소리가 난다:
//
//   SSEQ 악보(바이트코드) → SBNK 악기표 → SWAR 파형 창고 → SWAV 표본
//
// **뜯지 않고 그대로 옮긴다.** SSEQ·SBNK·SWAR을 JSON으로 펴는 대신 원본 바이트를
// 내놓고 엔진이 읽는다. 그래야 파서가 한 벌뿐이고 시험이 그 한 벌을 못 박을 수
// 있다 — 추출기와 엔진에 파서를 각각 두면 한쪽만 고쳐도 아무 데도 안 걸린다.
//
// ⚠️ 노드 쪽은 명령 폭 표를 **두 벌** 들고 있다(`tools/extract/sseqTable.js`가
// `engine/audio/sseq.ts`를 손으로 옮긴 것이다). 브라우저에는 그럴 이유가 없다 —
// 엔진 것을 그대로 부른다.
import { commandWidth, SEQ_BASE } from '../../engine/audio/sseq'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

const SDAT_PATH = '/data/sound/pl_sound_data.sdat'

const latin1 = (b: Uint8Array): string => String.fromCharCode(...b)

/** INFO 목록 번호 */
const SEQ = 0
const BANK = 2
const WAVEARC = 3

interface Sdat {
  buf: Uint8Array
  view: DataView
  names: Record<string, (string | null)[]>
  records(kind: number): (number | null)[]
  file(id: number): Uint8Array
}

export function openSdat(buf: Uint8Array): Sdat {
  if (latin1(buf.subarray(0, 4)) !== 'SDAT') throw new Error('SDAT가 아니다')
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const blocks: Record<string, number> = {}
  for (let i = 0; i < 4; i++) {
    const off = view.getUint32(0x10 + i * 8, true)
    if (off) blocks[latin1(buf.subarray(off, off + 4)).trim()] = off
  }
  const KINDS = ['SEQ', 'SEQARC', 'BANK', 'WAVEARC', 'PLAYER', 'GROUP', 'PLAYER2', 'STRM']
  const names: Record<string, (string | null)[]> = {}
  const symb = blocks.SYMB
  if (symb !== undefined) {
    for (let k = 0; k < 8; k++) {
      const list = symb + view.getUint32(symb + 8 + k * 4, true)
      const n = view.getUint32(list, true)
      const out: (string | null)[] = []
      for (let i = 0; i < n; i++) {
        const at = view.getUint32(list + 4 + i * 4, true)
        if (!at) { out.push(null); continue }
        const abs = symb + at
        let end = abs
        while (end < buf.byteLength && buf[end] !== 0) end++
        out.push(latin1(buf.subarray(abs, end)))
      }
      names[KINDS[k]!] = out
    }
  }
  const info = blocks.INFO
  const fat = blocks.FAT
  if (info === undefined || fat === undefined) throw new Error('SDAT에 INFO나 FAT이 없다')

  return {
    buf,
    view,
    names,
    /** INFO의 k번째 목록에서 레코드 주소들 */
    records(k) {
      const list = info + view.getUint32(info + 8 + k * 4, true)
      const n = view.getUint32(list, true)
      const out: (number | null)[] = []
      for (let i = 0; i < n; i++) {
        const at = view.getUint32(list + 4 + i * 4, true)
        out.push(at ? info + at : null)
      }
      return out
    },
    file(id) {
      const e = fat + 12 + id * 16
      const off = view.getUint32(e, true)
      return buf.subarray(off, off + view.getUint32(e + 4, true))
    },
  }
}

/** 가변 길이 정수. 7비트씩, 최상위 비트가 이어짐 표시 */
function varLen(buf: Uint8Array, at: number): [number, number] {
  let v = 0, n = 0
  for (;;) {
    const b = buf[at + n] ?? 0
    n++
    v = (v << 7) | (b & 0x7f)
    if (!(b & 0x80) || n >= 4) break
  }
  return [v, n]
}

interface SeqWalk {
  commands: number
  notes: number
  unknown: number[]
  loudNotes: number
  tempos: number[]
}

/**
 * 악보 한 곡을 훑는다. 트랙 시작·부름·뜀을 따라간다.
 *
 * 재생이 아니라 **형식 확인**이다 — 모르는 명령이 하나라도 나오면 우리가 표를
 * 잘못 아는 것이고, 세기가 127을 넘으면 한 칸 밀려 읽은 것이다.
 *
 * ⚠️ **트랙 오프셋은 파일 처음이 아니라 시퀀스 시작(0x1c)에서 잰다.** 절대
 * 주소로 읽으면 대부분의 트랙을 아예 못 밟고, 밟은 자리도 어긋난다. 그렇게
 * 읽었을 때 "모르는 명령 46개 · 세기 127 넘는 음표 1414개 · 템포 최대 5057"이
 * 나왔다 — **틀린 답이 그럴듯한 크기로 나온다는 것**이 이 형식의 함정이다
 */
export function walkSeq(data: Uint8Array): SeqWalk {
  const starts = [SEQ_BASE]
  // 0xfe로 시작하면 트랙 여럿이다. 이어지는 0x93이 각 트랙의 자리를 준다
  let at = SEQ_BASE
  if (data[at] === 0xfe) {
    at += 3
    while (data[at] === 0x93) {
      starts.push(SEQ_BASE + (data[at + 2]! | (data[at + 3]! << 8) | (data[at + 4]! << 16)))
      at += 5
    }
    starts[0] = at
  }
  const seen = new Set<number>()
  const out: SeqWalk = { commands: 0, notes: 0, unknown: [], loudNotes: 0, tempos: [] }
  const walk = (start: number): void => {
    let p = start
    for (let guard = 0; guard < 200_000; guard++) {
      if (p >= data.byteLength || seen.has(p)) return
      seen.add(p)
      const op = data[p]!
      const w = commandWidth(op)
      out.commands++
      if (w === null) { out.unknown.push(op); return }
      if (w === 'note') {
        if (data[p + 1]! > 127) out.loudNotes++
        out.notes++
        const [, n] = varLen(data, p + 2)
        p += 2 + n
        continue
      }
      if (w === 'var') { const [, n] = varLen(data, p + 1); p += 1 + n; continue }
      if (w === 'track') {
        walk(SEQ_BASE + (data[p + 2]! | (data[p + 3]! << 8) | (data[p + 4]! << 16)))
        p += 5
        continue
      }
      if (w === 'u24') {
        const to = SEQ_BASE + (data[p + 1]! | (data[p + 2]! << 8) | (data[p + 3]! << 16))
        if (op === 0x95) walk(to) // 부르기는 돌아온다
        p += 4
        if (op === 0x94) return // 뛰기는 안 돌아온다
        continue
      }
      if (w === 'random' || w === 'fromVar' || w === 'if') { p += op === 0xa2 ? 1 : 3; continue }
      if (op === 0xe1) out.tempos.push(data[p + 1]! | (data[p + 2]! << 8))
      if (op === 0xff) return
      p += 1 + w
    }
  }
  for (const s of starts) walk(s)
  return out
}

export async function convertSound(ctx: ConvertContext): Promise<Produced> {
  const bytes = await ctx.fs.read(SDAT_PATH)
  if (!bytes) throw new Error(`${SDAT_PATH}을 못 읽었다`)
  const sdat = openSdat(bytes)

  const seqs = sdat.records(SEQ)
  const banks = sdat.records(BANK)
  const arcs = sdat.records(WAVEARC)
  const total = seqs.length + banks.length + arcs.length

  const out: Produced = new Map()
  let done = 0
  const copy = async (dir: string, list: (number | null)[]): Promise<void> => {
    for (let i = 0; i < list.length; i++) {
      const rec = list[i]
      done++
      if (rec !== null) {
        out.set(`data/sound/${dir}/${String(i)}.bin`, sdat.file(sdat.view.getUint16(rec, true)))
      }
      if (done % 32 === 0) { check(ctx); ctx.onProgress?.(done, total); await breathe(ctx) }
    }
  }
  await copy('seq', seqs)
  await copy('bnk', banks)
  await copy('war', arcs)

  out.set('data/sound/index.json', json({
    songs: seqs.map((rec, i) => rec === null ? null : {
      name: sdat.names.SEQ?.[i] ?? null,
      bank: sdat.view.getUint16(rec + 4, true),
      volume: sdat.buf[rec + 6],
    }),
    // 악기표가 고를 수 있는 파형 창고 넷. `0xffff`는 안 씀
    banks: banks.map((rec) => rec === null ? null : {
      wars: [0, 1, 2, 3].map((k) => {
        const n = sdat.view.getUint16(rec + 4 + k * 2, true)
        return n === 0xffff ? null : n
      }),
    }),
  }))
  ctx.onProgress?.(total, total)
  return out
}
