// 종족 그룹 — 브라우저에서 (DATA.md §2.4)
//
//   /poketool/personal/pl_personal.narc  508 × 44B  종족값·타입·특성·성비·알
//   /poketool/personal/evo.narc          508 × 44B  진화 7슬롯 × 6B + 2B 패딩
//   /poketool/personal/wotbl.narc        508 × 가변 레벨업 기술, u16 패킹
//
// ⚠️ 롬의 스탯 순서는 HP/공/방/**스피드**/특공/특방이다. 표시 순서와 다르므로
// 여기서 이름 붙인 객체로 바꿔 내보낸다 — 그러면 이후로 순서 착각이 불가능해진다.
import { narcEntry, type NdsFileSystem } from './nds'
import { openBanks, nameList, type DataLocale } from './text'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'
import { EGG_MOVES } from './eggMoveTable'

const PERSONAL_SIZE = 44
const EVO_SLOTS = 7
const EVO_ENTRY = 6
/** wotbl 종료 표식 */
const WOTBL_END = 0xffff
/** 레벨업 기술 u16 패킹: 하위 9비트 기술, 다음 7비트 레벨 */
const MOVE_MASK = 0x1ff

export const STAT_ORDER = ['hp', 'atk', 'def', 'spe', 'spa', 'spd'] as const
type StatName = (typeof STAT_ORDER)[number]

interface Personal {
  stats: Record<StatName, number>
  types: [number, number]
  catchRate: number
  baseExp: number
  ev: Record<StatName, number>
  heldItems: [number, number]
  genderRatio: number
  eggCycles: number
  baseFriendship: number
  growthRate: number
  eggGroups: [number, number]
  abilities: [number, number]
  safariFlee: number
  color: number
  /** 기술머신·비전머신 학습 가능 비트필드 128비트 */
  tm: string
}

const hex = (b: Uint8Array, from: number, to: number): string => {
  let out = ''
  for (let i = from; i < to; i++) out += b[i]!.toString(16).padStart(2, '0')
  return out
}

export function parsePersonal(b: Uint8Array): Personal {
  if (b.byteLength !== PERSONAL_SIZE) {
    throw new Error(`personal 크기 ${String(b.byteLength)} ≠ ${String(PERSONAL_SIZE)}`)
  }
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const stats = {} as Record<StatName, number>
  STAT_ORDER.forEach((k, i) => { stats[k] = b[i]! })
  const evBits = view.getUint16(10, true)
  const ev = {} as Record<StatName, number>
  STAT_ORDER.forEach((k, i) => { ev[k] = (evBits >> (i * 2)) & 3 })
  return {
    stats,
    types: [b[6]!, b[7]!],
    catchRate: b[8]!,
    baseExp: b[9]!,
    ev,
    heldItems: [view.getUint16(12, true), view.getUint16(14, true)],
    // 255 = 무성, 0 = 항상 수컷, 254 = 항상 암컷, 그 외 = 암컷 확률 × 255/8
    genderRatio: b[16]!,
    eggCycles: b[17]!,
    baseFriendship: b[18]!,
    growthRate: b[19]!,
    eggGroups: [b[20]!, b[21]!],
    abilities: [b[22]!, b[23]!],
    safariFlee: b[24]!,
    color: b[25]! & 0x3f,
    tm: hex(b, 28, 44),
  }
}

export interface Evolution { method: number, param: number, to: number }

export function parseEvo(b: Uint8Array): Evolution[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const out: Evolution[] = []
  for (let i = 0; i < EVO_SLOTS; i++) {
    const method = view.getUint16(i * EVO_ENTRY, true)
    if (method === 0) continue
    out.push({
      method,
      param: view.getUint16(i * EVO_ENTRY + 2, true),
      to: view.getUint16(i * EVO_ENTRY + 4, true),
    })
  }
  // 44B - 42B = 꼬리 2B는 508개 전부 0이다. 아니라면 8슬롯 가설을 다시 봐야 한다
  if (view.getUint16(EVO_SLOTS * EVO_ENTRY, true) !== 0) throw new Error('evo 꼬리가 0이 아니다')
  return out
}

export interface LearnMove { level: number, move: number }

export function parseLearnset(b: Uint8Array): LearnMove[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const out: LearnMove[] = []
  for (let p = 0; p + 2 <= b.byteLength; p += 2) {
    const v = view.getUint16(p, true)
    if (v === WOTBL_END) break
    out.push({ level: (v >> 9) & 0x7f, move: v & MOVE_MASK })
  }
  return out
}

const readAll = async (fs: NdsFileSystem, path: string): Promise<Uint8Array[]> => {
  const narc = await fs.read(path)
  if (!narc) throw new Error(`${path}을 못 읽었다`)
  const out: Uint8Array[] = []
  for (let i = 0; ; i++) {
    const e = narcEntry(narc, i)
    if (!e) break
    out.push(e)
  }
  return out
}

