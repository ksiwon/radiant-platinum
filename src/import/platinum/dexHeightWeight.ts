// 도감의 키 · 몸무게 표와 키 비교 화면의 자리 · 배율 — 브라우저에서 (`pokedex_heightweight.c` · `zukan_data.narc`)
//
// ⚠️ **`tools/extract/dexHeightWeight.js`와 한 줄씩 같아야 한다.** 머리말(칸 뜻 · 단위 · 쓰는 법 · 기라티나)은 그쪽에 있다
import { narcCount, narcEntry } from './nds'
import { check, json, type ConvertContext, type Produced } from './convertTypes'

const BASE = '/application/zukanlist/zkn_data/zukan_data.narc'
const GIRA = '/application/zukanlist/zkn_data/zukan_data_gira.narc'
const MEMBERS = 58
const COUNT = 494
const GIRATINA = 487

interface Side {
  trainerScale: number[]
  pokemonScale: number[]
  trainerPos: number[]
  pokemonPos: number[]
}
interface Table {
  height: number[]
  weight: number[]
  male: Side
  female: Side
}

const ints = (b: Uint8Array): number[] => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return Array.from({ length: COUNT }, (_, i) => v.getInt32(i * 4, true))
}
const shorts = (b: Uint8Array): number[] => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return Array.from({ length: COUNT }, (_, i) => v.getInt16(i * 2, true))
}

/** 한 NARC의 열한 칸 */
function table(narc: Uint8Array): Table {
  if (narcCount(narc) !== MEMBERS) {
    throw new Error(`zukan_data가 ${String(narcCount(narc))}칸이다 — ${String(MEMBERS)}칸이라야 한다`)
  }
  const take = (at: number): Uint8Array => {
    const b = narcEntry(narc, at)
    if (!b) throw new Error(`zukan_data에 ${String(at)}번 칸이 없다`)
    return b
  }
  if (take(0).length !== COUNT * 4 || take(1).length !== COUNT * 4) throw new Error('키 · 몸무게 표가 494칸이 아니다')
  for (const m of [3, 4, 5, 6, 7, 8, 9, 10]) {
    if (take(m).length !== COUNT * 2) throw new Error(`${String(m)}번 칸이 494칸이 아니다`)
  }
  return {
    height: ints(take(0)), weight: ints(take(1)),
    male: { trainerScale: shorts(take(5)), pokemonScale: shorts(take(6)), trainerPos: shorts(take(9)), pokemonPos: shorts(take(10)) },
    female: { trainerScale: shorts(take(3)), pokemonScale: shorts(take(4)), trainerPos: shorts(take(7)), pokemonPos: shorts(take(8)) },
  }
}

/** 한 종을 낱개 값으로 — 노드 쪽 `at`과 같은 모양이다 */
function at(t: Table, i: number): unknown {
  const flat = (s: Side): Record<string, number> =>
    Object.fromEntries(Object.entries(s).map(([k, v]: [string, number[]]) => [k, v[i]!]))
  return { height: t.height[i], weight: t.weight[i], male: flat(t.male), female: flat(t.female) }
}

/** 두 표의 한 종 — 다른 종이 있으면 던진다 */
function altered(base: Table, gira: Table): unknown {
  for (let i = 0; i < COUNT; i++) {
    if (i !== GIRATINA && JSON.stringify(at(base, i)) !== JSON.stringify(at(gira, i))) {
      throw new Error(`기라티나 표가 ${String(i)}번도 다르다 — 한 칸만 싣는 가정이 깨졌다`)
    }
  }
  return at(gira, GIRATINA)
}

export async function convertDexHeightWeight(ctx: ConvertContext): Promise<Produced> {
  const read = async (path: string): Promise<Uint8Array> => {
    const b = await ctx.fs.read(path)
    if (!b) throw new Error(`${path}을 못 읽었다 (${ctx.locale} 판)`)
    return b
  }
  const base = table(await read(BASE))
  check(ctx)
  const gira = table(await read(GIRA))
  return new Map([
    ['data/dexHeightWeight.json', json({ count: COUNT, ...base, giratinaAltered: altered(base, gira) })],
  ])
}
