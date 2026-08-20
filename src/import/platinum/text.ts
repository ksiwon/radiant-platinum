// 글 그룹 — 브라우저에서 (DATA.md §2.11 · IMPORT.md §6)
//
// 노드 쪽에서는 이 일이 다섯 파일에 흩어져 있다 (`message.js`가 디코더,
// `rom.js`의 `openText`가 뱅크 접근자, `dialogue.js`·`moves.js`·`items.js`·
// `trainers.js`·`headers.js`가 각자 이름표를 쓴다). 여기서는 **한 그룹이 글에서
// 나오는 것을 전부 만든다** — 디코더를 한 번만 돌리고 그 결과를 나눠 쓰는 편이
// 뱅크를 일곱 번 다시 푸는 것보다 빠르고, 무엇보다 어느 뱅크가 어느 파일이 되는지
// 한 자리에서 보인다.
//
// ⚠️ **뱅크 번호는 us 기준으로 적는다.** 맵 헤더의 `msg`가 us 번호이기 때문이다.
// 사용자의 롬이 ko면 ko 자리에서 읽어 us 이름으로 적는다 — 그 대응은
// `textBanks.ts`가 이름 순서로 계산하고 사용자의 롬으로 검산한다.
import { charmap } from './charmap'
import { codesToString, decodeBank } from './message'
import { narcEntry, narcCount } from './nds'
import {
  BANK_ORDER, bankLayout, readBankLayout, MSG_NARC,
  type Locale,
} from './textBanks'
import type { ConvertContext, Produced } from './convertTypes'
import { breathe, check, encoder, json } from './convertTypes'

/** 런타임이 파일 이름에 쓰는 로케일. 뱅크 배치 쪽은 us라고 부른다 */
export type DataLocale = 'en' | 'ko' | 'ja'

export const bankLocale = (locale: string): Locale => (locale === 'en' ? 'us' : locale as Locale)

/**
 * 뱅크 하나를 문자열 배열로. 푼 것은 들고 있는다.
 *
 * 한 뱅크를 두 파일이 쓰는 경우가 있고(`bag`은 상점 화면도 읽는다) 724개를 두 번
 * 푸는 것은 몇 초짜리 낭비다
 */
class BankReader {
  private readonly cache = new Map<string, string[]>()
  private readonly map = charmap()

  private readonly narc: Uint8Array
  private readonly layout: ReadonlyMap<string, number>

  // ⚠️ 매개변수 프로퍼티(`constructor(private x)`)를 안 쓴다 — node의
  // `--experimental-strip-types`가 그것만은 못 벗겨서, 스파이크 드라이버가
  // 이 파일을 거치는 순간 통째로 못 돈다 (`tools/spike/tsResolve.mjs`)
  constructor(narc: Uint8Array, layout: ReadonlyMap<string, number>) {
    this.narc = narc
    this.layout = layout
  }

  /** 그 롬에 없는 뱅크면 null */
  read(name: string): string[] | null {
    const hit = this.cache.get(name)
    if (hit) return hit
    const at = this.layout.get(name)
    if (at === undefined) return null
    const bank = narcEntry(this.narc, at)
    if (!bank) throw new Error(`뱅크 #${String(at)}(${name})을 못 꺼냈다`)
    const strings = decodeBank(bank).map((codes) => codesToString(codes, this.map))
    this.cache.set(name, strings)
    return strings
  }

  /** 없으면 던진다. 코드가 이름으로 부르는 뱅크는 있어야 한다 */
  require(name: string): string[] {
    const got = this.read(name)
    if (!got) throw new Error(`뱅크 ${name}이 이 롬에 없다`)
    return got
  }
}

export async function openBanks(ctx: ConvertContext): Promise<BankReader> {
  const bytes = await ctx.fs.read(MSG_NARC)
  if (!bytes) throw new Error(`${MSG_NARC}을 못 읽었다`)
  const layout = await readBankLayout(
    (p) => ctx.fs.read(p),
    bankLocale(ctx.locale),
    { count: narcCount, entry: narcEntry },
  )
  return new BankReader(bytes, layout)
}

