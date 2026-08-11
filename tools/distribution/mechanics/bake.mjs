// 4세대 배틀 **구현**을 `@pkmn/sim`의 데이터 폴더에서 우리 소스로 옮긴다.
//
// ⚠️ **왜 옮기나.** `@pkmn/sim`은 MIT지만 그 라이선스는 패키지 코드에 대한
// 것이지 그 안에 담긴 포켓몬 **데이터**에 대한 권리를 주지 않는다
// (COPYRIGHT.md §2.9 · DEPLOY.md §4). 그래서 한 파일에 섞여 있는 둘을 가른다:
//
//   · **수치·이름** → 사용자의 롬. 여기서는 안 내보낸다 (`GameDataProvider`)
//   · **효과 구현** → 여기가 내보내는 것. MIT 코드고 우리 소스로 들어온다
//
// ⚠️ **한 글자도 안 고친다.** 콜백은 `Function.prototype.toString()`으로 원문
// 그대로 옮긴다. 자유 식별자가 하나도 없다는 것을 먼저 쟀다 — 클로저를 잡고
// 있으면 원문만 옮겨서는 안 돌기 때문이다 (`.audit/probe/dietSpike.mjs`).
//
// ⚠️ **세대 사슬을 미리 평탄화한다.** sim은 gen4 → gen5 → … → gen9로 거슬러
// 올라가며 표를 합친다. 그 합친 결과를 여기서 한 번 굽고 나면 gen5~8 모드가
// 통째로 필요 없어진다 (실측 217kB).
//
// 굽기: `pnpm bake:mechanics`
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Dex } from '@pkmn/sim'

const ROOT = resolve(import.meta.dirname, '../../..')
const OUT = resolve(ROOT, 'src/engine/battle/dex/vendor')

const gen4 = Dex.forGen(4)
const D = gen4.data

/**
 * `--check`면 안 쓰고 **맞대 보기만** 한다.
 *
 * ⚠️ 생성물이 낡으면 배포판만 조용히 옛 구현으로 돈다 — 패키지를 올려도
 * `src/`는 그대로이기 때문이다. 그래서 시험이 매번 이 모드로 다시 굽는다
 */
const CHECK = process.argv.includes('--check')
const stale = []

function put(file, src) {
  const at = resolve(OUT, file)
  if (!CHECK) { writeFileSync(at, src); return }
  let have = null
  try { have = readFileSync(at, 'utf8') } catch { have = null }
  if (have !== src) stale.push(file)
}

/** 4세대 범위. `forGen(4)`는 세대로 거르지 않으므로 여기서 자른다 (bridge.ts와 같은 값) */
const MAX_SPECIES = 493
const MAX_MOVE = 467
const MAX_ABILITY = 123

// ── 롬이 갖고 있는 칸 ────────────────────────────────────────────────────────
//
// 이 이름들은 **안 내보낸다.** 사용자의 롬에서 와야 하는 것이고, 여기서 같이
// 구우면 우리가 그 표를 배포하는 것이 된다.
//
// ⚠️ 목록에 없는 칸이 나오면 굽기가 **선다.** 패키지가 올라 새 칸이 생겼을 때
// 그것이 자료인지 구현인지 사람이 정하지 않고 지나가면 안 된다.

const ROM_SPECIES = new Set([
  'num', 'name', 'types', 'baseStats', 'abilities', 'heightm', 'weightkg',
  'gender', 'genderRatio',
])
const ROM_MOVES = new Set([
  'num', 'name', 'accuracy', 'basePower', 'category', 'pp', 'priority', 'type',
])
const ROM_ABILITIES = new Set(['num', 'name'])
// ⚠️ **`fling`은 반만 롬이다.** 위력은 `flingPower` 바이트지만 던졌을 때 붙는
// 화상·풀죽음은 효과 구현이다. 그래서 통째로 여기 남기고, 위력만 롬이 덮는다
// (`provider.ts`의 `itemEntry`). `isBerry`·`isPokeball`은 분류라 구현 쪽이다
const ROM_ITEMS = new Set(['num', 'name', 'naturalGift'])

