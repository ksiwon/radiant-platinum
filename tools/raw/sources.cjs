// raw 원천 어댑터 (COPYRIGHT.md §5 · IMPORT.md §9 · PLAN §15.0.1)
//
// ⚠️ **기존 파일을 옮기지 않는다.** `raw/`는 개발·디버깅에 계속 쓰이고 10GB다.
// 목표 구조(`sources/references/work/dev-assets/legacy`)는 문서에 있지만, 옮기는
// 것은 "복사 → 개수·크기·지문 검증 → 어댑터 전환 → 원본 보존" 순서다. 그 첫
// 단계가 **어댑터**이고 이 파일이 그것이다 — 지금 자리를 그대로 읽는다.
//
// ⚠️ **특정 파일명에 기대지 않는다.** 여태 추출기 여럿이
// `raw/roms/Pokemon Platinum (US).nds`를 통째로 적어 두었다. 그 이름은 개발자가
// 자기 기계에서 붙인 것이고, 다른 사람이 같은 롬을 다른 이름으로 두면 도구가
// "롬이 없다"고 한다. 헤더의 **게임 코드**로 찾는다 — 공개 Importer가 하는
// 판정과 같은 것이다 (`src/import/platinum/supported.json`).
//
// 덮어쓰고 싶으면 Git 무시 설정을 둔다:
//
//     raw.sources.local.json   (예시는 raw.sources.example.json)
'use strict'
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '../..')
const CONFIG = path.join(ROOT, 'raw.sources.local.json')

/** 지원 지역판 지문. 브라우저 Importer와 **같은 파일**을 읽는다 */
const SUPPORTED = require('../../src/import/platinum/supported.json')

/**
 * 논리 그룹 → 지금 실제로 놓여 있을 만한 자리들.
 *
 * 앞에서부터 먼저 있는 것이 임자다. 목표 구조를 **먼저** 적어 두었으므로,
 * 나중에 파일을 옮기면 설정을 안 고쳐도 새 자리를 잡는다
 */
const CANDIDATES = {
  'platinum.dir': ['raw/sources/platinum', 'raw/roms'],
  'platinum.extracted': ['raw/sources/platinum-extracted', 'raw/extracted'],
  'references.decomp': ['raw/references/decomp', 'raw/decomp'],
  'references.decompDerived': ['raw/references/decomp-derived', 'raw/decomp-derived'],
  // BDSP는 **정본 `AssetAssistant` 하나**만 본다. 한때 필요한 것만 골라 다른
  // 이름으로 재배치한 폴더(`raw/bdsp`)를 같이 봤는데, 그러면 개발이 그 재배치에
  // 기대게 되고 공개 사용자가 고르는 진짜 구조에서는 안 도는 코드가 남는다.
  // 아래 하위 경로는 실제 덤프의 자리 그대로다
  'bdsp.root': ['raw/AssetAssistant', 'raw/sources/bdsp/AssetAssistant'],
  'bdsp.characters': ['Characters'],
  'bdsp.dpr': ['Dpr'],
  'bdsp.battle': ['Battle'],
  'bdsp.environments': ['Environments'],
  'bdsp.arenas': ['Environments/bg/arenas'],
  'bdsp.pokemon': ['Pokemon Database/pokemons/battle'],
  'bdsp.pokemonCommon': ['Pokemon Database/pokemons/common'],
  'bdsp.masterdatas': ['Dpr/masterdatas'],
  'bdsp.message': ['Message'],
  'work.models': ['raw/work/models', 'raw/models'],
  'devAssets.data': ['raw/dev-assets/data', 'public/data'],
  'devAssets.models': ['raw/dev-assets/models', 'public/models'],
}

let cached = null

function config() {
  if (cached !== null) return cached
  try {
    cached = JSON.parse(fs.readFileSync(CONFIG, 'utf8'))
  } catch {
    cached = {}
  }
  return cached
}

/**
 * 논리 그룹의 실제 자리. 없으면 null.
 *
 * `bdsp.root`을 뺀 `bdsp.*`는 뿌리 **아래 상대 경로**다 — 뿌리가 어디로 가든
 * 하위 자리를 한 군데씩 고쳐 다니지 않게 하려는 것이다
 */
function sourceDir(name) {
  const override = config().dirs?.[name]
  if (typeof override === 'string') {
    const at = path.resolve(ROOT, override)
    return fs.existsSync(at) ? at : null
  }
  const base = name.startsWith('bdsp.') && name !== 'bdsp.root' ? sourceDir('bdsp.root') : ROOT
  if (base === null) return null
  for (const rel of CANDIDATES[name] ?? []) {
    const at = path.join(base, rel)
    if (fs.existsSync(at)) return at
  }
  return null
}

