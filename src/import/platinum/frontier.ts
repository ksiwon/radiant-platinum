// 배틀프런티어 개체·트레이너 — 브라우저에서 (DATA.md §2.24 · PARITY §9.3)
//
//   /battle/b_pl_tower/pl_btdpm.narc   951 × 16B  빌리는 개체의 「형」
//   /battle/b_pl_tower/pl_btdtr.narc   315 × 가변  트레이너 분류와 세트 번호
//
// **둘 다 크기가 스스로를 증명한다.** 개체 쪽은 951칸이 전부 정확히 16바이트라
// `FrontierPokemonBase`(종족2 + 기술8 + 노력치플래그1 + 성격1 + 도구2 + 폼2)와
// 한 바이트도 안 남는다. 트레이너 쪽은 앞 4바이트가 분류·세트수고 뒤가 세트
// 번호 배열이라 `4 + 2×세트수`가 파일 크기와 315/315 맞는다.
//
// ⚠️ **배틀팩토리는 트레이너의 세트 번호를 안 쓴다.** 팩토리에서 상대가 데리고
// 나오는 것은 트레이너 소유가 아니라 **빌리는 것과 같은 표에서 그 자리에서
// 뽑은 것**이다 (`ov104_0223AB0C`). 세트 번호는 배틀타워가 읽는다.
//
// 이름과 대사는 여기 없다 — 뱅크 21·614에 있고 `text` 그룹이 낸다.
//
// ⚠️ **노드 쪽(`tools/extract/frontier.js`)과 바이트로 같아야 한다**
import { narcCount, narcEntry } from './nds'
import {
  BREATH, breathe, check, json, readRomFile, type ConvertContext, type Produced,
} from './convertTypes'

const MON_PATH = '/battle/b_pl_tower/pl_btdpm.narc'
const TRAINER_PATH = '/battle/b_pl_tower/pl_btdtr.narc'

/** `FrontierPokemonBase` — 종족2 + 기술 4×2 + 노력치1 + 성격1 + 도구2 + 폼2 */
const MON_SIZE = 16
const MON_COUNT = 951
const TRAINER_COUNT = 315

export interface FrontierMon {
  species: number
  moves: number[]
  evFlags: number
  nature: number
  item?: number
  form?: number
}

/**
 * 개체의 「형」 하나.
 *
 * ⚠️ **개체값도 노력치도 여기 없다.** 개체값은 뽑는 쪽의 층이 정하고(0·4·8…31을
 * 여섯 능력에 똑같이), 노력치는 `evFlags`가 켠 능력에 **510을 나눠** 넣는다
 * (`FrontierPokemon_Init`). 그래서 이 표만으로는 능력치가 안 나온다
 */
export function parseMon(b: Uint8Array): FrontierMon {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const moves: number[] = []
  for (let i = 0; i < 4; i++) {
    const m = view.getUint16(2 + i * 2, true)
    if (m) moves.push(m)
  }
  const mon: FrontierMon = {
    species: view.getUint16(0, true),
    moves,
    /** 노력치를 넣을 능력 비트 (HP·공격·방어·스피드·특공·특방 차례) */
    evFlags: b[10]!,
    nature: b[11]!,
  }
  const item = view.getUint16(12, true)
  if (item) mon.item = item
  const form = view.getUint16(14, true)
  if (form) mon.form = form
  return mon
}

/** `FrontierTrainerBase` — 분류2 + 세트수2 + 세트번호 2×n */
export function parseTrainer(b: Uint8Array): { type: number, sets: number[] } {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const type = view.getUint16(0, true)
  const count = view.getUint16(2, true)
  const sets: number[] = []
  for (let i = 0; i < count; i++) sets.push(view.getUint16(4 + i * 2, true))
  return { type, sets }
}

const requireCount = (narc: Uint8Array, path: string, want: number): void => {
  const got = narcCount(narc)
  if (got !== want) {
    throw new Error(`${path}이 ${String(got ?? 0)}칸이다 — ${String(want)}이어야 한다`)
  }
}

export async function convertFrontier(ctx: ConvertContext): Promise<Produced> {
  const monNarc = await readRomFile(ctx, MON_PATH)
  const trNarc = await readRomFile(ctx, TRAINER_PATH)
  requireCount(monNarc, MON_PATH, MON_COUNT)
  requireCount(trNarc, TRAINER_PATH, TRAINER_COUNT)
  const TOTAL = MON_COUNT + TRAINER_COUNT

  const sets: FrontierMon[] = []
  for (let i = 0; i < MON_COUNT; i++) {
    const f = narcEntry(monNarc, i)
    if (!f) throw new Error(`${MON_PATH} ${String(i)}번이 없다`)
    if (f.length !== MON_SIZE) {
      throw new Error(`개체 ${String(i)}가 ${String(f.length)}바이트다 — ${String(MON_SIZE)}이어야 한다`)
    }
    sets.push(parseMon(f))
    if (i % BREATH === 0) { ctx.onProgress?.(i, TOTAL); await breathe(ctx) }
  }

  const trainers: { type: number, sets: number[] }[] = []
  for (let i = 0; i < TRAINER_COUNT; i++) {
    const f = narcEntry(trNarc, i)
    if (!f) throw new Error(`${TRAINER_PATH} ${String(i)}번이 없다`)
    const t = parseTrainer(f)
    // 크기가 배치를 증명한다. 어긋나면 앞 4바이트를 잘못 읽은 것이다.
    // ⚠️ **세트 수가 홀수면 뒤에 2바이트가 남는다** — NARC이 항목을 4바이트에
    // 맞추기 때문이다. 315칸 중 93칸이 그렇고, 전부 홀수 쪽이다
    const want = 4 + t.sets.length * 2
    if (f.length !== want + (want % 4 === 0 ? 0 : 2)) {
      throw new Error(`트레이너 ${String(i)}: 세트 ${String(t.sets.length)}개인데 파일이 ${String(f.length)}바이트다`)
    }
    trainers.push(t)
    if (i % BREATH === 0) { ctx.onProgress?.(MON_COUNT + i, TOTAL); await breathe(ctx) }
  }

  check(ctx)
  ctx.onProgress?.(TOTAL, TOTAL)
  return new Map([['data/frontier.json', json({ count: sets.length, sets, trainers })]])
}
