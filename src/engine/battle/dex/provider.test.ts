// 롬으로 채운 표가 4세대 덱스와 같은가 (COPYRIGHT.md §2.9 · DEPLOY.md §4)
//
// ⚠️ **이 시험이 오라클이다.** 배포 빌드에서는 `@pkmn/sim`의 데이터 폴더가
// 통째로 빠지고 그 자리를 우리 표가 채운다. 그러니 "우리 표 == 그 패키지의
// 4세대 표"를 매 실행 다시 재지 않으면, 표 하나가 조용히 틀린 채로 배틀이
// 돌게 된다 — 배틀은 오류를 안 내고 그냥 **다른 게임**이 된다.
//
// ⚠️ **시험에서는 껍데기가 안 걸린다.** vitest는 `node_modules`를 SSR 외부화라
// 플러그인이 안 불린다(실측: 시험 안에서 `Dex.forGen(4)`가 종족 1517개를 준다).
// 그래서 여기서 진짜 표를 그대로 볼 수 있고, 그게 이 대조를 가능하게 한다.
import { Dex } from '@pkmn/sim'
import { beforeAll, expect, it } from 'vitest'
import { installNodeAssets, withData } from '../../../data/romData.testkit'
import { resetGameDataCache } from '../../../data/gameData'
import { primeBattleDex, resetBattleDex } from './provider'
import { Abilities, Items, Moves, Natures, Pokedex, TypeChart } from './tables'

const gen4 = Dex.forGen(4)
const D = gen4.data

/** bridge.ts와 같은 경계 */
const MAX_SPECIES = 493
/**
 * 우리가 넣는 폼 수 (PARITY §3.4).
 *
 * 캐스퐁 3 · 테오키스 3 · 도롱마담 2 · 버섯모 2 · 체리버 1 · 조개무지 1 ·
 * 트리토돈 1 · 로토무 5 · 기라티나 1 · 쉐이미 1 · 아르세우스 16 = 36.
 * 안농 스물일곱 글자와 아르세우스 `???`는 sim에 항목이 없어서 안 센다
 */
const FORMES = 36
const MAX_MOVE = 467
const MAX_ABILITY = 123

/**
 * 우리 표에 없어도 되는 칸.
 *
 * 이후 세대 메타데이터·표시용 값·배틀이 안 보는 칸이다. 무엇을 왜 뺐는지는
 * `tools/distribution/mechanics/bake.mjs`의 `DROP`에 한 벌 더 적혀 있다
 */
const DROPPED = new Set([
  'contestType', 'zMove', 'maxMove', 'isNonstandard', 'realMove', 'rating',
  'gen', 'tags', 'canGigantamax', 'unreleasedHidden', 'maleOnlyHidden',
  'canHatch', 'mother', 'evoRegion', 'formeOrder', 'cosmeticFormes',
  'desc', 'shortDesc', 'exists', 'id', 'fullname', 'spritenum',
  'effectType', 'sourceEffect', 'itemUser',
  'color', 'eggGroups',
  'prevo', 'evos', 'evoLevel', 'evoType', 'evoItem', 'evoCondition', 'evoMove',
  'otherFormes', 'baseSpecies', 'forme', 'baseForme', 'changesFrom',
  'requiredItem', 'requiredItems', 'requiredAbility', 'requiredMove', 'battleOnly',
  'isCosmeticForme',
  // ⚠️ **성비는 안 넘긴다.** sim은 `gender`가 비어 있을 때만 이걸 보는데,
  // 우리는 PID로 정해진 성별을 글자로 박아 넘긴다 (`session.ts`의 `toSet`)
  'genderRatio',
])

/**
 * 일부러 다른 자리. **숨기지 않는다.**
 *
 * ⚠️ 참고 있기의 우선도는 **롬이 +3이고 Showdown이 +4**다. 4세대는 +3이 맞고
 * (5세대에 +4가 된다) Showdown의 gen4 모드가 그것을 안 되돌린다. 원작이
 * 정답이므로 롬 값을 쓴다 — 이 시험은 그 차이를 알고 통과한다
 *
 * ⚠️ **스카이 쉐이미의 몸무게는 4세대에서 랜드와 같다.** 원작은 크기 표를
 * **종족 번호로만** 읽어서(`Pokedex_HeightWeightData_Weight(data, species)`)
 * 폼을 안 본다 — 그래서 풀묶기가 스카이에게도 2.1kg으로 걸린다. Showdown이
 * 적어 둔 5.2kg은 5세대에 붙은 값이고, 그 gen4 모드가 되돌리지 않는다
 */
const KNOWN: Record<string, Record<string, unknown>> = {
  'Moves.endure': { priority: 3 },
  'Pokedex.shayminsky': { heightm: 0.2, weightkg: 2.1 },
}

/** 이름 자리에는 id를 넣는다 — sim이 `toID(name)`으로 색인하기 때문이다 */
const NAME_IS_ID = new Set(['name'])

