// 포락선 코드를 찾아 찍는다
//
// 표 주소를 리터럴 풀에 담고 있는 자리를 찾으면 그것을 쓰는 함수다.
'use strict'
const fs = require('fs')
const path = require('path')
const { ROOT } = require('../extract/rom')

const rom = fs.readFileSync(path.join(ROOT, 'raw/roms/Pokemon Platinum (US).nds'))
const base = rom.readUInt32LE(0x30)
const arm7 = rom.subarray(base, base + rom.readUInt32LE(0x3c))
const RAM = rom.readUInt32LE(0x38)

const TABLES = {
  '데시벨제곱표': RAM + 0xe90c,
  '데시벨표': RAM + 0xea0c,
  '어택표': RAM + 0xeb20,
}

for (const [name, addr] of Object.entries(TABLES)) {
  const hits = []
  for (let at = 0; at + 4 <= arm7.length; at += 4) {
    if (arm7.readUInt32LE(at) === addr) hits.push(RAM + at)
  }
  console.log(`${name} 0x${addr.toString(16)} 참조: ${hits.map((h) => '0x' + h.toString(16)).join(' ')}`)
}

/** 워드 덤프 */
function dump(from, words) {
  const at0 = from - RAM
  for (let i = 0; i < words; i++) {
    const at = at0 + i * 4
    console.log(`  ${(RAM + at).toString(16)}: ${arm7.readUInt32LE(at).toString(16).padStart(8, '0')}`)
  }
}

const where = process.argv[2]
if (where) dump(parseInt(where, 16), Number(process.argv[3] ?? 32))

// 리터럴 풀에 없다면 `ADD Rd, pc, #imm`(ADR)로 잡았을 수 있다
console.log('\nADR로 표를 가리키는 자리:')
for (let at = 0; at + 4 <= arm7.length; at += 4) {
  const w = arm7.readUInt32LE(at)
  if ((w & 0x0fff0000) !== 0x028f0000) continue // ADD Rd, pc, #imm
  const rot = (w >> 8) & 0xf, imm8 = w & 0xff
  const val = rot === 0 ? imm8 : ((imm8 >>> (rot * 2)) | (imm8 << (32 - rot * 2))) >>> 0
  const target = RAM + at + 8 + val
  for (const [name, addr] of Object.entries(TABLES)) {
    if (target === addr) console.log(`  ${name} ← 0x${(RAM + at).toString(16)}`)
  }
}
