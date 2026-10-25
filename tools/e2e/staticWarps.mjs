// 정적: 디컴프 .s 의 이동 명령(Warp/TakeShip/WarpToColosseum/SetSpecialLocation) 목적지 → 걸어서 닿는 진입점
//
// 디컴프 스크립트 전 파일의 이동 사이트를 라벨 그래프(분기 · 낙하 · 공용 호출 별칭 포함)로 거슬러 올라
// events.json 의 NPC · 간판 · 좌표 사건과 초기화 표(OnTransition · OnFrame · OnLoad)까지 잇는다.
// closedWarpReach.test.mts 가 쓴다 — 닫는 맵으로 가는 Warp 의 출처를 못 박는 시험이다
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/** @param {string} ROOT 저장소 뿌리 */
export function buildStaticWarps(ROOT) {
const S = resolve(ROOT, 'raw/decomp/res/field/scripts')
const DATA = resolve(ROOT, 'public/data')
const J = (p) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

const headers = readFileSync(resolve(ROOT, 'raw/decomp/generated/map_headers.txt'), 'utf8').split(/\r?\n/).filter((l) => l.length)
const mapId = new Map(headers.map((n, i) => [n.trim(), i]))
const mapName = (i) => headers[i]?.trim().replace('MAP_HEADER_', '') ?? `?${i}`

const meta = J('scripts.json')
const maps = J('maps.json').maps
const events = J('events.json').events
const fileIdx = new Map(meta.files.map((f, i) => [f.name, i]))

function resolveScript(id, mapFile) {
  for (const r of meta.ranges) {
    if (id < r.from) continue
    if (r.file === null) return null
    return { file: r.file, entry: id - r.from }
  }
  if (id >= 1) return { file: mapFile, entry: id - 1 }
  return null
}

// 매크로 별칭 (Common_* → CallCommonScript n)
const inc = readFileSync(resolve(ROOT, 'raw/decomp/asm/macros/scrcmd.inc'), 'utf8').split(/\r?\n/)
const alias = new Map()
for (let i = 0; i < inc.length; i++) {
  const m = inc[i].match(/^\s*\.macro\s+(\w+)/)
  if (!m) continue
  for (let j = i + 1; j < inc.length && !/\.endm/.test(inc[j]); j++) {
    const c = inc[j].match(/^\s*CallCommonScript\s+(0x[0-9A-Fa-f]+|\d+)/)
    if (c) { alias.set(m[1], Number(c[1])); break }
  }
}

const files = new Map() // name → {labels:Map, entries:[label], sites:[]}
const MOVE = /^\s*(Warp|WarpToColosseum|TakeShipFromCanalave|TakeShipFromSnowpoint|SetSpecialLocation|PlayBoatCutscene|TakeShipToCanalave|TakeShipToSnowpoint|WarpOut|DoDWWarp)\b\s*(.*)$/
for (const fn of readdirSync(S)) {
  if (!fn.endsWith('.s')) continue
  const name = fn.slice(0, -2)
  const lines = readFileSync(resolve(S, fn), 'utf8').split(/\r?\n/)
  const labels = new Map()
  const entries = []
  const body = [] // {label, line, n}
  let cur = null
  lines.forEach((raw, n) => {
    const line = raw.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
    const se = line.match(/^\s*ScriptEntry\s+(\w+)/)
    if (se) entries.push(se[1])
    const lb = line.match(/^([A-Za-z_]\w*):/)
    if (lb) { cur = lb[1]; labels.set(cur, []) ; return }
    if (cur) labels.get(cur).push({ line, n: n + 1 })
  })
  files.set(name, { labels, entries })
}

// 노드: `${file}:${label}`; 간선: 같은 파일 라벨 이름 · 공용 별칭
const common = 'scripts_common'
const commonId = (id) => { const t = resolveScript(id, -1); return t }
const succ = new Map()
const sites = [] // {file,label,n,kind,dest,raw}
for (const [fname, f] of files) {
  for (const [label, ls] of f.labels) {
    const key = `${fname}:${label}`
    const out = new Set()
    for (const { line, n } of ls) {
      const mv = line.match(MOVE)
      if (mv) {
        const args = mv[2].split(',').map((s) => s.trim())
        let dest = null
        if (mv[1] === 'Warp' || mv[1] === 'WarpToColosseum') dest = args[0]
        else if (mv[1] === 'SetSpecialLocation') dest = args[0]
        else if (mv[1] === 'TakeShipFromCanalave' || mv[1] === 'TakeShipFromSnowpoint') dest = args[1]
        else if (mv[1] === 'PlayBoatCutscene') dest = args[2]
        else if (mv[1] === 'TakeShipToCanalave') dest = 'MAP_HEADER_CANALAVE_CITY'
        else if (mv[1] === 'TakeShipToSnowpoint') dest = 'MAP_HEADER_SNOWPOINT_CITY'
        sites.push({ file: fname, label, n, kind: mv[1], dest, raw: line.trim(), key })
      }
      for (const tok of line.split(/[^A-Za-z0-9_]+/)) {
        if (!tok) continue
        if (f.labels.has(tok) && tok !== label) out.add(`${fname}:${tok}`)
        else if (f.labels.has(tok)) out.add(key)
        const a = alias.get(tok)
        if (a !== undefined) {
          const t = commonId(a)
          if (t && meta.files[t.file]) {
            const cf = files.get(meta.files[t.file].name)
            const lab = cf?.entries[t.entry]
            if (lab) out.add(`${meta.files[t.file].name}:${lab}`)
          }
        }
      }
      const cc = line.match(/^\s*CallCommonScript\s+(0x[0-9A-Fa-f]+|\d+)/)
      if (cc) {
        const t = commonId(Number(cc[1]))
        if (t && meta.files[t.file]) {
          const cf = files.get(meta.files[t.file].name)
          const lab = cf?.entries[t.entry]
          if (lab) out.add(`${meta.files[t.file].name}:${lab}`)
        }
      }
    }
    {
      const code = ls.map((l) => l.line.trim()).filter((l) => l && !l.startsWith('.') && !l.startsWith('@') && !l.startsWith('#'))
      const lastLine = code[code.length - 1] ?? ''
      if (!/^(End|GoTo|Return|ReturnCommonScript|EndMovement|ScriptEntryEnd)/.test(lastLine)) {
        const names = [...f.labels.keys()]
        const nx = names[names.indexOf(label) + 1]
        if (nx) out.add(`${fname}:${nx}`)
      }
    }
    succ.set(key, out)
  }
}
// 역방향
const pred = new Map()
for (const [k, outs] of succ) for (const o of outs) { if (!pred.has(o)) pred.set(o, new Set()); pred.get(o).add(k) }
function ancestors(start) {
  const seen = new Set([start]); const q = [start]
  while (q.length) { const k = q.pop(); for (const p of pred.get(k) ?? []) if (!seen.has(p)) { seen.add(p); q.push(p) } }
  return seen
}
// 진입점 노드 → (file, entry)
const entryNode = new Map() // key → [{file, entry}]
for (const [fname, f] of files) {
  const fi = fileIdx.get(fname)
  f.entries.forEach((lab, i) => {
    const k = `${fname}:${lab}`
    if (!entryNode.has(k)) entryNode.set(k, [])
    entryNode.get(k).push({ file: fi, entry: i, fname })
  })
}

// 이벤트 쪽 진입점
function parseInit(file) {
  const info = meta.files[file]
  if (!info) return { fixed: new Map(), frame: [] }
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const b = raw.subarray(info.at, info.at + info.size)
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const fixed = new Map(); let frame = []
  let at = 0
  while (at < b.byteLength) {
    const type = v.getUint8(at); if (type === 0) break; if (at + 5 > b.byteLength) break
    if (type === 1) { const off = v.getInt32(at + 1, true); if (off !== 0) { for (let p = at + 5 + off; p + 6 <= b.byteLength; p += 6) { const l = v.getUint16(p, true); if (l === 0) break; frame.push({ left: l, right: v.getUint16(p + 2, true), script: v.getUint16(p + 4, true) }) } } }
    else if (!fixed.has(type)) fixed.set(type, v.getUint16(at + 1, true))
    at += 5
  }
  return { fixed, frame }
}
const sources = new Map() // `${file}#${entry}` → [{map, kind, desc}]
const add = (r, m, kind, desc) => {
  if (!r) return
  const k = `${r.file}#${r.entry}`
  if (!sources.has(k)) sources.set(k, [])
  sources.get(k).push({ map: m.id, kind, desc })
}
const byEvents = new Map()
for (const m of maps) {
  if (!m) continue
  const ev = events[m.events]
  if (ev) {
    ev.npcs.forEach((n) => add(resolveScript(n.script, m.scripts), m, 'npc', `(${n.x},${n.z}) lid${n.localID} script${n.script} flag${n.flag}`))
    ev.signs.forEach((n) => add(resolveScript(n.script, m.scripts), m, 'sign', `(${n.x},${n.z}) script${n.script} type${n.type}`))
    ev.triggers.forEach((n) => add(resolveScript(n.script, m.scripts), m, 'coord', `(${n.x},${n.z}) w${n.width} l${n.length} script${n.script} var${n.var}=${n.value}`))
  }
  const init = parseInit(m.initScripts)
  for (const [t, sid] of init.fixed) add(resolveScript(sid, m.scripts), m, `init${t}`, `script${sid}`)
  init.frame.forEach((r) => add(resolveScript(r.script, m.scripts), m, 'frame', `var${r.left}==${r.right} script${r.script}`))
}

const out = []
for (const s of sites) {
  const anc = ancestors(s.key)
  const hits = []
  for (const a of anc) for (const en of entryNode.get(a) ?? []) {
    const src = sources.get(`${en.file}#${en.entry}`) ?? []
    hits.push({ fname: en.fname, entry: en.entry, src })
  }
  const destId = s.dest ? mapId.get(s.dest) : undefined
  out.push({ ...s, destId, destName: s.dest, entries: hits })
}
return out
}
