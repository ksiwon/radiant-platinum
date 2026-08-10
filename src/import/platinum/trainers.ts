// 트레이너 그룹 — 브라우저에서 (DATA.md §2.9)
//
//   /poketool/trainer/trdata.narc   928 × 20B  분류·AI 플래그·가방·더블 여부
//   /poketool/trainer/trpoke.narc   928 × 가변  파티 1~6마리
//
// **포맷은 크기 합으로 확정했다.** trpoke 항목 크기는 trdata의 `type` 플래그와
// 파티 인원에서 정확히 계산되고, 928개 중 927개가 한 바이트도 안 틀린다(나머지
// 하나는 파티가 0인 0번 자리표시자다).
//
// ⚠️ **노드 쪽(`tools/extract/trainers.js`)과 한 줄씩 같아야 한다.**
import { narcEntry } from './nds'
import { openBanks, type DataLocale } from './text'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

const TRDATA_SIZE = 20
const COUNT = 928

/** trdata `type` 비트. 실측으로 정한 것이다 — 반대로 읽으면 크기가 안 맞는다 */
const HAS_MOVES = 1
const HAS_ITEM = 2

/**
 * 종족 필드는 폼을 같이 담는다. **하위 10비트가 종족, 나머지가 폼이다.**
 *
 * 11비트로 끊는 가설도 종족값 자체는 맞게 나오지만, 그러면 트레이너 203이 데리고
 * 있는 도롱충이 두 마리가 서로 다른 종이 된다. 10비트로 끊으면 같은 412번의
 * 폼 1·2가 되고, 그게 원작이다
 */
const SPECIES_MASK = 0x3ff
const FORM_SHIFT = 10

/**
 * 개체 하나의 바이트 수.
 *
 * 기본 6B(개체값·특성바이트·레벨·종족) + 도구 2B + 기술 8B + 꼬리 2B.
 * 꼬리는 볼 캡슐 씰이다 — 플래티넘에서 추가된 자리라 DP 문서를 그대로 쓰면 어긋난다
 */
export function monSize(type: number): number {
  return 6 + (type & HAS_MOVES ? 8 : 0) + (type & HAS_ITEM ? 2 : 0) + 2
}

export interface TrainerMon {
  ivs: number
  level: number
  species: number
  moves: number[]
  form?: number
  item?: number
  seal?: number
  unknown1?: number
}

export function parseParty(buf: Uint8Array, type: number, count: number): TrainerMon[] {
  const size = monSize(type)
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const party: TrainerMon[] = []
  for (let i = 0; i < count; i++) {
    const o = i * size
    const raw = view.getUint16(o + 4, true)
    const mon: TrainerMon = {
      /** 난이도 바이트 0~255. 실제 개체값은 `ivs × 31 / 255`다 */
      ivs: buf[o]!,
      level: view.getUint16(o + 2, true),
      species: raw & SPECIES_MASK,
      /** 지정된 기술. 비어 있으면 그 레벨의 레벨업 기술을 쓴다 */
      moves: [],
    }
    const form = raw >> FORM_SHIFT
    if (form) mon.form = form
    if (type & HAS_ITEM) {
      const item = view.getUint16(o + 6, true)
      if (item) mon.item = item
    }
    if (type & HAS_MOVES) {
      const base = o + 6 + (type & HAS_ITEM ? 2 : 0)
      mon.moves = [0, 1, 2, 3]
        .map((j) => view.getUint16(base + j * 2, true))
        .filter((m) => m !== 0)
    }
    const seal = view.getUint16(o + size - 2, true)
    if (seal) mon.seal = seal
    // 1878마리 중 딱 하나(전진의 에레키블)만 0이 아니다. 무슨 뜻인지 모르므로
    // 값을 보존만 한다 — 버리면 나중에 알아낼 방법이 없어진다
    if (buf[o + 1]) mon.unknown1 = buf[o + 1]
    party.push(mon)
  }
  return party
}

