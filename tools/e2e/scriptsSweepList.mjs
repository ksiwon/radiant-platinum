// 스크립트 전수 점검의 **목록** — 맵마다 어떤 스크립트가 어디서 시작하고, 시작하려면 무엇이 먼저 서야 하나
// (지시서 GAPS_20261011 「H. 스크립트 · 이벤트 전수」).
//
// 브라우저를 안 쓴다. 맵 헤더(`maps.json`) · 이벤트(`events.json`) · 스크립트 파일 표(`scripts.json`/`.bin`)만 읽는다.
//
// ⚠️ **범위는 이름 추정이 아니라 자료로 가른다.** 맵 헤더가 가리키는 스크립트 파일(`header.scripts`)이 누구 것인지
// (`scripts.json`의 `files[i].name` — 디컴프 `.s` 파일 이름 그대로)가 첫째 근거고, 헤더 이름은 **스크립트 파일이 비어
// 있는 통신 맵**(`RECORD`)만 보태 쓴다. 프런티어는 타워 · 스테이지 · 캐슬 · 룰렛만 뺀다 — 팩토리와 배틀프런티어 지상
// (`scripts_battle_frontier*`)은 범위 안이다 (`engine/world/frontierGate`의 `DEFERRED` 네 맵이 그 문이다).
//
// ⚠️ **선행 조건은 노드(자료에서 곧바로 읽히는 것)만 담는다.** 숨김 플래그 · 좌표 사건의 `var == value` · 매 프레임 표의
// `left == right` · 숨은 아이템 플래그(730 + id − 8000). 스크립트 안쪽 분기는 앞 스크립트가 세우는 값에 걸려 있어서
// 여기서 못 푼다 — 그것은 실행기가 선택지와 변수를 바꿔 여러 번 돌려 덮는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')

/** 스크립트 파일 이름으로 범위 밖을 가른다 — 이름은 디컴프 파일명이고 `maps.json`의 `scripts` 칸이 가리킨다 */
const OUT_BY_FILE = [
  [/^scripts_battle_(tower|hall|castle|arcade)/, '프런티어 타워·스테이지·캐슬·룰렛'],
  [/^scripts_contest_/, '콘테스트'],
  [/^scripts_(underground|union_room|communication_club|wifi_plaza)/, '통신·지하통로'],
  [/_pokecenter_b1f$/, '통신(포켓몬센터 지하)'],
]
/** 스크립트 파일이 비어 있어 위에 안 걸리는 통신 맵 — 헤더 이름(디컴프 `MAP_HEADER_*`)으로만 가른다 */
const OUT_BY_NAME = [[/^(UG|RECORD|UNION|DIRECT|HIROBA)/, '통신·지하통로']]

/** `engine/map/world`의 `NO_SCRIPT` */
const NO_SCRIPT = 0xffff
/** `engine/script/field`의 숨은 도구 규칙 (`hiddenItemFlag`) */
const HIDDEN_ITEM_SCRIPT_BASE = 8000
const HIDDEN_ITEM_FLAG_BASE = 730
/** `engine/script/vars`의 상수 구간 — 이 아래 번호는 변수가 아니라 값이다 */
const VARS_START = 0x4000

const INIT = { frameTable: 1, onTransition: 2, onResume: 3, onLoad: 4 }
const INIT_NAME = { 2: 'OnTransition', 3: 'OnResume', 4: 'OnLoad' }

const readJson = (dataDir, name) => JSON.parse(readFileSync(resolve(dataDir, name), 'utf8'))

/** `engine/script/data`의 `resolveScript` — 번호 하나가 (파일, 진입점)이 된다 */
function resolveScript(meta, id, mapFile) {
  for (const range of meta.ranges) {
    if (id < range.from) continue
    if (range.file === null) return null
    return { file: range.file, entry: id - range.from, common: true }
  }
  if (id >= 1) return { file: mapFile, entry: id - 1, common: false }
  return null
}

/**
 * 초기화 표 하나를 읽는다 — `engine/script/initScripts`의 `parseInitScripts`와 **같은 결과**여야 한다.
 * 같은 규칙이 두 벌이라 `scriptsSweepList.test.mts`가 모든 맵에서 둘을 맞대어 본다
 */
export function parseInit(bytes) {
  const fixed = new Map()
  const frame = []
  if (bytes.byteLength === 0) return { fixed, frame }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let at = 0; at < bytes.byteLength;) {
    const type = view.getUint8(at)
    if (type === 0) break
    if (at + 5 > bytes.byteLength) break
    if (type === INIT.frameTable) {
      const offset = view.getInt32(at + 1, true)
      if (offset !== 0) {
        for (let r = at + 5 + offset; r + 6 <= bytes.byteLength; r += 6) {
          const left = view.getUint16(r, true)
          if (left === 0) break
          frame.push({ left, right: view.getUint16(r + 2, true), script: view.getUint16(r + 4, true) })
        }
      }
    } else if (!fixed.has(type)) {
      fixed.set(type, view.getUint16(at + 1, true))
    }
    at += 5
  }
  return { fixed, frame }
}

export function scopeOf(header, scriptMeta) {
  const fileName = scriptMeta.files[header.scripts]?.name ?? ''
  for (const [re, why] of OUT_BY_FILE) if (re.test(fileName)) return { inScope: false, why }
  for (const [re, why] of OUT_BY_NAME) if (re.test(header.name)) return { inScope: false, why }
  return { inScope: true, why: null }
}