/** `Marvel Scale` → `marvelscale`. sim이 색인에 쓰는 것과 같은 규칙 */
const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/**
 * 특성 칸.
 *
 * ⚠️ **`H`(숨은 특성)는 5세대 것이다.** Showdown의 4세대 표에도 그 칸이 남아
 * 있지만 4세대에는 숨은 특성이 없고, 우리 개체는 PID 최하위 비트로 0·1번
 * 칸만 고른다. 그래서 두 칸만 맞댄다
 */
function sameAbilities(mine: unknown, theirs: unknown): boolean {
  const pick = (v: unknown) => [0, 1]
    .map((i) => (v as Record<string, string> | undefined)?.[i])
    .filter(Boolean)
    .map((x) => toId(x as string))
  return JSON.stringify(pick(mine)) === JSON.stringify(pick(theirs))
}

/**
 * 값끼리 맞댄다. 함수는 **있고 없고만** 본다.
 *
 * ⚠️ **원문끼리는 못 맞댄다.** 생성 파일은 `.ts`라 esbuild가 한 번 다시 찍는다 —
 * 들여쓰기가 탭으로 바뀌고 `'x'`가 `"x"`가 되고 블록 뒤에 `;`가 붙는다.
 * 실측으로 확인했다. 그래서 여기서는 **콜백이 빠지지 않았는지**를 재고,
 * 원문이 패키지와 글자까지 같은지는 굽기가 낡지 않았는지로 잰다
 * (`tools/distribution/pkmnDiet.test.mjs`의 "굽기가 안 낡았다")
 */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === 'function' || typeof b === 'function') {
    return typeof a === 'function' && typeof b === 'function'
  }
  return JSON.stringify(a) === JSON.stringify(b)
}

/** 표 한 항목을 원본과 맞대 본다. 다른 칸을 사람이 읽을 수 있게 돌려준다 */
function diff(table: string, id: string, mine: unknown, theirs: Record<string, unknown>): string[] {
  const ours = mine as Record<string, unknown> | undefined
  if (!ours) return [`${table}.${id}: 우리 표에 없다`]
  const out: string[] = []
  const known = KNOWN[`${table}.${id}`] ?? {}
  for (const [k, v] of Object.entries(theirs)) {
    if (v === undefined || DROPPED.has(k)) continue
    if (NAME_IS_ID.has(k)) continue
    if (k === 'abilities') {
      if (!sameAbilities(ours[k], v)) {
        out.push(`${table}.${id}.abilities: ${JSON.stringify(ours[k])} ≠ ${JSON.stringify(v)}`)
      }
      continue
    }
    if (k in known) {
      if (!same(ours[k], known[k])) out.push(`${table}.${id}.${k}: ${String(ours[k])} ≠ 적어 둔 ${String(known[k])}`)
      continue
    }
    if (!same(ours[k], v)) out.push(`${table}.${id}.${k}: ${JSON.stringify(ours[k])} ≠ ${JSON.stringify(v)}`)
  }
  return out
}