// ── 상금 배수 ────────────────────────────────────────────────────────────────
//
// 분류마다 상금 배수가 하나씩 있고, 상금은 `마지막 포켓몬 레벨 × 4 × 배수`다.
// 이 표는 NARC이 아니라 **배틀 오버레이 안에** 통째로 박혀 있다.
//
// ⚠️ 자리는 "105바이트가 오버레이 전체에서 딱 한 군데"로 확정했다 — 아래에서
// 매번 다시 세어 본다. 두 군데 이상이면 우리가 잡은 오프셋이 우연일 수 있다

const PRIZE_OVERLAY = 16
const PRIZE_OFFSET = 0x359e0
const CLASS_COUNT = 105

/** `haystack` 안에서 `needle`이 몇 번 나오는가 */
function occurrences(haystack: Uint8Array, needle: Uint8Array): number {
  if (needle.byteLength === 0) return 0
  let hits = 0
  const first = needle[0]!
  for (let i = 0; i + needle.byteLength <= haystack.byteLength; i++) {
    if (haystack[i] !== first) continue
    let k = 1
    while (k < needle.byteLength && haystack[i + k] === needle[k]) k++
    if (k === needle.byteLength) hits++
  }
  return hits
}

export function prizeTable(overlay: Uint8Array): number[] {
  const table = overlay.subarray(PRIZE_OFFSET, PRIZE_OFFSET + CLASS_COUNT)
  if (table.byteLength !== CLASS_COUNT) {
    throw new Error(`상금 배수표가 오버레이 밖으로 나간다 (${String(table.byteLength)}B)`)
  }
  const hits = occurrences(overlay, table)
  if (hits !== 1) {
    throw new Error(`상금 배수표와 같은 바이트열이 ${String(hits)}군데 있다 — 자리가 안 정해진다`)
  }
  // 주인공 두 칸은 상금이 없다. 여기가 0이 아니면 표의 시작이 밀린 것이다
  if (table[0] !== 0 || table[1] !== 0) {
    throw new Error(
      `상금 배수표 앞 두 칸이 0이 아니다 (${String(table[0])}, ${String(table[1])}) — 오프셋이 밀렸다`,
    )
  }
  return [...table]
}

/**
 * 트레이너 대사 색인 (`Trainer_LoadMessage`).
 *
 * `trtbl`의 멤버 0이 `{u16 트레이너, u16 종류}` 쌍 2497개고, `trtblofs`의 멤버 0이
 * 트레이너마다 그 표에서 시작하는 바이트 위치다. **쌍의 번호(offset/4)가 곧
 * 대사 뱅크의 항목 번호**다 — 그래서 표를 훑는 것만으로 글을 찾는다
 */
export function trainerMessages(
  offsets: Uint8Array, table: Uint8Array,
): Record<number, number>[] {
  const ov = new DataView(offsets.buffer, offsets.byteOffset, offsets.byteLength)
  const tv = new DataView(table.buffer, table.byteOffset, table.byteLength)
  const out: Record<number, number>[] = []
  let used = 0
  for (let id = 0; id < COUNT; id++) {
    const messages: Record<number, number> = {}
    for (let at = ov.getUint16(id * 2, true); at + 4 <= table.byteLength; at += 4) {
      if (tv.getUint16(at, true) !== id) break
      messages[tv.getUint16(at + 2, true)] = at / 4
      used++
    }
    out.push(messages)
  }
  if (used !== table.byteLength / 4) {
    throw new Error(
      `대사 쌍 ${String(used)} ≠ 표 ${String(table.byteLength / 4)} — 시작 위치 해석이 틀렸다`,
    )
  }
  return out
}

export interface Trainer {
  id: number
  class: number
  ai: number
  items: number[]
  double: boolean
  msg: Record<number, number>
  party: TrainerMon[]
}

