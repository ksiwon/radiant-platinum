'use strict'
// 플래티넘 트레이너 갈래표 (DATA.md §2.16)
//
//     pnpm gen:trainerClasses
//
// ⚠️ **짐작이 아니라 게임이 실제로 세운 짝이다.** BDSP는 어느 갈래가 어느 몸을
// 쓰는지 적어 두는데(`src/import/bdsp/trainerModels`), 플래티넘 오버월드는
// 갈래가 아니라 **그림 번호**로 사람을 세운다. 둘을 이으려면 "이 그림이 어느
// 갈래인가"가 필요하다.
//
// 그 답이 배치표에 있다. 트레이너 NPC는 `script`가 `TRAINER_*`이고, 그 이름의
// 자료 파일에 갈래가 적혀 있다:
//
//     res/field/events/events_route_203.json   graphics_id OBJ_EVENT_GFX_YOUNGSTER
//                                              script      TRAINER_YOUNGSTER_SEBASTIAN
//     res/trainers/data/youngster_sebastian.json   class  TRAINER_CLASS_YOUNGSTER
//
// 한 그림에 갈래가 여럿 걸리는 자리가 있다 — `ACE_TRAINER_M` 하나로 에이스
// 트레이너·용사냥꾼·포켓몬레인저가 다 선다. 그래서 **제일 많이 선 갈래**를 적고
// 몇 대 몇이었는지도 같이 적는다. 과반이 아니면 아예 안 적는다.
//
// ⚠️ **여기 담기는 것은 표지 게임 자료가 아니다.** 색인 번호와 개수뿐이다
// (COPYRIGHT.md §2).
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('fs')
const path = require('path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const EVENTS = path.join(DECOMP, 'res/field/events')
const TRAINERS = path.join(DECOMP, 'res/trainers/data')
const OUT = path.join(ROOT, 'src/import/platinum/trainerClasses.ts')

/** `OBJ_EVENT_GFX_*` → 번호. 값이 안 적힌 줄은 앞 번호 + 1이다 */
function graphicsIds() {
  const out = new Map()
  let next = 0
  for (const line of fs.readFileSync(
    path.join(DECOMP, 'generated/object_events_gfx.txt'), 'utf8',
  ).split(/\r?\n/)) {
    const t = line.trim()
    if (t === '') continue
    const m = /^(\w+)(?:\s*=\s*(\d+))?$/.exec(t)
    if (!m) throw new Error(`못 읽은 줄: ${t}`)
    out.set(m[1], m[2] === undefined ? next : Number(m[2]))
    next = out.get(m[1]) + 1
  }
  return out
}

/** `TRAINER_CLASS_*` 이름들. 줄 번호가 곧 갈래 번호다 */
function classNames() {
  return fs.readFileSync(
    path.join(DECOMP, 'generated/trainer_classes.txt'), 'utf8',
  ).split(/\r?\n/).map((s) => s.trim()).filter((s) => s !== '')
}

function main() {
  const gfx = graphicsIds()
  const names = classNames()
  const classes = new Map(names.map((name, i) => [name, i]))

  /** 트레이너 이름표 → 갈래 번호 */
  const ofTrainer = new Map()
  for (const file of fs.readdirSync(TRAINERS)) {
    if (!file.endsWith('.json')) continue
    const data = JSON.parse(fs.readFileSync(path.join(TRAINERS, file), 'utf8'))
    const cls = classes.get(data.class)
    if (cls === undefined) throw new Error(`${file}: 모르는 갈래 ${String(data.class)}`)
    ofTrainer.set(`TRAINER_${file.slice(0, -5).toUpperCase()}`, cls)
  }

  /** 그림 번호 → 갈래 번호 → 배치 수 */
  const tally = new Map()
  let unknown = 0
  for (const file of fs.readdirSync(EVENTS)) {
    if (!file.endsWith('.json')) continue
    const data = JSON.parse(fs.readFileSync(path.join(EVENTS, file), 'utf8'))
    for (const npc of data.object_events ?? []) {
      if (typeof npc.script !== 'string' || !npc.script.startsWith('TRAINER_')) continue
      const cls = ofTrainer.get(npc.script)
      if (cls === undefined) { unknown++; continue }
      const id = gfx.get(npc.graphics_id)
      if (id === undefined) throw new Error(`모르는 그림 ${String(npc.graphics_id)}`)
      const seen = tally.get(id) ?? new Map()
      seen.set(cls, (seen.get(cls) ?? 0) + 1)
      tally.set(id, seen)
    }
  }

  const rows = []
  const split = []
  for (const [id, seen] of [...tally].sort((a, b) => a[0] - b[0])) {
    const all = [...seen].sort((a, b) => b[1] - a[1])
    const total = all.reduce((sum, [, n]) => sum + n, 0)
    const [cls, n] = all[0]
    if (n * 2 <= total) { split.push(id); continue }
    rows.push([id, cls, n, total])
  }

  const body = rows.map(([id, cls, n, total]) => `  [${id}, ${cls}, ${n}, ${total}],`).join('\n')
  const list = names
    .map((name) => `  '${name.replace('TRAINER_CLASS_', '')}',`).join('\n')
  fs.writeFileSync(OUT, HEADER + list + '\n]\n' + MIDDLE + body + '\n]\n')
  console.log(`갈래 ${names.length}종 · 그림 ${rows.length}종 · `
    + `갈래가 갈린 것 ${split.length} (${split.join(' ')})`)
  if (unknown > 0) console.log(`  ⚠ 자료를 못 찾은 트레이너 대본 ${unknown}건`)
  console.log(`→ ${path.relative(ROOT, OUT)}`)
}

const HEADER = `// 플래티넘 트레이너 갈래표 (DATA.md §2.16)
//
// ⚠️ **손으로 고치지 않는다.** \`pnpm gen:trainerClasses\`가 디컴프에서 다시
// 만든다 (\`tools/extract/trainerClassModule.cjs\`).
//
// **표지 게임 자료가 아니다** — 이름표와 색인 번호와 개수뿐이다 (COPYRIGHT.md §2).

/** 갈래 이름. 줄 번호가 곧 갈래 번호다 (\`generated/trainer_classes.txt\`) */
export const TRAINER_CLASS_NAMES: readonly string[] = [
`

const MIDDLE = `
/**
 * 오버월드 그림 → 트레이너 갈래.
 *
 * 짐작이 아니라 **게임이 실제로 세운 짝**이다 — 배치표의 트레이너 NPC가 어느
 * 갈래로 싸우는지 세었다. 한 그림에 갈래가 여럿 걸리는 자리가 있어서
 * (\`ACE_TRAINER_M\` 하나로 에이스 트레이너·용사냥꾼·포켓몬레인저가 다 선다)
 * 제일 많이 선 것을 적고 몇 대 몇이었는지도 남긴다. 과반이 아니면 안 적는다.
 *
 * \`[그림 번호, 트레이너 갈래, 그 갈래로 선 배치 수, 전체 배치 수]\`
 */
type SpriteClassRow = readonly [number, number, number, number]

export const SPRITE_TRAINER_CLASS: readonly SpriteClassRow[] = [
`

main()