/** 그 자리가 있어야만 도는 도구용. 없으면 무엇을 어떻게 두라는지까지 적어 던진다 */
function requireDir(name) {
  const at = sourceDir(name)
  if (at) return at
  throw new Error(
    `raw 원천 '${name}'을(를) 못 찾았다.\n`
    + `  찾아본 자리: ${(CANDIDATES[name] ?? []).join(' · ') || '(없음)'}\n`
    + `  다른 데 있으면 ${path.basename(CONFIG)}의 dirs["${name}"]에 적는다 `
    + '(raw.sources.example.json 참고).',
  )
}

/** 헤더 앞 0x20바이트만 읽는다. 롬 하나가 128MB라 통째로 읽을 이유가 없다 */
function readGameCode(file) {
  let fd
  try {
    fd = fs.openSync(file, 'r')
    const head = Buffer.alloc(0x20)
    if (fs.readSync(fd, head, 0, 0x20, 0) < 0x20) return null
    return {
      title: head.toString('latin1', 0, 12).replace(/\0+$/, ''),
      gameCode: head.toString('latin1', 12, 16),
    }
  } catch {
    return null
  } finally {
    if (fd !== undefined) fs.closeSync(fd)
  }
}

let romScan = null

/**
 * 지역판 → 롬 파일.
 *
 * **이름이 아니라 헤더로 찾는다.** 폴더에 있는 `.nds`를 전부 열어 게임 코드를
 * 보고 지원 표와 맞춘다 — 파일명이 무엇이든, 몇 개가 있든 상관없다
 */
function platinumRoms() {
  if (romScan !== null) return romScan
  romScan = {}

  const byCode = new Map(SUPPORTED.releases.map((r) => [r.gameCode, r.locale]))

  const fromConfig = config().platinum ?? {}
  for (const [locale, rel] of Object.entries(fromConfig)) {
    const at = path.resolve(ROOT, rel)
    if (fs.existsSync(at)) romScan[locale] = at
  }

  const dir = sourceDir('platinum.dir')
  if (dir) {
    for (const name of fs.readdirSync(dir)) {
      if (!name.toLowerCase().endsWith('.nds')) continue
      const at = path.join(dir, name)
      const head = readGameCode(at)
      if (!head || head.title !== SUPPORTED.title) continue
      const locale = byCode.get(head.gameCode)
      // 설정이 먼저다. 같은 지역판이 둘이면 먼저 발견한 것을 쓴다
      if (locale && !romScan[locale]) romScan[locale] = at
    }
  }
  return romScan
}

function platinumRom(locale) {
  return platinumRoms()[locale] ?? null
}

function requirePlatinumRom(locale) {
  const at = platinumRom(locale)
  if (at) return at
  const dir = sourceDir('platinum.dir')
  throw new Error(
    `${locale} 지역판 Platinum 롬을 못 찾았다.\n`
    + `  찾아본 자리: ${dir ?? CANDIDATES['platinum.dir'].join(' · ')}\n`
    + '  파일 이름은 상관없다 — 헤더의 게임 코드로 찾는다 '
    + `(${SUPPORTED.releases.map((r) => `${r.locale}=${r.gameCode}`).join(' · ')}).\n`
    + `  다른 데 있으면 ${path.basename(CONFIG)}의 platinum["${locale}"]에 적는다.`,
  )
}

/** 무엇이 어디로 풀렸는지. 진단용 — `node tools/raw/sources.cjs` */
function describeSources() {
  const rows = []
  for (const [locale, at] of Object.entries(platinumRoms())) {
    rows.push([`platinum.${locale}`, path.relative(ROOT, at)])
  }
  for (const name of Object.keys(CANDIDATES)) {
    const at = sourceDir(name)
    rows.push([name, at ? path.relative(ROOT, at) : '(없음)'])
  }
  return rows
}

module.exports = {
  ROOT,
  CONFIG,
  CANDIDATES,
  SUPPORTED,
  config,
  sourceDir,
  requireDir,
  platinumRom,
  platinumRoms,
  requirePlatinumRom,
  describeSources,
}

if (require.main === module) {
  // `--json`은 파이썬 쪽(`tools/raw/sources.py`)이 읽는다. 후보 목록을 두 벌
  // 들고 있으면 한쪽만 고치는 날이 온다
  if (process.argv.includes('--json')) {
    const dirs = {}
    for (const name of Object.keys(CANDIDATES)) dirs[name] = sourceDir(name)
    console.log(JSON.stringify({ root: ROOT, dirs, platinum: platinumRoms() }))
  } else {
    const width = Math.max(...describeSources().map(([k]) => k.length))
    for (const [k, v] of describeSources()) console.log(`${k.padEnd(width)}  ${v}`)
  }
}
