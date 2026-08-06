// ADSR 표를 롬에서 찾는다
//
// 소리 드라이버는 디컴프에 없다 — Nitro SDK가 ARM7 쪽에 넣어 주는 코드라
// 디컴프는 `NNS_Snd*`를 부르기만 한다. 그래서 포락선 표를 **기억으로 적으면 안 된다**.
//
// 대신 후보 바이트열을 롬에서 찾는다. 18바이트가 우연히 맞을 수는 없으므로
// 맞으면 확정이고, 안 맞으면 내 기억이 틀린 것이라 쓰면 안 된다.
'use strict'
const fs = require('fs')
const path = require('path')
const { ROOT } = require('../extract/rom')

const rom = fs.readFileSync(path.join(ROOT, 'raw/roms/Pokemon Platinum (US).nds'))
const arm7Off = rom.readUInt32LE(0x30), arm7Size = rom.readUInt32LE(0x3c)
const arm7Ram = rom.readUInt32LE(0x38)
console.log(`ARM7: 롬 0x${arm7Off.toString(16)} 크기 ${arm7Size} RAM 0x${arm7Ram.toString(16)}`)

const hunt = (label, bytes) => {
  const pat = Buffer.from(bytes)
  const hits = []
  let at = 0
  for (;;) {
    const i = rom.indexOf(pat, at)
    if (i < 0) break
    hits.push(i)
    at = i + 1
    if (hits.length > 4) break
  }
  const where = (i) => (i >= arm7Off && i < arm7Off + arm7Size)
    ? `ARM7+0x${(i - arm7Off).toString(16)} (RAM 0x${(arm7Ram + i - arm7Off).toString(16)})`
    : `롬 0x${i.toString(16)}`
  console.log(`${label}: ${hits.length ? hits.map(where).join(' · ') : '없음'}`)
  return hits
}

// 후보 1 — 어택 표 (a >= 109일 때 127-a로 찾는 18칸)
hunt('어택표 18칸',
  [0x00, 0x01, 0x05, 0x0e, 0x1a, 0x26, 0x33, 0x3f, 0x49, 0x54, 0x5c, 0x64, 0x6d, 0x74, 0x7b, 0x7f, 0x84, 0x89])
hunt('어택표 앞 12칸',
  [0x00, 0x01, 0x05, 0x0e, 0x1a, 0x26, 0x33, 0x3f, 0x49, 0x54, 0x5c, 0x64])
hunt('어택표 앞 8칸', [0x00, 0x01, 0x05, 0x0e, 0x1a, 0x26, 0x33, 0x3f])

// 후보 2 — 데시벨 제곱표 s16 (앞 8칸)
const db = [-32768, -722, -721, -651, -601, -562, -530, -503]
const dbBytes = []
for (const v of db) { dbBytes.push(v & 0xff, (v >> 8) & 0xff) }
hunt('데시벨표 앞 8칸', dbBytes)
hunt('데시벨표 앞 4칸', dbBytes.slice(0, 8))
// -32768 없이 -722부터
hunt('데시벨표 -722부터 6칸', dbBytes.slice(2, 14))

// 후보 3 — 피치 표(반음 안 쪽 보간)의 시작 0x0000,0x003B...는 흔해서 안 쓴다