/**
 * 목록을 만든다.
 *
 * @returns `maps`: 범위 안 맵과 그 시작 자리, `excluded`: 범위 밖 맵과 까닭, `keys`: 서로 다른 (파일:진입점)
 */
export function buildList(dataDir = resolve(ROOT, 'public/data')) {
  const maps = readJson(dataDir, 'maps.json').maps
  const events = readJson(dataDir, 'events.json').events
  const meta = readJson(dataDir, 'scripts.json')
  const bin = readFileSync(resolve(dataDir, 'scripts.bin'))

  const outMaps = []
  const inMaps = []
  const keySites = new Map()
  const counts = { npc: 0, trainer: 0, sign: 0, hidden: 0, trigger: 0, initFixed: 0, initFrame: 0 }

  for (const header of maps) {
    const scope = scopeOf(header, meta)
    const ev = events[header.events] ?? { npcs: [], signs: [], triggers: [], warps: [] }
    const entry = {
      map: header.id, name: header.name, mapFile: header.scripts, mapType: header.mapType,
      warps: ev.warps.length, sites: [],
    }
    if (!scope.inScope) {
      outMaps.push({
        map: header.id, name: header.name, why: scope.why,
        file: meta.files[header.scripts]?.name ?? null,
        npcs: ev.npcs.length, signs: ev.signs.length, triggers: ev.triggers.length,
      })
      continue
    }

    const add = (kind, scriptID, extra) => {
      const target = resolveScript(meta, scriptID, header.scripts)
      if (target === null) return
      const info = meta.files[target.file]
      if (!info || target.entry >= info.entries) return
      const key = `${target.file}:${target.entry}`
      const site = {
        kind, script: scriptID, file: target.file, entry: target.entry, key,
        fileName: info.name, common: target.common, ...extra,
      }
      entry.sites.push(site)
      let at = keySites.get(key)
      if (at === undefined) { at = []; keySites.set(key, at) }
      at.push(`${String(header.id)}:${kind}`)
    }

    // NPC — 숨김 플래그가 서 있으면 그 사람이 안 선다. 우리는 **지워서** 세운다
    ev.npcs.forEach((n, i) => {
      if (n.script === NO_SCRIPT || n.script === 0) return
      const isTrainer = n.trainerType > 0 && n.trainerType !== 9
      counts[isTrainer ? 'trainer' : 'npc']++
      add('npc', n.script, {
        at: i, local: n.localID, x: n.x, z: n.z, trainer: n.trainerType,
        pre: n.flag > 0 ? [{ clearFlag: n.flag }] : [],
        node: n.flag > 0 ? `숨김 플래그 ${String(n.flag)}` : null,
      })
    })
    // 표지판 · 숨은 도구
    ev.signs.forEach((s, i) => {
      if (s.type === 2) {
        counts.hidden++
        add('hidden', s.script, {
          at: i, x: s.x, z: s.z,
          pre: [{ clearFlag: HIDDEN_ITEM_FLAG_BASE + (s.script - HIDDEN_ITEM_SCRIPT_BASE) }],
          node: `주운 플래그 ${String(HIDDEN_ITEM_FLAG_BASE + (s.script - HIDDEN_ITEM_SCRIPT_BASE))}`,
        })
      } else {
        counts.sign++
        add('sign', s.script, { at: i, x: s.x, z: s.z, facing: s.facing, type: s.type, pre: [], node: null })
      }
    })
    // 좌표 사건 — 변수가 값과 같아야 걸린다
    ev.triggers.forEach((t, i) => {
      counts.trigger++
      add('trigger', t.script, {
        at: i, x: t.x, z: t.z, w: t.width, l: t.length,
        pre: [{ setVar: t.var, value: t.value }],
        node: `var ${String(t.var)} == ${String(t.value)}`,
      })
    })
    // 초기화 표
    const initInfo = meta.files[header.initScripts]
    if (initInfo?.kind === 'init' && initInfo.size > 0) {
      const init = parseInit(bin.subarray(initInfo.at, initInfo.at + initInfo.size))
      for (const [type, script] of init.fixed) {
        counts.initFixed++
        add('init', script, { type, typeName: INIT_NAME[type] ?? `type${String(type)}`, pre: [], node: null, auto: true })
      }
      init.frame.forEach((row, i) => {
        counts.initFrame++
        // 오른쪽이 상수 구간이면 값, 변수면 그 변수의 값과 같아야 한다 — 실행기가 읽어서 맞춘다
        add('frame', row.script, {
          at: i,
          pre: [{ setVar: row.left, valueOf: row.right }],
          node: row.right < VARS_START
            ? `var ${String(row.left)} == ${String(row.right)}`
            : `var ${String(row.left)} == var ${String(row.right)}`,
        })
      })
    }
    inMaps.push(entry)
  }

  const keys = [...keySites.entries()].map(([key, sites]) => ({ key, sites }))
  return {
    counts,
    maps: inMaps,
    excluded: outMaps,
    keys: keys.length,
    totalSites: inMaps.reduce((n, m) => n + m.sites.length, 0),
  }
}

/** 부분 번호 `N/M`로 맵을 나눈다 — 사이트 수가 비슷하도록 **누적 수로** 가른다 */
export function partOf(list, n, total) {
  const all = list.maps.filter((m) => m.sites.length > 0)
  const sum = all.reduce((a, m) => a + m.sites.length, 0)
  const lo = (sum * (n - 1)) / total
  const hi = (sum * n) / total
  let acc = 0
  const out = []
  for (const m of all) {
    const mid = acc + m.sites.length / 2
    acc += m.sites.length
    if (mid >= lo && mid < hi) out.push(m)
  }
  return out
}
