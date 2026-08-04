// SDAT 구조 검증 스파이크 — ndspy 명세 기준 (SYMB/INFO/FAT/FILE 블록)
// 목표: SSEQ/SBNK/SWAR 열거 + 곡 이름 확인 + SSEQ 1개 추출·매직 검증
'use strict'
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..', '..')
const buf = fs.readFileSync(path.join(root, 'raw', 'extracted', 'us', 'pl_sound_data.sdat'))

if (buf.toString('latin1', 0, 4) !== 'SDAT') throw new Error('not SDAT')
const blocks = {}
for (let i = 0; i < 4; i++) {
  const off = buf.readUInt32LE(0x10 + i * 8)
  const size = buf.readUInt32LE(0x14 + i * 8)
  if (off) blocks[buf.toString('latin1', off, off + 4).trim()] = { off, size }
}
console.log('블록:', Object.entries(blocks).map(([k, v]) => `${k}@0x${v.off.toString(16)}(${(v.size / 1024).toFixed(0)}KB)`).join(' '))

// SYMB: 8개 리스트 (SEQ, SEQARC, BANK, WAVEARC, PLAYER, GROUP, PLAYER2, STRM)
const KINDS = ['SEQ', 'SEQARC', 'BANK', 'WAVEARC', 'PLAYER', 'GROUP', 'PLAYER2', 'STRM']
const symb = blocks['SYMB']
const names = {}
if (symb) {
  for (let k = 0; k < 8; k++) {
    const listOff = symb.off + buf.readUInt32LE(symb.off + 8 + k * 4)
    const count = buf.readUInt32LE(listOff)
    names[KINDS[k]] = []
    for (let i = 0; i < count; i++) {
      const nameOff = buf.readUInt32LE(listOff + 4 + i * 4)
      if (!nameOff) { names[KINDS[k]].push(null); continue }
      const abs = symb.off + nameOff
      const end = buf.indexOf(0, abs)
      names[KINDS[k]].push(buf.toString('latin1', abs, end))
    }
  }
  console.log('SYMB 카운트:', KINDS.map(k => `${k}:${names[k].length}`).join(' '))
}

// INFO: SEQ 레코드에서 fileId 획득 (레코드: fileId u16, unk u16, bankId u16, ...)
const info = blocks['INFO']
const seqInfoListOff = info.off + buf.readUInt32LE(info.off + 8)
const seqCount = buf.readUInt32LE(seqInfoListOff)
const seqs = []
for (let i = 0; i < seqCount; i++) {
  const recPtr = buf.readUInt32LE(seqInfoListOff + 4 + i * 4)
  if (!recPtr) { seqs.push(null); continue }
  const rec = info.off + recPtr
  seqs.push({ fileId: buf.readUInt16LE(rec), bankId: buf.readUInt16LE(rec + 4), name: names.SEQ?.[i] ?? `seq_${i}` })
}
const valid = seqs.filter(Boolean)
console.log(`INFO SEQ: ${seqCount}개 슬롯, 유효 ${valid.length}개`)

// FAT
const fat = blocks['FAT']
const fatCount = buf.readUInt32LE(fat.off + 8)
console.log(`FAT: ${fatCount}개 파일`)

function fileById(id) {
  const e = fat.off + 12 + id * 16
  const off = buf.readUInt32LE(e)
  const size = buf.readUInt32LE(e + 4)
  return buf.subarray(off, off + size)
}

// 대표 곡 몇 개 이름 출력 + SSEQ 매직 검증 + 추출
console.log('\n곡 샘플:', valid.slice(0, 8).map(s => s.name).join(', '))
const town = valid.find(s => /TOWN|town/i.test(s.name || '')) || valid[0]
const data = fileById(town.fileId)
const magic = data.toString('latin1', 0, 4)
console.log(`\n"${town.name}" (fileId ${town.fileId}, bank ${town.bankId}) → ${(data.length / 1024).toFixed(1)}KB, 매직="${magic}"`)
const outDir = path.join(root, 'raw', 'extracted', 'us', 'sseq')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, `${town.name}.sseq`), data)
console.log(magic === 'SSEQ' ? 'RESULT: PASS — SDAT 구조 파싱·SSEQ 추출 성공' : 'RESULT: FAIL')

// 전체 SSEQ 크기 통계 (§4.5 "곡당 수 KB" 주장 검증)
const sizes = valid.map(s => fileById(s.fileId).length)
const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length
console.log(`SSEQ ${valid.length}곡 — 평균 ${(avg / 1024).toFixed(1)}KB, 최대 ${(Math.max(...sizes) / 1024).toFixed(1)}KB, 총합 ${(sizes.reduce((a, b) => a + b, 0) / 1024).toFixed(0)}KB`)
