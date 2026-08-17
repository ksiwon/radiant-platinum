// NPC 교환 넷 — 브라우저에서 (DATA.md §2.24 · IMPORT.md §6)
//
// `fielddata/pokemon_trade/fld_trade.narc` 넷이 전부고 하나가 u32 스무 칸이다
// (`NPCTradeMon`). 표에 레벨이 없는 것이 요점이다 — 받는 마리의 레벨은 내가
// 건네는 마리의 것이라 여기서 정해지지 않는다 (`engine/pokemon/npcTrade.ts`).
//
// 화면에 뜨는 별명 넷과 트레이너 이름 넷은 여기 없다. 뱅크 370
// (`TEXT_BANK_NPC_TRADE_NAMES`)에 0~3·4~7로 들어 있고 `text` 그룹이 뱅크를
// 통째로 내보내므로 따로 뽑을 것이 없다.
//
// ⚠️ **노드 쪽(`tools/extract/npcTrades.js`)과 한 칸씩 같아야 한다.** 저쪽은
// 디컴프 `res/npc_trades/*.json`과 대조까지 하고, 이쪽은 디컴프가 없어서 못
// 한다 — 그래서 칸 차례를 여기 다시 적는 대신 같은 상수 이름을 쓴다
import { narcCount, narcEntry } from './nds'
import {
  breathe, check, json, readRomFile, type ConvertContext, type Produced,
} from './convertTypes'

const NARC = '/fielddata/pokemon_trade/fld_trade.narc'

/** `MAX_NPC_TRADES` */
const COUNT = 4
/** `NPCTradeMon` — u32 스무 개 */
const WORDS = 20

/**
 * 칸 차례 (`include/overlay006/npc_trade.h`).
 *
 * ⚠️ **개체값 차례에 스피드가 넷째다.** 능력 화면 차례가 아니라 저장 차례
 * (HP·공격·방어·**스피드**·특공·특방)다
 */
const AT = {
  species: 0,
  hpIV: 1, atkIV: 2, defIV: 3, speedIV: 4, spAtkIV: 5, spDefIV: 6,
  unused1: 7,
  otID: 8,
  cool: 9, beauty: 10, cute: 11, smart: 12, tough: 13,
  personality: 14,
  heldItem: 15,
  otGender: 16,
  unused2: 17,
  language: 18,
  requestedSpecies: 19,
} as const

export async function convertNpcTrades(ctx: ConvertContext): Promise<Produced> {
  // ⚠️ **`fs.read`를 직접 안 부른다** — 한국판은 이 파일이 `/resource/kor/` 밑에
  // 있다 (`localePaths`). 그것 때문에 한국판 설치에서 이 그룹이 죽었다
  const narc = await readRomFile(ctx, NARC)
  const count = narcCount(narc)
  if (count !== COUNT) {
    throw new Error(`${NARC}이 ${String(COUNT)}개가 아니라 ${String(count ?? 0)}개다`)
  }

  const trades = []
  for (let at = 0; at < COUNT; at++) {
    const buf = narcEntry(narc, at)
    if (!buf) throw new Error(`${NARC} ${String(at)}번이 없다`)
    if (buf.length !== WORDS * 4) {
      throw new Error(`${NARC} ${String(at)}번이 ${String(WORDS * 4)}바이트가 아니라 ${String(buf.length)}바이트다`)
    }
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const w = (i: number): number => view.getUint32(i * 4, true)
    const otID = w(AT.otID)
    trades.push({
      species: w(AT.species),
      ivs: {
        hp: w(AT.hpIV), atk: w(AT.atkIV), def: w(AT.defIV),
        spa: w(AT.spAtkIV), spd: w(AT.spDefIV), spe: w(AT.speedIV),
      },
      // 아래 16비트가 보이는 번호, 위가 비밀 번호. 넷 다 위가 0이지만
      // 나눠 두지 않으면 색깔 판정이 32비트를 못 본다
      otId: otID & 0xffff,
      otSecretId: otID >>> 16,
      personality: w(AT.personality),
      heldItem: w(AT.heldItem),
      otGender: w(AT.otGender),
      language: w(AT.language),
      requestedSpecies: w(AT.requestedSpecies),
      contest: {
        cool: w(AT.cool), beauty: w(AT.beauty), cute: w(AT.cute),
        smart: w(AT.smart), tough: w(AT.tough),
      },
    })
    ctx.onProgress?.(at + 1, COUNT)
    await breathe(ctx)
    check(ctx)
  }

  return new Map([['data/npcTrades.json', json({ count: trades.length, trades })]])
}