/**
 * 신오도감 순서 (`Pokemon_SinnohDexNumber`).
 *
 * 표가 **양방향으로 두 벌** 있다. `pl_pokezukan`이 종족 → 신오 번호(494칸),
 * `shinzukan`이 신오 번호 → 종족(211칸)이다. 둘이 서로의 역이어야 하고,
 * 그것이 표를 제대로 읽었다는 증거다 — 한 칸만 밀려도 역이 깨진다.
 *
 * 211칸인 것은 0번을 비워 두기 때문이다. 신오도감은 210마리다.
 */
async function dexOrder(fs: NdsFileSystem): Promise<{ sinnohOf: number[], sinnohDex: number[] }> {
  const u16 = (b: Uint8Array): number[] => {
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return Array.from({ length: Math.floor(b.byteLength / 2) }, (_, i) => view.getUint16(i * 2, true))
  }
  const forward = (await readAll(fs, '/poketool/pl_pokezukan.narc'))[0]
  const backward = (await readAll(fs, '/poketool/shinzukan.narc'))[0]
  if (!forward || !backward) throw new Error('신오도감 표가 비어 있다')
  const sinnohOf = u16(forward)
  const speciesOf = u16(backward)

  let checked = 0
  for (let n = 1; n < speciesOf.length; n++) {
    const species = speciesOf[n]!
    if (sinnohOf[species] !== n) {
      throw new Error(
        `신오도감 ${String(n)}번이 종족 ${String(species)}인데 역표는 ${String(sinnohOf[species])}라고 한다`,
      )
    }
    checked++
  }
  const listed = sinnohOf.filter((n) => n !== 0).length
  if (listed !== checked) {
    throw new Error(`신오도감에 오른 종족 ${String(listed)}종 ≠ 역표 ${String(checked)}칸`)
  }
  return { sinnohOf, sinnohDex: speciesOf }
}

/**
 * 종족 → 그 계통의 **맨 앞**(알에서 나오는 종).
 *
 *   /poketool/personal/pms.narc  508 × u16 평평한 표
 *
 * ⚠️ NARC 껍데기를 벗기지 않는다. 원작이 이 파일을 아카이브로 안 열고
 * `species * 2` 바이트로 **직접 시크**한다
 * (`Pokemon_GetBaseSpeciesFromPersonalData`) — 헤더까지 포함한 파일 전체가 표다
 */
async function readBabyTable(fs: NdsFileSystem): Promise<number[]> {
  const raw = await fs.read('/poketool/personal/pms.narc')
  if (!raw) throw new Error('pms.narc을 못 읽었다')
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength)
  const table = Array.from({ length: raw.byteLength >> 1 }, (_, i) => view.getUint16(i * 2, true))
  // 피카츄(25) → 피츄(172). 진화 전이 아니라 **알 단계**로 가는 표다
  if (table[25] !== 172) {
    throw new Error(`피카츄의 알 단계가 ${String(table[25])}다 (172이어야 한다)`)
  }
  return table
}

/**
 * 키·몸무게 (`application/zukanlist/zkn_data/zukan_data.narc` 멤버 0·1).
 *
 * ⚠️ **글 뱅크가 아니다.** 화면에 찍는 `1.0 m` 같은 문자열은 따로 있고, 배틀이
 * 쓰는 것은 여기 있는 `int[494]`다 — 데시미터와 헥토그램이다. 저울질과
 * 풀묶기의 위력이 이 숫자에서 나오므로 근사하면 위력이 틀린다.
 *
 * ⚠️ **기라티나 한 마리만 표가 둘이다.** 기본 표는 오리진(6.9m·650kg)을 들고
 * 있고 어나더(4.5m·750kg)는 `zukan_data_gira.narc`에 따로 있다 — 원작이 폼에
 * 따라 NARC을 갈아 끼운다(`Pokedex_SetupGiratina`). 폼 번호 없는 #487은
 * 어나더이므로 그 자리만 저쪽 표에서 읽는다. **둘 다 롬에 있으므로 근사할
 * 일이 없다** (실측: 나머지 492종은 두 표가 같은 값이다)
 */
const GIRATINA = 487

async function readSizes(fs: NdsFileSystem, count: number): Promise<{ heightDm: number[], weightHg: number[] }> {
  const ints = (b: Uint8Array): number[] => {
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return Array.from({ length: Math.floor(b.byteLength / 4) }, (_, i) => view.getInt32(i * 4, true))
  }
  const read = async (path: string): Promise<[number[], number[]]> => {
    const [heights, weights] = await readAll(fs, path)
    if (!heights || !weights) throw new Error(`${path}에 멤버가 둘 미만이다`)
    return [ints(heights), ints(weights)]
  }
  const [heightDm, weightHg] = await read('/application/zukanlist/zkn_data/zukan_data.narc')
  if (heightDm.length !== weightHg.length) {
    throw new Error(`키 ${String(heightDm.length)}칸 ≠ 몸무게 ${String(weightHg.length)}칸`)
  }
  if (heightDm.length < count) {
    throw new Error(`크기 표가 ${String(heightDm.length)}칸인데 종족은 ${String(count)}번까지 있다`)
  }
  const [giraH, giraW] = await read('/application/zukanlist/zkn_data/zukan_data_gira.narc')
  const h = giraH[GIRATINA]
  const w = giraW[GIRATINA]
  if (h === undefined || w === undefined) throw new Error('기라티나 표에 487번 칸이 없다')
  // 폼 자리를 먼저 채운다 — 기라티나 오리진(501번)이 쓰는 것이 **덮기 전의**
  // 기본 표 값이다
  fillFormSizes(heightDm, weightHg)
  heightDm[GIRATINA] = h
  weightHg[GIRATINA] = w
  return { heightDm, weightHg }
}

