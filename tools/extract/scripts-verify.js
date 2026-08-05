// 스크립트 포맷 검증 (DATA.md §2.10) — 디컴프 원본을 조립해서 롬과 맞춰 본다.
//
// 통과 기준은 **1124개 전부 바이트 단위 일치**다. 하나라도 다르면 명령표가
// 틀렸거나 어셈블러 흉내가 틀린 것이고, 어느 쪽이든 그 위에 올릴 수 없다.
//
// `scripts.order`의 줄 번호가 곧 NARC 안의 번호다 (meson.build의 파일 나열
// 순서와 같다).
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, ROOT } = require('./rom')
const { assemble, readMacros, readGenerated, DECOMP } = require('./scrasm')

const SCRIPTS = path.join(DECOMP, 'res/field/scripts')
const NARC = '/fielddata/script/scr_seq.narc'

function main() {
  const order = fs
    .readFileSync(path.join(SCRIPTS, 'scripts.order'), 'utf8')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
  const files = openRom().narc(NARC)
  if (order.length !== files.length) {
    throw new Error(`목록 ${order.length}개, 롬 ${files.length}개 — 안 맞는다`)
  }

  const macros = readMacros(path.join(DECOMP, 'asm/macros/scrcmd.inc'))
  const generated = readGenerated()

  let same = 0
  const failed = []
  const differs = []
  for (const [i, name] of order.entries()) {
    let bytes
    try {
      bytes = assemble(path.join(SCRIPTS, `${name}.s`), macros, generated).bytes
    } catch (e) {
      failed.push(`#${i} ${name}: ${e.message}`)
      continue
    }
    // NARC는 멤버를 4바이트에 맞춰 0으로 채운다 — 1124개 전부 4의 배수다.
    // 그래서 조립 결과 뒤의 0 패딩까지는 같은 것으로 본다
    const rom = files[i]
    const padded = (bytes.length + 3) & ~3
    if (
      rom.length === padded &&
      bytes.equals(rom.subarray(0, bytes.length)) &&
      rom.subarray(bytes.length).every((b) => b === 0)
    ) {
      same++
      continue
    }
    let at = 0
    while (at < bytes.length && at < rom.length && bytes[at] === rom[at]) at++
    differs.push(`#${i} ${name}: 조립 ${bytes.length}B / 롬 ${rom.length}B, 0x${at.toString(16)}부터 다름`)
  }

  console.log(`스크립트 ${order.length}개`)
  console.log(`  바이트 일치 ${same}`)
  console.log(`  조립 실패   ${failed.length}`)
  console.log(`  내용 불일치 ${differs.length}`)
  for (const line of failed.slice(0, 25)) console.log(`  ! ${line}`)
  for (const line of differs.slice(0, 25)) console.log(`  ≠ ${line}`)
  if (failed.length || differs.length) process.exitCode = 1
}

if (require.main === module) main()