withData('species.json', 'moves.json', 'items.json')('롬으로 채운 표가 4세대 덱스와 같다', () => {
  let restore: (() => void) | null = null

  beforeAll(async () => {
    restore = installNodeAssets()
    resetGameDataCache()
    resetBattleDex()
    await primeBattleDex()
    return () => { restore?.(); resetBattleDex(); resetGameDataCache() }
  })

  it('종족 493종이 칸마다 같다', () => {
    const bad: string[] = []
    for (const [id, e] of Object.entries(D.Pokedex)) {
      const s = e as unknown as Record<string, unknown> & { num: number, forme?: string }
      if (!(s.num > 0 && s.num <= MAX_SPECIES) || s.forme) continue
      bad.push(...diff('Pokedex', id, Pokedex[id], s))
    }
    expect(bad.slice(0, 20)).toEqual([])
    expect(Object.keys(Pokedex)).toHaveLength(MAX_SPECIES + FORMES)
  })

  /**
   * 폼도 같은 잣대로 잰다 (PARITY §3.4).
   *
   * ⚠️ **여기가 로토무 히트의 종족값이 롬에서 왔는지를 재는 자리다.** 폼 항목을
   * 지어내면 이 대조가 바로 어긋난다 — 원작 `pl_personal`의 503번 칸과
   * Showdown의 `rotomheat`이 우연히 같을 리 없다
   */
  it('폼 36개도 칸마다 같다', () => {
    const bad: string[] = []
    let seen = 0
    for (const [id, e] of Object.entries(D.Pokedex)) {
      const s = e as unknown as Record<string, unknown> & {
        num?: number, forme?: string, baseSpecies?: string, isCosmeticForme?: boolean
      }
      if (!s.forme) continue
      // ⚠️ **꾸밈 폼은 항목이 반쪽이다.** 조개무지 동쪽·도롱마담 옷감 넷은
      // `{ name, baseSpecies, forme, color }`뿐이고 종족값도 번호도 없다 —
      // 기본형과 똑같다는 뜻이라, 여기서도 기본형에 얹어서 맞대야 한다
      const base = s.isCosmeticForme && s.baseSpecies
        ? (D.Pokedex[toId(s.baseSpecies)] as unknown as Record<string, unknown> | undefined)
        : undefined
      const full = { ...base, ...s }
      const num = full.num as number | undefined
      if (!(num !== undefined && num > 0 && num <= MAX_SPECIES)) continue
      if (!(id in Pokedex)) continue // 안 넣는 것이 맞는 폼은 아래에서 따로 센다
      seen++
      bad.push(...diff('Pokedex', id, Pokedex[id], full))
    }
    expect(bad.slice(0, 20)).toEqual([])
    expect(seen).toBe(FORMES)
  })

  /**
   * ⚠️ **아르세우스 페어리는 넣으면 안 된다.** Showdown의 4세대 표에 남아
   * 있지만 페어리 타입은 6세대 것이고, 그 폼의 플레이트도 4세대에 없다
   */
  it('4세대에 없는 폼은 안 들어간다', () => {
    expect('arceusfairy' in Pokedex).toBe(false)
    // 안농 글자는 Showdown이 종족으로 안 나눈다 (`cosmeticFormes`)
    expect('unownb' in Pokedex).toBe(false)
  })

  it('기술 467개가 칸마다 같다', () => {
    const bad: string[] = []
    for (const [id, e] of Object.entries(D.Moves)) {
      const m = e as unknown as Record<string, unknown> & { num: number, realMove?: string }
      // ⚠️ 파워 16종(`hiddenpowerfire` …)은 sim이 팀 짜기용으로 만든 파생
      // 항목이고 번호가 본체와 같다. 롬에는 파워가 하나뿐이라 본체만 잇는다
      if (!(m.num > 0 && m.num <= MAX_MOVE) || m.realMove) continue
      bad.push(...diff('Moves', id, Moves[id], m))
    }
    expect(bad.slice(0, 20)).toEqual([])
    expect(Object.keys(Moves)).toHaveLength(MAX_MOVE)
  })

  it('특성 123개가 칸마다 같다', () => {
    const bad: string[] = []
    for (const [id, e] of Object.entries(D.Abilities)) {
      const a = e as unknown as Record<string, unknown> & { num: number }
      if (!(a.num > 0 && a.num <= MAX_ABILITY)) continue
      bad.push(...diff('Abilities', id, Abilities[id], a))
    }
    expect(bad.slice(0, 20)).toEqual([])
    expect(Object.keys(Abilities)).toHaveLength(MAX_ABILITY)
  })

  it('도구가 칸마다 같다 — 롬에 있는 것만', () => {
    const bad: string[] = []
    for (const [id, e] of Object.entries(D.Items)) {
      // 롬의 도구 표에 없는 id는 우리 표에도 없다. 4세대 이후 도구가 그렇다
      if (!(id in Items)) continue
      bad.push(...diff('Items', id, Items[id], e as unknown as Record<string, unknown>))
    }
    expect(bad.slice(0, 20)).toEqual([])
    // 배틀에 나오는 4세대 도구가 절반 넘게 잡혀야 한다 — 규칙이 빗나가면 0이 된다
    expect(Object.keys(Items).length).toBeGreaterThan(150)
  })

  it('상성표 18×18과 상태이상 면역이 같다', () => {
    const bad: string[] = []
    for (const [id, t] of Object.entries(D.TypeChart)) {
      const ours = TypeChart[id] as { damageTaken?: Record<string, number> } | undefined
      const theirs = (t as { damageTaken?: Record<string, number> }).damageTaken ?? {}
      if (!ours) continue // 페어리·스텔라는 4세대에 없다
      for (const [k, v] of Object.entries(theirs)) {
        // 4세대에 없는 타입 칸은 우리 표에 없는 것이 맞다
        if (k === 'Fairy' || k === 'Stellar') continue
        if (ours.damageTaken?.[k] !== v) bad.push(`${id} ← ${k}: ${String(ours.damageTaken?.[k])} ≠ ${String(v)}`)
      }
    }
    expect(bad.slice(0, 20)).toEqual([])
    // 4세대 타입은 17종이다 — 페어리는 6세대, `???`는 상성표에 칸이 없다
    expect(Object.keys(TypeChart)).toHaveLength(17)
  })

  it('성격 25종의 보정이 같다', () => {
    const bad: string[] = []
    for (const [id, n] of Object.entries(D.Natures)) {
      const ours = Natures[id] as { plus?: string, minus?: string } | undefined
      const theirs = n as { plus?: string, minus?: string }
      if (ours?.plus !== theirs.plus || ours?.minus !== theirs.minus) {
        bad.push(`${id}: ${String(ours?.plus)}/${String(ours?.minus)} ≠ ${String(theirs.plus)}/${String(theirs.minus)}`)
      }
    }
    expect(bad).toEqual([])
    expect(Object.keys(Natures)).toHaveLength(25)
  })
})