/**
 * 폼 자리(496번 뒤)의 키·몸무게 (`Pokedex_HeightWeightData_Weight`).
 *
 * ⚠️ **크기 표는 494칸뿐이라 폼 자리가 비어 있다.** 그대로 두면 저울질과
 * 풀묶기가 도롱마담 쓰레기에게 0kg으로 걸려 위력이 20이 된다. 원작은 그 표를
 * **종족 번호로** 읽으므로(폼 번호를 안 넘긴다) 폼은 기본형과 같은 크기다.
 *
 * ⚠️ **기라티나만 예외다.** 기본 표의 487번이 오리진(6.9m·650kg)이고 어나더는
 * `zukan_data_gira.narc`에 따로 있다 — 원작이 폼에 따라 NARC을 갈아 끼운다
 * (`Pokedex_SetupGiratina`). 그래서 오리진(501번)은 덮기 전의 값을 가져간다
 */
function fillFormSizes(heightDm: number[], weightHg: number[]): void {
  for (const [form, base] of FORM_BASE) {
    heightDm[form] = heightDm[base] ?? 0
    weightHg[form] = weightHg[base] ?? 0
  }
}

/** 폼 종족 자료 번호 → 기본 종족 번호 (`Pokemon_GetFormNarcIndex`의 역) */
const FORM_BASE: readonly (readonly [number, number])[] = [
  [496, 386], [497, 386], [498, 386], // 테오키스 어택·디펜스·스피드
  [499, 413], [500, 413],             // 도롱마담 모래·쓰레기
  [501, GIRATINA],                    // 기라티나 오리진
  [502, 492],                         // 쉐이미 스카이
  [503, 479], [504, 479], [505, 479], [506, 479], [507, 479], // 로토무 다섯
]

export async function convertSpecies(ctx: ConvertContext): Promise<Produced> {
  const personal = await readAll(ctx.fs, '/poketool/personal/pl_personal.narc')
  const evo = await readAll(ctx.fs, '/poketool/personal/evo.narc')
  const wotbl = await readAll(ctx.fs, '/poketool/personal/wotbl.narc')
  if (personal.length !== evo.length || personal.length !== wotbl.length) {
    throw new Error('personal/evo/wotbl 개수 불일치 — 인덱스 축이 다르다')
  }
  check(ctx)

  // 표는 전국도감 494칸이라 폼 자리(494번 뒤)는 안 담고 있다. 거기까지 요구하면
  // 멀쩡한 롬에서 추출이 선다 — 있는 칸만 붙이고 없으면 0으로 남긴다
  const size = await readSizes(ctx.fs, Math.min(personal.length, 494))
  check(ctx)

  const species: unknown[] = []
  let maxId = 0
  for (let id = 0; id < personal.length; id++) {
    const p = parsePersonal(personal[id]!)
    // #0은 자리표시자다. 종족값이 전부 0이면 실체가 없는 슬롯으로 본다
    if (STAT_ORDER.every((k) => p.stats[k] === 0)) continue
    species.push({
      id,
      ...p,
      heightDm: size.heightDm[id] ?? 0,
      weightHg: size.weightHg[id] ?? 0,
      evolutions: parseEvo(evo[id]!),
      learnset: parseLearnset(wotbl[id]!),
      // 알 기술은 롬의 종족 자료에 **없다** — 원작도 오버레이 5의 배열
      // (`sEggMoves`)로 들고 있다. 기술머신표와 같은 자리라 디컴프에서 굽는다
      eggMoves: EGG_MOVES[id] ?? [],
    })
    maxId = id
    if (id % 64 === 0) { ctx.onProgress?.(id, personal.length + 64); await breathe(ctx) }
  }
  ctx.onProgress?.(personal.length, personal.length + 64)

  const dex = await dexOrder(ctx.fs)
  const babyOf = await readBabyTable(ctx.fs)
  check(ctx)

  // 이름 배열은 **종족 번호로 색인**한다. species 배열 순서로 색인하면 id와 어긋나서
  // 조용히 옆 포켓몬 이름이 나온다 — 그런 버그는 눈으로 안 잡힌다
  const banks = await openBanks(ctx)
  const loc = ctx.locale as DataLocale
  ctx.onProgress?.(personal.length + 64, personal.length + 64)

  return new Map([
    ['data/species.json', json({ count: species.length, species, babyOf, ...dex })],
    [`data/names/species.${loc}.json`, json(nameList(banks.require('species_name'), maxId + 1))],
  ])
}
