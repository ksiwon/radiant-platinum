// 찾은 자리에서 표를 실제로 읽는다
'use strict'
const fs = require('fs')
const path = require('path')
const { ROOT } = require('../extract/rom')

const rom = fs.readFileSync(path.join(ROOT, 'raw/roms/Pokemon Platinum (US).nds'))
const arm7 = rom.subarray(rom.readUInt32LE(0x30), rom.readUInt32LE(0x30) + rom.readUInt32LE(0x3c))

const DB = 0xe90c   // 데시벨 제곱표
const ATK = 0xeb20  // 어택표

const s16 = (at, n) => Array.from({ length: n }, (_, i) => arm7.readInt16LE(at + i * 2))
const u8 = (at, n) => Array.from({ length: n }, (_, i) => arm7[at + i])
const u16 = (at, n) => Array.from({ length: n }, (_, i) => arm7.readUInt16LE(at + i * 2))

const db = s16(DB, 128)
console.log(`데시벨표 128칸: [0]=${db[0]} [1]=${db[1]} … [126]=${db[126]} [127]=${db[127]}`)
console.log(`  단조 증가 ${db.every((v, i) => i === 0 || v >= db[i - 1])} · 끝이 0 ${db[127] === 0}`)
console.log(`  ${db.join(',')}`)

console.log(`\n0xea0c~0xeb20 사이 (${(ATK - (DB + 256))}바이트):`)
console.log('  ' + arm7.subarray(DB + 256, ATK).toString('hex').replace(/(.{64})/g, '$1\n  '))

console.log(`\n어택표 0xeb20부터 24칸: ${u8(ATK, 24).join(',')}`)

// 피치표는 768칸 u16이고 [0]=0으로 시작해 단조 증가한다. 어디 있나 훑는다
for (let at = 0; at + 768 * 2 <= arm7.length; at += 2) {
  if (arm7.readUInt16LE(at) !== 0 || arm7.readUInt16LE(at + 2) !== 59) continue
  const t = u16(at, 768)
  let ok = true
  for (let i = 1; i < 768; i++) if (t[i] < t[i - 1]) { ok = false; break }
  if (ok) {
    console.log(`\n피치표 후보 0x${at.toString(16)}: [0..5]=${t.slice(0, 6).join(',')} [767]=${t[767]}`)
    break
  }
}
