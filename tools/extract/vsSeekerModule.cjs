'use strict'
// VS시커 재대결 표 → src/engine/world/vsSeekerTable.ts (PARITY §7.9)
//
//     pnpm gen:vsseeker
//
// ⚠️ **왜 소스에 굽는가.** `gVsSeekerRematchData`는 롬 자료가 아니라 **코드 안의
// 표**다 (`overlay005/vs_seeker.c`). 어느 트레이너가 재대결을 받고, 그 재대결이
// 몇 단계이고, 각 단계가 어느 트레이너 번호인지가 어느 NARC에도 안 적혀 있다 —
// 트레이너 자료(`trainers.narc`)에는 「부하 여섯」이라는 관계가 없다.
//
// ⚠️ **여기 담기는 것은 번호와 수뿐이다.** 이름도 대사도 한 바이트도 안 담는다 —
// `TRAINER_LASS_SAMANTHA`는 `generated/trainers.txt`의 줄 번호로 바뀐다.
//
// ⚠️ **손으로 고치지 않는다.** 고칠 곳은 디컴프이고 이 스크립트가 다시 만든다.
const fs = require('node:fs')
const path = require('node:path')

const { ROOT, requireDir } = require('../raw/sources.cjs')
const DECOMP = requireDir('references.decomp')
const OUT = path.join(ROOT, 'src/engine/world/vsSeekerTable.ts')

const read = (p) => fs.readFileSync(path.join(DECOMP, p), 'utf8')

/** `generated/*.txt`를 줄 차례대로 푼다 */
function enumValues(file) {
  const out = new Map()
  let next = 0
  for (const raw of read(file).split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '' || line.startsWith('//')) continue
    const eq = line.indexOf('=')
    if (eq < 0) { out.set(line, next); next++; continue }
    const name = line.slice(0, eq).trim()
    const text = line.slice(eq + 1).trim()
    const value = out.has(text) ? out.get(text)
      : text.startsWith('0x') ? Number.parseInt(text, 16) : Number(text)
    if (!Number.isFinite(value)) throw new Error(`${file}: ${line}`)
    out.set(name, value)
    next = value + 1
  }
  return out
}

/** `#define NAME 값` — 16진수도 받는다 */
function defineValue(src, name) {
  const m = new RegExp(`#define\\s+${name}\\s+(\\S+)`).exec(src)
  if (!m) throw new Error(`#define ${name}이 없다`)
  const v = m[1].startsWith('0x') ? Number.parseInt(m[1], 16) : Number(m[1])
  if (!Number.isFinite(v)) throw new Error(`#define ${name}이 수가 아니다: ${m[1]}`)
  return v
}

/**
 * `gVsSeekerRematchData` 한 줄.
 *
 * ⚠️ **두 모양이 섞여 있다.** 대부분은 `NoUniqueRematches(X)` 매크로 한 줄이고
 * (같은 트레이너를 다시 싸운다), 나머지가 중괄호 여섯 칸을 직접 적는다
 */
function rematchRows(src, trainers, none, end) {
  const at = src.indexOf('gVsSeekerRematchData[] = {')
  if (at < 0) throw new Error('gVsSeekerRematchData를 못 찾는다')
  const open = src.indexOf('{', at)
  const close = src.indexOf('\n};', open)
  const body = src.slice(open + 1, close)

  const id = (name) => {
    const text = name.trim()
    if (text === '_' || text === 'VS_SEEKER_REMATCH_DATA_NONE') return none
    if (text === 'VS_SEEKER_REMATCH_DATA_END') return end
    const value = trainers.get(text)
    if (value === undefined) throw new Error(`모르는 트레이너: ${text}`)
    return value
  }

  const rows = []
  // 매크로 한 줄과 중괄호 한 줄을 **같은 훑기로** 잡는다 — 따로 훑으면
  // 표에 적힌 차례가 무너진다. 자리(index)가 곧 재대결 번호다
  for (const m of body.matchAll(/NoUniqueRematches\(([^)]+)\)|\{([^}]*)\}/g)) {
    if (m[1] !== undefined) {
      const t = id(m[1])
      rows.push([t, t, end, end, end, end])
      continue
    }
    const cells = m[2].split(',').map(id)
    if (cells.length !== 6) throw new Error(`칸이 ${cells.length}개다: ${m[2]}`)
    rows.push(cells)
  }
  return rows
}

