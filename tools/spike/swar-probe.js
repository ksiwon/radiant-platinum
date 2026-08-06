// SWAR/SWAV 자리 재기 (DATA.md §2.18)
//
// 지난번엔 SWAR 안 표본 헤더 자리를 잘못 짚어서 길이가 터무니없이 나왔다.
// 여기서는 **가설을 세우고 874개 전부에서 항등식이 성립하는 자리를 찾는다** —
// `(loopOffset + nonLoopLength) × 4`가 다음 표본까지의 거리(마지막은 파일 끝)와
// 맞아야 한다. 한 자리라도 밀리면 874개가 전부 어긋난다.
'use strict'
const fs = require('fs')
const path = require('path')
const { ROOT } = require('../extract/rom')

const SDAT = path.join(ROOT, 'raw/extracted/us/pl_sound_data.sdat')

function openSdat(file) {
  const buf = fs.readFileSync(file)
  const blocks = {}
  for (let i = 0; i < 4; i++) {
    const off = buf.readUInt32LE(0x10 + i * 8)
    if (off) blocks[buf.toString('latin1', off, off + 4).trim()] = off
  }
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
  return { buf, blocks, records, file: file_ }
}

const sdat = openSdat(SDAT)
// WAVEARC INFO는 3번 목록이다 (SEQ 0, SEQARC 1, BANK 2, WAVEARC 3)
const arcs = sdat.records(3)
console.log(`WAVEARC 레코드 ${arcs.filter(Boolean).length}개`)

// 첫 창고를 손으로 뜯어 본다
const first = arcs.find(Boolean)
const fileId = sdat.buf.readUInt16LE(first)
const swar = sdat.file(fileId)
console.log(`첫 창고: fileId=${fileId} 크기=${swar.length}`)
console.log(`  매직=${JSON.stringify(swar.toString('latin1', 0, 4))}` +
  ` 파일크기필드=${swar.readUInt32LE(8)} 헤더=${swar.readUInt16LE(12)} 블록=${swar.readUInt16LE(14)}`)
console.log(`  0x10 블록=${JSON.stringify(swar.toString('latin1', 0x10, 0x14))} 크기=${swar.readUInt32LE(0x14)}`)
// 예약 32바이트 뒤에 표본 개수가 있다는 가설
console.log(`  0x18~0x38 예약: ${swar.subarray(0x18, 0x38).toString('hex')}`)
console.log(`  0x38 표본수 가설=${swar.readUInt32LE(0x38)}`)
const n = swar.readUInt32LE(0x38)
const offs = []
for (let i = 0; i < n && i < 8; i++) offs.push(swar.readUInt32LE(0x3c + i * 4))
console.log(`  앞 오프셋들: ${offs.join(' ')}`)

// 전 창고에서 항등식 검사
let arcCount = 0, sampleCount = 0, bad = 0
const kinds = new Map()
for (const rec of arcs) {
  if (!rec) continue
  const w = sdat.file(sdat.buf.readUInt16LE(rec))
  if (w.toString('latin1', 0, 4) !== 'SWAR') { bad++; continue }
  arcCount++
  const count = w.readUInt32LE(0x38)
  const table = []
  for (let i = 0; i < count; i++) table.push(w.readUInt32LE(0x3c + i * 4))
  for (let i = 0; i < count; i++) {
    const at = table[i]
    const end = i + 1 < count ? table[i + 1] : w.length
    const kind = w[at]
    const loopOffset = w.readUInt16LE(at + 6)
    const nonLoop = w.readUInt32LE(at + 8)
    const declared = (loopOffset + nonLoop) * 4
    const actual = end - at - 12
    sampleCount++
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
    if (declared !== actual) bad++
  }
}
console.log(`창고 ${arcCount} · 표본 ${sampleCount} · 어긋남 ${bad}`)
console.log(`부호화별: ${[...kinds].map(([k, v]) => `${k}=${v}`).join(' ')}`)
