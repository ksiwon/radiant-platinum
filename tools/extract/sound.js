// 소리 (DATA.md §2.18)
//
// 곡은 악보고 악기는 표본이다. 넷을 이어야 소리가 난다:
//
//   SSEQ 악보(바이트코드) → SBNK 악기표 → SWAR 파형 창고 → SWAV 표본
//
// 여기서 하는 일은 둘이다. **전곡을 걸어서 형식을 확인하고**, 웹이 받을 수 있는
// 모양으로 내놓는다.
//
// ⚠️ **트랙 오프셋은 파일 처음이 아니라 시퀀스 시작(0x1c)에서 잰다.** 절대
// 주소로 읽으면 대부분의 트랙을 아예 못 밟고, 밟은 자리도 어긋난다. 그렇게
// 읽었을 때 "모르는 명령 46개 · 세기 127 넘는 음표 1414개 · 템포 최대 5057"이
// 나왔다 — **틀린 답이 그럴듯한 크기로 나온다는 것**이 이 형식의 함정이다.
'use strict'
const fs = require('fs')
const path = require('path')
const { writeJson, ROOT } = require('./rom')

const SDAT = path.join(ROOT, 'raw/extracted/us/pl_sound_data.sdat')
const OUT_DIR = path.join(ROOT, 'public/data/sound')
/** SSEQ 헤더 뒤 악보가 시작하는 자리. 트랙 오프셋의 기준점이다 */
const SEQ_BASE = 0x1c // `sseq.ts`의 `SEQ_BASE`와 같은 값이다

// ── SDAT 껍데기 ──────────────────────────────────────────────────────────────

function openSdat(file) {
  const buf = fs.readFileSync(file)
  if (buf.toString('latin1', 0, 4) !== 'SDAT') throw new Error('SDAT가 아니다')
  const blocks = {}
  for (let i = 0; i < 4; i++) {
    const off = buf.readUInt32LE(0x10 + i * 8)
    if (off) blocks[buf.toString('latin1', off, off + 4).trim()] = off
  }
  const KINDS = ['SEQ', 'SEQARC', 'BANK', 'WAVEARC', 'PLAYER', 'GROUP', 'PLAYER2', 'STRM']
  const names = {}
  if (blocks.SYMB) {
    for (let k = 0; k < 8; k++) {
      const list = blocks.SYMB + buf.readUInt32LE(blocks.SYMB + 8 + k * 4)
      const n = buf.readUInt32LE(list)
      names[KINDS[k]] = []
      for (let i = 0; i < n; i++) {
        const at = buf.readUInt32LE(list + 4 + i * 4)
        if (!at) { names[KINDS[k]].push(null); continue }
        const abs = blocks.SYMB + at
        names[KINDS[k]].push(buf.toString('latin1', abs, buf.indexOf(0, abs)))
      }
    }
  }
  /** INFO의 k번째 목록에서 레코드 주소들 */
  const records = (k) => {
    const list = blocks.INFO + buf.readUInt32LE(blocks.INFO + 8 + k * 4)
    const n = buf.readUInt32LE(list)
    const out = []
    for (let i = 0; i < n; i++) {
      const at = buf.readUInt32LE(list + 4 + i * 4)
      out.push(at ? blocks.INFO + at : null)
    }
    return out
  }
  const file_ = (id) => {
    const e = blocks.FAT + 12 + id * 16
    const off = buf.readUInt32LE(e)
    return buf.subarray(off, off + buf.readUInt32LE(e + 4))
  }
  return { buf, names, records, file: file_ }
}

// ── 악보를 걸어 본다 ─────────────────────────────────────────────────────────

/**
 * 명령 하나의 폭.
 *
 * ⚠️ **표를 여기 다시 적지 않는다.** `src/engine/audio/sseq.ts`가 정본이고
 * 시험이 그것을 못 박는다 — 두 벌을 두면 한쪽만 고치고 어긋난다
 */
const commandWidth = require('./sseqTable')

/** 가변 길이 정수. 7비트씩, 최상위 비트가 이어짐 표시 */
function varLen(buf, at) {
  let v = 0, n = 0
  for (;;) {
    const b = buf[at + n]
    n++
    v = (v << 7) | (b & 0x7f)
    if (!(b & 0x80) || n >= 4) break
  }
  return [v, n]
}

/**
 * 악보 한 곡을 훑는다. 트랙 시작·부름·뜀을 따라간다.
 *
 * 재생이 아니라 **형식 확인**이다 — 모르는 명령이 하나라도 나오면 우리가 표를
 * 잘못 아는 것이고, 세기가 127을 넘으면 한 칸 밀려 읽은 것이다
 */