function main() {
  const src = read('src/overlay005/vs_seeker.c')
  const trainers = enumValues('generated/trainers.txt')
  const flags = enumValues('generated/vars_flags.txt')
  const moves = enumValues('generated/movement_types.txt')

  const none = defineValue(src, 'VS_SEEKER_REMATCH_DATA_NONE')
  const end = defineValue(src, 'VS_SEEKER_REMATCH_DATA_END')
  const maxRematches = defineValue(src, 'VS_SEEKER_MAX_REMATCHES')
  const battery = defineValue(src, 'VS_SEEKER_MAX_BATTERY')
  const chance = defineValue(src, 'VS_SEEKER_REMATCH_CHANCE')
  const activeSteps = defineValue(src, 'VS_SEEKER_MAX_NUM_ACTIVE_STEPS')
  const radius = {
    left: defineValue(src, 'VS_SEEKER_SEARCH_RADIUS_LEFT'),
    right: defineValue(src, 'VS_SEEKER_SEARCH_RADIUS_RIGHT'),
    up: defineValue(src, 'VS_SEEKER_SEARCH_RADIUS_UP'),
    down: defineValue(src, 'VS_SEEKER_SEARCH_RADIUS_DOWN'),
  }

  const rows = rematchRows(src, trainers, none, end)
  for (const [i, row] of rows.entries()) {
    if (row.length !== maxRematches) throw new Error(`${i}번 줄이 ${row.length}칸이다`)
    if (row[0] === none || row[0] === end) throw new Error(`${i}번 줄의 첫 칸이 트레이너가 아니다`)
  }
  const firsts = new Set(rows.map((r) => r[0]))
  if (firsts.size !== rows.length) throw new Error('첫 칸이 겹치는 줄이 있다 — 조회가 앞엣것만 찾는다')

  // 플래그·변수는 `vars_flags.txt`를 C 열거형으로 세어 나온다. 확정된 셋이
  // 동시에 떨어지는 것으로 그 셈을 확인한다 (`script/vars.ts`와 같은 잣대)
  const check = { FLAG_HAS_POKEDEX: 144, TRAINER_DEFEATED_FLAGS_START: 1360, VARS_START: 0x4000 }
  for (const [name, want] of Object.entries(check)) {
    if (flags.get(name) !== want) throw new Error(`${name}이 ${flags.get(name)}이다 — ${want}이어야 한다`)
  }

  const usedFlag = flags.get('FLAG_VS_SEEKER_USED')
  const levelFlags = [1, 2, 3, 4, 5].map((n) => flags.get(`FLAG_UNLOCKED_VS_SEEKER_LVL_${String(n)}`))
  const varBattery = flags.get('VAR_VS_SEEKER_BATTERY_LEVEL')
  const varSteps = flags.get('VAR_VS_SEEKER_STEP_COUNT')
  const spin = moves.get('MOVEMENT_TYPE_VS_SEEKER_SPIN')
  const lookAround = moves.get('MOVEMENT_TYPE_LOOK_AROUND')
  const disguises = ['SNOW', 'SAND', 'ROCK', 'GRASS'].map((n) => moves.get(`MOVEMENT_TYPE_DISGUISE_${n}`))
  // `VsSeeker_SetMoveCodeForFacingDirection`이 방향으로 고르는 넷.
  // **자리가 곧 방향 번호다** — `constants/map_object.h`의 `DIR_*`를 그대로 쓴다
  const mapObject = read('include/constants/map_object.h')
  const look = []
  for (const name of ['NORTH', 'SOUTH', 'WEST', 'EAST']) {
    look[defineValue(mapObject, `DIR_${name}`)] = moves.get(`MOVEMENT_TYPE_LOOK_${name}`)
  }
  for (const [name, v] of Object.entries({ usedFlag, varBattery, varSteps, spin, lookAround })) {
    if (v === undefined) throw new Error(`${name}을 못 찾는다`)
  }
  if (look.length !== 4 || look.some((v) => v === undefined)) {
    throw new Error(`방향별 이동 유형이 빈다: ${JSON.stringify(look)}`)
  }
  if (levelFlags.some((v) => v === undefined)) throw new Error('재대결 단계 플래그가 빈다')
  if (levelFlags.some((v, i) => i > 0 && v !== levelFlags[i - 1] + 1)) {
    throw new Error('재대결 단계 플래그가 이어져 있지 않다')
  }

  const unique = rows.filter((r) => r.some((t, i) => i > 0 && t !== r[0] && t !== none && t !== end))
  const tiers = rows.map((r) => r.filter((t, i) => i > 0 && t !== none && t !== end).length)

  const out = `// VS시커 재대결 표 (PARITY §7.9)
//
// ⚠️ **손으로 고치지 않는다** — \`pnpm gen:vsseeker\`가 디컴프에서 다시 만든다
// (\`tools/extract/vsSeekerModule.cjs\`).

/** 배터리가 다 차는 걸음 (\`VS_SEEKER_MAX_BATTERY\`) */
export const VS_SEEKER_MAX_BATTERY = ${battery}

/**
 * 이긴 트레이너가 재대결에 응할 확률 (%) (\`VS_SEEKER_REMATCH_CHANCE\`).
 *
 * ⚠️ **한 사람씩 따로 굴린다** — 화면 안에 여덟이 있으면 여덟 번 굴리므로
 * "아무도 안 응한다"가 나올 확률은 1/${2 ** 8}까지 떨어진다
 */
export const VS_SEEKER_REMATCH_CHANCE = ${chance}

/** 표 한 줄의 칸 수 (\`VS_SEEKER_MAX_REMATCHES\`). 0번이 원래 트레이너다 */
export const VS_SEEKER_MAX_REMATCHES = ${maxRematches}

/** 느낌표가 서 있는 걸음 (\`VS_SEEKER_MAX_NUM_ACTIVE_STEPS\`) */
export const VS_SEEKER_MAX_ACTIVE_STEPS = ${activeSteps}

/**
 * 훑는 범위 (\`VS_SEEKER_SEARCH_RADIUS_*\`).
 *
 * ⚠️ **아래가 한 칸 좁다.** 위 ${radius.up} · 아래 ${radius.down}이라 주인공이 가운데가 아니다 —
 * DS 화면이 세로로 짧아 발밑이 덜 보이는 것을 그대로 옮긴 값이다
 */
export const VS_SEEKER_SEARCH = {
  left: ${radius.left}, right: ${radius.right}, up: ${radius.up}, down: ${radius.down},
} as const

/** 그 단계에 고유한 트레이너가 없다 (\`VS_SEEKER_REMATCH_DATA_NONE\`) */
export const REMATCH_NONE = ${none}
/** 표가 여기서 끝난다 (\`VS_SEEKER_REMATCH_DATA_END\`) */
export const REMATCH_END = ${end}

/** \`FLAG_VS_SEEKER_USED\` — 느낌표가 서 있는 동안 켜져 있다 */
export const FLAG_VS_SEEKER_USED = ${usedFlag}
/** \`FLAG_UNLOCKED_VS_SEEKER_LVL_1\`. 다섯이 이어져 있어서 단계로 더한다 */
export const FLAG_UNLOCKED_VS_SEEKER_LVL_1 = ${levelFlags[0]}
/** \`VAR_VS_SEEKER_BATTERY_LEVEL\` (번호 그대로, \`VARS_START\`가 이미 더해져 있다) */
export const VAR_VS_SEEKER_BATTERY = ${varBattery}
/** \`VAR_VS_SEEKER_STEP_COUNT\` */
export const VAR_VS_SEEKER_STEPS = ${varSteps}

/** \`MOVEMENT_TYPE_VS_SEEKER_SPIN\` — **이 값 하나가 「재대결을 받는다」다** */
export const MOVEMENT_TYPE_VS_SEEKER_SPIN = ${spin}
/** 걸음이 다하면 되돌아가는 유형 (\`MOVEMENT_TYPE_LOOK_AROUND\`) */
export const MOVEMENT_TYPE_LOOK_AROUND = ${lookAround}
/**
 * 그 방향을 보고 굳는 유형 (\`MOVEMENT_TYPE_LOOK_*\`).
 *
 * **자리가 곧 방향 번호다** (\`DIR_NORTH\`=0 · \`DIR_SOUTH\`=1 · \`DIR_WEST\`=2 · \`DIR_EAST\`=3)
 */
export const MOVEMENT_TYPE_LOOK: readonly number[] = [${look.join(', ')}]
/** 변장한 사람은 안 훑는다 (\`VsSeeker_IsMoveCodeHidden\`) */
export const DISGUISE_MOVEMENT_TYPES: readonly number[] = [${disguises.join(', ')}]

/**
 * 재대결 표 ${rows.length}줄 (\`gVsSeekerRematchData\`).
 *
 * 한 줄이 여섯 칸이고 **0번이 길에 서 있는 그 트레이너**다. 1~5번이 단계별
 * 재대결 상대이고, \`REMATCH_NONE\`(${none})이면 그 단계에 고유한 상대가 없어
 * 한 단계 낮은 쪽으로 내려간다. \`REMATCH_END\`(${end})는 그 줄이 거기서 끝난다는 뜻이다.
 *
 * ⚠️ **${rows.length - unique.length}줄은 재대결이 「같은 사람 그대로」다** — \`NoUniqueRematches\`가 0·1번을
 * 같은 번호로 채운다. 팀이 세지는 것은 ${unique.length}줄뿐이다
 */
export const VS_SEEKER_REMATCHES: readonly (readonly number[])[] = [
${rows.map((r) => `  [${r.join(', ')}],`).join('\n')}
]
`
  fs.writeFileSync(OUT, out.replace(/\n/g, '\r\n'))

  const spread = new Map()
  for (const t of tiers) spread.set(t, (spread.get(t) ?? 0) + 1)
  console.log(`vsSeekerTable.ts — 재대결 ${rows.length}줄 (고유 팀 ${unique.length} · 그대로 ${rows.length - unique.length})`)
  console.log(`  단계 수 분포 ${[...spread].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}단계 ${v}줄`).join(' · ')}`)
  console.log(`  배터리 ${battery} · 확률 ${chance}% · 걸음 ${activeSteps} · 범위 ${radius.left}/${radius.right}/${radius.up}/${radius.down}`)
  console.log(`  플래그 ${usedFlag} · 단계 ${levelFlags[0]}~${levelFlags[4]} · 변수 ${varBattery}·${varSteps} · 유형 ${spin}`)
}

if (require.main === module) main()