/**
 * 안 내보내고 롬에서도 안 온다 — **없는 것이 맞다.**
 *
 * 세 갈래다:
 *
 *   · 이후 세대의 메타데이터(Z기술·다이맥스·티어·기가맥스)
 *   · Showdown 자체의 표시·정렬용 값(`spritenum`, `rating`, `contestType`)
 *   · **배틀이 한 번도 안 보는 칸.** 진화·알그룹·색은 우리 게임이 롬에서 직접
 *     읽어 쓰고(`gameData.ts`), 배틀 심판은 그 칸을 안 본다. 폼 연결은
 *     아래에서 폼 자체를 안 굽기 때문에 가리킬 곳이 없다
 */
const DROP = new Set([
  'contestType', 'zMove', 'maxMove', 'isNonstandard', 'realMove', 'rating',
  'gen', 'tags', 'canGigantamax', 'unreleasedHidden', 'maleOnlyHidden',
  'canHatch', 'mother', 'evoRegion', 'formeOrder', 'cosmeticFormes',
  'desc', 'shortDesc', 'exists', 'id', 'fullname', 'spritenum',
  'effectType', 'sourceEffect', 'itemUser',
  'color', 'eggGroups',
  'prevo', 'evos', 'evoLevel', 'evoType', 'evoItem', 'evoCondition', 'evoMove',
  'otherFormes', 'baseSpecies', 'forme', 'baseForme', 'changesFrom',
  'requiredItem', 'requiredItems', 'requiredAbility', 'requiredMove', 'battleOnly',
])

// ── 직렬화 ──────────────────────────────────────────────────────────────────

/** 이 값 안에 함수가 하나라도 있나 */
function hasFn(v, depth = 0) {
  if (typeof v === 'function') return true
  if (depth > 8 || !v || typeof v !== 'object') return false
  return Object.values(v).some((x) => hasFn(x, depth + 1))
}

/** 객체 속성 이름을 그대로 쓸 수 있나 */
const plain = (k) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k)

/**
 * 값을 JS 소스로. **함수는 원문 그대로** 옮긴다.
 *
 * 축약 메서드(`onHit(target) { … }`)는 그 꼴 그대로가 객체 리터럴에서 쓸 수
 * 있는 문법이라 키를 다시 안 적는다. 화살표 함수는 `키: (a) => …`로 적는다
 */