function walkSeq(data) {
  const starts = [SEQ_BASE]
  // 0xfe로 시작하면 트랙 여럿이다. 이어지는 0x93이 각 트랙의 자리를 준다
  let at = SEQ_BASE
  if (data[at] === 0xfe) {
    at += 3
    while (data[at] === 0x93) {
      starts.push(SEQ_BASE + (data[at + 2] | (data[at + 3] << 8) | (data[at + 4] << 16)))
      at += 5
    }
    starts[0] = at
  }
  const seen = new Set()
  const out = { commands: 0, notes: 0, unknown: [], loudNotes: 0, tempos: [] }
  const walk = (start) => {
    let p = start
    for (let guard = 0; guard < 200000; guard++) {
      if (p >= data.length || seen.has(p)) return
      seen.add(p)
      const op = data[p]
      const w = commandWidth(op)
      out.commands++
      if (w === null) { out.unknown.push(op); return }
      if (w === 'note') {
        const vel = data[p + 1]
        if (vel > 127) out.loudNotes++
        out.notes++
        const [, n] = varLen(data, p + 2)
        p += 2 + n
        continue
      }
      if (w === 'var') { const [, n] = varLen(data, p + 1); p += 1 + n; continue }
      if (w === 'track') {
        walk(SEQ_BASE + (data[p + 2] | (data[p + 3] << 8) | (data[p + 4] << 16)))
        p += 5
        continue
      }
      if (w === 'u24') {
        const to = SEQ_BASE + (data[p + 1] | (data[p + 2] << 8) | (data[p + 3] << 16))
        if (op === 0x95) walk(to) // 부르기는 돌아온다
        p += 4
        if (op === 0x94) return // 뛰기는 안 돌아온다
        continue
      }
      if (w === 'prefix') { p += op === 0xa2 ? 1 : 3; continue }
      if (op === 0xe1) out.tempos.push(data[p + 1] | (data[p + 2] << 8))
      if (op === 0xff) return
      p += 1 + w
    }
  }
  for (const s of starts) walk(s)
  return out
}

function main() {
  if (!fs.existsSync(SDAT)) throw new Error(`SDAT가 없다: ${SDAT}`)
  const sdat = openSdat(SDAT)
  const seqs = sdat.records(0)

  // ── 전곡 확인 ──
  let songs = 0, commands = 0, notes = 0, loud = 0
  const unknown = new Map()
  let tempoLo = Infinity, tempoHi = -Infinity
  for (let i = 0; i < seqs.length; i++) {
    if (!seqs[i]) continue
    const fileId = sdat.buf.readUInt16LE(seqs[i])
    const r = walkSeq(sdat.file(fileId))
    songs++
    commands += r.commands
    notes += r.notes
    loud += r.loudNotes
    for (const op of r.unknown) unknown.set(op, (unknown.get(op) ?? 0) + 1)
    for (const t of r.tempos) { tempoLo = Math.min(tempoLo, t); tempoHi = Math.max(tempoHi, t) }
  }
  console.log(`곡 ${songs} · 푼 명령 ${commands.toLocaleString()} · 음표 ${notes.toLocaleString()}`)
  console.log(`  모르는 명령 ${unknown.size}종 · 세기 127 넘는 음표 ${loud} · 템포 ${tempoLo}~${tempoHi}`)
  if (unknown.size > 0) {
    console.log('  ' + [...unknown].map(([op, n]) => `0x${op.toString(16)}×${n}`).join(' '))
  }

  // ── 웹이 받을 것 ──
  //
  // **뜯지 않고 그대로 옮긴다.** SSEQ·SBNK·SWAR을 파싱해서 JSON으로 펴는 대신
  // 원본 바이트를 그대로 내놓고 엔진이 읽는다. 그래야 파서가 한 벌뿐이고
  // 시험이 그 한 벌을 못 박을 수 있다 — 추출기와 엔진에 파서를 각각 두면
  // 한쪽만 고쳐도 아무 데도 안 걸린다.
  const banks = sdat.records(2)
  const arcs = sdat.records(3)
  const copy = (dir, i, data) => {
    fs.mkdirSync(path.join(OUT_DIR, dir), { recursive: true })
    fs.writeFileSync(path.join(OUT_DIR, dir, `${String(i)}.bin`), data)
  }
  let bytes = 0
  for (let i = 0; i < seqs.length; i++) {
    if (!seqs[i]) continue
    const d = sdat.file(sdat.buf.readUInt16LE(seqs[i]))
    copy('seq', i, d); bytes += d.length
  }
  for (let i = 0; i < banks.length; i++) {
    if (!banks[i]) continue
    const d = sdat.file(sdat.buf.readUInt16LE(banks[i]))
    copy('bnk', i, d); bytes += d.length
  }
  for (let i = 0; i < arcs.length; i++) {
    if (!arcs[i]) continue
    const d = sdat.file(sdat.buf.readUInt16LE(arcs[i]))
    copy('war', i, d); bytes += d.length
  }

  fs.mkdirSync(OUT_DIR, { recursive: true })
  const out = writeJson('sound/index.json', {
    songs: seqs.map((rec, i) => rec === null ? null : {
      name: sdat.names.SEQ?.[i] ?? null,
      bank: sdat.buf.readUInt16LE(rec + 4),
      volume: sdat.buf[rec + 6],
    }),
    // 악기표가 고를 수 있는 파형 창고 넷. `0xffff`는 안 씀
    banks: banks.map((rec) => rec === null ? null : {
      wars: [0, 1, 2, 3].map((k) => {
        const n = sdat.buf.readUInt16LE(rec + 4 + k * 2)
        return n === 0xffff ? null : n
      }),
    }),
  })
  console.log(`악보 ${seqs.filter(Boolean).length} · 악기표 ${banks.filter(Boolean).length}` +
    ` · 파형 창고 ${arcs.filter(Boolean).length} → ${(bytes / 1024 / 1024).toFixed(1)}MB`)
  console.log(`목록 ${out.rel} (${out.kb}KB)`)
}

main()
