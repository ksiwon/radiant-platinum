// 감쇠율 식의 상수를 ARM7 코드에서 찾는다
//
// 어택표·데시벨표는 자료라서 바이트열로 찾았다. 감쇠율은 표가 아니라 식이라
// 상수가 **명령 안에** 박혀 있다. ARM 즉치값은 `imm8 ror 2*rot`이므로
// 0x3C00 = 0x3C ror 24 (rot=12), 0x1E00 = 0x1E ror 24로 인코딩된다.
'use strict'
const fs = require('fs')
const path = require('path')
const { ROOT } = require('../extract/rom')

const rom = fs.readFileSync(path.join(ROOT, 'raw/roms/Pokemon Platinum (US).nds'))
const base = rom.readUInt32LE(0x30)
const arm7 = rom.subarray(base, base + rom.readUInt32LE(0x3c))
const ram = rom.readUInt32LE(0x38)

/** `MOV Rd, #imm8 ror 2*rot` 하나 */
const movs = []
for (let at = 0; at + 4 <= arm7.length; at += 4) {
  const w = arm7.readUInt32LE(at)
  // cond=AL(0xE) · 00 I=1 · opcode MOV(1101) · S=0 · Rn=0
  if ((w & 0x0fff0000) !== 0x03a00000) continue
  const rd = (w >> 12) & 0xf
  const rot = (w >> 8) & 0xf
  const imm8 = w & 0xff
  const val = rot === 0 ? imm8 : ((imm8 >>> (rot * 2)) | (imm8 << (32 - rot * 2))) >>> 0
  movs.push({ at, rd, val })
}
console.log(`ARM MOV 즉치 ${movs.length}개`)

const find = (v) => movs.filter((m) => m.val === v)
for (const v of [0x3c00, 0x1e00, 0xffff, 126, 127, 50]) {
  const hits = find(v)
  console.log(`  #0x${v.toString(16)} (${v}): ${hits.length}회` +
    (hits.length && hits.length <= 6
      ? ` @ ${hits.map((h) => `0x${(ram + h.at).toString(16)}`).join(' ')}`
      : ''))
}

// 0x3C00과 0x1E00이 같은 함수 안에 있나 — 128바이트 안에 붙어 있으면 그렇다
const a = find(0x3c00), b = find(0x1e00)
console.log('\n0x3C00 ↔ 0x1E00 거리:')
for (const x of a) {
  for (const y of b) {
    if (Math.abs(x.at - y.at) < 256) {
      console.log(`  0x${(ram + x.at).toString(16)} ↔ 0x${(ram + y.at).toString(16)} (${y.at - x.at}바이트)`)
    }
  }
}

// 그 언저리를 워드로 찍는다
if (a.length) {
  const from = Math.max(0, a[0].at - 0x40), to = Math.min(arm7.length, a[0].at + 0x60)
  console.log(`\n0x${(ram + from).toString(16)}~ 워드 덤프:`)
  for (let at = from; at < to; at += 4) {
    console.log(`  ${(ram + at).toString(16)}: ${arm7.readUInt32LE(at).toString(16).padStart(8, '0')}` +
      (at === a[0].at ? '   ← #0x3C00' : ''))
  }
}