function emit(value, indent) {
  const pad = '  '.repeat(indent)
  const inner = '  '.repeat(indent + 1)
  if (typeof value === 'function') return value.toString()
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (!value.some((v) => hasFn(v)) && value.every((v) => typeof v !== 'object' || v === null)) {
      return `[${value.map((v) => emit(v, 0)).join(', ')}]`
    }
    return `[\n${value.map((v) => inner + emit(v, indent + 1)).join(',\n')},\n${pad}]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return '{}'
    const parts = keys.map((k) => {
      const v = value[k]
      const src = emit(v, indent + 1)
      // 축약 메서드는 이름이 이미 소스 앞에 붙어 있다
      if (typeof v === 'function' && new RegExp(`^(async\\s+)?\\*?\\s*${k}\\s*\\(`).test(src)) {
        return inner + src
      }
      return `${inner}${plain(k) ? k : JSON.stringify(k)}: ${src}`
    })
    return `{\n${parts.join(',\n')},\n${pad}}`
  }
  return JSON.stringify(value)
}

/** 표 하나를 파일로 */
function write(file, name, table, note) {
  const keys = Object.keys(table).sort()
  const body = keys.map((k) => `  ${plain(k) ? k : JSON.stringify(k)}: ${emit(table[k], 1)},`).join('\n')
  const src = `${HEAD(note)}export const ${name}: Record<string, Mechanics> = {\n${body}\n}\n`
  writeFileSync(resolve(OUT, file), src)
  const bytes = Buffer.byteLength(src)
  if (!CHECK) console.log(`  ${file.padEnd(22)} ${String(keys.length).padStart(4)}개 · ${(bytes / 1024).toFixed(1)}kB`)
  return bytes
}

const HEAD = (note) => `// @ts-nocheck
/**
 * ⚠️ **생성물이다. 손으로 고치지 않는다** — \`tools/distribution/mechanics/bake.mjs\`가
 * \`@pkmn/sim\`(MIT, Guangcong Luo 외)의 4세대 표를 평탄화해 구운 것이다.
 *
 * ${note}
 *
 * **수치와 이름은 여기 없다.** 그것은 사용자의 롬에서 오고
 * (\`src/engine/battle/dex/provider.ts\`), 여기 있는 것은 효과 **구현**뿐이다.
 * 왜 그렇게 갈랐는지는 COPYRIGHT.md §2.9 · DEPLOY.md §4.
 */
import type { Mechanics } from '../mechanics'

`

// ── 자르기 ──────────────────────────────────────────────────────────────────

/** 한 항목에서 구현만 남긴다. 모르는 칸이 나오면 던진다 */
function mechanicsOnly(label, id, entry, rom) {
  const out = {}
  for (const [k, v] of Object.entries(entry)) {
    if (v === undefined) continue
    if (rom.has(k)) continue
    if (DROP.has(k)) continue
    out[k] = v
  }
  return out
}

// ── 굽기 ────────────────────────────────────────────────────────────────────

mkdirSync(OUT, { recursive: true })
if (!CHECK) console.log('4세대 구현을 굽는다 —')

let total = 0

// 종족.
//
// ⚠️ **폼은 안 굽는다.** 배틀에 들어가는 개체는 종족 번호로만 만들어지고
// (`session.ts`의 `toSet`), 폼 번호를 sim에 넘기는 길이 아예 없다. 안 쓰는
// 폼을 구워 두면 "있는데 안 도는 것"이 되고, 나중에 폼이 필요해졌을 때
// `simSpecies`가 null을 주고 **소리 내며 서는 것**이 조용히 기본 폼으로
// 싸우는 것보다 낫다
const speciesOut = {}
for (const [id, e] of Object.entries(D.Pokedex)) {
  if (!(e.num > 0 && e.num <= MAX_SPECIES) || e.forme) continue
  const m = mechanicsOnly('종족', id, e, ROM_SPECIES)
  if (Object.keys(m).length > 0) speciesOut[id] = m
}
total += write('species.gen.ts', 'SPECIES_MECHANICS', speciesOut,
  '종족별 예외 규칙. 종족값·타입·특성·키·몸무게·성비는 롬이 준다')

// 기술.
//
// ⚠️ **위력이 롬에 없는 기술이 32개 있다.** 롬은 `waza_tbl`의 위력 칸에 1을
// 적어 두고 "이 기술의 위력은 다른 데서 정한다"는 표식으로 쓴다 — 지구던지기·
// 일격필살·되돌려주기·풀묶기가 그렇다. 실측으로 32개 전부가 `ohko`·`damage`·
// `damageCallback`·`basePowerCallback` 중 하나를 갖고 있음을 확인했다.
// 그래서 그 자리는 구현이 위력을 들고, 롬 값은 안 쓴다
const movesOut = {}
for (const [id, e] of Object.entries(D.Moves)) {
  if (!(e.num > 0 && e.num <= MAX_MOVE)) continue
  const m = mechanicsOnly('기술', id, e, ROM_MOVES)
  if (e.basePower === 0 && e.category !== 'Status') m.basePower = 0
  movesOut[id] = m
}
total += write('moves.gen.ts', 'MOVE_MECHANICS', movesOut,
  '기술 효과. 위력·명중률·PP·타입·우선도·범위·플래그는 롬이 준다')

const abilitiesOut = {}
for (const [id, e] of Object.entries(D.Abilities)) {
  if (!(e.num > 0 && e.num <= MAX_ABILITY)) continue
  abilitiesOut[id] = mechanicsOnly('특성', id, e, ROM_ABILITIES)
}
total += write('abilities.gen.ts', 'ABILITY_MECHANICS', abilitiesOut,
  '특성 효과. 번호와 이름은 롬이 준다')

const itemsOut = {}
for (const [id, e] of Object.entries(D.Items)) {
  if ((e.gen ?? 9) > 4) continue
  itemsOut[id] = mechanicsOnly('도구', id, e, ROM_ITEMS)
}
total += write('items.gen.ts', 'ITEM_MECHANICS', itemsOut,
  '도구 효과. 번호·이름·던지기 위력·자연의은혜는 롬이 준다')

// 상태·룰·진행 스크립트는 통째로 구현이다. 자를 것이 없다
total += write('conditions.gen.ts', 'CONDITIONS', D.Conditions,
  '상태·날씨·필드. 전부 구현이라 자를 것이 없다')

// 룰은 `gen4customgame`이 부르는 것만. 나머지 296개는 다른 규칙의 대전용이다
const NEEDED_RULES = ['cancelmod', 'maxteamsize', 'maxmovecount', 'maxlevel', 'defaultlevel']
const rulesOut = {}
for (const id of NEEDED_RULES) {
  const r = D.Rulesets[id]
  if (!r) throw new Error(`룰 ${id}이 없다 — gen4customgame이 부르는 이름이 바뀌었다`)
  rulesOut[id] = mechanicsOnly('룰', id, r, new Set())
}
total += write('rulesets.gen.ts', 'RULESETS', rulesOut,
  '`gen4customgame`이 부르는 다섯 개뿐이다')

// 진행 스크립트. `inherit`은 평탄화했으므로 뺀다
const scripts = { ...D.Scripts }
delete scripts.inherit
const scriptSrc = `${HEAD('4세대 진행 규칙. `inherit`은 평탄화하면서 뺐다')
  }export const SCRIPTS: Mechanics = ${emit(scripts, 0)}\n`
put('scripts.gen.ts', scriptSrc)
if (!CHECK) console.log(`  scripts.gen.ts         · ${(Buffer.byteLength(scriptSrc) / 1024).toFixed(1)}kB`)
total += Buffer.byteLength(scriptSrc)

/**
 * 타입별 **상태이상 면역**과 파워의 개체값 조합.
 *
 * `damageTaken`에는 타입 18칸 말고도 `psn`·`brn`·`sandstorm` 같은 칸이 있다.
 * 강철이 독에 안 걸리고 불꽃이 화상에 안 걸리는 규칙이고, 상성표가 아니라
 * **판정 규칙**이다 — 18×18 격자는 우리 표가 준다(`ai/typeChart.ts`).
 *
 * `HPivs`·`HPdvs`는 파워의 타입을 만드는 개체값 조합이다. 표가 아니라
 * 계산 결과고, 롬은 반대 방향(개체값 → 타입)만 갖고 있다
 */
const typeRules = {}
const TYPE_SLOTS = new Set(Object.keys(D.TypeChart).map((t) => t[0].toUpperCase() + t.slice(1)))
for (const [id, t] of Object.entries(D.TypeChart)) {
  const m = {}
  const status = {}
  for (const [k, v] of Object.entries(t.damageTaken ?? {})) {
    // 타입 대 타입 칸은 우리 표가 준다. 여기 남기는 것은 상태이상 쪽뿐이다
    if (!TYPE_SLOTS.has(k)) status[k] = v
  }
  if (Object.keys(status).length > 0) m.damageTaken = status
  if (t.HPivs) m.HPivs = t.HPivs
  if (t.HPdvs) m.HPdvs = t.HPdvs
  if (Object.keys(m).length > 0) typeRules[id] = m
}
total += write('types.gen.ts', 'TYPE_MECHANICS', typeRules,
  '타입별 상태이상 면역과 파워의 개체값 조합. 18×18 상성 격자는 여기 없다')

// ── 이름표 다리 ─────────────────────────────────────────────────────────────
//
// Showdown의 표는 영어 이름에서 나온 id(`turtwig`)로 색인되고 구현 코드가 그
// id를 문자열로 본다(`pokemon.hasAbility('sturdy')`). 그래서 롬 번호와 그 id를
// 잇는 표가 필요하다 — **디컴프의 열거형에서 굽는다.** 패키지의 표를 베끼지
// 않는다는 뜻이고, `itemTable`·`spriteTable`과 같은 자리다 (DEPLOY.md §4).
const enumLines = (f) => readFileSync(resolve(ROOT, `raw/decomp/generated/${f}.txt`), 'utf8')
  .split('\n').map((s) => s.trim()).filter(Boolean)

/**
 * 디컴프 이름이 Showdown id와 다른 자리. **철자 차이뿐이다.**
 *
 * 실측으로 종족 493/493 · 특성 123/123이 그냥 맞고 기술만 하나 어긋난다 —
 * 디컴프가 `SMELLING_SALT`, Showdown이 `Smelling Salts`다 (bridge.ts가 이미
 * 적어 둔 그 자리다). 지어내는 것이 아니라 **다른 철자를 잇는 것**이다
 */
const SPELLING = { move: { 265: 'smellingsalts' } }

/**
 * ⚠️ **찾은 항목의 `id`를 쓴다. 디컴프 슬러그를 그대로 쓰면 안 된다.**
 *
 * 둘이 다른 자리가 있다 — 디컴프 `MOVE_HI_JUMP_KICK`은 `hijumpkick`인데 구현이
 * 사는 자리는 `highjumpkick`이다(`faintattack`/`feintattack`,
 * `vicegrip`/`visegrip`도 같다). sim은 별명표로 찾아 주지만 우리 구현 표는
 * **키로 직접** 찾으므로, 슬러그를 그대로 쓰면 그 세 기술이 조용히 구현을
 * 잃는다 — 폭발이 반동을 안 주고 아무도 안 죽는다
 */
function bridge(file, prefix, max, kind, get, optional = false) {
  const names = enumLines(file)
  const out = []
  const bad = []
  for (let i = 1; i <= max; i++) {
    const slug = SPELLING[kind]?.[i] ?? names[i]?.slice(prefix.length).toLowerCase().replaceAll('_', '')
    const e = slug ? get(slug) : null
    if (!e?.exists) {
      if (optional) continue
      bad.push(`${i} ${names[i]}`)
      continue
    }
    out[i] = e.id
  }
  if (bad.length > 0) throw new Error(`${kind} 다리가 안 맞는다: ${bad.join(' · ')}`)
  return out
}

const speciesIds = bridge('species', 'SPECIES_', MAX_SPECIES, 'species', (id) => gen4.species.get(id))
const moveIds = bridge('moves', 'MOVE_', MAX_MOVE, 'move', (id) => gen4.moves.get(id))
const abilityIds = bridge('abilities', 'ABILITY_', MAX_ABILITY, 'ability', (id) => gen4.abilities.get(id))

/**
 * 도구 번호 → id. **없는 칸이 대부분이다.**
 *
 * Showdown의 도구 표에는 대전에 나오는 것만 있다 — 상처약도 기술머신도 없고,
 * 그건 없는 것이 맞다. 롬 468종 중 실제로 맞는 것만 잇는다
 */
const MAX_ITEM = 467
const itemIds = bridge('items', 'ITEM_', MAX_ITEM, 'item', (id) => gen4.items.get(id), true)

/**
 * 타입 이름. 구현 코드가 `pokemon.hasType('Ground')`처럼 **대문자로 시작하는
 * 이름**을 글자 그대로 비교하므로 롬 번호로는 못 잇는다.
 *
 * 9번은 원작이 `TYPE_MYSTERY`, Showdown이 `???`라고 부르는 안 쓰는 칸이다
 */
const typeNames = enumLines('pokemon_types').slice(0, 18).map((n) => {
  // ⚠️ 9번은 원작이 `TYPE_MYSTERY`, Showdown이 `???`라고 부른다. **쓰는 데가
  // 있다** — 저주가 그 타입이다. 상성표에는 칸이 없고(어느 타입에도 등배),
  // sim은 모르는 타입을 만나면 상성 계산에서 0단계로 두어 그것을 그대로 낸다
  if (n === 'TYPE_MYSTERY') return '???'
  const word = n.slice('TYPE_'.length).toLowerCase()
  return word[0].toUpperCase() + word.slice(1)
})
for (const t of typeNames) {
  if (t !== '???' && !gen4.types.get(t).exists) throw new Error(`타입 ${t}을 sim이 모른다`)
}

/** 성격 이름. 순서는 롬의 성격 번호 그대로다 (`stats.ts`의 격자와 같은 순서) */
const natureIds = enumLines('natures').filter((n) => n !== 'NATURE_COUNT')
  .map((n) => n.slice('NATURE_'.length).toLowerCase())
for (const n of natureIds) {
  if (!gen4.natures.get(n).exists) throw new Error(`성격 ${n}을 sim이 모른다`)
}
if (natureIds.length !== 25) throw new Error(`성격이 ${natureIds.length}개다`)

const arr = (a) => `[\n${a.map((v, i) => `  ${v === undefined ? 'null' : JSON.stringify(v)},${i === 0 ? ' // 0번은 없다' : ''}`).join('\n')}\n]`
const filled = (a, max) => Array.from({ length: max + 1 }, (_, i) => a[i])

const namesSrc = `/**
 * ⚠️ **생성물이다. 손으로 고치지 않는다** — \`tools/distribution/mechanics/bake.mjs\`가
 * 디컴프의 열거형(\`raw/decomp/generated/*.txt\`)에서 구운 것이다.
 *
 * 롬 번호 → 구현이 쓰는 id. 구현 코드가 \`pokemon.hasAbility('sturdy')\`처럼
 * **문자열로** 서로를 부르기 때문에 번호만으로는 이을 수가 없다. 이 표는
 * 이름표일 뿐이고 수치는 하나도 담지 않는다 — \`itemTable\`·\`spriteTable\`과
 * 같은 자리다 (DEPLOY.md §4).
 */

/** 종족 번호 → id. 0번 칸은 비어 있다 */
export const SPECIES_IDS: readonly (string | null)[] = ${arr(filled(speciesIds, MAX_SPECIES))}

/** 기술 번호 → id */
export const MOVE_IDS: readonly (string | null)[] = ${arr(filled(moveIds, MAX_MOVE))}

/** 특성 번호 → id */
export const ABILITY_IDS: readonly (string | null)[] = ${arr(filled(abilityIds, MAX_ABILITY))}

/** 도구 번호 → id. 대전에 안 나오는 도구는 null이다 */
export const ITEM_IDS: readonly (string | null)[] = ${arr(filled(itemIds, MAX_ITEM))}

/** 롬 타입 번호 → 구현이 글자로 비교하는 타입 이름 */
export const TYPE_NAMES: readonly string[] = ${JSON.stringify(typeNames, null, 2)}

/** 롬 성격 번호 → id */
export const NATURE_IDS: readonly string[] = ${JSON.stringify(natureIds, null, 2)}
`
put('names.gen.ts', namesSrc)
if (!CHECK) console.log(`  names.gen.ts           · ${(Buffer.byteLength(namesSrc) / 1024).toFixed(1)}kB`)
total += Buffer.byteLength(namesSrc)

if (!CHECK) console.log(`\n합계 ${(total / 1024).toFixed(1)}kB`)