export async function convertTrainers(ctx: ConvertContext): Promise<Produced> {
  const trdata = await ctx.fs.read('/poketool/trainer/trdata.narc')
  const trpoke = await ctx.fs.read('/poketool/trainer/trpoke.narc')
  if (!trdata || !trpoke) throw new Error('trdata/trpoke NARC을 못 읽었다')
  const offsets = narcEntry(await ctx.fs.read('/poketool/trmsg/trtblofs.narc') ?? new Uint8Array(), 0)
  const msgTable = narcEntry(await ctx.fs.read('/poketool/trmsg/trtbl.narc') ?? new Uint8Array(), 0)
  if (!offsets || !msgTable) throw new Error('트레이너 대사 표를 못 읽었다')
  const messages = trainerMessages(offsets, msgTable)

  const trainers: Trainer[] = []
  const sizeMismatch: string[] = []
  for (let id = 0; id < COUNT; id++) {
    const d = narcEntry(trdata, id)
    const poke = narcEntry(trpoke, id)
    if (!d || !poke) throw new Error(`트레이너 ${String(id)}가 NARC에 없다 — ${String(COUNT)}명이어야 한다`)
    if (d.byteLength !== TRDATA_SIZE) {
      throw new Error(`trdata #${String(id)} 크기 ${String(d.byteLength)}`)
    }
    const view = new DataView(d.buffer, d.byteOffset, d.byteLength)
    const type = d[0]!
    const count = d[3]!

    // ⚠️ **파싱보다 먼저 잰다.** 배치가 틀리면 파싱이 버퍼 밖을 읽고 터져서
    // "왜 틀렸는지"가 안 보이는 예외로 바뀐다. NARC은 4바이트 경계로 채우므로
    // 올림해서 견준다
    const want = (monSize(type) * count + 3) & ~3
    if (want > poke.byteLength) {
      throw new Error(
        `trpoke #${String(id)} 배치 불일치: 예상 ${String(want)} > 실제 ${String(poke.byteLength)}`
        + ' — 개체 크기 계산이 틀렸다',
      )
    }
    if (want !== poke.byteLength) {
      sizeMismatch.push(`#${String(id)} 예상 ${String(want)} 실제 ${String(poke.byteLength)}`)
    }

    trainers.push({
      id,
      /** 트레이너 분류. 상금 배수와 화면 표시("체육관 관장")가 이걸로 정해진다 */
      class: d[1]!,
      // d[2]는 디컴프가 `sprite`라 부르는 칸인데 928명 전부 0이다. 플래티넘은
      // 그림을 분류에서 고르므로 안 쓴다 — 담아 봐야 파일만 커진다
      /** 4세대 AI 비트. 실제로 쓰이는 값은 아홉 가지뿐이다 */
      ai: view.getUint32(0x0c, true),
      /** 트레이너가 배틀 중에 쓰는 가방 도구 4칸 */
      items: [0, 2, 4, 6].map((o) => view.getUint16(4 + o, true)).filter((v) => v !== 0),
      double: view.getUint32(0x10, true) !== 0,
      /** 대사 종류 → `TEXT_BANK_NPC_TRAINER_MESSAGES`의 항목 번호 */
      msg: messages[id]!,
      party: parseParty(poke, type, count),
    })
    if (id % 64 === 0) { check(ctx); ctx.onProgress?.(id, COUNT); await breathe(ctx) }
  }

  // 0번은 파티가 0인 자리표시자인데 NARC이 4바이트를 못 줄여서 8바이트가 잡힌다
  const real = sizeMismatch.filter((m) => !m.startsWith('#0 '))
  if (real.length > 0) {
    throw new Error(`trpoke 크기 불일치 ${String(real.length)}건: ${real.slice(0, 5).join(' / ')}`)
  }

  const overlay = await ctx.fs.overlay(PRIZE_OVERLAY)
  if (!overlay) throw new Error(`오버레이 ${String(PRIZE_OVERLAY)}을 못 읽었다`)
  const prizeMul = prizeTable(overlay)

  const banks = await openBanks(ctx)
  const loc = ctx.locale as DataLocale
  ctx.onProgress?.(COUNT, COUNT)

  return new Map([
    ['data/trainers.json', json({ count: trainers.length, trainers, prizeMul })],
    // ⚠️ 영어 트레이너 이름 뱅크는 미국 롬에서 비어 있다 (DATA.md §2.9). 그것도
    // 그대로 내보낸다 — 지어내면 화면에 없는 이름이 선다
    [`data/names/trainers.${loc}.json`, json(banks.require('npc_trainer_names'))],
    [`data/names/trainerClasses.${loc}.json`, json(banks.require('trainer_class_names'))],
  ])
}
