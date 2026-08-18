// 나무열매 자료 64종 — 브라우저에서 (DATA.md §2.25 · IMPORT.md §6)
//
// `nuts_data.narc`에 열매마다 12바이트가 들어 있다 (`BerryData`) — 크기·단단함·
// 수확량·자라는 시간·마르는 속도, 그리고 맛 다섯과 매끄러움.
//
// 도구 번호와의 관계는 뺄셈 하나다: `BerryData_LoadDataByItemID`가
// `itemID - FIRST_BERRY_IDX`로 찾는다.
//
// ⚠️ **노드 쪽(`tools/extract/berries.js`)과 바이트로 같아야 한다.**
// `convert.test.ts`가 두 산출물을 통째로 맞댄다
import { narcEntry } from './nds'
import {
  breathe, check, json, readRomFile, type ConvertContext, type Produced,
} from './convertTypes'

const NARC = '/itemtool/itemdata/nuts_data.narc'

/** `FIRST_BERRY_IDX` = `ITEM_CHERI_BERRY` — 도구표 149번이다 */
const FIRST_BERRY_ITEM = 149

/** `BerryData` 하나 */
const ENTRY_SIZE = 12

/**
 * 단단함 다섯 (`FIRMNESS_*`).
 *
 * ⚠️ **1부터 센다.** 0은 값이 아니다 — 표를 0부터로 읽으면 마지막 갈래가
 * 범위를 벗어난다. 이름은 `berry_tags` 뱅크 11~15줄이 준다
 */
const FIRMNESS_MIN = 1
const FIRMNESS_MAX = 5

export interface BerryRow {
  size: number
  firmness: number
  baseYield: number
  stageDuration: number
  moistureDrain: number
  spicy: number
  dry: number
  sweet: number
  bitter: number
  sour: number
  smoothness: number
}

/** 칸 차례는 노드 쪽과 같다 — 키 순서가 곧 바이트라 바꾸면 parity가 깨진다 */
export function parseBerry(b: Uint8Array): BerryRow {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  return {
    size: view.getUint16(0, true),
    firmness: b[2]!,
    baseYield: b[3]!,
    stageDuration: b[4]!,
    moistureDrain: b[5]!,
    // 맛 다섯 — 포핀과 콘테스트가 이 값을 본다 (PARITY §7.1)
    spicy: b[6]!,
    dry: b[7]!,
    sweet: b[8]!,
    bitter: b[9]!,
    sour: b[10]!,
    smoothness: b[11]!,
  }
}

export async function convertBerries(ctx: ConvertContext): Promise<Produced> {
  const narc = await readRomFile(ctx, NARC)

  const berries: BerryRow[] = []
  for (let at = 0; ; at++) {
    const buf = narcEntry(narc, at)
    if (!buf) break
    if (buf.length < ENTRY_SIZE) {
      throw new Error(`${NARC} ${String(at)}번이 ${String(buf.length)}바이트다 — ${String(ENTRY_SIZE)}이어야 한다`)
    }
    berries.push(parseBerry(buf))
    ctx.onProgress?.(at + 1, berries.length + 1)
    await breathe(ctx)
  }
  if (!berries.length) throw new Error('나무열매 표가 비었다')

  for (const b of berries) {
    if (b.firmness < FIRMNESS_MIN || b.firmness > FIRMNESS_MAX) {
      throw new Error(`단단함 ${String(b.firmness)}은 표 밖이다`)
    }
  }
  check(ctx)
  ctx.onProgress?.(berries.length, berries.length)

  return new Map([['data/berries.json', json({
    count: berries.length, firstItem: FIRST_BERRY_ITEM, berries,
  })]])
}
