// 야생 인카운터 테이블 추출 (DATA.md §2.8)
//
//   /fielddata/encountdata/pl_enc_data.narc  183개 × 424B 고정
//
// 424가 어떻게 떨어지는지가 곧 구조의 증명이다:
//   4(육상 출현률) + 12×8(슬롯: u32 레벨, u32 종족)              = 100
//   + 8(무리) + 8(낮) + 8(밤) + 16(포켓몬탐지기) + 24(미지) + 40(듀얼슬롯) = 204
//   + (4 + 5×8) × 5 (파도타기·?·낡은/좋은/대단한 낚싯대)          = 424
// 다른 조합으로는 424가 나오지 않는다.
//
// 원작 대조: 201번도로가 찌르꼬 L2 / 비버니 L2 / 귀뚤뚜기 L3, 출현률 30,
// 낮 찌르꼬·비버니 / 밤 귀뚤뚜기·비버니 / 무리 두두 — 전부 일치한다.
'use strict'
const fs = require('fs')
const path = require('path')
const { openRom, writeJson, ROOT } = require('./rom')

const ENTRY_SIZE = 424
const LAND_SLOTS = 12
const WATER_SLOTS = 5
/** 물 계열 5구역의 시작 오프셋 */
const WATER_BASES = { surf: 204, unknown: 248, oldRod: 292, goodRod: 336, superRod: 380 }
/** 풀숲 타일 거동 (zone.ts의 Behavior.TALL_GRASS와 같은 값) */
const TALL_GRASS = 0x0002

function parseEncounter(b) {
  if (b.length !== ENTRY_SIZE) throw new Error(`인카운터 크기 ${b.length} ≠ ${ENTRY_SIZE}`)
  const u = (o) => b.readUInt32LE(o)
  const land = []
  for (let i = 0; i < LAND_SLOTS; i++) {
    land.push({ level: u(4 + i * 8), species: u(8 + i * 8) })
  }
  const water = {}
  for (const [name, base] of Object.entries(WATER_BASES)) {
    const slots = []
    for (let i = 0; i < WATER_SLOTS; i++) {
      const o = base + 4 + i * 8
      // 바이트 순서가 (최대, 최소)다 — 트윈리프 파도타기가 L20~30으로 읽히는 쪽
      slots.push({ max: b[o], min: b[o + 1], species: u(o + 4) })
    }
    water[name] = { rate: u(base), slots }
  }
  return {
    landRate: u(0),
    land,
    swarm: [u(100), u(104)],
    day: [u(108), u(112)],
    night: [u(116), u(120)],
    radar: [u(124), u(128), u(132), u(136)],
    /** GBA 카트리지 듀얼슬롯 (루비/사파이어/에메랄드/파이어레드/리프그린 × 2) */
    dualSlot: Array.from({ length: 10 }, (_, i) => u(164 + i * 4)),
    ...water,
  }
}

function extractEncounters(rom) {
  const files = rom.narc('/fielddata/encountdata/pl_enc_data.narc')
  const tables = files.map(parseEncounter)

  // 검증: 종족 번호와 레벨이 전부 유효 범위인가.
  // 육상 출현률 0인 표는 슬롯이 전부 0이라 그건 이탈로 세지 않는다
  let slots = 0
  for (const t of tables) {
    for (const s of t.land) {
      if (t.landRate === 0) continue
      slots++
      if (s.species < 1 || s.species > 507) throw new Error(`육상 종족 ${s.species} 범위 초과`)
      if (s.level < 1 || s.level > 100) throw new Error(`육상 레벨 ${s.level} 범위 초과`)
    }
    for (const name of Object.keys(WATER_BASES)) {
      const w = t[name]
      if (w.rate === 0) continue
      for (const s of w.slots) {
        slots++
        if (s.min > s.max || s.max > 100) throw new Error(`${name} 레벨 ${s.min}~${s.max} 뒤집힘`)
        if (s.species < 1 || s.species > 507) throw new Error(`${name} 종족 ${s.species} 범위 초과`)
      }
    }
  }
  return { tables, slots }
}

/**
 * 풀숲 타일 거동 가설의 교차검증.
 * 육상 인카운터가 있는 맵에는 풀숲 타일이 있어야 하고, 없는 맵에는 없어야 한다.
 * 이건 완전히 독립된 두 자료(타일 격자와 인카운터 표)의 대조라 우연히 맞을 수 없다.
 */
function crossCheckGrass(tables) {
  const maps = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/maps.json'), 'utf8')).maps
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/matrices/0.json'), 'utf8'))
  const bin = fs.readFileSync(path.join(ROOT, 'public/data/matrices/0.bin'))
  const tiles = new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2)

  const grassByZone = new Map()
  const n = 32
  for (const c of meta.chunks) {
    let g = 0
    for (let ty = 0; ty < n; ty++) {
      for (let tx = 0; tx < n; tx++) {
        const gx = c.mx * n + tx, gz = c.my * n + ty
        if ((tiles[gz * meta.tileWidth + gx] & 0x7fff) === TALL_GRASS) g++
      }
    }
    grassByZone.set(c.zone, (grassByZone.get(c.zone) ?? 0) + g)
  }

  let agree = 0, disagree = 0
  const odd = []
  for (const [zone, grass] of grassByZone) {
    const m = maps[zone]
    const rate = m.encounters === null ? 0 : tables[m.encounters].landRate
    const hasLand = rate > 0
    if (hasLand === grass > 0) agree++
    else { disagree++; odd.push(`${m.name}(풀 ${grass}, 출현률 ${rate})`) }
  }
  return { agree, disagree, odd }
}

function main() {
  const romPath = process.argv.find((a) => a.startsWith('--rom='))?.slice(6)
  const rom = openRom(romPath)
  const { tables, slots } = extractEncounters(rom)

  const out = writeJson('encounters.json', { count: tables.length, tables })
  console.log(`encounters: ${tables.length}개 표 · 유효 슬롯 ${slots} → ${out.rel} (${out.kb}KB)`)
  console.log(`  육상 있음 ${tables.filter((t) => t.landRate > 0).length} · ` +
    `파도타기 있음 ${tables.filter((t) => t.surf.rate > 0).length} · ` +
    `출현률 종류 ${[...new Set(tables.map((t) => t.landRate))].sort((a, b) => a - b).join('/')}`)

  const cc = crossCheckGrass(tables)
  console.log(`  풀숲 타일(0x02) 교차검증: 일치 ${cc.agree} · 불일치 ${cc.disagree}`)
  if (cc.odd.length) console.log(`    ${cc.odd.slice(0, 8).join(' · ')}`)
}

if (require.main === module) main()
module.exports = { extractEncounters, parseEncounter, ENTRY_SIZE, LAND_SLOTS, WATER_SLOTS, TALL_GRASS }
