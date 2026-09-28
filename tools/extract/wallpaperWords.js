// 벽지 암호의 낱말표 (`password_word_bank.c` · `engine/world/wallpaperPassword`)
//
//   pms_aikotoba.narc 0번(`word_bank_o`) — u32 낱말 번호의 차례. 암호는 낱말 자체가 아니라 **이 표 안의 자리**를 싣는다.
//
// ⚠️ **판마다 자리도 표도 다르다** — 일본판 `/arc/…` · 미국판 `/resource/eng/…` · 한국판 `/resource/kor/…`
// (`localePaths`). 같은 벽지 · 같은 ID라도 판마다 다른 낱말 넷이다. 설치본은 **설치한 롬의 표**를 굽고,
// 여기(노드)는 미국판을 굽는다.
//
// ⚠️ **`src/import/platinum/wallpaperWords.ts`와 한 줄씩 같아야 한다.**
'use strict'
const { openRom, writeJson } = require('./rom')

const NARC = '/resource/eng/pms_aikotoba/pms_aikotoba.narc'

function main() {
  const narc = openRom().narc(NARC)
  if (narc.length !== 1) throw new Error(`pms_aikotoba가 ${narc.length}칸이다 — 한 칸이라야 한다`)
  const bytes = narc[0]
  if (bytes.length % 4 !== 0) throw new Error(`낱말표가 ${bytes.length}바이트다 — 4의 배수라야 한다`)
  const words = []
  for (let i = 0; i < bytes.length; i += 4) words.push(bytes.readUInt32LE(i))
  writeJson('wallpaperWords.json', { words })
  console.log(`벽지 암호 낱말 — ${words.length}개`)
}

main()
