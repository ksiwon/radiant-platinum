// 스파이크: 3개 ROM에서 pl_msg.narc + sound_data.sdat 추출
'use strict'
const fs = require('fs')
const path = require('path')
const { readRom } = require('./nds')

const ROMS = {
  us: 'raw/roms/Pokemon Platinum (US).nds',
  ko: 'raw/roms/Pokemon Platinum (KO).nds',
  ja: 'raw/roms/Pokemon Platinum (JA).nds',
}

const root = path.resolve(__dirname, '..', '..')

for (const [locale, rel] of Object.entries(ROMS)) {
  const rom = readRom(path.join(root, rel))
  console.log(`\n=== ${locale.toUpperCase()} — title="${rom.gameTitle}" code=${rom.gameCode}, ${rom.files.size} files`)

  const msgCandidates = rom.find('msg')
  console.log('msg 후보:', msgCandidates.join(', ') || '(없음)')
  const sdatCandidates = rom.find('.sdat')
  console.log('sdat 후보:', sdatCandidates.join(', ') || '(없음)')

  const outDir = path.join(root, 'raw', 'extracted', locale)
  fs.mkdirSync(outDir, { recursive: true })

  for (const p of [...msgCandidates, ...sdatCandidates]) {
    const data = rom.read(p)
    const outName = p.split('/').pop()
    fs.writeFileSync(path.join(outDir, outName), data)
    console.log(`  추출: ${p} -> ${outName} (${(data.length / 1024).toFixed(0)} KB)`)
  }
}