/**
 * 이름표 파일들 — 뱅크 이름 → 산출물 이름.
 *
 * 길이를 다듬지 않고 뱅크를 그대로 적는 것들이다. 종족·기술 이름은 표 길이에
 * 맞춰야 해서 여기 없다 (`species`·`moves` 그룹이 만든다)
 */
const NAME_FILES: readonly (readonly [bank: string, file: string])[] = [
  ['item_names', 'items'],
  ['item_descriptions', 'itemDescriptions'],
  ['npc_trainer_names', 'trainers'],
  ['trainer_class_names', 'trainerClasses'],
  ['location_names', 'locations'],
]

/** `names/labels.*.json` 한 벌 — 타입·특성 이름과 특성 설명 */
function labels(banks: BankReader): unknown {
  return {
    types: banks.require('pokemon_type_names'),
    abilities: banks.require('ability_names'),
    // 특성 설명. 교체 화면이 고른 포켓몬의 특성을 한 줄로 풀어 준다 —
    // 이름만 있으면 "모래날림"이 뭘 하는지 화면에서 알 길이 없다
    abilityText: banks.require('ability_descriptions'),
  }
}

/**
 * 대사와 이름표를 만든다.
 *
 * ⚠️ **뱅크를 골라 싣지 않는다.** 노드 쪽은 맵 헤더가 가리키는 것과 디컴프
 * `script_manager.c`가 가리키는 것만 골라 450개를 실었다. 브라우저에는 디컴프가
 * 없고, 무엇보다 **고르는 순간 빠뜨린 뱅크는 게임 안에서만 보인다** — 실제로
 * 그렇게 스무 개를 손으로 덧붙이고 있었다(`EXTRA_BANKS`). 사용자의 디스크에
 * 몇 MB 더 쓰는 편이 훨씬 싸다
 */
export async function convertText(ctx: ConvertContext): Promise<Produced> {
  const banks = await openBanks(ctx)
  const loc = ctx.locale as DataLocale
  const us = bankLayout('us')
  const out: Produced = new Map()
  const index: { index: number, name: string, entries: number }[] = []

  let done = 0
  const total = BANK_ORDER.length + NAME_FILES.length + 1
  for (const name of BANK_ORDER) {
    const strings = banks.read(name)
    done++
    if (done % 16 === 0) {
      ctx.onProgress?.(done, total)
      await breathe(ctx)
    }
    if (!strings) continue
    const at = us.get(name)!
    out.set(`data/dialogue/${loc}/${String(at)}.json`, json(strings))
    index.push({ index: at, name: `TEXT_BANK_${name.toUpperCase()}`, entries: strings.length })
  }
  check(ctx)

  for (const [bank, file] of NAME_FILES) {
    out.set(`data/names/${file}.${loc}.json`, json(banks.require(bank)))
    ctx.onProgress?.(++done, total)
  }
  out.set(`data/names/labels.${loc}.json`, json(labels(banks)))
  out.set('data/dialogue/index.json', json({ banks: index, locales: [loc] }))
  ctx.onProgress?.(total, total)
  return out
}

export const TEXT_OUTPUTS = [
  'data/dialogue/index.json',
  'data/dialogue/{로케일}/{us 뱅크 번호}.json',
  'data/names/items.*.json',
  'data/names/itemDescriptions.*.json',
  'data/names/trainers.*.json',
  'data/names/trainerClasses.*.json',
  'data/names/locations.*.json',
  'data/names/labels.*.json',
]

/** 산출물을 만들지 않고 이름표만 — `species`·`moves`가 이름을 붙일 때 쓴다 */
export const nameList = (bank: string[], count: number): string[] =>
  Array.from({ length: count }, (_, i) => bank[i] ?? '')

export { encoder }
